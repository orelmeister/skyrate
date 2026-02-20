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
    # MySQL settings (Bluehost production)
    engine = create_engine(
        _db_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,  # Recycle connections after 1 hour (important for MySQL)
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
