"""Claude Chat - SSE 流式聊天接口（Claude Code Agent 后端）"""

import asyncio
import io
import json
import os
import re
import shutil
import subprocess
import time
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from pathlib import Path
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.chat_history import save_chat_message, load_chat_history, save_conversation

router = APIRouter(prefix="/api/chat", tags=["AI聊天"])

CLAUDE_ENV = {
    **os.environ,
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
    "ANTHROPIC_API_KEY": open("/root/.deepseek_key").read().strip(),
}
CLAUDE_BIN = "/usr/bin/claude"
WORK_DIR = "/root/TokenManager"  # Claude Code 工作目录


# --- Helper: 从 tool_result content 提取纯文本 ---
def _extract_text(content) -> str:
    """统一提取 content 字段中的文本（可能是字符串或 list[block]）"""
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict):
                if b.get("type") == "text":
                    parts.append(b.get("text", ""))
                elif b.get("type") == "tool_result":
                    parts.append(_extract_text(b.get("content", "")))
        return "\n".join(parts)
    return str(content or "")


def _get_changed_files() -> list[dict]:
    """获取工作目录中当前变更的文件列表"""
    try:
        # 已暂存的变更
        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True, text=True, timeout=10, cwd=WORK_DIR,
        )
        # 未暂存的变更（包括新增未跟踪文件）
        unstaged = subprocess.run(
            ["git", "diff", "--name-only"],
            capture_output=True, text=True, timeout=10, cwd=WORK_DIR,
        )
        # 新增的未跟踪文件
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            capture_output=True, text=True, timeout=10, cwd=WORK_DIR,
        )
        files = set()
        for out in [staged.stdout, unstaged.stdout, untracked.stdout]:
            for f in out.strip().split("\n"):
                f = f.strip()
                if f and not f.startswith("."):
                    files.add(f)
        return sorted(files)
    except Exception:
        return []


class FileInfo(BaseModel):
    file_id: str = ""
    name: str = ""
    type: str = ""
    size: int = 0


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None
    files: list[FileInfo] | None = None


class SaveHistoryRequest(BaseModel):
    messages: list[dict]
    """[{role: 'user'|'assistant', content: '...'}, ...]"""


class DownloadRequest(BaseModel):
    files: list[str]
    """要下载的文件路径列表"""


