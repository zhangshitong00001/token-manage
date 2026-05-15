"""FastAPI 主入口"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.api import auth, user, usage, mobile, packages, orders, admin, log
from app.database import engine, Base
from app.middleware import RequestLogMiddleware
from app.models import User
from app.models.package import TokenPackage
from app.models.price_config import PriceConfig
from app.models.token_usage import TokenUsage
from app.models.order import RechargeOrder
from app.models.system_daily_usage import SystemDailyUsage
from app.core.security import hash_password

# 创建数据库表
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TokenManager API", version="1.0.0")

# CORS — 严格限制来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://120.77.10.212",
        "http://localhost:8000",
        "http://localhost:3001",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 全局请求日志中间件（记录所有API调用）
app.add_middleware(RequestLogMiddleware)

# 注册 API 路由（必须在静态文件之前）
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(usage.router)
app.include_router(mobile.router)
app.include_router(packages.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(log.router)


def mount_static(app, url_path: str, dir_path: Path, name: str):
    """挂载静态文件目录"""
    assets_dir = dir_path / "assets"
    if assets_dir.exists():
        app.mount(f"{url_path}/assets", StaticFiles(directory=str(assets_dir)), name=f"{name}_assets")


def serve_spa(dir_path: Path) -> FileResponse | None:
    """返回 SPA 的 index.html"""
    index = dir_path / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return None


# 项目根目录
ROOT = Path(__file__).parent.parent.parent

# 移动端 H5 前端
MOBILE_DIST = ROOT / "mobile" / "dist"
if MOBILE_DIST.exists():
    mount_static(app, "", MOBILE_DIST, "mobile")
    MOBILE_INDEX = MOBILE_DIST / "index.html"
else:
    MOBILE_INDEX = None

# 管理后台
ADMIN_DIST = ROOT / "admin" / "dist"
if ADMIN_DIST.exists():
    mount_static(app, "/admin", ADMIN_DIST, "admin")
    # 管理后台的 JS 也挂到 /assets/（前台引用的绝对路径）
    admin_assets = ADMIN_DIST / "assets"
    if admin_assets.exists():
        for f in admin_assets.iterdir():
            if f.is_file():
                src = str(f)
                dst = MOBILE_DIST / "assets" / f.name
                if not dst.exists():
                    import shutil
                    shutil.copy2(src, dst)
    ADMIN_INDEX = ADMIN_DIST / "index.html"
else:
    ADMIN_INDEX = None


@app.get("/")
def root():
    if MOBILE_INDEX and MOBILE_INDEX.exists():
        return FileResponse(str(MOBILE_INDEX))
    return {"name": "TokenManager API", "version": "1.0.0", "status": "running"}


# SPA 回退路由
@app.get("/admin/{full_path:path}")
def serve_admin(full_path: str):
    if ADMIN_INDEX and ADMIN_INDEX.exists():
        return FileResponse(str(ADMIN_INDEX))
    return JSONResponse({"detail": "Not Found"}, status_code=404)


@app.get("/{full_path:path}")
def serve_mobile(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if MOBILE_INDEX and MOBILE_INDEX.exists():
        return FileResponse(str(MOBILE_INDEX))
    return {"name": "TokenManager API", "version": "1.0.0", "status": "running"}


@app.on_event("startup")
def startup():
    """启动初始化"""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin").first()
        if admin:
            # 确保管理员的手机号是主人的
            if admin.phone != "13361883801":
                admin.phone = "13361883801"
                db.commit()
        else:
            import secrets
            temp_password = secrets.token_urlsafe(12)
            db.add(User(
                phone="13361883801",
                email="admin@tokenmanager.com",
                nickname="管理员",
                password_hash=hash_password(temp_password),
                token_balance=999999999,
                role="admin",
            ))
            db.commit()
            print(f"[启动] 管理员已创建，临时密码: {temp_password}（请立即修改）")
        if not db.query(PriceConfig).first():
            db.add(PriceConfig(input_price_per_k=0.0001, output_price_per_k=0.0004))
            db.commit()
        if db.query(TokenPackage).count() == 0:
            db.add_all([
                TokenPackage(name="10万 Token 体验包", token_amount=100_000, price_cent=100, sort_order=1),
                TokenPackage(name="100万 Token 基础包", token_amount=1_000_000, price_cent=500, sort_order=2),
                TokenPackage(name="1000万 Token 进阶包", token_amount=10_000_000, price_cent=3000, sort_order=3),
                TokenPackage(name="1亿 Token 企业包", token_amount=100_000_000, price_cent=20000, sort_order=4),
            ])
            db.commit()
    finally:
        db.close()
