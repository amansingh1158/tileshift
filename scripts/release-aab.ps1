# Builds the signed release AAB for Play Store upload.
# Prereqs:
#   1. Run scripts/gen-keystore.ps1 (or provide your own keystore)
#   2. Create android/keystore.properties (see android/app/build.gradle header)
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/release-aab.ps1
$ErrorActionPreference = 'Stop'

$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  .\gradlew.bat bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'bundleRelease failed' }
  $aab = Join-Path (Get-Location) 'app\build\outputs\bundle\release\app-release.aab'
  if (Test-Path $aab) {
    Write-Host "`nAAB ready: $aab"
    $info = Get-Item $aab
    Write-Host ("Size: {0:N2} MB" -f ($info.Length / 1MB))
  } else {
    Write-Host 'AAB not found. Check bundleRelease output.'
  }
} finally {
  Pop-Location
}