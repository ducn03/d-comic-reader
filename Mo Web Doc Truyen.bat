@echo off
title MangaFlow - Web Doc Truyen Tranh
color 0A
chcp 65001 >nul

echo ========================================================
echo   MANGAFLOW - WEB DOC TRUYEN TRANH
echo ========================================================
echo.

if not exist "node_modules" (
  echo Dang cai dat thu vien can thiet...
  call npm install
  echo.
)

echo Dang khoi dong Server MangaFlow...
echo.

start "" "http://localhost:3000"
node local-server.cjs

pause
