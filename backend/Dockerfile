FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy utils directory (created by build script or CI/CD)
COPY utils/ ./utils/

# Copy legacy modules (created by build script or CI/CD)
COPY get_ben_funding_balance.py ./get_ben_funding_balance.py
COPY usac_data_fetcher.py ./usac_data_fetcher.py
COPY llm_analyzer.py ./llm_analyzer.py

# Create data directory
RUN mkdir -p ./data

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
