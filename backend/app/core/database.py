"""
Database Configuration
SQLAlchemy setup - supports SQLite (dev), PostgreSQL (prod), and MySQL (Bluehost)
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from .config import settings

# Determine database type
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
is_mysql = settings.DATABASE_URL.startswith("mysql")

# Create engine with appropriate settings
if is_sqlite:
    # SQLite-specific settings (local development)
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},  # Required for SQLite
        echo=settings.DEBUG
    )
elif is_mysql:
    # MySQL settings (Bluehost production)
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,  # Recycle connections after 1 hour (important for MySQL)
        echo=settings.DEBUG
    )
else:
    # PostgreSQL settings
    engine = create_engine(
        settings.DATABASE_URL,
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
