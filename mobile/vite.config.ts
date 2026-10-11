import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  // --host：手机与电脑连同一局域网时，可用电脑 IP 直接访问调试
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
  // 注入应用版本号（设置页「关于」显示）
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
  },
});
