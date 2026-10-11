/** 设置页：测量与换算、连接默认值、数据存储、关于 */

import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useSettings } from "../state/SettingsProvider";
import { useData } from "../state/DataProvider";
import { useToast } from "../state/ToastProvider";
import { useSerial } from "../state/SerialProvider";
import {
  clearAll,
  formatBytes,
  listMeasurements,
  storageSize,
} from "../lib/store";
import { buildCsv, downloadCsv, timeStamp } from "../lib/csv";
import { Field, KV, Panel, Row, Toggle } from "../components/ui";
import { Icon } from "../components/Icons";

export function SettingsScreen() {
  const { t, lang, csvLabels } = useI18n();
  const { settings, setSettings, restoreDefaults, defaults } = useSettings();
  const { toast, confirm } = useToast();
  const { supported } = useSerial();
  const { touch, recordCounts } = useData();

  const [draft, setDraft] = useState({
    unit: settings.unit,
    calibrationWindow: String(settings.calibrationWindow),
    curveEnabled: settings.curveEnabled,
    curveSlope: String(settings.curveSlope),
    curveIntercept: String(settings.curveIntercept),
    curveUnit: settings.curveUnit,
    baudRate: String(settings.baudRate),
    timeout: String(settings.timeout),
    frameDelay: String(settings.frameDelay),
  });

  // 恢复默认后刷新表单
  useEffect(() => {
    setDraft({
      unit: settings.unit,
      calibrationWindow: String(settings.calibrationWindow),
      curveEnabled: settings.curveEnabled,
      curveSlope: String(settings.curveSlope),
      curveIntercept: String(settings.curveIntercept),
      curveUnit: settings.curveUnit,
      baudRate: String(settings.baudRate),
      timeout: String(settings.timeout),
      frameDelay: String(settings.frameDelay),
    });
  }, [
    settings.unit,
    settings.calibrationWindow,
    settings.curveEnabled,
    settings.curveSlope,
    settings.curveIntercept,
    settings.curveUnit,
    settings.baudRate,
    settings.timeout,
    settings.frameDelay,
  ]);

  const patch = (next: Partial<typeof draft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  function handleSave() {
    setSettings({
      unit: draft.unit.trim() || "a.u.",
      calibrationWindow: Math.max(
        1,
        Number(draft.calibrationWindow) || defaults.calibrationWindow,
      ),
      curveEnabled: draft.curveEnabled,
      curveSlope: Number(draft.curveSlope) || 0,
      curveIntercept: Number(draft.curveIntercept) || 0,
      curveUnit: draft.curveUnit.trim() || "ng/mL",
      baudRate: Number(draft.baudRate) || defaults.baudRate,
      timeout: Math.max(50, Number(draft.timeout) || defaults.timeout),
      frameDelay: Math.max(20, Number(draft.frameDelay) || defaults.frameDelay),
    });
    toast(t("设置已保存"), "ok");
  }

  async function handleRestore() {
    const ok = await confirm(t("确定要恢复默认设置吗？（不会删除历史数据）"));
    if (!ok) return;
    restoreDefaults();
    toast(t("已恢复默认设置"), "ok");
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

  async function handleClearAll() {
    const ok = await confirm(
      t("确定要清空全部检测记录与校准记录吗？此操作不可撤销。"),
    );
    if (!ok) return;
    const res = clearAll();
    touch();
    toast(
      t("已清空 {a} 条检测记录、{b} 条校准记录", {
        a: res.measurements,
        b: res.calibrations,
      }),
      "ok",
    );
  }

  const storage = storageSize();

  return (
    <div className="screen">
      <Panel title={t("测量与换算")}>
        <Row className="grid-2">
          <Field label={t("信号单位")}>
            <input
              type="text"
              value={draft.unit}
              onChange={(event) => patch({ unit: event.target.value })}
            />
          </Field>
          <Field label={t("校准参照窗口（最近 N 次均值）")}>
            <input
              type="number"
              min={1}
              max={50}
              value={draft.calibrationWindow}
              onChange={(event) =>
                patch({ calibrationWindow: event.target.value })
              }
            />
          </Field>
        </Row>

        <Toggle
          checked={draft.curveEnabled}
          onChange={(v) => patch({ curveEnabled: v })}
        >
          {t("启用标准曲线换算浓度")}
        </Toggle>

        <Row className="grid-3">
          <Field label={t("斜率 k")}>
            <input
              type="number"
              step="any"
              value={draft.curveSlope}
              onChange={(event) => patch({ curveSlope: event.target.value })}
            />
          </Field>
          <Field label={t("截距 b")}>
            <input
              type="number"
              step="any"
              value={draft.curveIntercept}
              onChange={(event) =>
                patch({ curveIntercept: event.target.value })
              }
            />
          </Field>
          <Field label={t("浓度单位")}>
            <input
              type="text"
              value={draft.curveUnit}
              onChange={(event) => patch({ curveUnit: event.target.value })}
            />
          </Field>
        </Row>
        <p className="hint">
          {t(
            "浓度 = (净信号 − 截距 b) ÷ 斜率 k，其中净信号 = 测量值 − 适配体空白参照值。",
          )}
        </p>
      </Panel>

      <Panel title={t("连接默认值")}>
        <Row className="grid-3">
          <Field label={t("默认波特率")}>
            <input
              type="number"
              value={draft.baudRate}
              onChange={(event) => patch({ baudRate: event.target.value })}
            />
          </Field>
          <Field label={t("默认响应超时(ms)")}>
            <input
              type="number"
              step={50}
              value={draft.timeout}
              onChange={(event) => patch({ timeout: event.target.value })}
            />
          </Field>
          <Field label={t("默认空闲分帧(ms)")}>
            <input
              type="number"
              step={10}
              value={draft.frameDelay}
              onChange={(event) => patch({ frameDelay: event.target.value })}
            />
          </Field>
        </Row>
        <Row className="tight">
          <button className="btn primary grow" onClick={handleSave}>
            <Icon name="check" size={16} />
            {t("保存设置")}
          </button>
          <button className="btn ghost" onClick={() => void handleRestore()}>
            {t("恢复默认")}
          </button>
        </Row>
      </Panel>

      <Panel title={t("数据存储")}>
        <KV label={t("记录总数")} value={recordCounts.all} />
        <KV
          label={t("样本")}
          value={`${recordCounts.sample} · ${t("空白")} ${recordCounts.blank} · ${t("适配体空白")} ${recordCounts.aptamer_blank}`}
        />
        <KV label={t("已用空间")} value={formatBytes(storage)} />
        <Row className="tight">
          <button className="btn grow" onClick={handleExportAll}>
            {t("导出全部记录")}
          </button>
          <button className="btn danger" onClick={() => void handleClearAll()}>
            {t("清空全部记录")}
          </button>
        </Row>
        <p className="hint">
          {t(
            "本地数据保存在浏览器 localStorage 中（常见上限约 5MB）。清理浏览器数据会丢失记录，重要数据请及时导出 CSV。",
          )}
        </p>
      </Panel>

      <Panel title={t("关于")}>
        <KV label={t("应用版本")} value={__APP_VERSION__} />
        <KV
          label={t("运行环境")}
          value={`${t("手机版")} · React + Web Serial`}
        />
        <KV label={t("串口支持")} value={supported ? t("支持") : t("不支持")} />
        <KV
          label={t("平台")}
          value={navigator.platform || navigator.userAgent}
        />
        <KV label={t("语言")} value={lang === "zh" ? "中文" : "English"} />
        <p className="hint">{navigator.userAgent}</p>
      </Panel>
    </div>
  );
}
