const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopTodos', {
  list: () => ipcRenderer.invoke('todo-view-list'),
  complete: id => ipcRenderer.invoke('todo-view-complete', id),
  setPinned: pinned => ipcRenderer.invoke('todo-view-pin', pinned),
  openMain: () => ipcRenderer.invoke('todo-view-main'),
  onChanged: callback => ipcRenderer.on('todos-changed', () => callback()),
});
