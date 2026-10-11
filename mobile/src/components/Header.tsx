/** 顶部栏：品牌、连接状态、语言切换 */

import { useI18n } from "../i18n";
import { useSerial } from "../state/SerialProvider";
import { timedStore, useStore } from "../state/stores";

export function Header() {
  const { lang, t, toggle } = useI18n();
  const { status } = useSerial();
  const timed = useStore(timedStore);

  const badgeText = timed.running
    ? t("采集中")
    : status.connected
      ? t("已连接")
      : t("未连接");
  const badgeTone = timed.running ? "busy" : status.connected ? "on" : "";
  const detail = status.connected
    ? `${status.portLabel ?? "--"} @ ${status.baudRate ?? "--"} bps`
    : t("请选择串口并连接");

  return (
    <header className="app-header">
      <img
        className="brand-logo"
        src={`${import.meta.env.BASE_URL}logo-green.svg`}
        alt="logo"
        draggable={false}
      />
      <div className="brand-text">
        <h1>{t("皮质醇检测工作站")}</h1>
        <p className="sub">{detail}</p>
      </div>
      <div className="header-right">
        <span className={`badge ${badgeTone}`}>{badgeText}</span>
        <button
          className="btn ghost sm"
          onClick={toggle}
          title={lang === "zh" ? "Switch to English" : "切换到中文"}
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </div>
    </header>
  );
}
