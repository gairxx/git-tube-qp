const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gitTube", {
  platform: process.platform,
  saveDownload: (payload) => ipcRenderer.invoke("save-download", payload),
});
