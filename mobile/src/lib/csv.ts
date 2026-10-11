/** CSV 导出（列与桌面版 db.js exportCsv 一致，便于两端数据互认） */

import type { Measurement } from "./types";

export interface CsvLabels {
  headers: string[];
  categories: Record<string, string>;
  sources: Record<string, string>;
}

function esc(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: Measurement[], labels: CsvLabels): string {
  const lines: string[] = [labels.headers.map(esc).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt,
        labels.categories[r.category] || r.category,
        r.value,
        r.unit,
        r.raw,
        r.payload,
        r.port,
        r.baudRate,
        labels.sources[r.source] || r.source,
        r.note,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function timeStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** 触发浏览器下载（手机浏览器会存到「下载/文件」中） */
export function downloadText(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): string {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

/** CSV 带 BOM，Excel / WPS 打开不乱码 */
export function downloadCsv(filename: string, csv: string): string {
  return downloadText(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}
