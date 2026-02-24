$ErrorActionPreference = 'Stop'

function Has-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "[bootstrap] Starting dependency install..."

if (-not (Has-Command winget)) {
  Write-Host "[bootstrap] winget not found. Please install 'App Installer' from Microsoft Store (winget) and re-run." 
  exit 2
}

# Python (prefer 3.12 if available; winget id may vary by machine)
$pythonOk = (Has-Command python) -or (Has-Command py)
if ($pythonOk) {
  try {
    python --version | Out-Host
  } catch {
    try { py -3 --version | Out-Host } catch {}
  }
  Write-Host "[bootstrap] Python already exists. Skip."
} else {
  Write-Host "[bootstrap] Installing Python..."
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
}

# ffmpeg
$ffmpegOk = Has-Command ffmpeg
if ($ffmpegOk) {
  ffmpeg -version | Select-Object -First 1 | Out-Host
  Write-Host "[bootstrap] ffmpeg already exists. Skip."
} else {
  Write-Host "[bootstrap] Installing ffmpeg..."
  # One common winget package id
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
}

Write-Host "[bootstrap] Done. You may need to restart the app." 
exit 0
