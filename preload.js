const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ad", { on: (ch, fn) => ipcRenderer.on(ch, (e, m) => fn(m)) });
