const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, nativeImage, Notification, session, desktopCapturer, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// ============================================================
// HIBB Sohbet - Electron Desktop App
// Discord benzeri: global shortcuts, system tray, always-on
// ============================================================

// ===== Chromium Flags (app.whenReady öncesi ayarlanmalı) =====
// Autoplay: ses/video elementlerini kullanıcı etkileşimi olmadan oynat (arama sesi, uzak ses/video)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// WebRTC: donanım hızlandırma ve medya akışı
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,SharedArrayBuffer');
app.commandLine.appendSwitch('disable-features', 'IOSurfaceCapturer'); // macOS ekran paylaşımı uyumluluk

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
    disconnect: 'CmdOrCtrl+Shift+E',
    checkUpdate: 'CmdOrCtrl+Shift+U'
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
        if (isManualUpdateCheck) {
            isManualUpdateCheck = false;
            new Notification({
                title: 'HIBB Sohbet',
                body: `Uygulama güncel! (v${app.getVersion()})`,
                icon: path.join(__dirname, 'icons', 'icon.png')
            }).show();
        }
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
        icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        backgroundColor: '#0a0a0f',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            navigateOnDragDrop: false,
            backgroundThrottling: false, // arka plandayken polling/WebRTC devam etsin
            // Kalıcı oturum: cookie, localStorage, sessionStorage
            partition: 'persist:seslisohbet'
        }
    });

    // Menü çubuğunu gizle (cleaner look)
    mainWindow.setMenuBarVisibility(false);

    // ===== Medya izinleri: kamera, mikrofon otomatik ver =====
    const ses = session.fromPartition('persist:seslisohbet');

    ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
        console.log('İzin isteği:', permission, details?.mediaTypes || '');
        const allowed = [
            'media',           // kamera + mikrofon
            'mediaKeySystem',
            'notifications',
            'fullscreen',
            'audioCapture',    // mikrofon
            'videoCapture',    // kamera
            'desktopCapture',  // ekran paylaşımı
            'display-capture',
            'clipboard-sanitized-write',
            'clipboard-read',
            'speaker-selection',
            'geolocation',
            'screen-wake-lock'
        ];
        callback(allowed.includes(permission));
    });

    // Electron 33+: İzin kontrolü — getUserMedia/getDisplayMedia için zorunlu
    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowed = [
            'media',
            'mediaKeySystem',
            'notifications',
            'fullscreen',
            'audioCapture',
            'videoCapture',
            'desktopCapture',
            'display-capture',
            'hid',
            'serial',
            'speaker-selection',
            'clipboard-read',
            'screen-wake-lock'
        ];
        return allowed.includes(permission);
    });

    // Ekran paylaşımı: desktopCapturer ile kaynak seçtir (picker penceresi)
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 320, height: 180 },
                fetchWindowIcons: true
            });
            if (!sources || sources.length === 0) {
                callback({});
                return;
            }

            // Seçim penceresi oluştur
            const pickerWindow = new BrowserWindow({
                width: 680,
                height: 520,
                parent: mainWindow,
                modal: true,
                resizable: false,
                minimizable: false,
                maximizable: false,
                title: 'Ekran Paylaş',
                autoHideMenuBar: true,
                backgroundColor: '#1a1a2e',
                webPreferences: {
                    contextIsolation: false,
                    nodeIntegration: true
                }
            });
            pickerWindow.setMenuBarVisibility(false);

            // Kaynak verilerini HTML'e göm
            const sourceData = sources.map(s => ({
                id: s.id,
                name: s.name,
                thumbnail: s.thumbnail.toDataURL(),
                appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
                isScreen: s.id.startsWith('screen:')
            }));

            const pickerHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#1a1a2e; color:#e0e0e0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding:16px; overflow-y:auto; }
