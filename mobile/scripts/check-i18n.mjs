/**
 * i18n 词条覆盖检查
 * ---------------------------------------------------------------------------
 * 扫描 src 下所有 t("中文原文") 调用，与 src/i18n/dict.ts 的英文词条比对，
 * 找出缺失翻译（英文模式下会显示中文，属于可见缺陷）。
 *
 * 用法：node scripts/check-i18n.mjs
 */

import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// 1. 读取词条表（去掉 TS 类型标注后用 Function 求值对象字面量）
const dictSource = readFileSync(path.join(root, "src/i18n/dict.ts"), "utf8");
const start = dictSource.indexOf("EN: Record<string, string> = {");
const open = dictSource.indexOf("{", start);
const close = dictSource.lastIndexOf("}");
const EN = new Function(`return (${dictSource.slice(open, close + 1)});`)();
const keys = new Set(Object.keys(EN));

// 2. 收集代码中出现的键
const used = new Map();
for (const file of walk(path.join(root, "src"))) {
  if (file.endsWith("i18n/dict.ts")) continue;
  const source = readFileSync(file, "utf8");
  const re =
    /\bt\(\s*"((?:[^"\\]|\\.)*)"|translate\(\s*\w+,\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const key = unescapeKey(match[1] ?? match[2]);
    if (!used.has(key)) used.set(key, path.relative(root, file));
  }
}

/** 把源码里的转义写法（\\n、\" 等）还原成真实字符，便于与词条表比对 */
function unescapeKey(value) {
  const map = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
  return value.replace(/\\(.)/g, (_all, esc) => map[esc] ?? esc);
}

const missing = [...used.entries()].filter(([key]) => !keys.has(key));
const unused = [...keys].filter((key) => !used.has(key));

console.log(`词条总数：${keys.size}，代码使用：${used.size}`);
if (missing.length) {
  console.log(`\n缺少英文翻译 ${missing.length} 条：`);
  for (const [key, file] of missing) console.log(`  · ${key}   (${file})`);
} else {
  console.log("\n✓ 所有界面文案都有英文翻译");
}
if (unused.length) {
  console.log(`\n未被使用的词条 ${unused.length} 条（可清理）：`);
  for (const key of unused) console.log(`  · ${key}`);
}
process.exitCode = missing.length ? 1 : 0;
