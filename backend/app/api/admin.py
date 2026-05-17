"""API路由 - 管理后台"""
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta, datetime
from typing import Optional
import os
import shutil
from pathlib import Path
import requests
from app.config import settings
from app.database import get_db
from app.models import User, TokenUsage
from app.models.order import RechargeOrder
from app.models.package import TokenPackage
from app.models.price_config import PriceConfig
from app.models.system_daily_usage import SystemDailyUsage
from app.schemas import (
    AdminUserUpdate, PriceConfigOut, PriceConfigUpdate,
    AdminStats, PackageOut, PackageUpdate, UserProfile,
)
from app.core.deps import get_admin_user, get_admin_user_simple
router = APIRouter(prefix="/api/admin", tags=["管理后台"])


@router.get("/statistics")
def get_statistics(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """仪表盘数据"""
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())

    today_usage = db.query(func.coalesce(func.sum(TokenUsage.total_cost), 0)).filter(
        TokenUsage.usage_time >= today_start
    ).scalar()

    today_recharge = db.query(func.coalesce(func.sum(RechargeOrder.amount_cent), 0)).filter(
        RechargeOrder.pay_status == 1,
        func.date(RechargeOrder.pay_time) == today,
    ).scalar()

    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.status == 1).scalar()

    return {
        "today_total_usage": int(today_usage),
        "today_total_recharge": int(today_recharge),
        "total_users": total_users,
        "active_users": active_users,
    }


