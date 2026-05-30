"""API路由 - 认证（仅邮箱验证码登录）"""

from fastapi import APIRouter, Depends, HTTPException, Body, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserRegister, UserLogin, TokenResponse, UserProfile
from app.core.security import hash_password, verify_password, create_access_token
from app.core.redis_client import generate_code, save_sms_code, verify_sms_code, set_admin_session
from app.core.email_client import send_email_code
from app.core.rate_limiter import check_rate_limit, check_login_attempt, record_login_failure
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["认证"])

# 管理员邮箱（唯一允许登录）
ADMIN_EMAIL = settings.ADMIN_EMAIL


@router.post("/register")
def register(data: UserRegister, db: Session = Depends(get_db)):
    """注册（需邮箱验证码）"""
    identifier = data.email or data.phone or "unknown"

    # 频率限制：同一邮箱/手机每1小时最多注册3次
    allowed, remaining = check_rate_limit(f"register:{identifier}", max_attempts=3, window_seconds=3600)
    if not allowed:
        raise HTTPException(status_code=429, detail="注册过于频繁，请1小时后再试")

    if not data.phone and not data.email:
        raise HTTPException(status_code=400, detail="手机号或邮箱至少填一个")

    if data.phone:
        existing = db.query(User).filter(User.phone == data.phone).first()
        if existing:
            raise HTTPException(status_code=400, detail="手机号已注册")
    if data.email:
        existing = db.query(User).filter(User.email == data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="邮箱已注册")

    # 验证邮箱验证码
    if data.email:
        if not data.code:
            raise HTTPException(status_code=400, detail="请输入验证码")
        if not verify_sms_code(data.email, data.code):
            raise HTTPException(status_code=400, detail="验证码错误或已过期")

    user = User(
        phone=data.phone,
        email=data.email,
        nickname=data.nickname or data.phone or data.email or "用户",
        password_hash=hash_password(data.password),
        token_balance=100000,
    )
    db.add(user)
    db.commit()

    return {"message": "注册成功", "user_id": user.id}


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """密码登录（带频率限制）"""
    identifier = data.account

    # 检查登录频率限制
    allowed, remaining = check_login_attempt(identifier)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="登录尝试过于频繁，请5分钟后再试",
        )

    user = db.query(User).filter(
        (User.phone == data.account) | (User.email == data.account)
    ).first()
    if not user or not verify_password(data.password, user.password_hash):
        record_login_failure(identifier)
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if user.status == 0:
        raise HTTPException(status_code=403, detail="账号已被禁用")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserProfile.model_validate(user))


# ---- 通用邮箱验证码登录（H5端使用）----

@router.post("/send-code")
def send_code(email: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """发送登录验证码到邮箱（任何已注册邮箱均可）"""
    # 频率限制：每60秒最多发1次
    allowed, remaining = check_rate_limit(f"send_code:{email}", max_attempts=3, window_seconds=300)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="验证码发送过于频繁，请5分钟后再试",
        )

    code = generate_code()
    save_sms_code(email, code)

    try:
        send_email_code(email, code)
        return {"message": f"验证码已发送到 {email}"}
    except Exception as e:
        print(f"[Email] 发送失败: {e}")
        # 生产环境不暴露验证码，仅记录日志
        return {"message": "发送失败，请稍后重试"}


