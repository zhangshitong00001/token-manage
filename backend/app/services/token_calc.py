"""Token计价服务"""
from sqlalchemy.orm import Session
from app.models.price_config import PriceConfig


def get_token_price(db: Session) -> tuple:
    """获取当前每千token价格（输入/输出），返回（元/千token）"""
    config = db.query(PriceConfig).first()
    if config is None:
        # 默认价格
        return 0.0001, 0.0004
    return config.input_price_per_k, config.output_price_per_k


def calculate_cost(input_tokens: int, output_tokens: int, db: Session) -> int:
    """
    计算消耗的Token数（个）
    使用配置中的价格比例计算
    """
    input_price, output_price = get_token_price(db)
    base_rate = 0.0001  # 每千token 0.0001元作为基准价
    input_cost = int((input_tokens / 1000) * (input_price / base_rate) * 1000)
    output_cost = int((output_tokens / 1000) * (output_price / base_rate) * 1000)
    return input_cost + output_cost
