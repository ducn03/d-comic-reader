@echo off
title MangaFlow - Web Doc Truyen Tranh
color 0A
chcp 65001 >nul

echo ========================================================
echo   📖 KHỞI ĐỘNG MANGAFLOW - WEB ĐỌC TRUYỆN TRANH
echo ========================================================
echo.
echo Đang khởi động Server cào dữ liệu từ Hinettruyen...
echo.

start "" "http://localhost:3000"
node server.js

pause
