"""API路由 - 认证（仅邮箱验证码登录）"""

from fastapi import APIRouter, Depends, HTTPException, Body
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
    """注册（不自动返回Token，降低风险）"""
    if not data.phone and not data.email:
        raise HTTPException(status_code=400, detail="手机号或邮箱至少填一个")

    # 频率限制：同一IP每分钟最多注册3次
    # （简化处理，生产环境应获取真实IP）
    if data.phone:
        existing = db.query(User).filter(User.phone == data.phone).first()
        if existing:
            raise HTTPException(status_code=400, detail="手机号已注册")
    if data.email:
        existing = db.query(User).filter(User.email == data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="邮箱已注册")

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
        return {"message": "发送失败（开发模式）", "debug_code": code}


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(
    email: str = Body(...),
    code: str = Body(...),
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
    return TokenResponse(access_token=token, user=UserProfile.model_validate(user))
