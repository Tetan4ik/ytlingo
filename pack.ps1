$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$name = "ytlingo-v$version"

$include = @(
    "manifest.json",
    "background.js",
    "page_script.js",
    "content.js",
    "content.css",
    "inject.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "README.md",
    "LICENSE"
)

$dist = Join-Path $root "dist"
$staging = Join-Path $dist $name
$zipPath = Join-Path $dist "$name.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

foreach ($file in $include) {
    $src = Join-Path $root $file
    if (-not (Test-Path $src)) {
        Write-Warning "Skip missing: $file"
        continue
    }
    Copy-Item $src (Join-Path $staging $file)
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

Write-Host "Created: $zipPath"
