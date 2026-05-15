"""初始化种子数据"""
import os
from app.database import SessionLocal
from app.models import User
from app.models.package import TokenPackage
from app.models.price_config import PriceConfig
from app.core.security import hash_password

db = SessionLocal()

admin = db.query(User).filter(User.role == 'admin').first()
if not admin:
    # 管理员初始密码从环境变量读取，若无则强制为空（不允许登录）
    default_pwd = os.environ.get("ADMIN_INIT_PASSWORD", "")
    if not default_pwd:
        print("⚠️  未设置 ADMIN_INIT_PASSWORD 环境变量，管理员初始密码为空！")
    admin = User(
        phone='13800000000',
        email='admin@tokenmanager.com',
        nickname='管理员',
        password_hash=hash_password(default_pwd) if default_pwd else "",
        token_balance=999999999,
        role='admin',
    )
    db.add(admin)

if db.query(TokenPackage).count() == 0:
    db.add_all([
        TokenPackage(name='10万 Token 体验包', token_amount=100_000, price_cent=100, sort_order=1),
        TokenPackage(name='100万 Token 基础包', token_amount=1_000_000, price_cent=500, sort_order=2),
        TokenPackage(name='1000万 Token 进阶包', token_amount=10_000_000, price_cent=3000, sort_order=3),
        TokenPackage(name='1亿 Token 企业包', token_amount=100_000_000, price_cent=20000, sort_order=4),
    ])

if not db.query(PriceConfig).first():
    db.add(PriceConfig(input_price_per_k=0.0001, output_price_per_k=0.0004))

db.commit()
db.close()
print('✅ 初始化数据完成')
