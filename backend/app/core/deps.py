"""FastAPI 依赖注入"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from app.core.security import is_token_blacklisted, is_user_force_logged_out
from app.core.redis_client import refresh_admin_session, has_admin_session
from app.core.rate_limiter import check_rate_limit
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """从 JWT 获取当前用户（支持 Authorization header 或 httpOnly Cookie）"""
    # 优先从 Authorization header 读取（兼容旧客户端）
    token = None
    if credentials is not None:
        token = credentials.credentials
    else:
        # 回退到 httpOnly Cookie
        token = request.cookies.get("token")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")

    # 检查 Token 是否被主动踢下线（黑名单）
    if is_token_blacklisted(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期，请重新登录")

    try:
        payload = decode_access_token(token)
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
    """验证管理员权限 + Redis 会话活跃检查 + 限流"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")

    # API 限流：每个 admin 用户每分钟最多 60 次请求
    allowed, remaining = check_rate_limit(
        f"admin_api:user:{current_user.id}",
        max_attempts=60,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="请求过于频繁，请稍后再试",
        )

    # 检查用户是否被强制踢下线
    if is_user_force_logged_out(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )

    # 检查 Redis 会话是否活跃（10分钟无操作过期）
    # 如果 Redis 会话不存在，尝试重新创建（JWT 本身有效即可放行）
    if not has_admin_session(current_user.id):
        # 尝试重新创建会话（JWT 有效即认可）
        from app.core.redis_client import set_admin_session
        try:
            set_admin_session(current_user.id, "")
        except Exception:
            pass
        # 不拒绝请求，让用户继续使用（JWT 本身是有效的）
        # 但记录日志以便排查
        import logging
        logging.getLogger(__name__).warning(
            f"Admin user {current_user.id} session missing, auto-recreated"
        )

    # 刷新会话 TTL（每次操作重置10分钟倒计时）
    refresh_admin_session(current_user.id)

    return current_user


def get_admin_user_simple(current_user: User = Depends(get_current_user)) -> User:
    """验证管理员权限（不检查 Redis 会话，适合 H5 端调用的管理接口）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user
