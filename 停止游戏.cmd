@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\development\Stop.ps1"
if errorlevel 1 pause
