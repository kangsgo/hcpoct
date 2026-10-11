/** 轻提示（toast）与可翻译的确认弹窗 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "../i18n";

export type ToastType = "info" | "ok" | "error";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  okText?: string;
  cancelText?: string;
  /** 是否使用危险色（默认 true） */
  danger?: boolean;
}

interface ToastValue {
  toasts: ToastItem[];
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastValue | null>(null);

interface ConfirmState {
  message: string;
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmState | null>(null);
  const timers = useRef<number[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    toastSeq += 1;
    const item: ToastItem = { id: toastSeq, message, type };
    setToasts((prev) => [...prev.slice(-3), item]);
    const timer = window.setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== item.id)),
      type === "error" ? 5000 : 2800,
    );
    timers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setDialog({ message, options, resolve });
      }),
    [],
  );

  const close = useCallback((result: boolean) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  // 弹窗打开时支持 Esc / Enter 快捷操作
  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      else if (event.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog, close]);

  const value = useMemo<ToastValue>(
    () => ({ toasts, toast, confirm }),
    [toasts, toast, confirm],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.type}`}>
            {item.message}
          </div>
        ))}
      </div>
      {dialog ? (
        <div className="modal-mask" onClick={() => close(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="modal-text">{dialog.message}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => close(false)}>
                {dialog.options.cancelText ?? t("取消")}
              </button>
              <button
                className={`btn ${
                  dialog.options.danger === false ? "primary" : "danger"
                }`}
                onClick={() => close(true)}
                autoFocus
              >
                {dialog.options.okText ?? t("确定")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
