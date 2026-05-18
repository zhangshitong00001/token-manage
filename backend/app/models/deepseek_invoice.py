"""数据库模型 - DeepSeek 充值账单"""
from sqlalchemy import Column, BigInteger, String, Integer, SmallInteger, DateTime, func, text
from app.database import Base


class DeepSeekInvoice(Base):
    """DeepSeek 充值订单流水（同步自 platform.deepseek.com）"""
    __tablename__ = "deepseek_invoices"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    payment_order_id = Column(String(128), unique=True, nullable=False, index=True, comment="DeepSeek 订单号")
    amount = Column(Integer, nullable=False, default=0, comment="金额（元）")
    currency = Column(String(10), default="CNY", comment="币种")
    status = Column(String(20), default="CREATED", comment="SUCCESS / CREATED / FAILED")
    payment_method = Column(String(20), default="", comment="wechat / alipay / unionpay")
    paid_at = Column(DateTime, nullable=True, comment="支付时间")
    inserted_at = Column(DateTime, nullable=True, comment="DeepSeek 创建时间")
    updated_at = Column(DateTime, nullable=True, comment="DeepSeek 更新时间")
    sync_at = Column(DateTime, default=func.now(), comment="本地同步时间")
