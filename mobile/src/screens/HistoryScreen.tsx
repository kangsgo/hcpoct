/** 历史页：筛选、分页、删除、导出 CSV */

import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { useData } from "../state/DataProvider";
import { useToast } from "../state/ToastProvider";
import {
  clearMeasurements,
  deleteMeasurement,
  listMeasurements,
} from "../lib/store";
import { buildCsv, downloadCsv, timeStamp } from "../lib/csv";
import { describe, fmtNum, fmtTime } from "../lib/format";
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  SOURCE_LABELS,
  type Category,
} from "../lib/types";
import { Chip, Field, Panel, Row } from "../components/ui";
import { Icon } from "../components/Icons";

const LIMITS = [50, 100, 200, 500];

function dayStart(value: string): string | null {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function dayEnd(value: string): string | null {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
}

export function HistoryScreen() {
  const { t, csvLabels } = useI18n();
  const { toast, confirm } = useToast();
  const { version, touch, recordCounts } = useData();

  const [category, setCategory] = useState<Category | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);

  const result = useMemo(
    () =>
      listMeasurements({
        category,
        keyword,
        from: dayStart(from),
        to: dayEnd(to),
        limit,
        offset,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, category, keyword, from, to, limit, offset],
  );

  const pageStats = useMemo(
    () => describe(result.rows.map((row) => row.value)),
    [result.rows],
  );

  const pages = Math.max(1, Math.ceil(result.total / result.limit));
  const currentPage = Math.floor(result.offset / result.limit) + 1;

  function resetTo(updater: () => void) {
    setOffset(0);
    updater();
  }

  function handleExportCurrent() {
    const { rows } = listMeasurements({
      category,
      keyword,
      from: dayStart(from),
      to: dayEnd(to),
      limit: 2000,
      offset: 0,
    });
    if (!rows.length) {
      toast(t("当前筛选没有可导出的记录"), "error");
      return;
    }
    const file = downloadCsv(
      `poct-cortisol-${timeStamp()}.csv`,
      buildCsv(rows, csvLabels()),
    );
    toast(t("已导出 {n} 条记录：{file}", { n: rows.length, file }), "ok");
  }

  function handleExportAll() {
    const { rows } = listMeasurements({ category: "all", limit: 2000 });
    if (!rows.length) {
      toast(t("暂无记录可导出"), "error");
      return;
    }
    const file = downloadCsv(
      `poct-cortisol-all-${timeStamp()}.csv`,
      buildCsv(rows, csvLabels()),
    );
    toast(t("已导出 {n} 条记录：{file}", { n: rows.length, file }), "ok");
  }

  async function handleClearFiltered() {
    const label =
      category === "all" ? t("全部类别") : t(CATEGORY_LABELS[category]);
    const ok = await confirm(
      t("确定要清空「{label}」的检测记录吗？此操作不可撤销。", { label }),
    );
    if (!ok) return;
    const deleted = clearMeasurements(category);
    touch();
    setOffset(0);
    toast(t("已清空 {n} 条记录", { n: deleted }), "ok");
  }

  function handleDelete(id: number) {
    const deleted = deleteMeasurement(id);
    if (deleted > 0) {
      touch();
      toast(t("已删除该条记录"), "ok");
    }
  }

  return (
    <div className="screen">
      <Panel
        title={t("历史检测记录")}
        chip={<Chip>{result.total}</Chip>}
        actions={
          <button
            className="btn ghost sm"
            onClick={handleExportCurrent}
            title={t("导出 CSV")}
          >
            <Icon name="download" size={15} />
            CSV
          </button>
        }
      >
        <Row className="grid-2">
          <Field label={t("类别")}>
            <select
              value={category}
              onChange={(event) =>
                resetTo(() =>
                  setCategory(event.target.value as Category | "all"),
                )
              }
            >
              <option value="all">{t("全部类别")}</option>
              <option value="sample">{t(CATEGORY_LABELS.sample)}</option>
              <option value="blank">{t(CATEGORY_LABELS.blank)}</option>
              <option value="aptamer_blank">
                {t(CATEGORY_LABELS.aptamer_blank)}
              </option>
            </select>
          </Field>
          <Field label={t("每页条数")}>
            <select
              value={String(limit)}
              onChange={(event) =>
                resetTo(() => setLimit(Number(event.target.value)))
              }
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  {t("{n} 条/页", { n: value })}
                </option>
              ))}
            </select>
          </Field>
        </Row>

        <Row className="grid-2">
          <Field label={t("开始日期")}>
            <input
              type="date"
              value={from}
              onChange={(event) => resetTo(() => setFrom(event.target.value))}
            />
          </Field>
          <Field label={t("结束日期")}>
            <input
              type="date"
              value={to}
              onChange={(event) => resetTo(() => setTo(event.target.value))}
            />
          </Field>
        </Row>

        <Field>
          <input
            type="text"
            placeholder={t("备注 / 原始数据关键词")}
            value={keyword}
            onChange={(event) => resetTo(() => setKeyword(event.target.value))}
          />
        </Field>

        <Row className="tight">
          <button className="btn grow" onClick={handleExportAll}>
            {t("导出全部")}
          </button>
          <button
            className="btn danger"
            onClick={() => void handleClearFiltered()}
          >
            {t("清空筛选结果")}
          </button>
        </Row>
      </Panel>

      <Panel>
        <div className="stat-strip">
          <span>
            {t("筛选结果")} <b>{result.total}</b>
          </span>
          <span>
            {t("全部记录")} <b>{recordCounts.all}</b>
          </span>
          <span>
            {t("样本")} <b>{recordCounts.sample}</b>
          </span>
          <span>
            {t("空白")} <b>{recordCounts.blank}</b>
          </span>
          <span>
            {t("适配体空白")} <b>{recordCounts.aptamer_blank}</b>
          </span>
          <span>
            {t("本页均值")} <b>{fmtNum(pageStats.mean)}</b>
          </span>
          <span>
            {t("本页 SD")} <b>{fmtNum(pageStats.sd)}</b>
          </span>
        </div>
      </Panel>

      <Panel title={t("记录列表")} chip={<Chip>{result.rows.length}</Chip>}>
        {result.rows.length === 0 ? (
          <p className="hint">{t("暂无符合条件的记录")}</p>
        ) : (
          <ul className="record-list">
            {result.rows.map((row) => (
              <li key={row.id} className="record-item">
                <div className="record-main">
                  <span className="record-value">
                    {row.value === null ? "--" : fmtNum(row.value)}
                    <em>{row.unit}</em>
                  </span>
                  <span className="muted">
                    <Chip tone="muted">{t(CATEGORY_SHORT[row.category])}</Chip>{" "}
                    <Chip tone="muted">{t(SOURCE_LABELS[row.source])}</Chip>{" "}
                    {fmtTime(row.createdAt)}
                  </span>
                  {row.raw ? (
                    <span className="record-raw">{row.raw}</span>
                  ) : null}
                  <span className="muted">
                    #{row.id}
                    {row.port ? ` · ${row.port}` : ""}
                    {row.baudRate ? ` / ${row.baudRate}` : ""}
                    {row.note ? ` · ${row.note}` : ""}
                  </span>
                </div>
                <button
                  className="btn ghost sm"
                  onClick={() => handleDelete(row.id)}
                  title={t("删除")}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="pager">
          <button
            className="btn ghost sm"
            disabled={result.offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            {t("上一页")}
          </button>
          <span className="muted">
            {currentPage} / {pages}
          </span>
          <button
            className="btn ghost sm"
            disabled={result.offset + result.limit >= result.total}
            onClick={() => setOffset(offset + limit)}
          >
            {t("下一页")}
          </button>
          <span className="hint">
            {t("共 {total} 条记录，每页 {limit} 条", {
              total: result.total,
              limit: result.limit,
            })}
          </span>
        </div>
      </Panel>
    </div>
  );
}
