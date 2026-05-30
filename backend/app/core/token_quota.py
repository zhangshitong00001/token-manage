"""
Token 配额管理 - 用户隔离核心

提供：
1. check_balance() - 调用接口前检查余额
2. deduct_balance() - 调用后扣减余额
3. add_balance() - 充值后增加余额

定价模型：
- PriceConfig 存储 input_price_per_k / output_price_per_k（元/千token）
- TOKENS_PER_YUAN: 1元可兑换的内部 token 数
- 用户调用后扣除的 token 数 = (实际消耗的金额) × TOKENS_PER_YUAN
"""
import time
import uuid
import logging
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.user import User
from app.models.price_config import PriceConfig
from app.models.token_usage import TokenUsage

logger = logging.getLogger(__name__)

# 1 元可兑换的内部 token 数
TOKENS_PER_YUAN = 10000  # ¥1 = 10,000 tokens


def get_price_config(db: Session) -> tuple[float, float]:
    """获取当前价格配置（元/千token）"""
    config = db.query(PriceConfig).first()
    if not config:
        return 0.0001, 0.0004  # 默认值
    return config.input_price_per_k, config.output_price_per_k


def calc_cost_yuan(
    input_tokens: int,
    output_tokens: int,
    input_price_per_k: float,
    output_price_per_k: float,
) -> float:
    """计算实际消耗金额（元）"""
    input_cost = (input_tokens / 1000.0) * input_price_per_k
    output_cost = (output_tokens / 1000.0) * output_price_per_k
    return input_cost + output_cost


def calc_internal_tokens(input_tokens: int, output_tokens: int, db: Session = None) -> int:
    """根据消耗的 input/output token 计算应扣除的内部 token 数"""
    inp_price, out_price = get_price_config(db)
    cost_yuan = calc_cost_yuan(input_tokens, output_tokens, inp_price, out_price)
    return max(1, round(cost_yuan * TOKENS_PER_YUAN))


def check_balance(user_id: int, db: Session, min_tokens: int = 1) -> tuple[bool, int]:
    """
    检查用户余额是否足够
    返回: (是否足够, 当前余额)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False, 0
    return user.token_balance >= min_tokens, user.token_balance or 0


def deduct_balance(
    user_id: int,
    input_tokens: int,
    output_tokens: int,
    db: Session,
    agent_name: str = "hermes",
    request_id: str = "",
) -> dict:
    """
    按实际消耗扣除用户 token_balance
    参数:
        input_tokens: 本次消耗的输入 token 数
        output_tokens: 本次消耗的输出 token 数
        db: 数据库会话
        agent_name: 来源标识
        request_id: 请求幂等键（避免重复扣除）
    返回: {success, internal_tokens, cost_yuan, balance_before, balance_after, request_id}
    """
    if not request_id:
        request_id = f"quota_{user_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

    # 检查是否已扣除过（幂等）
    existing = db.query(TokenUsage).filter(TokenUsage.request_id == request_id).first()
    if existing:
        return {
            "success": True,
            "already_deducted": True,
            "internal_tokens": existing.total_cost,
            "request_id": request_id,
        }

    # 计算价格
    inp_price, out_price = get_price_config(db)
    cost_yuan = calc_cost_yuan(input_tokens, output_tokens, inp_price, out_price)
    internal_tokens = max(1, round(cost_yuan * TOKENS_PER_YUAN))

    # 查用户
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"success": False, "error": "用户不存在"}

    balance_before = user.token_balance or 0
    # 如果余额不够，能扣多少扣多少，扣到0为止
    actual_deduct = min(internal_tokens, balance_before)
    user.token_balance = balance_before - actual_deduct

    # 记录 TokenUsage
    usage = TokenUsage(
        user_id=user_id,
        agent_name=agent_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_cost=actual_deduct,  # 实际扣除的内部 token 数
        usage_time=__import__("datetime").datetime.now(),
        request_id=request_id,
    )
    db.add(usage)
    db.commit()

    logger.info(
        f"[Quota] user={user_id} deducted={actual_deduct} "
        f"balance={balance_before}→{user.token_balance} "
        f"input={input_tokens} output={output_tokens} request={request_id}"
    )

    return {
        "success": True,
        "internal_tokens": actual_deduct,
        "cost_yuan": round(cost_yuan, 6),
        "balance_before": balance_before,
        "balance_after": user.token_balance,
        "request_id": request_id,
    }


def add_tokens_from_recharge(
    user_id: int,
    amount_yuan: float,
    db: Session,
    remark: str = "",
) -> dict:
    """
    用户充值后，按 TOKENS_PER_YUAN 比例增加 token_balance
    参数:
        amount_yuan: 充值金额（元）
    返回: {success, added_tokens, balance_before, balance_after}
    """
    added_tokens = round(amount_yuan * TOKENS_PER_YUAN)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"success": False, "error": "用户不存在"}

    balance_before = user.token_balance or 0
    user.token_balance = balance_before + added_tokens
    db.commit()

    logger.info(
        f"[Recharge] user={user_id} added={added_tokens} "
        f"(¥{amount_yuan}) balance={balance_before}→{user.token_balance}"
    )

    return {
        "success": True,
        "added_tokens": added_tokens,
        "amount_yuan": amount_yuan,
        "balance_before": balance_before,
        "balance_after": user.token_balance,
    }
