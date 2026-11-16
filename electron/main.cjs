const path = require("node:path");
const { app, BrowserWindow, ipcMain, clipboard, Menu, screen, Tray, nativeImage, globalShortcut, net, safeStorage, shell, dialog, Notification } = require("electron");
const { runTranslation, runLearningAssist, cliStatus, dispose } = require("./cli.cjs");
const { readIssue, parseJiraUrl, safeUrl, issueApiUrl, commentsApiUrl, importIssueJson, resolveConnection } = require("./jira.cjs");
const { JiraConnections } = require("./jira-connections.cjs");
const { Favorites } = require("./favorites.cjs");
const { Todos } = require("./todos.cjs");
const { Notes, offsetNoteBounds } = require("./notes.cjs");
const { createBackup, readBackup, writeBackup } = require("./backup.cjs");
const { createBrowserBridge } = require('./browser-bridge.cjs');
const { installNativeHost } = require('./native-installer.cjs');
const { detectLanguage } = require('../src/editor-core.js');

const { Speech } = require("./speech.cjs");
const speech = new Speech();
let mainWindow;
let tray;
let quitting = false;
let activeTranslation;
let browserProvider = 'codex';
let browserBridge;
let currentJiraIssue = null;
let miniMode = false;
let fullWindowBounds = null;
let fullWindowMaximized = false;
let notes;
const noteWindows = new Map();
const shortcuts = {};
app.setName("smartTrans");
app.setPath("userData", path.join(app.getPath("appData"), "smart-translation"));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.round(workArea.width * 0.75);
  const height = Math.round(workArea.height * 0.75);
  mainWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(650, width),
    minHeight: Math.min(620, height),
    backgroundColor: "#f8f8f7",
    title: "Smart Translation",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const selection = (params.selectionText || "").trim();
    if (!selection) return;
    const items = [{ label: "转为待办", click: () => mainWindow?.webContents.send("todo-selection", { text: selection }) },
      { label: "收藏单词 / 短句", click: () => mainWindow?.webContents.send("favorite-selection", { text: selection }) }];
    if (params.isEditable) items.push({ label: "翻译选中内容", click: () => mainWindow?.webContents.send("translate-selection") });
    if (/[a-z]/i.test(selection)) items.push({ label: "朗读英文", click: () => mainWindow?.webContents.send("speech-action", { text: selection }) });
    items.push({ type: "separator" }, { role: "copy", label: "复制" }, { role: "selectAll", label: "全选" });
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });
  mainWindow.on("close", (event) => {
    if (!quitting) { event.preventDefault(); speech.stop(); mainWindow.hide(); mainWindow.webContents.send("speech-state", { speaking: false }); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function showWindow(action) {
  if (!mainWindow) createWindow();
  const deliver = () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    app.focus({ steal: true });
    mainWindow.focus();
    mainWindow.webContents.send("desktop-action", action || { type: "focus" });
  };
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", deliver);
  else deliver();
}
function clipboardTranslation() {
  const text = clipboard.readText();
  showWindow({ type: "clipboard", text });
}
function editorCommand(command) {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && focused !== mainWindow) {
    if (command === "undo") focused.webContents.undo();
    else focused.webContents.redo();
  } else mainWindow?.webContents.send("editor-command", command);
}

function fromMainWindow(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Invalid caller");
}

function openNote(item) {
  let window = noteWindows.get(item.id);
  if (window && !window.isDestroyed()) { window.show(); window.focus(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  const fallback = { width: 320, height: 300, x: area.x + area.width - 350, y: area.y + 60 };
  const saved = item.bounds;
  const visible = saved && screen.getAllDisplays().some(display => {
    const a = display.workArea;
    return saved.x < a.x + a.width - 80 && saved.x + saved.width > a.x + 80 &&
      saved.y < a.y + a.height - 40 && saved.y + saved.height > a.y + 40;
  });
  window = new BrowserWindow({ ...(visible ? saved : fallback), minWidth: 240, minHeight: 180,
    title: '便签 · smartTrans', backgroundColor: '#fff3af', alwaysOnTop: item.pinned,
    webPreferences: { preload: path.join(__dirname, 'note-preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true } });
  noteWindows.set(item.id, window);
  window.loadFile(path.join(__dirname, '..', 'src', 'note.html'), { query: { id: item.id } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  let boundsTimer;
  const saveBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!window.isDestroyed() && notes?.get(item.id)) notes.update(item.id, { bounds: window.getBounds() });
    }, 250);
  };
  window.on('move', saveBounds);
  window.on('resize', saveBounds);
  window.on('close', event => { if (!quitting && notes?.data.enabled) { event.preventDefault(); window.hide(); } });
  window.on('closed', () => { clearTimeout(boundsTimer); noteWindows.delete(item.id); });
}

function fromNote(event, id) {
  const window = noteWindows.get(id);
  if (!notes?.data.enabled || !window || window.isDestroyed() || event.sender !== window.webContents)
    throw new Error('无效的便签窗口。');
  return window;
}

app.whenReady().then(() => {
  if (!primaryInstance) return;
  const favorites = new Favorites(app.getPath("userData"));
  const todos = new Todos(app.getPath('userData'));
  function checkTodoReminders() {
    try {
      if (!Notification.isSupported()) return;
      for (const item of todos.dueReminders()) {
        const notice = new Notification({ title: '待办提醒 · smartTrans', body: item.title });
        notice.on('click', () => showWindow({ type: 'todo' }));
        notice.show();
      }
    } catch (error) { console.error('Todo reminder check failed:', error); }
  }
  setInterval(checkTodoReminders, 30_000);
  checkTodoReminders();
  ipcMain.handle('todos-list', event => { fromMainWindow(event); try { return { ok: true, items: todos.list() }; } catch (error) { return { ok: false, error: error.message }; } });
  ipcMain.handle('todos-save', (event, payload) => { fromMainWindow(event); try { const item = todos.save(payload); checkTodoReminders(); return { ok: true, item }; } catch (error) { return { ok: false, error: error.message }; } });
  ipcMain.handle('todos-complete', (event, id, complete) => { fromMainWindow(event); try { return { ok: true, items: todos.complete(id, complete) }; } catch (error) { return { ok: false, error: error.message }; } });
  ipcMain.handle('todos-remove', (event, id) => { fromMainWindow(event); try { todos.remove(id); return { ok: true }; } catch (error) { return { ok: false, error: error.message }; } });
  ipcMain.handle('todos-clipboard', event => { fromMainWindow(event); return clipboard.readText(); });
  notes = new Notes(app.getPath('userData'));
  ipcMain.handle('notes-status', event => { fromMainWindow(event); return { enabled: notes.data.enabled, count: notes.list().length }; });
  ipcMain.handle('notes-enabled', (event, enabled) => {
    fromMainWindow(event);
    notes.setEnabled(enabled);
    if (!enabled) for (const window of noteWindows.values()) window.destroy();
    return { enabled, count: notes.list().length };
  });
  ipcMain.handle('notes-open', event => {
    fromMainWindow(event);
    if (!notes.data.enabled) throw new Error('请先在设置中启用桌面便签。');
    const items = notes.list();
    if (!items.length) {
      openNote(notes.create());
      return { count: 1 };
    }
    const visible = items.filter(item => noteWindows.get(item.id)?.isVisible());
    const closed = items.filter(item => !noteWindows.get(item.id)?.isVisible());
    if (visible.length === 1 && !closed.length) { openNote(visible[0]); return { count: 1 }; }
    const noteTitle = item => item.text.trim().split(/\r?\n/)[0] || (item.html?.includes('<img') ? '截图便签' : '空白便签');
    const noteEntry = item => ({
      label: `${items.indexOf(item) + 1}. ${noteTitle(item).slice(0, 28)}`,
      click: () => openNote(item),
    });
    const closedEntry = item => ({
      label: noteEntry(item).label,
      submenu: [
        { label: '打开便签', click: () => openNote(item) },
        { label: '删除便签…', click: async () => {
          const choice = await dialog.showMessageBox(mainWindow, {
            type: 'warning', buttons: ['取消', '删除'], defaultId: 0, cancelId: 0,
            message: '删除这张已关闭的便签？',
            detail: `「${noteTitle(item).slice(0, 40)}」删除后无法撤销。`,
          });
          if (choice.response !== 1 || !notes.get(item.id)) return;
          try {
            notes.remove(item.id);
            const window = noteWindows.get(item.id);
            if (window && !window.isDestroyed()) window.destroy();
          } catch (error) {
            dialog.showErrorBox('删除便签失败', error.message);
          }
        } },
      ],
    });
    const menu = Menu.buildFromTemplate([
      { label: '新建便签', click: () => openNote(notes.create()) },
      ...(visible.length ? [{ type: 'separator' }, ...visible.map(noteEntry)] : []),
      ...(closed.length ? [{ type: 'separator' },
        { label: `已关闭便签（${closed.length}）`, submenu: closed.map(closedEntry) }] : []),
    ]);
    menu.popup({ window: mainWindow });
    return { count: items.length };
  });
  ipcMain.handle('note-read', (event, id) => {
    fromNote(event, id);
    return notes.get(id);
  });
  ipcMain.handle('note-clipboard-image', (event, id) => {
    fromNote(event, id);
    const image = clipboard.readImage();
    if (image.isEmpty()) return { ok: true, dataUrl: null };
    const png = image.toPNG();
    if (png.length > 5_000_000) return { ok: false, error: '截图超过 5 MB，请缩小后再粘贴。' };
    return { ok: true, dataUrl: `data:image/png;base64,${png.toString('base64')}` };
  });
  ipcMain.on('note-save-content', (event, id, value) => {
    try { fromNote(event, id); notes.update(id, { text: value?.text, html: value?.html }); event.returnValue = { ok: true }; }
    catch (error) { event.returnValue = { ok: false, error: error.message }; }
  });
  ipcMain.handle('note-update', (event, id, changes) => {
    const window = fromNote(event, id);
    const item = notes.update(id, changes);
    if (Object.hasOwn(changes, 'pinned')) window.setAlwaysOnTop(item.pinned, 'floating');
    return item;
  });
  ipcMain.handle('note-new', (event, id) => {
    const sourceWindow = fromNote(event, id);
    const source = notes.get(id);
    const sourceBounds = sourceWindow.getBounds();
    const area = screen.getDisplayMatching(sourceBounds).workArea;
    const item = notes.create({ bounds: offsetNoteBounds(sourceBounds, area),
      avoidColor: source.color, pinned: source.pinned });
    openNote(item);
    return item;
  });
  ipcMain.handle('note-delete', (event, id) => {
    const window = fromNote(event, id);
    notes.remove(id);
    window.destroy();
    return true;
  });
  browserBridge = createBrowserBridge(app.getPath('userData'), async request => {
    if (!request || typeof request !== 'object') throw new Error('请求无效。');
    if (request.type === 'status') return { ok: true, provider: browserProvider };
    if (request.type === 'translate') {
      if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 20000) throw new Error('选中文本为空或超过 20,000 字符。');
      if (activeTranslation) throw new Error('已有翻译正在进行，请稍后重试。');
      const target = detectLanguage(request.text).target;
      const controller = new AbortController();
      activeTranslation = { requestId: 'browser', controller };
      try {
        const result = await runTranslation({ text: request.text, target, provider: browserProvider }, { signal: controller.signal });
        return { ok: true, translation: result.translation, target };
      } finally { activeTranslation = null; }
    }
    if (request.type === 'favorite') {
      const result = favorites.save({ english: request.english, chinese: request.chinese,
        source: '浏览器选区', note: '' });
      if (!result.duplicate && !mainWindow?.webContents.isDestroyed()) mainWindow.webContents.send('favorites-changed');
      return { ok: true, duplicate: result.duplicate };
    }
    throw new Error('不支持的请求。');
  });
  ipcMain.on('browser-provider', (event, provider) => {
    fromMainWindow(event);
    if (provider === 'codex' || provider === 'cursor') browserProvider = provider;
  });
  ipcMain.handle('browser-extension-folder', event => {
    fromMainWindow(event);
    return shell.openPath(path.join(app.getAppPath(), 'browser-extension'));
  });
  ipcMain.handle('browser-install', (event, extensionId) => {
    fromMainWindow(event);
    try {
      const browsers = installNativeHost(extensionId.trim(), { executable: process.execPath,
        hostScript: path.join(app.getAppPath(), 'electron', 'native-host.cjs'), electron: true });
      return { ok: true, browsers };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  let pendingBackup = null;
  ipcMain.handle("backup-export", async (event, data) => {
    fromMainWindow(event);
    try {
      const backup = createBackup(data, favorites.read(), notes.data, todos.read());
      const date = new Date().toISOString().slice(0, 10);
      const choice = await dialog.showSaveDialog(mainWindow, {
        title: "导出 smartTrans 备份", defaultPath: `smartTrans-backup-${date}.json`,
        filters: [{ name: "JSON 备份", extensions: ["json"] }],
      });
      if (choice.canceled || !choice.filePath) return { ok: true, canceled: true };
      writeBackup(choice.filePath, backup);
      return { ok: true, filePath: choice.filePath, favorites: backup.favorites.length, todos: backup.todos.length };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("backup-open", async event => {
    fromMainWindow(event);
    pendingBackup = null;
    try {
      const choice = await dialog.showOpenDialog(mainWindow, {
        title: "导入 smartTrans 备份", properties: ["openFile"],
        filters: [{ name: "JSON 备份", extensions: ["json"] }],
      });
      if (choice.canceled || !choice.filePaths[0]) return { ok: true, canceled: true };
      pendingBackup = readBackup(choice.filePaths[0]);
      return { ok: true, backup: pendingBackup, filePath: choice.filePaths[0] };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("backup-restore-favorites", event => {
    fromMainWindow(event);
    if (!pendingBackup) return { ok: false, error: "请先选择备份文件。" };
    try {
      const beforeNotes = notes.data, beforeTodos = todos.read();
      if (pendingBackup.notes) notes.replace(pendingBackup.notes);
      try {
        if (pendingBackup.todos) todos.replace(pendingBackup.todos);
        favorites.replace(pendingBackup.favorites);
      } catch (error) {
        if (pendingBackup.notes) notes.replace(beforeNotes);
        if (pendingBackup.todos) todos.replace(beforeTodos);
        throw error;
      }
      if (pendingBackup.notes) {
        for (const window of noteWindows.values()) window.destroy();
        if (notes.data.enabled) for (const item of notes.list()) openNote(item);
      }
      pendingBackup = null;
      checkTodoReminders();
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("favorites-list", event => {
    fromMainWindow(event);
    try { return { ok: true, items: favorites.list() }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("favorites-save", (event, payload) => {
    fromMainWindow(event);
    try { return { ok: true, ...favorites.save(payload) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("favorites-remove", (event, id) => {
    fromMainWindow(event);
    try { return { ok: true, item: favorites.remove(id) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  const jiraConnections = new JiraConnections(app.getPath("userData"), safeStorage);
  const jiraFetch = (input, init) => net.fetch(input, init);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "编辑", submenu: [
      { label: "撤销", accelerator: "CommandOrControl+Z", click: () => editorCommand("undo") },
      { label: "重做", accelerator: "CommandOrControl+Shift+Z", click: () => editorCommand("redo") },
      { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }
    ] },
    { label: "翻译", submenu: [
      { label: "唤起窗口", accelerator: "CommandOrControl+Shift+T", click: () => showWindow() },
      { label: "翻译剪贴板", accelerator: "CommandOrControl+Shift+Y", click: clipboardTranslation },
    ] },
    { label: "窗口", submenu: [{ role: "minimize" }, { role: "close" }] },
  ]));
  ipcMain.handle("window-pin", (event, enabled) => {
    fromMainWindow(event);
    if (typeof enabled !== "boolean" || !miniMode) throw new Error("Pin is only available in Mini mode");
    mainWindow.setAlwaysOnTop(enabled, "floating");
    return mainWindow.isAlwaysOnTop();
  });
  ipcMain.handle("window-mini", (event, enabled) => {
    fromMainWindow(event);
    if (typeof enabled !== "boolean") throw new Error("Invalid window mode");
    if (enabled === miniMode) return miniMode;
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    if (enabled) {
      fullWindowMaximized = mainWindow.isMaximized();
      fullWindowBounds = mainWindow.getNormalBounds();
      if (fullWindowMaximized) mainWindow.unmaximize();
      mainWindow.setMinimumSize(Math.min(380, area.width), Math.min(420, area.height));
      const width = Math.min(460, area.width), height = Math.min(640, area.height);
      const x = Math.max(area.x, Math.min(fullWindowBounds.x + fullWindowBounds.width - width, area.x + area.width - width));
      const y = Math.max(area.y, Math.min(fullWindowBounds.y, area.y + area.height - height));
      mainWindow.setBounds({ x, y, width, height });
    } else {
      mainWindow.setAlwaysOnTop(false);
      const original = fullWindowBounds || mainWindow.getBounds();
      const work = screen.getDisplayMatching(original).workArea;
      const width = Math.min(original.width, work.width), height = Math.min(original.height, work.height);
      mainWindow.setMinimumSize(Math.min(650, work.width), Math.min(620, work.height));
      mainWindow.setBounds({ width, height,
        x: Math.max(work.x, Math.min(original.x, work.x + work.width - width)),
        y: Math.max(work.y, Math.min(original.y, work.y + work.height - height)) });
      if (fullWindowMaximized) mainWindow.maximize();
    }
    miniMode = enabled;
    return miniMode;
  });
  ipcMain.handle("speech-start", async (event, payload) => {
    fromMainWindow(event);
    try { return await speech.speak(payload, state => { if (!event.sender.isDestroyed()) event.sender.send("speech-state", state); }); }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("speech-stop", event => {
    fromMainWindow(event); speech.stop(); event.sender.send("speech-state", { speaking: false });
  });
  ipcMain.handle("translate", async (event, payload) => {
    fromMainWindow(event);
    if (activeTranslation) return { ok: false, error: "上一条翻译仍在结束，请稍后重试。" };
    if (typeof payload?.requestId !== "string" || payload.requestId.length > 100) return { ok: false, error: "请求无效。" };
    const controller = new AbortController();
    activeTranslation = { requestId: payload.requestId, controller };
    try {
      const result = await runTranslation(payload, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send("translation-progress", { ...progress, requestId: payload.requestId });
        },
      });
      return { ok: true, ...result };
    } catch (error) { return { ok: false, error: error.message }; }
    finally { activeTranslation = null; }
  });
  ipcMain.handle("learning-assist", async (event, payload) => {
    fromMainWindow(event);
    if (activeTranslation) return { ok: false, error: "请等待当前 AI 操作完成。" };
    if (typeof payload?.requestId !== "string" || payload.requestId.length > 100) return { ok: false, error: "请求无效。" };
    const controller = new AbortController();
    activeTranslation = { requestId: payload.requestId, controller };
    try { return { ok: true, feedback: await runLearningAssist(payload, { signal: controller.signal }) }; }
    catch (error) { return { ok: false, error: error.message }; }
    finally { activeTranslation = null; }
  });
  ipcMain.handle("cancel-translation", (event, requestId) => {
    fromMainWindow(event);
    if (activeTranslation?.requestId === requestId) activeTranslation.controller.abort();
  });
  ipcMain.handle("desktop-status", (event) => { fromMainWindow(event); return shortcuts; });
  ipcMain.handle("cli-status", (event) => {
    fromMainWindow(event);
    return cliStatus();
  });
  ipcMain.handle("copy-text", (event, text) => {
    fromMainWindow(event);
    if (typeof text !== "string") throw new Error("Invalid text");
    clipboard.writeText(text);
  });
  ipcMain.handle("jira-read", async (event, url) => {
    fromMainWindow(event);
    try {
      const response = await readIssue(url, jiraFetch, jiraConnections.get(parseJiraUrl(url).origin));
      if (response.ok) currentJiraIssue = response.issue;
      return response;
    }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-connection-status", (event, url) => {
    fromMainWindow(event);
    try {
      const value = jiraConnections.get(parseJiraUrl(url).origin);
      return { ok: true, connected: Boolean(value), email: value?.email || "", kind: value?.kind || "scoped", cloudId: value?.cloudId || "" };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-connect", async (event, payload) => {
    fromMainWindow(event);
    try {
      const location = parseJiraUrl(payload.url);
      const connection = await resolveConnection(payload.url, payload, jiraFetch);
      const response = await readIssue(payload.url, jiraFetch, connection);
      if (!response.ok) return response;
      jiraConnections.set(location.origin, connection, Boolean(payload.remember));
      currentJiraIssue = response.issue;
      return response;
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-disconnect", (event, url) => {
    fromMainWindow(event);
    try { jiraConnections.remove(parseJiraUrl(url).origin); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-browser-data", async (event, input) => {
    fromMainWindow(event);
    try { await shell.openExternal(issueApiUrl(input)); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-import-clipboard", (event, input) => {
    fromMainWindow(event);
    try {
      currentJiraIssue = importIssueJson(input, clipboard.readText(), currentJiraIssue);
      return { ok: true, issue: currentJiraIssue };
    }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("jira-browser-comments", async (event, payload) => {
    fromMainWindow(event);
    try {
      const location = parseJiraUrl(payload.url);
      if (!currentJiraIssue || currentJiraIssue.url !== location.url || currentJiraIssue.commentsNextStartAt === null) throw new Error("请先导入对应票据，或当前评论已全部导入。");
      await shell.openExternal(commentsApiUrl(payload.url, currentJiraIssue.commentsNextStartAt));
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle("open-external", (event, input) => {
    fromMainWindow(event);
    const url = safeUrl(input);
    if (url) return shell.openExternal(url);
  });
  createWindow();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("译");
  tray.setToolTip("smartTrans");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 smartTrans", click: () => showWindow() },
    { label: "翻译剪贴板", click: clipboardTranslation },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
  shortcuts.show = globalShortcut.register("CommandOrControl+Shift+T", () => showWindow());
  shortcuts.clipboard = globalShortcut.register("CommandOrControl+Shift+Y", clipboardTranslation);
  app.on("activate", () => showWindow());
});
app.on("second-instance", () => showWindow());
app.on("before-quit", () => {
  quitting = true;
  browserBridge?.close();
  speech.stop();
  activeTranslation?.controller.abort();
  globalShortcut.unregisterAll();
  dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
