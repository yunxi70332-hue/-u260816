import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 9011,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9014",
        changeOrigin: true
      }
    }
  }
});
