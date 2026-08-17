# Generates a release signing keystore and prints the values to paste into
# android/keystore.properties. KEEP the keystore safe and offline — it is the
# only way to publish updates to this app.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/gen-keystore.ps1
$ErrorActionPreference = 'Stop'

$alias = '2048'
$store = Join-Path $PSScriptRoot '..\release.keystore'

if (Test-Path $store) {
  Write-Host "Keystore already exists: $store"
} else {
  $pass = Read-Host -AsSecureString 'Choose a keystore password'
  $passText = [System.Net.NetworkCredential]::new('', $pass).Password
  if ([string]::IsNullOrEmpty($passText)) { throw 'Password required.' }

  $java = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\keytool.exe'
  & $java -genkeypair -v `
    -keystore $store `
    -alias $alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $passText -keypass $passText `
    -dname "CN=2048 Puzzle, OU=Mobile, O=YourName, L=City, ST=State, C=IN"
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }

  Write-Host ''
  Write-Host 'Created release.keystore. Now create android/keystore.properties:'
  Write-Host '-----------------------------------------------'
  Write-Host "storeFile=../release.keystore"
  Write-Host "storePassword=$passText"
  Write-Host "keyAlias=$alias"
  Write-Host "keyPassword=$passText"
  Write-Host '-----------------------------------------------'
  Write-Host 'Then run scripts/release-aab.ps1'
}