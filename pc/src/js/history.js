/* 历史检测记录：筛选、分页、删除、导出 */
(function () {
  "use strict";

  const P = window.POCT;
  const { api, el, toast, state, fmtTime, fmtNum, escapeHtml } = P;

  function buildFilter() {
    const from = el("h-from").value;
    const to = el("h-to").value;
    return {
      category: el("h-category").value,
      keyword: el("h-keyword").value.trim(),
      from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
      limit: Number(el("h-limit").value) || 100,
      offset: state.historyPage.offset,
    };
  }

  function describeValues(values) {
    const nums = values.filter((v) => Number.isFinite(v));
    if (!nums.length) return { n: 0, mean: null, sd: null };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const sd =
      nums.length > 1
        ? Math.sqrt(
            nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1),
          )
        : 0;
    return { n: nums.length, mean, sd };
  }

  async function renderStats(payload) {
    const { rows, total } = payload;
    const counts = await api.db.counts();
    const stat = describeValues(rows.map((r) => r.value));
    el("history-stats").innerHTML = `
      <span>筛选结果：<b>${total}</b></span>
      <span>全部记录：<b>${counts.all}</b></span>
      <span>样本 <b>${counts.sample}</b></span>
      <span>空白 <b>${counts.blank}</b></span>
      <span>适配体空白 <b>${counts.aptamer_blank}</b></span>
      <span>本页均值 <b>${stat.mean === null ? "--" : fmtNum(stat.mean)}</b></span>
      <span>本页 SD <b>${stat.sd === null ? "--" : fmtNum(stat.sd)}</b></span>
    `;
    el("history-count-chip").textContent = String(total);
    el("history-total").textContent =
      `共 ${total} 条记录，每页 ${payload.limit} 条`;
  }

  function renderRows(rows) {
    const tbody = el("history-tbody");
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td class="empty-row" colspan="10">暂无符合条件的记录</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td class="num">${r.id}</td>
          <td>${fmtTime(r.created_at)}</td>
          <td>${escapeHtml(P.CATEGORY_SHORT[r.category] || r.category)}</td>
          <td class="num">${r.value === null ? "--" : fmtNum(r.value)}</td>
          <td class="muted">${escapeHtml(r.unit || "")}</td>
          <td class="raw">${escapeHtml(r.raw || "")}</td>
          <td class="muted">${escapeHtml(r.port || "--")}${r.baud_rate ? ` / ${r.baud_rate}` : ""}</td>
          <td class="muted">${r.source === "timed" ? "定时" : r.source === "calibration" ? "校准" : "手动"}</td>
          <td>${escapeHtml(r.note || "")}</td>
          <td><button class="btn ghost sm" data-del-row="${r.id}">删除</button></td>
        </tr>`,
      )
      .join("");
  }

  async function query(resetOffset) {
    if (resetOffset) state.historyPage.offset = 0;
    try {
      const filter = buildFilter();
      const payload = await api.db.queryMeasurements(filter);
      state.historyPage.total = payload.total;
      state.historyPage.limit = payload.limit;

      renderRows(payload.rows);
      await renderStats(payload);

      const pages = Math.max(1, Math.ceil(payload.total / payload.limit));
      const current = Math.floor(payload.offset / payload.limit) + 1;
      el("page-info").textContent = `${current} / ${pages}`;
      el("btn-prev").disabled = payload.offset <= 0;
      el("btn-next").disabled = payload.offset + payload.limit >= payload.total;
      return payload;
    } catch (err) {
      toast(`查询失败：${err.message}`, "error");
      return null;
    }
  }

  async function removeRow(id) {
    await api.db.deleteMeasurement(id);
    toast("已删除该条记录", "ok");
    await query();
    if (P.detect) P.detect.refreshRecent();
    if (P.calibration) P.calibration.refresh();
    if (P.settings) P.settings.refreshRecordCount();
  }

  async function exportCurrent() {
    const filter = buildFilter();
    const { rows } = await api.db.queryMeasurements({
      ...filter,
      limit: 2000,
      offset: 0,
    });
    if (!rows.length) {
      toast("当前筛选没有可导出的记录", "error");
      return;
    }
    const res = await api.app.exportCsv({
      rows,
      title: P.t("导出检测记录"),
      filters: [{ name: P.t("CSV 文件"), extensions: ["csv"] }],
      labels: P.i18n.csvLabels(),
    });
    if (res && res.ok)
      toast(`已导出 ${res.count} 条记录：${res.filePath}`, "ok");
    else if (res && !res.canceled) toast("导出失败", "error");
  }

  async function clearFiltered() {
    const category = el("h-category").value;
    const label = category === "all" ? "全部类别" : P.CATEGORY_LABELS[category];
    if (
      !(await P.confirmDialog(
        `确定要清空「${label}」的检测记录吗？此操作不可撤销。`,
      ))
    )
      return;
    const res = await api.db.clearMeasurements(category);
    toast(`已清空 ${res.deleted} 条记录`, "ok");
    await query(true);
    if (P.detect) P.detect.refreshRecent();
    if (P.calibration) P.calibration.refresh();
    if (P.settings) P.settings.refreshRecordCount();
  }

  function init() {
    el("btn-query").addEventListener("click", () => query(true));
    el("btn-history-refresh").addEventListener("click", () => query());
    el("btn-export").addEventListener("click", () =>
      exportCurrent().catch((e) => toast(e.message, "error")),
    );
    el("btn-export-all").addEventListener("click", () =>
      P.settings.exportAll().catch((e) => toast(e.message, "error")),
    );
    el("btn-clear").addEventListener("click", () =>
      clearFiltered().catch((e) => toast(e.message, "error")),
    );

    el("btn-prev").addEventListener("click", () => {
      state.historyPage.offset = Math.max(
        0,
        state.historyPage.offset - state.historyPage.limit,
      );
      query();
    });
    el("btn-next").addEventListener("click", () => {
      state.historyPage.offset += state.historyPage.limit;
      query();
    });

    el("h-limit").addEventListener("change", () => query(true));
    el("h-category").addEventListener("change", () => query(true));
    el("h-keyword").addEventListener("keydown", (e) => {
      if (e.key === "Enter") query(true);
    });

    el("history-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-del-row]");
      if (!btn) return;
      removeRow(btn.dataset.delRow).catch((err) => toast(err.message, "error"));
    });
  }

  window.POCT.history = { init, query };
})();
