"""API路由 - 套餐"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.package import TokenPackage
from app.schemas import PackageOut

router = APIRouter(prefix="/api/packages", tags=["套餐"])


@router.get("", response_model=List[PackageOut])
def list_packages(db: Session = Depends(get_db)):
    """获取可用套餐列表"""
    return db.query(TokenPackage).filter(TokenPackage.is_active == 1).order_by(TokenPackage.sort_order).all()
