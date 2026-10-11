/*
 * 中英文切换（i18n）
 * ---------------------------------------------------------------------------
 * 设计：界面文案以「中文原文」作为翻译键（gettext 风格），提供两种生效方式
 *   1) 静态/动态 DOM 文案：MutationObserver 监听新增与变更的文本节点，自动替换为英文；
 *      中文原文会缓存在节点的 __pvSrc 上，因此切回中文可无损还原。
 *   2) JS 主动调用：POCT.t("中文原文")，用于需要拼接字符串的场景。
 *
 * 新增界面文案时，只需在上面的 EXACT（整句）或 PATTERNS（带变量句式）中补充对应英文即可。
 */
(function () {
  "use strict";

  const STORAGE_KEY = "poct.lang";
  const ZH = "zh";
  const EN = "en";

  let lang = ZH;
  let observer = null;
  let applying = false;
  const listeners = [];

  // =========================== 整句对照表（中文 → English） ===========================
  const EXACT = {
    // ---------- 应用框架 ----------
    "POCT 皮质醇检测工作站": "POCT Cortisol Detection Workstation",
    皮质醇检测工作站: "Cortisol Detection Workstation",
    "串口扫描 · 波特率设置 · 空白校准 · 定时发送 · SQLite 历史记录":
      "Port scan · Baud rate · Blank calibration · Timed sending · SQLite history",
    未连接: "Not connected",
    已连接: "Connected",
    采集中: "Sampling",
    请选择串口并连接: "Select a serial port and connect",

    // ---------- 侧栏：串口连接 ----------
    串口连接: "Serial connection",
    未扫描: "Not scanned",
    串口设备: "Serial port",
    扫描: "Scan",
    "点击「扫描」发现可用串口设备":
      "Click “Scan” to discover available serial ports",
    波特率: "Baud rate",
    数据位: "Data bits",
    停止位: "Stop bits",
    校验位: "Parity",
    无: "None",
    偶校验: "Even",
    奇校验: "Odd",
    接收分帧: "Frame delimiter",
    按空闲时间: "By idle time",
    "换行 \\n": "LF \\n",
    "回车 \\r": "CR \\r",
    "回车换行 \\r\\n": "CRLF \\r\\n",
    "空闲分帧(ms)": "Idle gap (ms)",
    连接串口: "Connect",
    断开连接: "Disconnect",
    连接状态: "Status",
    当前端口: "Port",
    "接收 / 发送": "RX / TX",
    定时发送: "Timed sending",
    空闲: "Idle",
    快捷说明: "Quick guide",
    "1. 扫描并选择串口 → 设置波特率 → 连接。":
      "1. Scan and select a port → set the baud rate → connect.",
    "2. 检测时向串口发送任意数据，设备返回的数据会自动解析为测量值。":
      "2. Send any data to the port; the response is parsed into a measurement automatically.",
    "3. 先完成两种空白校准，再做样本检测，样本会自动扣除适配体空白。":
      "3. Run both blank calibrations first; the aptamer blank is subtracted from samples automatically.",
    "4. 所有采集数据实时写入 SQLite，可在「历史记录」中查询与导出。":
      "4. All data is written to SQLite in real time; query or export it in History.",
    未发现可用串口: "No serial port available",
    "未发现串口设备，请检查 USB 连接后重新扫描":
      "No serial device found. Check the USB connection and scan again.",

    // ---------- 采集控制台 ----------
    "发送数据（任意内容）": "Send data (any content)",
    编码: "Encoding",
    "ASCII / 文本": "ASCII / text",
    "HEX 字节": "HEX bytes",
    发送追加: "Append",
    不追加: "None",
    "R (单字符)": "R (single char)",
    "响应超时(ms)": "Response timeout (ms)",
    "定时间隔(ms)": "Interval (ms)",
    定时次数: "Repeat count",
    等待设备返回: "Wait for response",
    自动保存检测结果: "Auto-save results",
    日志仅显示解析帧: "Log parsed frames only",
    发送并读取: "Send & read",
    仅发送: "Send only",
    停止: "Stop",
    点击填入发送内容: "Click to fill the send box",

    // ---------- 标签页 ----------
    实时检测: "Live detection",
    空白校准: "Blank calibration",
    历史记录: "History",
    设置: "Settings",
    测试数据: "Test data",
    空白测试: "Blank test",
    样品测试: "Sample test",
    "空白测试 · 样品测试 · 自动扣除空白 · SQLite 历史记录":
      "Blank test · Sample test · Auto blank subtraction · SQLite history",
    空白参照值: "Blank reference",
    空白样本数: "Blank n",
    未测试: "Not tested",
    关闭: "Close",
    采集与发送: "Acquisition & sending",
    "串口未连接，请先在「设置」中连接串口":
      "Serial port not connected. Open Settings to connect first.",
    "请先完成空白测试，再进行样品测试":
      "Run the blank test before the sample test",
    "点击「空白测试」按钮开始采集": "Click “Blank test” to start collecting",
    "自动采集空白，记录参照值":
      "Collect blank readings automatically and store the reference",
    "扣除空白参照，保存样本记录":
      "Subtract the blank reference and save the sample record",
    "原始返回 / HEX": "Raw response / HEX",
    "查看测试原理示意图": "Test principle diagram",
    "测试原理示意图：校准测试 → 标准曲线拟合 → 空白测试 → 样品测试，适配体与皮质醇结合程度决定荧光淬灭强弱":
      "Test principle: calibration → standard-curve fitting → blank test → sample test; the degree of aptamer–cortisol binding determines the fluorescence quenching intensity.",
    "空白测试已完成，可点击「样品测试」":
      "Blank test done — “Sample test” is now available",
    "就绪：请在「设置」中扫描并连接串口设备":
      "Ready — open Settings to scan and connect a serial port",
    "测试流程：① 点击「空白测试」，按「设置」中的采集参数自动采集空白并记录参照值；② 空白测试完成后「样品测试」按钮可用，点击后自动扣除空白参照值并保存样本记录。":
      "Workflow: ① click “Blank test” to collect blank readings automatically (interval and count come from Settings) and store the reference; ② once the blank test is done, “Sample test” becomes available — it subtracts the blank reference and saves the sample record automatically.",

    // ---------- 实时检测 ----------
    实时数据流: "Live data stream",
    暂停: "Pause",
    继续: "Resume",
    清空: "Clear",
    导出日志: "Export log",
    最近测量结果: "Latest result",
    尚未收到数据: "No data received yet",
    原始返回: "Raw response",
    适配体空白参照: "Aptamer blank reference",
    "净信号（扣除空白）": "Net signal (blank subtracted)",
    换算浓度: "Concentration",
    未校准: "Not calibrated",
    未启用标准曲线: "Standard curve disabled",
    样本检测: "Sample",
    "空白（仅缓冲液）": "Blank (buffer only)",
    "空白（适配体+染料）": "Blank (aptamer + dye)",
    "备注 / 样本编号": "Note / sample ID",
    保存到历史记录: "Save to history",
    最近记录: "Recent records",
    刷新: "Refresh",
    暂无记录: "No records",
    "暂无数值可保存，请先采集或手动填写数值":
      "No value to save — collect data or type a value first",
    数值格式无效: "Invalid number format",

    // ---------- 空白校准 ----------
    "校准流程：① 先测「空白」（仅缓冲液 / 空白孔）；② 再测「适配体+染料空白」（不加目标物，只加适配体与染料）。两步的均值会作为参照值保存，样本检测时自动扣除适配体空白参照值得到净信号。采集参数取自顶部控制台的「定时间隔 / 定时次数」。":
      "Workflow: ① measure the blank (buffer only / blank well); ② measure the aptamer + dye blank (no target, aptamer and dye only). The mean of each step is stored as the reference; samples have the aptamer blank subtracted to obtain the net signal. Sampling parameters come from the interval / repeat count in the console above.",
    "浓度 = (净信号 − 截距 b) ÷ 斜率 k，其中净信号 = 测量值 − 空白参照值。":
      "Concentration = (net signal − b) ÷ k, where net signal = measured value − blank reference.",
    "SQLite 采用 WAL 模式，数据实时落盘，可直接用 DB Browser for SQLite 等工具打开查看。":
      "SQLite runs in WAL mode; data is flushed in real time and can be opened with tools such as DB Browser for SQLite.",
    空白: "Blank",
    "仅缓冲液 / 空白孔": "Buffer only / blank well",
    "适配体 + 染料空白": "Aptamer + dye blank",
    不加目标物: "No target",
    参照值: "Reference",
    均值: "Mean",
    "CV(%)": "CV (%)",
    样本数: "n",
    最近值: "Latest",
    定时采集: "Timed collect",
    "采集 1 次": "Collect once",
    清空该类: "Clear",
    采集进度: "Progress",
    停止采集: "Stop",
    "点击卡片上的「定时采集」按钮开始，次数与间隔取自顶部控制台":
      "Click “Timed collect” on a card to start; count and interval come from the console above",
    校准返回数据: "Calibration data",
    全部校准: "All",
    仅空白: "Blank only",
    仅适配体空白: "Aptamer blank only",
    "导出 CSV": "Export CSV",
    时间: "Time",
    类型: "Type",
    数值: "Value",
    备注: "Note",
    操作: "Action",
    类别: "Category",
    单位: "Unit",
    "串口/波特率": "Port / baud",
    来源: "Source",
    串口: "Port",
    发送内容: "Sent data",
    暂无校准数据: "No calibration data",
    删除: "Delete",
    已有采集任务正在进行: "A collection task is already running",
    "串口未连接，请先在左侧连接串口":
      "Serial port not connected. Connect it in the left panel first.",
    "已请求停止采集，将在当前一次发送结束后停止":
      "Stop requested — it will stop after the current send finishes",
    已删除校准记录: "Calibration record deleted",
    暂无校准数据可导出: "No calibration data to export",
    导出失败: "Export failed",

    // ---------- 历史记录 ----------
    历史检测记录: "Measurement history",
    全部类别: "All categories",
    至: "to",
    "备注 / 原始数据关键词": "Note / raw data keyword",
    "50 条/页": "50 / page",
    "100 条/页": "100 / page",
    "200 条/页": "200 / page",
    "500 条/页": "500 / page",
    查询: "Query",
    导出全部: "Export all",
    清空筛选结果: "Clear filtered",
    上一页: "Prev",
    下一页: "Next",
    "筛选结果：": "Filtered: ",
    "全部记录：": "All records: ",
    样本: "Samples",
    本页均值: "Page mean",
    暂无符合条件的记录: "No matching records",
    手动: "Manual",
    定时: "Timed",
    校准: "Calibration",
    已删除该条记录: "Record deleted",
    当前筛选没有可导出的记录: "No matching records to export",

    // ---------- 设置 ----------
    测量与换算: "Measurement & conversion",
    信号单位: "Signal unit",
    "校准参照窗口（最近 N 次均值）": "Calibration window (mean of last N)",
    启用标准曲线换算浓度: "Enable standard curve",
    "斜率 k": "Slope k",
    "截距 b": "Intercept b",
    浓度单位: "Concentration unit",
    连接默认值: "Connection defaults",
    默认波特率: "Default baud rate",
    "默认响应超时(ms)": "Default response timeout (ms)",
    "默认空闲分帧(ms)": "Default idle gap (ms)",
    保存设置: "Save settings",
    恢复默认: "Restore defaults",
    设置已保存: "Settings saved",
    已恢复默认设置: "Default settings restored",
    "确定要恢复默认设置吗？（不会删除历史数据）":
      "Restore default settings? (History data will be kept.)",
    数据存储: "Data storage",
    数据库: "Database",
    数据目录: "Data directory",
    记录总数: "Total records",
    打开数据目录: "Open data directory",
    导出全部记录: "Export all records",
    清空全部记录: "Clear all records",
    关于: "About",
    应用版本: "App version",
    平台: "Platform",
    "确定要清空全部检测记录与校准记录吗？此操作不可撤销。":
      "Clear all measurement and calibration records? This cannot be undone.",
    暂无记录可导出: "No records to export",

    // ---------- 日志 ----------
    "日志已就绪，连接串口后开始记录数据":
      "Log ready — data will be recorded once a port is connected",
    日志已暂停: "Log paused",
    日志已恢复: "Log resumed",
    "日志切换为“仅显示解析帧”": "Log: parsed frames only",
    "日志切换为“显示全部原始数据”": "Log: all raw data",
    日志为空: "Log is empty",
    "日志为空，无需导出": "The log is empty — nothing to export",
    "<空>": "<empty>",

    // ---------- 提示与状态 ----------
    "就绪：请扫描并连接串口设备": "Ready — scan and connect a serial port",
    请先扫描并选择串口设备: "Scan and select a serial port first",
    请输入有效的波特率: "Enter a valid baud rate",
    请填写要发送的数据: "Enter the data to send",
    未收到返回数据: "No response received",
    不限: "unlimited",
    手动停止: "Manual stop",
    已开启自动保存检测结果: "Auto-save turned on",
    已关闭自动保存: "Auto-save turned off",
    连接已关闭: "Connection closed",
    重新开始: "restarted",
    定时发送已完成: "Timed sending finished",
    串口不可用: "Port unavailable",
    "串口不可用，定时发送已停止": "Port unavailable — timed sending stopped",
    串口已关闭: "Port closed",
    串口已断开: "Port closed",
    发送内容为空: "Send data is empty",
    "HEX 数据为空": "HEX data is empty",
    "HEX 数据长度必须为偶数，例如：01 03 00 00":
      "HEX data must have an even length, e.g. 01 03 00 00",
    请先选择要连接的串口: "Select the serial port to connect first",
    波特率无效: "Invalid baud rate",
    校验位参数无效: "Invalid parity setting",
    定时发送已停止: "Timed sending stopped",
    未知错误: "Unknown error",
    无返回: "no response",
    确定: "OK",
    取消: "Cancel",
    导出检测记录: "Export measurement records",
    "CSV 文件": "CSV file",
    文本文件: "Text file",
    所有文件: "All files",
    保存文件: "Save file",
  };

  // =========================== 带变量的句式（正则 → 函数） ===========================
  const PATTERNS = [
    // 串口
    [
      /^发现 (\d+) 个串口设备：(.+)$/,
      (m) => `Found ${m[1]} serial port(s): ${m[2].replace(/、/g, ", ")}`,
    ],
    [/^已扫描到 (\d+) 个串口$/, (m) => `Found ${m[1]} serial port(s)`],
    [/^扫描失败：(.+)$/, (m) => `Scan failed: ${m[1]}`],
    [/^扫描串口失败：(.+)$/, (m) => `Failed to scan serial ports: ${m[1]}`],
    [/^(\d+) 个$/, (m) => `${m[1]}`],
    [/^已连接 (.+)$/, (m) => `Connected ${m[1]}`],
    [/^连接失败：(.+)$/, (m) => `Connection failed: ${m[1]}`],
    [/^断开失败：(.+)$/, (m) => `Disconnect failed: ${m[1]}`],
    [/^串口已打开：(.+)$/, (m) => `Port opened: ${m[1]}`],
    [
      /^运行中（已发送 (\d+) 次 \/ 失败 (\d+) 次）$/,
      (m) => `Running (sent ${m[1]} / failed ${m[2]})`,
    ],
    [/^(\d+) \/ (\d+) 字节$/, (m) => `${m[1]} / ${m[2]} bytes`],
    [/^打开串口失败：(.+)$/, (m) => `Failed to open the port: ${m[1]}`],
    [/^写入串口失败：(.+)$/, (m) => `Failed to write to the port: ${m[1]}`],
    [
      /^串口未打开，请先在左侧选择串口并连接$/,
      () =>
        "The serial port is not open — select and connect a port in the left panel first",
    ],

    // 发送 / 定时发送
    [
      /^“(.+)” 等待响应超时（(\d+)ms）$/,
      (m) => `“${m[1]}” response timeout (${m[2]}ms)`,
    ],
    [/^等待响应超时（(\d+)ms）$/, (m) => `Response timeout (${m[1]}ms)`],
    [
      /^定时发送已启动：每 (\d+)ms 一次，共 (.+) 次$/,
      (m) => `Timed sending started: every ${m[1]}ms, ${m[2]} time(s)`,
    ],
    [
      /^开始定时发送：每 (\d+)ms 发送 “(.+)”，次数 (.+)$/,
      (m) =>
        `Timed sending started: “${m[2]}” every ${m[1]}ms, ${m[3]} time(s)`,
    ],
    [
      /^定时发送已停止（成功 (\d+) 次，失败 (\d+) 次）$/,
      (m) => `Timed sending stopped (sent ${m[1]}, failed ${m[2]})`,
    ],
    [
      /^定时发送结束：(.+)（成功 (\d+) 次，失败 (\d+) 次）$/,
      (m) =>
        `Timed sending finished: ${tr(m[1])} (sent ${m[2]}, failed ${m[3]})`,
    ],

    // 校准采集
    [
      /^开始空白测试：共 (\d+) 次，间隔 (\d+)ms，发送 “(.+)”$/,
      (m) =>
        `Blank test started: ${m[1]} run(s), interval ${m[2]}ms, sending “${m[3]}”`,
    ],
    [/^空白测试 (\d+)\/(\d+)$/, (m) => `Blank test ${m[1]}/${m[2]}`],
    [
      /^样品测试未解析到数值：(.+)$/,
      (m) => `Sample test: no numeric value parsed: ${tr(m[1])}`,
    ],
    [
      /^样品测试完成，已保存：(.+)$/,
      (m) => `Sample test finished and saved: ${tr(m[1])}`,
    ],
    [
      /^保存样品记录失败：(.+)$/,
      (m) => `Failed to save the sample record: ${m[1]}`,
    ],
    [
      /^开始校准采集：(.+)，共 (\d+) 次，间隔 (\d+)ms，发送 “(.+)”$/,
      (m) =>
        `Calibration collection started: ${tr(m[1])}, ${m[2]} run(s), interval ${m[3]}ms, sending “${m[4]}”`,
    ],
    [/^第 (\d+) 次采集失败：(.+)$/, (m) => `Run ${m[1]} failed: ${m[2]}`],
    [
      /^第 (\d+) 次采集未解析到数值：(.+)$/,
      (m) => `Run ${m[1]}: no numeric value parsed: ${m[2]}`,
    ],
    [/^校准采集 (\d+)\/(\d+)$/, (m) => `Collection ${m[1]}/${m[2]}`],
    [
      /^保存校准记录失败：(.+)$/,
      (m) => `Failed to save the calibration record: ${m[1]}`,
    ],
    [
      /^(.*)采集完成：n=(\d+)，均值 (\S+)，SD (\S+)$/,
      (m) =>
        `${tr(m[1])} collection finished: n=${m[2]}, mean ${m[3]}, SD ${m[4]}`,
    ],
    [
      /^(.*)采集完成：n=(\d+)，均值 (\S+)，SD (\S+)（已手动中止）$/,
      (m) =>
        `${tr(m[1])} collection finished (aborted): n=${m[2]}, mean ${m[3]}, SD ${m[4]}`,
    ],
    [
      /^(.*)采集完成，但没有解析到有效数值$/,
      (m) => `${tr(m[1])} collection finished, but no valid value was parsed`,
    ],
    [
      /^读取校准数据失败：(.+)$/,
      (m) => `Failed to read calibration data: ${m[1]}`,
    ],
    [
      /^确定要清空「(.+)」的校准记录吗？$/,
      (m) => `Clear all “${tr(m[1])}” calibration records?`,
    ],
    [
      /^已清空 (\d+) 条校准记录$/,
      (m) => `Cleared ${m[1]} calibration record(s)`,
    ],
    [
      /^已导出 (\d+) 条校准记录：(.+)$/,
      (m) => `Exported ${m[1]} calibration record(s): ${m[2]}`,
    ],
    [/^采集中 (\d+)\/(\d+)$/, (m) => `Collecting ${m[1]}/${m[2]}`],
    [
      /^正在采集「(.+)」，成功 (\d+) 次 \/ 失败 (\d+) 次$/,
      (m) => `Collecting “${tr(m[1])}”: ${m[2]} ok / ${m[3]} failed`,
    ],

    // 结果与记录
    [
      /^接收时间 (.+) · (.+) · (\d+) 字节（未解析到数值，可手动填写后保存）$/,
      (m) =>
        `Received ${m[1]} · ${m[2]} · ${m[3]} bytes (no numeric value parsed — you may type one before saving)`,
    ],
    [
      /^接收时间 (.+) · (.+) · (\d+) 字节$/,
      (m) => `Received ${m[1]} · ${m[2]} · ${m[3]} bytes`,
    ],
    [/^已保存：(.*)$/, (m) => `Saved: ${m[1].split(" ").map(tr).join(" ")}`],
    [/^已保存 (.+)$/, (m) => `Saved ${m[1]}`],
    [
      /^将保存为(.+)，同时计入校准参照值$/,
      (m) =>
        `Will be saved as ${tr(m[1])} and counted in the calibration reference`,
    ],
    [
      /^已清空 (\d+) 条检测记录、(\d+) 条校准记录$/,
      (m) => `Cleared ${m[1]} measurement(s) and ${m[2]} calibration record(s)`,
    ],
    [/^已清空 (\d+) 条记录$/, (m) => `Cleared ${m[1]} record(s)`],
    [
      /^已导出 (\d+) 条记录：(.+)$/,
      (m) => `Exported ${m[1]} record(s): ${m[2]}`,
    ],
    [
      /^确定要清空「(.+)」的检测记录吗？此操作不可撤销。$/,
      (m) =>
        `Clear all “${tr(m[1])}” measurement records? This cannot be undone.`,
    ],
    [
      /^共 (\d+) 条记录，每页 (\d+) 条$/,
      (m) => `${m[1]} record(s), ${m[2]} per page`,
    ],
    [/^查询失败：(.+)$/, (m) => `Query failed: ${m[1]}`],
    [/^读取失败：(.+)$/, (m) => `Load failed: ${m[1]}`],
    [/^初始化失败：(.+)$/, (m) => `Initialization failed: ${m[1]}`],
    [/^应用已就绪 · Electron (.*)$/, (m) => `Ready · Electron ${m[1]}`],
    [/^日志已导出：(.+)$/, (m) => `Log exported: ${m[1]}`],
    [/^导出失败：(.+)$/, (m) => `Export failed: ${m[1]}`],
  ];

  // =========================== 词组（用于语句中夹带的片段） ===========================
  const FRAGMENTS = {
    "空白（适配体+染料）": "Blank (aptamer + dye)",
    "空白（仅缓冲液）": "Blank (buffer only)",
    适配体空白: "Aptamer blank",
    空白测试: "Blank test",
    样品测试: "Sample test",
    样本检测: "Sample",
    样本: "Sample",
    空白: "Blank",
    校准: "Calibration",
    全部类别: "All categories",
    全部: "All",
    定时: "Timed",
    手动: "Manual",
    未校准: "Not calibrated",
  };

  /** 单次翻译（回退链：整句 → 句式 → 词组） */
  function translate(text) {
    if (text === null || text === undefined) return text;
    const src = String(text);
    if (lang === ZH) return src;
    // 归一化内部空白（HTML 多行源码会留下换行+缩进），保证整句表能命中
    const key = src.trim().replace(/\s+/g, " ");
    if (!key) return src;
    if (Object.prototype.hasOwnProperty.call(EXACT, key)) return EXACT[key];
    for (const [re, fn] of PATTERNS) {
      const m = key.match(re);
      if (m) {
        try {
          return fn(m);
        } catch {
          /* 忽略翻译函数异常，退回原文 */
        }
      }
    }
    let out = key;
    for (const from of Object.keys(FRAGMENTS)) {
      if (out.includes(from)) out = out.split(from).join(FRAGMENTS[from]);
    }
    return out;
  }

  /** 供 JS 主动调用（translate 的别名，句式内部递归使用） */
  const tr = translate;

  // =============================== DOM 翻译 ===============================

  function translateTextNode(node) {
    const raw = node.nodeValue;
    if (raw === null || raw === undefined) return;
    const current = raw.trim();
    if (!current) return;

    if (
      node.__pvSrc === undefined ||
      (current !== node.__pvSrc && current !== node.__pvOut)
    ) {
      node.__pvSrc = current;
    }

    const out = translate(node.__pvSrc);
    const next = `${raw.match(/^\s*/)[0]}${out}${raw.match(/\s*$/)[0]}`;
    node.__pvOut = out;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function translateAttribute(element, attr) {
    const value = element.getAttribute(attr);
    if (value === null) return;
    const store = `__pvSrc_${attr}`;
    const outStore = `__pvOut_${attr}`;
    if (
      element[store] === undefined ||
      (value !== element[store] && value !== element[outStore])
    ) {
      element[store] = value.trim();
    }
    const out = translate(element[store]);
    element[outStore] = out;
    if (value !== out) element.setAttribute(attr, out);
  }

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      translateTextNode(node);
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.dataset && node.dataset.noI18n !== undefined) return;
    if (SKIP_TAGS.has(node.tagName)) return;

    translateAttribute(node, "placeholder");
    translateAttribute(node, "title");
    translateAttribute(node, "alt");
    for (const child of node.childNodes) walk(child);
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try {
      if (document.title) document.title = translate("POCT 皮质醇检测工作站");
      walk(document.body);
      updateButton();
    } finally {
      applying = false;
    }
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((records) => {
      if (lang === ZH || applying) return;
      applying = true;
      try {
        for (const record of records) {
          if (record.type === "characterData") {
            walk(record.target);
            continue;
          }
          const target = record.target;
          if (
            target &&
            target.nodeType === 1 &&
            target.dataset &&
            target.dataset.noI18n !== undefined
          ) {
            continue;
          }
          for (const added of record.addedNodes || []) walk(added);
        }
      } finally {
        applying = false;
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // =============================== 语言切换 ===============================

  function updateButton() {
    const btn = document.getElementById("btn-lang");
    if (!btn) return;
    btn.textContent = lang === ZH ? "EN" : "中文";
    btn.title = lang === ZH ? "Switch to English" : "切换到中文";
  }

  function currentLang() {
    return lang;
  }

  function setLang(next, options = {}) {
    const target = next === EN ? EN : ZH;
    lang = target;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* 忽略隐私模式等异常 */
    }
    document.documentElement.setAttribute("lang", lang === EN ? "en" : "zh-CN");
    applyAll();

    if (options.persist !== false && window.POCT && window.POCT.api) {
      window.POCT.api.db.setSettings({ lang }).catch(() => {});
      window.POCT.api.app.setLang(lang).catch(() => {});
    }

    for (const cb of listeners) {
      try {
        cb(lang);
      } catch {
        /* 忽略单个回调异常 */
      }
    }
    return lang;
  }

  function toggle() {
    return setLang(lang === ZH ? EN : ZH);
  }

  function onChange(callback) {
    listeners.push(callback);
    return () => {
      const i = listeners.indexOf(callback);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /** CSV 表头与类别标签（随语言变化） */
  function csvLabels() {
    return {
      headers: [
        "ID",
        tr("时间"),
        tr("类别"),
        tr("数值"),
        tr("单位"),
        tr("原始返回"),
        tr("发送内容"),
        tr("串口"),
        tr("波特率"),
        tr("来源"),
        tr("备注"),
      ],
      categories: {
        blank: tr("空白（仅缓冲液）"),
        aptamer_blank: tr("空白（适配体+染料）"),
        sample: tr("样本检测"),
      },
      sources: {
        manual: tr("手动"),
        timed: tr("定时"),
        calibration: tr("校准"),
      },
    };
  }

  // =============================== 确认弹窗 ===============================

  function confirmDialog(message, options = {}) {
    return new Promise((resolve) => {
      const previous = document.getElementById("poct-modal");
      if (previous) previous.remove();

      const mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.id = "poct-modal";

      const card = document.createElement("div");
      card.className = "modal-card";

      const text = document.createElement("p");
      text.className = "modal-text";
      text.textContent = message;

      const actions = document.createElement("div");
      actions.className = "modal-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn ghost";
      cancelBtn.textContent = options.cancelText || "取消";

      const okBtn = document.createElement("button");
      okBtn.className = `btn ${options.danger === false ? "primary" : "danger"}`;
      okBtn.textContent = options.okText || "确定";

      const close = (result) => {
        document.removeEventListener("keydown", onKey, true);
        mask.remove();
        resolve(result);
      };

      function onKey(event) {
        if (event.key === "Escape") close(false);
        else if (event.key === "Enter") close(true);
      }

      cancelBtn.addEventListener("click", () => close(false));
      okBtn.addEventListener("click", () => close(true));
      mask.addEventListener("click", (event) => {
        if (event.target === mask) close(false);
      });
      document.addEventListener("keydown", onKey, true);

      actions.append(cancelBtn, okBtn);
      card.append(text, actions);
      mask.appendChild(card);
      document.body.appendChild(mask);

      walk(mask); // 立即翻译，无需等待 MutationObserver
      okBtn.focus();
    });
  }

  // =============================== 初始化 ===============================

  function init() {
    let stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === EN || stored === ZH) lang = stored;
    document.documentElement.setAttribute("lang", lang === EN ? "en" : "zh-CN");

    const btn = document.getElementById("btn-lang");
    if (btn) btn.addEventListener("click", () => toggle());

    startObserver();
    applyAll();
  }

  window.POCT.i18n = {
    init,
    t: translate,
    toggle,
    setLang,
    currentLang,
    onChange,
    csvLabels,
    confirmDialog,
    applyAll,
    ZH,
    EN,
  };

  // 便捷别名：POCT.t("中文原文") / POCT.confirmDialog(...)
  window.POCT.t = translate;
  window.POCT.confirmDialog = confirmDialog;
})();
