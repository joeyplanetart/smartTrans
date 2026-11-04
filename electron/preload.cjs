const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("smartTrans", {
  translate: (payload) => ipcRenderer.invoke("translate", payload),
  cancel: (requestId) => ipcRenderer.invoke("cancel-translation", requestId),
  onProgress: (callback) => ipcRenderer.on("translation-progress", (_event, payload) => callback(payload)),
  onEditorCommand: (callback) => ipcRenderer.on("editor-command", (_event, command) => callback(command)),
  onDesktopAction: (callback) => ipcRenderer.on("desktop-action", (_event, action) => callback(action)),
  desktopStatus: () => ipcRenderer.invoke("desktop-status"),
  status: () => ipcRenderer.invoke("cli-status"),
  copy: (text) => ipcRenderer.invoke("copy-text", text),
  onTranslateSelection: (callback) => ipcRenderer.on("translate-selection", () => callback()),
});
