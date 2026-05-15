"""数据库模型 - Token消耗记录"""
import datetime
from sqlalchemy import Column, BigInteger, String, DateTime, Integer, func
from app.database import Base


class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    agent_name = Column(String(50), default="hermes")
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_cost = Column(Integer, default=0, comment="实际扣除的Token额度（个）")
    usage_time = Column(DateTime, default=func.now(), index=True)
    request_id = Column(String(64), unique=True, nullable=False, comment="幂等键")
