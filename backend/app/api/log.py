"""API路由 - 前端操作日志上报"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User
from app.services.log_service import write_log
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/log", tags=["操作日志"])


@router.post("/action")
def report_action(
    request: Request,
    data: dict,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    前端页面操作事件上报
    由H5页面调用，记录用户在页面上的操作

    请求体示例:
    {
        "action": "page_view",       // 操作类型
        "page": "/home",             // 页面路径
        "detail": "用户查看了首页"    // 详细描述
    }
    """
    action = data.get("action", "unknown")
    page = data.get("page", "")
    detail = data.get("detail", "")

    # 获取用户IP
    ip = request.headers.get("x-forwarded-for", "")
    if not ip:
        ip = request.client.host if request.client else "unknown"
    else:
        ip = ip.split(",")[0].strip()

    user_agent = request.headers.get("user-agent", "")

    user_id = current_user.id if current_user else 0

    write_log(
        action=f"FRONTEND:{action}",
        user_id=user_id,
        method="FE",
        path=page,
        request_params="",
        response_status=200,
        ip_address=ip,
        user_agent=user_agent,
        detail=f"[前端] {detail} | action={action} | page={page}",
        level="INFO",
        db=db,
    )

    return {"success": True}
