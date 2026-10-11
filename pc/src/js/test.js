/* 测试数据：空白测试（定时采集空白并记录参照值）、样品测试（单次测量并保存） */
(function () {
  "use strict";

  const P = window.POCT;
  const { api, el, toast, state, fmtNum, parseNumeric } = P;

  let session = null;

  function sampleReady() {
    const s = state.calibration.blank || {};
    return s.mean !== null && s.mean !== undefined;
  }

  function updateButtons() {
    const busy = Boolean(session && session.active);
    el("btn-blank-test").disabled = busy;
    el("btn-sample-test").disabled = busy || !sampleReady();
  }

  function updateSessionUI() {
    const chip = el("session-state");
    const bar = el("session-progress");
    const hint = el("session-hint");
    if (!session || !session.active) {
      chip.textContent = "空闲";
      chip.className = "chip";
      bar.style.width = "0%";
      el("btn-session-stop").disabled = true;
      hint.textContent = sampleReady()
        ? "空白测试已完成，可点击「样品测试」"
        : "点击「空白测试」按钮开始采集";
      updateButtons();
      return;
    }
    chip.textContent = `采集中 ${session.done}/${session.total}`;
    chip.className = "chip warn";
    bar.style.width = `${Math.round((session.done / session.total) * 100)}%`;
    el("btn-session-stop").disabled = false;
    hint.textContent = `正在采集「${P.CATEGORY_LABELS[session.kind]}」，成功 ${session.ok} 次 / 失败 ${session.fail} 次`;
    updateButtons();
  }

  async function interruptibleSleep(ms, handle) {
    const step = 100;
    let waited = 0;
    while (waited < ms && !handle.cancel) {
      const chunk = Math.min(step, ms - waited);
      await P.sleep(chunk);
      waited += chunk;
    }
  }

  /** 空白测试：按采集参数定时采集「空白」并累计参照值 */
  async function runBlankTest() {
    if (session && session.active) {
      toast("已有采集任务正在进行", "error");
      return;
    }
    if (!state.status.connected) {
      toast("串口未连接，请先在「设置」中连接串口", "error");
      return;
    }
    const params = P.console.readForm();
    const total = Math.max(1, params.times === 0 ? 1 : params.times);
    const handle = {
      active: true,
      cancel: false,
      kind: "blank",
      total,
      done: 0,
      ok: 0,
      fail: 0,
      values: [],
    };
    session = handle;
    updateSessionUI();
    P.log.add(
      "sys",
      `开始空白测试：共 ${total} 次，间隔 ${params.interval}ms，发送 “${params.payload}”`,
    );

    for (let i = 0; i < total; i += 1) {
      if (handle.cancel) break;
      if (i > 0) {
        await interruptibleSleep(params.interval, handle);
        if (handle.cancel) break;
      }

      let res = null;
      try {
        res = await api.serial.send({
          data: params.payload,
          encoding: params.encoding,
          terminator: params.terminator,
          expectResponse: true,
          timeout: params.timeout,
        });
      } catch (err) {
        handle.fail += 1;
        P.log.add("err", `第 ${i + 1} 次采集失败：${err.message}`);
        handle.done = i + 1;
        updateSessionUI();
        continue;
      }

      const raw = res && res.response ? res.response.text : "";
      const value = parseNumeric(raw);
      if (value === null) {
        handle.fail += 1;
        P.log.add(
          "err",
          `第 ${i + 1} 次采集未解析到数值：${raw || (res && res.error) || "无返回"}`,
        );
      } else {
        handle.ok += 1;
        handle.values.push(value);
      }

      try {
        await api.db.saveMeasurement({
          category: "blank",
          value,
          unit: P.unit(),
          raw: raw || (res && res.error) || "",
          payload: params.payload,
          port: state.status.path || null,
          baudRate: state.status.baudRate || null,
          source: "calibration",
          note: `空白测试 ${i + 1}/${total}`,
          meta: {
            hex: res && res.response ? res.response.hex : null,
            receivedAt: res && res.response ? res.response.at : null,
          },
        });
      } catch (err) {
        P.log.add("err", `保存校准记录失败：${err.message}`);
      }

      handle.done = i + 1;
      updateSessionUI();
    }

    handle.active = false;
    await refresh();
    updateSessionUI();

    const values = handle.values;
    if (values.length) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd =
        values.length > 1
          ? Math.sqrt(
              values.reduce((a, b) => a + (b - mean) ** 2, 0) /
                (values.length - 1),
            )
          : 0;
      toast(
        `空白测试采集完成：n=${values.length}，均值 ${fmtNum(mean)}，SD ${fmtNum(sd)} ${
          handle.cancel ? "（已手动中止）" : ""
        }`,
        "ok",
      );
    } else {
      toast("空白测试采集完成，但没有解析到有效数值", "error");
    }

    if (P.settings) P.settings.refreshRecordCount();
    if (P.history) P.history.query();
    session = null;
    updateSessionUI();
  }

  /** 样品测试：单次发送并读取，自动扣除空白参照值后保存 */
  async function runSampleTest() {
    if (session && session.active) {
      toast("已有采集任务正在进行", "error");
      return;
    }
    if (!state.status.connected) {
      toast("串口未连接，请先在「设置」中连接串口", "error");
      return;
    }
    if (!sampleReady()) {
      toast("请先完成空白测试，再进行样品测试", "error");
      return;
    }
    const params = P.console.readForm();
    if (!String(params.payload).trim()) {
      toast("请填写要发送的数据", "error");
      return;
    }

    updateButtons();
    try {
      const res = await api.serial.send({
        data: params.payload,
        encoding: params.encoding,
        terminator: params.terminator,
        expectResponse: true,
        timeout: params.timeout,
      });
      const raw = res && res.response ? res.response.text : "";
      const value = parseNumeric(raw);
      if (value === null) {
        const why = raw || (res && res.error) || "无返回";
        P.log.add("err", `样品测试未解析到数值：${why}`);
        toast(`样品测试未解析到数值：${why}`, "error");
        return;
      }

      try {
        await api.db.saveMeasurement({
          category: "sample",
          value,
          unit: P.unit(),
          raw,
          payload: params.payload,
          port: state.status.path || null,
          baudRate: state.status.baudRate || null,
          source: "manual",
          note: P.emptyToNull(el("save-note").value),
          meta: {
            hex: res && res.response ? res.response.hex : null,
            receivedAt: res && res.response ? res.response.at : null,
            net: P.netSignal(value),
            concentration: P.concentration(value),
            concentrationUnit: state.settings.curveUnit || null,
          },
        });
        el("save-note").value = "";
        toast(`样品测试完成，已保存：${fmtNum(value)} ${P.unit()}`, "ok");
      } catch (err) {
        toast(`保存样品记录失败：${err.message}`, "error");
        return;
      }

      if (P.detect) P.detect.refreshRecent();
      if (P.settings) P.settings.refreshRecordCount();
      if (P.history) P.history.query();
    } catch (err) {
      P.log.add("err", err.message);
      toast(err.message, "error");
    } finally {
      updateButtons();
    }
  }

  function stopSession() {
    if (session && session.active) {
      session.cancel = true;
      toast("已请求停止采集，将在当前一次发送结束后停止", "ok");
    }
  }

  /** 读取空白参照统计并刷新界面（含样品测试按钮可用状态） */
  async function refresh() {
    const n = Math.max(1, Number(state.settings.calibrationWindow) || 5);
    let summary = { blank: {}, aptamer_blank: {} };
    try {
      summary = await api.db.calibrationSummary(n);
    } catch (err) {
      toast(`读取校准数据失败：${err.message}`, "error");
    }
    state.calibration = summary;

    const s = summary.blank || {};
    el("blank-ref-value").textContent =
      s.mean === null || s.mean === undefined ? "未测试" : fmtNum(s.mean);
    el("blank-ref-n").textContent = String(s.n || 0);

    updateSessionUI();
    if (P.detect) P.detect.refreshDerived();
  }

  function init() {
    el("btn-blank-test").addEventListener("click", () =>
      runBlankTest().catch((e) => {
        toast(e.message, "error");
        session = null;
        updateSessionUI();
      }),
    );
    el("btn-sample-test").addEventListener("click", () =>
      runSampleTest().catch((e) => {
        toast(e.message, "error");
        updateButtons();
      }),
    );
    el("btn-session-stop").addEventListener("click", stopSession);

    updateSessionUI();
  }

  window.POCT.test = {
    init,
    refresh,
    runBlankTest,
    runSampleTest,
    stopSession,
    isRunning: () => Boolean(session && session.active),
  };

  // 兼容旧引用（detect.js 中保存空白后刷新参照值）
  window.POCT.calibration = { refresh };
})();
