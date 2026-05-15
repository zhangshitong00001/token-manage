"""数据库模型 - Token套餐"""
from sqlalchemy import Column, Integer, String, BigInteger
from app.database import Base


class TokenPackage(Base):
    __tablename__ = "token_packages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, comment="套餐名称")
    token_amount = Column(BigInteger, nullable=False, comment="Token数量")
    price_cent = Column(Integer, nullable=False, comment="价格（分）")
    sort_order = Column(Integer, default=0)
    is_active = Column(Integer, default=1, comment="0下架 1上架")
