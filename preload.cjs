const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceChangerHotkeys', {
  set: (accelerator) => ipcRenderer.invoke('voicechanger:set-hotkey', accelerator),
  onPressed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('voicechanger:hotkey-pressed', listener);
    return () => ipcRenderer.removeListener('voicechanger:hotkey-pressed', listener);
  }
});