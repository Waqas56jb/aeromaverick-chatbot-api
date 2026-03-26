import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/panel/" : "/",
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