h2 { font-size:1rem; color:#8e9297; margin-bottom:12px; font-weight:500; }
.tabs { display:flex; gap:8px; margin-bottom:16px; }
.tab { padding:8px 16px; border-radius:8px; border:none; background:rgba(255,255,255,0.06); color:#b9bbbe; cursor:pointer; font-size:0.9rem; }
.tab.active { background:#7289da; color:#fff; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
.item { background:rgba(255,255,255,0.04); border:2px solid transparent; border-radius:10px; padding:8px; cursor:pointer; transition:all 0.15s; }
.item:hover { background:rgba(255,255,255,0.08); border-color:rgba(114,137,218,0.4); }
.item.selected { border-color:#7289da; background:rgba(114,137,218,0.12); }
.item img { width:100%; height:120px; object-fit:contain; border-radius:6px; background:rgba(0,0,0,0.3); display:block; }
.item .name { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:0.82rem; color:#dcddde; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.item .name img.icon { width:16px; height:16px; flex-shrink:0; }
.actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
.btn { padding:8px 20px; border-radius:6px; border:none; font-size:0.9rem; cursor:pointer; }
.btn-cancel { background:rgba(255,255,255,0.06); color:#b9bbbe; }
.btn-cancel:hover { background:rgba(255,255,255,0.1); }
.btn-share { background:#7289da; color:#fff; opacity:0.5; pointer-events:none; }
.btn-share.ready { opacity:1; pointer-events:auto; }
.btn-share.ready:hover { background:#677bc4; }
</style></head><body>
<div class="tabs">
  <button class="tab active" onclick="showTab('all')">Tümü</button>
  <button class="tab" onclick="showTab('screen')">Ekranlar</button>
  <button class="tab" onclick="showTab('window')">Pencereler</button>
</div>
<div class="grid" id="grid"></div>
<div class="actions">
  <button class="btn btn-cancel" onclick="cancel()">İptal</button>
  <button class="btn btn-share" id="shareBtn" onclick="share()">Paylaş</button>
</div>
<script>
const { ipcRenderer } = require('electron');
const sources = ${JSON.stringify(sourceData)};
let selectedId = null;
let filter = 'all';

function render() {
  const grid = document.getElementById('grid');
  const filtered = filter === 'all' ? sources : sources.filter(s => filter === 'screen' ? s.isScreen : !s.isScreen);
  grid.innerHTML = filtered.map(s => \`
    <div class="item \${selectedId===s.id?'selected':''}" onclick="select('\${s.id}')">
      <img src="\${s.thumbnail}" alt="\${s.name}">
      <div class="name">
        \${s.appIcon ? '<img class="icon" src="'+s.appIcon+'">' : ''}
        <span>\${s.isScreen ? '🖥️ ' : ''}\${s.name}</span>
      </div>
    </div>
  \`).join('');
}

function showTab(t) {
  filter = t;
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent === (t==='all'?'Tümü':t==='screen'?'Ekranlar':'Pencereler')));
  render();
}

function select(id) {
  selectedId = id;
  render();
  const btn = document.getElementById('shareBtn');
  btn.classList.add('ready');
}

function share() {
  if (selectedId) ipcRenderer.send('screen-picker-result', selectedId);
}

function cancel() {
  ipcRenderer.send('screen-picker-result', null);
}

window.addEventListener('keydown', e => { if (e.key === 'Escape') cancel(); });
render();
</script></body></html>`;

            pickerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pickerHTML));

            // Sonucu bekle
            const selectedId = await new Promise((resolve) => {
                ipcMain.once('screen-picker-result', (event, id) => {
                    resolve(id);
                });
                pickerWindow.on('closed', () => {
                    resolve(null);
                });
            });

            if (!pickerWindow.isDestroyed()) pickerWindow.close();

            if (selectedId) {
                const selected = sources.find(s => s.id === selectedId);
                if (selected) {
                    callback({ video: selected });
                    return;
                }
            }
            callback({});
        } catch (e) {
            console.error('Ekran paylaşımı hatası:', e);
            callback({});
        }
    });

    mainWindow.loadURL(SERVER_URL);

    // Sertifika hatalarını yönet (self-signed veya geçici sorunlar)
    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        // Kendi sunucumuzsa güven
        if (url.startsWith(SERVER_URL) || url.includes('ismailsumnulu.nl')) {
            event.preventDefault();
            callback(true);
        } else {
            callback(false);
        }
    });

    // Yeni pencere açma isteklerini yönet (popup/link)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Aynı domain ise aynı pencerede aç
        if (url.startsWith(SERVER_URL)) {
            mainWindow.loadURL(url);
            return { action: 'deny' };
        }
        // Farklı domain ise sistem tarayıcısında aç
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
    });

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
        const prefix = level === 0 ? '[Web:LOG]' : level === 1 ? '[Web:WARN]' : '[Web:ERR]';
        console.log(prefix, message);
    });
}

