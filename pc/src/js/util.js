/* 通用工具、全局状态、提示与弹窗 */
(function () {
  "use strict";

  const api = window.poct;

  const state = {
    info: null,
    settings: {},
    status: { connected: false, timed: null },
    ports: [],
    calibration: {
      blank: { n: 0, mean: null, sd: null, cv: null },
      aptamer_blank: { n: 0, mean: null, sd: null, cv: null },
    },
    lastMeasurement: null,
    traffic: { rx: 0, tx: 0 },
    logPaused: false,
    historyPage: { offset: 0, limit: 100, total: 0 },
  };

  const CATEGORY_LABELS = {
    blank: "空白（仅缓冲液）",
    aptamer_blank: "空白（适配体+染料）",
    sample: "样本检测",
  };

  const CATEGORY_SHORT = {
    blank: "空白",
    aptamer_blank: "适配体空白",
    sample: "样本",
  };

  function el(id) {
    return document.getElementById(id);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function debounce(fn, wait = 250) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtTime(iso, withDate = true) {
    if (!iso) return "--";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(
      d.getMilliseconds(),
    ).padStart(3, "0")}`;
    if (!withDate) return time;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
  }

  function fmtNum(value, digits = 4) {
    if (value === null || value === undefined || value === "") return "--";
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4))
      return n.toExponential(3);
    return String(Number(n.toFixed(digits)));
  }

  /** 从设备返回的任意文本中提取第一个数值（尽量忽略 "CH1" 这类通道号） */
  function parseNumeric(text) {
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

  function toHexText(text) {
    const bytes = new TextEncoder().encode(String(text));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
  }

  function emptyToNull(v) {
    const s = String(v === null || v === undefined ? "" : v).trim();
    return s === "" ? null : s;
  }

  let toastTimer = null;
  function toast(message, type = "info") {
    const box = el("toast");
    if (!box) return;
    box.textContent = message;
    box.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => {
        box.className = "toast";
      },
      type === "error" ? 5000 : 2800,
    );
  }

  function errorMessage(err) {
    if (!err) return "未知错误";
    return err.message ? err.message : String(err);
  }

  /** 当前使用的单位 */
  function unit() {
    return state.settings.unit || "a.u.";
  }

  /** 空白参照值（最近 window 次的均值） */
  function blankReference(kind) {
    const stat = state.calibration[kind] || {};
    return stat.mean !== null && stat.mean !== undefined
      ? Number(stat.mean)
      : null;
  }

  /** 净信号 = 测量值 - 空白参照值（优先适配体空白，未测时回退到空白） */
  function netSignal(value) {
    if (value === null || value === undefined || value === "") return null;
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    const ref = blankRef();
    if (ref === null) return null;
    return v - ref;
  }

  /** 生效的空白参照值：优先适配体空白参照，未测时回退到空白参照 */
  function blankRef() {
    return blankReference("aptamer_blank") ?? blankReference("blank");
  }

  /** 简单线性标准曲线：浓度 = (净信号 - 截距) / 斜率 */
  function concentration(value) {
    const s = state.settings;
    if (!s.curveEnabled) return null;
    const slope = Number(s.curveSlope);
    const intercept = Number(s.curveIntercept);
    if (!Number.isFinite(slope) || slope === 0) return null;
    const net = netSignal(value);
    if (net === null) return null;
    return (net - (Number.isFinite(intercept) ? intercept : 0)) / slope;
  }

  window.POCT = {
    api,
    state,
    CATEGORY_LABELS,
    CATEGORY_SHORT,
    el,
    sleep,
    debounce,
    escapeHtml,
    fmtTime,
    fmtNum,
    parseNumeric,
    toHexText,
    emptyToNull,
    toast,
    errorMessage,
    unit,
    blankReference,
    blankRef,
    netSignal,
    concentration,
  };
})();
