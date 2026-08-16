import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const basePath = normalizeBasePath(process.env.VITE_ERP_BASE_PATH ?? "/");
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:9014";

export default defineConfig({
  root: appRoot,
  base: basePath,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 9013,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.join(appRoot, "dist"),
    emptyOutDir: true
  }
});

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}
