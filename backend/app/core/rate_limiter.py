"""速率限制工具 - 基于 Redis"""
import time
from fastapi import HTTPException, Request
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
        r.setex(redis_key, window_seconds, 1)
        return True, max_attempts - 1

    count = int(current)
    if count >= max_attempts:
        return False, 0

    r.incr(redis_key)
    return True, max_attempts - count - 1


def check_login_attempt(identifier: str) -> tuple[bool, int]:
    """登录尝试限制: 5分钟内最多10次失败"""
    return check_rate_limit(f"login:{identifier}", max_attempts=10, window_seconds=300)


def record_login_failure(identifier: str):
    """记录登录失败（递增计数）"""
    r = get_redis()
    key = f"login_fail:{identifier}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, 300)
    return count


# ── API 速率限制（用于数据接口） ──

def api_rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """
    FastAPI 依赖注入 — 按用户+路径限流
    
    用法:
        @router.get("/users")
        def list_users(rate_check: None = Depends(api_rate_limit(30, 60))):
            ...
    
    或直接在路由参数里用:
        @router.get("/users")
        def list_users(_: None = Depends(api_rate_limit(30, 60)), admin=Depends(get_admin_user)):
            ...
    """
    def dependency(request: Request):
        # 从 request 提取用户标识
        user_id = 0
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            try:
                from app.core.security import decode_access_token
                payload = decode_access_token(auth[7:])
                user_id = payload.get("sub", 0)
            except Exception:
                pass

        # 如果没登录，用 IP 兜底
        if not user_id:
            xff = request.headers.get("x-forwarded-for", "")
            ip = xff.split(",")[0].strip() if xff else request.client.host if request.client else "unknown"
            key = f"api:ip:{ip}:{request.url.path}"
        else:
            key = f"api:user:{user_id}:{request.url.path}"

        allowed, remaining = check_rate_limit(key, max_attempts=max_requests, window_seconds=window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"请求过于频繁，请{window_seconds}秒后再试",
                headers={"X-RateLimit-Remaining": "0", "Retry-After": str(window_seconds)},
            )
        return None

    return dependency
