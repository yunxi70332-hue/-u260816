import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Visual check for the 3D dimension labels: captures the default view plus
// zoom-in / zoom-out states so label glyph sizes can be compared across zooms.
const rootDir = process.cwd();
const browserPathCandidates = [
  process.env.USM_BROWSER_PATH,
  process.env.USM_CHROME_PATH,
  path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1224", "chrome-win64", "chrome.exe"),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = browserPathCandidates.find((candidate) => fs.existsSync(candidate));
const targetUrl = process.env.USM_LOCAL_URL || "http://127.0.0.1:9011/";
const outputDir = path.join(rootDir, "output", "dimension-labels");
const windowSize = { width: 1600, height: 1000 };

fs.mkdirSync(outputDir, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(outputDir, "profile-"));

if (!chromePath) {
  throw new Error(`Chrome/Edge not found. Checked: ${browserPathCandidates.join(", ")}`);
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${windowSize.width},${windowSize.height}`,
    targetUrl
  ],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
);
const stderr = [];
chrome.stderr.on("data", (chunk) => stderr.push(String(chunk)));

try {
  const port = await waitForDevtoolsPort();
  const page = await waitForPage(port);
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: targetUrl });
  await delay(1500);
  await cdp.evaluate(`(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    return true;
  })()`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForCanvas(cdp);
  await delay(3500);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-default.png"));

  await wheelZoom(cdp, -14);
  await delay(1200);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-zoom-in-2x.png"));

  await wheelZoom(cdp, -14);
  await delay(1200);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-zoom-in-4x.png"));

  await wheelZoomOut(cdp);
  await delay(1200);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-zoom-out.png"));

  await clickButtonContaining(cdp, "双面岛台");
  await delay(3500);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-kitchen-island.png"));

  console.log(JSON.stringify({ targetUrl, outputDir, screenshots: fs.readdirSync(outputDir).filter((name) => name.endsWith(".png")) }, null, 2));
  cdp.close();
} finally {
  chrome.kill("SIGKILL");
}

async function wheelZoom(cdp, notches) {
  const step = Math.sign(notches);
  for (let index = 0; index < Math.abs(notches); index += 1) {
    await wheelAtCanvasCenter(cdp, step * 100);
  }
}

async function wheelZoomOut(cdp) {
  for (let index = 0; index < 10; index += 1) {
    await wheelAtCanvasCenter(cdp, 600);
  }
}

async function wheelAtCanvasCenter(cdp, deltaY) {
  const canvasPoint = await cdp.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.45 };
  })()`);
  assert.ok(canvasPoint, "canvas must exist for wheel zoom");
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvasPoint.x,
    y: canvasPoint.y,
    deltaX: 0,
    deltaY,
    pointerType: "mouse"
  });
  await delay(30);
}

async function clickButtonContaining(cdp, text) {
  const clicked = await cdp.evaluate(`(() => {
    const targetText = ${JSON.stringify(text)};
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.textContent.replace(/\\s+/g, " ").trim().includes(targetText));
    if (!button || button.disabled) return false;
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `button not found or disabled: ${text}`);
}

async function waitForCanvas(cdp) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await cdp.evaluate(`(() => ({
      title: document.title,
      canvasCount: document.querySelectorAll("canvas").length
    }))()`);
    if (state.title === "USM 本地模块搭建" && state.canvasCount > 0) return state;
    await delay(300);
  }
  throw new Error("Timed out waiting for the builder canvas");
}

async function captureScreenshot(cdp, screenshotPath) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

async function waitForDevtoolsPort() {
  const file = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const [portText] = text.split(/\r?\n/);
      const port = Number(portText);
      if (Number.isFinite(port)) return port;
    } catch {
      await delay(120);
    }
  }
  throw new Error("Timed out waiting for Chrome DevTools port");
}

async function waitForPage(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      await delay(200);
    }
  }
  throw new Error("Timed out waiting for Chrome page endpoint");
}

async function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const listeners = new Map();
  let id = 0;

  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && listeners.has(data.id)) {
      const { resolve, reject } = listeners.get(data.id);
      listeners.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
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
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails.exception?.description
          ?? result.exceptionDetails.exception?.value
          ?? result.exceptionDetails.text
          ?? "Runtime.evaluate failed";
        throw new Error(detail);
      }
      return result.result.value;
    },
    close() {
      ws.close();
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
