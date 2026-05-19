"""Claude Chat - 真正的 SSE 流式聊天接口（直接调用代理API）"""

import json
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import get_current_user

router = APIRouter(prefix="/api/chat", tags=["AI聊天"])

# DeepSeek 翻译代理地址
PROXY_URL = "http://127.0.0.1:4000/v1/messages"
MODEL = "claude-sonnet-4-20250514"  # → deepseek-chat via proxy
MAX_TOKENS = 4096


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user=Depends(get_current_user),
):
    """SSE 流式聊天接口 — 直接代理HTTP流式，真正的逐字输出"""

    async def event_stream():
        start_time = time.time()

        # 构建 Anthropic Messages API 请求体
        messages = []
        if req.history:
            for msg in req.history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                })
        # 添加当前用户消息
        messages.append({"role": "user", "content": req.message})

        body = {
            "model": MODEL,
            "messages": messages,
            "stream": True,
            "max_tokens": MAX_TOKENS,
        }

        # 发送开始事件
        yield f"data: {json.dumps({'type': 'start'})}\n\n"

        collected_text = ""
        token_count = 0
        error_occurred = False

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                async with client.stream("POST", PROXY_URL, json=body) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        yield f"data: {json.dumps({
                            'type': 'error',
                            'message': f'代理返回错误 ({resp.status_code}): {error_body.decode()}',
                        })}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        current_elapsed = time.time() - start_time
                        if current_elapsed > 115:
                            yield f"data: {json.dumps({
                                'type': 'error',
                                'message': '请求超时（120秒），请简化问题或重试',
                            })}\n\n"
                            error_occurred = True
                            return

                        raw = line.strip()
                        if not raw:
                            continue

                        # 代理可能返回 data: 前缀或裸 JSON
                        if raw.startswith("data: "):
                            raw = raw[6:].strip()
                            if not raw:
                                continue

                        try:
                            event = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = event.get("type", "")

                        # ---- 文本增量块 ----
                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    collected_text += text
                                    token_count += 1
                                    yield f"data: {json.dumps({
                                        'type': 'text',
                                        'content': text,
                                    })}\n\n"

                        # ---- message_start（含完整信息） ----
                        elif event_type == "message_start":
                            msg_data = event.get("message", {})
                            # 可能包含初始文本
                            content_blocks = msg_data.get("content", [])
                            for block in content_blocks:
                                if block.get("type") == "text":
                                    text = block.get("text", "")
                                    if text:
                                        chunk = text[len(collected_text):]
                                        if chunk:
                                            collected_text = text
                                            yield f"data: {json.dumps({
                                                'type': 'text',
                                                'content': chunk,
                                            })}\n\n"

                        # ---- message_delta（含用量信息） ----
                        elif event_type == "message_delta":
                            usage = event.get("usage", {})
                            elapsed = time.time() - start_time
                            yield f"data: {json.dumps({
                                'type': 'done',
                                'content': collected_text,
                                'tokens_output': usage.get('output_tokens', 0),
                                'duration_ms': int(elapsed * 1000),
                            })}\n\n"

                        # ---- message_stop ----
                        elif event_type == "message_stop":
                            return

        except httpx.ConnectError:
            yield f"data: {json.dumps({
                'type': 'error',
                'message': '无法连接到 AI 代理（127.0.0.1:4000），请确认代理服务是否运行',
            })}\n\n"
            error_occurred = True
        except httpx.TimeoutException:
            yield f"data: {json.dumps({
                'type': 'error',
                'message': 'AI 代理响应超时，请稍后重试',
            })}\n\n"
            error_occurred = True
        except Exception as e:
            yield f"data: {json.dumps({
                'type': 'error',
                'message': f'服务器内部错误: {str(e)}',
            })}\n\n"
            error_occurred = True

        # 流结束但没有收到 done（异常退出）
        if not error_occurred:
            elapsed = time.time() - start_time
            yield f"data: {json.dumps({
                'type': 'done',
                'content': collected_text,
                'tokens_output': 0,
                'duration_ms': int(elapsed * 1000),
            })}\n\n"

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
