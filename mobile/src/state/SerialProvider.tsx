/**
 * 串口连接的状态与动作
 * ---------------------------------------------------------------------------
 * 全局单例串口连接，负责：端口列表 / 连接 / 断开 / 单次发送 / 定时发送，
 * 并把串口事件分发到日志总线、流量计数与最新帧 store。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SerialService,
  serial,
  type OpenOptions,
  type PortEntry,
  type SendOptions,
  type SendResult,
  type SerialStatus,
  type TimedSendOptions,
} from "../lib/serial";
import { pushLog } from "../lib/logBus";
import { errorMessage } from "../lib/format";
import { frameStore, timedStore, trafficStore } from "./stores";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastProvider";
import { useI18n } from "../i18n";
import { translateLoose } from "../i18n/patterns";

interface SerialValue {
  supported: boolean;
  status: SerialStatus;
  ports: PortEntry[];
  selectedPortId: string;
  setSelectedPortId: (id: string) => void;
  sending: boolean;
  refreshPorts: (silent?: boolean) => Promise<PortEntry[]>;
  addPort: () => Promise<PortEntry | null>;
  connect: (options: Omit<OpenOptions, "portId">) => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendOnce: (options: SendOptions) => Promise<SendResult | null>;
  startTimed: (options: TimedSendOptions) => void;
  stopTimed: (reason?: string) => void;
}

const SerialContext = createContext<SerialValue | null>(null);

export function SerialProvider({ children }: { children: ReactNode }) {
  const { lang, t } = useI18n();
  const { toast } = useToast();
  const { settings, setSettings } = useSettings();

  const [status, setStatus] = useState<SerialStatus>(() => serial.status);
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [selectedPortId, setSelectedPortId] = useState("");
  const [sending, setSending] = useState(false);

  const supported = useMemo(() => SerialService.isSupported(), []);
  const framesOnly = settings.framesOnly;

  // ---------------------------------------------------------- 事件订阅
  useEffect(() => {
    const offs = [
      serial.on("status", (next) => setStatus(next)),
      serial.on("raw", (chunk) => {
        trafficStore.set((prev) => ({ ...prev, rx: prev.rx + chunk.length }));
        if (!framesOnly) pushLog("rx", chunk.text, chunk.hex);
      }),
      serial.on("frame", (frame) => {
        frameStore.set(frame);
        if (framesOnly) pushLog("rx", frame.text, frame.hex);
      }),
      serial.on("sent", (info) => {
        trafficStore.set((prev) => ({ ...prev, tx: prev.tx + info.length }));
        pushLog("tx", info.text, info.hex);
      }),
      serial.on("error", (err) =>
        pushLog("err", translateLoose(lang, err.message)),
      ),
      serial.on("timed-tick", (tick) => {
        timedStore.set((prev) => ({
          running: true,
          total: tick.total,
          sent: prev.sent + (tick.ok ? 1 : 0),
          failed: prev.failed + (tick.ok ? 0 : 1),
        }));
      }),
      serial.on("timed-stop", (info) => {
        timedStore.set({
          running: false,
          total: 0,
          sent: info.sent,
          failed: info.failed,
        });
        pushLog(
          "sys",
          t("定时发送结束：{reason}（成功 {ok} 次，失败 {fail} 次）", {
            reason: translateLoose(lang, info.reason),
            ok: info.sent,
            fail: info.failed,
          }),
        );
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [framesOnly, lang, t]);

  // ---------------------------------------------------------- 端口列表
  const refreshPorts = useCallback(
    async (silent = false): Promise<PortEntry[]> => {
      if (!SerialService.isSupported()) {
        setPorts([]);
        return [];
      }
      try {
        const list = await serial.listPorts();
        setPorts(list);
        setSelectedPortId((current) =>
          current && list.some((p) => p.id === current)
            ? current
            : (list[0]?.id ?? ""),
        );
        if (!silent)
          toast(t("已授权 {n} 个串口设备", { n: list.length }), "ok");
        return list;
      } catch (err) {
        const message = errorMessage(err);
        if (!silent) toast(message, "error");
        return [];
      }
    },
    [t, toast],
  );

  const addPort = useCallback(async (): Promise<PortEntry | null> => {
    try {
      const entry = await serial.requestPort();
      const list = await refreshPorts(true);
      setSelectedPortId(entry.id);
      toast(t("已授权 {n} 个串口设备", { n: list.length }), "ok");
      return entry;
    } catch (err) {
      toast(errorMessage(err), "error");
      return null;
    }
  }, [refreshPorts, t, toast]);

  // 首次进入自动列一次已授权设备
  useEffect(() => {
    void refreshPorts(true);
  }, [refreshPorts]);

  // ---------------------------------------------------------- 连接 / 断开
  const connect = useCallback(
    async (options: Omit<OpenOptions, "portId">): Promise<boolean> => {
      if (!selectedPortId) {
        toast(t("请先添加并选择串口设备"), "error");
        return false;
      }
      const baud = Number(options.baudRate);
      if (!Number.isFinite(baud) || baud <= 0) {
        toast(t("请输入有效的波特率"), "error");
        return false;
      }
      try {
        const next = await serial.open({ ...options, portId: selectedPortId });
        setStatus(next);
        // 连接参数记入设置，下次自动带出
        setSettings({
          baudRate: baud,
          dataBits: options.dataBits ?? settings.dataBits,
          stopBits: options.stopBits ?? settings.stopBits,
          parity: options.parity ?? settings.parity,
          frameDelay: options.frameDelay ?? settings.frameDelay,
          delimiter: options.delimiter ?? settings.delimiter,
        });
        pushLog(
          "sys",
          t("已连接 {port} @ {baud} bps", {
            port: next.portLabel ?? "--",
            baud: next.baudRate ?? baud,
          }),
        );
        toast(
          t("已连接 {port} @ {baud} bps", {
            port: next.portLabel ?? "--",
            baud: next.baudRate ?? baud,
          }),
          "ok",
        );
        return true;
      } catch (err) {
        const message = errorMessage(err);
        toast(
          t("连接失败：{msg}", { msg: translateLoose(lang, message) }),
          "error",
        );
        pushLog(
          "err",
          t("连接失败：{msg}", { msg: translateLoose(lang, message) }),
        );
        return false;
      }
    },
    [lang, selectedPortId, setSettings, settings, t, toast],
  );

  const disconnect = useCallback(async () => {
    try {
      await serial.close("手动断开");
      toast(t("串口已断开"), "ok");
      pushLog("sys", t("串口已断开"));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }, [t, toast]);

  // ---------------------------------------------------------- 发送
  const sendOnce = useCallback(
    async (options: SendOptions): Promise<SendResult | null> => {
      if (!serial.isOpen) {
        toast(t("串口未打开，请先选择串口并连接"), "error");
        return null;
      }
      setSending(true);
      try {
        return await serial.send(options);
      } catch (err) {
        const message = errorMessage(err);
        toast(translateLoose(lang, message), "error");
        pushLog("err", translateLoose(lang, message));
        return null;
      } finally {
        setSending(false);
      }
    },
    [lang, t, toast],
  );

  const startTimed = useCallback(
    (options: TimedSendOptions) => {
      if (!serial.isOpen) {
        toast(t("串口未打开，请先选择串口并连接"), "error");
        return;
      }
      timedStore.set({
        running: true,
        total: Math.max(0, Number(options.times) || 0),
        sent: 0,
        failed: 0,
      });
      serial.startTimedSend(options);
    },
    [t, toast],
  );

  const stopTimed = useCallback(
    (reason?: string) => {
      const res = serial.stopTimedSend(reason);
      if (res.stopped) {
        toast(
          t("定时发送已停止（成功 {ok} 次，失败 {fail} 次）", {
            ok: res.sent ?? 0,
            fail: res.failed ?? 0,
          }),
          "ok",
        );
      }
    },
    [t, toast],
  );

  const value = useMemo<SerialValue>(
    () => ({
      supported,
      status,
      ports,
      selectedPortId,
      setSelectedPortId,
      sending,
      refreshPorts,
      addPort,
      connect,
      disconnect,
      sendOnce,
      startTimed,
      stopTimed,
    }),
    [
      supported,
      status,
      ports,
      selectedPortId,
      sending,
      refreshPorts,
      addPort,
      connect,
      disconnect,
      sendOnce,
      startTimed,
      stopTimed,
    ],
  );

  return (
    <SerialContext.Provider value={value}>{children}</SerialContext.Provider>
  );
}

export function useSerial(): SerialValue {
  const ctx = useContext(SerialContext);
  if (!ctx) throw new Error("useSerial 必须在 SerialProvider 内使用");
  return ctx;
}
