# Build script for SkyRate AI V2 Backend (PowerShell)
# This script prepares the build context with all required files

param(
    [switch]$NoBuild,
    [switch]$Push,
    [string]$Registry = "registry.digitalocean.com/skyrate"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$OpenDataRoot = Split-Path -Parent $ProjectRoot

Write-Host "🔧 SkyRate AI V2 - Backend Build Script" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host "Project root: $ProjectRoot"
Write-Host "OpenData root: $OpenDataRoot"

# Create build context directory
$BuildDir = Join-Path $ScriptDir "backend\.build"
if (Test-Path $BuildDir) {
    Remove-Item -Recurse -Force $BuildDir
}
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

Write-Host "`n📦 Copying application files..." -ForegroundColor Yellow

# Copy main application
Copy-Item -Path "$ScriptDir\backend\app" -Destination "$BuildDir\app" -Recurse
Copy-Item -Path "$ScriptDir\backend\requirements.txt" -Destination "$BuildDir\"
Copy-Item -Path "$ScriptDir\backend\Dockerfile" -Destination "$BuildDir\"

# Copy utils from skyrate-ai
Write-Host "📁 Copying utils from skyrate-ai..." -ForegroundColor Yellow
$UtilsPath = Join-Path $OpenDataRoot "skyrate-ai\utils"
if (Test-Path $UtilsPath) {
    Copy-Item -Path $UtilsPath -Destination "$BuildDir\utils" -Recurse
    Write-Host "   ✓ Copied utils/" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Warning: skyrate-ai/utils not found, creating empty directory" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "$BuildDir\utils" -Force | Out-Null
}

# Copy legacy modules from opendata root
Write-Host "📁 Copying legacy modules..." -ForegroundColor Yellow
$modules = @("get_ben_funding_balance.py", "usac_data_fetcher.py", "llm_analyzer.py")
foreach ($module in $modules) {
    $modulePath = Join-Path $OpenDataRoot $module
    if (Test-Path $modulePath) {
        Copy-Item -Path $modulePath -Destination "$BuildDir\"
        Write-Host "   ✓ Copied $module" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Warning: $module not found, creating placeholder" -ForegroundColor Yellow
        New-Item -ItemType File -Path "$BuildDir\$module" -Force | Out-Null
    }
}

if (-not $NoBuild) {
    Write-Host "`n🐳 Building Docker image..." -ForegroundColor Yellow
    Push-Location $BuildDir
    try {
        docker build -t skyrate-backend:latest .
        if ($LASTEXITCODE -ne 0) {
            throw "Docker build failed"
        }
    } finally {
        Pop-Location
    }
    Write-Host "`n✅ Build complete!" -ForegroundColor Green
}

if ($Push) {
    Write-Host "`n📤 Pushing to registry..." -ForegroundColor Yellow
    docker tag skyrate-backend:latest "$Registry/backend:latest"
    docker push "$Registry/backend:latest"
    Write-Host "✅ Pushed to $Registry/backend:latest" -ForegroundColor Green
}

Write-Host "`n" -NoNewline
Write-Host "To run locally:" -ForegroundColor Cyan
Write-Host "  docker run -p 8000:8000 --env-file .env skyrate-backend:latest"
Write-Host ""
Write-Host "To push to registry:" -ForegroundColor Cyan
Write-Host "  docker tag skyrate-backend:latest $Registry/backend:latest"
Write-Host "  docker push $Registry/backend:latest"
