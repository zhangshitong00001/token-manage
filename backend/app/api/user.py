"""API路由 - 用户"""
import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserProfile, UserBindKey, UserModelPref
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/user", tags=["用户"])


@router.get("/profile", response_model=UserProfile)
def get_profile(current_user: User = Depends(get_current_user)):
    """获取当前用户信息及余额"""
    return UserProfile.model_validate(current_user)


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


@router.get("/hermes-api-key")
def get_hermes_api_key(
    current_user: User = Depends(get_current_user),
):
    """查询 Hermes Agent 当前使用的 DeepSeek API Key（仅管理员）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可查看")

    # 从 Hermes .env 读取 API Key
    env_path = os.path.expanduser("~/.hermes/.env")
    try:
        if not os.path.exists(env_path):
            return {"api_key": "", "source": "not_found"}

        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DEEPSEEK_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
                    # 脱敏显示：sk-xxxx...xxxx
                    masked = key
                    if key.startswith("sk-") and len(key) > 10:
                        masked = key[:5] + "..." + key[-4:]
                    return {"api_key": key, "masked": masked, "source": "hermes_env"}
        return {"api_key": "", "source": "no_key_found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取 Key 失败: {str(e)}")
