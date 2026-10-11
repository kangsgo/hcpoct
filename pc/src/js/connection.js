/* 串口连接：扫描端口、设置波特率、连接/断开、状态显示 */
(function () {
  "use strict";

  const { api, el, toast, state, fmtTime } = window.POCT;

  const COMMON_BAUD = [
    1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
  ];

  let updatingSelect = false;

  function setStatusBadge(status) {
    const badge = el("status-badge");
    const detail = el("status-detail");
    if (status.connected) {
      badge.textContent = status.timed ? "采集中" : "已连接";
      badge.className = `badge ${status.timed ? "busy" : "on"}`;
      detail.textContent = `${status.path} @ ${status.baudRate} bps`;
    } else {
      badge.textContent = "未连接";
      badge.className = "badge";
      detail.textContent = "请选择串口并连接";
    }

    el("conn-state").textContent = status.connected ? "已连接" : "未连接";
    el("conn-port").textContent = status.connected
      ? `${status.path} · ${status.baudRate} / ${status.dataBits}${status.parity === "none" ? "N" : status.parity === "even" ? "E" : "O"}${status.stopBits}`
      : "--";

    const btn = el("btn-toggle-connect");
    btn.textContent = status.connected ? "断开连接" : "连接串口";
    btn.classList.toggle("danger", status.connected);
    btn.classList.toggle("primary", !status.connected);

    if (status.timed) {
      el("conn-timed").textContent =
        `运行中（已发送 ${status.timed.sent} 次 / 失败 ${status.timed.failed} 次）`;
    } else {
      el("conn-timed").textContent = "空闲";
    }
  }

  function renderTraffic() {
    el("conn-traffic").textContent =
      `${state.traffic.rx} / ${state.traffic.tx} 字节`;
  }

  function portLabel(port) {
    const extra = [port.manufacturer, port.serialNumber]
      .filter(Boolean)
      .join(" · ");
    return extra ? `${port.path}  （${extra}）` : port.path;
  }

  async function refreshPorts(silent) {
    const select = el("port-select");
    const previous = select.value;
    try {
      const { ports } = await api.serial.list();
      state.ports = ports;
      updatingSelect = true;
      select.innerHTML = "";

      if (!ports.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "未发现可用串口";
        select.appendChild(opt);
        el("port-count").textContent = "0 个";
        el("port-count").className = "chip warn";
        el("port-hint").textContent =
          "未发现串口设备，请检查 USB 连接后重新扫描";
      } else {
        for (const p of ports) {
          const opt = document.createElement("option");
          opt.value = p.path;
          opt.textContent = portLabel(p);
          select.appendChild(opt);
        }
        if (previous && ports.some((p) => p.path === previous))
          select.value = previous;
        el("port-count").textContent = `${ports.length} 个`;
        el("port-count").className = "chip ok";
        el("port-hint").textContent = `发现 ${ports.length} 个串口设备：${ports
          .map((p) => p.path)
          .join("、")}`;
      }
      updatingSelect = false;
      if (!silent) toast(`已扫描到 ${ports.length} 个串口`, "ok");
      return ports;
    } catch (err) {
      updatingSelect = false;
      el("port-hint").textContent = `扫描失败：${err.message}`;
      if (!silent) toast(`扫描串口失败：${err.message}`, "error");
      return [];
    }
  }

  function applyDefaults() {
    const s = state.settings;
    if (s.baudRate) el("baud-rate").value = s.baudRate;
    if (s.dataBits) el("data-bits").value = String(s.dataBits);
    if (s.stopBits) el("stop-bits").value = String(s.stopBits);
    if (s.parity) el("parity").value = s.parity;
    if (s.frameDelay) el("frame-delay").value = s.frameDelay;
    if (typeof s.delimiter === "string") el("delimiter").value = s.delimiter;
    if (!el("port-select").value && state.ports.length)
      el("port-select").value = state.ports[0].path;
  }

  function portInfoFor(path) {
    return state.ports.find((p) => p.path === path) || null;
  }

  function currentOptions() {
    return {
      path: el("port-select").value,
      baudRate: Number(el("baud-rate").value),
      dataBits: Number(el("data-bits").value),
      stopBits: Number(el("stop-bits").value),
      parity: el("parity").value,
      frameDelay: Number(el("frame-delay").value),
      delimiter: el("delimiter").value,
    };
  }

  async function connect() {
    const options = currentOptions();
    if (!options.path) {
      toast("请先扫描并选择串口设备", "error");
      return;
    }
    const baud = Number(options.baudRate);
    if (!Number.isFinite(baud) || baud <= 0) {
      toast("请输入有效的波特率", "error");
      return;
    }

    try {
      const status = await api.serial.open(options);
      await window.POCT.settings.save({
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity: options.parity,
        frameDelay: options.frameDelay,
        delimiter: options.delimiter,
      });
      setStatusBadge(status);
      const info = portInfoFor(options.path);
      toast(
        `已连接 ${options.path} @ ${baud} bps${info && info.manufacturer ? `（${info.manufacturer}）` : ""}`,
        "ok",
      );
      if (window.POCT.log)
        window.POCT.log.add("sys", `串口已打开：${options.path} @ ${baud} bps`);
    } catch (err) {
      toast(`连接失败：${err.message}`, "error");
      if (window.POCT.log)
        window.POCT.log.add("err", `连接失败：${err.message}`);
    }
  }

  async function disconnect() {
    try {
      await api.serial.close();
      toast("串口已断开", "ok");
      if (window.POCT.log) window.POCT.log.add("sys", "串口已断开");
    } catch (err) {
      toast(`断开失败：${err.message}`, "error");
    }
  }

  async function toggleConnect() {
    if (state.status.connected) await disconnect();
    else await connect();
  }

  async function refreshStatus() {
    const status = await api.serial.status();
    state.status = status;
    setStatusBadge(status);
    return status;
  }

  async function start() {
    await refreshStatus();

    el("btn-refresh-ports").addEventListener("click", () =>
      refreshPorts(false),
    );
    el("btn-toggle-connect").addEventListener("click", () =>
      toggleConnect().catch((e) => toast(e.message, "error")),
    );
    el("port-select").addEventListener("focus", () => {
      if (!updatingSelect) refreshPorts(true);
    });

    api.serial.on("status", (status) => {
      state.status = status;
      setStatusBadge(status);
    });

    api.serial.on("raw", (chunk) => {
      state.traffic.rx += chunk.length || 0;
      renderTraffic();
    });

    api.serial.on("sent", (info) => {
      state.traffic.tx += info.length || 0;
      renderTraffic();
    });

    api.serial.on("timed", () => {
      refreshStatus();
    });

    api.serial.on("timed-stop", () => {
      refreshStatus();
    });

    api.app.onMenu("refresh-ports", () => refreshPorts(false));

    renderTraffic();
  }

  window.POCT.connection = {
    start,
    refreshPorts,
    refreshStatus,
    applyDefaults,
    currentOptions,
    setStatusBadge,
    COMMON_BAUD,
  };
})();
