import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// В dev-режиме /api/* проксируется на бэкенд, в Docker то же делает Caddy (miniapp/Caddyfile),
// поэтому фронт всегда ходит на относительный /api — без CORS и без разных URL.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // чтобы открывалось через туннель (*.trycloudflare.com)
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
