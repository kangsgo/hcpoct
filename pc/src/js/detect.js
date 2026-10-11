/* 实时检测：解析返回数据、显示结果、保存记录 */
(function () {
  "use strict";

  const P = window.POCT;
  const { api, el, toast, state, parseNumeric, fmtTime, fmtNum, escapeHtml } =
    P;

  function currentSource() {
    return state.status.timed ? "timed" : "manual";
  }

  function setResult(value, frame) {
    el("result-value").value =
      value === null || value === undefined ? "" : String(value);
    el("result-unit").textContent = P.unit();
    el("result-meta").textContent = frame
      ? `接收时间 ${fmtTime(frame.at)} · ${state.status.path || "--"} · ${frame.length} 字节${
          value === null ? "（未解析到数值，可手动填写后保存）" : ""
        }`
      : "尚未收到数据";
    el("result-raw").textContent = frame ? frame.text || "<空>" : "--";
    el("result-hex").textContent = frame ? frame.hex || "--" : "--";
  }

  function consume(frame) {
    const value = parseNumeric(frame.text);
    state.lastMeasurement = {
      value,
      raw: frame.text,
      hex: frame.hex,
      at: frame.at,
      port: state.status.path || null,
      baudRate: state.status.baudRate || null,
    };
    setResult(value, frame);
    refreshDerived();

    if (state.settings.autoSave && value !== null) {
      saveMeasurement({ silent: true }).catch(() => {});
    }
  }

  function refreshDerived() {
    const s = state.settings;
    el("result-unit").textContent = P.unit();

    const ref = P.blankRef();
    el("result-blank-ref").textContent =
      ref === null ? "未测试" : `${fmtNum(ref)} ${P.unit()}`;

    const value = P.emptyToNull(el("result-value").value);
    const net = P.netSignal(value);
    el("result-net").textContent =
      net === null ? "--" : `${fmtNum(net)} ${P.unit()}`;

    if (!s.curveEnabled) {
      el("result-conc").textContent = "未启用标准曲线";
    } else {
      const conc = P.concentration(value);
      el("result-conc").textContent =
        conc === null ? "--" : `${fmtNum(conc)} ${s.curveUnit || "ng/mL"}`;
    }
  }

  async function saveMeasurement(options = {}) {
    const valueText = P.emptyToNull(el("result-value").value);
    if (valueText === null) {
      toast("暂无数值可保存，请先采集或手动填写数值", "error");
      return null;
    }
    const value = Number(valueText);
    if (!Number.isFinite(value)) {
      toast("数值格式无效", "error");
      return null;
    }

    const last = state.lastMeasurement || {};
    const category = options.category || "sample";
    const note =
      options.note !== undefined
        ? options.note
        : P.emptyToNull(el("save-note") ? el("save-note").value : null);

    const row = await api.db.saveMeasurement({
      category,
      value,
      unit: P.unit(),
      raw: last.raw !== undefined ? last.raw : null,
      payload: el("payload").value,
      port: last.port || state.status.path || null,
      baudRate: last.baudRate || state.status.baudRate || null,
      source: currentSource(),
      note,
      meta: {
        hex: last.hex || null,
        receivedAt: last.at || null,
        net: P.netSignal(value),
        concentration: P.concentration(value),
        concentrationUnit: state.settings.curveUnit || null,
      },
    });

    if (!options.silent) {
      toast(
        `已保存：${P.CATEGORY_SHORT[category] || category} ${fmtNum(value)} ${P.unit()}`,
        "ok",
      );
      el("save-note").value = "";
    }

    refreshRecent();
    if (P.settings) P.settings.refreshRecordCount();
    if (category !== "sample" && P.test) P.test.refresh();
    return row;
  }

  async function refreshRecent() {
    const box = el("recent-list");
    try {
      const { rows } = await api.db.queryMeasurements({
        category: "all",
        limit: 8,
      });
      if (!rows.length) {
        box.innerHTML = '<div class="hint">暂无记录</div>';
        return;
      }
      box.innerHTML = rows
        .map(
          (r) => `
          <div class="recent-item">
            <span class="chip">${escapeHtml(P.CATEGORY_SHORT[r.category] || r.category)}</span>
            <span class="v">${r.value === null ? "--" : fmtNum(r.value)}</span>
            <span class="muted">${escapeHtml(r.unit || "")}</span>
            ${r.note ? `<span class="muted">· ${escapeHtml(r.note)}</span>` : ""}
            <span class="c">${fmtTime(r.created_at)}</span>
          </div>`,
        )
        .join("");
    } catch (err) {
      box.innerHTML = `<div class="hint">读取失败：${escapeHtml(err.message)}</div>`;
    }
  }

  function init() {
    api.serial.on("frame", (frame) => consume(frame));

    el("result-value").addEventListener("input", refreshDerived);
    el("btn-recent-refresh").addEventListener("click", () => refreshRecent());

    setResult(null, null);
    refreshDerived();
    refreshRecent();
  }

  window.POCT.detect = {
    init,
    consume,
    refreshDerived,
    refreshRecent,
    saveMeasurement,
    setResult,
  };
})();
