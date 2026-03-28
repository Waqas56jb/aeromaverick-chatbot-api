import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat/session": { target: "http://localhost:3000", changeOrigin: true },
      "/chat/init": { target: "http://localhost:3000", changeOrigin: true },
      "/chat": { target: "http://localhost:3000", changeOrigin: true },
      "/health": { target: "http://localhost:3000", changeOrigin: true },
      "/leads": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
