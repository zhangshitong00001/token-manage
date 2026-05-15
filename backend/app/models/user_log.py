"""数据库模型 - 用户操作日志"""
from sqlalchemy import Column, BigInteger, String, Integer, DateTime, Text, func, Index
from app.database import Base


class UserLog(Base):
    __tablename__ = "user_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, default=0, index=True)
    action = Column(String(100), nullable=False, index=True, comment="操作名称")
    method = Column(String(10), default="", comment="HTTP方法")
    path = Column(String(500), default="", comment="请求路径")
    request_params = Column(Text, default="", comment="请求参数")
    response_status = Column(Integer, default=0, comment="响应状态码")
    response_body = Column(Text, default="", comment="响应内容(截断)")
    ip_address = Column(String(45), default="", comment="客户端IP")
    user_agent = Column(Text, default="", comment="User-Agent")
    duration_ms = Column(Integer, default=0, comment="处理耗时(毫秒)")
    detail = Column(Text, default="", comment="详细描述")
    created_at = Column(DateTime, default=func.now(), index=True)
