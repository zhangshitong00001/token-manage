"""数据工作台 - 上传文件 + 自然语言数据处理 + 结果下载"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse

from app.core.deps import get_current_user
from app.core.token_quota import check_balance, deduct_balance
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["数据工作台"])

WORK_DIR = "/root/TokenManager"

# 复用 chat.py 的用户隔离输出目录
from app.api.chat import BASE_OUTPUT_DIR, _user_workspace_output_dir, _scan_user_output_files, _format_size

OUTPUT_DIR = _user_workspace_output_dir(0)  # fallback placeholder, actual user_id injected at runtime

CLAUDE_ENV = {
    **os.environ,
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
    "ANTHROPIC_API_KEY": open("/root/.deepseek_key").read().strip(),
}
CLAUDE_BIN = "/usr/bin/claude"

# 支持的输出格式
SUPPORTED_OUTPUTS = ["csv", "xlsx", "json", "txt", "md"]


def build_workspace_prompt(files: list[dict], description: str, user_id: int = 0) -> str:
    """构造数据处理 prompt，引导 Claude Code 执行数据处理任务"""
    file_list = "\n".join(f"  - {f['name']} ({f.get('type', 'unknown')})" for f in files)
    user_dir = _user_workspace_output_dir(user_id)

    return f"""你是一个专业的数据处理助手。用户上传了以下文件，请按照用户的需求进行处理。

===== 上传的文件 =====
{file_list}

===== 用户需求 =====
{description}

===== 执行要求 =====
1. 先用 Python 读取所有上传文件 (/root/uploads/ 目录下)，理解数据结构和内容
2. 严格按照用户需求处理数据（清洗、转换、合并、计算、分析等）
3. 处理结果保存到 {user_dir} 目录下
4. 输出文件名格式：output_时间戳.扩展名（如 output_1700000000.xlsx）
5. 如果用户没有指定输出格式，默认输出 CSV (用 utf-8-sig 编码，Excel 可打开)
6. 处理完成后，输出一份清晰的摘要，包括：
   - 处理了什么数据
   - 做了哪些操作
   - 结果文件路径
   - 关键数据指标（总行数、汇总金额等）

===== 可用工具 =====
- Python: pandas, numpy, openpyxl, csv, json, re, collections, datetime
- 可执行 shell 命令
- 必要时可安装 pip 包

===== 特别提醒 =====
- 如果需求模糊，做出合理默认选择
- 大文件注意性能，不要全量加载到内存
- 先理解数据结构再处理
- 不要询问用户，直接执行

