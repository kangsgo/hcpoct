/**
 * 轻量日志总线
 * ---------------------------------------------------------------------------
 * 实时数据流日志既包含串口事件（TX/RX/ERR），也包含各屏幕写入的系统消息。
 * 为避免每来一帧数据就重渲染整个应用，日志不放在 React 全局状态里，
 * 而是通过这个极小的发布订阅总线交给 LogView 组件单独消费。
 */

export type LogDirection = "tx" | "rx" | "err" | "sys";

export interface LogLine {
  id: number;
  dir: LogDirection;
  text: string;
  hex?: string;
  at: string;
}

type Listener = () => void;

let lines: LogLine[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const MAX_LINES = 500;

export function pushLog(dir: LogDirection, text: string, hex?: string): void {
  lines = [
    ...lines,
    { id: (seq += 1), dir, text, hex, at: new Date().toISOString() },
  ];
  if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
  notify();
}

export function clearLog(): void {
  lines = [];
  notify();
}

export function getLogLines(): LogLine[] {
  return lines;
}

export function subscribeLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
