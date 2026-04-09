const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, nativeImage, Notification, session, desktopCapturer, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// ============================================================
// HIBB Sohbet - Electron Desktop App
// Discord benzeri: global shortcuts, system tray, always-on
// ============================================================

// Sunucu URL'si
const SERVER_URL = 'https://ismailsumnulu.nl/seslisohbet/';

let mainWindow = null;
let tray = null;
let isQuitting = false;
const fs = require('fs');

// Kısayol ayarları dosya yolu
const shortcutsFile = path.join(app.getPath('userData'), 'shortcuts.json');

// Varsayılan kısayollar
const defaultShortcuts = {
    toggleMute: 'CmdOrCtrl+Shift+M',
    toggleDeafen: 'CmdOrCtrl+Shift+D',
    toggleCamera: 'CmdOrCtrl+Shift+V',
    pushToTalk: null,
    disconnect: 'CmdOrCtrl+Shift+E'
};

// Kayıtlı kısayolları yükle
let shortcuts = { ...defaultShortcuts };
try {
    if (fs.existsSync(shortcutsFile)) {
        const saved = JSON.parse(fs.readFileSync(shortcutsFile, 'utf8'));
        shortcuts = { ...defaultShortcuts, ...saved };
    }
} catch (e) {
    console.error('Kısayol dosyası okunamadı:', e);
}

function saveShortcuts() {
    try {
        fs.writeFileSync(shortcutsFile, JSON.stringify(shortcuts, null, 2), 'utf8');
    } catch (e) {
        console.error('Kısayol dosyası yazılamadı:', e);
    }
}

// ==================== OTOMATİK GÜNCELLEME ====================
function setupAutoUpdater() {
    // Logları aç
    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('Güncelleme kontrol ediliyor...');
        sendUpdateStatus('checking');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('Güncelleme mevcut:', info.version);
        sendUpdateStatus('available', { version: info.version });
        new Notification({
            title: 'HIBB Sohbet - Güncelleme',
            body: `Yeni versiyon ${info.version} indiriliyor...`,
            icon: path.join(__dirname, 'icons', 'icon.png')
        }).show();
    });

    autoUpdater.on('update-not-available', () => {
        console.log('Uygulama güncel.');
        sendUpdateStatus('up-to-date');
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`İndirme: %${Math.round(progress.percent)}`);
        sendUpdateStatus('downloading', { percent: Math.round(progress.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('Güncelleme indirildi:', info.version);
        sendUpdateStatus('downloaded', { version: info.version });

        // Kullanıcıya bildir
        const result = dialog.showMessageBoxSync(mainWindow, {
            type: 'info',
            title: 'Güncelleme Hazır',
            message: `HIBB Sohbet ${info.version} indirildi.`,
            detail: 'Güncellemeyi şimdi yüklemek için uygulamayı yeniden başlatın.',
            buttons: ['Şimdi Yeniden Başlat', 'Daha Sonra'],
            defaultId: 0
        });

        if (result === 0) {
            isQuitting = true;
            autoUpdater.quitAndInstall(false, true);
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('Güncelleme hatası:', err);
        sendUpdateStatus('error', { error: err.message });
    });
}

function sendUpdateStatus(status, data = {}) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', { status, ...data });
    }
}

