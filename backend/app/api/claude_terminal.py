"""Claude Code 终端 WebSocket + 会话管理 API

提供：
1. WebSocket 实时终端交互（PTY 模式）
2. 会话 CRUD（启动、停止、列表、详情）
3. 参数配置（模式、模型、effort、max-turns）
"""

import asyncio
import json
import os
import pty
import select
import signal
import struct
import termios
import time
import fcntl
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user

router = APIRouter(prefix="/api/claude-terminal", tags=["Claude Code 终端"])

# ── 配置 ──
CLAUDE_BIN = "/usr/bin/claude"
WORK_DIR = "/root/TokenManager"
CLAUDE_ENV = {
    **os.environ,
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
    "ANTHROPIC_API_KEY": open("/root/.deepseek_key").read().strip(),
}

# ── 会话存储（内存） ──
# session_id -> ClaudeTerminalSession
_sessions: dict[str, "ClaudeTerminalSession"] = {}


# ── 数据模型 ──
class SessionConfig(BaseModel):
    mode: str = "auto"          # auto | normal | plan | acceptEdits
    model: str = "sonnet"       # sonnet | opus | haiku
    effort: str = "medium"       # low | medium | high | max | auto
    max_turns: int = 30
    skip_permissions: bool = True
    project_dir: str = WORK_DIR


class SessionInfo(BaseModel):
    session_id: str
    status: str                   # running | stopped | waiting_input
    started_at: float
    config: dict
    mode: str


# ── PTY 会话管理器 ──
class ClaudeTerminalSession:
    """管理一个 claude 子进程的 PTY 会话"""

    def __init__(self, session_id: str, config: SessionConfig):
        self.session_id = session_id
        self.config = config
        self.status = "stopped"
        self.started_at = 0
        self.process = None
        self.master_fd = None
        self._read_task = None
        self._ws_clients: list[WebSocket] = []
        self._buffer = b""

    @property
    def info(self) -> dict:
        return {
            "session_id": self.session_id,
            "status": self.status,
            "started_at": self.started_at,
            "config": self.config.model_dump(),
            "mode": self.config.mode,
        }

    def build_command(self) -> list[str]:
        cmd = [CLAUDE_BIN]
        
        # root 用户不能使用 --dangerously-skip-permissions
        is_root = os.geteuid() == 0
        
        if self.config.skip_permissions and not is_root:
            cmd.append("--dangerously-skip-permissions")
        
        # ── 模式处理 ──
        # Claude Code 的 plan 模式用 --permission-mode plan
        # 而用户界面上定义的 "normal" 对应默认模式
        permission_mode = None
        if self.config.mode == "auto":
            permission_mode = "auto"
        elif self.config.mode == "plan":
            permission_mode = "plan"
        elif self.config.mode == "acceptEdits":
            permission_mode = "acceptEdits"
        # "normal" → 不加 permission-mode，保持默认
        
        # root 下 auto 模式自动降级为 acceptEdits（如果 skip_permissions 未开就会弹确认，root 不可用 --dangerously-skip-permissions）
        if is_root and self.config.skip_permissions and self.config.mode == "auto":
            permission_mode = "acceptEdits"
        
        if permission_mode:
            cmd += ["--permission-mode", permission_mode]

        cmd += ["--model", self.config.model]
        cmd += ["--effort", self.config.effort]

        # 日志
        print(f"[CLAUDE_AGENT] CMD: {' '.join(cmd)}")
        print(f"[CLAUDE_AGENT] Config dump: {self.config.model_dump()}")

        return cmd

    async def start(self, initial_prompt: str = ""):
        """启动 claude 子进程，连接 PTY"""
        if self.process:
            return {"error": "会话已在运行中"}

        self.started_at = time.time()
        self.status = "running"

        # 创建伪终端
        self.master_fd, slave_fd = pty.openpty()

        # 设置 PTY 为非阻塞
        fl = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
        fcntl.fcntl(self.master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

        # 设置终端大小 (80x24)
        self._set_pty_size(80, 24)

        cmd = self.build_command()

        # 如果是 print 模式，加上 prompt
        actual_cmd = cmd.copy()
        if initial_prompt:
            actual_cmd.append("-p")
            actual_cmd.append(initial_prompt)

        self.process = await asyncio.create_subprocess_exec(
            *actual_cmd,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            env=CLAUDE_ENV,
            cwd=self.config.project_dir,
            preexec_fn=os.setsid,
        )

        # 关闭从端（主端保留用于读写）
        os.close(slave_fd)

        # 启动后台读取任务
        self._read_task = asyncio.create_task(self._read_pty_loop())

        return {"status": "started", "session_id": self.session_id}

    def _set_pty_size(self, cols: int, rows: int):
        """设置 PTY 终端大小"""
        if self.master_fd is None:
            return
        buf = struct.pack('HHHH', rows, cols, 0, 0)
        fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, buf)

    def resize(self, cols: int, rows: int):
        """调整终端大小"""
        self._set_pty_size(cols, rows)

    async def _read_pty_loop(self):
        """后台循环读取 PTY 输出并推送给所有 WebSocket 客户端"""
        loop = asyncio.get_event_loop()
        try:
            while self.process and self.process.returncode is None:
                # 非阻塞读取
                try:
                    data = await loop.run_in_executor(
                        None, self._read_pty, 0.05
                    )
                    if data:
                        self._buffer += data
                        # 推送给所有 WS 客户端
                        msg = json.dumps({
                            "type": "output",
                            "data": data.decode("utf-8", errors="replace"),
                        })
                        for ws in list(self._ws_clients):
                            try:
                                await ws.send_text(msg)
                            except Exception:
                                self._ws_clients.remove(ws)
                    else:
                        await asyncio.sleep(0.02)
                except BlockingIOError:
                    await asyncio.sleep(0.02)

            # 进程已结束，读取剩余输出
            while True:
                try:
                    data = os.read(self.master_fd, 4096)
                    if not data:
                        break
                    msg = json.dumps({
                        "type": "output",
                        "data": data.decode("utf-8", errors="replace"),
                    })
                    for ws in list(self._ws_clients):
                        try:
                            await ws.send_text(msg)
                        except Exception:
                            self._ws_clients.remove(ws)
                except (BlockingIOError, OSError):
                    break

        except asyncio.CancelledError:
            pass
        finally:
            self.status = "stopped"
            # 通知所有客户端
            for ws in list(self._ws_clients):
                try:
                    await ws.send_text(json.dumps({
                        "type": "status",
                        "state": "stopped",
                    }))
                except Exception:
                    self._ws_clients.remove(ws)

    def _read_pty(self, timeout=0.05):
        """读取 PTY 输出（同步，在 executor 中运行）"""
        import time as _time
        start = _time.time()
        while _time.time() - start < timeout:
            try:
                r, _, _ = select.select([self.master_fd], [], [], 0.01)
                if r:
                    data = os.read(self.master_fd, 4096)
                    return data
            except (OSError, ValueError):
                break
        return b""

    def write_input(self, text: str):
        """向 PTY 写入输入"""
        if self.master_fd is not None:
            os.write(self.master_fd, text.encode("utf-8"))

    def send_signal(self, sig: str):
        """发送信号到进程组"""
        if self.process and self.process.pid:
            try:
                if sig == "ctrl_c":
                    os.killpg(os.getpgid(self.process.pid), signal.SIGINT)
                elif sig == "ctrl_d":
                    self.write_input("\x04")
                elif sig == "kill":
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                    self.status = "stopped"
            except ProcessLookupError:
                pass

    async def stop(self):
        """停止会话"""
        if self._read_task:
            self._read_task.cancel()
            self._read_task = None
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None
        if self.process:
            try:
                self.process.kill()
                await self.process.wait()
            except ProcessLookupError:
                pass
            self.process = None
        self.status = "stopped"

    def add_ws_client(self, ws: WebSocket):
        self._ws_clients.append(ws)

    def remove_ws_client(self, ws: WebSocket):
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)


