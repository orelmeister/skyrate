#!/bin/bash
# Build script for SkyRate AI V2 Backend
# This script prepares the build context with all required files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENDATA_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

echo "🔧 SkyRate AI V2 - Backend Build Script"
echo "========================================"
echo "Project root: $PROJECT_ROOT"
echo "OpenData root: $OPENDATA_ROOT"

# Create build context directory
BUILD_DIR="$PROJECT_ROOT/backend/.build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "📦 Copying application files..."

# Copy main application
cp -r "$PROJECT_ROOT/backend/app" "$BUILD_DIR/"
cp "$PROJECT_ROOT/backend/requirements.txt" "$BUILD_DIR/"
cp "$PROJECT_ROOT/backend/Dockerfile" "$BUILD_DIR/"

# Copy utils from skyrate-ai
echo "📁 Copying utils from skyrate-ai..."
if [ -d "$OPENDATA_ROOT/skyrate-ai/utils" ]; then
    cp -r "$OPENDATA_ROOT/skyrate-ai/utils" "$BUILD_DIR/"
else
    echo "⚠️  Warning: skyrate-ai/utils not found, creating empty directory"
    mkdir -p "$BUILD_DIR/utils"
fi

# Copy legacy modules from opendata root
echo "📁 Copying legacy modules..."
for module in get_ben_funding_balance.py usac_data_fetcher.py llm_analyzer.py; do
    if [ -f "$OPENDATA_ROOT/$module" ]; then
        cp "$OPENDATA_ROOT/$module" "$BUILD_DIR/"
        echo "   ✓ Copied $module"
    else
        echo "   ⚠️  Warning: $module not found"
        touch "$BUILD_DIR/$module"  # Create empty file to prevent Docker COPY failure
    fi
done

echo ""
echo "🐳 Building Docker image..."
cd "$BUILD_DIR"
docker build -t skyrate-backend:latest .

echo ""
echo "✅ Build complete!"
echo ""
echo "To run locally:"
echo "  docker run -p 8000:8000 --env-file .env skyrate-backend:latest"
echo ""
echo "To push to registry:"
echo "  docker tag skyrate-backend:latest registry.digitalocean.com/skyrate/backend:latest"
echo "  docker push registry.digitalocean.com/skyrate/backend:latest"
