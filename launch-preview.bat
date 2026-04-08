@echo off
set "PREVIEW_FILE=%~dp0preview\dashboard-preview.html"

if not exist "%PREVIEW_FILE%" (
  echo Preview file not found:
  echo %PREVIEW_FILE%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process explorer.exe -ArgumentList @('""%PREVIEW_FILE%""')"

if errorlevel 1 (
  echo Could not open the preview automatically.
  echo Open this file manually in your browser:
  echo %PREVIEW_FILE%
  pause
  exit /b 1
)
