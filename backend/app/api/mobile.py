"""API路由 - 手机端消耗查询"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from pathlib import Path

from app.database import get_db
from app.models import User, TokenUsage, SystemDailyUsage
from app.core.deps import get_current_user, get_admin_user_simple
from app.config import settings

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


import requests


@router.get("/deepseek/balance")
def get_deepseek_balance(
    current_user: User = Depends(get_current_user),
):
    """查询 DeepSeek 账户实时余额"""
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        return {"available": False, "error": "未配置 DeepSeek API Key"}
    try:
        resp = requests.get(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        balances = data.get("balance_infos", [])
        cny = next((b for b in balances if b.get("currency") == "CNY"), {})
        usd = next((b for b in balances if b.get("currency") == "USD"), {})
        return {
            "available": data.get("is_available", False),
            "cny_balance": float(cny.get("total_balance", 0)),
            "cny_granted": float(cny.get("granted_balance", 0)),
            "cny_topped_up": float(cny.get("topped_up_balance", 0)),
            "usd_balance": float(usd.get("total_balance", 0)),
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


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


# ---- H5 文件上传（跳过 Redis 会话检查，30天内有效）----

UPLOAD_DIR = Path("/root/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    admin: User = Depends(get_admin_user_simple),
):
    """H5 端文件上传（管理员专用，不依赖 Redis 会话）"""
    import aiofiles

    max_size = 500 * 1024 * 1024
    file_path = UPLOAD_DIR / file.filename

    written = 0
    async with aiofiles.open(str(file_path), "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_size:
                await f.close()
                file_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="文件超过500MB上限")
            await f.write(chunk)

    size_mb = written / 1024 / 1024
    return {
        "message": "上传成功",
        "filename": file.filename,
        "size_mb": round(size_mb, 2),
        "path": str(file_path),
    }
