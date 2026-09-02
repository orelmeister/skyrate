"""
Database Configuration
SQLAlchemy setup - supports SQLite (dev), PostgreSQL (prod), and MySQL (Bluehost)
"""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from .config import settings

logger = logging.getLogger(__name__)

# Get DATABASE_URL with defensive fallback
_db_url = settings.DATABASE_URL
if not _db_url or not _db_url.strip():
    # Last-resort fallback: check os.environ directly
    _db_url = os.environ.get("DATABASE_URL", "").strip()
    if _db_url:
        logger.warning(f"DATABASE_URL empty in settings but found in os.environ (len={len(_db_url)})")
    else:
        _db_url = "sqlite:///./skyrate.db"
        logger.error("DATABASE_URL is empty in both settings and os.environ! Falling back to SQLite.")

# Determine database type
is_sqlite = _db_url.startswith("sqlite")
is_mysql = _db_url.startswith("mysql")

# Create engine with appropriate settings
if is_sqlite:
    # SQLite-specific settings (local development)
    engine = create_engine(
        _db_url,
        connect_args={"check_same_thread": False},  # Required for SQLite
        echo=settings.DEBUG
    )
elif is_mysql:
    # MySQL settings (shared Hostinger MySQL has a low max_user_connections cap,
    # so keep the per-process peak small and env-tunable. The scheduler worker
    # shares this DB user, so set DB_POOL_SIZE=1/DB_MAX_OVERFLOW=2 on that
    # component to keep web + worker under the cap).
    _pool_size = int(os.environ.get("DB_POOL_SIZE", "5"))
    _max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "5"))
    engine = create_engine(
        _db_url,
        pool_pre_ping=True,
        pool_size=_pool_size,
        max_overflow=_max_overflow,
        pool_recycle=1800,   # recycle < MySQL wait_timeout to drop stale connections
        pool_timeout=30,     # wait for a pooled connection instead of erroring
        pool_use_lifo=True,  # reuse warm connections, minimizing simultaneous opens
        connect_args={"connect_timeout": 10},  # 10s connection timeout
        echo=settings.DEBUG
    )
else:
    # PostgreSQL settings
    engine = create_engine(
        _db_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        echo=settings.DEBUG
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Automatically closes session after request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    from ..models import user, subscription, consultant, vendor, application
    Base.metadata.create_all(bind=engine)
