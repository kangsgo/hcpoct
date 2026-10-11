/**
 * 串口服务（Web Serial API）
 * ---------------------------------------------------------------------------
 * 在浏览器 / 手机浏览器中复刻桌面版 electron/serial-manager.js 的能力：
 *  - 列出已授权串口、请求新设备（受浏览器安全限制，必须由用户手势触发）
 *  - 打开/关闭串口并设置波特率、数据位、停止位、校验位
 *  - 发送任意数据并等待返回（自由协议）
 *  - 空闲分帧（无结束符时按空闲时间切分）+ 结束符分帧
 *  - 定时发送（间隔 + 次数），每轮结果通过事件回传
 *
 * 说明：Web Serial 仅在安全上下文（https / localhost）且浏览器支持时可用，
 * 目前 Android Chrome / Edge 支持较好，iOS Safari 尚不支持。
 * 不支持时 isSupported() 返回 false，界面会提示改用「手动录入」方式记录数据。
 */

import {
  bytesToHex,
  bytesToText,
  concatBytes,
  errorMessage,
  hexToBytes,
  indexOfBytes,
  textToBytes,
} from "./format";
import type { Encoding, Parity, Terminator } from "./types";

// ------------------------------------------------------------- 最小 Web Serial 类型

interface WebSerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface WebSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: Parity;
    bufferSize?: number;
    flowControl?: "none" | "hardware";
  }): Promise<void>;
  close(): Promise<void>;
  getInfo(): WebSerialPortInfo;
}

interface WebSerial extends EventTarget {
  getPorts(): Promise<WebSerialPort[]>;
  requestPort(options?: unknown): Promise<WebSerialPort>;
}

function getWebSerial(): WebSerial | null {
  const nav = navigator as Navigator & { serial?: WebSerial };
  return nav.serial ?? null;
}

// ------------------------------------------------------------------- 对外类型

export interface PortEntry {
  id: string;
  label: string;
  detail: string;
}

export interface SerialStatus {
  connected: boolean;
  portLabel: string | null;
  baudRate: number | null;
  dataBits: number | null;
  stopBits: number | null;
  parity: Parity | null;
  frameDelay: number;
  timed: TimedSnapshot | null;
}

export interface TimedSnapshot {
  interval: number;
  times: number;
  sent: number;
  failed: number;
  startedAt: string;
}

export interface FrameInfo {
  text: string;
  hex: string;
  length: number;
  at: string;
}

export interface RawChunk {
  text: string;
  hex: string;
  length: number;
  at: string;
}

export interface SentInfo {
  text: string;
  hex: string;
  length: number;
  at: string;
}

export interface SerialErrorInfo {
  message: string;
  at: string;
}

export interface TimedTickInfo {
  index: number;
  total: number;
  ok: boolean;
  response: FrameInfo | null;
  sentAt: string;
  payloadHex: string | null;
  error: string | null;
  reached: boolean;
}

export interface TimedStopInfo {
  reason: string;
  sent: number;
  failed: number;
  at: string;
}

export interface OpenOptions {
  portId: string;
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: Parity;
  frameDelay?: number;
  /** 分帧结束符，空串表示仅按空闲时间分帧 */
  delimiter?: string;
}

export interface SendOptions {
  data: string;
  encoding?: Encoding;
  terminator?: Terminator;
  expectResponse?: boolean;
  timeout?: number;
}

export interface SendResult {
  ok: boolean;
  response: FrameInfo | null;
  sentAt: string;
  payloadHex: string;
  timedOut: boolean;
  error?: string;
}

export interface TimedSendOptions extends SendOptions {
  interval?: number;
  times?: number;
}

export interface SerialEventMap {
  status: SerialStatus;
  raw: RawChunk;
  frame: FrameInfo;
  sent: SentInfo;
  "timed-tick": TimedTickInfo;
  "timed-stop": TimedStopInfo;
  error: SerialErrorInfo;
}

interface Waiter {
  promise: Promise<FrameInfo>;
  resolve: (frame: FrameInfo) => void;
  reject: (err: Error) => void;
  timer: number;
}

