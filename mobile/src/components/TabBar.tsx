/** 底部标签栏（手机端主导航） */

import { useI18n } from "../i18n";
import { Icon, type IconName } from "./Icons";

export type TabKey =
  | "connect"
  | "detect"
  | "calibration"
  | "history"
  | "settings";

const TABS: { key: TabKey; icon: IconName; label: string }[] = [
  { key: "connect", icon: "plug", label: "连接" },
  { key: "detect", icon: "pulse", label: "检测" },
  { key: "calibration", icon: "flask", label: "校准" },
  { key: "history", icon: "list", label: "历史" },
  { key: "settings", icon: "gear", label: "设置" },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tabbar-item ${active === tab.key ? "active" : ""}`}
          onClick={() => onChange(tab.key)}
          aria-current={active === tab.key ? "page" : undefined}
        >
          <Icon name={tab.icon} size={21} />
          <span>{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}
