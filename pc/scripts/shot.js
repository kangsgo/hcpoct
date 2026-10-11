"use strict";

/**
 * 界面截图（无头窗口）
 * 运行：npx electron scripts/shot.js [输出.png]
 * 用 IPC 存根启动真实界面并截图，便于直接查看主题与布局效果。
 */

const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain } = require("electron");

const STUBS = {
  "db:get-settings": () => ({ unit: "a.u." }),
  "db:set-settings": () => ({ ok: true }),
  "db:query-measurements": () => ({
    rows: [
      {
        id: 3,
        created_at: new Date().toISOString(),
        category: "sample",
        value: 0.8231,
        unit: "a.u.",
        raw: "ADC=0.8231",
        payload: "READ",
        port: "/dev/tty.usbserial",
        baud_rate: 115200,
        source: "timed",
        note: "样本 S-1024",
      },
      {
        id: 2,
        created_at: new Date().toISOString(),
        category: "aptamer_blank",
        value: 0.1042,
        unit: "a.u.",
        raw: "ADC=0.1042",
        payload: "READ",
        port: "/dev/tty.usbserial",
        baud_rate: 115200,
        source: "calibration",
        note: "校准采集 2/5",
      },
      {
        id: 1,
        created_at: new Date().toISOString(),
        category: "blank",
        value: 0.0311,
        unit: "a.u.",
        raw: "ADC=0.0311",
        payload: "READ",
        port: "/dev/tty.usbserial",
        baud_rate: 115200,
        source: "calibration",
        note: "校准采集 1/5",
      },
    ],
    total: 3,
    limit: 100,
    offset: 0,
  }),
  "db:save-measurement": () => ({ id: 1 }),
  "db:delete-measurement": () => ({ deleted: 1 }),
  "db:clear-measurements": () => ({ deleted: 0 }),
  "db:counts": () => ({ all: 3, sample: 1, blank: 1, aptamer_blank: 1 }),
  "db:stats": () => ({ window: 10, categories: {}, counts: {} }),
  "db:list-calibrations": () => ({
    rows: [
      {
        id: 2,
        created_at: new Date().toISOString(),
        kind: "aptamer_blank",
        value: 0.1042,
        unit: "a.u.",
        raw: "ADC=0.1042",
        note: "校准采集 2/5",
      },
      {
        id: 1,
        created_at: new Date().toISOString(),
        kind: "blank",
        value: 0.0311,
        unit: "a.u.",
        raw: "ADC=0.0311",
        note: "校准采集 1/5",
      },
    ],
    total: 2,
  }),
  "db:calibration-summary": () => ({
    blank: { n: 3, mean: 0.031, sd: 0.0012, cv: 3.87, min: 0.03, max: 0.032 },
    aptamer_blank: {
      n: 3,
      mean: 0.104,
      sd: 0.0021,
      cv: 2.02,
      min: 0.102,
      max: 0.106,
    },
  }),
  "db:delete-calibration": () => ({ deleted: 1 }),
  "db:clear-calibrations": () => ({ deleted: 0 }),
  "app:info": () => ({
    version: "1.0.0",
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    dbPath: "/tmp/poct-shot.db",
    dataDir: "/tmp",
    platform: process.platform,
  }),
  "app:set-lang": () => ({ ok: true }),
  "app:open-data-dir": () => ({ ok: true }),
  "app:export-csv": () => ({ ok: false, canceled: true }),
  "app:save-text": () => ({ ok: false, canceled: true }),
  "app:reveal-file": () => ({ ok: true }),
  "serial:list": () => ({
    ports: [
      {
        path: "/dev/tty.usbserial-1420",
        manufacturer: "FTDI",
        serialNumber: "A50285BI",
        friendlyName: "/dev/tty.usbserial-1420",
      },
      {
        path: "/dev/tty.Bluetooth-Incoming-Port",
        manufacturer: "",
        serialNumber: "",
        friendlyName: "/dev/tty.Bluetooth-Incoming-Port",
      },
    ],
  }),
  "serial:status": () => ({ connected: false, timed: null }),
};

for (const [channel, handler] of Object.entries(STUBS))
  ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1].startsWith("/")
    ? process.argv[process.argv.length - 1]
    : "/tmp/poct-shot.png";

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 940,
    webPreferences: {
      preload: path.join(__dirname, "..", "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, "..", "src", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 1600));

  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (file) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(file, image.toPNG());
    console.log(`已保存截图：${file}`);
  };

  await shot(out);

  // 英文 + 设置二级菜单
  await js("window.POCT.i18n.setLang('en')");
  await js("document.getElementById('btn-open-settings').click()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await shot(out.replace(/\.png$/, "-en-settings.png"));

  app.exit(0);
});
