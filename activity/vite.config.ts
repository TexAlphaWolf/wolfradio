import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The bot serves the built files (dist/activity-web) and the API on the same origin.
// In dev, Vite proxies /api (HTTP + WebSocket) to the bot.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: { outDir: "../dist/activity-web", emptyOutDir: true, sourcemap: false },
  server: {
    port: 5173,
    allowedHosts: true, // reached through the cloudflared tunnel
    proxy: { "/api": { target: "http://localhost:8080", ws: true, changeOrigin: true } },
  },
});
