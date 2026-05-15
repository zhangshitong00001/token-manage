"""API路由 - 手机端消耗查询"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from app.database import get_db
from app.models import User, TokenUsage
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/mobile", tags=["手机端"])


@router.get("/usage/today")
def get_today_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """今日累计消耗"""
    today = date.today()
    records = db.query(TokenUsage).filter(
        TokenUsage.user_id == current_user.id,
        func.date(TokenUsage.usage_time) == today,
    ).all()
    return {
        "today_input": sum(r.input_tokens for r in records),
        "today_output": sum(r.output_tokens for r in records),
        "today_cost": sum(r.total_cost for r in records),
        "balance": current_user.token_balance,
    }


@router.get("/usage/trend")
def get_usage_trend(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """近N天每日消耗趋势"""
    trend = []
    for i in range(days - 1, -1, -1):
        d = date.today() - timedelta(days=i)
        records = db.query(TokenUsage).filter(
            TokenUsage.user_id == current_user.id,
            func.date(TokenUsage.usage_time) == d,
        ).all()
        trend.append({
            "date": d.isoformat(),
            "total_cost": sum(r.total_cost for r in records),
            "total_input": sum(r.input_tokens for r in records),
            "total_output": sum(r.output_tokens for r in records),
        })
    return {"days": days, "trend": trend}
