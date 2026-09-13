@echo off
chcp 65001 >nul
setlocal
set "GAME_ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "GAME_ARCH=arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "GAME_ARCH=arm64"
"%~dp0runtime\win-%GAME_ARCH%\node.exe" "%~dp0game\launcher.mjs" %*
if errorlevel 1 pause
