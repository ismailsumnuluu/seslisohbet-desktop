@echo off
echo ========================================
echo  Sesli Sohbet - Desktop App Kurulumu
echo ========================================
echo.

:: Node.js kontrolu
node --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi! https://nodejs.org adresinden indirin.
    pause
    exit /b 1
)

echo [1/3] Bagimliliklar yukleniyor...
cd /d "%~dp0"
call npm install

echo.
echo [2/3] Uygulama baslatiliyor (gelistirme modu)...
echo   - XAMPP'in acik oldugundan emin olun!
echo   - Ctrl+C ile kapatabilirsiniz
echo.
call npm start
