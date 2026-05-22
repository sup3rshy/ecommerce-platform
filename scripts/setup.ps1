# Setup script cho Windows (PowerShell 7+)
# Tuong duong bootstrap.sh + reset.sh cua Bash.
#
# Cach chay:
#   pwsh scripts/setup.ps1          (PowerShell 7+)
#   powershell scripts/setup.ps1    (Windows PowerShell 5)
#
# Script nay:
#   1. Sinh secret va tao root .env + 3 app .env (idempotent)
#   2. docker compose up
#   3. Doi Keycloak ready
#   4. Push DB schema

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

function Gen-Secret {
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

# ========== 1. Sinh .env ==========
if (Test-Path ".env") {
    Write-Host "-> root .env da ton tai, skip." -ForegroundColor Yellow
} else {
    Write-Host "-> sinh secret + tao root .env..."
    $secrets = @{}
    foreach ($name in @(
        "POSTGRES_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD",
        "NEXTJS_APP_CLIENT_SECRET", "SELLER_WORKSPACE_CLIENT_SECRET",
        "SHOPPAY_CLIENT_SECRET", "BACKEND_ADMIN_CLIENT_SECRET",
        "MERCHANT_HMAC_SECRET"
    )) {
        $secrets[$name] = Gen-Secret
    }

    @"
POSTGRES_DB=keycloak
POSTGRES_USER=admin
POSTGRES_PASSWORD=$($secrets.POSTGRES_PASSWORD)

KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=$($secrets.KEYCLOAK_ADMIN_PASSWORD)

NEXTJS_APP_CLIENT_SECRET=$($secrets.NEXTJS_APP_CLIENT_SECRET)
SELLER_WORKSPACE_CLIENT_SECRET=$($secrets.SELLER_WORKSPACE_CLIENT_SECRET)
SHOPPAY_CLIENT_SECRET=$($secrets.SHOPPAY_CLIENT_SECRET)
BACKEND_ADMIN_CLIENT_SECRET=$($secrets.BACKEND_ADMIN_CLIENT_SECRET)

SMTP_PASSWORD=changeme-not-used-yet
MERCHANT_HMAC_SECRET=$($secrets.MERCHANT_HMAC_SECRET)

GOOGLE_IDP_CLIENT_ID=disabled
GOOGLE_IDP_CLIENT_SECRET=disabled
"@ | Set-Content ".env" -Encoding UTF8NoBOM
    Write-Host "  ok root .env" -ForegroundColor Green
}

# Doc lai root .env
$envVars = @{}
Get-Content ".env" | ForEach-Object {
    if ($_ -match "^([A-Z_]+)=(.+)$") {
        $envVars[$Matches[1]] = $Matches[2]
    }
}

function Write-AppEnv($app, $port, $db, $clientSecretKey, $clientId) {
    $target = "$app/.env"
    if (Test-Path $target) {
        Write-Host "-> $target da ton tai, skip." -ForegroundColor Yellow
        return
    }
    $naSecret = Gen-Secret
    $pgPass = $envVars["POSTGRES_PASSWORD"]
    $clientSecret = $envVars[$clientSecretKey]

    @"
DATABASE_URL=postgres://admin:${pgPass}@localhost:5432/$db

NEXTAUTH_URL=http://localhost:$port
NEXTAUTH_SECRET=$naSecret

KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=$clientId
KEYCLOAK_CLIENT_SECRET=$clientSecret
"@ | Set-Content $target -Encoding UTF8NoBOM
    Write-Host "  ok $target" -ForegroundColor Green
}

Write-AppEnv "web-app"          3000 "ecommerce"        "NEXTJS_APP_CLIENT_SECRET"      "nextjs-app"
Write-AppEnv "seller-workspace" 3100 "seller_workspace" "SELLER_WORKSPACE_CLIENT_SECRET" "seller-workspace"
Write-AppEnv "shoppay"          3200 "shoppay"          "SHOPPAY_CLIENT_SECRET"          "shoppay-app"

# Append extra vars
$hmac = $envVars["MERCHANT_HMAC_SECRET"]
$backendSecret = $envVars["BACKEND_ADMIN_CLIENT_SECRET"]

if (-not (Select-String -Path "web-app/.env" -Pattern "^MERCHANT_HMAC_SECRET=" -Quiet)) {
    "`nMERCHANT_HMAC_SECRET=$hmac`nSHOPPAY_BASE_URL=http://localhost:3200" | Add-Content "web-app/.env"
}
if (-not (Select-String -Path "shoppay/.env" -Pattern "^MERCHANT_HMAC_SECRET=" -Quiet)) {
    "`nMERCHANT_HMAC_SECRET=$hmac" | Add-Content "shoppay/.env"
}
if (-not (Select-String -Path "shoppay/.env" -Pattern "^KEYCLOAK_ADMIN_CLIENT_ID=" -Quiet)) {
    "`nKEYCLOAK_ADMIN_CLIENT_ID=backend-admin-client`nKEYCLOAK_ADMIN_CLIENT_SECRET=$backendSecret" | Add-Content "shoppay/.env"
}

# ========== 2. npm install ==========
Write-Host "`n-> npm install (root + 3 apps)..."
npm install

# ========== 3. Docker compose ==========
Write-Host "`n-> docker compose up..."
docker compose down 2>$null
# Lay ten project tu docker compose (khong hardcode)
$project = (docker compose config --format json 2>$null | ConvertFrom-Json).name
if (-not $project) { $project = (Split-Path (Get-Location) -Leaf).ToLower() -replace '[^a-z0-9-]','' }

foreach ($vol in @("${project}_postgres_keycloak_data", "${project}_postgres_app_data", "${project}_postgres_data")) {
    docker volume rm $vol 2>$null
}
docker compose up -d

# ========== 4. Doi Keycloak ==========
Write-Host "-> doi Keycloak ready..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 3
}
if (-not $ready) { Write-Error "Keycloak khong ready sau 3 phut!"; exit 1 }
Write-Host "  ok Keycloak ready" -ForegroundColor Green

# ========== 5. Push schema ==========
Write-Host "-> push DB schema..."
Push-Location web-app;          npx drizzle-kit push; Pop-Location
Push-Location seller-workspace; npm run db:push;      Pop-Location
Push-Location shoppay;          npm run db:push;      Pop-Location

# ========== 6. Seed ==========
Write-Host "-> seed sample data..."
Push-Location web-app; try { npx tsx db/seed.ts } catch { Write-Host "  (seed skip)" }; Pop-Location

Write-Host "`nDone! Chay 'npm run dev' roi truy cap:" -ForegroundColor Green
Write-Host "  http://localhost:3000  (web-app)"
Write-Host "  http://localhost:3100  (seller-workspace)"
Write-Host "  http://localhost:3200  (shoppay)"
Write-Host "  http://localhost:8080  (keycloak)"
