"use strict";

/**
 * 串口管理器
 * - 扫描/发现可用串口
 * - 打开/关闭串口并设置波特率等参数
 * - 发送任意数据并等待返回数据（自由协议）
 * - 空闲分帧（无结束符时按空闲时间切分）+ 结束符分帧
 * - 定时发送（间隔 + 次数），每轮结果通过事件回传
 */

const { EventEmitter } = require("node:events");
const { SerialPort } = require("serialport");

const DEFAULTS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  frameDelay: 120, // 无结束符时，用于判定“一帧”结束的空闲时间(ms)
  responseTimeout: 1500,
};

const PARITY_VALUES = ["none", "even", "odd", "mark", "space"];

function nowIso() {
  return new Date().toISOString();
}

function toHex(buf) {
  const parts = [];
  for (const b of buf)
    parts.push(b.toString(16).padStart(2, "0").toUpperCase());
  return parts.join(" ");
}

function toDisplayText(buf) {
  return buf.toString("utf8");
}

class SerialManager extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.info = null;
    this.buffer = Buffer.alloc(0);
    this.frameTimer = null;
    this.frameDelay = DEFAULTS.frameDelay;
    this.delimiter = null;
    this.waiters = [];
    this.timed = null;
  }

  /** 扫描并发现可用串口 */
  static async listPorts() {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || "",
      serialNumber: p.serialNumber || "",
      vendorId: p.vendorId || "",
      productId: p.productId || "",
      friendlyName: p.friendlyName || p.path,
    }));
  }

  get isOpen() {
    return Boolean(this.port && this.port.isOpen);
  }

  get status() {
    const t = this.timed;
    return {
      connected: this.isOpen,
      path: this.info ? this.info.path : null,
      baudRate: this.info ? this.info.baudRate : null,
      dataBits: this.info ? this.info.dataBits : null,
      stopBits: this.info ? this.info.stopBits : null,
      parity: this.info ? this.info.parity : null,
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

  /** 打开串口并应用参数 */
  async open(options = {}) {
    const {
      path,
      baudRate = DEFAULTS.baudRate,
      dataBits = 8,
      stopBits = 1,
      parity = "none",
      frameDelay = DEFAULTS.frameDelay,
      delimiter = "",
    } = options;

    if (!path) throw new Error("请先选择要连接的串口");
    await this.close();

    const baud = Number(baudRate);
    if (!Number.isFinite(baud) || baud <= 0) throw new Error("波特率无效");
    if (parity && !PARITY_VALUES.includes(parity))
      throw new Error("校验位参数无效");

    this.frameDelay = Math.max(20, Number(frameDelay) || DEFAULTS.frameDelay);
    this.delimiter = delimiter ? Buffer.from(delimiter) : null;
    this.buffer = Buffer.alloc(0);

    const port = new SerialPort({
      path,
      baudRate: baud,
      dataBits: Number(dataBits) || 8,
      stopBits: Number(stopBits) || 1,
      parity,
      autoOpen: false,
    });

    this.port = port;

    port.on("data", (chunk) => this._handleData(chunk));
    port.on("error", (err) => this._emitError(err.message));
    port.on("close", () => {
      clearTimeout(this.frameTimer);
      this.frameTimer = null;
      this.buffer = Buffer.alloc(0);
      this._rejectWaiters("串口已断开");
      this.stopTimedSend("串口已断开");
      this.port = null;
      this.info = null;
      this.emit("status", this.status);
    });

    await new Promise((resolve, reject) => {
      port.open((err) =>
        err ? reject(new Error(`打开串口失败：${err.message}`)) : resolve(),
      );
    });

    this.info = {
      path,
      baudRate: baud,
      dataBits: Number(dataBits) || 8,
      stopBits: Number(stopBits) || 1,
      parity,
    };

    this.emit("status", this.status);
    return this.status;
  }

  /** 关闭串口 */
  async close() {
    this.stopTimedSend("连接已关闭");
    clearTimeout(this.frameTimer);
    this.frameTimer = null;
    this.buffer = Buffer.alloc(0);
    this._rejectWaiters("串口已关闭");

    const port = this.port;
    this.port = null;
    this.info = null;
    if (!port) {
      this.emit("status", this.status);
      return { ok: true };
    }

    await new Promise((resolve) => {
      if (!port.isOpen) return resolve();
      port.close(() => resolve());
    });

    this.emit("status", this.status);
    return { ok: true };
  }

  /** 发送任意数据；expectResponse 为 true 时等待并返回设备返回的数据 */
  async send(options = {}) {
    const {
      data = "",
      encoding = "ascii",
      terminator = "none",
      expectResponse = true,
      timeout = DEFAULTS.responseTimeout,
      flushBeforeSend = true,
    } = options;

    if (!this.isOpen) throw new Error("串口未打开，请先在左侧选择串口并连接");

    const payload = this._encode(data, encoding, terminator);
    if (payload.length === 0) throw new Error("发送内容为空");

    if (flushBeforeSend) {
      clearTimeout(this.frameTimer);
      this.frameTimer = null;
      this.buffer = Buffer.alloc(0);
    }

    const waitMs = Math.max(50, Number(timeout) || DEFAULTS.responseTimeout);
    const waiter = expectResponse ? this._waitFrame(waitMs) : null;
    const callbackStart = Date.now();

    await new Promise((resolve, reject) => {
      this.port.write(payload, (err) => {
        if (err) return reject(new Error(`写入串口失败：${err.message}`));
        this.port.drain((drainErr) =>
          drainErr ? reject(new Error(drainErr.message)) : resolve(),
        );
      });
    });

    const sentAt = nowIso();
    this.emit("sent", {
      hex: toHex(payload),
      text: toDisplayText(payload),
      length: payload.length,
      at: sentAt,
      elapsed: Date.now() - callbackStart,
    });

    if (!waiter) {
      return {
        ok: true,
        response: null,
        sentAt,
        payloadHex: toHex(payload),
        timedOut: false,
      };
    }

    try {
      const frame = await waiter;
      return {
        ok: true,
        response: frame,
        sentAt,
        payloadHex: toHex(payload),
        timedOut: false,
      };
    } catch (err) {
      return {
        ok: false,
        response: null,
        sentAt,
        payloadHex: toHex(payload),
        timedOut: true,
        error: `等待响应超时（${waitMs}ms）`,
      };
    }
  }

  /** 启动定时发送 */
  startTimedSend(options = {}) {
    const interval = Math.max(50, Number(options.interval) || 1000);
    const times = Math.max(0, Math.trunc(Number(options.times) || 0)); // 0 = 无限
    const requested = Number(options.timeout) || DEFAULTS.responseTimeout;
    const timeout = Math.min(requested, Math.max(200, interval - 50));

    this.stopTimedSend("重新开始");

    const state = {
      interval,
      times,
      timeout,
      sent: 0,
      failed: 0,
      busy: false,
      startedAt: nowIso(),
      timer: null,
      lastError: null,
    };
    this.timed = state;

    const finish = (reason) => {
      if (this.timed === state) this.stopTimedSend(reason);
    };

    const tick = async () => {
      if (this.timed !== state) return;
      if (state.busy) return; // 上一轮尚未返回，跳过本轮，避免数据串扰
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
        if (res.ok || !res.timedOut) {
          state.sent += 1;
        } else {
          state.failed += 1;
        }
        const reached =
          state.times > 0 && state.sent + state.failed >= state.times;
        this.emit("timed", {
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
        state.failed += 1;
        state.lastError = err.message;
        this._emitError(err.message);
        this.emit("timed", {
          index,
          total: state.times,
          ok: false,
          response: null,
          sentAt: nowIso(),
          error: err.message,
          reached: state.times > 0 && state.failed >= state.times,
        });
        if (/未打开|已断开|已关闭/.test(err.message)) {
          finish("串口不可用，定时发送已停止");
        }
      } finally {
        state.busy = false;
      }
    };

    state.timer = setInterval(tick, interval);
    this.emit("status", this.status);
    tick(); // 立即执行第一次
    return this.status;
  }

  /** 停止定时发送 */
  stopTimedSend(reason) {
    const state = this.timed;
    if (!state) return { ok: true, stopped: false };
    clearInterval(state.timer);
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

  // ---------------------------------------------------------------- 内部实现

  _encode(payload, encoding, terminator) {
    let buf;
    if (String(encoding).toLowerCase() === "hex") {
      const clean = String(payload)
        .replace(/0x/gi, "")
        .replace(/[^0-9a-fA-F]/g, "");
      if (clean.length === 0) throw new Error("HEX 数据为空");
      if (clean.length % 2 !== 0)
        throw new Error("HEX 数据长度必须为偶数，例如：01 03 00 00");
      buf = Buffer.from(clean, "hex");
    } else {
      buf = Buffer.from(String(payload), "utf8");
    }

    switch (terminator) {
      case "lf":
        return Buffer.concat([buf, Buffer.from("\n")]);
      case "cr":
        return Buffer.concat([buf, Buffer.from("\r")]);
      case "crlf":
        return Buffer.concat([buf, Buffer.from("\r\n")]);
      default:
        return buf;
    }
  }

  _waitFrame(timeout) {
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: null,
      };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("timeout"));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  _rejectWaiters(reason) {
    const waiters = this.waiters.splice(0, this.waiters.length);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.reject(new Error(reason));
    }
  }

  _handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.emit("raw", {
      hex: toHex(chunk),
      text: toDisplayText(chunk),
      length: chunk.length,
      at: nowIso(),
    });
    this._scanFrames();
  }

  _scanFrames() {
    if (this.delimiter) {
      for (;;) {
        const idx = this.buffer.indexOf(this.delimiter);
        if (idx < 0) break;
        const frame = this.buffer.subarray(0, idx);
        this.buffer = this.buffer.subarray(idx + this.delimiter.length);
        if (frame.length > 0) this._emitFrame(frame);
      }
    }
    // 兜底：无论是否配置结束符，空闲一段时间后都认为一帧结束
    clearTimeout(this.frameTimer);
    this.frameTimer = setTimeout(() => {
      this.frameTimer = null;
      if (this.buffer.length === 0) return;
      const frame = this.buffer;
      this.buffer = Buffer.alloc(0);
      this._emitFrame(frame);
    }, this.frameDelay);
  }

  _emitFrame(buf) {
    const text = buf.toString("utf8").replace(/[\r\n]+$/, "");
    const frame = {
      text,
      hex: toHex(buf),
      length: buf.length,
      at: nowIso(),
    };
    this.emit("frame", frame);
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }

  _emitError(message) {
    if (this.listenerCount("error") > 0)
      this.emit("error", { message, at: nowIso() });
  }
}

module.exports = { SerialManager, DEFAULTS, PARITY_VALUES };
