import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Адрес API для Android-приложения (T-19): оно открывается не с сайта, а из файлов внутри APK,
// поэтому ходит в бэкенд по полному адресу. Другой сервер — `VITE_API_URL=https://.../api npm run build:android`.
const PROD_API = "https://deti.201-34-157-90.sslip.io/api";

// В dev-режиме /api/* проксируется на бэкенд, в Docker то же делает Caddy (miniapp/Caddyfile),
// поэтому сайт всегда ходит на относительный /api — без CORS и без разных URL.
export default defineConfig(({ mode }) => {
  if (mode === "android") process.env.VITE_API_URL ??= PROD_API;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
      allowedHosts: true, // чтобы открывалось через туннель (*.trycloudflare.com)
      proxy: {
        "/api": {
          target: process.env.BACKEND_URL ?? "http://localhost:8000",
          changeOrigin: true,
          ws: true, // сигнальный сервер видеособеседования (/api/calls/<token>/ws)
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