function createWindow() {
    // Oturum verilerini kalıcı yap (çerezler, login durumu kaybolmasın)
    const userDataPath = path.join(app.getPath('userData'), 'session');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'HIBB Sohbet',
        icon: path.join(__dirname, 'icons', 'icon.png'),
        backgroundColor: '#0a0a0f',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            // Kalıcı oturum: cookie, localStorage, sessionStorage
            partition: 'persist:seslisohbet'
        }
    });

    // Menü çubuğunu gizle (cleaner look)
    mainWindow.setMenuBarVisibility(false);

    // ===== Medya izinleri: kamera, mikrofon otomatik ver =====
    const ses = session.fromPartition('persist:seslisohbet');

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = [
            'media',           // kamera + mikrofon
            'mediaKeySystem',
            'notifications',
            'fullscreen',
            'audioCapture',    // mikrofon
            'videoCapture',    // kamera
            'desktopCapture',  // ekran paylaşımı
            'display-capture'
        ];
        if (allowed.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    // Ekran paylaşımı: desktopCapturer ile kaynak seç
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 150, height: 150 }
            });
            if (sources && sources.length > 0) {
                // İlk ekranı otomatik seç (genellikle ana ekran)
                callback({ video: sources[0] });
            } else {
                callback({});
            }
        } catch (e) {
            console.error('Ekran paylaşımı hatası:', e);
            callback({});
        }
    });

    mainWindow.loadURL(SERVER_URL);

    // Kapatma → tray'e küçült (Discord gibi)
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();

            // İlk seferde bildirim göster
            if (tray && !app._trayNotified) {
                app._trayNotified = true;
                new Notification({
                    title: 'HIBB Sohbet',
                    body: 'Uygulama sistem tepsisinde çalışmaya devam ediyor.',
                    icon: path.join(__dirname, 'icons', 'icon.png')
                }).show();
            }
            return;
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Sayfa yüklendiğinde kısayol durumunu bildir
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('shortcuts-info', shortcuts);
    });

    // Navigasyon logları (debug)
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Sayfa yükleme hatası:', errorCode, errorDescription);
        console.error('XAMPP açık olduğundan ve URL doğru olduğundan emin olun:', SERVER_URL);
    });

    // Console mesajlarını Electron terminaline yönlendir
    mainWindow.webContents.on('console-message', (event, level, message) => {
        if (level >= 2) { // warnings and errors only
            console.log('[Web]', message);
        }
    });
}

function createTray() {
    // Tray ikonu: dosya varsa onu kullan, yoksa basit bir ikon oluştur
    let trayIcon;
    try {
        const iconPath = path.join(__dirname, 'icons', 'tray.png');
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) throw new Error('empty');
    } catch (e) {
        // Fallback: 16x16 basit mavi daire PNG
        const size = 16;
        const canvas = Buffer.alloc(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5, dy = y - 7.5;
                const inside = (dx * dx + dy * dy) <= 49; // r=7
                const offset = (y * size + x) * 4;
                canvas[offset] = inside ? 100 : 0;     // R
                canvas[offset + 1] = inside ? 150 : 0;  // G
                canvas[offset + 2] = inside ? 255 : 0;  // B
                canvas[offset + 3] = inside ? 255 : 0;  // A
            }
        }
        trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('HIBB Sohbet');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '🎙️ HIBB Sohbet',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Göster',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        {
            label: '🔇 Mikrofonu Kapat/Aç',
            accelerator: shortcuts.toggleMute,
            click: () => sendAction('toggle-mute')
        },
        {
            label: '🔇 Sağırlaştır',
            accelerator: shortcuts.toggleDeafen,
            click: () => sendAction('toggle-deafen')
        },
        {
            label: '📷 Kamera Aç/Kapat',
            accelerator: shortcuts.toggleCamera,
            click: () => sendAction('toggle-camera')
        },
        { type: 'separator' },
        {
            label: 'Çıkış',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    // Double-click de aç
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function registerGlobalShortcuts() {
    // Mute toggle — en önemli özellik
    if (shortcuts.toggleMute) {
        globalShortcut.register(shortcuts.toggleMute, () => {
            sendAction('toggle-mute');
        });
    }

    // Deafen toggle
    if (shortcuts.toggleDeafen) {
        globalShortcut.register(shortcuts.toggleDeafen, () => {
            sendAction('toggle-deafen');
        });
    }

    // Camera toggle
    if (shortcuts.toggleCamera) {
        globalShortcut.register(shortcuts.toggleCamera, () => {
            sendAction('toggle-camera');
        });
    }

    // Disconnect
    if (shortcuts.disconnect) {
        globalShortcut.register(shortcuts.disconnect, () => {
            sendAction('disconnect');
        });
    }

    // Push-to-Talk (basılı tutunca konuş)
    if (shortcuts.pushToTalk) {
        // PTT: basınca unmute, bırakınca mute
        // Not: globalShortcut keyUp desteklemiyor, bu yüzden
        // PTT için daha gelişmiş bir çözüm gerekir
        // Şimdilik toggle olarak çalışır
        globalShortcut.register(shortcuts.pushToTalk, () => {
            sendAction('toggle-mute');
        });
    }

    console.log('Global kısayollar kaydedildi:', Object.entries(shortcuts).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', '));
}

