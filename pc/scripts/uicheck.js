"use strict";

/**
 * 界面自检（无头窗口，不显示画面）
 * 运行：npx electron scripts/uicheck.js
 * 用于验证：简化后的主界面（空白测试/样品测试）、设置二级菜单、中英文切换是否覆盖静态与动态文案。
 */

const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

// 渲染进程所需的 IPC 存根，使界面可以完整启动
const STUBS = {
  "db:get-settings": () => ({ unit: "a.u." }),
  "db:set-settings": () => ({ ok: true }),
  "db:query-measurements": () => ({
    rows: [],
    total: 0,
    limit: 100,
    offset: 0,
  }),
  "db:save-measurement": () => ({ id: 1 }),
  "db:delete-measurement": () => ({ deleted: 1 }),
  "db:clear-measurements": () => ({ deleted: 0 }),
  "db:counts": () => ({ all: 0, sample: 0, blank: 0, aptamer_blank: 0 }),
  "db:stats": () => ({ window: 10, categories: {}, counts: {} }),
  "db:list-calibrations": () => ({ rows: [], total: 0 }),
  "db:calibration-summary": () => ({
    blank: { n: 0, mean: null, sd: null, cv: null },
    aptamer_blank: { n: 0, mean: null, sd: null, cv: null },
  }),
  "db:delete-calibration": () => ({ deleted: 1 }),
  "db:clear-calibrations": () => ({ deleted: 0 }),
  "app:info": () => ({
    version: "1.0.0",
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    dbPath: "/tmp/poct-uicheck.db",
    dataDir: "/tmp",
    platform: process.platform,
  }),
  "app:set-lang": () => ({ ok: true }),
  "app:open-data-dir": () => ({ ok: true }),
  "app:export-csv": () => ({ ok: false, canceled: true }),
  "app:save-text": () => ({ ok: false, canceled: true }),
  "app:reveal-file": () => ({ ok: true }),
  "serial:list": () => ({ ports: [] }),
  "serial:status": () => ({ connected: false, timed: null }),
};

for (const [channel, handler] of Object.entries(STUBS))
  ipcMain.handle(channel, handler);

function line(name, value) {
  console.log(`  · ${name}：${value}`);
}

