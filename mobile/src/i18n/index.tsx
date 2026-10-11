/**
 * React i18n：Provider + useI18n()
 * ---------------------------------------------------------------------------
 * 与桌面版一致，中文原文即键；通过 Provider 下发 t()，组件写中文、切英文自动生效。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { EN } from "./dict";
import type { CsvLabels } from "../lib/csv";

export type Lang = "zh" | "en";

export type TFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

interface I18nValue {
  lang: Lang;
  t: TFn;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  csvLabels: () => CsvLabels;
}

const I18nContext = createContext<I18nValue | null>(null);

/** 纯函数版本，供 React 之外的地方（如 toast 文案拼装）使用 */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  let out = lang === "en" ? (EN[key] ?? key) : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}

export function I18nProvider({
  lang,
  onChangeLang,
  children,
}: {
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  children: ReactNode;
}) {
  const t = useCallback<TFn>(
    (key, params) => translate(lang, key, params),
    [lang],
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      "lang",
      lang === "en" ? "en" : "zh-CN",
    );
    document.title = translate(lang, "POCT 皮质醇检测工作站") + " · 手机版";
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t,
      setLang: onChangeLang,
      toggle: () => onChangeLang(lang === "zh" ? "en" : "zh"),
      csvLabels: () => ({
        headers: [
          "ID",
          t("时间"),
          t("类别"),
          t("数值"),
          t("单位"),
          t("原始返回"),
          t("发送内容"),
          t("串口"),
          t("波特率"),
          t("来源"),
          t("备注"),
        ],
        categories: {
          blank: t("空白（仅缓冲液）"),
          aptamer_blank: t("空白（适配体+染料）"),
          sample: t("样本检测"),
        },
        sources: {
          manual: t("手动"),
          timed: t("定时"),
          calibration: t("校准"),
        },
      }),
    }),
    [lang, t, onChangeLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return ctx;
}
