"""应用配置"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库
    DATABASE_URL: str = "postgresql+psycopg2://zhangshitong:123456@localhost:5432/tokenmanager"

    # JWT
    SECRET_KEY: str = "tokenmanager-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天（用户端）

    # Redis
    REDIS_URL: str = "redis://:qq981997@localhost:6379/1"

    # 支付（测试环境）
    WECHAT_APP_ID: str = ""
    WECHAT_MCH_ID: str = ""
    WECHAT_API_KEY: str = ""
    WECHAT_NOTIFY_URL: str = "https://your-domain.com/api/order/callback/wechat"

    ALIPAY_APP_ID: str = ""
    ALIPAY_PRIVATE_KEY: str = ""
    ALIPAY_PUBLIC_KEY: str = ""
    ALIPAY_NOTIFY_URL: str = "https://your-domain.com/api/order/callback/alipay"

    # Token 单价（默认值，可通过管理后台修改）
    DEFAULT_INPUT_PRICE_PER_K: float = 0.0001  # 每千输入token 0.0001元
    DEFAULT_OUTPUT_PRICE_PER_K: float = 0.0004  # 每千输出token 0.0004元

    # 邮箱 - 用于管理员登录验证码
    SMTP_HOST: str = "smtp.163.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = "zst_9609_4557@163.com"
    SMTP_PASSWORD: str = ""
    MAIL_AUTH_CODE: str = ""  # SMTP 授权码，在 .env 中设置
    ADMIN_EMAIL: str = "zst_9609_4557@163.com"  # 唯一允许登录的邮箱

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
