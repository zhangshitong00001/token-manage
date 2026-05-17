"""FastAPI 依赖注入"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from app.core.redis_client import refresh_admin_session, has_admin_session
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """从JWT中获取当前用户"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效Token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效Token")
    user = db.query(User).filter(User.id == int(user_id), User.status == 1).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """验证管理员权限 + Redis 会话活跃检查"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")

    # 检查 Redis 会话是否活跃（10分钟无操作过期）
    if not has_admin_session(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )

    # 刷新会话 TTL（每次操作重置10分钟倒计时）
    refresh_admin_session(current_user.id)

    return current_user


def get_admin_user_simple(current_user: User = Depends(get_current_user)) -> User:
    """验证管理员权限（不检查 Redis 会话，适合 H5 端调用的管理接口）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user
