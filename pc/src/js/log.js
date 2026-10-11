/* 实时数据流日志 */
(function () {
  "use strict";

  const { api, el, fmtTime, escapeHtml, toast } = window.POCT;

  const MAX_LINES = 800;
  const state = { paused: false, lines: 0 };

  /** 实时读取“仅显示解析帧”开关，避免与其他模块的状态不同步 */
  function framesOnly() {
    const box = el("log-frames-only");
    return Boolean(box && box.checked);
  }

  function lineClass(dir) {
    if (dir === "tx") return "tx";
    if (dir === "rx") return "rx";
    if (dir === "err") return "err";
    return "sys";
  }

  function dirLabel(dir) {
    return { tx: "TX", rx: "RX", err: "ERR", sys: "SYS" }[dir] || "SYS";
  }

  function add(dir, text, hex) {
    if (state.paused) return;
    const view = el("log-view");
    if (!view) return;

    const row = document.createElement("div");
    row.className = `log-line ${lineClass(dir)}`;

    const time = document.createElement("span");
    time.className = "t";
    time.textContent = fmtTime(new Date().toISOString(), false);

    const tag = document.createElement("span");
    tag.className = "d";
    tag.textContent = dirLabel(dir);

    const body = document.createElement("span");
    body.className = "msg";
    const printable = text === null || text === undefined ? "" : String(text);
    body.textContent = printable === "" ? "<空>" : printable;
    if (hex && hex !== text) {
      const hexSpan = document.createElement("span");
      hexSpan.className = "hex";
      hexSpan.textContent = `  [${hex}]`;
      body.appendChild(hexSpan);
    }

    row.append(time, tag, body);
    view.appendChild(row);
    state.lines += 1;

    while (view.childElementCount > MAX_LINES) {
      view.removeChild(view.firstElementChild);
      state.lines -= 1;
    }

    view.scrollTop = view.scrollHeight;
    const counter = el("log-count");
    if (counter) counter.textContent = String(state.lines);
  }

  function clear() {
    const view = el("log-view");
    if (view) view.innerHTML = "";
    state.lines = 0;
    const counter = el("log-count");
    if (counter) counter.textContent = "0";
  }

  function exportLog() {
    const view = el("log-view");
    const text = view ? view.innerText : "";
    if (!text.trim()) {
      toast("日志为空，无需导出", "error");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    api.app
      .saveText({
        defaultName: `poct-log-${stamp}.txt`,
        content: text,
        filters: [
          { name: window.POCT.t("文本文件"), extensions: ["txt"] },
          { name: window.POCT.t("所有文件"), extensions: ["*"] },
        ],
      })
      .then((res) => {
        if (res && res.ok) toast(`日志已导出：${res.filePath}`, "ok");
        else if (res && !res.canceled) toast("导出失败", "error");
      })
      .catch((err) => toast(`导出失败：${err.message}`, "error"));
  }

  function init() {
    el("btn-log-pause").addEventListener("click", () => {
      state.paused = !state.paused;
      el("btn-log-pause").textContent = state.paused ? "继续" : "暂停";
      el("btn-log-pause").classList.toggle("primary", state.paused);
      add("sys", state.paused ? "日志已暂停" : "日志已恢复");
    });

    el("btn-log-clear").addEventListener("click", clear);
    el("btn-log-export").addEventListener("click", exportLog);

    const toggle = el("log-frames-only");
    toggle.addEventListener("change", () => {
      add(
        "sys",
        toggle.checked
          ? "日志切换为“仅显示解析帧”"
          : "日志切换为“显示全部原始数据”",
      );
    });

    api.serial.on("raw", (chunk) => {
      if (framesOnly()) return;
      add("rx", chunk.text, chunk.hex);
    });

    api.serial.on("frame", (frame) => {
      if (!framesOnly()) return;
      add("rx", frame.text, frame.hex);
    });

    api.serial.on("sent", (info) => {
      add("tx", info.text, info.hex);
    });

    api.serial.on("error", (err) => {
      add("err", err.message);
    });

    api.serial.on("timed-stop", (info) => {
      add(
        "sys",
        `定时发送结束：${info.reason}（成功 ${info.sent} 次，失败 ${info.failed} 次）`,
      );
    });

    add("sys", "日志已就绪，连接串口后开始记录数据");
  }

  window.POCT.log = { init, add, clear };
})();
