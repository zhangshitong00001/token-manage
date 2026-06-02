"""API路由 - 用户"""
import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User
from app.schemas import UserProfile, UserBindKey, UserModelPref
from app.core.deps import get_current_user, get_admin_user

router = APIRouter(prefix="/api/user", tags=["用户"])


@router.get("/profile", response_model=UserProfile)
def get_profile(current_user: User = Depends(get_current_user)):
    """获取当前用户信息及余额"""
    return UserProfile.model_validate(current_user)


@router.get("/my-usage")
def get_my_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户自己的消耗汇总（今日/本月/余额）"""
    from datetime import date, timedelta, datetime
    from sqlalchemy import func
    from app.models import TokenUsage

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time())

    # 今日消耗
    today_records = db.query(
        func.coalesce(func.sum(TokenUsage.input_tokens), 0),
        func.coalesce(func.sum(TokenUsage.output_tokens), 0),
        func.coalesce(func.sum(TokenUsage.total_cost), 0),
        func.count(TokenUsage.id),
    ).filter(
        TokenUsage.user_id == current_user.id,
        TokenUsage.usage_time >= today_start,
    ).first()

    # 本月消耗
    month_records = db.query(
        func.coalesce(func.sum(TokenUsage.input_tokens), 0),
        func.coalesce(func.sum(TokenUsage.output_tokens), 0),
        func.coalesce(func.sum(TokenUsage.total_cost), 0),
        func.count(TokenUsage.id),
    ).filter(
        TokenUsage.user_id == current_user.id,
        TokenUsage.usage_time >= month_start_dt,
    ).first()

    return {
        "user_id": current_user.id,
        "nickname": current_user.nickname,
        "email": current_user.email,
        "token_balance": current_user.token_balance or 0,
        "today": {
            "input_tokens": int(today_records[0]),
            "output_tokens": int(today_records[1]),
            "total_cost": int(today_records[2]),
            "call_count": int(today_records[3]),
        },
        "month": {
            "input_tokens": int(month_records[0]),
            "output_tokens": int(month_records[1]),
            "total_cost": int(month_records[2]),
            "call_count": int(month_records[3]),
        },
    }


@router.get("/my-usage-list")
def get_my_usage_list(
    page: int = 1,
    page_size: int = 20,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户自己的消耗记录（带分页和日期筛选）"""
    from app.models import TokenUsage

    query = db.query(TokenUsage).filter(TokenUsage.user_id == current_user.id)
    if start_date:
        query = query.filter(TokenUsage.usage_time >= start_date)
    if end_date:
        query = query.filter(TokenUsage.usage_time <= f"{end_date} 23:59:59")
    total = query.count()
    items = query.order_by(TokenUsage.usage_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "agent_name": r.agent_name,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "total_cost": r.total_cost,
                "request_id": r.request_id,
                "usage_time": r.usage_time.isoformat() if r.usage_time else "",
            }
            for r in items
        ],
    }


