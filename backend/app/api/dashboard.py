"""Дашборды кабинета координатора (T-66): тонкие обёртки над services/dashboard.py."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas import DashboardAnalytics, DashboardToday
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/today", response_model=DashboardToday)
def today(session: Session = Depends(get_session)) -> DashboardToday:
    """Что требует внимания сегодня: собеседования, новые анкеты, допуск, отклики, нехватка людей."""
    return dashboard.today(session, dashboard.local_now())


@router.get("/analytics", response_model=DashboardAnalytics)
def analytics(session: Session = Depends(get_session)) -> DashboardAnalytics:
    """Воронка волонтёров, спрос и предложение по времени и регионам, активность за 12 недель."""
    return dashboard.analytics(session, dashboard.local_now())
