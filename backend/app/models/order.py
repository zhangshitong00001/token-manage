"""数据库模型 - 充值订单"""
import datetime
from sqlalchemy import Column, BigInteger, String, Integer, SmallInteger, DateTime, func, text
from app.database import Base


class RechargeOrder(Base):
    __tablename__ = "recharge_orders"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    package_id = Column(Integer, nullable=False)
    order_no = Column(String(64), unique=True, nullable=False, comment="唯一订单号")
    amount_cent = Column(Integer, nullable=False, comment="实付金额（分）")
    token_granted = Column(BigInteger, nullable=False, comment="赠送Token数")
    pay_method = Column(String(10), default="", comment="wechat / alipay")
    pay_status = Column(SmallInteger, default=0, comment="0待支付 1成功 2失败 3退款")
    pay_time = Column(DateTime, nullable=True)
    expire_time = Column(DateTime, nullable=True)
    create_time = Column(DateTime, default=func.now())
