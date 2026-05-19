"""Claude Chat - SSE 流式聊天接口（Claude Code Agent 后端）"""

import asyncio
import json
import os
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import get_current_user

router = APIRouter(prefix="/api/chat", tags=["AI聊天"])

CLAUDE_ENV = {
    **os.environ,
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
    "ANTHROPIC_API_KEY": open("/root/.deepseek_key").read().strip(),
}
CLAUDE_BIN = "/usr/bin/claude"


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


def build_prompt(message: str, history: list[dict] | None) -> str:
    if not history:
        return message
    parts = []
    for msg in history:
        role = "User" if msg["role"] == "user" else "Assistant"
        parts.append(f"{role}: {msg['content']}")
    parts.append(f"User: {message}")
    return "\n\n".join(parts)


async def _drain_stderr(stderr: asyncio.StreamReader):
    """后台消费 stderr（防止管道阻塞）"""
    while True:
        line = await stderr.readline()
        if not line:
            break


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user=Depends(get_current_user),
):
    async def event_stream():
        start_time = time.time()
        prompt = build_prompt(req.message, req.history)
        yield f"data: {json.dumps({'type': 'start'})}\n\n"

        collected_text = ""
        current_tool_name = ""
        error_occurred = False

        try:
            proc = await asyncio.create_subprocess_exec(
                CLAUDE_BIN,
                "--bare",
                "-p", prompt,
                "--output-format", "stream-json",
                "--verbose",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
                env=CLAUDE_ENV,
                cwd="/root/TokenManager",
            )

            # 后台消费 stderr（防止管道阻塞）
            stderr_task = asyncio.create_task(_drain_stderr(proc.stderr))

            while True:
                elapsed = time.time() - start_time
                if elapsed > 175:
                    proc.kill()
                    stderr_task.cancel()
                    yield f"data: {json.dumps({'type': 'error', 'message': '请求超时（180秒）'})}\n\n"
                    error_occurred = True
                    return

                raw_line = await asyncio.wait_for(proc.stdout.readline(), timeout=60.0)
                if not raw_line:
                    # stdout 关闭，进程结束
                    break

                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                et = data.get("type", "")
                if et == "system":
                    continue

                if et == "assistant":
                    for block in data.get("message", {}).get("content", []):
                        bt = block.get("type")
                        if bt == "text":
                            text = block["text"]
                            new_text = text[len(collected_text):]
                            if new_text:
                                collected_text = text
                                # 拆分成小块模拟流式输出（逐字效果）
                                pieces = []
                                # 先按句子/换行拆分
                                import re as _re
                                for sentence in _re.split(r'(?<=[。！？.!?\n])', new_text):
                                    if not sentence:
                                        continue
                                    # 再拆成3-5字符小块模拟流式
                                    if len(sentence) > 10:
                                        step = max(1, min(5, len(sentence) // 3))
                                        for i in range(0, len(sentence), step):
                                            sub = sentence[i:i+step]
                                            if sub:
                                                pieces.append(sub)
                                    else:
                                        pieces.append(sentence)
                                # 推送小块
                                for piece in pieces:
                                    yield f"data: {json.dumps({'type': 'text', 'content': piece})}\n\n"
                                    await asyncio.sleep(0.015)
                        elif bt == "tool_use":
                            current_tool_name = block.get("name", "")
                            yield f"data: {json.dumps({'type': 'tool_use', 'name': current_tool_name, 'input': block.get('input', {})})}\n\n"

                elif et == "tool_use":
                    tu = data.get("tool_use", {})
                    current_tool_name = tu.get("name", "")
                    yield f"data: {json.dumps({'type': 'tool_use', 'name': current_tool_name, 'input': tu.get('input', {})})}\n\n"

                elif et == "tool_result":
                    content = data.get("content", "")
                    if isinstance(content, list):
                        content = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
                    if content:
                        preview = content[:200]
                        if len(content) > 200:
                            preview += "..."
                        yield f"data: {json.dumps({'type': 'tool_result', 'tool_name': current_tool_name, 'preview': preview})}\n\n"

                elif et == "result":
                    content = data.get("result", "") or data.get("content", "")
                    if isinstance(content, list):
                        content = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
                    if content and content != collected_text:
                        chunk = content[len(collected_text):]
                        if chunk:
                            collected_text = content
                            yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

                    elapsed = time.time() - start_time
                    yield f"data: {json.dumps({
                        'type': 'done',
                        'content': collected_text,
                        'cost': data.get('total_cost_usd', 0),
                        'tokens_input': data.get('usage', {}).get('input_tokens', 0),
                        'tokens_output': data.get('usage', {}).get('output_tokens', 0),
                        'duration_ms': int(elapsed * 1000),
                    })}\n\n"
                    error_occurred = True  # 防止再发一次 done
                    return  # 结束流

            stderr_task.cancel()
            await proc.wait()

        except asyncio.TimeoutError:
            proc.kill()
            stderr_task.cancel()
            yield f"data: {json.dumps({'type': 'error', 'message': 'Claude 响应超时，请重试'})}\n\n"
            error_occurred = True
        except FileNotFoundError:
            yield f"data: {json.dumps({'type': 'error', 'message': f'找不到 claude 命令（{CLAUDE_BIN}）'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'内部错误: {str(e)}'})}\n\n"
            error_occurred = True

        if not error_occurred and collected_text:
            elapsed = time.time() - start_time
            yield f"data: {json.dumps({'type': 'done', 'content': collected_text, 'cost': 0, 'tokens_input': 0, 'tokens_output': 0, 'duration_ms': int(elapsed * 1000)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
        },
    )
