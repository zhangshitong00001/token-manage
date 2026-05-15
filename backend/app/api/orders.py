"""API路由 - 订单与支付"""
import random
import string
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User
from app.models.order import RechargeOrder
from app.models.package import TokenPackage
from app.schemas import OrderCreate, OrderOut
from app.core.deps import get_current_user, get_admin_user

router = APIRouter(prefix="/api/order", tags=["订单"])


def generate_order_no() -> str:
    """生成唯一订单号: TM + 时间戳 + 随机6位"""
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    rand = "".join(random.choices(string.digits, k=6))
    return f"TM{ts}{rand}"


@router.post("/create")
def create_order(
    data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建充值订单，返回支付参数"""
    package = db.query(TokenPackage).filter(
        TokenPackage.id == data.package_id,
        TokenPackage.is_active == 1,
    ).first()
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在或已下架")

    order = RechargeOrder(
        user_id=current_user.id,
        package_id=package.id,
        order_no=generate_order_no(),
        amount_cent=package.price_cent,
        token_granted=package.token_amount,
        pay_method=data.pay_method,
        pay_status=0,
        expire_time=datetime.now() + timedelta(minutes=30),
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # 模拟支付参数（正式环境需要调用微信/支付宝SDK）
    pay_params = {
        "order_no": order.order_no,
        "amount_cent": order.amount_cent,
        "pay_method": data.pay_method,
        "pay_url": f"https://pay.example.com/pay?order_no={order.order_no}",
    }

    return {
        "order": OrderOut.model_validate(order),
        "pay_params": pay_params,
    }


@router.post("/pay/{order_no}")
def confirm_payment(
    order_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """确认支付（模拟）—— 标记订单已支付，给用户增加 Token 余额"""
    order = db.query(RechargeOrder).filter(
        RechargeOrder.order_no == order_no,
        RechargeOrder.user_id == current_user.id,  # 只能支付自己的订单
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.pay_status != 0:
        raise HTTPException(status_code=400, detail=f"订单状态异常: 当前状态 {order.pay_status}")

    # 标记已支付
    order.pay_status = 1
    order.pay_time = datetime.now()

    # 增加用户余额
    user = db.query(User).filter(User.id == order.user_id).first()
    user.token_balance += order.token_granted

    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "message": "支付成功",
        "order_no": order.order_no,
        "token_granted": order.token_granted,
        "balance_after": user.token_balance,
        "pay_time": order.pay_time.isoformat(),
    }


@router.post("/admin-confirm/{order_no}")
def admin_confirm_payment(
    order_no: str,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """管理员手动确认支付"""
    order = db.query(RechargeOrder).filter(RechargeOrder.order_no == order_no).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.pay_status != 0:
        raise HTTPException(status_code=400, detail=f"订单状态异常: 当前状态 {order.pay_status}")

    order.pay_status = 1
    order.pay_time = datetime.now()

    user = db.query(User).filter(User.id == order.user_id).first()
    user.token_balance += order.token_granted
    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "message": "已手动确认支付",
        "order_no": order.order_no,
        "user_id": order.user_id,
        "token_granted": order.token_granted,
    }


@router.get("/status")
def get_order_status(
    order_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询订单支付状态（需登录，只能查自己订单）"""
    order = db.query(RechargeOrder).filter(
        RechargeOrder.order_no == order_no,
        RechargeOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return OrderOut.model_validate(order)


@router.get("/my-orders")
def get_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的充值记录"""
    orders = db.query(RechargeOrder).filter(
        RechargeOrder.user_id == current_user.id,
    ).order_by(RechargeOrder.create_time.desc()).limit(50).all()
    return [OrderOut.model_validate(o) for o in orders]
