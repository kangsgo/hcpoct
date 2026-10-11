/* 应用启动、标签页切换与「设置」二级菜单 */
(function () {
  "use strict";

  const P = window.POCT;
  const el = P.el;

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${name}`);
    });

    if (name === "history" && P.history) P.history.query();
    if (name === "test" && P.test) P.test.refresh();
  }

  function openSettings() {
    el("settings-modal").classList.remove("hidden");
  }

  function closeSettings() {
    el("settings-modal").classList.add("hidden");
  }

  function initSettingsModal() {
    el("btn-open-settings").addEventListener("click", openSettings);
    el("btn-close-settings").addEventListener("click", closeSettings);
    el("settings-modal").addEventListener("click", (e) => {
      if (e.target === el("settings-modal")) closeSettings();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el("settings-modal").classList.contains("hidden"))
        closeSettings();
    });
  }

  async function boot() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
    initSettingsModal();

    // 0. 语言：先按本地缓存立即应用（避免闪动），再与数据库设置对齐
    P.i18n.init();

    // 1. 读取设置（其他模块依赖默认值）
    await P.settings.load();
    P.i18n.setLang(P.state.settings.lang || P.i18n.currentLang(), {
      persist: false,
    });
    P.settings.init();
    await P.settings.refreshInfo();

    // 2. 初始化各功能模块
    P.log.init();
    P.console.init();
    P.detect.init();
    P.test.init();
    P.history.init();

    // 3. 串口连接（先绑定事件，再扫描端口）
    await P.connection.start();
    await P.connection.refreshPorts(true);
    P.connection.applyDefaults();
    await P.connection.refreshStatus();

    // 4. 加载历史数据与空白参照
    await P.test.refresh();
    await P.history.query(true);

    P.log.add(
      "sys",
      `应用已就绪 · Electron ${P.state.info ? P.state.info.electron : ""}`,
    );
    P.toast("就绪：请在「设置」中扫描并连接串口设备", "ok");
  }

  window.addEventListener("DOMContentLoaded", () => {
    boot().catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      P.toast(`初始化失败：${err.message}`, "error");
    });
  });
})();