interface TimedState {
  interval: number;
  times: number;
  timeout: number;
  sent: number;
  failed: number;
  busy: boolean;
  startedAt: string;
  timer: number | null;
  options: TimedSendOptions;
}

const DEFAULTS = {
  baudRate: 115200,
  frameDelay: 120,
  responseTimeout: 1500,
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeInfo(port: WebSerialPort): WebSerialPortInfo | null {
  try {
    return port.getInfo();
  } catch {
    return null;
  }
}

/** 浏览器不提供设备路径，用 VID:PID 生成可读标签 */
function describePort(port: WebSerialPort, index: number): PortEntry {
  const info = safeInfo(port);
  const vid = info?.usbVendorId;
  const pid = info?.usbProductId;
  if (typeof vid === "number" && vid > 0) {
    const v = vid.toString(16).padStart(4, "0").toUpperCase();
    const p =
      typeof pid === "number" && pid > 0
        ? pid.toString(16).padStart(4, "0").toUpperCase()
        : "????";
    return {
      id: portId(port),
      label: `USB 串口设备 ${v}:${p}`,
      detail: `VID:PID ${v}:${p}`,
    };
  }
  return {
    id: portId(port),
    label: `串口设备 #${index + 1}`,
    detail: "浏览器未提供设备标识",
  };
}

// 同一设备对象在本次会话内保持稳定 id
const portIds = new WeakMap<WebSerialPort, string>();
let portSeq = 0;
const knownPorts = new Map<string, WebSerialPort>();

function portId(port: WebSerialPort): string {
  let id = portIds.get(port);
  if (!id) {
    portSeq += 1;
    id = `port-${portSeq}`;
    portIds.set(port, id);
    knownPorts.set(id, port);
  }
  return id;
}

// ------------------------------------------------------------------- 服务实现

export class SerialService {
  private port: WebSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private frameTimer: number | null = null;
  private frameDelay = DEFAULTS.frameDelay;
  private delimiter: Uint8Array | null = null;
  private waiters: Waiter[] = [];
  private timed: TimedState | null = null;
  private info: Omit<
    SerialStatus,
    "timed" | "connected" | "frameDelay"
  > | null = null;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  static isSupported(): boolean {
    return Boolean(getWebSerial());
  }

  // ------------------------------------------------------------ 事件订阅

  on<K extends keyof SerialEventMap>(
    event: K,
    callback: (payload: SerialEventMap[K]) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const fn = callback as (payload: unknown) => void;
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  private emit<K extends keyof SerialEventMap>(
    event: K,
    payload: SerialEventMap[K],
  ): void {
    for (const cb of this.listeners.get(event) ?? []) {
      try {
        cb(payload);
      } catch {
        /* 单个监听器异常不影响其他监听器 */
      }
    }
  }

  private emitError(message: string): void {
    this.emit("error", { message, at: nowIso() });
  }

  // ------------------------------------------------------------ 设备发现

  /** 已授权（曾经连接过）的串口设备 */
  async listPorts(): Promise<PortEntry[]> {
    const serial = getWebSerial();
    if (!serial) return [];
    try {
      const ports = await serial.getPorts();
      return ports.map((p, i) => describePort(p, i));
    } catch (err) {
      throw new Error(`读取串口列表失败：${errorMessage(err)}`);
    }
  }

  /** 弹出浏览器设备选择框（必须在用户点击事件中调用） */
  async requestPort(): Promise<PortEntry> {
    const serial = getWebSerial();
    if (!serial) throw new Error("当前浏览器不支持 Web Serial，无法连接串口");
    try {
      const port = await serial.requestPort({});
      const list = await this.listPorts();
      const entry =
        list.find((item) => item.id === portId(port)) ?? describePort(port, 0);
      return entry;
    } catch (err) {
      const message = errorMessage(err);
      if (/No port selected|NotFoundError|cancel/i.test(message))
        throw new Error("未选择串口设备");
      throw new Error(`选择串口设备失败：${message}`);
    }
  }

  // ------------------------------------------------------------ 连接状态

  get isOpen(): boolean {
    return Boolean(this.port);
  }

  get status(): SerialStatus {
    const t = this.timed;
    return {
      connected: this.isOpen,
      portLabel: this.info?.portLabel ?? null,
      baudRate: this.info?.baudRate ?? null,
      dataBits: this.info?.dataBits ?? null,
      stopBits: this.info?.stopBits ?? null,
      parity: this.info?.parity ?? null,
      frameDelay: this.frameDelay,
      timed: t
        ? {
            interval: t.interval,
            times: t.times,
            sent: t.sent,
            failed: t.failed,
            startedAt: t.startedAt,
          }
        : null,
    };
  }

  // ------------------------------------------------------------ 打开 / 关闭

  async open(options: OpenOptions): Promise<SerialStatus> {
    const serial = getWebSerial();
    if (!serial) throw new Error("当前浏览器不支持 Web Serial，无法连接串口");

    const port = knownPorts.get(options.portId);
    if (!port)
      throw new Error(
        "串口设备已失效，请重新选择设备（浏览器不会长期保存授权）",
      );

    const baud = Number(options.baudRate);
    if (!Number.isFinite(baud) || baud <= 0) throw new Error("波特率无效");

    await this.close("重新连接");

    this.frameDelay = Math.max(
      20,
      Number(options.frameDelay) || DEFAULTS.frameDelay,
    );
    this.delimiter = options.delimiter ? textToBytes(options.delimiter) : null;
    this.buffer = new Uint8Array(0);

    try {
      await port.open({
        baudRate: baud,
        dataBits: Number(options.dataBits) || 8,
        stopBits: Number(options.stopBits) || 1,
        parity: options.parity ?? "none",
        flowControl: "none",
      });
    } catch (err) {
      throw new Error(`打开串口失败：${errorMessage(err)}`);
    }

    this.port = port;
    const entry = describePort(port, 0);
    this.info = {
      portLabel: entry.label,
      baudRate: baud,
      dataBits: Number(options.dataBits) || 8,
      stopBits: Number(options.stopBits) || 1,
      parity: options.parity ?? "none",
    };

    const writable = port.writable;
    if (!writable) {
      await this.close("串口不可写");
      throw new Error("串口不可写：请断开后重新连接设备");
    }
    this.writer = writable.getWriter();
    this.startReadLoop(port);

    serial.addEventListener("disconnect", this.handleDisconnect);

    this.emit("status", this.status);
    return this.status;
  }

  async close(reason = "连接已关闭"): Promise<{ ok: boolean }> {
    this.stopTimedSend(reason);
    this.clearFrameTimer();
    this.rejectWaiters("串口已关闭");
    this.buffer = new Uint8Array(0);

    const port = this.port;
    const reader = this.reader;
    const writer = this.writer;
    const loop = this.readLoop;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readLoop = null;
    this.info = null;

    getWebSerial()?.removeEventListener("disconnect", this.handleDisconnect);

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    if (loop) {
      try {
        await loop;
      } catch {
        /* ignore */
      }
    }
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
    if (writer) {
      try {
        writer.releaseLock();
      } catch {
        /* ignore */
      }
    }
    if (port) {
      try {
        await port.close();
      } catch {
        /* 设备已被拔出时会抛错，忽略即可 */
      }
    }

    this.emit("status", this.status);
    return { ok: true };
  }

  private handleDisconnect = (event: Event): void => {
    const target = (event as Event & { target?: unknown }).target;
    if (target && target !== this.port) return;
    this.emitError("设备已断开连接");
    void this.close("设备已断开");
  };

  private startReadLoop(port: WebSerialPort): void {
    const readable = port.readable;
    if (!readable) {
      this.emitError("串口不可读");
      return;
    }
    const reader = readable.getReader();
    this.reader = reader;
    const loop = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) this.handleChunk(value);
        }
      } catch (err) {
        if (this.port === port) {
          this.emitError(`读取串口数据失败：${errorMessage(err)}`);
          await this.close("读取中断");
        }
      }
    })();
    this.readLoop = loop.catch(() => undefined);
  }

  // ------------------------------------------------------------ 发送

  async send(options: SendOptions): Promise<SendResult> {
    if (!this.port || !this.writer)
      throw new Error("串口未打开，请先选择串口并连接");

    const payload = encodePayload(
      options.data,
      options.encoding ?? "ascii",
      options.terminator ?? "none",
    );
    if (payload.length === 0) throw new Error("发送内容为空");

    // 发送前清空缓冲，避免上一帧的残留数据被当作本次响应
    this.clearFrameTimer();
    this.buffer = new Uint8Array(0);

    const waitMs = Math.max(
      50,
      Number(options.timeout) || DEFAULTS.responseTimeout,
    );
    const expectResponse = options.expectResponse !== false;
    const waiter = expectResponse ? this.waitFrame(waitMs) : null;

    try {
      await this.writer.write(payload);
    } catch (err) {
      if (waiter) this.removeWaiter(waiter);
      throw new Error(`写入串口失败：${errorMessage(err)}`);
    }

    const sentAt = nowIso();
    this.emit("sent", {
      text: bytesToText(payload),
      hex: bytesToHex(payload),
      length: payload.length,
      at: sentAt,
    });

    if (!waiter) {
      return {
        ok: true,
        response: null,
        sentAt,
        payloadHex: bytesToHex(payload),
        timedOut: false,
      };
    }

    try {
      const frame = await waiter.promise;
      return {
        ok: true,
        response: frame,
        sentAt,
        payloadHex: bytesToHex(payload),
        timedOut: false,
      };
    } catch {
      return {
        ok: false,
        response: null,
        sentAt,
        payloadHex: bytesToHex(payload),
        timedOut: true,
        error: `等待响应超时（${waitMs}ms）`,
      };
    }
  }

  // ------------------------------------------------------------ 定时发送

  startTimedSend(options: TimedSendOptions): SerialStatus {
    const interval = Math.max(50, Number(options.interval) || 1000);
    const times = Math.max(0, Math.trunc(Number(options.times) || 0)); // 0 = 不限次数
    const requested = Number(options.timeout) || DEFAULTS.responseTimeout;
    const timeout = Math.min(requested, Math.max(200, interval - 50));

    this.stopTimedSend("重新开始");

    const state: TimedState = {
      interval,
      times,
      timeout,
      sent: 0,
      failed: 0,
      busy: false,
      startedAt: nowIso(),
      timer: null,
      options: { ...options },
    };
    this.timed = state;

    const finish = (reason: string) => {
      if (this.timed === state) this.stopTimedSend(reason);
    };

    const tick = async () => {
      if (this.timed !== state) return;
      if (state.busy) return; // 上一轮尚未返回则跳过本轮，避免数据串扰
      state.busy = true;
      const index = state.sent + state.failed + 1;
      try {
        const res = await this.send({
          data: options.data,
          encoding: options.encoding,
          terminator: options.terminator,
          expectResponse: options.expectResponse !== false,
          timeout,
        });
        if (res.ok || !res.timedOut) state.sent += 1;
        else state.failed += 1;
        const reached =
          state.times > 0 && state.sent + state.failed >= state.times;
        this.emit("timed-tick", {
          index,
          total: state.times,
          ok: res.ok,
          response: res.response,
          sentAt: res.sentAt,
          payloadHex: res.payloadHex,
          error: res.error || null,
          reached,
        });
        if (reached) finish("定时发送已完成");
      } catch (err) {
        const message = errorMessage(err);
        state.failed += 1;
        this.emitError(message);
        this.emit("timed-tick", {
          index,
          total: state.times,
          ok: false,
          response: null,
          sentAt: nowIso(),
          payloadHex: null,
          error: message,
          reached: state.times > 0 && state.failed >= state.times,
        });
        if (/未打开|已断开|已关闭|不可写/.test(message))
          finish("串口不可用，定时发送已停止");
      } finally {
        state.busy = false;
      }
    };

    state.timer = window.setInterval(() => void tick(), interval);
    this.emit("status", this.status);
    void tick(); // 立即执行第一次
    return this.status;
  }

  stopTimedSend(reason?: string): {
    ok: boolean;
    stopped: boolean;
    sent?: number;
    failed?: number;
  } {
    const state = this.timed;
    if (!state) return { ok: true, stopped: false };
    if (state.timer !== null) window.clearInterval(state.timer);
    this.timed = null;
    this.emit("timed-stop", {
      reason: reason || "已停止",
      sent: state.sent,
      failed: state.failed,
      at: nowIso(),
    });
    this.emit("status", this.status);
    return { ok: true, stopped: true, sent: state.sent, failed: state.failed };
  }

  // ------------------------------------------------------------ 内部实现

  private clearFrameTimer(): void {
    if (this.frameTimer !== null) {
      window.clearTimeout(this.frameTimer);
      this.frameTimer = null;
    }
  }

  private waitFrame(timeout: number): Waiter {
    const waiter: Waiter = {
      promise: Promise.resolve(null as unknown as FrameInfo),
      resolve: () => undefined,
      reject: () => undefined,
      timer: 0,
    };
    waiter.promise = new Promise<FrameInfo>((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
      waiter.timer = window.setTimeout(() => {
        this.removeWaiter(waiter);
        reject(new Error("timeout"));
      }, timeout);
    });
    this.waiters.push(waiter);
    return waiter;
  }

  private removeWaiter(waiter: Waiter): void {
    const i = this.waiters.indexOf(waiter);
    if (i >= 0) this.waiters.splice(i, 1);
    window.clearTimeout(waiter.timer);
  }

  private rejectWaiters(reason: string): void {
    const waiters = this.waiters.splice(0, this.waiters.length);
    for (const w of waiters) {
      window.clearTimeout(w.timer);
      w.reject(new Error(reason));
    }
  }

  private handleChunk(chunk: Uint8Array): void {
    this.buffer = concatBytes(this.buffer, chunk);
    this.emit("raw", {
      hex: bytesToHex(chunk),
      text: bytesToText(chunk),
      length: chunk.length,
      at: nowIso(),
    });
    this.scanFrames();
  }

  private scanFrames(): void {
    if (this.delimiter) {
      for (;;) {
        const idx = indexOfBytes(this.buffer, this.delimiter);
        if (idx < 0) break;
        const frame = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + this.delimiter.length);
        if (frame.length > 0) this.emitFrame(frame);
      }
    }
    // 兜底：无论是否配置结束符，空闲一段时间后都认为一帧结束
    this.clearFrameTimer();
    this.frameTimer = window.setTimeout(() => {
      this.frameTimer = null;
      if (this.buffer.length === 0) return;
      const frame = this.buffer;
      this.buffer = new Uint8Array(0);
      this.emitFrame(frame);
    }, this.frameDelay);
  }

  private emitFrame(bytes: Uint8Array): void {
    const frame: FrameInfo = {
      text: bytesToText(bytes).replace(/[\r\n]+$/, ""),
      hex: bytesToHex(bytes),
      length: bytes.length,
      at: nowIso(),
    };
    this.emit("frame", frame);
    const waiter = this.waiters.shift();
    if (waiter) {
      window.clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }
}

// ---------------------------------------------------------------- 编码工具

export function encodePayload(
  data: string,
  encoding: Encoding,
  terminator: Terminator,
): Uint8Array {
  const body =
    encoding === "hex" ? hexToBytes(data) : textToBytes(String(data));
  switch (terminator) {
    case "lf":
      return concatBytes(body, textToBytes("\n"));
    case "cr":
      return concatBytes(body, textToBytes("\r"));
    case "crlf":
      return concatBytes(body, textToBytes("\r\n"));
    default:
      return body;
  }
}

export const serialDefaults = DEFAULTS;

/** 单例：整个应用共用同一个串口连接 */
export const serial = new SerialService();
