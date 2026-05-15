"""API路由 - 用户"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserProfile, UserBindKey
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
