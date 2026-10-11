/** 应用设置（持久化到 localStorage，字段与桌面版一致） */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadSettings,
  resetSettings,
  saveSettings as persistSettings,
} from "../lib/store";
import { DEFAULT_SETTINGS, type AppSettings } from "../lib/types";

interface SettingsValue {
  settings: AppSettings;
  /** 立即写入本地存储并更新界面 */
  setSettings: (patch: Partial<AppSettings>) => void;
  /** 恢复默认（不删除历史数据） */
  restoreDefaults: () => AppSettings;
  defaults: AppSettings;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setState] = useState<AppSettings>(() => loadSettings());

  const setSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = persistSettings(patch);
    setState(next);
  }, []);

  const restoreDefaults = useCallback(() => {
    const next = resetSettings();
    setState(next);
    return next;
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({
      settings,
      setSettings,
      restoreDefaults,
      defaults: DEFAULT_SETTINGS,
    }),
    [settings, setSettings, restoreDefaults],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings 必须在 SettingsProvider 内使用");
  return ctx;
}
