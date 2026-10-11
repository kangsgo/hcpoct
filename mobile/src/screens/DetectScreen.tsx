/** 检测页：采集控制台、实时结果、数据流、最近记录 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useSerial } from "../state/SerialProvider";
import { useSettings } from "../state/SettingsProvider";
import { useData } from "../state/DataProvider";
import { useToast } from "../state/ToastProvider";
import { frameStore, timedStore, useStore } from "../state/stores";
import {
  listMeasurements,
  calibrationSummary,
  saveMeasurement,
} from "../lib/store";
import {
  emptyToNull,
  fmtNum,
  fmtTime,
  parseNumeric,
  toNumberOrNull,
} from "../lib/format";
import { pushLog } from "../lib/logBus";
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  type Category,
  type Encoding,
  type Terminator,
} from "../lib/types";
import {
  Accordion,
  Chip,
  Field,
  KV,
  Panel,
  Row,
  Toggle,
} from "../components/ui";
import { Icon } from "../components/Icons";
import { LogView } from "../components/LogView";

const QUICK_PAYLOADS: { label: string; value: string; encoding: Encoding }[] = [
  { label: "READ", value: "READ", encoding: "ascii" },
  { label: "MEASURE", value: "MEASURE", encoding: "ascii" },
  { label: "GET?", value: "GET?", encoding: "ascii" },
  { label: "R", value: "R", encoding: "ascii" },
  {
    label: "HEX 01 03 00 00 00 01",
    value: "01 03 00 00 00 01",
    encoding: "hex",
  },
  { label: "HEX 0A", value: "0A", encoding: "hex" },
];

interface LastMeta {
  raw: string;
  hex: string;
  at: string;
  length: number;
  port: string | null;
  parsed: number | null;
}

export function DetectScreen() {
  const { t } = useI18n();
  const { settings, setSettings } = useSettings();
  const { status, sending, sendOnce, startTimed, stopTimed } = useSerial();
  const { toast } = useToast();
  const { version, touch, markSaved, recordCounts } = useData();

  const latest = useStore(frameStore);
  const timed = useStore(timedStore);

  const [valueText, setValueText] = useState("");
  const [lastMeta, setLastMeta] = useState<LastMeta | null>(null);
  const [payloadInput, setPayloadInput] = useState(settings.payload);
  const [category, setCategory] = useState<Category>("sample");
  const [note, setNote] = useState("");

  const unit = settings.unit;

  // 控制台发送内容：停止输入 400ms 后持久化，避免每敲一个字都写存储
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSettings({ payload: payloadInput }),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [payloadInput, setSettings]);

  // 收到数据帧 → 解析数值并填充结果
  useEffect(() => {
    if (!latest) return;
    const parsed = parseNumeric(latest.text);
    setValueText(parsed === null ? "" : String(parsed));
    setLastMeta({
      raw: latest.text,
      hex: latest.hex,
      at: latest.at,
      length: latest.length,
      port: status.portLabel,
      parsed,
    });
    if (parsed === null) {
      pushLog(
        "sys",
        t(
          "接收时间 {time} · {port} · {length} 字节（未解析到数值，可手动填写后保存）",
          {
            time: fmtTime(latest.at, false),
            port: status.portLabel ?? "--",
            length: latest.length,
          },
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  const blankRef = useMemo(() => {
    const summary = calibrationSummary(settings.calibrationWindow);
    return summary.aptamer_blank.mean;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, settings.calibrationWindow]);

  const recent = useMemo(
    () => listMeasurements({ category: "all", limit: 8 }).rows,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const value = toNumberOrNull(valueText);
  const netSignal =
    value !== null && blankRef !== null ? value - blankRef : null;
  const concentration =
    settings.curveEnabled &&
    netSignal !== null &&
    Number(settings.curveSlope) !== 0
      ? (netSignal - Number(settings.curveIntercept || 0)) /
        Number(settings.curveSlope)
      : null;

  // 自动保存（用帧时间戳去重，避免 StrictMode 下重复写入）
  const autoSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || !settings.autoSave) return;
    if (autoSavedRef.current === latest.at) return;
    autoSavedRef.current = latest.at;
    const parsed = parseNumeric(latest.text);
    if (parsed === null) return;
    writeRecord(parsed, null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, settings.autoSave]);

  function writeRecord(
    valueToSave: number,
    noteText: string | null,
    silent: boolean,
    cat: Category = category,
  ): boolean {
    try {
      saveMeasurement({
        category: cat,
        value: valueToSave,
        unit,
        raw: lastMeta?.raw ?? null,
        payload: payloadInput,
        port: status.portLabel,
        baudRate: status.baudRate,
        source: timed.running ? "timed" : "manual",
        note: noteText,
        meta: {
          hex: lastMeta?.hex ?? null,
          receivedAt: lastMeta?.at ?? null,
          net: valueToSave - (blankRef ?? 0),
          concentration,
          concentrationUnit: settings.curveUnit || null,
        },
      });
      touch();
      markSaved();
    } catch (err) {
      toast(
        t("本地存储写入失败（可能已超出容量上限）：{msg}", {
          msg: err instanceof Error ? err.message : String(err),
        }),
        "error",
      );
      return false;
    }
    if (!silent) {
      toast(
        t("已保存：{text}", {
          text: `${t(CATEGORY_SHORT[cat])} ${fmtNum(valueToSave)} ${unit}`,
        }),
        "ok",
      );
      setNote("");
    }
    return true;
  }

  function handleSave() {
    const v = toNumberOrNull(valueText);
    if (v === null) {
      toast(t("暂无数值可保存，请先采集或手动填写数值"), "error");
      return;
    }
    if (!writeRecord(v, emptyToNull(note), false)) return;
    if (category !== "sample")
      toast(
        t("将保存为{kind}，同时计入校准参照值", {
          kind: t(CATEGORY_LABELS[category]),
        }),
        "ok",
      );
  }

  async function sendAndRead() {
    const payload = payloadInput.trim();
    if (!payload) {
      toast(t("请填写要发送的数据"), "error");
      return;
    }
    const res = await sendOnce({
      data: payloadInput,
      encoding: settings.encoding,
      terminator: settings.terminator,
      expectResponse: true,
      timeout: settings.timeout,
    });
    if (res && !res.ok && res.error) {
      const message = t("等待响应超时（{ms}ms）", { ms: settings.timeout });
      toast(message, "error");
      pushLog("err", message);
    }
  }

  async function sendOnly() {
    const payload = payloadInput.trim();
    if (!payload) {
      toast(t("请填写要发送的数据"), "error");
      return;
    }
    await sendOnce({
      data: payloadInput,
      encoding: settings.encoding,
      terminator: settings.terminator,
      expectResponse: false,
    });
  }

  function handleStartTimed() {
    const payload = payloadInput.trim();
    if (!payload) {
      toast(t("请填写要发送的数据"), "error");
      return;
    }
    startTimed({
      data: payloadInput,
      encoding: settings.encoding,
      terminator: settings.terminator,
      expectResponse: settings.expectResponse,
      interval: settings.interval,
      times: settings.times,
      timeout: settings.timeout,
    });
    const message = t("定时发送已启动：每 {interval}ms 一次，共 {times} 次", {
      interval: settings.interval,
      times: settings.times === 0 ? t("不限") : settings.times,
    });
    toast(message, "ok");
    pushLog("sys", message);
  }

  function handleStopTimed() {
    stopTimed(t("手动停止"));
  }

  const resultMeta = lastMeta
    ? t("接收时间 {time} · {port} · {length} 字节", {
        time: fmtTime(lastMeta.at, false),
        port: lastMeta.port ?? "--",
        length: lastMeta.length,
      })
    : t("尚未收到数据");

  return (
    <div className="screen">
      {/* -------------------------------- 最近测量结果 -------------------------------- */}
      <Panel
        title={t("最近测量结果")}
        chip={
          <Chip tone={status.connected ? "ok" : "muted"}>
            {status.connected ? t("已连接") : t("未连接")}
          </Chip>
        }
      >
        <div className="result-value">
          <input
            className="big-input"
            type="text"
            inputMode="decimal"
            placeholder="--"
            value={valueText}
            onChange={(event) => setValueText(event.target.value)}
          />
          <span className="unit">{unit}</span>
        </div>
        <p className="result-meta">{resultMeta}</p>

        <KV
          label={t("适配体空白参照")}
          value={
            blankRef === null ? t("未校准") : `${fmtNum(blankRef)} ${unit}`
          }
        />
        <KV
          label={t("净信号（扣除空白）")}
          value={netSignal === null ? "--" : `${fmtNum(netSignal)} ${unit}`}
        />
        <KV
          label={t("换算浓度")}
          value={
            !settings.curveEnabled
              ? t("未启用标准曲线")
              : concentration === null
                ? "--"
                : `${fmtNum(concentration)} ${settings.curveUnit || "ng/mL"}`
          }
        />

        <Accordion title={t("原始返回")}>
          <div className="mono-block">
            {lastMeta?.raw ? lastMeta.raw : "--"}
          </div>
          <div className="mono-block dim">HEX: {lastMeta?.hex || "--"}</div>
        </Accordion>

        <div className="save-form">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            <option value="sample">{t(CATEGORY_LABELS.sample)}</option>
            <option value="blank">{t(CATEGORY_LABELS.blank)}</option>
            <option value="aptamer_blank">
              {t(CATEGORY_LABELS.aptamer_blank)}
            </option>
          </select>
          <input
            type="text"
            placeholder={t("备注 / 样本编号")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button className="btn primary block" onClick={handleSave}>
            <Icon name="check" size={16} />
            {t("保存到历史记录")}
          </button>
        </div>
      </Panel>

      {/* -------------------------------- 采集控制台 -------------------------------- */}
      <Panel title={t("发送数据（任意内容）")}>
        <Field>
          <input
            type="text"
            value={payloadInput}
            onChange={(event) => setPayloadInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendAndRead();
            }}
          />
        </Field>
        <div className="chips">
          {QUICK_PAYLOADS.map((item) => (
            <button
              key={item.label}
              className="chip-btn"
              title={t("点击填入发送内容")}
              onClick={() => {
                setPayloadInput(item.value);
                setSettings({ encoding: item.encoding });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Row className="tight">
          <button
            className="btn primary grow"
            disabled={sending || timed.running}
            onClick={() => void sendAndRead()}
          >
            <Icon name="send" size={16} />
            {t("发送并读取")}
          </button>
          <button
            className="btn"
            disabled={sending || timed.running}
            onClick={() => void sendOnly()}
          >
            {t("仅发送")}
          </button>
        </Row>
        <Row className="tight">
          <button
            className="btn accent grow"
            disabled={sending || timed.running}
            onClick={handleStartTimed}
          >
            <Icon name="clock" size={16} />
            {t("定时发送")}
          </button>
          <button
            className="btn danger"
            disabled={!timed.running}
            onClick={handleStopTimed}
          >
            {t("停止")}
          </button>
        </Row>

        <Accordion
          title={t("高级参数")}
          summary={`${settings.encoding.toUpperCase()} · ${settings.timeout}ms · ${settings.interval}ms × ${
            settings.times === 0 ? t("不限") : settings.times
          }`}
        >
          <Row className="grid-2">
            <Field label={t("编码")}>
              <select
                value={settings.encoding}
                onChange={(event) =>
                  setSettings({ encoding: event.target.value as Encoding })
                }
              >
                <option value="ascii">{t("ASCII / 文本")}</option>
                <option value="hex">{t("HEX 字节")}</option>
              </select>
            </Field>
            <Field label={t("发送追加")}>
              <select
                value={settings.terminator}
                onChange={(event) =>
                  setSettings({ terminator: event.target.value as Terminator })
                }
              >
                <option value="none">{t("不追加")}</option>
                <option value="lf">{t("换行 \\n")}</option>
                <option value="cr">{t("回车 \\r")}</option>
                <option value="crlf">{t("回车换行 \\r\\n")}</option>
              </select>
            </Field>
          </Row>
          <Row className="grid-3">
            <Field label={t("响应超时(ms)")}>
              <input
                type="number"
                min={50}
                step={50}
                value={settings.timeout}
                onChange={(event) =>
                  setSettings({
                    timeout: Math.max(50, Number(event.target.value) || 1500),
                  })
                }
              />
            </Field>
            <Field label={t("定时间隔(ms)")}>
              <input
                type="number"
                min={50}
                step={50}
                value={settings.interval}
                onChange={(event) =>
                  setSettings({
                    interval: Math.max(50, Number(event.target.value) || 1000),
                  })
                }
              />
            </Field>
            <Field label={t("定时次数")}>
              <input
                type="number"
                min={0}
                step={1}
                value={settings.times}
                onChange={(event) =>
                  setSettings({
                    times: Math.max(
                      0,
                      Math.trunc(Number(event.target.value) || 0),
                    ),
                  })
                }
              />
            </Field>
          </Row>
          <div className="switches">
            <Toggle
              checked={settings.expectResponse}
              onChange={(v) => setSettings({ expectResponse: v })}
            >
              {t("等待设备返回")}
            </Toggle>
            <Toggle
              checked={settings.autoSave}
              onChange={(v) => {
                setSettings({ autoSave: v });
                toast(
                  v ? t("已开启自动保存检测结果") : t("已关闭自动保存"),
                  "ok",
                );
              }}
            >
              {t("自动保存检测结果")}
            </Toggle>
            <Toggle
              checked={settings.framesOnly}
              onChange={(v) => setSettings({ framesOnly: v })}
            >
              {t("日志仅显示解析帧")}
            </Toggle>
          </div>
        </Accordion>
      </Panel>

      {/* -------------------------------- 实时数据流 -------------------------------- */}
      <LogView />

      {/* -------------------------------- 最近记录 -------------------------------- */}
      <Panel title={t("最近记录")} chip={<Chip>{recordCounts.all}</Chip>}>
        <div className="recent-list">
          {recent.length === 0 ? (
            <p className="hint">{t("暂无记录")}</p>
          ) : (
            recent.map((row) => (
              <div className="recent-item" key={row.id}>
                <Chip>{t(CATEGORY_SHORT[row.category])}</Chip>
                <span className="v">
                  {row.value === null ? "--" : fmtNum(row.value)}
                </span>
                <span className="muted">{row.unit}</span>
                {row.note ? <span className="muted">· {row.note}</span> : null}
                <span className="c">{fmtTime(row.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
