"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
} = require("electron");
const { SerialManager, DEFAULTS } = require("./serial-manager");
const { Store, CATEGORY_LABELS } = require("./db");

const isDev = process.argv.includes("--dev");

const serial = new SerialManager();
let store = null;
let mainWindow = null;

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: "POCT 皮质醇检测工作站",
    backgroundColor: "#f3f7f4",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 开发模式下把渲染进程日志转发到终端，便于排查问题
  mainWindow.webContents.on("console-message", (event) => {
    if (!isDev) return;
    const level = typeof event === "object" ? event.level : event;
    const message = typeof event === "object" ? event.message : undefined;
    const source = typeof event === "object" ? event.sourceId : undefined;
    const line = typeof event === "object" ? event.lineNumber : undefined;
    console.log(
      `[renderer:${level}] ${message} (${source || "?"}:${line === undefined ? "" : line})`,
    );
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] 进程异常退出：", details.reason);
  });

  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
}

process.on("unhandledRejection", (reason) => {
  console.error(
    "[main] unhandledRejection:",
    reason && reason.message ? reason.message : reason,
  );
});

const MENU_TEXT = {
  zh: {
    app: "应用",
    about: "关于",
    devtools: "开发者工具",
    reload: "重新加载",
    quit: "退出",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选",
    serial: "串口",
    refreshPorts: "刷新串口列表",
    stopTimed: "停止定时发送",
  },
  en: {
    app: "App",
    about: "About",
    devtools: "Developer tools",
    reload: "Reload",
    quit: "Quit",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select all",
    serial: "Serial port",
    refreshPorts: "Refresh port list",
    stopTimed: "Stop timed sending",
  },
};

let menuLang = "zh";

function buildMenu(lang) {
  if (lang === "zh" || lang === "en") menuLang = lang;
  const text = MENU_TEXT[menuLang];
  const template = [
    {
      label: text.app,
      submenu: [
        { role: "about", label: text.about },
        { type: "separator" },
        { role: "toggleDevTools", label: text.devtools },
        { role: "reload", label: text.reload },
        { type: "separator" },
        { role: "quit", label: text.quit },
      ],
    },
    {
      label: text.edit,
      submenu: [
        { role: "undo", label: text.undo },
        { role: "redo", label: text.redo },
        { type: "separator" },
        { role: "cut", label: text.cut },
        { role: "copy", label: text.copy },
        { role: "paste", label: text.paste },
        { role: "selectAll", label: text.selectAll },
      ],
    },
    {
      label: text.serial,
      submenu: [
        {
          label: text.refreshPorts,
          accelerator: "CmdOrCtrl+R",
          click: () =>
            broadcast("menu:refresh-ports", { at: new Date().toISOString() }),
        },
        {
          label: text.stopTimed,
          accelerator: "CmdOrCtrl+.",
          click: () => serial.stopTimedSend(text.stopTimed),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- 事件转发
for (const evt of [
  "status",
  "raw",
  "frame",
  "sent",
  "timed",
  "timed-stop",
  "error",
]) {
  serial.on(evt, (payload) => broadcast(`serial:${evt}`, payload));
}

// ------------------------------------------------------------------ IPC 注册
const handlers = {
  // 串口
  "serial:list": async () => ({ ports: await SerialManager.listPorts() }),
  "serial:status": () => serial.status,
  "serial:open": (_e, options) => serial.open(options),
  "serial:close": () => serial.close(),
  "serial:send": (_e, options) => serial.send(options),
  "serial:start-timed": (_e, options) => serial.startTimedSend(options),
  "serial:stop-timed": (_e, reason) => serial.stopTimedSend(reason),

  // 数据
  "db:save-measurement": (_e, input) => store.saveMeasurement(input),
  "db:query-measurements": (_e, filter) => store.queryMeasurements(filter),
  "db:delete-measurement": (_e, id) => store.deleteMeasurement(id),
  "db:clear-measurements": (_e, category) => store.clearMeasurements(category),
  "db:stats": (_e, window) => store.statsRecent(window || 10),
  "db:counts": () => store.counts(),

  // 校准
  "db:list-calibrations": (_e, filter) => store.listCalibrations(filter),
  "db:calibration-summary": (_e, n) => store.calibrationSummary(n || 5),
  "db:delete-calibration": (_e, id) => store.deleteCalibration(id),
  "db:clear-calibrations": (_e, kind) => store.clearCalibrations(kind),

  // 设置与元信息
  "db:get-settings": () => store.allSettings(),
  "db:set-settings": (_e, patch) => store.setSettings(patch),
  "app:info": () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    dbPath: store.file,
    dataDir: app.getPath("userData"),
    platform: process.platform,
    defaults: DEFAULTS,
    categoryLabels: CATEGORY_LABELS,
  }),
  "app:open-data-dir": async () => {
    const dir = app.getPath("userData");
    await shell.openPath(dir);
    return { ok: true, dir };
  },
  "app:set-lang": (_e, lang) => {
    buildMenu(lang === "en" ? "en" : "zh");
    return { ok: true, lang: menuLang };
  },
  "app:export-csv": async (_e, payload = {}) => {
    const rows = Array.isArray(payload) ? payload : payload.rows || [];
    const options = Array.isArray(payload) ? {} : payload;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: options.title || "导出检测记录",
      defaultPath: path.join(
        app.getPath("downloads"),
        `poct-cortisol-${stamp}.csv`,
      ),
      filters: options.filters || [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    const result = store.exportCsv(rows, filePath, options.labels || {});
    return result;
  },
  "app:save-text": async (_e, options = {}) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: options.title || "保存文件",
      defaultPath: path.join(
        app.getPath("downloads"),
        options.defaultName || "export.txt",
      ),
      filters: options.filters || [{ name: "文本文件", extensions: ["txt"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(
      filePath,
      String(options.content === undefined ? "" : options.content),
      "utf8",
    );
    return { ok: true, filePath };
  },
  "app:reveal-file": async (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false };
    shell.showItemInFolder(filePath);
    return { ok: true };
  },
};

for (const [channel, handler] of Object.entries(handlers)) {
  ipcMain.handle(channel, handler);
}

// ------------------------------------------------------------------ 生命周期
app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath("userData"), "poct-cortisol.db"));
  console.log("[main] 数据库已打开：", store.file, "open =", store.db.open);
  buildMenu("zh");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 注意：不要在 window-all-closed 中关闭数据库，
// 关闭开发者工具窗口等场景可能提前触发该事件，导致渲染进程后续 IPC 失败。
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", async (event) => {
  if (store && store.db.open) {
    event.preventDefault();
    await serial.close();
    store.close();
    app.exit(0);
    return;
  }
  await serial.close();
});
