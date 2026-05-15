"""初始化数据库表"""
from app.database import engine, Base
from app.models import User
from app.models.token_usage import TokenUsage
from app.models.package import TokenPackage
from app.models.order import RechargeOrder
from app.models.price_config import PriceConfig

Base.metadata.create_all(bind=engine)
print("✅ 数据库表创建成功")
