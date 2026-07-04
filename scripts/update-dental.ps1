param(
    [ValidateSet("full", "prebuilt")]
    [string]$Mode = "full"
)

$owner       = "simonmanna"
$repo        = "DENTAL-CLINIC"
$projectDir  = "C:\dental-project"        # ← EDIT THIS to the actual client path
$pm2Name     = "DentalAPI"
$nginx       = "C:\Program Files\nginx\nginx.exe"
$versionFile = "$projectDir\.version"

function Restart-Services {
    Write-Host "Restarting services..."
    pm2 restart $pm2Name
    if ($LASTEXITCODE -ne 0) { throw "pm2 restart $pm2Name failed" }
    Start-Sleep 3
    & $nginx -s reload
    if ($LASTEXITCODE -ne 0) { Write-Host "WARN: nginx reload returned $LASTEXITCODE" }
}

function Save-Version {
    $tag = git describe --tags --abbrev=0 2>$null
    if ($tag) { $tag | Out-File $versionFile -Encoding UTF8 }
}

# === PREBUILT MODE: download pre-built artifact from GitHub Release ===
if ($Mode -eq "prebuilt") {
    Write-Host "Fetching latest release..."
    $release = Invoke-RestMethod "https://api.github.com/repos/$owner/$repo/releases/latest"
    $tag = $release.tag_name
    $zipUrl = ($release.assets | Where-Object { $_.name -eq "dental-app.zip" }).browser_download_url

    if ((Test-Path $versionFile) -and ((Get-Content $versionFile) -eq $tag)) {
        Write-Host "Already on $tag — nothing to do"; exit 0
    }

    Invoke-WebRequest $zipUrl -OutFile "$env:TEMP\dental-app.zip"
    Remove-Item "$projectDir\backend\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$projectDir\frontend\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive "$env:TEMP\dental-app.zip" -DestinationPath $projectDir -Force
    & $nginx -s reload
    pm2 restart $pm2Name
    $tag | Out-File $versionFile -Encoding UTF8
    Write-Host "App updated to $tag"
    exit 0
}

# === FULL UPDATE ===
Write-Host "=== Dental Clinic Full Update ==="
Set-Location $projectDir

Write-Host "1/6 git pull..."
git pull origin main

Write-Host "2/6 npm install backend..."
Set-Location "$projectDir\backend"
npm ci

Write-Host "3/6 prisma generate + deploy..."
npx prisma generate
npx prisma db:deploy

Write-Host "4/6 build backend..."
npm run build

Write-Host "5/6 npm install + build frontend..."
Set-Location "$projectDir\frontend"
npm ci
npm run build

Write-Host "6/6 restart services..."
Restart-Services
Save-Version

Write-Host "=== Update complete ==="
