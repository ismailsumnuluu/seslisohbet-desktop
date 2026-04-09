#!/bin/bash
echo "========================================"
echo " Sesli Sohbet - macOS Build"
echo "========================================"
echo ""

cd "$(dirname "$0")"

echo "[1/3] Bağımlılıklar yükleniyor..."
npm install

echo "[2/3] macOS DMG oluşturuluyor..."
npx electron-builder --mac

echo ""
echo "[3/3] Tamamlandı! dist/ klasörüne bakın."