function sendAction(action) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('shortcut-action', action);
    }
}

// ==================== APP LIFECYCLE ====================

// Hata yakalama (debug)
process.on('uncaughtException', (err) => {
    console.error('Yakalanmamış hata:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('İşlenmemiş promise hatası:', reason);
});

// Tek örnek kontrolü — aynı anda iki pencere açılmasın
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        try {
            createWindow();
        } catch (e) {
            console.error('Pencere oluşturma hatası:', e);
        }
        try {
            createTray();
        } catch (e) {
            console.error('Tray oluşturma hatası:', e);
        }
        try {
            registerGlobalShortcuts();
        } catch (e) {
            console.error('Kısayol kayıt hatası:', e);
        }
        // Otomatik güncelleme başlat
        try {
            setupAutoUpdater();
            // 3 saniye sonra kontrol et (app yüklenmesini bekle)
            setTimeout(() => {
                autoUpdater.checkForUpdates().catch(e => console.error('Güncelleme kontrol hatası:', e));
            }, 3000);
            // Her 30 dakikada bir kontrol et
            setInterval(() => {
                autoUpdater.checkForUpdates().catch(e => console.error('Güncelleme kontrol hatası:', e));
            }, 30 * 60 * 1000);
        } catch (e) {
            console.error('Auto-updater hatası:', e);
        }
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// IPC: kısayol değiştirme
ipcMain.on('update-shortcut', (event, { action, key }) => {
    if (shortcuts[action] !== undefined) {
        // Eski kısayolu kaldır
        if (shortcuts[action]) {
            try { globalShortcut.unregister(shortcuts[action]); } catch(e) {}
        }
        shortcuts[action] = key || null;
        if (key) {
            try {
                globalShortcut.register(key, () => sendAction(
                    action === 'toggleMute' ? 'toggle-mute' :
                    action === 'toggleDeafen' ? 'toggle-deafen' :
                    action === 'toggleCamera' ? 'toggle-camera' :
                    action === 'disconnect' ? 'disconnect' : action
                ));
            } catch (e) {
                console.error(`Kısayol kayıt hatası (${action}):`, e);
                // Geçersiz kısayol — bildir
                if (mainWindow) {
                    mainWindow.webContents.send('shortcut-error', { action, key, error: e.message });
                }
                return;
            }
        }
        // Kaydet ve bildir
        saveShortcuts();
        if (mainWindow) {
            mainWindow.webContents.send('shortcuts-info', shortcuts);
        }
    }
});

// IPC: tüm kısayolları getir
ipcMain.on('get-shortcuts', (event) => {
    event.sender.send('shortcuts-info', shortcuts);
});

// IPC: kısayolları sıfırla
ipcMain.on('reset-shortcuts', () => {
    // Tüm kısayolları kaldır
    globalShortcut.unregisterAll();
    // Varsayılanlara dön
    Object.assign(shortcuts, defaultShortcuts);
    saveShortcuts();
    registerGlobalShortcuts();
    if (mainWindow) {
        mainWindow.webContents.send('shortcuts-info', shortcuts);
    }
});

// IPC: güncelleme kontrol
ipcMain.on('check-for-update', () => {
    autoUpdater.checkForUpdates().catch(e => console.error('Manuel güncelleme kontrol hatası:', e));
});

// IPC: güncellemeyi yükle
ipcMain.on('install-update', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
});

// IPC: app versiyonunu getir
ipcMain.on('get-app-version', (event) => {
    event.sender.send('app-version', app.getVersion());
});
