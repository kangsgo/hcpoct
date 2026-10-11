/** 校准页：空白 / 适配体+染料空白 的采集、统计与校准数据管理 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useSerial } from "../state/SerialProvider";
import { useSettings } from "../state/SettingsProvider";
import { useData } from "../state/DataProvider";
import { useToast } from "../state/ToastProvider";
import {
  calibrationSummary,
  clearCalibrations,
  deleteCalibration,
  listCalibrations,
  saveMeasurement,
} from "../lib/store";
import { buildCsv, downloadCsv, timeStamp } from "../lib/csv";
import {
  describe,
  fmtNum,
  fmtTime,
  parseNumeric,
  toNumberOrNull,
} from "../lib/format";
import { pushLog } from "../lib/logBus";
import {
  CALIBRATION_KINDS,
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  type CalibrationKind,
  type Measurement,
  type Stats,
} from "../lib/types";
import { Chip, Field, Panel, Row } from "../components/ui";
import { Icon } from "../components/Icons";

interface SessionState {
  active: boolean;
  kind: CalibrationKind;
  total: number;
  done: number;
  ok: number;
  fail: number;
  values: number[];
}

const EMPTY_STATS: Stats = {
  n: 0,
  mean: null,
  sd: null,
  cv: null,
  min: null,
  max: null,
};

export function CalibrationScreen() {
  const { t, csvLabels } = useI18n();
  const { settings } = useSettings();
  const { status, sendOnce } = useSerial();
  const { toast, confirm } = useToast();
  const { version, touch } = useData();

  const [session, setSession] = useState<SessionState | null>(null);
  const [filter, setFilter] = useState<CalibrationKind | "all">("all");
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);

  const summary = useMemo(
    () => calibrationSummary(settings.calibrationWindow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, settings.calibrationWindow],
  );

  const calibrations = useMemo(
    () => listCalibrations({ kind: filter, limit: 200 }).rows,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, filter],
  );

  const lastByKind = useMemo(() => {
    const all = listCalibrations({ kind: "all", limit: 200 }).rows;
    const out: Partial<Record<CalibrationKind, number | null>> = {};
    for (const row of all)
      if (out[row.kind] === undefined) out[row.kind] = row.value;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // 组件卸载时请求停止采集，避免离开页面后仍在发送
  useEffect(
    () => () => {
      cancelRef.current = true;
    },
    [],
  );

  function handleSave(
    kind: CalibrationKind,
    value: number | null,
    note: string | null,
  ) {
    try {
      saveMeasurement({
        category: kind,
        value,
        unit: settings.unit,
        source: "calibration",
        note,
        port: status.portLabel,
        baudRate: status.baudRate,
        payload: settings.payload,
      });
      touch();
      return true;
    } catch (err) {
      toast(
        t("本地存储写入失败（可能已超出容量上限）：{msg}", {
          msg: err instanceof Error ? err.message : String(err),
        }),
        "error",
      );
      return false;
    }
  }

  async function runSession(kind: CalibrationKind, times: number) {
    if (session?.active) {
      toast(t("已有采集任务正在进行"), "error");
      return;
    }
    if (!status.connected) {
      toast(t("串口未连接，请先在「连接」页连接串口"), "error");
      return;
    }
    const total = Math.max(1, Math.trunc(times));
    const state: SessionState = {
      active: true,
      kind,
      total,
      done: 0,
      ok: 0,
      fail: 0,
      values: [],
    };
    cancelRef.current = false;
    setSession({ ...state });

    pushLog(
      "sys",
      t(
        "开始校准采集：{kind}，共 {total} 次，间隔 {interval}ms，发送 “{payload}”",
        {
          kind: t(CATEGORY_LABELS[kind]),
          total,
          interval: settings.interval,
          payload: settings.payload,
        },
      ),
    );

    for (let i = 0; i < total; i += 1) {
      if (cancelRef.current) break;
      if (i > 0) {
        // 分片等待，保证停止操作能及时生效
        const step = 100;
        let waited = 0;
        while (waited < settings.interval && !cancelRef.current) {
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              Math.min(step, settings.interval - waited),
            ),
          );
          waited += step;
        }
        if (cancelRef.current) break;
      }

      const res = await sendOnce({
        data: settings.payload,
        encoding: settings.encoding,
        terminator: settings.terminator,
        expectResponse: true,
        timeout: settings.timeout,
      });

      const raw = res?.response?.text ?? "";
      const parsed = res?.response ? parseNumeric(raw) : null;

      if (parsed === null) {
        state.fail += 1;
        pushLog(
          "err",
          t("第 {index} 次采集未解析到数值：{raw}", {
            index: i + 1,
            raw: raw || res?.error || t("未收到返回数据"),
          }),
        );
      } else {
        state.ok += 1;
        state.values.push(parsed);
      }

      handleSave(
        kind,
        parsed,
        t("校准采集 {index}/{total}", { index: i + 1, total }),
      );

      state.done = i + 1;
      setSession({ ...state });
    }

    const values = state.values;
    const stats = describe(values);
    const aborted = cancelRef.current;
    setSession(null);
    touch();

    if (stats.n > 0) {
      toast(
        aborted
          ? t("{kind}采集完成：n={n}，均值 {mean}，SD {sd}（已手动中止）", {
              kind: t(CATEGORY_SHORT[kind]),
              n: stats.n,
              mean: fmtNum(stats.mean),
              sd: fmtNum(stats.sd),
            })
          : t("{kind}采集完成：n={n}，均值 {mean}，SD {sd}", {
              kind: t(CATEGORY_SHORT[kind]),
              n: stats.n,
              mean: fmtNum(stats.mean),
              sd: fmtNum(stats.sd),
            }),
        "ok",
      );
    } else {
      toast(
        t("{kind}采集完成，但没有解析到有效数值", {
          kind: t(CATEGORY_SHORT[kind]),
        }),
        "error",
      );
    }
  }

  function stopSession() {
    if (session?.active) {
      cancelRef.current = true;
      toast(t("已请求停止采集，将在当前一次发送结束后停止"), "ok");
    }
  }

  async function handleClear(kind: CalibrationKind) {
    const ok = await confirm(
      t("确定要清空「{kind}」的校准记录吗？", {
        kind: t(CATEGORY_LABELS[kind]),
      }),
    );
    if (!ok) return;
    const deleted = clearCalibrations(kind);
    touch();
    toast(t("已清空 {n} 条校准记录", { n: deleted }), "ok");
  }

  function handleManual(kind: CalibrationKind) {
    const value = toNumberOrNull(manualInputs[kind]);
    if (value === null) {
      toast(t("数值格式无效"), "error");
      return;
    }
    if (!handleSave(kind, value, t("手动录入"))) return;
    setManualInputs((prev) => ({ ...prev, [kind]: "" }));
    toast(
      t("已保存校准数据：{value} {unit}", {
        value: fmtNum(value),
        unit: settings.unit,
      }),
      "ok",
    );
  }

  function handleDelete(id: number) {
    const deleted = deleteCalibration(id);
    if (deleted > 0) {
      touch();
      toast(t("已删除校准记录"), "ok");
    }
  }

  function handleExport() {
    const { rows } = listCalibrations({ kind: filter, limit: 2000 });
    if (!rows.length) {
      toast(t("暂无校准数据可导出"), "error");
      return;
    }
    const mapped: Measurement[] = rows.map((row) => ({
      id: row.id,
      category: row.kind,
      value: row.value,
      unit: row.unit,
      raw: row.raw,
      payload: null,
      port: null,
      baudRate: null,
      source: "calibration",
      note: row.note,
      meta: null,
      createdAt: row.createdAt,
    }));
    const file = downloadCsv(
      `poct-calibration-${timeStamp()}.csv`,
      buildCsv(mapped, csvLabels()),
    );
    toast(t("已导出 {n} 条校准记录：{file}", { n: mapped.length, file }), "ok");
  }

  const progress = session
    ? Math.round((session.done / session.total) * 100)
    : 0;

  return (
    <div className="screen">
      <Panel title={t("空白校准")}>
        <p className="hint">
          {t(
            "校准流程：① 先测「空白」（仅缓冲液 / 空白孔）；② 再测「适配体+染料空白」（不加目标物，只加适配体与染料）。两步的均值会作为参照值保存，样本检测时自动扣除适配体空白参照值得到净信号。采集参数取自「检测」页的定时间隔 / 定时次数。",
          )}
        </p>
      </Panel>

      {CALIBRATION_KINDS.map((kind) => {
        const stats = summary[kind] ?? EMPTY_STATS;
        const running = session?.active && session.kind === kind;
        return (
          <Panel
            key={kind}
            title={t(CATEGORY_LABELS[kind])}
            chip={<Chip tone={stats.n > 0 ? "ok" : "muted"}>n={stats.n}</Chip>}
          >
            <div className="calib-stats">
              <div>
                <span>{t("参照值")}</span>
                <b>{stats.mean === null ? t("未校准") : fmtNum(stats.mean)}</b>
              </div>
              <div>
                <span>{t("均值")}</span>
                <b>{fmtNum(stats.mean)}</b>
              </div>
              <div>
                <span>SD</span>
                <b>{fmtNum(stats.sd)}</b>
              </div>
              <div>
                <span>{t("CV(%)")}</span>
                <b>{fmtNum(stats.cv, 2)}</b>
              </div>
              <div>
                <span>{t("最近值")}</span>
                <b>
                  {lastByKind[kind] === undefined || lastByKind[kind] === null
                    ? "--"
                    : fmtNum(lastByKind[kind])}
                </b>
              </div>
            </div>

            <Row className="tight">
              <button
                className="btn primary grow"
                disabled={Boolean(session?.active)}
                onClick={() =>
                  void runSession(
                    kind,
                    settings.times === 0 ? 1 : settings.times,
                  )
                }
              >
                <Icon name="clock" size={16} />
                {t("定时采集")}
              </button>
              <button
                className="btn"
                disabled={Boolean(session?.active)}
                onClick={() => void runSession(kind, 1)}
              >
                {t("采集 1 次")}
              </button>
              <button
                className="btn danger"
                onClick={() => void handleClear(kind)}
              >
                {t("清空该类")}
              </button>
            </Row>

            <Row className="tight manual-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t("手动录入数值")}
                value={manualInputs[kind] ?? ""}
                onChange={(event) =>
                  setManualInputs((prev) => ({
                    ...prev,
                    [kind]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleManual(kind);
                }}
              />
              <button className="btn ghost" onClick={() => handleManual(kind)}>
                {t("手动录入")}
              </button>
            </Row>

            {running ? (
              <p className="hint">
                {t("采集中 {done}/{total}", {
                  done: session?.done ?? 0,
                  total: session?.total ?? 0,
                })}
              </p>
            ) : null}
          </Panel>
        );
      })}

      <Panel
        title={t("采集进度")}
        chip={
          <Chip tone={session?.active ? "warn" : "muted"}>
            {session?.active
              ? t("采集中 {done}/{total}", {
                  done: session.done,
                  total: session.total,
                })
              : t("空闲")}
          </Chip>
        }
      >
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <Row className="tight">
          <button
            className="btn danger"
            disabled={!session?.active}
            onClick={stopSession}
          >
            {t("停止采集")}
          </button>
          <span className="hint">
            {session?.active
              ? t("正在采集「{kind}」，成功 {ok} 次 / 失败 {fail} 次", {
                  kind: t(CATEGORY_LABELS[session.kind]),
                  ok: session.ok,
                  fail: session.fail,
                })
              : t(
                  "点击卡片上的「定时采集」按钮开始，次数与间隔取自「检测」页控制台",
                )}
          </span>
        </Row>
      </Panel>

      <Panel
        title={t("校准返回数据")}
        chip={<Chip>{calibrations.length}</Chip>}
        actions={
          <button className="btn ghost sm" onClick={handleExport}>
            <Icon name="download" size={15} />
            {t("导出 CSV")}
          </button>
        }
      >
        <Field>
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as CalibrationKind | "all")
            }
          >
            <option value="all">{t("全部校准")}</option>
            <option value="blank">{t("仅空白")}</option>
            <option value="aptamer_blank">{t("仅适配体空白")}</option>
          </select>
        </Field>

        {calibrations.length === 0 ? (
          <p className="hint">{t("暂无校准数据")}</p>
        ) : (
          <ul className="record-list">
            {calibrations.map((row) => (
              <li key={row.id} className="record-item">
                <div className="record-main">
                  <span className="record-value">
                    {row.value === null ? "--" : fmtNum(row.value)}
                    <em>{row.unit}</em>
                  </span>
                  <span className="muted">
                    {t(CATEGORY_SHORT[row.kind as CalibrationKind])} ·{" "}
                    {fmtTime(row.createdAt)}
                  </span>
                  {row.raw ? (
                    <span className="record-raw">{row.raw}</span>
                  ) : null}
                  {row.note ? <span className="muted">{row.note}</span> : null}
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
      </Panel>
    </div>
  );
}
