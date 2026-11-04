const path = require("node:path");
const { app, BrowserWindow, ipcMain, clipboard, Menu, screen, Tray, nativeImage, globalShortcut, net, safeStorage, shell } = require("electron");
const { runTranslation, cliStatus, dispose } = require("./cli.cjs");
const { readIssue, parseJiraUrl, safeUrl, issueApiUrl, commentsApiUrl, importIssueJson, resolveConnection } = require("./jira.cjs");
const { JiraConnections } = require("./jira-connections.cjs");

let mainWindow;
let tray;
let quitting = false;
let activeTranslation;
let currentJiraIssue = null;
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
    if (!params.isEditable || !(params.selectionText || "").trim()) return;
    Menu.buildFromTemplate([
      { label: "翻译选中内容", click: () => mainWindow?.webContents.send("translate-selection") },
      { type: "separator" },
      { role: "copy", label: "复制" },
      { role: "selectAll", label: "全选" },
    ]).popup({ window: mainWindow });
  });
  mainWindow.on("close", (event) => {
    if (!quitting) { event.preventDefault(); mainWindow.hide(); }
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

app.whenReady().then(() => {
  if (!primaryInstance) return;
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
  activeTranslation?.controller.abort();
  globalShortcut.unregisterAll();
  dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
