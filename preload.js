const { contextBridge, ipcRenderer } = require('electron');

// ============================================================
// Preload: Güvenli köprü (Electron ↔ Web sayfası)
// ============================================================

// Web sayfasına güvenli API sun
contextBridge.exposeInMainWorld('electronAPI', {
    // Kısayol aksiyonlarını dinle
    onShortcutAction: (callback) => {
        ipcRenderer.on('shortcut-action', (event, action) => {
            callback(action);
        });
    },
    // Kısayol bilgisini dinle
    onShortcutsInfo: (callback) => {
        ipcRenderer.on('shortcuts-info', (event, shortcuts) => {
            callback(shortcuts);
        });
    },
    // Kısayol hata bilgisi
    onShortcutError: (callback) => {
        ipcRenderer.on('shortcut-error', (event, data) => {
            callback(data);
        });
    },
    // Kısayolu güncelle
    updateShortcut: (action, key) => {
        ipcRenderer.send('update-shortcut', { action, key });
    },
    // Kısayolları getir
    getShortcuts: () => {
        ipcRenderer.send('get-shortcuts');
    },
    // Kısayolları sıfırla
    resetShortcuts: () => {
        ipcRenderer.send('reset-shortcuts');
    },
    // Güncelleme durumunu dinle
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (event, data) => {
            callback(data);
        });
    },
    // Güncelleme kontrol et
    checkForUpdate: () => {
        ipcRenderer.send('check-for-update');
    },
    // Güncellemeyi yükle ve yeniden başlat
    installUpdate: () => {
        ipcRenderer.send('install-update');
    },
    // App versiyonunu al
    getAppVersion: () => {
        ipcRenderer.send('get-app-version');
    },
    // App versiyon bilgisini dinle
    onAppVersion: (callback) => {
        ipcRenderer.on('app-version', (event, version) => {
            callback(version);
        });
    },
    // Platform bilgisi
    platform: process.platform,
    isElectron: true
});