def build_prompt(message: str, history: list[dict] | None, files: list[FileInfo] | None = None) -> str:
    parts = []
    # 如果有上传的文件，在前面附上文件内容
    if files:
        parts.append("<上传的文件>")
        for f in files:
            # 从 uploads 目录读取文件内容
            fpath = f"/root/uploads/{f.name}"
            if os.path.isfile(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read(5000)  # 限制读取前5000字符
                    parts.append(f"--- {f.name} ({f.type}) ---\n{content}\n---")
                except Exception:
                    parts.append(f"--- {f.name} ---\n(无法读取文件内容)")
        parts.append("</上传的文件>")
    if history:
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


def _split_stream_chunks(text: str) -> list[str]:
    """把一段文本拆成3-5字的小块用于流式推送"""
    pieces = []
    for sentence in re.split(r'(?<=[。！？.!?\n])', text):
        if not sentence:
            continue
        if len(sentence) > 10:
            step = max(1, min(5, len(sentence) // 3))
            for i in range(0, len(sentence), step):
                sub = sentence[i:i + step]
                if sub:
                    pieces.append(sub)
        else:
            pieces.append(sentence)
    return pieces


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user=Depends(get_current_user),
):
    async def event_stream():
        start_time = time.time()
        prompt = build_prompt(req.message, req.history, req.files)
        yield f"data: {json.dumps({'type': 'start'})}\n\n"

        collected_text = ""
        current_tool_use = {"name": "", "command": ""}
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
                cwd=WORK_DIR,
            )

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

                # ========== assistant ==========
                if et == "assistant":
                    for block in data.get("message", {}).get("content", []):
                        bt = block.get("type")
                        if bt == "text":
                            text = block["text"]
                            new_text = text[len(collected_text):]
                            if new_text:
                                collected_text = text
                                for piece in _split_stream_chunks(new_text):
                                    yield f"data: {json.dumps({'type': 'text', 'content': piece})}\n\n"
                                    await asyncio.sleep(0.015)
                        elif bt == "tool_use":
                            name = block.get("name", "")
                            inp = block.get("input", {})
                            command = inp.get("command", "") if isinstance(inp, dict) else str(inp)
                            current_tool_use = {"name": name, "command": command}
                            inp_preview = json.dumps(inp, ensure_ascii=False)[:300]
                            yield f"data: {json.dumps({'type': 'tool_use', 'name': name, 'input': inp, 'input_preview': inp_preview})}\n\n"

                # ========== tool_use（独立事件） ==========
                elif et == "tool_use":
                    tu = data.get("tool_use", {})
                    name = tu.get("name", "")
                    inp = tu.get("input", {})
                    command = inp.get("command", "") if isinstance(inp, dict) else str(inp)
                    current_tool_use = {"name": name, "command": command}
                    inp_preview = json.dumps(inp, ensure_ascii=False)[:300]
                    yield f"data: {json.dumps({'type': 'tool_use', 'name': name, 'input': inp, 'input_preview': inp_preview})}\n\n"

                # ========== user（包含 tool_result） ==========
                elif et == "user":
                    for block in data.get("message", {}).get("content", []):
                        if block.get("type") == "tool_result":
                            is_error = block.get("is_error", False)
                            content = _extract_text(block.get("content", ""))
                            content_lines = content.split("\n")
                            if len(content_lines) > 50:
                                content = "\n".join(content_lines[:50]) + f"\n... (truncated, {len(content_lines)} total lines)"
                            elif len(content) > 5000:
                                content = content[:5000] + f"\n... (truncated, {len(content)} chars)"
                            tool_use_id = block.get("tool_use_id", "")[:16]
                            yield f"data: {json.dumps({
                                'type': 'tool_result',
                                'tool_name': current_tool_use['name'],
                                'command': current_tool_use['command'],
                                'is_error': is_error,
                                'content': content,
                                'tool_use_id': tool_use_id,
                            })}\n\n"
                            await asyncio.sleep(0.005)

                # ========== tool_result（独立事件） ==========
                elif et == "tool_result":
                    content = _extract_text(data.get("content", ""))
                    is_error = data.get("is_error", False)
                    if content:
                        content_lines = content.split("\n")
                        if len(content_lines) > 50:
                            content = "\n".join(content_lines[:50]) + f"\n... (truncated, {len(content_lines)} total lines)"
                        elif len(content) > 5000:
                            content = content[:5000] + f"\n... (truncated, {len(content)} chars)"
                        yield f"data: {json.dumps({
                            'type': 'tool_result',
                            'tool_name': current_tool_use['name'],
                            'command': current_tool_use['command'],
                            'is_error': is_error,
                            'content': content,
                        })}\n\n"
                        await asyncio.sleep(0.005)

                # ========== result（最终结果） ==========
                elif et == "result":
                    content = data.get("result", "") or data.get("content", "")
                    if isinstance(content, list):
                        content = "\n".join(
                            b.get("text", "") for b in content
                            if isinstance(b, dict) and b.get("type") == "text"
                        )
                    if content and content != collected_text:
                        chunk = content[len(collected_text):]
                        if chunk:
                            collected_text = content
                            yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

                    # 获取本次变更的文件列表
                    changed_files = _get_changed_files()

                    elapsed = time.time() - start_time
                    yield f"data: {json.dumps({
                        'type': 'done',
                        'content': collected_text,
                        'changed_files': changed_files,
                        'cost': data.get('total_cost_usd', 0),
                        'tokens_input': data.get('usage', {}).get('input_tokens', 0),
                        'tokens_output': data.get('usage', {}).get('output_tokens', 0),
                        'duration_ms': int(elapsed * 1000),
                    })}\n\n"
                    error_occurred = True
                    return

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
            changed_files = _get_changed_files()
            elapsed = time.time() - start_time
            yield f"data: {json.dumps({'type': 'done', 'content': collected_text, 'changed_files': changed_files, 'cost': 0, 'tokens_input': 0, 'tokens_output': 0, 'duration_ms': int(elapsed * 1000)})}\n\n"

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


