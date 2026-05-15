"""数据库模型 - 系统级每日Token消耗汇总（来自Hermes Agent）"""
from datetime import date
from sqlalchemy import Column, BigInteger, String, DateTime, Integer, Date, Numeric, func
from app.database import Base


class SystemDailyUsage(Base):
    """每日系统级Token消耗统计（从Hermes Agent state.db同步）"""
    __tablename__ = "system_daily_usage"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    stats_date = Column(Date, unique=True, nullable=False, comment="统计日期")
    
    # Token 消耗
    total_input_tokens = Column(BigInteger, default=0, comment="总输入token")
    total_output_tokens = Column(BigInteger, default=0, comment="总输出token")
    total_cache_read_tokens = Column(BigInteger, default=0, comment="总缓存读取token")
    total_cache_write_tokens = Column(BigInteger, default=0, comment="总缓存写入token")
    total_reasoning_tokens = Column(BigInteger, default=0, comment="总推理token")
    
    # 会话统计
    session_count = Column(Integer, default=0, comment="活跃session数")
    api_call_count = Column(Integer, default=0, comment="API调用次数")
    tool_call_count = Column(Integer, default=0, comment="工具调用次数")
    
    # 费用
    estimated_cost_usd = Column(Numeric(12, 6), default=0, comment="估算费用(USD)")
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
