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
from app.models.deepseek_invoice import DeepSeekInvoice
from app.models.package import TokenPackage
from app.models.price_config import PriceConfig
from app.models.system_daily_usage import SystemDailyUsage
from app.models.deepseek_invoice import DeepSeekInvoice
from app.schemas import (
    AdminUserUpdate, PriceConfigOut, PriceConfigUpdate,
    AdminStats, PackageOut, PackageUpdate, UserProfile,
    SystemUsageSync,
)
from app.core.deps import get_admin_user
from app.core.rate_limiter import api_rate_limit
from app.core.security import force_logout_user
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
    # 今日充值成功（DeepSeek 账单）
    today_recharge = db.query(func.coalesce(func.sum(DeepSeekInvoice.amount), 0)).filter(
        DeepSeekInvoice.status == "SUCCESS",
        func.date(DeepSeekInvoice.paid_at) == today,
    ).scalar()

    # 历史充值成功总金额（DeepSeek 账单）
    total_recharge = db.query(func.coalesce(func.sum(DeepSeekInvoice.amount), 0)).filter(
        DeepSeekInvoice.status == "SUCCESS",
    ).scalar()

    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.status == 1).scalar()

    return {
        "today_total_usage": int(today_usage),
        "today_total_recharge": int(today_recharge),
        "total_recharge_amount": int(total_recharge),
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


@router.post("/users/{user_id}/add-tokens")
def admin_add_tokens(
    user_id: int,
    data: dict,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """为指定用户增加 Token 额度（充值操作）"""
    amount = data.get("amount", 0)
    remark = data.get("remark", "")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount 必须大于0")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    from app.core.token_quota import add_tokens_from_recharge
    result = add_tokens_from_recharge(
        user_id=user_id,
        amount_yuan=amount,
        db=db,
        remark=remark,
    )
    return {
        "message": f"已为用户 {user.nickname or user.email or user_id} 增加 {result['added_tokens']} Token",
        "added_tokens": result["added_tokens"],
        "balance_before": result["balance_before"],
        "balance_after": result["balance_after"],
    }


@router.get("/users/{user_id}/quota-usage")
def admin_user_quota_usage(
    user_id: int,
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """查询指定用户的 Token 消耗记录"""
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(days=days)
    records = db.query(TokenUsage).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.usage_time >= cutoff,
    ).order_by(TokenUsage.usage_time.desc()).limit(200).all()
    
    user = db.query(User).filter(User.id == user_id).first()
    total_deducted = sum(r.total_cost for r in records)
    
    return {
        "user_id": user_id,
        "user_nickname": user.nickname if user else "",
        "user_email": user.email if user else "",
        "balance": user.token_balance if user else 0,
        "total_records": len(records),
        "total_deducted_tokens": total_deducted,
        "records": [
            {
                "time": r.usage_time.isoformat() if r.usage_time else "",
                "agent": r.agent_name,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "deducted_tokens": r.total_cost,
            }
            for r in records
        ],
    }


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


# ---- 安全：强制踢下线（所有设备） ----

@router.post("/force-logout")
def admin_force_logout(
    _: None = Depends(api_rate_limit(3, 60)),  # 每分钟最多3次
    admin: User = Depends(get_admin_user),
):
    """
    强制所有设备下线（Token 黑名单 + Redis 会话清理）
    用户所有已登录的设备会在下次请求时被踢出，需要重新登录
    """
    force_logout_user(admin.id)
    return {"message": "已强制所有设备下线，请重新登录"}


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
    data: SystemUsageSync,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """手动触发某天数据同步（供管理后台调用）"""
    stats_date_str = data.stats_date or date.today().isoformat()
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
        total_input_tokens=data.total_input_tokens,
        total_output_tokens=data.total_output_tokens,
        total_cache_read_tokens=data.total_cache_read_tokens,
        total_cache_write_tokens=data.total_cache_write_tokens,
        total_reasoning_tokens=data.total_reasoning_tokens,
        session_count=data.session_count,
        api_call_count=data.api_call_count,
        tool_call_count=data.tool_call_count,
        estimated_cost_usd=data.estimated_cost_usd,
    )
    db.add(record)
    db.commit()
    return {"message": f"{stats_date} 数据同步成功", "record": stats_date_str}


# ---- Hermes Agent 实时消耗（直读 state.db） ----
import sqlite3
from pathlib import Path as _Path

_HERMES_STATE_DB = str(_Path.home() / ".hermes" / "state.db")


def _get_state_db():
    conn = sqlite3.connect(f"file:{_HERMES_STATE_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/system-usage/realtime")
def get_realtime_usage(
    hours: int = Query(24, ge=1, le=720, description="最近N小时"),
    admin: User = Depends(get_admin_user),
):
    """Hermes Agent 实时Token消耗（直读 state.db）"""
    import time
    now = time.time()
    since_ts = now - hours * 3600

    conn = _get_state_db()

    # 1. 整体汇总
    agg = conn.execute(
        """SELECT
            COUNT(*) as session_count,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
            COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
            COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd,
            COALESCE(SUM(api_call_count), 0) as api_call_count,
            COALESCE(SUM(tool_call_count), 0) as tool_call_count
        FROM sessions WHERE started_at >= ?""",
        (since_ts,),
    ).fetchone()

    # 2. 按 source 分组
    sources = conn.execute(
        """SELECT source, COUNT(*) as cnt,
            COALESCE(SUM(input_tokens),0) as input_tokens,
            COALESCE(SUM(output_tokens),0) as output_tokens
        FROM sessions WHERE started_at >= ?
        GROUP BY source ORDER BY input_tokens + output_tokens DESC""",
        (since_ts,),
    ).fetchall()

    # 3. 按 model 分组
    models = conn.execute(
        """SELECT COALESCE(model,'unknown') as model, COUNT(*) as cnt,
            COALESCE(SUM(input_tokens),0) as input_tokens,
            COALESCE(SUM(output_tokens),0) as output_tokens,
            COALESCE(SUM(cache_read_tokens),0) as cache_read_tokens
        FROM sessions WHERE started_at >= ?
        GROUP BY model ORDER BY input_tokens + output_tokens DESC""",
        (since_ts,),
    ).fetchall()

    # 4. 最近 session
    recent = conn.execute(
        """SELECT id, source, model, input_tokens, output_tokens,
            cache_read_tokens, started_at, ended_at, message_count, tool_call_count
        FROM sessions WHERE started_at >= ?
        ORDER BY started_at DESC LIMIT 50""",
        (since_ts,),
    ).fetchall()
    conn.close()

    return {
        "period_hours": hours,
        "query_time": datetime.now().isoformat(),
        "summary": {
            "session_count": agg["session_count"],
            "input_tokens": agg["input_tokens"],
            "output_tokens": agg["output_tokens"],
            "cache_read_tokens": agg["cache_read_tokens"],
            "cache_write_tokens": agg["cache_write_tokens"],
            "reasoning_tokens": agg["reasoning_tokens"],
            "total_tokens": agg["input_tokens"] + agg["output_tokens"],
            "estimated_cost_usd": round(agg["estimated_cost_usd"], 6),
            "api_call_count": agg["api_call_count"],
            "tool_call_count": agg["tool_call_count"],
        },
        "by_source": [
            {
                "source": r["source"],
                "session_count": r["cnt"],
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "total_tokens": r["input_tokens"] + r["output_tokens"],
            }
            for r in sources
        ],
        "by_model": [
            {
                "model": r["model"],
                "session_count": r["cnt"],
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "cache_read_tokens": r["cache_read_tokens"],
                "total_tokens": r["input_tokens"] + r["output_tokens"],
            }
            for r in models
        ],
        "recent_sessions": [
            {
                "session_id": r["id"],
                "source": r["source"],
                "model": r["model"] or "unknown",
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "cache_read_tokens": r["cache_read_tokens"],
                "total_tokens": r["input_tokens"] + r["output_tokens"],
                "started_at": r["started_at"],
                "duration_s": round(r["ended_at"] - r["started_at"], 1) if r["ended_at"] else None,
                "message_count": r["message_count"],
                "tool_call_count": r["tool_call_count"],
            }
            for r in recent
        ],
    }


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
    admin: User = Depends(get_admin_user),
):
    """上传文件到服务器（管理员专用，最大500MB）"""
    import aiofiles
    import os

    max_size = 500 * 1024 * 1024
    # 消毒文件名：防止路径穿越（../../etc/passwd → passwd）
    safe_filename = os.path.basename(file.filename or "uploaded_file")
    file_path = UPLOAD_DIR / safe_filename

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
        "filename": safe_filename,
        "size_mb": round(size_mb, 2),
        "path": str(file_path),
    }


