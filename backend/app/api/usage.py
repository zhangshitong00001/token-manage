"""API路由 - Token消耗记录（Hermes agent内部调用）"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime

from app.database import get_db
from app.models import User, TokenUsage
from app.schemas import UsageRecord, UsageRecordResponse
from app.services.token_calc import calculate_cost

router = APIRouter(prefix="/api/usage", tags=["Token消耗"])


@router.post("/record", response_model=UsageRecordResponse)
def record_usage(data: UsageRecord, db: Session = Depends(get_db)):
    """记录Token消耗（供Hermes agent内部调用）
    - 自动计算应扣额度
    - 检查余额，扣减并写入记录
    - 通过request_id防重
    """
    # 幂等检查
    existing = db.query(TokenUsage).filter(TokenUsage.request_id == data.request_id).first()
    if existing:
        return UsageRecordResponse(
            success=True,
            balance_after=db.query(User).filter(User.id == data.user_id).first().token_balance,
            cost=existing.total_cost,
            message="重复请求，已跳过",
        )

    # 查用户
    user = db.query(User).filter(User.id == data.user_id, User.status == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在或已禁用")

    # 计算应扣Token
    cost = calculate_cost(data.input_tokens, data.output_tokens, db)
    if user.token_balance < cost:
        raise HTTPException(status_code=402, detail=f"余额不足，需{cost}，剩余{user.token_balance}")

    # 扣减余额
    user.token_balance -= cost

    # 写入记录
    usage = TokenUsage(
        user_id=data.user_id,
        agent_name=data.agent_name,
        input_tokens=data.input_tokens,
        output_tokens=data.output_tokens,
        total_cost=cost,
        request_id=data.request_id,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)

    return UsageRecordResponse(
        success=True,
        balance_after=user.token_balance,
        cost=cost,
        message="扣费成功",
    )


@router.get("/daily")
def get_daily_usage(
    user_id: int,
    usage_date: str,
    db: Session = Depends(get_db),
):
    """获取指定用户某日汇总（管理端用）"""
    try:
        dt = datetime.strptime(usage_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，请使用 YYYY-MM-DD")
    records = db.query(TokenUsage).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.usage_time >= dt,
        TokenUsage.usage_time < dt.replace(hour=23, minute=59, second=59),
    ).all()
    total_input = sum(r.input_tokens for r in records)
    total_output = sum(r.output_tokens for r in records)
    total_cost = sum(r.total_cost for r in records)
    return {
        "user_id": user_id,
        "date": usage_date,
        "total_input": total_input,
        "total_output": total_output,
        "total_cost": total_cost,
        "count": len(records),
    }
