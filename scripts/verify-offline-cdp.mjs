import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const chromePath = path.join(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1224",
  "chrome-win64",
  "chrome.exe"
);
const distIndex = path.join(rootDir, "dist", "index.html");
const outputDir = path.join(rootDir, "output", "offline");
const userDataDir = path.join(outputDir, "cdp-profile");
const screenshotPath = path.join(outputDir, "offline-cdp.png");
const port = 9224;

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(chromePath)) {
  throw new Error(`Chrome not found: ${chromePath}`);
}

if (!fs.existsSync(distIndex)) {
  throw new Error(`Offline build not found: ${distIndex}`);
}

const url = pathToFileURL(distIndex).href;
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=1280,720",
    url
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);

const stderr = [];
chrome.stderr.on("data", (chunk) => stderr.push(String(chunk)));

try {
  const page = await waitForPage();
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");

  const events = [];
  cdp.on("Runtime.consoleAPICalled", (event) => {
    events.push(`${event.type}: ${(event.args ?? []).map((arg) => arg.value ?? arg.description).join(" ")}`);
  });
  cdp.on("Runtime.exceptionThrown", (event) => {
    events.push(`exception: ${event.exceptionDetails?.text ?? "unknown"}`);
  });
  cdp.on("Log.entryAdded", (event) => {
    events.push(`${event.entry.level}: ${event.entry.text}`);
  });

  await delay(5000);

  const state = await cdp.evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    let canvasInfo = null;
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      canvasInfo = {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        hasWebgl: Boolean(gl),
        dataUrlLength: canvas.toDataURL('image/png').length
      };
    }
    return {
      title: document.title,
      href: location.href,
      canvasCount: document.querySelectorAll('canvas').length,
      canvasInfo,
      bodyText: document.body.innerText.slice(0, 300)
    };
  })()`);

  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  console.log(JSON.stringify({ url, state, events, stderr: stderr.join("").slice(0, 2000), screenshotPath }, null, 2));
  cdp.close();
} finally {
  chrome.kill("SIGKILL");
}

async function waitForPage() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) {
        return page;
      }
    } catch {
      await delay(200);
    }
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

async function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const listeners = new Map();
  const eventHandlers = new Map();
  let id = 0;

  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && listeners.has(data.id)) {
      const { resolve, reject } = listeners.get(data.id);
      listeners.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }

    const handlers = eventHandlers.get(data.method) ?? [];
    handlers.forEach((handler) => handler(data.params));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => {
        listeners.set(callId, { resolve, reject });
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      return result.result.value;
    },
    on(method, handler) {
      const handlers = eventHandlers.get(method) ?? [];
      handlers.push(handler);
      eventHandlers.set(method, handlers);
    },
    close() {
      ws.close();
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
