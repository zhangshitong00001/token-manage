"""安全工具 - JWT & 密码哈希"""
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.config import settings
from app.core.redis_client import get_redis

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── Token 黑名单（Redis 实现） ──

def blacklist_token(token: str, expires_in: int = 86400):
    """将 token 加入黑名单（过期时间为 token 剩余有效期）"""
    try:
        r = get_redis()
        payload = decode_access_token(token)
        exp = payload.get("exp", 0)
        now = datetime.now(timezone.utc).timestamp()
        ttl = max(int(exp - now), expires_in)
        r.setex(f"token_blacklist:{token[-40:]}", ttl, "1")
    except Exception:
        pass


def is_token_blacklisted(token: str) -> bool:
    """检查 token 是否在黑名单中"""
    try:
        r = get_redis()
        return bool(r.get(f"token_blacklist:{token[-40:]}"))
    except Exception:
        return False


# ── 主动踢下线 ──

def force_logout_user(user_id: int):
    """
    强制用户下线：清除 Redis 会话 + 设置强制下线标记
    用户下次请求会被拒绝，需要重新登录
    """
    try:
        r = get_redis()
        r.delete(f"admin_session:{user_id}")
        r.setex(f"force_logout:{user_id}", 86400, "1")
    except Exception:
        pass


def is_user_force_logged_out(user_id: int) -> bool:
    """检查用户是否被强制踢下线"""
    try:
        r = get_redis()
        return bool(r.get(f"force_logout:{user_id}"))
    except Exception:
        return False


# ── JWT 操作 ──

def create_access_token(data: dict, remember_me: bool = False) -> str:
    to_encode = data.copy()
    if remember_me:
        expire = datetime.now(timezone.utc) + timedelta(days=30)
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