# ============================================================
# DeepSeek 平台数据（安全代理，API Key 脱敏）
# ============================================================

DEEPSEEK_BASE = "https://platform.deepseek.com"


def _ds_headers() -> dict:
    return {
        "accept": "*/*",
        "authorization": f"Bearer {settings.DEEPSEEK_USER_TOKEN}",
        "content-type": "application/json",
        "pragma": "no-cache",
        "referer": "https://platform.deepseek.com/",
        "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
        "x-app-version": "1.0.0",
    }


def _mask_api_key(key: str) -> str:
    """脱敏 API Key：只保留前缀6位 + 末尾4位"""
    if len(key) <= 12:
        return key[:6] + "..." + key[-4:]
    return key[:6] + "*" * (len(key) - 10) + key[-4:]


@router.get("/deepseek/api-keys")
def ds_get_api_keys(admin: User = Depends(get_admin_user)):
    """获取 DeepSeek API Key 列表（自动脱敏）"""
    try:
        resp = requests.get(
            f"{DEEPSEEK_BASE}/api/v0/users/get_api_keys",
            headers=_ds_headers(), timeout=15,
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"DeepSeek 接口错误: {resp.status_code}")
        data = resp.json()
        if data.get("code") != 0:
            raise HTTPException(502, f"DeepSeek 业务错误: {data.get('msg', '')}")
        keys = data.get("data", {}).get("biz_data", {}).get("api_keys", [])
        result = []
        for k in keys:
            full_id = k.get("sensitive_id", "")
            result.append({
                "tracking_id": k.get("tracking_id", ""),
                "name": k.get("name", ""),
                "masked_key": _mask_api_key(full_id),
                "created_at": k.get("created_at", 0),
                "last_use": k.get("last_use", 0),
            })
        return {"success": True, "items": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"获取 API Key 失败: {str(e)}")


