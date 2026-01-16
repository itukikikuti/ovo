const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIを公開
contextBridge.exposeInMainWorld('electronAPI', {
    // DOM要素をキャプチャ
    captureElement: (payload) => ipcRenderer.invoke('capture-element', payload),
    
    // 複数フレームを一括キャプチャ
    captureFrames: (frames) => ipcRenderer.invoke('capture-frames', frames)
});