@router.post("/download")
async def download_files(req: DownloadRequest, user=Depends(get_current_user)):
    """下载指定文件（打包为 zip）"""
    if not req.files:
        raise HTTPException(400, "请指定要下载的文件")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in req.files:
            # 安全校验：防止路径穿越
            abs_path = os.path.normpath(os.path.join(WORK_DIR, file_path))
            if not abs_path.startswith(os.path.normpath(WORK_DIR)):
                continue
            if not os.path.isfile(abs_path):
                continue
            zf.write(abs_path, file_path)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=claude-output-{int(time.time())}.zip",
        },
    )


@router.post("/upload")
async def chat_upload(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """上传文件给 Claude Code 使用"""
    UPLOAD_DIR = Path("/root/uploads")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    max_size = 500 * 1024 * 1024
    safe_filename = os.path.basename(file.filename or "uploaded_file")
    file_path = UPLOAD_DIR / safe_filename

    import aiofiles
    written = 0
    async with aiofiles.open(str(file_path), "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_size:
                await f.close()
                file_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="文件超过500MB上限")
            await f.write(chunk)

    # 检测文件类型
    ext = os.path.splitext(safe_filename)[1].lower()
    type_map = {
        ".txt": "text", ".py": "code", ".js": "code", ".ts": "code",
        ".jsx": "code", ".tsx": "code", ".vue": "code", ".css": "code",
        ".html": "code", ".json": "code", ".yaml": "code", ".yml": "code",
        ".md": "text", ".csv": "text", ".xml": "code", ".sql": "code",
        ".sh": "code", ".toml": "code", ".ini": "code", ".log": "text",
        ".env": "text", ".pdf": "pdf", ".docx": "docx", ".xlsx": "excel",
        ".go": "code", ".rs": "code", ".java": "code", ".c": "code",
        ".cpp": "code", ".h": "code", ".hpp": "code", ".rb": "code",
        ".php": "code", ".kt": "code", ".gradle": "code", ".proto": "code",
        ".graphql": "code",
    }
    file_type = type_map.get(ext, "other")

    return {
        "file_id": f"chat_{int(time.time())}_{hash(safe_filename) % 100000}",
        "name": safe_filename,
        "type": file_type,
        "size": written,
    }


@router.get("/health")
async def chat_health(user=Depends(get_current_user)):
    """健康检查 — 检测后台是否在线"""
    if not shutil.which(CLAUDE_BIN):
        return JSONResponse({"status": "down", "claude": False, "error": "claude 命令不存在"})
    try:
        result = subprocess.run(
            [CLAUDE_BIN, "--version"],
            capture_output=True, text=True, timeout=10, env=CLAUDE_ENV,
        )
        ok = result.returncode == 0 and "claude" in result.stdout.lower()
        return JSONResponse({
            "status": "ok" if ok else "degraded",
            "claude": ok,
            "version": result.stdout.strip() if ok else None,
            "error": result.stderr[:200] if not ok else None,
        })
    except FileNotFoundError:
        return JSONResponse({"status": "down", "claude": False, "error": "claude 命令不存在"})
    except subprocess.TimeoutExpired:
        return JSONResponse({"status": "down", "claude": False, "error": "claude 响应超时"})
    except Exception as e:
        return JSONResponse({"status": "down", "claude": False, "error": str(e)[:100]})


@router.get("/history")
async def get_history(user=Depends(get_current_user)):
    """获取当前用户的对话历史"""
    messages = load_chat_history(user_id=user.id)
    return {"messages": messages}


@router.post("/history")
async def save_history(req: SaveHistoryRequest, user=Depends(get_current_user)):
    """保存当前用户的对话历史"""
    if not req.messages:
        return {"saved": 0}
    save_conversation(user_id=user.id, messages=req.messages, conversation_id=0)
    return {"saved": len(req.messages)}
