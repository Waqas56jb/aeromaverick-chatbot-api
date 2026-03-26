import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production asset URLs:
 * - Default `./` — works at repo root on Vercel **or** under `/panel/` on the API (rebuild after change).
 * - Override: `VITE_ADMIN_BASE=/panel/` when the UI is only ever served at that path on the same host.
 */
function productionBase() {
  const raw = process.env.VITE_ADMIN_BASE;
  if (raw == null || String(raw).trim() === "") return "./";
  let b = String(raw).trim();
  if (b === "." || b === "./") return "./";
  if (!b.startsWith("/")) b = `/${b}`;
  return b.endsWith("/") ? b : `${b}/`;
}

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? productionBase() : "/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/admin": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (err) => console.error("[vite proxy /admin]", err.message));
        },
      },
      "/health": { target: "http://localhost:3000", changeOrigin: true },
      "/config": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
}));
