/** 数值 / 时间 / 字节 等通用工具（与桌面版 util.js 行为保持一致） */

import type { Stats } from "./types";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(n: number, digits = 4): number | null {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 解析用户输入的数值，空串 → null */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function emptyToNull(value: unknown): string | null {
  const s = String(value === null || value === undefined ? "" : value).trim();
  return s === "" ? null : s;
}

export function fmtTime(
  iso: string | null | undefined,
  withDate = true,
): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, "0")}`;
  if (!withDate) return time;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

export function fmtNum(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined) return "--";
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4))
    return n.toExponential(3);
  return String(Number(n.toFixed(digits)));
}

/** 从设备返回的任意文本中提取第一个数值（尽量忽略 "CH1" 这类通道号） */
export function parseNumeric(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (!s) return null;
  const strict = s.match(
    /(?<![\w.])[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g,
  );
  const pick =
    strict && strict.length
      ? strict
      : s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!pick || !pick.length) return null;
  const num = Number(pick[0]);
  return Number.isFinite(num) ? num : null;
}

// ------------------------------------------------------------------ 字节处理

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function textToHex(text: string): string {
  return bytesToHex(textToBytes(text));
}

export function hexToBytes(input: string): Uint8Array {
  const clean = String(input)
    .replace(/0x/gi, "")
    .replace(/[^0-9a-fA-F]/g, "");
  if (clean.length === 0) throw new Error("HEX 数据为空");
  if (clean.length % 2 !== 0)
    throw new Error("HEX 数据长度必须为偶数，例如：01 03 00 00");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b.slice();
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ------------------------------------------------------------------ 统计

/** 均值 / 标准差（样本）/ 变异系数，与桌面版 db.js describe() 一致 */
export function describe(values: (number | null | undefined)[]): Stats {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const n = nums.length;
  if (n === 0)
    return { n: 0, mean: null, sd: null, cv: null, min: null, max: null };
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

export function errorMessage(err: unknown): string {
  if (!err) return "未知错误";
  if (err instanceof Error) return err.message;
  return String(err);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
