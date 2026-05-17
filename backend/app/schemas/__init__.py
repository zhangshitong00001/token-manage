"""Pydantic 数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


# ---- 用户 ----
class UserRegister(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: str = Field(..., min_length=6)
    nickname: Optional[str] = ""


class UserLogin(BaseModel):
    account: str  # 手机号或邮箱
    password: str


class UserProfile(BaseModel):
    id: int
    phone: Optional[str] = None
    email: Optional[str] = None
    nickname: str
    token_balance: int
    role: str
    status: Optional[int] = 1
    preferred_model: str = "deepseek-v4-flash"
    deepseek_api_key: str = ""
    created_at: datetime

    class Config:
        from_attributes = True


class UserBindKey(BaseModel):
    deepseek_api_key: str


class UserModelPref(BaseModel):
    preferred_model: str


# ---- Token消耗 ----
class UsageRecord(BaseModel):
    user_id: int
    agent_name: str = "hermes"
    input_tokens: int
    output_tokens: int
    request_id: str


class UsageRecordResponse(BaseModel):
    success: bool
    balance_after: int
    cost: int
    message: str


class DailyUsage(BaseModel):
    date: date
    total_input: int
    total_output: int
    total_cost: int


# ---- 套餐 ----
class PackageOut(BaseModel):
    id: int
    name: str
    token_amount: int
    price_cent: int
    sort_order: int
    is_active: int = 1

    class Config:
        from_attributes = True


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    token_amount: Optional[int] = None
    price_cent: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[int] = None


# ---- 订单 ----
class OrderCreate(BaseModel):
    package_id: int
    pay_method: str = "wechat"  # wechat / alipay


class OrderOut(BaseModel):
    id: int
    order_no: str
    amount_cent: int
    token_granted: int
    pay_method: str
    pay_status: int
    create_time: datetime
    pay_time: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- 管理员 ----
class AdminUserUpdate(BaseModel):
    token_balance: Optional[int] = None
    status: Optional[int] = None
    role: Optional[str] = None


class PriceConfigOut(BaseModel):
    input_price_per_k: float
    output_price_per_k: float


class PriceConfigUpdate(BaseModel):
    input_price_per_k: Optional[float] = None
    output_price_per_k: Optional[float] = None


class AdminStats(BaseModel):
    today_total_usage: int = 0
    today_total_recharge: int = 0  # 分
    active_users: int = 0
    total_users: int = 0


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile
