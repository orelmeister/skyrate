"""
Denial Hunter DB engine helper.

The denial-hunter worker (separate DigitalOcean app) writes its scrape
results to a Hostinger MySQL database (u892988798_mail_skyrate). This
module provides a cached SQLAlchemy engine + session factory pointed at
that DB, completely separate from skyrate.ai's primary Bluehost MySQL
engine.

Tables consumed (read-only here): denial_leads, denial_scan_runs.

If the DENIAL_HUNTER_MYSQL_* env vars are not configured the helpers
return None / raise a 503 so the rest of the app keeps booting.
"""

from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


_dh_engine: Optional[Engine] = None
_DHSession: Optional[sessionmaker] = None


def _build_engine() -> Optional[Engine]:
    host = os.environ.get("DENIAL_HUNTER_MYSQL_HOST")
    user = os.environ.get("DENIAL_HUNTER_MYSQL_USER")
    password = os.environ.get("DENIAL_HUNTER_MYSQL_PASSWORD")
    name = os.environ.get("DENIAL_HUNTER_MYSQL_DATABASE")
    port = os.environ.get("DENIAL_HUNTER_MYSQL_PORT", "3306")

    if not all([host, user, password, name]):
        return None

    url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=2,
        max_overflow=2,
    )


def get_dh_engine() -> Optional[Engine]:
    """Return the cached Hostinger engine, or None if not configured."""
    global _dh_engine, _DHSession
    if _dh_engine is not None:
        return _dh_engine
    _dh_engine = _build_engine()
    if _dh_engine is not None:
        _DHSession = sessionmaker(bind=_dh_engine, autoflush=False, autocommit=False)
    return _dh_engine


def get_dh_session() -> Optional[Session]:
    """Open a new Session against the Denial Hunter DB, or None."""
    if get_dh_engine() is None:
        return None
    assert _DHSession is not None
    return _DHSession()


def is_configured() -> bool:
    return get_dh_engine() is not None