@router.post("/code-login", response_model=TokenResponse)
def code_login(
    email: str = Body(...),
    code: str = Body(...),
    remember_me: bool = Body(default=True),
    response: Response = None,
    db: Session = Depends(get_db),
):
    """邮箱验证码登录（验证码有效期内可登录）
    - remember_me=true: token 30天有效（适用于自己的手机）
    - remember_me=false: token 1天有效（默认安全）
    """
    # 频率限制：同一邮箱每5分钟最多尝试10次
    allowed, remaining = check_login_attempt(f"code_login:{email}")
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="登录尝试过于频繁，请5分钟后再试",
        )

    if not verify_sms_code(email, code):
        record_login_failure(f"code_login:{email}")
        raise HTTPException(status_code=401, detail="验证码错误或已过期")

    # 查找或自动创建用户
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # 邮箱未注册，自动创建
        nickname = email.split("@")[0]
        user = User(
            email=email,
            nickname=nickname,
            password_hash="",  # 验证码登录用户无需密码
            token_balance=100000,
            role="user",
            status=1,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if user.status == 0:
        raise HTTPException(status_code=403, detail="账号已被禁用")

    token = create_access_token({"sub": str(user.id), "role": user.role}, remember_me=remember_me)

    # 如果是管理员，同时创建 Redis 会话（以便 admin 端接口识别）
    if user.role == "admin":
        set_admin_session(user.id, token)

    # 手动构建响应，确保 httpOnly Cookie 被正确设置
    from fastapi.responses import JSONResponse
    resp_data = TokenResponse(access_token=token, user=UserProfile.model_validate(user)).model_dump(mode="json")
    resp = JSONResponse(content=resp_data)
    max_age = 30 * 24 * 3600 if remember_me else settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    resp.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    return resp


# ---- 忘记密码（邮箱验证码重置）----

@router.post("/forgot-password/send-code")
def forgot_password_send_code(email: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """发送密码重置验证码到邮箱（仅已注册用户可用）"""
    # 检查用户是否存在
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # 不暴露邮箱是否注册
        return {"message": "验证码已发送（如邮箱已注册）"}

    # 频率限制：每60秒最多发1次，每5分钟最多3次
    allowed, remaining = check_rate_limit(f"forgot_pwd_send:{email}", max_attempts=3, window_seconds=300)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="验证码发送过于频繁，请5分钟后再试",
        )

    code = generate_code()
    save_sms_code(f"forgot_pwd:{email}", code)

    try:
        send_email_code(email, code)
        return {"message": f"验证码已发送到 {email}"}
    except Exception as e:
        print(f"[Email] 发送失败: {e}")
        return {"message": "发送失败，请稍后重试"}


@router.post("/forgot-password/reset")
def forgot_password_reset(
    email: str = Body(...),
    code: str = Body(...),
    new_password: str = Body(...),
    db: Session = Depends(get_db),
):
    """验证码验证后重置密码"""
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="密码至少6位")

    # 频率限制：同一邮箱每5分钟最多尝试10次
    allowed, remaining = check_rate_limit(f"forgot_pwd_reset:{email}", max_attempts=10, window_seconds=300)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="操作过于频繁，请5分钟后再试",
        )

    if not verify_sms_code(f"forgot_pwd:{email}", code):
        record_login_failure(f"forgot_pwd_reset:{email}")
        raise HTTPException(status_code=401, detail="验证码错误或已过期")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.password_hash = hash_password(new_password)
    db.commit()

    return {"message": "密码重置成功，请使用新密码登录"}


# ---- 管理员邮箱验证码登录（唯一方式）----

@router.post("/admin/send-code")
def admin_send_code(email: str = Body(..., embed=True)):
    """发送管理员登录验证码到邮箱（带频率限制：每5分钟最多3次）"""
    if email != ADMIN_EMAIL:
        # 不暴露邮箱是否注册
        return {"message": "验证码已发送（如邮箱已注册）"}

    # 频率限制：每5分钟最多发3次
    allowed, remaining = check_rate_limit(f"send_code:{email}", max_attempts=3, window_seconds=300)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="验证码发送过于频繁，请5分钟后再试",
        )

    code = generate_code()
    save_sms_code(email, code)

    try:
        send_email_code(email, code)
        return {"message": f"验证码已发送到 {email}"}
    except Exception as e:
        print(f"[Email] 发送失败: {e}")
        # 生产环境不暴露验证码
        return {"message": "发送失败，请稍后重试"}


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(
    email: str = Body(...),
    code: str = Body(...),
    response: Response = None,
    db: Session = Depends(get_db),
):
    """管理员邮箱验证码登录（带频率限制）"""
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=401, detail="验证码错误或已过期")

    # 频率限制：同一邮箱每5分钟最多尝试10次
    allowed, remaining = check_login_attempt(f"admin_login:{email}")
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="登录尝试过于频繁，请5分钟后再试",
        )

    if not verify_sms_code(email, code):
        record_login_failure(f"admin_login:{email}")
        raise HTTPException(status_code=401, detail="验证码错误或已过期")

    user = db.query(User).filter(User.email == email, User.role == "admin").first()
    if not user:
        raise HTTPException(status_code=404, detail="管理员不存在")
    if user.status == 0:
        raise HTTPException(status_code=403, detail="账号已被禁用")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    set_admin_session(user.id, token)

    # 手动构建响应，确保 Cookie 正确设置
    from fastapi.responses import JSONResponse
    resp_data = TokenResponse(access_token=token, user=UserProfile.model_validate(user)).model_dump(mode="json")
    resp = JSONResponse(content=resp_data)
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    resp.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    return resp
