/* 采集控制台：发送任意数据、等待返回、定时发送 */
(function () {
  "use strict";

  const { api, el, toast, state, debounce } = window.POCT;

  const QUICK_PAYLOADS = [
    { label: "READ", value: "READ", encoding: "ascii" },
    { label: "MEASURE", value: "MEASURE", encoding: "ascii" },
    { label: "GET?", value: "GET?", encoding: "ascii" },
    { label: "R (单字符)", value: "R", encoding: "ascii" },
    {
      label: "HEX 01 03 00 00 00 01",
      value: "01 03 00 00 00 01",
      encoding: "hex",
    },
    { label: "HEX 0A", value: "0A", encoding: "hex" },
  ];

  const persistParams = debounce(() => {
    window.POCT.settings.save(readForm()).catch(() => {});
  }, 400);

  function readForm() {
    return {
      payload: el("payload").value,
      encoding: el("encoding").value,
      terminator: el("terminator").value,
      timeout: Math.max(50, Number(el("timeout").value) || 1500),
      interval: Math.max(50, Number(el("interval").value) || 1000),
      times: Math.max(0, Math.trunc(Number(el("times").value) || 0)),
      expectResponse: el("expect-response").checked,
      autoSave: el("auto-save").checked,
      framesOnly: el("log-frames-only").checked,
    };
  }

  function applySettings() {
    const s = state.settings;
    el("payload").value = s.payload !== undefined ? s.payload : "READ";
    el("encoding").value = s.encoding || "ascii";
    el("terminator").value = s.terminator || "crlf";
    el("timeout").value = s.timeout || 1500;
    el("interval").value = s.interval || 1000;
    el("times").value = s.times === undefined ? 5 : s.times;
    el("expect-response").checked = s.expectResponse !== false;
    el("auto-save").checked = Boolean(s.autoSave);
    el("log-frames-only").checked = Boolean(s.framesOnly);
  }

  function renderQuickPayloads() {
    const box = el("quick-payloads");
    box.innerHTML = "";
    for (const item of QUICK_PAYLOADS) {
      const btn = document.createElement("button");
      btn.className = "chip-btn";
      btn.textContent = item.label;
      btn.title = "点击填入发送内容";
      btn.addEventListener("click", () => {
        el("payload").value = item.value;
        el("encoding").value = item.encoding;
        persistParams();
        el("payload").focus();
      });
      box.appendChild(btn);
    }
  }

  function setBusy(busy) {
    el("btn-send").disabled = busy;
    el("btn-send-only").disabled = busy;
    el("btn-timed").disabled = busy;
    el("btn-stop").disabled = !busy;
  }

  function ensureReady() {
    if (!state.status.connected) {
      toast("串口未连接，请先在「设置」中连接串口", "error");
      return false;
    }
    const params = readForm();
    if (!String(params.payload).trim()) {
      toast("请填写要发送的数据", "error");
      return false;
    }
    return true;
  }

  async function sendOnce(expectResponse) {
    if (!ensureReady()) return null;
    const params = readForm();
    const payloadDesc =
      params.encoding === "hex" ? `HEX ${params.payload}` : params.payload;
    setBusy(true);
    try {
      const res = await api.serial.send({
        data: params.payload,
        encoding: params.encoding,
        terminator: params.terminator,
        expectResponse,
        timeout: params.timeout,
      });
      persistParams();
      if (!expectResponse) {
        return res;
      }
      if (res.ok && res.response) {
        return res;
      }
      toast(`“${payloadDesc}” ${res.error || "未收到返回数据"}`, "error");
      if (window.POCT.log)
        window.POCT.log.add("err", res.error || "未收到返回数据");
      return res;
    } catch (err) {
      toast(err.message, "error");
      if (window.POCT.log) window.POCT.log.add("err", err.message);
      return null;
    } finally {
      setBusy(Boolean(state.status.timed));
    }
  }

  async function startTimed() {
    if (!ensureReady()) return;
    const params = readForm();
    try {
      await api.serial.startTimed({
        data: params.payload,
        encoding: params.encoding,
        terminator: params.terminator,
        expectResponse: params.expectResponse,
        interval: params.interval,
        times: params.times,
        timeout: params.timeout,
      });
      persistParams();
      setBusy(true);
      toast(
        `定时发送已启动：每 ${params.interval}ms 一次，共 ${params.times === 0 ? "不限" : params.times} 次`,
        "ok",
      );
      if (window.POCT.log) {
        window.POCT.log.add(
          "sys",
          `开始定时发送：每 ${params.interval}ms 发送 “${params.payload}”，次数 ${
            params.times === 0 ? "不限" : params.times
          }`,
        );
      }
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function stopTimed(reason) {
    try {
      const res = await api.serial.stopTimed(reason || "手动停止");
      setBusy(false);
      if (res && res.stopped) {
        toast(
          `定时发送已停止（成功 ${res.sent} 次，失败 ${res.failed} 次）`,
          "ok",
        );
      }
      return res;
    } catch (err) {
      toast(err.message, "error");
      setBusy(false);
      return null;
    }
  }

  function init() {
    applySettings();
    renderQuickPayloads();

    for (const id of [
      "payload",
      "encoding",
      "terminator",
      "timeout",
      "interval",
      "times",
    ]) {
      el(id).addEventListener("change", persistParams);
      el(id).addEventListener("input", persistParams);
    }

    for (const id of ["expect-response", "auto-save", "log-frames-only"]) {
      el(id).addEventListener("change", () => {
        persistParams();
        if (id === "auto-save") {
          toast(
            el("auto-save").checked
              ? "已开启自动保存检测结果"
              : "已关闭自动保存",
            "ok",
          );
        }
      });
    }

    el("btn-send").addEventListener("click", () => sendOnce(true));
    el("btn-send-only").addEventListener("click", () => sendOnce(false));
    el("btn-timed").addEventListener("click", () => startTimed());
    el("btn-stop").addEventListener("click", () => stopTimed("手动停止"));

    el("payload").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendOnce(true);
      }
    });

    api.serial.on("timed-stop", () => setBusy(false));
    api.serial.on("status", (status) => {
      if (!status.timed) setBusy(false);
    });
  }

  window.POCT.console = {
    init,
    applySettings,
    readForm,
    sendOnce,
    startTimed,
    stopTimed,
    setBusy,
  };
})();
