/**
 * 应用入口：Provider 组合 + 标签页切换
 * ---------------------------------------------------------------------------
 * 五个页面全部保持挂载（用 hidden 控制显隐），这样串口数据、校准采集任务
 * 在切换标签时不会中断，表单内容也不会丢失。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { I18nProvider, useI18n, type Lang } from "./i18n";
import { SettingsProvider, useSettings } from "./state/SettingsProvider";
import { DataProvider } from "./state/DataProvider";
import { ToastProvider } from "./state/ToastProvider";
import { SerialProvider } from "./state/SerialProvider";
import { Header } from "./components/Header";
import { TabBar, type TabKey } from "./components/TabBar";
import { ConnectScreen } from "./screens/ConnectScreen";
import { DetectScreen } from "./screens/DetectScreen";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { pushLog } from "./lib/logBus";
import { frameStore, timedStore, trafficStore } from "./state/stores";
import { serial } from "./lib/serial";

const STORAGE_KEY = "poct.mobile.tab";

function Shell() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "connect" ||
      stored === "detect" ||
      stored === "calibration" ||
      stored === "history" ||
      stored === "settings"
      ? stored
      : "detect";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, tab);
  }, [tab]);

  const bootedRef = useRef(false);
  useEffect(() => {
    // StrictMode 下开发环境会重复执行副作用，这里只记录一次启动日志
    if (!bootedRef.current) {
      bootedRef.current = true;
      pushLog("sys", t("应用已就绪 · 手机版"));
      trafficStore.set({ rx: 0, tx: 0 });
      frameStore.set(null);
      timedStore.set({ running: false, sent: 0, failed: 0, total: 0 });
    }
    // 串口连接无法跨页面刷新保持，关闭页面时主动释放，避免设备被占用
    const release = () => void serial.close("页面关闭");
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <div hidden={tab !== "connect"}>
          <ConnectScreen />
        </div>
        <div hidden={tab !== "detect"}>
          <DetectScreen />
        </div>
        <div hidden={tab !== "calibration"}>
          <CalibrationScreen />
        </div>
        <div hidden={tab !== "history"}>
          <HistoryScreen />
        </div>
        <div hidden={tab !== "settings"}>
          <SettingsScreen />
        </div>
      </main>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

function Root() {
  const { settings, setSettings } = useSettings();
  const handleLang = useCallback(
    (lang: Lang) => setSettings({ lang }),
    [setSettings],
  );

  return (
    <I18nProvider lang={settings.lang} onChangeLang={handleLang}>
      <ToastProvider>
        <SerialProvider>
          <Shell />
        </SerialProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <DataProvider>
        <Root />
      </DataProvider>
    </SettingsProvider>
  );
}
