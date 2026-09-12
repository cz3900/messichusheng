const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cap", { on: (ch, fn) => ipcRenderer.on(ch, (e, m) => fn(m)), send: (ch, m) => ipcRenderer.send(ch, m) });