@router.get("/my-conversations")
def get_my_conversations(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的对话会话列表（每轮对话 + Token 消耗统计）"""
    from app.models import TokenUsage
    from app.models.chat_history import ChatHistory
    from sqlalchemy import func as sa_func, desc
    from sqlalchemy import or_ as sa_or

    from datetime import datetime, timedelta

    # 1. 按 request_id 分组查询 TokenUsage（每个 request_id 是一次对话）
    # request_id 格式: chat_{user_id}_{timestamp} 或 ws_{user_id}_{timestamp}
    prefix_chat = f"chat_{current_user.id}_"
    prefix_ws = f"ws_{current_user.id}_"
    usage_q = db.query(
        TokenUsage.request_id,
        sa_func.sum(TokenUsage.input_tokens).label("total_input"),
        sa_func.sum(TokenUsage.output_tokens).label("total_output"),
        sa_func.sum(TokenUsage.total_cost).label("total_cost"),
        sa_func.min(TokenUsage.usage_time).label("first_time"),
        sa_func.max(TokenUsage.usage_time).label("last_time"),
        sa_func.count(TokenUsage.id).label("call_count"),
    ).filter(
        TokenUsage.user_id == current_user.id,
        sa_or(
            TokenUsage.request_id.like(f"{prefix_chat}%"),
            TokenUsage.request_id.like(f"{prefix_ws}%"),
        ),
    ).group_by(TokenUsage.request_id).order_by(
        desc("last_time")
    )

    total = usage_q.count()
    usage_rows = usage_q.offset((page - 1) * page_size).limit(page_size).all()

    # 2. 为每个会话找到对应的用户消息
    conversations = []
    for r in usage_rows:
        is_workspace = r.request_id.startswith(f"ws_")
        
        # 从 request_id 提取时间戳
        ts_str = r.request_id.replace(prefix_chat, "").replace(prefix_ws, "")
        try:
            req_ts = int(ts_str)
            req_dt = datetime.fromtimestamp(req_ts)
        except ValueError:
            req_dt = r.first_time

        user_msg_preview = ""
        
        if is_workspace:
            # workspace 会话：查找 ChatHistory 中该时间附近的用户消息
            ws_msg = db.query(ChatHistory.content).filter(
                ChatHistory.user_id == current_user.id,
                ChatHistory.role == "user",
                ChatHistory.content.like("%数据处理%"),
                ChatHistory.created_at >= req_dt,
                ChatHistory.created_at <= (req_dt + timedelta(seconds=60)),
            ).order_by(ChatHistory.created_at.asc()).first()
            if ws_msg and ws_msg[0]:
                user_msg_preview = ws_msg[0][:120]
                if len(ws_msg[0]) > 120:
                    user_msg_preview += "..."
            else:
                user_msg_preview = "(数据处理)"
        else:
            # chat 会话：查找该时间附近的第一条用户消息
            user_msg = db.query(ChatHistory.content).filter(
                ChatHistory.user_id == current_user.id,
                ChatHistory.role == "user",
                ChatHistory.created_at >= req_dt,
                ChatHistory.created_at <= (req_dt + timedelta(seconds=30)),
            ).order_by(ChatHistory.created_at.asc()).first()
            if user_msg and user_msg[0]:
                user_msg_preview = user_msg[0][:120]
                if len(user_msg[0]) > 120:
                    user_msg_preview += "..."

        conversations.append({
            "request_id": r.request_id,
            "source": "workspace" if is_workspace else "chat",
            "time": r.last_time.isoformat() if r.last_time else "",
            "input_tokens": int(r.total_input or 0),
            "output_tokens": int(r.total_output or 0),
            "total_cost": int(r.total_cost or 0),
            "call_count": int(r.call_count or 0),
            "user_message": user_msg_preview,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": conversations,
    }


@router.put("/deepseek-key")
def bind_deepseek_key(
    data: UserBindKey,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """绑定/更新 DeepSeek API Key"""
    current_user.deepseek_api_key = data.deepseek_api_key
    db.commit()
    return {"message": "绑定成功"}


@router.put("/model-pref")
def set_model_preference(
    data: UserModelPref,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """设置用户偏好的模型"""
    if data.preferred_model not in ("deepseek-v4-flash", "deepseek-v4-pro"):
        raise HTTPException(status_code=400, detail="不支持的模型")
    current_user.preferred_model = data.preferred_model
    db.commit()
    return {"message": "设置成功", "preferred_model": data.preferred_model}


# ---- Hermes Agent 模型切换（仅管理员）----

AVAILABLE_MODELS = {
    "deepseek-v4-flash": {"provider": "deepseek", "model": "deepseek-v4-flash"},
    "deepseek-v4-pro": {"provider": "deepseek", "model": "deepseek-v4-pro"},
}


@router.post("/hermes-model")
def switch_hermes_model(
    data: UserModelPref,
    current_user: User = Depends(get_current_user),
):
    """切换 Hermes Agent 当前使用的大模型（仅管理员）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    if data.preferred_model not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="不支持的模型")

    cfg = AVAILABLE_MODELS[data.preferred_model]
    model_name = cfg["model"]

    try:
        # 1. 设置 model.default
        r1 = subprocess.run(
            ["hermes", "config", "set", "model.default", model_name],
            capture_output=True, text=True, timeout=10,
        )
        # 2. 设置 model.provider
        r2 = subprocess.run(
            ["hermes", "config", "set", "model.provider", "deepseek"],
            capture_output=True, text=True, timeout=10,
        )
        if r1.returncode != 0 or r2.returncode != 0:
            raise RuntimeError(f"hermes config 失败: {r1.stderr} {r2.stderr}")

        return {
            "message": f"Hermes Agent 已切换到 {model_name}",
            "model": model_name,
            "provider": "deepseek",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切换失败: {str(e)}")


@router.get("/hermes-model")
def get_hermes_model(
    current_user: User = Depends(get_current_user),
):
    """查询 Hermes Agent 当前使用的大模型"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可查看")
    try:
        import yaml
        with open("/root/.hermes/config.yaml") as f:
            cfg = yaml.safe_load(f)
        model = cfg.get("model", {})
        return {
            "model": model.get("default", "unknown"),
            "provider": model.get("provider", "unknown"),
        }
    except Exception as e:
        return {"model": "error", "detail": str(e)}


def _read_hermes_api_key() -> str:
    """从 Hermes .env 读取 DEEPSEEK_API_KEY"""
    env_path = os.path.expanduser("~/.hermes/.env")
    if not os.path.exists(env_path):
        return ""
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


@router.get("/hermes-api-key")
def get_hermes_api_key(
    admin: User = Depends(get_admin_user),
):
    """查询 Hermes Agent 当前使用的 DeepSeek API Key（默认脱敏，仅管理员）"""

    key = _read_hermes_api_key()
    masked = key
    if key.startswith("sk-") and len(key) > 10:
        masked = key[:5] + "..." + key[-4:]

    # 默认只返回脱敏版本，不返回完整 Key
    return {"api_key": masked, "full_available": bool(key)}


@router.post("/hermes-api-key/reveal")
def reveal_hermes_api_key(
    admin: User = Depends(get_admin_user),
):
    """获取完整 API Key（需管理员登录态确认）"""

    key = _read_hermes_api_key()
    if not key:
        raise HTTPException(status_code=404, detail="未找到 API Key")
    return {"api_key": key}