# ── REST API ──

@router.post("/session/start")
async def start_session(
    config: SessionConfig,
    initial_prompt: str = "",
    user=Depends(get_current_user),
):
    """启动一个新的 Claude Code 会话"""
    session_id = f"claude-{uuid.uuid4().hex[:12]}"
    session = ClaudeTerminalSession(session_id, config)
    _sessions[session_id] = session
    result = await session.start(initial_prompt)
    return {"session_id": session_id, **result}


@router.post("/session/{session_id}/stop")
async def stop_session(session_id: str, user=Depends(get_current_user)):
    """停止一个会话"""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    await session.stop()
    return {"status": "stopped"}


@router.get("/sessions")
async def list_sessions(user=Depends(get_current_user)):
    """列出所有会话"""
    return {
        "sessions": [
            s.info for s in _sessions.values()
        ]
    }


@router.get("/session/{session_id}")
async def get_session(session_id: str, user=Depends(get_current_user)):
    """获取会话详情"""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.info


@router.post("/session/{session_id}/write")
async def write_to_session(session_id: str, data: dict, user=Depends(get_current_user)):
    """向会话写入输入"""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    text = data.get("text", "")
    session.write_input(text)
    return {"status": "ok"}


@router.post("/session/{session_id}/signal")
async def signal_session(session_id: str, data: dict, user=Depends(get_current_user)):
    """发送信号到会话"""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    session.send_signal(data.get("signal", "ctrl_c"))
    return {"status": "ok"}


@router.get("/config/default")
async def get_default_config(user=Depends(get_current_user)):
    """获取默认配置"""
    return SessionConfig().model_dump()


# ── WebSocket 终端 ──

@router.websocket("/ws/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    """WebSocket 实时终端连接"""
    await websocket.accept()

    session = _sessions.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "会话不存在"})
        await websocket.close()
        return

    session.add_ws_client(websocket)

    # 发送已缓冲的输出
    if session._buffer:
        await websocket.send_json({
            "type": "output",
            "data": session._buffer.decode("utf-8", errors="replace"),
        })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "input":
                text = msg.get("data", "")
                session.write_input(text)

            elif msg_type == "resize":
                cols = msg.get("cols", 80)
                rows = msg.get("rows", 24)
                session.resize(cols, rows)

            elif msg_type == "signal":
                session.send_signal(msg.get("signal", "ctrl_c"))

    except WebSocketDisconnect:
        pass
    finally:
        session.remove_ws_client(websocket)
