"""数据库模型 - 价格配置"""
from sqlalchemy import Column, Integer, Float, String
from app.database import Base


class PriceConfig(Base):
    """单行价格配置表 - 只有一条记录"""
    __tablename__ = "price_config"

    id = Column(Integer, primary_key=True, default=1)
    input_price_per_k = Column(Float, default=0.0001, comment="每千输入token价格（元）")
    output_price_per_k = Column(Float, default=0.0004, comment="每千输出token价格（元）")