# ---- 用户管理 ----
@router.get("/users")
def list_users(
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """用户列表"""
    query = db.query(User)
    if keyword:
        query = query.filter(
            (User.phone.ilike(f"%{keyword}%")) | (User.email.ilike(f"%{keyword}%")) | (User.nickname.ilike(f"%{keyword}%"))
        )
    total = query.count()
    users = query.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [UserProfile.model_validate(u) for u in users],
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """更新用户（余额/状态/角色）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if data.token_balance is not None:
        user.token_balance = data.token_balance
    if data.status is not None:
        user.status = data.status
    if data.role is not None:
        user.role = data.role
    db.commit()
    return {"message": "更新成功"}


# ---- 套餐管理 ----
@router.get("/packages")
def list_packages(admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """所有套餐（含已下架）"""
    return db.query(TokenPackage).order_by(TokenPackage.sort_order).all()


@router.post("/packages")
def create_package(data: PackageOut, admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """新增套餐"""
    pkg = TokenPackage(**data.dict())
    db.add(pkg)
    db.commit()
    return {"message": "创建成功"}


@router.put("/packages/{package_id}")
def update_package(
    package_id: int,
    data: PackageUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """编辑套餐 / 上下架"""
    pkg = db.query(TokenPackage).filter(TokenPackage.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="套餐不存在")
    update_data = data.dict(exclude_none=True)
    for key, val in update_data.items():
        setattr(pkg, key, val)
    db.commit()
    action = "上架" if data.is_active == 1 else "下架" if data.is_active == 0 else "编辑"
    return {"message": f"套餐{action}成功"}


# ---- 价格配置 ----
@router.get("/price-config", response_model=PriceConfigOut)
def get_price_config(admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    config = db.query(PriceConfig).first()
    if not config:
        config = PriceConfig(id=1)
        db.add(config)
        db.commit()
    return PriceConfigOut(input_price_per_k=config.input_price_per_k, output_price_per_k=config.output_price_per_k)


@router.put("/price-config")
def update_price_config(
    data: PriceConfigUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    config = db.query(PriceConfig).first()
    if not config:
        config = PriceConfig(id=1)
        db.add(config)
    if data.input_price_per_k is not None:
        config.input_price_per_k = data.input_price_per_k
    if data.output_price_per_k is not None:
        config.output_price_per_k = data.output_price_per_k
    db.commit()
    return {"message": "更新成功"}


# ---- 订单管理 ----
@router.get("/orders")
def list_orders(
    page: int = 1,
    page_size: int = 20,
    pay_status: Optional[int] = None,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(RechargeOrder)
    if pay_status is not None:
        query = query.filter(RechargeOrder.pay_status == pay_status)
    total = query.count()
    orders = query.order_by(RechargeOrder.create_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": orders}


# ---- 管理员心跳 ----
@router.get("/ping")
def admin_ping(admin: User = Depends(get_admin_user)):
    """管理后台心跳，刷新10分钟会话"""
    return {"status": "ok", "ts": __import__("datetime").datetime.now().isoformat()}


# ---- 消耗记录查询 ----
@router.get("/usage/list")
def list_usage(
    page: int = 1,
    page_size: int = 20,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(TokenUsage)
    if user_id:
        query = query.filter(TokenUsage.user_id == user_id)
    if start_date:
        query = query.filter(TokenUsage.usage_time >= start_date)
    if end_date:
        query = query.filter(TokenUsage.usage_time <= f"{end_date} 23:59:59")
    total = query.count()
    items = query.order_by(TokenUsage.usage_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ---- 系统级每日Token消耗统计（从Hermes Agent state.db同步）----
@router.get("/system-usage/daily")
def get_system_daily_usage(
    days: int = Query(30, ge=1, le=365, description="最近N天"),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """查询系统级每日Token消耗汇总"""
    from datetime import timedelta
    cutoff = date.today() - timedelta(days=days - 1)
    records = db.query(SystemDailyUsage).filter(
        SystemDailyUsage.stats_date >= cutoff
    ).order_by(SystemDailyUsage.stats_date.desc()).all()
    return {
        "total_days": len(records),
        "items": [
            {
                "stats_date": r.stats_date.isoformat(),
                "total_input_tokens": int(r.total_input_tokens),
                "total_output_tokens": int(r.total_output_tokens),
                "total_cache_read_tokens": int(r.total_cache_read_tokens),
                "total_tokens": int(r.total_input_tokens + r.total_output_tokens),
                "session_count": r.session_count,
                "api_call_count": r.api_call_count,
                "tool_call_count": r.tool_call_count,
                "estimated_cost_usd": float(r.estimated_cost_usd or 0),
            }
            for r in records
        ],
    }


# ---- 系统消耗汇总（最新N天总计，供仪表盘用）----
@router.get("/system-usage/summary")
def get_system_usage_summary(
    days: int = Query(7, ge=1, le=365),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """系统消耗汇总统计"""
    from datetime import timedelta
    cutoff = date.today() - timedelta(days=days - 1)
    records = db.query(SystemDailyUsage).filter(
        SystemDailyUsage.stats_date >= cutoff
    ).all()
    total_input = sum(r.total_input_tokens for r in records)
    total_output = sum(r.total_output_tokens for r in records)
    total_cache = sum(r.total_cache_read_tokens for r in records)
    total_cost = sum(float(r.estimated_cost_usd or 0) for r in records)
    return {
        "period_days": days,
        "total_input_tokens": int(total_input),
        "total_output_tokens": int(total_output),
        "total_cache_read_tokens": int(total_cache),
        "total_tokens": int(total_input + total_output),
        "total_cost_usd": round(total_cost, 4),
        "avg_daily_tokens": int((total_input + total_output) / max(len(records), 1)),
    }


@router.post("/system-usage/sync")
def sync_system_usage(
    data: dict,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """手动触发某天数据同步（供管理后台调用）"""
    stats_date_str = data.get("stats_date", date.today().isoformat())
    try:
        stats_date = date.fromisoformat(stats_date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误")
    
    # 删除已有记录（upsert）
    existing = db.query(SystemDailyUsage).filter(SystemDailyUsage.stats_date == stats_date).first()
    if existing:
        db.delete(existing)
        db.flush()
    
    # 写入记录
    record = SystemDailyUsage(
        stats_date=stats_date,
        total_input_tokens=data.get("total_input_tokens", 0),
        total_output_tokens=data.get("total_output_tokens", 0),
        total_cache_read_tokens=data.get("total_cache_read_tokens", 0),
        total_cache_write_tokens=data.get("total_cache_write_tokens", 0),
        total_reasoning_tokens=data.get("total_reasoning_tokens", 0),
        session_count=data.get("session_count", 0),
        api_call_count=data.get("api_call_count", 0),
        tool_call_count=data.get("tool_call_count", 0),
        estimated_cost_usd=data.get("estimated_cost_usd", 0),
    )
    db.add(record)
    db.commit()
    return {"message": f"{stats_date} 数据同步成功", "record": stats_date_str}


@router.get("/deepseek/balance")
def admin_deepseek_balance(admin: User = Depends(get_admin_user)):
    """查询 DeepSeek 账户实时余额（管理后台使用）"""
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


# ---- 文件上传（临时，供上传DS源码等）----

UPLOAD_DIR = Path("/root/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    admin: User = Depends(get_admin_user_simple),
):
    """上传文件到服务器（管理员专用，最大500MB）"""
    import aiofiles

    max_size = 500 * 1024 * 1024
    file_path = UPLOAD_DIR / file.filename

    # 流式写入，避免大文件占内存
    written = 0
    async with aiofiles.open(str(file_path), "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)  # 每次 8MB
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
