"""应用配置"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库（从 .env 读取，代码里不留明文）
    DATABASE_URL: str = "postgresql+psycopg2://zhangshitong:123456@localhost:5432/tokenmanager"

    # JWT
    SECRET_KEY: str = "tokenmanager-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1天（原7天，缩短降低泄露风险）

    # Redis
    REDIS_URL: str = "redis://:qq981997@localhost:6379/1"

    # 支付（测试环境留空）
    WECHAT_APP_ID: str = ""
    WECHAT_MCH_ID: str = ""
    WECHAT_API_KEY: str = ""
    WECHAT_NOTIFY_URL: str = "https://your-domain.com/api/order/callback/wechat"
    ALIPAY_APP_ID: str = ""
    ALIPAY_PRIVATE_KEY: str = ""
    ALIPAY_PUBLIC_KEY: str = ""
    ALIPAY_NOTIFY_URL: str = "https://your-domain.com/api/order/callback/alipay"

    # Token 单价
    DEFAULT_INPUT_PRICE_PER_K: float = 0.0001
    DEFAULT_OUTPUT_PRICE_PER_K: float = 0.0004

    # 邮箱
    SMTP_HOST: str = "smtp.163.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = "zst_9609_4557@163.com"
    SMTP_PASSWORD: str = ""
    MAIL_AUTH_CODE: str = ""
    ADMIN_EMAIL: str = "zst_9609_4557@163.com"

    # 安全（从 .env 读取）
    JWT_SECRET_KEY: str = ""   # 替换 SECRET_KEY，自动生成强密钥

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # 通过别名支持新旧变量名
        fields = {
            "SECRET_KEY": {"env": ["SECRET_KEY", "JWT_SECRET_KEY"]},
            "REDIS_URL": {"env": ["REDIS_URL", "REDIS_PASSWORD"]},
            "DATABASE_URL": {"env": ["DATABASE_URL", "DB_PASSWORD"]},
        }


settings = Settings()

# 如果设置了 JWT_SECRET_KEY 则优先使用
if settings.JWT_SECRET_KEY:
    settings.SECRET_KEY = settings.JWT_SECRET_KEY

# Token 有效期（秒）
TOKEN_EXPIRE_SECONDS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
