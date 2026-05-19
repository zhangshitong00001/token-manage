"""Claude Chat - SSE 流式聊天接口"""
import asyncio
import json
import os
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import get_current_user

router = APIRouter(prefix="/api/chat", tags=["AI聊天"])

# Claude 环境变量
CLAUDE_ENV = {
    **os.environ,
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
    "ANTHROPIC_API_KEY": open("/root/.deepseek_key").read().strip(),
}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None  # [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]


def build_prompt(message: str, history: list[dict] | None) -> str:
    """构建带上下文的 prompt"""
    if not history:
        return message
    parts = []
    for msg in history:
        role = "User" if msg["role"] == "user" else "Assistant"
        parts.append(f"{role}: {msg['content']}")
    parts.append(f"User: {message}")
    return "\n\n".join(parts)


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user=Depends(get_current_user),
):
    """SSE 流式聊天接口"""
    prompt = build_prompt(req.message, req.history)

    async def event_stream():
        start_time = time.time()
        proc = await asyncio.create_subprocess_exec(
            "claude",
            "--bare",
            "-p", prompt,
            "--output-format", "stream-json",
            "--verbose",
            "--max-turns", "1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=CLAUDE_ENV,
            cwd="/root",
        )

        # 发送开始事件
        yield f"data: {json.dumps({'type': 'start'})}\n\n"

        collected_text = ""
        async for line in proc.stdout:
            line = line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = data.get("type", "")

            if event_type == "assistant":
                content = data.get("message", {}).get("content", [])
                for block in content:
                    if block.get("type") == "text":
                        text = block["text"]
                        # 流式发送文本块
                        chunk = text[len(collected_text):]
                        if chunk:
                            collected_text = text
                            yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                    elif block.get("type") == "tool_use":
                        yield f"data: {json.dumps({
                            'type': 'tool_use',
                            'name': block.get('name', ''),
                            'input': block.get('input', {}),
                        })}\n\n"

            elif event_type == "result":
                yield f"data: {json.dumps({
                    'type': 'done',
                    'content': collected_text,
                    'cost': data.get('total_cost_usd', 0),
                    'tokens_input': data.get('usage', {}).get('input_tokens', 0),
                    'tokens_output': data.get('usage', {}).get('output_tokens', 0),
                    'duration_ms': data.get('duration_ms', 0),
                })}\n\n"

        # 确保关闭进程
        await proc.wait()

        # 超时或出错
        elapsed = time.time() - start_time
        if elapsed > 55:  # 接近 60 秒超时
            yield f"data: {json.dumps({
                'type': 'error',
                'message': '请求超时（60秒），请简化问题或重试',
            })}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
