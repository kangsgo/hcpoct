/**
 * 极简外部 store + React 订阅钩子
 * ---------------------------------------------------------------------------
 * 串口数据是高频事件（每来一帧都要刷新界面）。若把流量计数、最新帧放进
 * React Context，会导致上下文的所有消费者被频繁重渲染。这里用
 * useSyncExternalStore 订阅细粒度 store，只有真正用到该数据的组件才会更新。
 */

import { useSyncExternalStore } from "react";
import type { FrameInfo } from "../lib/serial";

export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ------------------------------------------------------------------ 具体 store

export interface Traffic {
  rx: number;
  tx: number;
}

/** 收发的累计字节数 */
export const trafficStore = createStore<Traffic>({ rx: 0, tx: 0 });

/** 最近一次解析出的数据帧（实时检测结果卡使用） */
export const frameStore = createStore<FrameInfo | null>(null);

/** 定时发送的实时进度（用于按钮与状态显示） */
export const timedStore = createStore<{
  running: boolean;
  sent: number;
  failed: number;
  total: number;
}>({ running: false, sent: 0, failed: 0, total: 0 });
