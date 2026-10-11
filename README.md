# POCT 皮质醇检测工作站

> English documentation: [`README.en.md`](./README.en.md)

通过串口连接检测设备，完成 **测试数据（空白测试 / 样品测试）/ 串口设置 / 检测收发 / 历史记录 / CSV 导出** 的全流程工具。
同一个仓库包含两个端：

| 目录                  | 端     | 技术栈                                          | 运行环境                                                   |
| --------------------- | ------ | ----------------------------------------------- | ---------------------------------------------------------- |
| [`pc/`](./pc)         | 桌面版 | Electron 44 + serialport 13 + better-sqlite3 13 | macOS / Windows / Linux 桌面                               |
| [`mobile/`](./mobile) | 手机版 | Vite + React 19 + TypeScript + Web Serial API   | 手机浏览器（Android Chrome / Edge，需 https 或 localhost） |

两端的**功能、字段与 CSV 列完全一致**，可互相导入对照：PC 端数据存在 SQLite，手机端存在浏览器 localStorage。

---

## 快速开始

```bash
# 1. 桌面版（Electron）
npm run pc:install      # 等价于 cd pc && npm install
npm run pc              # 启动桌面应用

# 2. 手机版（Web）
npm run mobile:install  # 等价于 cd mobile && npm install
npm run mobile          # 启动开发服务器，终端会打印局域网地址
npm run mobile:build    # 构建静态产物到 mobile/dist
```

> 手机版默认监听 `0.0.0.0:5174`，手机与电脑连同一 Wi-Fi 后，用手机浏览器打开终端里打印的
> `http://<电脑 IP>:5174` 即可。注意：**Web Serial 只在安全上下文可用**，
> 局域网 http 访问时浏览器会禁用串口 API，手机端会自动提示，此时仍可用「手动录入」记录数据；
> 需要在手机上真正连串口（OTG）时，请用 `https` 部署或在手机本机 `localhost` 下打开。

---

## 功能对照

| 模块     | 桌面版 `pc/`                                   | 手机版 `mobile/`                                     |
| -------- | ---------------------------------------------- | ---------------------------------------------------- |
| 串口发现 | `serialport` 扫描本机全部串口                  | Web Serial：已授权设备列表 + 浏览器设备选择框        |
| 连接参数 | 波特率 / 数据位 / 停止位 / 校验位 / 空闲分帧   | 同左                                                 |
| 检测收发 | 发送任意数据、HEX、追加结束符、等待返回        | 同左                                                 |
| 定时发送 | 间隔 + 次数（0 = 不限），可随时停止            | 同左                                                 |
| 测试数据 | 空白测试 → 样品测试两步流程，样品自动扣除空白参照 | 同左（另支持无串口时手动录入校准值）                 |
| 结果换算 | 净信号 = 测量值 − 适配体空白参照；线性标准曲线 | 同左                                                 |
| 历史记录 | SQLite（WAL），筛选 / 分页 / 删除 / 导出 CSV   | localStorage，筛选 / 分页 / 删除 / 导出 CSV          |
| 界面语言 | 中文 / English 一键切换                        | 中文 / English 一键切换                              |
| 主题     | 亮色 + 深绿医疗风                              | 同左（移动端布局：底部标签栏、大触控区、安全区适配） |

---

## 目录结构

```
.
├── pc/                  # 桌面版（Electron），见 pc/README.md
├── mobile/              # 手机版（React），见 mobile/README.md
├── package.json         # 根脚本：npm run pc / npm run mobile ...
├── README.md            # 中文说明（本文件）
└── README.en.md         # English documentation
```

## 更多文档

- 桌面版功能细节、串口协议、SQLite 表结构、打包方式 → [`pc/README.md`](./pc/README.md)
- 手机版运行方式、Web Serial 限制、数据存储与目录说明 → [`mobile/README.md`](./mobile/README.md)
- English overview → [`README.en.md`](./README.en.md)
