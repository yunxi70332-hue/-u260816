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
  const metrics = {};

  // Vite may still be transforming modules on first load; wait until the
  // dimension annotations actually render before capturing the baseline.
  // CDP evaluates can race page settles in headless Chrome — retry them.
  const probePath = path.join(outputDir, "probe.png");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const probe = await captureAndAnalyze(cdp, probePath);
      if (probe.redPixels > 500) break;
    } catch (error) {
      if (attempt === 11) throw error;
    }
    await delay(1000);
  }

  metrics.default = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-default.png"));

  await wheelZoomOut(cdp, 6);
  await delay(1200);
  metrics.zoomOutMild = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-zoom-out-mild.png"));

  await wheelZoomOut(cdp, 10);
  await delay(1200);
  metrics.zoomOut = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-zoom-out.png"));

  await clickAriaButton(cdp, "视角回位");
  await delay(2000);
  metrics.refit = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-after-refit.png"));

  await wheelZoom(cdp, -14);
  await delay(1200);
  metrics.zoomIn2x = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-zoom-in-2x.png"));

  await wheelZoom(cdp, -14);
  await delay(1200);
  metrics.zoomIn4x = await captureAndAnalyze(cdp, path.join(outputDir, "dimensions-zoom-in-4x.png"));

  await clickButtonContaining(cdp, "双面岛台");
  await delay(3500);
  await captureScreenshot(cdp, path.join(outputDir, "dimensions-kitchen-island.png"));

  assert.ok(metrics.default.redPixels > 500, "default view must show dimension annotations");
  assert.ok(metrics.default.medianGlyphHeight >= 10, `default glyphs legible (got ${metrics.default.medianGlyphHeight}px; vertical rotated glyphs measure ~12px by design)`);
  // The bottom-most red pixel is the lowest dimension label, anchored in world
  // space; its distance from the view center scales linearly with camera zoom.
  // (The cluster bbox itself is pinned by a fixed canvas-corner UI badge.)
  const viewCenterY = metrics.default.canvasRect.top + metrics.default.canvasRect.height / 2;
  const cameraScale = (item) => (item.clusterBottom - viewCenterY) / (metrics.default.clusterBottom - viewCenterY);
  const glyphScale = (item) => item.medianGlyphHeight / metrics.default.medianGlyphHeight;
  for (const [name, item] of [["zoomOutMild", metrics.zoomOutMild], ["zoomOut", metrics.zoomOut]]) {
    assert.ok(cameraScale(item) < 0.95, `${name} must actually move the camera back (camera x${cameraScale(item).toFixed(3)})`);
    const drift = Math.abs(glyphScale(item) / cameraScale(item) - 1);
    assert.ok(
      drift <= 0.3,
      `glyph size must track camera zoom in ${name} (glyph x${glyphScale(item).toFixed(3)} vs camera x${cameraScale(item).toFixed(3)}, drift ${(drift * 100).toFixed(1)}%)`
    );
  }
  assert.ok(
    metrics.zoomOut.medianGlyphHeight <= metrics.zoomOutMild.medianGlyphHeight * 0.9,
    `labels must keep shrinking when zoomed far out (${metrics.zoomOut.medianGlyphHeight}px vs mild ${metrics.zoomOutMild.medianGlyphHeight}px)`
  );
  assert.ok(
    metrics.zoomIn2x.medianGlyphHeight >= metrics.default.medianGlyphHeight * 1.25,
    `labels must grow when zooming in (${metrics.zoomIn2x.medianGlyphHeight}px vs default ${metrics.default.medianGlyphHeight}px)`
  );
  assert.ok(
    metrics.zoomIn4x.avgGlyphSize >= metrics.zoomIn2x.avgGlyphSize * 0.98,
    `labels must not shrink when zoomed to minDistance (avg ${metrics.zoomIn4x.avgGlyphSize.toFixed(1)}px vs 2x ${metrics.zoomIn2x.avgGlyphSize.toFixed(1)}px)`
  );
  const refitDrift = Math.abs(metrics.refit.medianGlyphHeight / metrics.default.medianGlyphHeight - 1);
  assert.ok(refitDrift <= 0.15, `refit must restore default glyph size (drift ${(refitDrift * 100).toFixed(1)}%)`);

  console.log(JSON.stringify({ targetUrl, outputDir, metrics, screenshots: fs.readdirSync(outputDir).filter((name) => name.endsWith(".png")) }, null, 2));
  cdp.close();
} finally {
  chrome.kill("SIGKILL");
}

