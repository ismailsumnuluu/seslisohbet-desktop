@echo off
echo ========================================
echo  Sesli Sohbet - Windows Installer Build
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Bagimliliklar kontrol ediliyor...
call npm install

echo [2/3] Windows installer olusturuluyor...
call npx electron-builder --win

echo.
echo [3/3] Tamamlandi!
echo Installer: dist\ klasorunde
echo.
pause
