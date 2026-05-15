"""
日志服务 - 双写：服务器文件 + PostgreSQL
- 文件日志：/root/TokenManager/logs/operations_YYYY-MM-DD.log
- 数据库日志：user_logs 表
"""
import os
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.user_log import UserLog

# ---------- 文件日志配置 ----------
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# 操作日志文件（每天一个）
op_logger = logging.getLogger("operation")
op_logger.setLevel(logging.INFO)
op_handler = logging.FileHandler(
    os.path.join(LOG_DIR, f"operations_{datetime.now().strftime('%Y%m%d')}.log"),
    encoding="utf-8",
)
op_handler.setFormatter(logging.Formatter(
    "[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
op_logger.addHandler(op_handler)
op_logger.propagate = False  # 不输出到控制台

# 错误日志
err_logger = logging.getLogger("operation_error")
err_logger.setLevel(logging.ERROR)
err_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "error.log"),
    encoding="utf-8",
)
err_handler.setFormatter(logging.Formatter(
    "[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
err_logger.addHandler(err_handler)
err_logger.propagate = False


def write_log(
    action: str,
    user_id: int = 0,
    method: str = "",
    path: str = "",
    request_params: str = "",
    response_status: int = 0,
    response_body: str = "",
    ip_address: str = "",
    user_agent: str = "",
    duration_ms: int = 0,
    detail: str = "",
    level: str = "INFO",
    db: Optional[Session] = None,
):
    """
    写入操作日志（双写：文件 + 数据库）

    1. 先写文件（即使数据库失败也要保留文件日志）
    2. 再写数据库
    """
    now = datetime.now()

    # ====== 1. 写文件日志 ======
    log_line = json.dumps({
        "time": now.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
        "level": level,
        "user_id": user_id,
        "action": action,
        "method": method,
        "path": path,
        "params": truncate_str(request_params, 200),
        "status": response_status,
        "ip": ip_address,
        "duration_ms": duration_ms,
        "detail": detail,
    }, ensure_ascii=False)

    if level == "ERROR":
        err_logger.error(log_line)
    else:
        op_logger.info(log_line)

    # ====== 2. 写数据库 ======
    try:
        own_session = False
        if db is None:
            db = SessionLocal()
            own_session = True

        log_entry = UserLog(
            user_id=user_id,
            action=action,
            method=method,
            path=truncate_str(path, 500),
            request_params=truncate_str(request_params, 1000),
            response_status=response_status,
            response_body=truncate_str(response_body, 500),
            ip_address=ip_address,
            user_agent=truncate_str(user_agent, 200),
            duration_ms=duration_ms,
            detail=truncate_str(detail, 1000),
        )
        db.add(log_entry)
        db.commit()

        if own_session:
            db.close()
    except Exception as e:
        # 数据库写入失败不影响文件日志
        op_logger.error(json.dumps({
            "time": now.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            "level": "ERROR",
            "action": "db_write_failed",
            "detail": f"写入数据库日志失败: {str(e)}",
        }, ensure_ascii=False))


def truncate_str(s: str, max_len: int = 500) -> str:
    """截断字符串"""
    if not s:
        return ""
    return s[:max_len] + "..." if len(s) > max_len else s
