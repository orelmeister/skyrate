# syntax=docker/dockerfile:1.6
# Backend: FastAPI on Python 3.11
# Multi-stage isn't useful here (pure-Python deps); single stage with
# layer ordering so requirements.txt is its own cache layer.
FROM python:3.11.8-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps needed by reportlab, pillow, pandas, mysqlclient, etc.
# Combine in a single RUN to keep the layer small; clean apt lists.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libffi-dev \
        libssl-dev \
        libjpeg-dev \
        zlib1g-dev \
        libfreetype6-dev \
        default-libmysqlclient-dev \
        pkg-config \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependency layer (cached unless requirements.txt changes) ---
COPY requirements.txt ./
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt

# --- App layer (re-runs only when source changes) ---
COPY . .

EXPOSE 8000

# DO App Platform overrides this with `run_command` from the spec,
# but a sane default helps `docker run` work locally.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
