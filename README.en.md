# POCT Cortisol Detection Workstation

A complete serial-port toolchain for POCT (point-of-care testing) cortisol detection:
**test data (blank test / sample test) / serial setup / measurement I/O / history / CSV export**.

This repository contains two front ends:

| Folder                | Target  | Stack                                           | Runtime                                                              |
| --------------------- | ------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| [`pc/`](./pc)         | Desktop | Electron 44 + serialport 13 + better-sqlite3 13 | macOS / Windows / Linux desktop                                      |
| [`mobile/`](./mobile) | Mobile  | Vite + React 19 + TypeScript + Web Serial API   | Mobile browsers (Android Chrome / Edge; requires https or localhost) |

Both ends share the **same features, record fields and CSV columns**, so data can be exported from one and
compared in the other: the desktop app stores data in SQLite, the mobile app in browser `localStorage`.

> 中文文档：[`README.md`](./README.md)

---

## Quick start

```bash
# 1. Desktop (Electron)
npm run pc:install      # same as: cd pc && npm install
npm run pc              # launch the desktop app

# 2. Mobile (web)
npm run mobile:install  # same as: cd mobile && npm install
npm run mobile          # start the dev server; prints a LAN address
npm run mobile:build    # build static assets into mobile/dist
```

> The mobile dev server listens on `0.0.0.0:5174`. With the phone and the computer on the same Wi-Fi,
> open the printed `http://<computer-ip>:5174` in the phone browser.
> Note that **Web Serial is only available in a secure context**: when the page is served over plain
> LAN `http`, browsers disable the serial API, the app shows a warning and you can still record data
> with “manual entry”. To actually talk to a device over OTG, deploy `dist/` over `https` or open the
> page from the phone's own `localhost`.

---

## Feature comparison

| Module            | Desktop `pc/`                                                         | Mobile `mobile/`                                                            |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Port discovery    | `serialport` scans all local ports                                    | Web Serial: authorized device list + browser device picker                  |
| Connection params | Baud rate / data bits / stop bits / parity / idle gap                 | Same                                                                        |
| Measurement I/O   | Send any data, HEX mode, terminators, wait for reply                  | Same                                                                        |
| Timed sending     | Interval + repeat count (0 = unlimited), stop anytime                 | Same                                                                        |
| Test data         | Blank test → sample test; samples auto-subtract the blank reference   | Same (plus manual calibration entry when no port is available)              |
| Conversion        | Net signal = reading − aptamer blank reference; linear standard curve | Same                                                                        |
| History           | SQLite (WAL); filter / paginate / delete / CSV export                 | localStorage; filter / paginate / delete / CSV export                       |
| UI language       | One-tap 中文 / English                                                | One-tap 中文 / English                                                      |
| Theme             | Light theme with deep-green medical palette                           | Same (mobile layout: bottom tab bar, large touch targets, safe-area insets) |

---

## Directory layout

```
.
├── pc/                  # Desktop app (Electron), see pc/README.md
├── mobile/              # Mobile app (React), see mobile/README.md
├── package.json         # Root scripts: npm run pc / npm run mobile ...
├── README.md            # Chinese documentation
└── README.en.md         # English documentation (this file)
```

## Further documentation

- Desktop details: serial protocol, SQLite schema, packaging → [`pc/README.md`](./pc/README.md)
- Mobile details: how to run, Web Serial limitations, data storage keys → [`mobile/README.md`](./mobile/README.md)
