@echo off
REM DVStudio CLI entry (Windows .cmd wrapper -> calls PowerShell script).
REM This wrapper lets other processes invoke "dvs-cli" without typing "node ...",
REM and does NOT require Node.js installed (pure HTTP client via PowerShell).
REM
REM Works both:
REM   - In DVStudio repo (dev:electron, the script resolves build\bin\dvs-cli.ps1 relative to this .cmd)
REM   - In packaged install directory (this .cmd and dvs-cli.ps1 live side-by-side in <InstallDir>\bin)
setlocal

set "SCRIPT_DIR=%~dp0"

REM Case A: we live in repo root (build\bin\dvs-cli.ps1 exists relative to SCRIPT_DIR)
set "PS1_A=%SCRIPT_DIR%build\bin\dvs-cli.ps1"

REM Case B: packaged layout (<InstallDir>\bin\dvs-cli.cmd + <InstallDir>\bin\dvs-cli.ps1)
set "PS1_B=%SCRIPT_DIR%dvs-cli.ps1"

set "PS_FILE="
if exist "%PS1_B%" (
  set "PS_FILE=%PS1_B%"
) else if exist "%PS1_A%" (
  set "PS_FILE=%PS1_A%"
)

if "%PS_FILE%"=="" (
  echo [dvs-cli] ERROR: cannot locate dvs-cli.ps1.
  echo   Tried: "%PS1_B%"
  echo   Tried: "%PS1_A%"
  exit /B 91
)

REM Call PowerShell with Bypass execution policy (this script is local + signed-ish via origin).
REM -NoProfile prevents slow/broken user profiles from interfering.
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%PS_FILE%" %*
exit /B %ERRORLEVEL%
