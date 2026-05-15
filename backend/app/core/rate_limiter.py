"""速率限制工具 - 基于 Redis"""

from app.core.redis_client import get_redis


def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60) -> tuple[bool, int]:
    """
    检查是否超过速率限制
    返回: (是否允许通过, 剩余尝试次数)
    """
    r = get_redis()
    redis_key = f"rate_limit:{key}"

    current = r.get(redis_key)
    if current is None:
        # 首次访问
        r.setex(redis_key, window_seconds, 1)
        return True, max_attempts - 1

    count = int(current)
    if count >= max_attempts:
        return False, 0

    r.incr(redis_key)
    return True, max_attempts - count - 1


def check_login_attempt(identifier: str) -> tuple[bool, int]:
    """
    登录尝试限制: 5分钟内最多10次失败
    返回: (是否允许, 剩余次数)
    """
    return check_rate_limit(f"login:{identifier}", max_attempts=10, window_seconds=300)


def record_login_failure(identifier: str):
    """记录登录失败（递增计数）"""
    r = get_redis()
    key = f"login_fail:{identifier}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, 300)  # 5分钟过期
    return count
