const { contextBridge, ipcRenderer } = require('electron');
const id = new URLSearchParams(location.search).get('id');
contextBridge.exposeInMainWorld('stickyNote', {
  read: () => ipcRenderer.invoke('note-read', id),
  clipboardImage: () => ipcRenderer.invoke('note-clipboard-image', id),
  update: changes => ipcRenderer.invoke('note-update', id, changes),
  saveContent: content => ipcRenderer.sendSync('note-save-content', id, content),
  create: () => ipcRenderer.invoke('note-new', id),
  remove: () => ipcRenderer.invoke('note-delete', id),
});