async function captureAndAnalyze(cdp, screenshotPath) {
  await captureScreenshot(cdp, screenshotPath);
  const metrics = await analyzeRedAnnotations(cdp, screenshotPath);
  console.error(`[metrics] ${path.basename(screenshotPath)}: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function analyzeRedAnnotations(cdp, screenshotPath) {
  const base64 = fs.readFileSync(screenshotPath).toString("base64");
  const canvasRect = await cdp.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
  })()`);
  assert.ok(canvasRect, "canvas must exist for annotation analysis");
  return cdp.evaluate(`(async () => {
    const rect = ${JSON.stringify(canvasRect)};
    const img = new Image();
    img.src = "data:image/png;base64," + ${JSON.stringify(base64)};
    await img.decode();
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    const rectLeft = Math.max(0, Math.min(width - 1, rect.left));
    const rectTop = Math.max(0, Math.min(height - 1, rect.top));
    const rectRight = Math.max(rectLeft + 1, Math.min(width, rect.left + rect.width));
    const rectBottom = Math.max(rectTop + 1, Math.min(height, rect.top + rect.height));
    const rectWidth = rectRight - rectLeft;
    const rectHeight = rectBottom - rectTop;
    const mask = new Uint8Array(rectWidth * rectHeight);
    for (let y = 0; y < rectHeight; y += 1) {
      for (let x = 0; x < rectWidth; x += 1) {
        const i = ((rectTop + y) * width + (rectLeft + x)) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 130 && r - g > 40 && r - b > 40) mask[y * rectWidth + x] = 1;
      }
    }
    const labels = new Int32Array(rectWidth * rectHeight);
    const components = [];
    const stack = [];
    let clusterMinX = rectWidth;
    let clusterMinY = rectHeight;
    let clusterMaxX = 0;
    let clusterMaxY = 0;
    let redPixels = 0;
    for (let seed = 0; seed < rectWidth * rectHeight; seed += 1) {
      if (!mask[seed] || labels[seed]) continue;
      const id = components.length + 1;
      let minX = rectWidth;
      let minY = rectHeight;
      let maxX = 0;
      let maxY = 0;
      let count = 0;
      stack.push(seed);
      labels[seed] = id;
      while (stack.length > 0) {
        const q = stack.pop();
        const x = q % rectWidth;
        const y = Math.floor(q / rectWidth);
        count += 1;
        redPixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < clusterMinX) clusterMinX = x;
        if (x > clusterMaxX) clusterMaxX = x;
        if (y < clusterMinY) clusterMinY = y;
        if (y > clusterMaxY) clusterMaxY = y;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= rectWidth || ny >= rectHeight) continue;
            const nq = ny * rectWidth + nx;
            if (mask[nq] && !labels[nq]) {
              labels[nq] = id;
              stack.push(nq);
            }
          }
        }
      }
      components.push({ minX, minY, maxX, maxY, count });
    }
    const glyphHeights = [];
    const lineLengths = [];
    let textBlobPixels = 0;
    for (const component of components) {
      const boxWidth = component.maxX - component.minX + 1;
      const boxHeight = component.maxY - component.minY + 1;
      const aspect = boxWidth / boxHeight;
      const fill = component.count / (boxWidth * boxHeight);
      if (boxHeight >= 5 && boxHeight <= 160 && boxWidth <= 220 && aspect > 0.25 && aspect < 4.5 && fill > 0.25) {
        glyphHeights.push(boxHeight);
        textBlobPixels += component.count;
      } else if ((aspect >= 6 || aspect <= 1 / 6) && boxWidth + boxHeight > 30) {
        lineLengths.push(Math.max(boxWidth, boxHeight));
      }
    }
    glyphHeights.sort((a, b) => a - b);
    lineLengths.sort((a, b) => a - b);
    const largest = components
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((component) => ({
        x: rectLeft + component.minX,
        y: rectTop + component.minY,
        w: component.maxX - component.minX + 1,
        h: component.maxY - component.minY + 1,
        px: component.count
      }));
    return {
      redPixels,
      componentCount: components.length,
      textBlobCount: glyphHeights.length,
      medianGlyphHeight: glyphHeights.length > 0 ? glyphHeights[Math.floor(glyphHeights.length / 2)] : 0,
      avgGlyphSize: glyphHeights.length > 0 ? Math.sqrt(textBlobPixels / glyphHeights.length) : 0,
      medianLineLength: lineLengths.length > 0 ? lineLengths[Math.floor(lineLengths.length / 2)] : 0,
      clusterHeight: clusterMaxY - clusterMinY + 1,
      clusterWidth: clusterMaxX - clusterMinX + 1,
      clusterTop: clusterMinY === rectHeight ? 0 : rectTop + clusterMinY,
      clusterBottom: clusterMaxY === 0 ? 0 : rectTop + clusterMaxY,
      canvasRect: { left: rectLeft, top: rectTop, width: rectWidth, height: rectHeight },
      largest
    };
  })()`);
}

async function clickAriaButton(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `button not found or disabled: ${label}`);
}

async function wheelZoom(cdp, notches) {
  const step = Math.sign(notches);
  for (let index = 0; index < Math.abs(notches); index += 1) {
    await wheelAtCanvasCenter(cdp, step * 100);
  }
}

async function wheelZoomOut(cdp, notches = 10) {
  for (let index = 0; index < notches; index += 1) {
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