app.whenReady().then(async () => {
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

  const errors = [];
  win.webContents.on("console-message", (event) => {
    const level = event && event.level;
    const message = event && event.message;
    if (level === "error" || level === 3) errors.push(String(message));
  });

  await win.loadFile(path.join(__dirname, "..", "src", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 1500)); // 等待 boot() 完成

  const probe = (code) => win.webContents.executeJavaScript(code, true);

  console.log("\n[1] 主题与主界面（简化后）");
  line(
    "body 背景",
    await probe("getComputedStyle(document.body).backgroundColor"),
  );
  line(
    "面板背景",
    await probe(
      "getComputedStyle(document.querySelector('.panel')).backgroundColor",
    ),
  );
  line("正文颜色", await probe("getComputedStyle(document.body).color"));
  line(
    "日志区背景",
    await probe(
      "getComputedStyle(document.getElementById('log-view')).backgroundColor",
    ),
  );
  line(
    "表头背景",
    await probe(
      "getComputedStyle(document.querySelector('#tab-history thead th')).backgroundColor",
    ),
  );
  line(
    "测试按钮背景",
    await probe(
      "getComputedStyle(document.getElementById('btn-blank-test')).backgroundColor",
    ),
  );

  console.log("\n[2] 中文界面（默认）");
  line(
    "语言按钮",
    await probe("document.getElementById('btn-lang').textContent.trim()"),
  );
  line(
    "标题",
    await probe("document.querySelector('.app-header h1').textContent.trim()"),
  );
  line(
    "副标题",
    await probe(
      "document.querySelector('.app-header .sub').textContent.trim()",
    ),
  );
  line(
    "标签页",
    await probe(
      "Array.from(document.querySelectorAll('.tab')).map(b=>b.textContent.trim()).join(' | ')",
    ),
  );
  line(
    "测试按钮",
    await probe(
      "['btn-blank-test','btn-sample-test','btn-session-stop'].map(id=>document.getElementById(id).textContent.trim()).join(' | ')",
    ),
  );
  line(
    "样品测试初始状态",
    await probe(
      "document.getElementById('btn-sample-test').disabled ? '禁用（等待空白测试）' : '可用'",
    ),
  );
  line(
    "空白参照值",
    await probe(
      "document.getElementById('blank-ref-value').textContent.trim()",
    ),
  );
  line(
    "设置按钮",
    await probe(
      "document.getElementById('btn-open-settings').textContent.trim()",
    ),
  );
  line(
    "设置弹窗初始状态",
    await probe(
      "document.getElementById('settings-modal').classList.contains('hidden') ? '隐藏' : '显示'",
    ),
  );
  line(
    "状态徽标",
    await probe("document.getElementById('status-badge').textContent.trim()"),
  );
  line(
    "历史表头(前4)",
    await probe(
      "Array.from(document.querySelectorAll('#tab-history thead th')).slice(0,4).map(t=>t.textContent.trim()).join(' | ')",
    ),
  );

  console.log("\n[3] 打开设置二级菜单");
  await probe("document.getElementById('btn-open-settings').click()");
  line(
    "设置弹窗状态",
    await probe(
      "document.getElementById('settings-modal').classList.contains('hidden') ? '隐藏' : '显示'",
    ),
  );
  line(
    "设置面板标题",
    await probe(
      "Array.from(document.querySelectorAll('#settings-modal .panel-title')).map(t=>t.textContent.trim().replace(/\\s+/g,' ')).slice(0,6).join(' | ')",
    ),
  );
  line(
    "连接按钮",
    await probe(
      "document.getElementById('btn-toggle-connect').textContent.trim()",
    ),
  );
  line(
    "串口提示",
    await probe("document.getElementById('port-hint').textContent.trim()"),
  );
  line(
    "关闭按钮",
    await probe(
      "document.getElementById('btn-close-settings').textContent.trim()",
    ),
  );

  console.log("\n[4] 切换到 English");
  await probe("document.getElementById('btn-lang').click()");
  line("localStorage", await probe("window.localStorage.getItem('poct.lang')"));
  line(
    "语言按钮",
    await probe("document.getElementById('btn-lang').textContent.trim()"),
  );
  line(
    "h1",
    await probe("document.querySelector('.app-header h1').textContent.trim()"),
  );
  line(
    "标签页",
    await probe(
      "Array.from(document.querySelectorAll('.tab')).map(b=>b.textContent.trim()).join(' | ')",
    ),
  );
  line(
    "测试按钮",
    await probe(
      "['btn-blank-test','btn-sample-test'].map(id=>document.getElementById(id).textContent.trim()).join(' | ')",
    ),
  );
  line(
    "设置面板标题(英文)",
    await probe(
      "Array.from(document.querySelectorAll('#settings-modal .panel-title')).map(t=>t.textContent.trim().replace(/\\s+/g,' ')).slice(0,2).join(' | ')",
    ),
  );
  line(
    "控制台按钮",
    await probe(
      "['btn-send','btn-send-only','btn-timed','btn-stop'].map(id=>document.getElementById(id).textContent.trim()).join(' | ')",
    ),
  );
  line(
    "状态徽标",
    await probe("document.getElementById('status-badge').textContent.trim()"),
  );
  line(
    "连接状态行",
    await probe(
      "document.querySelector('.status-card .status-row span').textContent.trim()",
    ),
  );
  line(
    "下拉框选项(校验位)",
    await probe(
      "Array.from(document.getElementById('parity').options).map(o=>o.textContent.trim()).join('/')",
    ),
  );
  line(
    "下拉框选项(分帧)",
    await probe(
      "Array.from(document.getElementById('delimiter').options).map(o=>o.textContent.trim()).join('/')",
    ),
  );
  line(
    "历史表头",
    await probe(
      "Array.from(document.querySelectorAll('#tab-history thead th')).map(t=>t.textContent.trim()).join(' | ')",
    ),
  );

  console.log("\n[5] 动态文案翻译（句式与拼接）");
  line(
    "t('已扫描到 3 个串口')",
    await probe("window.POCT.t('已扫描到 3 个串口')"),
  );
  line(
    "t('开始空白测试：共 5 次，间隔 1000ms，发送 “READ”')",
    await probe(
      "window.POCT.t('开始空白测试：共 5 次，间隔 1000ms，发送 “READ”')",
    ),
  );
  line(
    "t('空白测试采集完成：n=3，均值 120，SD 1.2')",
    await probe("window.POCT.t('空白测试采集完成：n=3，均值 120，SD 1.2')"),
  );
  line(
    "t('样品测试未解析到数值：无返回')",
    await probe("window.POCT.t('样品测试未解析到数值：无返回')"),
  );
  line(
    "t('样品测试完成，已保存：120.5 a.u.')",
    await probe("window.POCT.t('样品测试完成，已保存：120.5 a.u.')"),
  );
  line(
    "t('串口未连接，请先在「设置」中连接串口')",
    await probe("window.POCT.t('串口未连接，请先在「设置」中连接串口')"),
  );
  line(
    "t('等待响应超时（1500ms）')",
    await probe("window.POCT.t('等待响应超时（1500ms）')"),
  );
  line(
    "t('接收时间 10:00:00.000 · /dev/x · 12 字节')",
    await probe("window.POCT.t('接收时间 10:00:00.000 · /dev/x · 12 字节')"),
  );

  console.log("\n[6] 确认弹窗（随语言翻译）");
  line(
    "弹窗文案/按钮",
    await probe(`(async () => {
      const p = window.POCT.confirmDialog('确定要清空全部检测记录与校准记录吗？此操作不可撤销。');
      await new Promise((r) => setTimeout(r, 80));
      const text = document.querySelector('.modal-text').textContent.trim();
      const buttons = Array.from(document.querySelectorAll('.modal-actions .btn')).map((b) => b.textContent.trim()).join(' / ');
      document.querySelector('.modal-actions .btn.ghost').click();
      const answer = await p;
      return text + '  ⇒  ' + buttons + '  ⇒  ' + answer;
    })()`),
  );

  console.log("\n[7] 切回中文（应无损还原）");
  await probe("window.POCT.i18n.setLang('zh')");
  line(
    "h1",
    await probe("document.querySelector('.app-header h1').textContent.trim()"),
  );
  line(
    "标签页",
    await probe(
      "Array.from(document.querySelectorAll('.tab')).map(b=>b.textContent.trim()).join(' | ')",
    ),
  );
  line(
    "语言按钮",
    await probe("document.getElementById('btn-lang').textContent.trim()"),
  );
  line(
    "历史表头(前3)",
    await probe(
      "Array.from(document.querySelectorAll('#tab-history thead th')).slice(0,3).map(t=>t.textContent.trim()).join(' | ')",
    ),
  );

  console.log(
    `\n[8] 渲染进程错误：${errors.length ? errors.join(" ; ") : "无"}`,
  );
  console.log(
    errors.length ? "\n--- UI CHECK FAILED ---\n" : "\n--- UI CHECK OK ---\n",
  );
  app.exit(errors.length ? 1 : 0);
});
