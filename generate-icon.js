// Simple icon generator for Electron app
// Run: node generate-icon.js
// Creates a 256x256 PNG icon

const fs = require('fs');
const path = require('path');

// Create a simple 16x16 BMP-like tray icon (PNG header + raw pixel data)
// For production, replace icons/icon.png with a proper 256x256 PNG icon
// For now, we'll create a placeholder

console.log('========================================');
console.log(' Sesli Sohbet - İkon Bilgisi');
console.log('========================================');
console.log('');
console.log('Uygulama ikonları için:');
console.log('');
console.log('1. 256x256 PNG dosyası oluşturun (herhangi bir grafik editörü ile)');
console.log('2. Aşağıdaki dosyalara kopyalayın:');
console.log('   - icons/icon.png  (genel)');
console.log('   - icons/tray.png  (sistem tepsisi, 16x16 veya 32x32)');
console.log('');
console.log('Windows için (.ico):');
console.log('   https://convertio.co/png-ico/ adresinden dönüştürün');
console.log('   - icons/icon.ico');
console.log('');
console.log('macOS için (.icns):');
console.log('   https://cloudconvert.com/png-to-icns adresinden dönüştürün');
console.log('   - icons/icon.icns');
console.log('');
console.log('Şimdilik ikon olmadan da çalışır, varsayılan Electron ikonu kullanılır.');
