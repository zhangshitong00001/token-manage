"""数据库模型 - 对话历史"""
from datetime import datetime
import json

from sqlalchemy import Column, BigInteger, Integer, Text, DateTime, func
from app.database import Base, SessionLocal


class ChatHistory(Base):
    """对话历史记录"""
    __tablename__ = "chat_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True, comment="用户ID")
    conversation_id = Column(Integer, default=0, comment="对话轮次ID（同一轮多条消息共享）")
    role = Column(Text, nullable=False, comment="user / assistant")
    content = Column(Text, nullable=False, comment="消息内容")
    created_at = Column(DateTime, default=func.now())


def save_chat_message(user_id: int, role: str, content: str, conversation_id: int = 0) -> int:
    """保存一条消息到数据库"""
    db = SessionLocal()
    try:
        record = ChatHistory(
            user_id=user_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record.id
    finally:
        db.close()


def load_chat_history(user_id: int, limit: int = 100) -> list[dict]:
    """加载用户的对话历史"""
    db = SessionLocal()
    try:
        rows = (
            db.query(ChatHistory)
            .filter(ChatHistory.user_id == user_id)
            .order_by(ChatHistory.created_at.asc())
            .limit(limit)
            .all()
        )
        return [
            {"role": r.role, "content": r.content, "time": r.created_at.isoformat() if r.created_at else ""}
            for r in rows
        ]
    finally:
        db.close()


def save_conversation(user_id: int, messages: list[dict], conversation_id: int = 0) -> None:
    """批量保存整轮对话"""
    db = SessionLocal()
    try:
        # 先删除该用户/该轮次的旧记录
        db.query(ChatHistory).filter(
            ChatHistory.user_id == user_id,
            ChatHistory.conversation_id == conversation_id,
        ).delete()
        records = []
        for msg in messages:
            records.append(ChatHistory(
                user_id=user_id,
                conversation_id=conversation_id,
                role=msg["role"],
                content=msg["content"],
            ))
        db.add_all(records)
        db.commit()
    finally:
        db.close()
