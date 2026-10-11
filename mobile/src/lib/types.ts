/** 全局领域类型（与桌面版 SQLite 表结构保持一致，便于两端数据互认） */

export type Category = "sample" | "blank" | "aptamer_blank";
export type CalibrationKind = "blank" | "aptamer_blank";
export type SourceKind = "manual" | "timed" | "calibration";
export type Encoding = "ascii" | "hex";
export type Terminator = "none" | "lf" | "cr" | "crlf";
export type Parity = "none" | "even" | "odd";

export interface Measurement {
  id: number;
  category: Category;
  value: number | null;
  unit: string;
  raw: string | null;
  payload: string | null;
  port: string | null;
  baudRate: number | null;
  source: SourceKind;
  note: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface Calibration {
  id: number;
  kind: CalibrationKind;
  value: number | null;
  unit: string;
  raw: string | null;
  note: string | null;
  createdAt: string;
}

export interface MeasurementInput {
  category: Category;
  value: number | null;
  unit?: string;
  raw?: string | null;
  payload?: string | null;
  port?: string | null;
  baudRate?: number | null;
  source?: SourceKind;
  note?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface MeasurementFilter {
  category?: Category | "all";
  keyword?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

export interface Stats {
  n: number;
  mean: number | null;
  sd: number | null;
  cv: number | null;
  min: number | null;
  max: number | null;
}

export interface AppSettings {
  // 采集控制台
  payload: string;
  encoding: Encoding;
  terminator: Terminator;
  timeout: number;
  interval: number;
  times: number;
  expectResponse: boolean;
  autoSave: boolean;
  framesOnly: boolean;
  // 连接
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: Parity;
  frameDelay: number;
  delimiter: string;
  // 测量
  unit: string;
  calibrationWindow: number;
  curveEnabled: boolean;
  curveSlope: number;
  curveIntercept: number;
  curveUnit: string;
  // 界面
  lang: "zh" | "en";
}

export const CATEGORY_LABELS: Record<Category, string> = {
  blank: "空白（仅缓冲液）",
  aptamer_blank: "空白（适配体+染料）",
  sample: "样本检测",
};

export const CATEGORY_SHORT: Record<Category, string> = {
  blank: "空白",
  aptamer_blank: "适配体空白",
  sample: "样本",
};

export const SOURCE_LABELS: Record<SourceKind, string> = {
  manual: "手动",
  timed: "定时",
  calibration: "校准",
};

export const CALIBRATION_KINDS: CalibrationKind[] = ["blank", "aptamer_blank"];

export const DEFAULT_SETTINGS: AppSettings = {
  payload: "READ",
  encoding: "ascii",
  terminator: "crlf",
  timeout: 1500,
  interval: 1000,
  times: 5,
  expectResponse: true,
  autoSave: false,
  framesOnly: false,
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  frameDelay: 120,
  delimiter: "",
  unit: "a.u.",
  calibrationWindow: 5,
  curveEnabled: false,
  curveSlope: 1,
  curveIntercept: 0,
  curveUnit: "ng/mL",
  lang: "zh",
};

export const COMMON_BAUD = [
  1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];
