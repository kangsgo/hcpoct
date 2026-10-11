/**
 * 本地数据层（localStorage）
 * ---------------------------------------------------------------------------
 * 手机版没有 Node/SQLite 环境，这里用 localStorage 复刻桌面版 db.js 的能力：
 * measurements（检测/采集记录）、calibrations（空白校准记录）、settings（设置）。
 * 表结构与字段命名与 SQLite 版本一致（created_at → createdAt），
 * 导出的 CSV 也与桌面版保持同样的列，方便两端数据互通。
 */

import {
  CALIBRATION_KINDS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type Calibration,
  type CalibrationKind,
  type Category,
  type Measurement,
  type MeasurementFilter,
  type MeasurementInput,
  type SourceKind,
  type Stats,
} from "./types";
import { describe, toNumberOrNull } from "./format";

const KEY_MEASUREMENTS = "poct.mobile.measurements";
const KEY_CALIBRATIONS = "poct.mobile.calibrations";
const KEY_SETTINGS = "poct.mobile.settings";
const KEY_COUNTERS = "poct.mobile.counters";
const KEY_LANG = "poct.mobile.lang";

const MAX_RECORDS = 5000;

interface Counters {
  measurement: number;
  calibration: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // 超出配额时给出明确提示，避免静默丢数据
    throw new Error(
      `本地存储写入失败（可能已超出容量上限）：${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ------------------------------------------------------------------ 内存状态

let measurements: Measurement[] = normalizeMeasurements(
  readJson<Measurement[]>(KEY_MEASUREMENTS, []),
);
let calibrations: Calibration[] = normalizeCalibrations(
  readJson<Calibration[]>(KEY_CALIBRATIONS, []),
);
let counters: Counters = readJson<Counters>(KEY_COUNTERS, {
  measurement: 0,
  calibration: 0,
});

function normalizeMeasurements(rows: Measurement[]): Measurement[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === "object" && r.id !== undefined);
}

function normalizeCalibrations(rows: Calibration[]): Calibration[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === "object" && r.id !== undefined);
}

function persistMeasurements(): void {
  if (measurements.length > MAX_RECORDS)
    measurements = measurements.slice(0, MAX_RECORDS);
  writeJson(KEY_MEASUREMENTS, measurements);
}

function persistCalibrations(): void {
  if (calibrations.length > MAX_RECORDS)
    calibrations = calibrations.slice(0, MAX_RECORDS);
  writeJson(KEY_CALIBRATIONS, calibrations);
}

function persistCounters(): void {
  writeJson(KEY_COUNTERS, counters);
}

function nextId(kind: "measurement" | "calibration"): number {
  counters = { ...counters, [kind]: (counters[kind] || 0) + 1 };
  persistCounters();
  return counters[kind];
}

function timeValue(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** 与桌面版一致：时间倒序，同一时刻按 id 倒序 */
function sortDesc<T extends { id: number; createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = timeValue(b.createdAt) - timeValue(a.createdAt);
    return diff !== 0 ? diff : b.id - a.id;
  });
}

// ---------------------------------------------------------------- measurements

export interface MeasurementQueryResult {
  rows: Measurement[];
  total: number;
  limit: number;
  offset: number;
}

export function listMeasurements(
  filter: MeasurementFilter = {},
): MeasurementQueryResult {
  const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 2000);
  const offset = Math.max(Number(filter.offset) || 0, 0);
  const keyword = filter.keyword ? String(filter.keyword).toLowerCase() : "";
  const from = filter.from ? timeValue(filter.from) : null;
  const to = filter.to ? timeValue(filter.to) : null;

  const filtered = sortDesc(measurements).filter((r) => {
    if (
      filter.category &&
      filter.category !== "all" &&
      r.category !== filter.category
    )
      return false;
    const t = timeValue(r.createdAt);
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    if (keyword) {
      const haystack = [r.note, r.raw, r.payload]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  };
}

export function allMeasurements(): Measurement[] {
  return sortDesc(measurements);
}

export interface Counts {
  all: number;
  blank: number;
  aptamer_blank: number;
  sample: number;
}

export function counts(): Counts {
  const out: Counts = { all: 0, blank: 0, aptamer_blank: 0, sample: 0 };
  for (const row of measurements) {
    out[row.category] += 1;
    out.all += 1;
  }
  return out;
}

export function saveMeasurement(input: MeasurementInput): Measurement {
  const value = toNumberOrNull(input.value);
  const createdAt = input.createdAt || new Date().toISOString();
  const row: Measurement = {
    id: nextId("measurement"),
    category: input.category,
    value,
    unit: input.unit ? String(input.unit) : "a.u.",
    raw:
      input.raw === undefined || input.raw === null ? null : String(input.raw),
    payload:
      input.payload === undefined || input.payload === null
        ? null
        : String(input.payload),
    port: input.port || null,
    baudRate: input.baudRate ? Number(input.baudRate) : null,
    source: (input.source || "manual") as SourceKind,
    note: input.note || null,
    meta: input.meta || null,
    createdAt,
  };
  measurements = [row, ...measurements];
  persistMeasurements();

  // 空白类记录同步写入校准表，用于计算参照值（与桌面版 db.js 相同行为）
  if ((CALIBRATION_KINDS as string[]).includes(row.category)) {
    saveCalibration({
      kind: row.category as CalibrationKind,
      value: row.value,
      unit: row.unit,
      raw: row.raw,
      note: row.note,
      createdAt: row.createdAt,
    });
  }
  return row;
}

export function deleteMeasurement(id: number): number {
  const before = measurements.length;
  measurements = measurements.filter((r) => r.id !== id);
  persistMeasurements();
  return before - measurements.length;
}

export function clearMeasurements(category?: Category | "all"): number {
  const before = measurements.length;
  measurements =
    category && category !== "all"
      ? measurements.filter((r) => r.category !== category)
      : [];
  persistMeasurements();
  return before - measurements.length;
}

/** 各类别最近 n 条的统计（均值/标准差/变异系数） */
export function statsRecent(n = 10): {
  window: number;
  categories: Record<Category, Stats>;
  counts: Counts;
} {
  const categories = {} as Record<Category, Stats>;
  for (const kind of ["blank", "aptamer_blank", "sample"] as Category[]) {
    const values = measurements
      .filter((r) => r.category === kind)
      .slice(0, n)
      .map((r) => r.value);
    categories[kind] = describe(values);
  }
  return { window: n, categories, counts: counts() };
}

// ---------------------------------------------------------------- calibrations

function saveCalibration(input: {
  kind: CalibrationKind;
  value: number | null;
  unit: string;
  raw: string | null;
  note: string | null;
  createdAt: string;
}): Calibration {
  const row: Calibration = {
    id: nextId("calibration"),
    kind: input.kind,
    value: input.value,
    unit: input.unit,
    raw: input.raw,
    note: input.note,
    createdAt: input.createdAt,
  };
  calibrations = [row, ...calibrations];
  persistCalibrations();
  return row;
}

export function listCalibrations(
  filter: {
    kind?: CalibrationKind | "all";
    limit?: number;
  } = {},
): { rows: Calibration[]; total: number } {
  const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 2000);
  const filtered = sortDesc(calibrations).filter(
    (r) => !filter.kind || filter.kind === "all" || r.kind === filter.kind,
  );
  return { rows: filtered.slice(0, limit), total: filtered.length };
}

/** 空白校准参照值（最近 n 次的均值） */
export function calibrationSummary(n = 5): Record<CalibrationKind, Stats> {
  const out = {} as Record<CalibrationKind, Stats>;
  for (const kind of CALIBRATION_KINDS) {
    const values = sortDesc(calibrations)
      .filter((r) => r.kind === kind)
      .slice(0, n)
      .map((r) => r.value);
    out[kind] = describe(values);
  }
  return out;
}

export function deleteCalibration(id: number): number {
  const before = calibrations.length;
  calibrations = calibrations.filter((r) => r.id !== id);
  persistCalibrations();
  return before - calibrations.length;
}

export function clearCalibrations(kind?: CalibrationKind | "all"): number {
  const before = calibrations.length;
  calibrations =
    kind && kind !== "all" ? calibrations.filter((r) => r.kind !== kind) : [];
  persistCalibrations();
  return before - calibrations.length;
}

// -------------------------------------------------------------------- settings

export function loadSettings(): AppSettings {
  const stored = readJson<Partial<AppSettings>>(KEY_SETTINGS, {});
  const lang = readJson<string | null>(KEY_LANG, null);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored && typeof stored === "object" ? stored : {}),
    ...(lang === "en" || lang === "zh" ? { lang } : {}),
  };
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  writeJson(KEY_SETTINGS, next);
  if (patch.lang === "zh" || patch.lang === "en")
    writeJson(KEY_LANG, patch.lang);
  return next;
}

export function resetSettings(): AppSettings {
  writeJson(KEY_SETTINGS, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

// ------------------------------------------------------------------ 存储信息

export function storageSize(): number {
  let total = 0;
  for (const key of [
    KEY_MEASUREMENTS,
    KEY_CALIBRATIONS,
    KEY_SETTINGS,
    KEY_COUNTERS,
  ]) {
    total += window.localStorage.getItem(key)?.length ?? 0;
  }
  // localStorage 以 UTF-16 存储，字节数 ≈ 字符数 × 2
  return total * 2;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function clearAll(): { measurements: number; calibrations: number } {
  const a = clearMeasurements("all");
  const b = clearCalibrations("all");
  return { measurements: a, calibrations: b };
}
