"use strict";

/**
 * SQLite 数据层（better-sqlite3，同步 API）
 * - measurements  检测/采集记录
 * - calibrations  空白校准记录
 * - settings      应用设置
 */

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const CATEGORY_LABELS = {
  blank: "空白（仅缓冲液）",
  aptamer_blank: "空白（适配体+染料，无目标物）",
  sample: "样本检测",
};

const CALIBRATION_KINDS = ["blank", "aptamer_blank"];

function round(n, digits = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function describe(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  const n = nums.length;
  if (n === 0) {
    return { n: 0, mean: null, sd: null, cv: null, min: null, max: null };
  }
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  return {
    n,
    mean: round(mean),
    sd: round(sd),
    cv: mean !== 0 ? round((sd / Math.abs(mean)) * 100, 2) : null,
    min: round(Math.min(...nums)),
    max: round(Math.max(...nums)),
  };
}

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this._migrate();
    this._prepare();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS measurements (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        category    TEXT    NOT NULL,
        value       REAL,
        unit        TEXT,
        raw         TEXT,
        payload     TEXT,
        port        TEXT,
        baud_rate   INTEGER,
        source      TEXT,
        note        TEXT,
        meta        TEXT,
        created_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calibrations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT    NOT NULL,
        value       REAL,
        unit        TEXT,
        raw         TEXT,
        note        TEXT,
        created_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       TEXT,
        updated_at  TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_measurements_created  ON measurements(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_measurements_category ON measurements(category, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_calibrations_kind     ON calibrations(kind, created_at DESC);
    `);
  }

  _prepare() {
    this.stmt = {
      insertMeasurement: this.db.prepare(`
        INSERT INTO measurements (category, value, unit, raw, payload, port, baud_rate, source, note, meta, created_at)
        VALUES (@category, @value, @unit, @raw, @payload, @port, @baud_rate, @source, @note, @meta, @created_at)
      `),
      getMeasurement: this.db.prepare(
        "SELECT * FROM measurements WHERE id = ?",
      ),
      deleteMeasurement: this.db.prepare(
        "DELETE FROM measurements WHERE id = ?",
      ),
      clearMeasurements: this.db.prepare("DELETE FROM measurements"),
      clearByCategory: this.db.prepare(
        "DELETE FROM measurements WHERE category = ?",
      ),
      counts: this.db.prepare(
        "SELECT category, COUNT(*) AS count FROM measurements GROUP BY category",
      ),
      valuesByCategory: this.db.prepare(
        "SELECT value FROM measurements WHERE category = ? AND value IS NOT NULL ORDER BY id DESC LIMIT ?",
      ),
      insertCalibration: this.db.prepare(`
        INSERT INTO calibrations (kind, value, unit, raw, note, created_at)
        VALUES (@kind, @value, @unit, @raw, @note, @created_at)
      `),
      deleteCalibration: this.db.prepare(
        "DELETE FROM calibrations WHERE id = ?",
      ),
      clearCalibrations: this.db.prepare("DELETE FROM calibrations"),
      clearCalibrationsByKind: this.db.prepare(
        "DELETE FROM calibrations WHERE kind = ?",
      ),
      calibrationValues: this.db.prepare(
        "SELECT value FROM calibrations WHERE kind = ? ORDER BY id DESC LIMIT ?",
      ),
      upsertSetting: this.db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @updated_at)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `),
      allSettings: this.db.prepare("SELECT key, value FROM settings"),
    };
  }

  // ------------------------------------------------------------ measurements

  saveMeasurement(input = {}) {
    const category = CATEGORY_LABELS[input.category]
      ? input.category
      : "sample";
    const value =
      input.value === null || input.value === undefined || input.value === ""
        ? null
        : Number(input.value);
    const row = {
      category,
      value: Number.isFinite(value) ? value : null,
      unit: input.unit ? String(input.unit) : "a.u.",
      raw:
        input.raw === undefined || input.raw === null
          ? null
          : String(input.raw),
      payload:
        input.payload === undefined || input.payload === null
          ? null
          : String(input.payload),
      port: input.port || null,
      baud_rate: input.baudRate ? Number(input.baudRate) : null,
      source: input.source || "manual",
      note: input.note || null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      created_at: input.createdAt || new Date().toISOString(),
    };
    const info = this.stmt.insertMeasurement.run(row);

    if (CALIBRATION_KINDS.includes(category)) {
      this.stmt.insertCalibration.run({
        kind: category,
        value: row.value,
        unit: row.unit,
        raw: row.raw,
        note: row.note,
        created_at: row.created_at,
      });
    }

    return this.stmt.getMeasurement.get(info.lastInsertRowid);
  }

  queryMeasurements(filter = {}) {
    const where = [];
    const params = {};

    if (filter.category && filter.category !== "all") {
      where.push("category = @category");
      params.category = filter.category;
    }
    if (filter.from) {
      where.push("created_at >= @from");
      params.from = filter.from;
    }
    if (filter.to) {
      where.push("created_at <= @to");
      params.to = filter.to;
    }
    if (filter.keyword) {
      where.push(
        "(IFNULL(note, '') LIKE @kw OR IFNULL(raw, '') LIKE @kw OR IFNULL(payload, '') LIKE @kw)",
      );
      params.kw = `%${filter.keyword}%`;
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 2000);
    const offset = Math.max(Number(filter.offset) || 0, 0);

    const rows = this.db
      .prepare(
        `SELECT * FROM measurements ${clause} ORDER BY datetime(created_at) DESC, id DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset });

    const total = this.db
      .prepare(`SELECT COUNT(*) AS c FROM measurements ${clause}`)
      .get(params).c;

    return { rows, total, limit, offset };
  }

  deleteMeasurement(id) {
    return { deleted: this.stmt.deleteMeasurement.run(id).changes };
  }

  clearMeasurements(category) {
    const info =
      category && category !== "all"
        ? this.stmt.clearByCategory.run(category)
        : this.stmt.clearMeasurements.run();
    return { deleted: info.changes };
  }

  counts() {
    const out = { all: 0, blank: 0, aptamer_blank: 0, sample: 0 };
    for (const row of this.stmt.counts.all()) {
      out[row.category] = row.count;
      out.all += row.count;
    }
    return out;
  }

  /** 各类别最近 n 条的统计（均值/标准差/变异系数） */
  statsRecent(n = 10) {
    const result = {};
    for (const kind of Object.keys(CATEGORY_LABELS)) {
      const values = this.stmt.valuesByCategory
        .all(kind, n)
        .map((r) => r.value);
      result[kind] = describe(values);
    }
    return { window: n, categories: result, counts: this.counts() };
  }

  // ------------------------------------------------------------ calibrations

  listCalibrations(filter = {}) {
    const where = [];
    const params = {};
    if (filter.kind && filter.kind !== "all") {
      where.push("kind = @kind");
      params.kind = filter.kind;
    }
    if (filter.from) {
      where.push("created_at >= @from");
      params.from = filter.from;
    }
    if (filter.to) {
      where.push("created_at <= @to");
      params.to = filter.to;
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 2000);
    const rows = this.db
      .prepare(
        `SELECT * FROM calibrations ${clause} ORDER BY datetime(created_at) DESC, id DESC LIMIT @limit`,
      )
      .all({ ...params, limit });
    const total = this.db
      .prepare(`SELECT COUNT(*) AS c FROM calibrations ${clause}`)
      .get(params).c;
    return { rows, total };
  }

  /** 空白校准参照值（最近 n 次） */
  calibrationSummary(n = 5) {
    const out = {};
    for (const kind of CALIBRATION_KINDS) {
      const values = this.stmt.calibrationValues
        .all(kind, n)
        .map((r) => r.value);
      out[kind] = describe(values);
    }
    return out;
  }

  deleteCalibration(id) {
    return { deleted: this.stmt.deleteCalibration.run(id).changes };
  }

  clearCalibrations(kind) {
    const info =
      kind && kind !== "all"
        ? this.stmt.clearCalibrationsByKind.run(kind)
        : this.stmt.clearCalibrations.run();
    return { deleted: info.changes };
  }

  // ---------------------------------------------------------------- settings

  allSettings() {
    const out = {};
    for (const row of this.stmt.allSettings.all()) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        out[row.key] = row.value;
      }
    }
    return out;
  }

  setSetting(key, value) {
    this.stmt.upsertSetting.run({
      key: String(key),
      value: JSON.stringify(value === undefined ? null : value),
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  setSettings(patch = {}) {
    const tx = this.db.transaction((entries) => {
      for (const [k, v] of entries) this.setSetting(k, v);
    });
    tx(Object.entries(patch));
    return { ok: true, keys: Object.keys(patch) };
  }

  // ------------------------------------------------------------------ export

  exportCsv(rows, filePath, labels = {}) {
    const header = labels.headers || [
      "ID",
      "时间",
      "类别",
      "数值",
      "单位",
      "原始返回",
      "发送内容",
      "串口",
      "波特率",
      "来源",
      "备注",
    ];
    const categories = labels.categories || CATEGORY_LABELS;
    const sources = labels.sources || {};
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.map(esc).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.created_at,
          categories[r.category] || r.category,
          r.value,
          r.unit,
          r.raw,
          r.payload,
          r.port,
          r.baud_rate,
          sources[r.source] || r.source,
          r.note,
        ]
          .map(esc)
          .join(","),
      );
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join("\r\n")}`, "utf8");
    return { ok: true, filePath, count: rows.length };
  }

  close() {
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { Store, CATEGORY_LABELS, CALIBRATION_KINDS };
