from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from datetime import datetime

from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


class CreditBalanceRow(Base):
    __tablename__ = "CreditBalance"

    userId: Mapped[str] = mapped_column(primary_key=True)
    available: Mapped[int]
    reserved: Mapped[int]
    spent: Mapped[int]
    refunded: Mapped[int]
    expired: Mapped[int]


class LlmConfigRow(Base):
    __tablename__ = "LlmConfig"

    id: Mapped[str] = mapped_column(primary_key=True)
    userId: Mapped[str]
    name: Mapped[str]
    baseUrl: Mapped[str]
    model: Mapped[str]
    encryptedApiKey: Mapped[str]


class SessionRenderRow(Base):
    __tablename__ = "SessionRender"

    id: Mapped[str] = mapped_column(primary_key=True)
    backendJobId: Mapped[str | None]
    target: Mapped[str]
    pinned: Mapped[bool]
    artifactAvailable: Mapped[bool]
    videoUrl: Mapped[str | None]
    thumbnailUrl: Mapped[str | None]
    artifactExpiresAt: Mapped[datetime | None]
    createdAt: Mapped[datetime]


_engine = None


def get_engine():
    global _engine
    settings = get_settings()
    if not settings.database_url:
        return None
    if _engine is None:
        _engine = create_engine(settings.database_url, pool_pre_ping=True)
    return _engine


@contextmanager
def session_scope() -> Iterator[Session | None]:
    engine = get_engine()
    if engine is None:
        yield None
        return
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
