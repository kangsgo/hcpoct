/** 连接页：串口设备、波特率等参数、连接状态、快捷说明 */

import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useSerial } from "../state/SerialProvider";
import { useSettings } from "../state/SettingsProvider";
import { timedStore, trafficStore, useStore } from "../state/stores";
import { COMMON_BAUD, type Parity } from "../lib/types";
import { Field, KV, Panel, Row } from "../components/ui";
import { Icon } from "../components/Icons";

interface ConnectForm {
  baudRate: string;
  dataBits: string;
  stopBits: string;
  parity: Parity;
  frameDelay: string;
  delimiter: string;
}

export function ConnectScreen() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const {
    supported,
    status,
    ports,
    selectedPortId,
    setSelectedPortId,
    refreshPorts,
    addPort,
    connect,
    disconnect,
  } = useSerial();
  const traffic = useStore(trafficStore);
  const timed = useStore(timedStore);

  const [form, setForm] = useState<ConnectForm>(() => ({
    baudRate: String(settings.baudRate),
    dataBits: String(settings.dataBits),
    stopBits: String(settings.stopBits),
    parity: settings.parity,
    frameDelay: String(settings.frameDelay),
    delimiter: settings.delimiter,
  }));

  // 设置页修改默认值后，同步到这里的表单
  useEffect(() => {
    setForm({
      baudRate: String(settings.baudRate),
      dataBits: String(settings.dataBits),
      stopBits: String(settings.stopBits),
      parity: settings.parity,
      frameDelay: String(settings.frameDelay),
      delimiter: settings.delimiter,
    });
  }, [
    settings.baudRate,
    settings.dataBits,
    settings.stopBits,
    settings.parity,
    settings.frameDelay,
    settings.delimiter,
  ]);

  const patch = (next: Partial<ConnectForm>) =>
    setForm((prev) => ({ ...prev, ...next }));

  async function handleToggle() {
    if (status.connected) {
      await disconnect();
      return;
    }
    await connect({
      baudRate: Number(form.baudRate),
      dataBits: Number(form.dataBits),
      stopBits: Number(form.stopBits),
      parity: form.parity,
      frameDelay: Number(form.frameDelay),
      delimiter: form.delimiter,
    });
  }

  return (
    <div className="screen">
      {!supported ? (
        <div className="banner warn">
          <Icon name="warn" size={18} />
          <span>
            {t(
              "当前浏览器不支持 Web Serial API，无法连接串口设备（Android Chrome / Edge 可用，iOS Safari 暂不支持）。你仍然可以在「检测」页手动录入数值并保存记录。",
            )}
          </span>
        </div>
      ) : null}

      <Panel
        title={t("串口连接")}
        chip={<span className="chip">{ports.length}</span>}
      >
        <Field label={t("已授权设备")}>
          <select
            value={selectedPortId}
            onChange={(event) => setSelectedPortId(event.target.value)}
            disabled={!supported || ports.length === 0}
          >
            {ports.length === 0 ? (
              <option value="">
                {t("未发现已授权设备，首次使用请点击「添加设备」")}
              </option>
            ) : (
              ports.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.label}
                </option>
              ))
            )}
          </select>
        </Field>

        <Row className="tight">
          <button
            className="btn"
            onClick={() => void addPort()}
            disabled={!supported}
          >
            <Icon name="plus" size={16} />
            {t("添加设备")}
          </button>
          <button
            className="btn ghost"
            onClick={() => void refreshPorts(false)}
            disabled={!supported}
          >
            <Icon name="refresh" size={16} />
            {t("刷新列表")}
          </button>
        </Row>
        <p className="hint">
          {t("打开浏览器设备选择框，选择要连接的串口设备")}
        </p>

        <div className="divider" />

        <Field label={t("波特率")}>
          <input
            type="text"
            inputMode="numeric"
            list="baud-list"
            value={form.baudRate}
            onChange={(event) => patch({ baudRate: event.target.value })}
          />
        </Field>
        <datalist id="baud-list">
          {COMMON_BAUD.map((baud) => (
            <option key={baud} value={baud} />
          ))}
        </datalist>

        <Row className="grid-3">
          <Field label={t("数据位")}>
            <select
              value={form.dataBits}
              onChange={(event) => patch({ dataBits: event.target.value })}
            >
              {["8", "7", "6", "5"].map((bit) => (
                <option key={bit} value={bit}>
                  {bit}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("停止位")}>
            <select
              value={form.stopBits}
              onChange={(event) => patch({ stopBits: event.target.value })}
            >
              {["1", "2"].map((bit) => (
                <option key={bit} value={bit}>
                  {bit}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("校验位")}>
            <select
              value={form.parity}
              onChange={(event) =>
                patch({ parity: event.target.value as Parity })
              }
            >
              <option value="none">{t("无")}</option>
              <option value="even">{t("偶校验")}</option>
              <option value="odd">{t("奇校验")}</option>
            </select>
          </Field>
        </Row>

        <Row className="grid-2">
          <Field label={t("接收分帧")}>
            <select
              value={form.delimiter}
              onChange={(event) => patch({ delimiter: event.target.value })}
            >
              <option value="">{t("按空闲时间")}</option>
              <option value={"\n"}>{t("换行 \\n")}</option>
              <option value={"\r"}>{t("回车 \\r")}</option>
              <option value={"\r\n"}>{t("回车换行 \\r\\n")}</option>
            </select>
          </Field>
          <Field label={t("空闲分帧(ms)")}>
            <input
              type="number"
              min={20}
              step={10}
              value={form.frameDelay}
              onChange={(event) => patch({ frameDelay: event.target.value })}
            />
          </Field>
        </Row>

        <button
          className={`btn block ${status.connected ? "danger" : "primary"}`}
          onClick={() => void handleToggle()}
        >
          {status.connected ? t("断开连接") : t("连接串口")}
        </button>

        <div className="status-card">
          <KV
            label={t("连接状态")}
            value={
              status.connected
                ? timed.running
                  ? t("采集中")
                  : t("已连接")
                : t("未连接")
            }
          />
          <KV
            label={t("当前端口")}
            value={
              status.connected
                ? `${status.portLabel ?? "--"} · ${status.baudRate}/${status.dataBits}${
                    status.parity === "none"
                      ? "N"
                      : status.parity === "even"
                        ? "E"
                        : "O"
                  }${status.stopBits}`
                : "--"
            }
          />
          <KV
            label={t("接收 / 发送")}
            value={`${traffic.rx} / ${traffic.tx} ${t("字节")}`}
          />
          <KV
            label={t("定时发送")}
            value={
              timed.running
                ? `${t("采集中")} ${timed.sent + timed.failed}/${timed.total || "∞"}`
                : t("空闲")
            }
          />
        </div>
      </Panel>

      <Panel title={t("快捷说明")}>
        <ol className="steps">
          <li>
            {t("1. 手机通过 OTG 连接检测设备，点击「添加设备」选择串口。")}
          </li>
          <li>{t("2. 设置波特率后点击「连接串口」。")}</li>
          <li>
            {t("3. 在「检测」页发送任意数据，返回数据会自动解析为测量值。")}
          </li>
          <li>
            {t(
              "4. 先完成两种空白校准，再做样本检测，样本会自动扣除适配体空白。",
            )}
          </li>
          <li>{t("5. 数据保存在手机浏览器本地，可随时导出 CSV。")}</li>
        </ol>
        {supported ? (
          <p className="hint">
            {t("串口功能需要在 https 或 localhost 下打开页面")}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
