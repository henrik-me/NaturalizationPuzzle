@echo off
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0servers.ps1" status %*
