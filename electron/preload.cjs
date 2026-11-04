const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("smartTrans", {
  translate: (payload) => ipcRenderer.invoke("translate", payload),
  status: () => ipcRenderer.invoke("cli-status"),
  copy: (text) => ipcRenderer.invoke("copy-text", text),
  onTranslateSelection: (callback) => ipcRenderer.on("translate-selection", () => callback()),
});
