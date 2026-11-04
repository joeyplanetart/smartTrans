const path = require("node:path");
const { app, BrowserWindow, ipcMain, clipboard, Menu, screen } = require("electron");
const { runTranslation, cliStatus } = require("./cli.cjs");

let mainWindow;
app.setName("smartTrans");
app.setPath("userData", path.join(app.getPath("appData"), "smart-translation"));

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
  mainWindow.on("closed", () => { mainWindow = null; });
}

function fromMainWindow(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Invalid caller");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "编辑", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }
    ] },
    { label: "窗口", submenu: [{ role: "minimize" }, { role: "close" }] },
  ]));
  ipcMain.handle("translate", async (event, payload) => {
    fromMainWindow(event);
    return runTranslation(payload);
  });
  ipcMain.handle("cli-status", (event) => {
    fromMainWindow(event);
    return cliStatus();
  });
  ipcMain.handle("copy-text", (event, text) => {
    fromMainWindow(event);
    if (typeof text !== "string") throw new Error("Invalid text");
    clipboard.writeText(text);
  });
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