@router.post("/deepseek/api-keys/reveal")
def ds_reveal_api_key(data: dict, admin: User = Depends(get_admin_user)):
    """揭示完整 API Key（仅管理员可调，返回明文）"""
    tracking_id = data.get("tracking_id", "")
    if not tracking_id:
        raise HTTPException(400, "缺少 tracking_id")
    try:
        resp = requests.get(
            f"{DEEPSEEK_BASE}/api/v0/users/get_api_keys",
            headers=_ds_headers(), timeout=15,
        )
        data = resp.json()
        keys = data.get("data", {}).get("biz_data", {}).get("api_keys", [])
        for k in keys:
            if k.get("tracking_id") == tracking_id:
                return {
                    "success": True,
                    "key": k.get("sensitive_id", ""),
                    "name": k.get("name", ""),
                }
        raise HTTPException(404, "未找到该 API Key")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"揭示 API Key 失败: {str(e)}")


@router.get("/deepseek/usage")
def ds_get_usage(
    month: int = 0, year: int = 0,
    admin: User = Depends(get_admin_user),
):
    """获取 DeepSeek 本月用量 + 费用"""
    from datetime import datetime as dt
    now = dt.now()
    m = month or now.month
    y = year or now.year
    result = {"amount": None, "cost": None}
    for ep_name, ep_path in [("amount", "/api/v0/usage/amount"), ("cost", "/api/v0/usage/cost")]:
        try:
            r = requests.get(
                f"{DEEPSEEK_BASE}{ep_path}",
                params={"month": m, "year": y},
                headers=_ds_headers(), timeout=15,
            )
            if r.ok:
                result[ep_name] = r.json()
        except:
            pass
    return {"success": True, "month": m, "year": y, "data": result}


