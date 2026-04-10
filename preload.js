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
    // Kısayolları getir (promise tabanlı — güvenilir)
    getShortcutsData: () => {
        return ipcRenderer.invoke('get-shortcuts-data');
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
    // App versiyonunu al (promise döner)
    getAppVersion: () => {
        return ipcRenderer.invoke('get-app-version');
    },
    // App versiyon bilgisini dinle (legacy)
    onAppVersion: (callback) => {
        ipcRenderer.on('app-version', (event, version) => {
            callback(version);
        });
    },
    // Push bildirim göster
    showNotification: (title, body, isCall) => {
        ipcRenderer.send('show-notification', { title, body, isCall: !!isCall });
    },
    // Pencereyi ön plana getir (gelen arama)
    bringToFront: () => {
        ipcRenderer.send('bring-to-front');
    },
    // Taskbar flash
    flashFrame: (flag) => {
        ipcRenderer.send('flash-frame', flag);
    },
    // Platform bilgisi
    platform: process.platform,
    isElectron: true
});
