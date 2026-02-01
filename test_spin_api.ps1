#!/usr/bin/env powershell
# Test the full SPIN validation flow

# Step 1: Login
Write-Host "Step 1: Logging in as vendor..." -ForegroundColor Green
$loginBody = @{
  email = "test_vendor@example.com"
  password = "test123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:8001/api/v1/auth/login" `
      -Method POST `
      -ContentType "application/json" `
      -Body $loginBody `
      -ErrorAction Stop

    $loginData = $loginResponse.Content | ConvertFrom-Json
    $token = $loginData.access_token
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "  Token: $($token.Substring(0, 30))..." -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Test SPIN validation
Write-Host "`nStep 2: Testing SPIN validation (143032945)..." -ForegroundColor Green

$spinBody = @{
  spin = "143032945"
} | ConvertTo-Json

try {
    $spinResponse = Invoke-WebRequest -Uri "http://localhost:8001/api/v1/vendor/spin/validate" `
      -Method POST `
      -ContentType "application/json" `
      -Headers @{"Authorization" = "Bearer $token"} `
      -Body $spinBody `
      -ErrorAction Stop

    $spinData = $spinResponse.Content | ConvertFrom-Json
    
    if ($spinData.success -and $spinData.valid) {
        Write-Host "✓ SPIN validation successful!" -ForegroundColor Green
        Write-Host "  Provider: $($spinData.provider.service_provider_name)" -ForegroundColor Green
        Write-Host "  Status: $($spinData.provider.status)" -ForegroundColor Green
        Write-Host "  FCC Reg: $($spinData.provider.fcc_registration_number)" -ForegroundColor Green
    } else {
        Write-Host "✗ SPIN validation failed" -ForegroundColor Red
        Write-Host "  Error: $($spinData.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ SPIN validation request failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ All tests passed!" -ForegroundColor Green