@router.get("/deepseek/summary")
def ds_get_summary(admin: User = Depends(get_admin_user)):
    """获取 DeepSeek 账户摘要"""
    try:
        resp = requests.get(
            f"{DEEPSEEK_BASE}/api/v0/users/get_user_summary",
            headers=_ds_headers(), timeout=15,
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"DeepSeek 接口错误: {resp.status_code}")
        data = resp.json()
        if data.get("code") != 0:
            raise HTTPException(502, f"DeepSeek 业务错误: {data.get('msg', '')}")
        biz = data.get("data", {}).get("biz_data", {})
        return {
            "success": True,
            "data": {
                "current_token": biz.get("current_token", 0),
                "monthly_usage": biz.get("monthly_usage", "0"),
                "total_available_token_estimation": biz.get("total_available_token_estimation", "0"),
                "monthly_token_usage": biz.get("monthly_token_usage", "0"),
                "normal_wallets": biz.get("normal_wallets", []),
                "bonus_wallets": biz.get("bonus_wallets", []),
                "monthly_costs": biz.get("monthly_costs", []),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"获取账户摘要失败: {str(e)}")


@router.get("/deepseek/invoices")
def list_deepseek_invoices(
    page: int = 1,
    page_size: int = 20,
    status: str = "",
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """查询 DeepSeek 充值账单（与 H5 同步）"""
    q = db.query(DeepSeekInvoice).order_by(DeepSeekInvoice.inserted_at.desc().nullslast())
    if status:
        q = q.filter(DeepSeekInvoice.status == status.upper())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "payment_order_id": r.payment_order_id,
                "amount": r.amount,
                "currency": r.currency,
                "status": r.status,
                "payment_method": r.payment_method,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
                "inserted_at": r.inserted_at.isoformat() if r.inserted_at else None,
                "sync_at": r.sync_at.isoformat() if r.sync_at else None,
            }
            for r in items
        ],
    }


@router.post("/deepseek/invoices/sync")
def sync_deepseek_invoices(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """同步 DeepSeek 充值账单"""
    from app.core.deepseek_payment import DeepSeekPayment
    from datetime import datetime as dt

    _ds_pay = DeepSeekPayment()
    try:
        token = settings.DEEPSEEK_USER_TOKEN
        orders = _ds_pay.get_invoices(override_token=token)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"同步失败: {str(e)}")

    now = dt.utcnow()
    new_count = 0
    for o in orders:
        pid = o.get("payment_order_id", "")
        if not pid:
            continue
        existing = db.query(DeepSeekInvoice).filter(
            DeepSeekInvoice.payment_order_id == pid
        ).first()
        if existing:
            existing.status = o.get("payment_order_status", existing.status)
            if o.get("updated_at"):
                try:
                    existing.updated_at = dt.fromisoformat(o["updated_at"].replace("Z", "+00:00"))
                except: pass
            if o.get("paid_at"):
                try:
                    existing.paid_at = dt.fromisoformat(o["paid_at"].replace("Z", "+00:00")) if isinstance(o["paid_at"], str) else existing.paid_at
                except: pass
            existing.sync_at = now
        else:
            inv = DeepSeekInvoice(
                payment_order_id=pid,
                amount=int(o.get("amount", 0)),
                currency=o.get("currency", "CNY"),
                status=o.get("payment_order_status", "CREATED"),
                payment_method=o.get("payment_method", ""),
                inserted_at=dt.fromisoformat(o["inserted_at"].replace("Z", "+00:00")) if o.get("inserted_at") else None,
                paid_at=dt.fromisoformat(o["paid_at"].replace("Z", "+00:00")) if o.get("paid_at") else None,
                updated_at=dt.fromisoformat(o["updated_at"].replace("Z", "+00:00")) if o.get("updated_at") else None,
                sync_at=now,
            )
            db.add(inv)
            new_count += 1

    db.commit()
    return {"success": True, "message": f"同步完成，新增 {new_count} 条，更新 {len(orders) - new_count} 条"}
