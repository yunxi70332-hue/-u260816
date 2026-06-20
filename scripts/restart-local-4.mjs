import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.USM_LOCAL_PORT || 9011);
const url = `http://127.0.0.1:${port}/`;
const outputDir = path.join(root, "output");
const stdoutLog = path.join(outputDir, `vite-${port}.log`);
const stderrLog = path.join(outputDir, `vite-${port}.err.log`);
const statusFile = path.join(outputDir, `service-${port}.status.txt`);
const viteScript = path.join(root, "node_modules", "vite", "bin", "vite.js");

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(viteScript)) {
  console.error(`Vite was not found at ${viteScript}. Run npm install once before starting the local service.`);
  process.exit(1);
}

for (const pid of findPortPids(port)) {
  try {
    execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
  } catch {
    // The process may have already exited.
  }
}

await sleep(250);
removeLog(stdoutLog);
removeLog(stderrLog);

const child = spawn(process.execPath, [viteScript, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  detached: true,
  stdio: "ignore",
  windowsHide: true
});
child.unref();

const ready = await waitForHttp(url, 8000);
if (!ready) {
  writeStatus("started-unconfirmed", child.pid);
  console.log(`USM 4.0 service started, but readiness was not confirmed yet.`);
  console.log(`URL: ${url}`);
  console.log(`Log: ${stdoutLog}`);
  process.exitCode = 2;
} else {
  writeStatus("ready", findPortPids(port).join(", ") || child.pid);
  console.log(`USM 4.0 local service restarted`);
  console.log(`URL: ${url}`);
  console.log(`PID: ${findPortPids(port).join(", ") || child.pid}`);
  console.log(`Log: ${stdoutLog}`);
}

function findPortPids(targetPort) {
  let text = "";
  try {
    text = execSync(`netstat -ano -p tcp`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return [];
  }

  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(`:${targetPort}`)) continue;
    const parts = line.trim().split(/\s+/);
    const local = parts[1] || "";
    const pid = Number(parts[parts.length - 1]);
    if (local.endsWith(`:${targetPort}`) && Number.isFinite(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}

function waitForHttp(targetUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on("error", () => {
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 180);
      });
      req.setTimeout(800, () => {
        req.destroy();
      });
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStatus(state, pid) {
  const body = [
    `state=${state}`,
    `url=${url}`,
    `pid=${pid}`,
    `updatedAt=${new Date().toISOString()}`
  ].join("\n");
  fs.writeFileSync(statusFile, `${body}\n`, "utf8");
}

function removeLog(file) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(file, { force: true });
      return;
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120);
    }
  }
}
