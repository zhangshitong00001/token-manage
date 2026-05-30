"""API路由 - 用户"""
import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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
