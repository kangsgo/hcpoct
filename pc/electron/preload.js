"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const SERIAL_EVENTS = [
  "status",
  "raw",
  "frame",
  "sent",
  "timed",
  "timed-stop",
  "error",
];

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("poct", {
  serial: {
    list: () => ipcRenderer.invoke("serial:list"),
    status: () => ipcRenderer.invoke("serial:status"),
    open: (options) => ipcRenderer.invoke("serial:open", options),
    close: () => ipcRenderer.invoke("serial:close"),
    send: (options) => ipcRenderer.invoke("serial:send", options),
    startTimed: (options) => ipcRenderer.invoke("serial:start-timed", options),
    stopTimed: (reason) => ipcRenderer.invoke("serial:stop-timed", reason),
    on: (event, callback) => {
      const channel = SERIAL_EVENTS.includes(event) ? `serial:${event}` : event;
      return subscribe(channel, callback);
    },
  },
  db: {
    saveMeasurement: (input) =>
      ipcRenderer.invoke("db:save-measurement", input),
    queryMeasurements: (filter) =>
      ipcRenderer.invoke("db:query-measurements", filter),
    deleteMeasurement: (id) => ipcRenderer.invoke("db:delete-measurement", id),
    clearMeasurements: (category) =>
      ipcRenderer.invoke("db:clear-measurements", category),
    stats: (window) => ipcRenderer.invoke("db:stats", window),
    counts: () => ipcRenderer.invoke("db:counts"),
    listCalibrations: (filter) =>
      ipcRenderer.invoke("db:list-calibrations", filter),
    calibrationSummary: (n) => ipcRenderer.invoke("db:calibration-summary", n),
    deleteCalibration: (id) => ipcRenderer.invoke("db:delete-calibration", id),
    clearCalibrations: (kind) =>
      ipcRenderer.invoke("db:clear-calibrations", kind),
    getSettings: () => ipcRenderer.invoke("db:get-settings"),
    setSettings: (patch) => ipcRenderer.invoke("db:set-settings", patch),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    openDataDir: () => ipcRenderer.invoke("app:open-data-dir"),
    exportCsv: (payload) => ipcRenderer.invoke("app:export-csv", payload),
    saveText: (options) => ipcRenderer.invoke("app:save-text", options),
    setLang: (lang) => ipcRenderer.invoke("app:set-lang", lang),
    revealFile: (filePath) => ipcRenderer.invoke("app:reveal-file", filePath),
    onMenu: (event, callback) => subscribe(`menu:${event}`, callback),
  },
});