function createTray() {
    // Tray ikonu: dosya varsa onu kullan, yoksa basit bir ikon oluştur
    let trayIcon;
    try {
        const trayFile = process.platform === 'win32' ? 'icon.ico' : 'tray.png';
        const iconPath = path.join(__dirname, 'icons', trayFile);
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
            label: '🔄 Güncelleme Kontrol',
            accelerator: shortcuts.checkUpdate,
            click: () => manualCheckForUpdate()
        },
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
        try { globalShortcut.register(shortcuts.toggleMute, () => { sendAction('toggle-mute'); }); }
        catch(e) { console.error('Kısayol kayıt hatası (toggleMute):', e.message); }
    }

    // Deafen toggle
    if (shortcuts.toggleDeafen) {
        try { globalShortcut.register(shortcuts.toggleDeafen, () => { sendAction('toggle-deafen'); }); }
        catch(e) { console.error('Kısayol kayıt hatası (toggleDeafen):', e.message); }
    }

    // Camera toggle
    if (shortcuts.toggleCamera) {
        try { globalShortcut.register(shortcuts.toggleCamera, () => { sendAction('toggle-camera'); }); }
        catch(e) { console.error('Kısayol kayıt hatası (toggleCamera):', e.message); }
    }

    // Disconnect
    if (shortcuts.disconnect) {
        try { globalShortcut.register(shortcuts.disconnect, () => { sendAction('disconnect'); }); }
        catch(e) { console.error('Kısayol kayıt hatası (disconnect):', e.message); }
    }

    // Güncelleme kontrol
    if (shortcuts.checkUpdate) {
        try { globalShortcut.register(shortcuts.checkUpdate, () => { manualCheckForUpdate(); }); }
        catch(e) { console.error('Kısayol kayıt hatası (checkUpdate):', e.message); }
    }

    // Push-to-Talk (basılı tutunca konuş)
    if (shortcuts.pushToTalk) {
        try { globalShortcut.register(shortcuts.pushToTalk, () => { sendAction('toggle-mute'); }); }
        catch(e) { console.error('Kısayol kayıt hatası (pushToTalk):', e.message); }
    }

    console.log('Global kısayollar kaydedildi:', Object.entries(shortcuts).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', '));
}

function sendAction(action) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('shortcut-action', action);
    }
}

// Manuel güncelleme kontrolü (kısayol veya IPC ile tetiklenir)
let isManualUpdateCheck = false;
function manualCheckForUpdate() {
    isManualUpdateCheck = true;
    new Notification({
        title: 'HIBB Sohbet',
        body: 'Güncelleme kontrol ediliyor...',
        icon: path.join(__dirname, 'icons', 'icon.png')
    }).show();
    autoUpdater.checkForUpdates().catch(e => {
        console.error('Manuel güncelleme kontrol hatası:', e);
        new Notification({
            title: 'HIBB Sohbet',
            body: 'Güncelleme kontrolü başarısız: ' + e.message,
            icon: path.join(__dirname, 'icons', 'icon.png')
        }).show();
        isManualUpdateCheck = false;
    });
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
    // Oturum cookie'lerini diske yaz (Electron kapanırken kaybolmasın)
    const ses = session.fromPartition('persist:seslisohbet');
    ses.flushStorageData();
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

// IPC: tüm kısayolları getir (invoke — güvenilir promise tabanlı)
ipcMain.handle('get-shortcuts-data', () => {
    return { ...shortcuts };
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
    manualCheckForUpdate();
});

// IPC: güncellemeyi yükle
ipcMain.on('install-update', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
});

// IPC: app versiyonunu getir (invoke = promise döner)
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Legacy: eski yöntem de çalışsın
ipcMain.on('get-app-version', (event) => {
    event.sender.send('app-version', app.getVersion());
});

// IPC: push bildirim göster
ipcMain.on('show-notification', (event, { title, body, isCall }) => {
    try {
        let iconPath;
        try {
            iconPath = path.join(__dirname, 'icons', 'icon.png');
            if (!fs.existsSync(iconPath)) iconPath = undefined;
        } catch(e) { iconPath = undefined; }

        const opts = { title, body, silent: false, urgency: 'critical' };
        if (iconPath) opts.icon = iconPath;
        const notif = new Notification(opts);
        notif.show();

        // Tıklanırsa pencereyi öne getir
        notif.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
        });

        // Arama bildirimi ise: pencereyi öne getir + bounce/flash
        if (isCall && mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            // macOS: dock bounce, Windows: taskbar flash
            if (process.platform === 'darwin') {
                app.dock.bounce('critical');
            } else {
                mainWindow.flashFrame(true);
                setTimeout(() => { try { mainWindow.flashFrame(false); } catch(e) {} }, 10000);
            }
        }
    } catch(e) {
        console.error('Bildirim hatası:', e);
    }
});

// IPC: Gelen arama - pencereyi ön plana getir
ipcMain.on('bring-to-front', () => {
    try {
        if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
            setTimeout(() => {
                try { if (mainWindow) mainWindow.setAlwaysOnTop(false); } catch(e) {}
            }, 2000);
            if (process.platform === 'darwin') {
                app.dock.bounce('critical');
            } else {
                mainWindow.flashFrame(true);
            }
        }
    } catch(e) {
        console.error('bring-to-front hatası:', e);
    }
});

// IPC: Taskbar flash kontrolü
ipcMain.on('flash-frame', (event, flag) => {
    try {
        if (mainWindow) mainWindow.flashFrame(!!flag);
    } catch(e) {}
});
