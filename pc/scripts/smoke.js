"use strict";

/**
 * Electron 环境冒烟测试（不创建窗口）
 * 运行：npx electron scripts/smoke.js
 * 用于验证 SQLite 数据层与串口模块在 Electron ABI 下是否正常。
 */

const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");
const { Store } = require("../electron/db");
const { SerialManager } = require("../electron/serial-manager");

let failed = 0;
function check(name, fn) {
  try {
    const result = fn();
    console.log(`  ✓ ${name}${result === undefined ? "" : ` → ${result}`}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name} → ${err.message}`);
  }
}

app.whenReady().then(async () => {
  const file = path.join(app.getPath("userData"), "smoke-test.db");
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${file}${suffix}`, { force: true });

  console.log(`\n[1] SQLite (${file})`);
  const store = new Store(file);
  check("数据库已打开 (db.open)", () => store.db.open);

  let id = null;
  check("写入校准记录", () => {
    const row = store.saveMeasurement({
      category: "aptamer_blank",
      value: 123.45,
      unit: "a.u.",
      raw: "ADC=123.45",
      payload: "READ",
      port: "/dev/tty.test",
      baudRate: 115200,
      source: "calibration",
      note: "smoke",
    });
    id = row.id;
    return `id=${row.id} value=${row.value} category=${row.category}`;
  });

  check("校准表同步写入", () => store.listCalibrations({ kind: "all" }).total);
  check("statsRecent", () =>
    JSON.stringify(store.statsRecent(5).categories.aptamer_blank),
  );
  check(
    "queryMeasurements",
    () => store.queryMeasurements({ category: "all", limit: 10 }).total,
  );
  check("counts", () => JSON.stringify(store.counts()));
  check("setSetting/allSettings", () => {
    store.setSetting("unit", "ng/mL");
    return JSON.stringify(store.allSettings());
  });
  check("deleteMeasurement", () => JSON.stringify(store.deleteMeasurement(id)));
  check("clearMeasurements", () =>
    JSON.stringify(store.clearMeasurements("all")),
  );
  check("clearCalibrations", () =>
    JSON.stringify(store.clearCalibrations("all")),
  );

  check("关闭数据库", () => {
    store.close();
    return `db.open=${store.db.open}`;
  });
  check("关闭后访问会抛出预期错误", () => {
    try {
      store.allSettings();
    } catch (err) {
      return err.message;
    }
    throw new Error("未按预期抛出错误");
  });

  console.log("\n[2] 串口模块");
  await SerialManager.listPorts()
    .then((ports) =>
      console.log(`  ✓ 串口扫描成功 → 发现 ${ports.length} 个设备`),
    )
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ 串口扫描失败 → ${err.message}`);
    });

  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${file}${suffix}`, { force: true });

  console.log(
    failed === 0
      ? "\n--- SMOKE OK ---\n"
      : `\n--- SMOKE FAILED (${failed}) ---\n`,
  );
  app.exit(failed === 0 ? 0 : 1);
});