开始处理吧！
"""


def _extract_text(content) -> str:
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


def _split_chunks(text: str) -> list[str]:
    import re
    pieces = []
    for sentence in re.split(r'(?<=[。！？.!?\n])', text):
        if not sentence:
            continue
        step = max(1, min(8, len(sentence) // 3))
        for i in range(0, len(sentence), step):
            sub = sentence[i:i + step]
            if sub:
                pieces.append(sub)
    return pieces


@router.post("/process")
async def workspace_process(
    files: str = Query(default="[]", description="文件列表 JSON"),
    description: str = Query(..., description="处理需求描述"),
    user: User = Depends(get_current_user),
):
    """上传文件 + 自然语言描述 → AI 处理 → 流式返回处理过程和结果"""
    
    try:
        file_list = json.loads(files) if files else []
    except json.JSONDecodeError:
        file_list = []

    if not description.strip():
        raise HTTPException(400, "请描述你的数据处理需求")

    async def event_stream():
        start_time = time.time()
        prompt = build_workspace_prompt(file_list, description, user_id=user.id)
        user_output_dir = _user_workspace_output_dir(user.id)

        # ── 余额检查 ──
        from app.database import SessionLocal
        check_db = SessionLocal()
        try:
            sufficient, balance = check_balance(user.id, check_db, min_tokens=1)
            if not sufficient:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Token 余额不足（当前余额: {balance}），请先充值'})}\n\n"
                return
        finally:
            check_db.close()

        yield f"data: {json.dumps({'type': 'start', 'message': 'AI 数据处理引擎已启动...'})}\n\n"

        collected_text = ""
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

            async def drain_stderr(stderr):
                while True:
                    line = await stderr.readline()
                    if not line:
                        break

            stderr_task = asyncio.create_task(drain_stderr(proc.stderr))

            while True:
                elapsed = time.time() - start_time
                if elapsed > 290:
                    proc.kill()
                    stderr_task.cancel()
                    yield f"data: {json.dumps({'type': 'error', 'message': '处理超时（5分钟）'})}\n\n"
                    error_occurred = True
                    return

                raw_line = await asyncio.wait_for(proc.stdout.readline(), timeout=120.0)
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

                if et == "assistant":
                    for block in data.get("message", {}).get("content", []):
                        bt = block.get("type")
                        if bt == "text":
                            text = block["text"]
                            new_text = text[len(collected_text):]
                            if new_text:
                                collected_text = text
                                for piece in _split_chunks(new_text):
                                    yield f"data: {json.dumps({'type': 'text', 'content': piece})}\n\n"
                                    await asyncio.sleep(0.01)
                        elif bt == "tool_use":
                            tool_name = block.get("name", "")
                            tool_input = block.get("input", {})
                            cmd = tool_input.get("command", "") if isinstance(tool_input, dict) else str(tool_input)
                            yield f"data: {json.dumps({'type': 'tool', 'name': tool_name, 'command': cmd[:100]})}\n\n"

                elif et == "tool_result":
                    content = _extract_text(data.get("content", ""))
                    if content:
                        for piece in _split_chunks(content[:500]):
                            yield f"data: {json.dumps({'type': 'result', 'content': piece})}\n\n"

            stderr_task.cancel()

        except asyncio.TimeoutError:
            error_occurred = True
            yield f"data: {json.dumps({'type': 'error', 'message': '处理超时'})}\n\n"
        except Exception as e:
            error_occurred = True
            yield f"data: {json.dumps({'type': 'error', 'message': f'处理出错: {str(e)}'})}\n\n"

        # 处理完成后查找输出文件
        output_files = []
        if user_output_dir.exists():
            for f in sorted(user_output_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
                if f.is_file() and f.stat().st_mtime > start_time:
                    output_files.append(f.name)

        yield f"data: {json.dumps({'type': 'done', 'content': collected_text, 'output_files': output_files, 'duration_ms': int((time.time() - start_time) * 1000)})}\n\n"

        # ── 扣减 Token 余额（按字数估算）──
        if collected_text:
            # 粗略估算：输入 prompt 和输出文本的 token 数
            est_input = len(prompt) // 3
            est_output = len(collected_text) // 3
            deduct_db = SessionLocal()
            try:
                result = deduct_balance(
                    user_id=user.id,
                    input_tokens=est_input,
                    output_tokens=est_output,
                    db=deduct_db,
                    agent_name="workspace",
                    request_id=f"ws_{user.id}_{int(start_time)}",
                )
            except Exception as deduct_err:
                logger.error(f"[Quota] Workspace 扣减失败: {deduct_err}")
            finally:
                deduct_db.close()

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


@router.get("/output")
async def list_outputs(user=Depends(get_current_user)):
    """列出当前用户输出目录中的文件"""
    user_dir = _user_workspace_output_dir(user.id)
    files = _scan_user_output_files(user_dir)
    return {"files": files}


@router.get("/download/{filename}")
async def download_output(filename: str, user=Depends(get_current_user)):
    """下载处理结果文件（用户隔离）"""
    safe = os.path.basename(filename)
    user_dir = _user_workspace_output_dir(user.id)
    file_path = user_dir / safe
    if not file_path.exists():
        raise HTTPException(404, "文件不存在或已过期")
    return FileResponse(
        str(file_path),
        filename=safe,
        media_type="application/octet-stream",
    )
