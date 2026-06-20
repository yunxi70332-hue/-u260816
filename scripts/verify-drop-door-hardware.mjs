import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.USM_APP_URL ?? "http://127.0.0.1:9011";
const edgePath = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = path.resolve("artifacts/drop-door-verification");

function dropDoorConfig(doorOpen, doorState) {
  const cell = {
    kind: "metalBackModule",
    enabled: true,
    frontAccessory: "dropDoor",
    doorOpen,
    doorState,
    fitting: "none"
  };

  return {
    depth: 350,
    depthSegments: [350],
    columnWidths: [750],
    rowHeights: [350],
    panelColor: "#f4f2eb",
    colorScope: "all",
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    cells: [[cell]],
    planCells: [[[cell]]],
    workSurfaces: []
  };
}

async function waitForCanvas(page) {
  await page.waitForSelector("canvas", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    try {
      return canvas.toDataURL("image/png").length > 1_000;
    } catch {
      return false;
    }
  }, { timeout: 25_000 });
  await page.waitForTimeout(1_300);
}

async function installConfig(page, config) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate((nextConfig) => {
    window.localStorage.setItem("usm-local-builder-config", JSON.stringify(nextConfig));
    window.sessionStorage.clear();
  }, config);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForCanvas(page);
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: edgePath
});
const page = await browser.newPage({
  viewport: { width: 1000, height: 900 },
  deviceScaleFactor: 1
});

const states = [
  ["closed", 0, "closed"],
  ["half", 0.48, "half"],
  ["open", 1, "open"]
];

for (const [name, doorOpen, doorState] of states) {
  await installConfig(page, dropDoorConfig(doorOpen, doorState));
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  await page.locator("canvas").first().screenshot({ path: path.join(outputDir, `${name}-canvas.png`) });
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas
      ? { width: canvas.width, height: canvas.height, dataUrlLength: canvas.toDataURL("image/png").length }
      : null;
  });
  console.log(`${name}: ${JSON.stringify(canvasInfo)}`);
}

await browser.close();
