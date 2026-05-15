"""
全局请求日志中间件
- 自动记录每一个API请求的详细信息
- 包含：用户、路径、参数、耗时、响应状态、IP、UA
- 双写：文件 + 数据库
"""
import time
import json
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.services.log_service import write_log


class RequestLogMiddleware(BaseHTTPMiddleware):
    """自动记录所有API请求的中间件"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # ---------- 收集请求信息 ----------
        method = request.method
        path = request.url.path
        query_params = str(request.url.query)

        # 获取客户端 IP
        ip = request.headers.get("x-forwarded-for", "")
        if not ip:
            ip = request.client.host if request.client else "unknown"
        else:
            ip = ip.split(",")[0].strip()

        user_agent = request.headers.get("user-agent", "")

        # 获取认证用户ID（尝试从请求头中解析JWT）
        user_id = 0
        auth_header = request.headers.get("authorization", "")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                from app.core.security import decode_access_token
                token = auth_header.replace("Bearer ", "")
                payload = decode_access_token(token)
                user_id = int(payload.get("sub", 0))
            except Exception:
                pass

        # 获取请求体（仅POST/PUT并且是JSON）
        request_body = ""
        if method in ("POST", "PUT") and "application/json" in request.headers.get("content-type", ""):
            try:
                body_bytes = await request.body()
                request_body = body_bytes.decode("utf-8", errors="replace")
            except Exception:
                request_body = "<读取失败>"

        # 构建action名
        action = f"{method}:{path}"

        # ---------- 处理请求 ----------
        try:
            response = await call_next(request)
            duration = int((time.time() - start_time) * 1000)

            # 获取响应内容（仅对JSON响应）
            resp_body = ""
            resp_status = response.status_code

            # ---------- 写入日志 ----------
            level = "ERROR" if resp_status >= 400 else "INFO"

            detail_parts = []
            if query_params:
                detail_parts.append(f"query={query_params}")
            if request_body:
                # 脱敏：隐藏密码
                safe_body = request_body
                try:
                    body_json = json.loads(request_body)
                    if "password" in body_json:
                        body_json["password"] = "******"
                    safe_body = json.dumps(body_json, ensure_ascii=False)
                except json.JSONDecodeError:
                    safe_body = request_body[:100]
                detail_parts.append(f"body={safe_body}")
            if response.headers.get("content-type", "").startswith("application/json"):
                detail_parts.append(f"resp_status={resp_status}")

            write_log(
                action=action,
                user_id=user_id,
                method=method,
                path=path,
                request_params=query_params,
                response_status=resp_status,
                response_body=resp_body,
                ip_address=ip,
                user_agent=user_agent,
                duration_ms=duration,
                detail=" | ".join(detail_parts),
                level=level,
            )

            return response

        except Exception as e:
            duration = int((time.time() - start_time) * 1000)
            write_log(
                action=f"ERROR:{method}:{path}",
                user_id=user_id,
                method=method,
                path=path,
                response_status=500,
                ip_address=ip,
                user_agent=user_agent,
                duration_ms=duration,
                detail=f"异常: {str(e)}",
                level="ERROR",
            )
            raise
