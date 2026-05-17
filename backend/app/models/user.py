"""数据库模型 - 用户"""
from sqlalchemy import Column, BigInteger, String, DateTime, SmallInteger, func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    phone = Column(String(20), unique=True, nullable=True)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(50), default="")
    deepseek_api_key = Column(String(255), default="")
    preferred_model = Column(String(50), default="deepseek-v4-flash", comment="用户偏好的模型")
    token_balance = Column(BigInteger, default=0, comment="当前剩余Token额度（个）")
    role = Column(String(20), default="user", comment="user / admin")
    status = Column(SmallInteger, default=1, comment="0禁用 1正常")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
