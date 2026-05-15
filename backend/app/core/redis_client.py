"""Redis 客户端工具"""
import random
import redis
from app.config import settings

# 同步 Redis（用于 FastAPI 同步路由）
_sync_client = None


def get_redis():
    global _sync_client
    if _sync_client is None:
        pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
        _sync_client = redis.Redis(connection_pool=pool)
    return _sync_client


def generate_code(length=6):
    """生成纯数字验证码"""
    return ''.join(str(random.randint(0, 9)) for _ in range(length))


# ---- 验证码 ----
SMS_CODE_TTL = 300  # 5分钟
SMS_CODE_PREFIX = "sms_code:"


def save_sms_code(phone: str, code: str):
    r = get_redis()
    r.setex(f"{SMS_CODE_PREFIX}{phone}", SMS_CODE_TTL, code)


def verify_sms_code(phone: str, code: str) -> bool:
    r = get_redis()
    key = f"{SMS_CODE_PREFIX}{phone}"
    stored = r.get(key)
    if stored and stored == code:
        r.delete(key)  # 一次性使用
        return True
    return False


# ---- 管理员会话 ----
ADMIN_SESSION_TTL = 600  # 10分钟无操作过期
ADMIN_SESSION_PREFIX = "admin_session:"


def set_admin_session(user_id: int, token: str):
    """创建管理员会话"""
    r = get_redis()
    key = f"{ADMIN_SESSION_PREFIX}{user_id}"
    r.setex(key, ADMIN_SESSION_TTL, token)


def refresh_admin_session(user_id: int) -> bool:
    """刷新会话（每次操作调用）"""
    r = get_redis()
    key = f"{ADMIN_SESSION_PREFIX}{user_id}"
    if r.exists(key):
        r.expire(key, ADMIN_SESSION_TTL)
        return True
    return False


def remove_admin_session(user_id: int):
    r = get_redis()
    r.delete(f"{ADMIN_SESSION_PREFIX}{user_id}")


def has_admin_session(user_id: int) -> bool:
    r = get_redis()
    return r.exists(f"{ADMIN_SESSION_PREFIX}{user_id}") > 0
