"""API路由 - 用户"""
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
