# POCT 皮质醇检测 · 手机版（`mobile/`）

用 **Vite + React 19 + TypeScript** 重写的手机端，通过浏览器 **Web Serial API** 直接连接串口设备
（手机 USB-OTG 或桌面浏览器均可），功能与桌面版一致：串口连接、检测收发、空白校准、历史记录、CSV 导出、中英文切换。

数据保存在浏览器 `localStorage`，不需要任何后端服务。

---

## 1. 运行

```bash
cd mobile
npm install
npm run dev        # 开发服务器（--host，会打印局域网地址）
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # 仅类型检查
node scripts/check-i18n.mjs   # 检查界面文案是否都有英文翻译
```

在仓库根目录也可以用：`npm run mobile`、`npm run mobile:build`、`npm run mobile:preview`。

### 在手机上打开

1. 手机与电脑连同一个 Wi-Fi；
2. 运行 `npm run dev`，终端会打印 `Network: http://192.168.x.x:5174/`；
3. 用手机浏览器打开该地址。

> ⚠️ **Web Serial 只在安全上下文（https / localhost）可用**。
> 通过局域网 `http://192.168.x.x` 打开时浏览器会禁用串口 API，应用会在「连接」页顶部提示，
> 此时仍可在「检测」页**手动录入数值**并保存记录、做统计与导出。
> 要在手机上真正连串口（OTG），请把 `dist/` 部署到 https 站点，或用手机本机的 localhost（如 Capacitor / 本地服务）打开。

---

## 2. 浏览器支持

| 浏览器              | Web Serial | 说明                            |
| ------------------- | ---------- | ------------------------------- |
| Android Chrome/Edge | ✅         | 支持 OTG 串口，推荐             |
| 桌面 Chrome/Edge    | ✅         | 方便在电脑上调试手机版界面      |
| iOS Safari          | ❌         | 未实现 Web Serial，只能手动录入 |
| 桌面 Safari/Firefox | ❌         | 同上                            |

「设置 → 关于 → 串口支持」会显示当前环境是否可用。

---

## 3. 目录结构

```
mobile/
├── index.html                # 入口（移动端 viewport / theme-color / PWA meta）
├── vite.config.ts            # Vite 配置（--host、注入版本号、构建目标 es2022）
├── public/logo-green.svg     # 深绿色品牌 logo（与桌面版同源）
├── scripts/check-i18n.mjs    # i18n 词条覆盖检查脚本
└── src/
    ├── main.tsx              # React 挂载入口
    ├── App.tsx               # Provider 组合 + 底部标签页切换
    ├── styles.css            # 移动端样式（亮色 + 深绿医疗风，含安全区适配）
    ├── lib/
    │   ├── types.ts          # 领域类型、默认设置（字段与桌面版一致）
    │   ├── format.ts         # 数值解析 / 时间格式化 / 字节与 HEX / 统计
    │   ├── serial.ts         # Web Serial 封装（连接、收发、分帧、定时发送）
    │   ├── store.ts          # localStorage 数据层（measurements / calibrations / settings）
    │   ├── csv.ts            # CSV 生成与浏览器下载
    │   └── logBus.ts         # 实时数据流日志总线（高频数据不进 React 状态）
    ├── i18n/
    │   ├── dict.ts           # 英文词条表（键 = 中文原文）
    │   ├── index.tsx         # I18nProvider / useI18n / t()
    │   └── patterns.ts       # 带变量日志文案的句式翻译
    ├── state/
    │   ├── SettingsProvider.tsx  # 设置（持久化）
    │   ├── DataProvider.tsx      # 数据版本号（写入后触发刷新）
    │   ├── SerialProvider.tsx    # 串口状态与动作、事件分发
    │   ├── ToastProvider.tsx     # 轻提示 + 可翻译确认弹窗
    │   └── stores.ts             # 高频数据外部 store（流量/最新帧/定时进度）
    ├── components/           # Header / TabBar / LogView / 基础 UI 组件
    └── screens/              # 连接 / 检测 / 校准 / 历史 / 设置 五个页面
```

### 架构要点

- **高频数据不进 Context**：串口每来一帧就更新界面，因此把「收发字节数、最新帧、定时进度」放在
  `useSyncExternalStore` 订阅的小 store 中，只有用到它们的组件才重渲染。
- **页面常驻**：五个页面全部保持挂载（用 `hidden` 控制显隐），切换标签不会中断定时发送与校准采集，
  表单内容也不会丢。
- **数据层同步 API**：`lib/store.ts` 直接读写 localStorage（先加载进内存、写入时全量落盘），
  与桌面版 `electron/db.js` 的字段一一对应，导出的 CSV 列完全一致。

---

## 4. 数据存储

| localStorage key           | 内容                                       |
| -------------------------- | ------------------------------------------ |
| `poct.mobile.measurements` | 检测/采集记录（含校准来源的记录）          |
| `poct.mobile.calibrations` | 空白校准记录                               |
| `poct.mobile.settings`     | 全部设置（连接参数、测量换算、控制台参数） |
| `poct.mobile.counters`     | 自增 ID 计数器（保证删除后 id 不复用）     |
| `poct.mobile.lang`         | 界面语言（避免启动闪动）                   |
| `poct.mobile.tab`          | 上次停留的标签页                           |

- 常见浏览器上限约 **5MB**（设置页「数据存储」会显示已用空间）；记录超过 5000 条时自动裁剪最旧记录；
- 清理浏览器数据会**丢失记录**，重要数据请用「导出 CSV / 导出全部记录」及时备份；
- 导出的 CSV 带 BOM，Excel / WPS 打开不乱码，列顺序与桌面版一致（ID、时间、类别、数值、单位、原始返回、发送内容、串口、波特率、来源、备注）。

---

## 5. 与桌面版的差异

| 项目       | 桌面版                      | 手机版                                                 |
| ---------- | --------------------------- | ------------------------------------------------------ |
| 串口枚举   | 列出本机全部串口            | 只能列出**已授权**设备，首次需点「添加设备」由用户选择 |
| 串口标识   | `/dev/ttyUSB0` 等设备路径   | 浏览器不提供路径，用 `USB 串口设备 VID:PID` 标识       |
| 数据存储   | SQLite（`<userData>/*.db`） | localStorage                                           |
| 无串口兜底 | —                           | 检测页/校准页可**手动录入数值**                        |
| 导出       | 系统保存对话框              | 浏览器下载到「下载/文件」                              |
| 语言       | 菜单 + 界面                 | 仅界面（浏览器无应用菜单）                             |

---

## 6. 维护提示

- **新增界面文案**：直接写中文，然后在 `src/i18n/dict.ts` 里补一条
  `"中文原文": "English"`；带变量用 `{name}` 占位（如 `t("已连接 {port} @ {baud} bps", { port, baud })`）。
  改完运行 `node scripts/check-i18n.mjs`，会列出缺失翻译与未被使用的词条。
- **改字段/表结构**：只改 `src/lib/types.ts` 与 `src/lib/store.ts`，并同步桌面版 `pc/electron/db.js`，
  保证两端 CSV 与字段一致。
- **移动端布局约定**：触控目标 ≥ 44px；输入框 `font-size: 16px`（避免 iOS 聚焦缩放）；
  底部安全区用 `env(safe-area-inset-bottom)`。
