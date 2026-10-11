/**
 * 数据版本号
 * ---------------------------------------------------------------------------
 * 记录读写全部走 localStorage（同步、简单）。为了让各屏幕在数据变化后刷新，
 * 这里只维护一个自增的 version，任何写操作后调用 touch() 即可。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { counts, type Counts } from "../lib/store";

interface DataValue {
  version: number;
  /** 数据写入后调用，触发依赖数据的组件重新渲染 */
  touch: () => void;
  /** 记录数量统计（随 version 变化） */
  recordCounts: Counts;
  /** 上次保存结果的时间戳，用于界面提示 */
  lastSavedAt: string | null;
  markSaved: () => void;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const touch = useCallback(() => setVersion((v) => v + 1), []);
  const markSaved = useCallback(
    () => setLastSavedAt(new Date().toISOString()),
    [],
  );

  const recordCounts = useMemo(() => counts(), [version]);

  const value = useMemo<DataValue>(
    () => ({ version, touch, recordCounts, lastSavedAt, markSaved }),
    [version, touch, recordCounts, lastSavedAt, markSaved],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData 必须在 DataProvider 内使用");
  return ctx;
}
