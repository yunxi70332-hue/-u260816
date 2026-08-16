import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const children = [];

if (!(await isPortOpen(9011))) {
  children.push(start("设计器", node, [vite, "--host", "127.0.0.1", "--port", "9011", "--strictPort"], root));
} else {
  console.log("设计器复用现有服务：http://127.0.0.1:9011");
}

if (await isPortOpen(9014)) {
  throw new Error("9014 端口已被占用，请先停止旧 ERP 服务。");
}

children.push(start("ERP UI", node, [vite, "--host", "127.0.0.1", "--port", "9016", "--strictPort"], path.join(root, "apps", "erp")));
children.push(start("ERP API", node, [tsx, "watch", "src/server.ts"], path.join(root, "apps", "api"), {
  PORT: "9014",
  HOST: "127.0.0.1",
  ERP_DEV_SERVER_URL: "http://127.0.0.1:9016",
  CORS_ORIGINS: "http://127.0.0.1:9011,http://localhost:9011,http://127.0.0.1:9014,http://localhost:9014",
  BETTER_AUTH_URL: "http://127.0.0.1:9014",
  SESSION_COOKIE_SECURE: "false"
}));

await waitForPort(9014, 30_000);
console.log("\n双端口 ERP 已启动：");
console.log("设计器：http://127.0.0.1:9011");
console.log("ERP 管理：http://127.0.0.1:9014");
console.log("ERP UI 内部开发端口 9016 仅绑定本机，不作为用户入口。\n");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

await new Promise((resolve) => {
  for (const child of children) child.once("exit", resolve);
});
shutdown("SIGTERM");

function start(label, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.once("exit", (code) => {
    if (code && code !== 0) console.error(`${label} 已退出，代码 ${code}`);
  });
  return child;
}

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
  process.exit(0);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(400);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待端口 ${port} 超时。`);
}
