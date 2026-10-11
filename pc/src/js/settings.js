/* 设置：默认参数、单位、标准曲线、数据管理 */
(function () {
  "use strict";

  const { api, el, toast, state, fmtNum } = window.POCT;

  const DEFAULTS = {
    // 采集控制台
    payload: "READ",
    encoding: "ascii",
    terminator: "crlf",
    timeout: 1500,
    interval: 1000,
    times: 5,
    expectResponse: true,
    framesOnly: false,
    autoSave: false,
    // 连接
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    frameDelay: 120,
    delimiter: "",
    // 测量
    unit: "a.u.",
    calibrationWindow: 5,
    curveEnabled: false,
    curveSlope: 1,
    curveIntercept: 0,
    curveUnit: "ng/mL",
  };

  async function load() {
    const stored = (await api.db.getSettings()) || {};
    state.settings = { ...DEFAULTS, ...stored };
    return state.settings;
  }

  function get() {
    return state.settings;
  }

  async function save(patch) {
    Object.assign(state.settings, patch);
    await api.db.setSettings(patch);
    return state.settings;
  }

  async function refreshInfo() {
    const info = await api.app.info();
    state.info = info;
    el("info-version").textContent = info.version || "--";
    el("info-electron").textContent = info.electron || "--";
    el("info-node").textContent = info.node || "--";
    el("info-chrome").textContent = info.chrome || "--";
    el("info-platform").textContent = info.platform || "--";
    el("info-db-path").textContent = info.dbPath || "--";
    el("info-data-dir").textContent = info.dataDir || "--";
    await refreshRecordCount();
    return info;
  }

  async function refreshRecordCount() {
    try {
      const counts = await api.db.counts();
      el("info-record-count").textContent = String(counts.all || 0);
    } catch {
      el("info-record-count").textContent = "--";
    }
  }

  function fillForm() {
    const s = state.settings;
    el("set-unit").value = s.unit || "a.u.";
    el("set-calib-window").value = s.calibrationWindow;
    el("set-curve-enabled").checked = Boolean(s.curveEnabled);
    el("set-curve-slope").value = s.curveSlope;
    el("set-curve-intercept").value = s.curveIntercept;
    el("set-curve-unit").value = s.curveUnit || "ng/mL";
    el("set-baud").value = s.baudRate;
    el("set-timeout").value = s.timeout;
    el("set-frame-delay").value = s.frameDelay;
  }

  async function saveFromForm() {
    const patch = {
      unit: el("set-unit").value.trim() || "a.u.",
      calibrationWindow: Math.max(1, Number(el("set-calib-window").value) || 5),
      curveEnabled: el("set-curve-enabled").checked,
      curveSlope: Number(el("set-curve-slope").value) || 0,
      curveIntercept: Number(el("set-curve-intercept").value) || 0,
      curveUnit: el("set-curve-unit").value.trim() || "ng/mL",
      baudRate: Number(el("set-baud").value) || 115200,
      timeout: Math.max(50, Number(el("set-timeout").value) || 1500),
      frameDelay: Math.max(20, Number(el("set-frame-delay").value) || 120),
    };
    await save(patch);
    fillForm();
    el("settings-state").textContent =
      `已保存 ${new Date().toLocaleTimeString()}`;
    toast("设置已保存", "ok");
    if (window.POCT.connection) window.POCT.connection.applyDefaults();
    if (window.POCT.detect) window.POCT.detect.refreshDerived();
    if (window.POCT.calibration) window.POCT.calibration.refresh();
  }

  async function resetDefaults() {
    if (
      !(await window.POCT.confirmDialog(
        "确定要恢复默认设置吗？（不会删除历史数据）",
      ))
    )
      return;
    await save({ ...DEFAULTS });
    fillForm();
    toast("已恢复默认设置", "ok");
    if (window.POCT.connection) window.POCT.connection.applyDefaults();
    if (window.POCT.console) window.POCT.console.applySettings();
    if (window.POCT.detect) window.POCT.detect.refreshDerived();
  }

  async function clearAllRecords() {
    if (
      !(await window.POCT.confirmDialog(
        "确定要清空全部检测记录与校准记录吗？此操作不可撤销。",
      ))
    )
      return;
    const a = await api.db.clearMeasurements("all");
    const b = await api.db.clearCalibrations("all");
    toast(`已清空 ${a.deleted} 条检测记录、${b.deleted} 条校准记录`, "ok");
    await refreshRecordCount();
    if (window.POCT.calibration) window.POCT.calibration.refresh();
    if (window.POCT.history) window.POCT.history.query();
    if (window.POCT.detect) window.POCT.detect.refreshRecent();
  }

  async function exportAll() {
    const { rows } = await api.db.queryMeasurements({
      category: "all",
      limit: 2000,
      offset: 0,
    });
    if (!rows.length) {
      toast("暂无记录可导出", "error");
      return;
    }
    const res = await api.app.exportCsv({
      rows,
      title: window.POCT.t("导出检测记录"),
      filters: [{ name: window.POCT.t("CSV 文件"), extensions: ["csv"] }],
      labels: window.POCT.i18n.csvLabels(),
    });
    if (res && res.ok)
      toast(`已导出 ${res.count} 条记录：${res.filePath}`, "ok");
    else if (res && !res.canceled) toast("导出失败", "error");
  }

  function init() {
    el("btn-save-settings").addEventListener("click", () =>
      saveFromForm().catch((e) => toast(e.message, "error")),
    );
    el("btn-reset-settings").addEventListener("click", () =>
      resetDefaults().catch((e) => toast(e.message, "error")),
    );
    el("btn-open-data-dir").addEventListener("click", () =>
      api.app.openDataDir(),
    );
    el("btn-export-all-2").addEventListener("click", () =>
      exportAll().catch((e) => toast(e.message, "error")),
    );
    el("btn-clear-all").addEventListener("click", () =>
      clearAllRecords().catch((e) => toast(e.message, "error")),
    );
    fillForm();
  }

  window.POCT.settings = {
    DEFAULTS,
    load,
    get,
    save,
    init,
    fillForm,
    refreshInfo,
    refreshRecordCount,
    exportAll,
  };
})();
