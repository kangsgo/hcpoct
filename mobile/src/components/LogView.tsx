/** 实时数据流日志（订阅 logBus，独立于全局 React 状态，避免高频重渲染） */

import { useEffect, useRef, useState } from "react";
import {
  clearLog,
  getLogLines,
  pushLog,
  subscribeLog,
  type LogDirection,
  type LogLine,
} from "../lib/logBus";
import { downloadText, timeStamp } from "../lib/csv";
import { useI18n } from "../i18n";
import { useToast } from "../state/ToastProvider";
import { Panel } from "./ui";

const DIR_LABEL: Record<LogDirection, string> = {
  tx: "TX",
  rx: "RX",
  err: "ERR",
  sys: "SYS",
};

export function LogView() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [lines, setLines] = useState<LogLine[]>(() => getLogLines());
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const unsubscribe = subscribeLog(() => {
      if (pausedRef.current) return;
      setLines(getLogLines());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const el = viewRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  function togglePause() {
    const next = !paused;
    setPaused(next);
    if (!next) setLines(getLogLines());
    pushSys(next ? t("日志已暂停") : t("日志已恢复"));
  }

  function pushSys(message: string) {
    pushLog("sys", message);
  }

  function handleClear() {
    clearLog();
    setLines([]);
  }

  function handleExport() {
    const text = lines
      .map(
        (line) =>
          `[${DIR_LABEL[line.dir]}] ${line.text}${line.hex ? `  [${line.hex}]` : ""}`,
      )
      .join("\n");
    if (!text.trim()) {
      toast(t("日志为空，无需导出"), "error");
      return;
    }
    const file = downloadText(`poct-log-${timeStamp()}.txt`, text);
    toast(t("日志已导出：{file}", { file }), "ok");
  }

  return (
    <Panel
      title={t("实时数据流")}
      chip={
        <span className={`chip ${paused ? "warn" : "ok"}`}>{lines.length}</span>
      }
      actions={
        <>
          <button className="btn ghost sm" onClick={togglePause}>
            {paused ? t("继续") : t("暂停")}
          </button>
          <button className="btn ghost sm" onClick={handleClear}>
            {t("清空")}
          </button>
          <button className="btn ghost sm" onClick={handleExport}>
            {t("导出日志")}
          </button>
        </>
      }
    >
      <div
        className="log"
        ref={viewRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {lines.length === 0 ? (
          <div className="log-line sys">
            <span className="msg">
              {t("日志已就绪，连接串口后开始记录数据")}
            </span>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`log-line ${line.dir}`}>
              <span className="t">
                {new Date(line.at).toLocaleTimeString("zh-CN", {
                  hour12: false,
                })}
                .{String(new Date(line.at).getMilliseconds()).padStart(3, "0")}
              </span>
              <span className="d">{DIR_LABEL[line.dir]}</span>
              <span className="msg">
                {line.text === "" ? t("<空>") : line.text}
                {line.hex && line.hex !== line.text ? (
                  <span className="hex"> [{line.hex}]</span>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
