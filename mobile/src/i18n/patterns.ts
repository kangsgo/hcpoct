/**
 * 日志文案翻译
 * ---------------------------------------------------------------------------
 * 串口层（lib/serial.ts）抛出的消息是带变量的中文整句（如「等待响应超时（1500ms）」），
 * 无法直接用词条表命中。这里用与桌面版 i18n.js PATTERNS 相同的思路，
 * 先查整句词条，再用正则句式兜底，保证英文模式下日志也是英文。
 */

import { EN } from "./dict";
import type { Lang } from "./index";

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^等待响应超时（(\d+)ms）$/, (m) => `Response timeout (${m[1]}ms)`],
  [/^打开串口失败：(.+)$/, (m) => `Failed to open the port: ${m[1]}`],
  [/^写入串口失败：(.+)$/, (m) => `Failed to write to the port: ${m[1]}`],
  [/^读取串口数据失败：(.+)$/, (m) => `Failed to read from the port: ${m[1]}`],
  [/^读取串口列表失败：(.+)$/, (m) => `Failed to read the port list: ${m[1]}`],
  [
    /^选择串口设备失败：(.+)$/,
    (m) => `Failed to add the serial device: ${m[1]}`,
  ],
  [/^连接失败：(.+)$/, (m) => `Connection failed: ${m[1]}`],
  [/^已连接 (.+)$/, (m) => `Connected ${m[1]}`],
  [/^串口已打开：(.+)$/, (m) => `Port opened: ${m[1]}`],
  [/^已清空 (\d+) 条校准记录$/, (m) => `Cleared ${m[1]} calibration record(s)`],
  [/^已清空 (\d+) 条记录$/, (m) => `Cleared ${m[1]} record(s)`],
];

export function translateLoose(lang: Lang, text: string): string {
  if (lang !== "en") return text;
  const key = text.trim();
  if (!key) return text;
  if (EN[key]) return EN[key];
  for (const [re, build] of PATTERNS) {
    const m = key.match(re);
    if (m) {
      try {
        return build(m);
      } catch {
        return key;
      }
    }
  }
  return key;
}
