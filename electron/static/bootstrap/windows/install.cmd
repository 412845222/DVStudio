@echo off
setlocal

REM Wrapper to run PowerShell script with ExecutionPolicy bypass
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"

endlocal
