"""API路由 - 手机端消耗查询"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from app.database import get_db
from app.models import User, TokenUsage, SystemDailyUsage
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


# ---- 系统级消耗（与后台管理后台SystemUsage保持一致）----

@router.get("/system/usage/daily")
def get_system_daily_usage(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """系统级每日消耗明细（同后台管理系统消耗页面）"""
    cutoff = date.today() - timedelta(days=days - 1)
    records = db.query(SystemDailyUsage).filter(
        SystemDailyUsage.stats_date >= cutoff
    ).order_by(SystemDailyUsage.stats_date.desc()).all()
    return {
        "total_days": len(records),
        "items": [
            {
                "stats_date": r.stats_date.isoformat(),
                "total_input_tokens": int(r.total_input_tokens or 0),
                "total_output_tokens": int(r.total_output_tokens or 0),
                "total_cache_read_tokens": int(r.total_cache_read_tokens or 0),
                "total_tokens": int((r.total_input_tokens or 0) + (r.total_output_tokens or 0)),
                "session_count": r.session_count or 0,
                "api_call_count": r.api_call_count or 0,
                "estimated_cost_usd": float(r.estimated_cost_usd or 0),
            }
            for r in records
        ],
    }


@router.get("/system/usage/summary")
def get_system_usage_summary(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """系统级消耗汇总（同后台管理系统消耗页面）"""
    cutoff = date.today() - timedelta(days=days - 1)
    records = db.query(SystemDailyUsage).filter(
        SystemDailyUsage.stats_date >= cutoff
    ).all()
    total_input = sum(int(r.total_input_tokens or 0) for r in records)
    total_output = sum(int(r.total_output_tokens or 0) for r in records)
    total_cache = sum(int(r.total_cache_read_tokens or 0) for r in records)
    total_cost = sum(float(r.estimated_cost_usd or 0) for r in records)
    return {
        "period_days": days,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_cache_read_tokens": total_cache,
        "total_tokens": total_input + total_output,
        "total_cost_usd": round(total_cost, 4),
        "avg_daily_tokens": int((total_input + total_output) / max(len(records), 1)),
    }
