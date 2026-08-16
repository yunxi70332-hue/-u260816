import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getCdpWaitOptionsFromEnv, prepareCdpWaitTracking, waitForCdpLoadState } from "./cdp-wait-state.mjs";

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
const outputDir = path.join(rootDir, "output", "local-cdp");
const initialScreenshotPath = path.join(outputDir, "local-initial-desktop.png");
const kitchenIslandScreenshotPath = path.join(outputDir, "local-kitchen-island-desktop.png");
const kitchenIslandExpandedScreenshotPath = path.join(outputDir, "local-kitchen-island-expanded-desktop.png");
const mobileTrayScreenshotPath = path.join(outputDir, "local-mobile-tray-desktop.png");
const frameTopSelectionScreenshotPath = path.join(outputDir, "local-frame-top-selection-desktop.png");
const dropDoorTwoTrayScreenshotPath = path.join(outputDir, "local-drop-door-two-mobile-trays-desktop.png");
const glassScreenshotPath = path.join(outputDir, "local-glass-shell-desktop.png");
const mobileScreenshotPath = path.join(outputDir, "local-glass-shell-mobile.png");
const waitOptions = getCdpWaitOptionsFromEnv({
  ...process.env,
  USM_WAIT_UNTIL: process.env.USM_WAIT_UNTIL ?? "load"
});

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
    "--window-size=1280,960",
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
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");
  await prepareCdpWaitTracking(cdp);

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

  await cdp.send("Page.navigate", { url: targetUrl });
  await waitForCdpLoadState(cdp, waitOptions);
  await cdp.evaluate(`(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    return true;
  })()`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForCdpLoadState(cdp, waitOptions);

  const initialState = await waitForPageState(
    cdp,
    (state) => state.title === "USM 本地模块搭建" && state.bodyText.includes("结构") && state.canvasCount > 0,
    "initial page canvas",
    25000,
    events
  );
  assert.equal(initialState.title, "USM 本地模块搭建", "page title");
  assert.ok(initialState.canvasInfo?.hasWebgl, "local page must expose a WebGL canvas");
  assert.ok(initialState.canvasInfo?.dataUrlLength > 1000, "desktop canvas should produce a non-empty PNG data URL");
  await captureScreenshot(cdp, initialScreenshotPath);

  await clickButtonContaining(cdp, "双面岛台");
  const kitchenIslandState = await waitForPageState(
    cdp,
    (state) => (
      state.canvasInfo?.dataUrlLength > 1000
      && state.bodyText.includes("1773 x 740 x 1073 mm")
      && state.storedConfig?.columnWidths?.length === 3
      && state.storedConfig?.rowHeights?.length === 2
      && state.storedConfig?.depthSegments?.length === 3
      && state.storedConfig?.depth === 1050
      && Array.isArray(state.storedConfig?.workSurfaces)
      && state.storedConfig.workSurfaces.length === 0
    ),
    "kitchen island preset canvas",
    18000,
    events
  );
  assert.deepEqual(kitchenIslandState.storedConfig.columnWidths, [500, 750, 500], "kitchen island CDP column widths");
  assert.deepEqual(kitchenIslandState.storedConfig.rowHeights, [350, 350], "kitchen island CDP row heights");
  assert.deepEqual(kitchenIslandState.storedConfig.depthSegments, [350, 350, 350], "kitchen island CDP depth segments");
  assert.ok(kitchenIslandState.canvasInfo?.hasWebgl, "kitchen island desktop must expose a WebGL canvas");
  assert.ok(kitchenIslandState.canvasInfo?.dataUrlLength > 1000, "kitchen island desktop canvas should produce a non-empty PNG data URL");
  await captureScreenshot(cdp, kitchenIslandScreenshotPath);

  await clickFrontExpandHint(cdp, { row: 0, column: 0, depthIndex: 0 });
  const kitchenIslandExpandedState = await waitForPageState(
    cdp,
    (state) => (
      state.canvasInfo?.dataUrlLength > 1000
      && state.bodyText.includes("1773 x 740 x 1423 mm")
      && state.storedConfig?.depthSegments?.length === 4
      && state.storedConfig?.depth === 1400
      && state.storedConfig?.planCells?.[0]?.[0]?.[0]?.kind === "metalBackModule"
      && state.storedConfig?.planCells?.[0]?.[1]?.[0]?.kind === "sideOpenDoor"
      && state.storedConfig?.planCells?.[1]?.[0]?.[0]?.kind === "metalBackModule"
      && state.storedConfig?.planCells?.[1]?.[0]?.[0]?.fitting === "none"
      && state.storedConfig?.planCells?.[1]?.[1]?.[0]?.kind === "sideOpenDoor"
      && state.storedConfig?.planCells?.[1]?.[1]?.[0]?.fitting === "none"
      && state.storedConfig?.planCells?.[0]?.[3]?.[0]?.faceSide === "back"
      && state.storedConfig?.planCells?.[0]?.[3]?.[0]?.structure?.panels?.back === "none"
    ),
    "kitchen island front expansion",
    18000,
    events
  );
  assert.deepEqual(kitchenIslandExpandedState.storedConfig.depthSegments, [350, 350, 350, 350], "kitchen island front expansion CDP depth segments");
  assert.equal(kitchenIslandExpandedState.storedConfig.planCells[0][0][0].doorState, undefined, "kitchen island expanded lower shell clears door state");
  assert.equal(kitchenIslandExpandedState.storedConfig.planCells[0][0][0].faceSide, undefined, "kitchen island expanded lower shell clears face side");
  assert.equal(kitchenIslandExpandedState.storedConfig.planCells[1][0][0].drawerPull, undefined, "kitchen island expanded upper shell clears drawer pull");
  assert.equal(kitchenIslandExpandedState.storedConfig.planCells[1][0][0].faceSide, undefined, "kitchen island expanded upper shell clears face side");
  assert.ok(kitchenIslandExpandedState.canvasInfo?.hasWebgl, "expanded kitchen island desktop must expose a WebGL canvas");
  await captureScreenshot(cdp, kitchenIslandExpandedScreenshotPath);

  await clickCellFrontFaceLower(cdp, { row: 0, column: 0, depthIndex: 0 });
  const kitchenIslandFrontReselectState = await waitForPageState(
    cdp,
    (state) => (
      state.canvasInfo?.dataUrlLength > 1000
      && state.storedConfig?.depthSegments?.length === 4
      && state.bodyText.includes("1 列 / 1 深度 / 1 层")
    ),
    "kitchen island selected front cell remains selectable",
    8000,
    events
  );
  assert.ok(kitchenIslandFrontReselectState.bodyText.includes("1 列 / 1 深度 / 1 层"), "clicking the selected front cell must not pass through to a rear depth segment");

  for (const target of ["dropDoorLock", "dropDoorLeft", "dropDoorRight"]) {
    await installInteractionConfig(cdp, createInteractionConfig(
      { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", doorOpen: 0, doorState: "closed", fitting: "none" },
      { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", doorOpen: 0, doorState: "closed", fitting: "none" }
    ));
    await waitForPageState(
      cdp,
      (state) => state.canvasInfo?.dataUrlLength > 1000
        && state.storedConfig?.planCells?.[0]?.[0]?.[0]?.frontAccessory === "dropDoor",
      `drop door interaction setup ${target}`,
      12000,
      events
    );
    await delay(800);
    if (target === "dropDoorLock") {
      await captureScreenshot(cdp, path.join(outputDir, "local-drop-door-interaction-desktop.png"));
    }
    await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, target);
    const doorDragState = await waitForPageState(
      cdp,
      (state) => (
        state.canvasInfo?.dataUrlLength > 1000
        && (state.storedConfig?.planCells?.[0]?.[0]?.[0]?.doorOpen ?? 0) > 0.08
        && (state.storedConfig?.planCells?.[0]?.[1]?.[0]?.doorOpen ?? 0) === 0
      ),
      `drop door draggable from ${target}`,
      8000,
      events
    );
    assert.ok((doorDragState.storedConfig.planCells[0][0][0].doorOpen ?? 0) > 0.08, `front drop door should open from ${target}`);
    assert.equal(doorDragState.storedConfig.planCells[0][1][0].doorOpen ?? 0, 0, `drop door drag from ${target} must not move the rear depth cell`);
  }

  await installInteractionConfig(cdp, createSideBySideDoorInteractionConfig());
  await waitForPageState(
    cdp,
    (state) => state.canvasInfo?.dataUrlLength > 1000
      && state.storedConfig?.planCells?.[0]?.[0]?.[1]?.frontAccessory === "dropDoor",
    "side-by-side drop door interaction setup",
    12000,
    events
  );
  await delay(800);
  await dragCellControl(cdp, { row: 0, column: 1, depthIndex: 0 }, "dropDoorLock");
  const selectedRightCellText = "2 \u5217 / 1 \u6df1\u5ea6 / 1 \u5c42";
  const sideBySideDoorDragState = await waitForPageState(
    cdp,
    (state) => (
      state.canvasInfo?.dataUrlLength > 1000
      && (state.storedConfig?.planCells?.[0]?.[0]?.[1]?.doorOpen ?? 0) > 0.08
      && (state.storedConfig?.planCells?.[0]?.[0]?.[0]?.doorOpen ?? 0) === 0
      && state.bodyText.includes(selectedRightCellText)
    ),
    "right drop door does not activate left cell",
    8000,
    events
  );
  assert.ok((sideBySideDoorDragState.storedConfig.planCells[0][0][1].doorOpen ?? 0) > 0.08, "right drop door should open");
  assert.equal(sideBySideDoorDragState.storedConfig.planCells[0][0][0].doorOpen ?? 0, 0, "right drop door drag must not move the left cell");
  assert.ok(sideBySideDoorDragState.bodyText.includes(selectedRightCellText), "right drop door interaction should select the right cell");

  for (const target of ["rimmedDrawerLock", "rimmedDrawerLeft", "rimmedDrawerRight"]) {
    await installInteractionConfig(cdp, createInteractionConfig(
      { kind: "metalBackModule", enabled: true, fitting: "rimmedDrawer", drawerPull: 0 },
      { kind: "metalBackModule", enabled: true, fitting: "rimmedDrawer", drawerPull: 0 }
    ));
    await waitForPageState(
      cdp,
      (state) => state.canvasInfo?.dataUrlLength > 1000
        && state.storedConfig?.planCells?.[0]?.[0]?.[0]?.fitting === "rimmedDrawer",
      `rimmed drawer interaction setup ${target}`,
      12000,
      events
    );
    await delay(800);
    if (target === "rimmedDrawerLock") {
      await captureScreenshot(cdp, path.join(outputDir, "local-rimmed-drawer-interaction-desktop.png"));
    }
    await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, target);
    const drawerDragState = await waitForPageState(
      cdp,
      (state) => (
        state.canvasInfo?.dataUrlLength > 1000
        && (state.storedConfig?.planCells?.[0]?.[0]?.[0]?.drawerPull ?? 0) >= 0.5
        && (state.storedConfig?.planCells?.[0]?.[1]?.[0]?.drawerPull ?? 0) === 0
      ),
      `rimmed drawer draggable from ${target}`,
      8000,
      events
    );
    assert.ok((drawerDragState.storedConfig.planCells[0][0][0].drawerPull ?? 0) >= 0.5, `front rimmed drawer should pull from ${target}`);
    assert.equal(drawerDragState.storedConfig.planCells[0][1][0].drawerPull ?? 0, 0, `drawer drag from ${target} must not move the rear depth cell`);
  }

  await clickButtonContaining(cdp, "750 单格");
  const baseState = await waitForPageState(
    cdp,
      (state) => (
        state.bodyText.includes("结构")
        && state.canvasInfo?.dataUrlLength > 1000
        && state.kindButtons?.dropDoor === null
        && state.kindButtons?.pullOutShelf === null
        && state.kindButtons?.displayTray === null
        && state.kindButtons?.fixedShelf === null
        && state.kindButtons?.glassShelf === null
      ),
    "base single-cell canvas",
    16000,
    events
  );
  assert.equal(baseState.kindButtons.pullOutShelf, null, "pull-out shelf must not appear as a module type");
  assert.equal(baseState.kindButtons.dropDoor, null, "drop door must not appear as a module type");
  assert.equal(baseState.kindButtons.displayTray, null, "fixed tray must not appear as a module type");
  assert.equal(baseState.kindButtons.fixedShelf, null, "fixed shelf must not appear as a module type");
  assert.equal(baseState.kindButtons.glassShelf, null, "glass shelf must not appear as a module type");

  await clickButtonContaining(cdp, "框架");
  const frameBeforeSelection = await waitForPageState(
    cdp,
    (state) => state.bodyText.includes("当前零件") && state.canvasInfo?.dataUrlLength > 1000,
    "single-cell frame tab",
    12000,
    events
  );
  await clickCellTopPanel(cdp, { row: 0, column: 0, depthIndex: 0 });
  const frameTopSelectionState = await waitForPageState(
    cdp,
    (state) => (
      state.selectedFramePart === "panel:0:0:0:top"
      && state.selectedPanel === "0:0:0:top"
      && state.bodyText.includes("第 1 列 · 第 1 深度 · 第 1 层 · 顶面")
      && state.bodyText.includes("零件类型")
      && state.bodyText.includes("面板")
      && state.canvasInfo?.dataUrlLength > 1000
    ),
    "top panel frame selection",
    12000,
    events
  );
  assert.notEqual(frameTopSelectionState.canvasInfo.dataUrlHash, frameBeforeSelection.canvasInfo.dataUrlHash, "top panel selection changes rendered canvas pixels");
  await captureScreenshot(cdp, frameTopSelectionScreenshotPath);

  await clickButtonContaining(cdp, "配件");
  const fittingsState = await waitForPageState(
    cdp,
    (state) => (
      state.bodyText.includes("内部配件")
      && state.fittingButtons?.mobileTray?.disabled === false
      && state.kindButtons?.pullOutShelf === null
    ),
    "mobile tray fitting controls",
    12000,
    events
  );
  assert.equal(fittingsState.kindButtons.pullOutShelf, null, "pull-out shelf must stay out of module type list on fittings tab");
  assert.ok(fittingsState.fittingButtons.mobileTray?.title.includes("移动托盘"), "mobile tray should appear as an interior fitting");
  await clickButtonContaining(cdp, "移动托盘");
  const mobileTrayState = await waitForPageState(
    cdp,
    (state) => {
      const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
      const trays = mobileTrays(cell);
      return state.canvasInfo?.dataUrlLength > 1000
        && cell?.kind === "metalBackModule"
        && cell?.fitting === "none"
        && trays.length === 1
        && trays[0]?.kind === "mobileTray"
        && trays[0]?.pull === 1
        && cell?.structure?.panels?.left === "metal"
        && cell?.structure?.panels?.right === "metal"
        && cell?.structure?.panels?.bottom === "metal";
    },
    "mobile tray fitting selection",
    12000,
    events
  );
  const selectedMobileTrayCell = mobileTrayState.storedConfig.planCells[0][0][0];
  assert.equal(selectedMobileTrayCell.fitting, "none", "mobile tray should no longer store as fitting");
  assert.equal(mobileTrays(selectedMobileTrayCell).length, 1, "mobile tray should store as one interior accessory");
  assert.equal(selectedMobileTrayCell.structure.panels.left, "metal", "mobile tray should add left metal panel");
  assert.equal(selectedMobileTrayCell.structure.panels.right, "metal", "mobile tray should add right metal panel");
  assert.equal(selectedMobileTrayCell.structure.panels.bottom, "metal", "mobile tray should add bottom metal panel");
  await captureScreenshot(cdp, mobileTrayScreenshotPath);

  for (const target of ["mobileTrayLock", "mobileTrayLeft", "mobileTrayRight", "mobileTrayLeftHalo", "mobileTrayRightHalo"]) {
    await installInteractionConfig(cdp, createInteractionConfig(
      {
        kind: "metalBackModule",
        enabled: true,
        fitting: "none",
        interiorAccessories: [{ id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 175, pull: 0 }],
        structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
      },
      {
        kind: "metalBackModule",
        enabled: true,
        fitting: "none",
        interiorAccessories: [{ id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 175, pull: 0 }],
        structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
      }
    ));
    await waitForPageState(
      cdp,
      (state) => {
        const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
        return state.canvasInfo?.dataUrlLength > 1000
          && mobileTrayById(cell, "mobileTray-1")?.pull === 0;
      },
      `mobile tray interaction setup ${target}`,
      12000,
      events
    );
    await delay(800);
    await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, target);
    const trayDragState = await waitForPageState(
      cdp,
      (state) => (
        state.canvasInfo?.dataUrlLength > 1000
        && (mobileTrayById(state.storedConfig?.planCells?.[0]?.[0]?.[0], "mobileTray-1")?.pull ?? 0) >= 0.5
        && (mobileTrayById(state.storedConfig?.planCells?.[0]?.[1]?.[0], "mobileTray-1")?.pull ?? 0) === 0
        && state.selectedAccessory?.id === "mobileTray-1"
      ),
      `mobile tray draggable from ${target}`,
      8000,
      events
    );
    assert.ok((mobileTrayById(trayDragState.storedConfig.planCells[0][0][0], "mobileTray-1")?.pull ?? 0) >= 0.5, `front mobile tray should pull from ${target}`);
    assert.equal(mobileTrayById(trayDragState.storedConfig.planCells[0][1][0], "mobileTray-1")?.pull ?? 0, 0, `mobile tray drag from ${target} must not move the rear depth cell`);
    assert.equal(trayDragState.selectedAccessory.id, "mobileTray-1", `front mobile tray should become the selected accessory from ${target}`);
  }

  await clickCellFrontFaceLower(cdp, { row: 0, column: 0, depthIndex: 0 });
  const traySelectionClearedByCellState = await waitForPageState(
    cdp,
    (state) => state.canvasInfo?.dataUrlLength > 1000
      && state.selectedAccessory?.id === ""
      && (mobileTrayById(state.storedConfig?.planCells?.[0]?.[0]?.[0], "mobileTray-1")?.pull ?? 0) >= 0.5,
    "mobile tray selected accessory clears on normal cell click",
    8000,
    events
  );
  assert.equal(traySelectionClearedByCellState.selectedAccessory.id, "", "clicking the cell body should clear selected mobile tray highlight");

  await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, "mobileTrayLock");
  await waitForPageState(
    cdp,
    (state) => state.canvasInfo?.dataUrlLength > 1000 && state.selectedAccessory?.id === "mobileTray-1",
    "mobile tray selected again before blank click",
    8000,
    events
  );
  await clickCanvasBlank(cdp);
  const traySelectionClearedByBlankState = await waitForPageState(
    cdp,
    (state) => state.canvasInfo?.dataUrlLength > 1000 && state.selectedAccessory?.id === "",
    "mobile tray selected accessory clears on blank click",
    8000,
    events
  );
  assert.equal(traySelectionClearedByBlankState.selectedAccessory.id, "", "clicking blank canvas should clear selected mobile tray highlight");

  await installInteractionConfig(cdp, createInteractionConfig(
    {
      kind: "metalBackModule",
      enabled: true,
      frontAccessory: "dropDoor",
      doorOpen: 0,
      doorState: "closed",
      fitting: "none",
      interiorAccessories: [
        { id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 120, pull: 0 },
        { id: "mobileTray-2", kind: "mobileTray", mountHeightMm: 260, pull: 0 }
      ],
      structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
    },
    {
      kind: "metalBackModule",
      enabled: true,
      fitting: "none",
      interiorAccessories: [
        { id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 120, pull: 0 },
        { id: "mobileTray-2", kind: "mobileTray", mountHeightMm: 260, pull: 0 }
      ],
      structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
    }
  ));
  const comboInitialState = await waitForPageState(
    cdp,
    (state) => {
      const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
      return state.canvasInfo?.dataUrlLength > 1000
        && cell?.frontAccessory === "dropDoor"
        && cell?.fitting === "none"
        && mobileTrays(cell).length === 2
        && mobileTrayById(cell, "mobileTray-1")?.pull === 0
        && mobileTrayById(cell, "mobileTray-2")?.pull === 0;
    },
    "drop door with two mobile trays setup",
    12000,
    events
  );
  await delay(800);
  await captureScreenshot(cdp, dropDoorTwoTrayScreenshotPath);
  await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, "dropDoorLock");
  const comboDoorDragState = await waitForPageState(
    cdp,
    (state) => {
      const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
      return state.canvasInfo?.dataUrlLength > 1000
        && (cell?.doorOpen ?? 0) > 0.08
        && (mobileTrayById(cell, "mobileTray-1")?.pull ?? 0) === 0
        && (mobileTrayById(cell, "mobileTray-2")?.pull ?? 0) === 0;
    },
    "drop door drag does not change mobile trays",
    8000,
    events
  );
  let comboTrayDragState = null;
  for (const target of ["mobileTrayLock:mobileTray-2", "mobileTrayRightHalo:mobileTray-2"]) {
    await installInteractionConfig(cdp, createInteractionConfig(
      {
        kind: "metalBackModule",
        enabled: true,
        frontAccessory: "dropDoor",
        doorOpen: 0.48,
        doorState: "half",
        fitting: "none",
        interiorAccessories: [
          { id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 120, pull: 0 },
          { id: "mobileTray-2", kind: "mobileTray", mountHeightMm: 260, pull: 0 }
        ],
        structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
      },
      {
        kind: "metalBackModule",
        enabled: true,
        fitting: "none",
        interiorAccessories: [
          { id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 120, pull: 0 },
          { id: "mobileTray-2", kind: "mobileTray", mountHeightMm: 260, pull: 0 }
        ],
        structure: { panels: { left: "metal", right: "metal", bottom: "metal" } }
      }
    ));
    await waitForPageState(
      cdp,
      (state) => {
        const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
        return state.canvasInfo?.dataUrlLength > 1000
          && cell?.frontAccessory === "dropDoor"
          && (cell?.doorOpen ?? 0) > 0.08
          && mobileTrayById(cell, "mobileTray-1")?.pull === 0
          && mobileTrayById(cell, "mobileTray-2")?.pull === 0;
      },
      `opened drop door and two trays setup ${target}`,
      12000,
      events
    );
    await dragCellControl(cdp, { row: 0, column: 0, depthIndex: 0 }, target);
    comboTrayDragState = await waitForPageState(
      cdp,
      (state) => {
        const cell = state.storedConfig?.planCells?.[0]?.[0]?.[0];
        return state.canvasInfo?.dataUrlLength > 1000
          && cell?.frontAccessory === "dropDoor"
          && (cell?.doorOpen ?? 0) > 0.08
          && (mobileTrayById(cell, "mobileTray-1")?.pull ?? 0) === 0
          && (mobileTrayById(cell, "mobileTray-2")?.pull ?? 0) >= 0.5
          && state.selectedAccessory?.id === "mobileTray-2";
      },
      `opened drop door and second mobile tray independent drag ${target}`,
      8000,
      events
    );
    assert.equal(comboTrayDragState.selectedAccessory.id, "mobileTray-2", `dragging the second mobile tray from ${target} should select only that tray`);
  }

  await clickButtonContaining(cdp, "结构");
  await clickButtonContaining(cdp, "750 单格");

  await clickButtonContaining(cdp, "含玻璃板模块");
  const glassState = await waitForPageState(
    cdp,
    (state) => {
      const buttons = state.kindButtons ?? {};
      return state.canvasInfo?.dataUrlLength > 1000
        && buttons.glassModule?.className.includes("active")
        && buttons.dropDoor === null
        && buttons.pullOutShelf === null
        && buttons.displayTray === null
        && buttons.fixedShelf === null
        && buttons.glassShelf === null;
    },
    "glass shell accessory lockout",
    16000,
    events
  );
  assert.equal(glassState.kindButtons.dropDoor, null, "drop door should not appear as a module type");
  assert.equal(glassState.kindButtons.pullOutShelf, null, "pull-out shelf should not appear as a module type");
  await captureScreenshot(cdp, glassScreenshotPath);

  await clickButtonContaining(cdp, "配件");
  const glassFittingState = await waitForPageState(
    cdp,
    (state) => (
      state.bodyText.includes("内部配件")
      && state.canvasInfo?.dataUrlLength > 1000
      && state.storedConfig?.planCells?.[0]?.[0]?.[0]?.kind === "glassPanelModule"
      && state.fittingButtons?.mobileTray?.disabled === true
      && state.fittingButtons?.dropDoor?.disabled === true
      && state.fittingButtons?.displayTray?.disabled === true
      && state.fittingButtons?.fixedShelf?.disabled === true
      && state.fittingButtons?.glassShelf?.disabled === false
      && state.fittingButtons?.glassShelf?.className.includes("status-needsHardwareCheck")
    ),
    "glass shell mobile tray fitting lockout",
    12000,
    events
  );
  assert.ok(glassFittingState.fittingButtons.mobileTray.title.includes("不能承载移动托盘导轨"), "mobile tray should explain missing rail support");
  assert.ok(glassFittingState.fittingButtons.dropDoor.title.includes("玻璃侧板/玻璃箱体"), "drop door should explain glass shell conflict");
  assert.ok(glassFittingState.fittingButtons.displayTray.title.includes("不能直接安装普通固定托盘"), "fixed tray should explain glass shell conflict");
  assert.ok(glassFittingState.fittingButtons.glassShelf.title.includes("夹件"), "glass shelf should remain available with hardware warning");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 760,
    deviceScaleFactor: 1,
    mobile: true
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForCdpLoadState(cdp, waitOptions);
  const mobileState = await waitForPageState(
    cdp,
    (state) => (
      state.canvasCount > 0
      && state.canvasInfo?.dataUrlLength > 1000
      && state.bodyText.includes("结构")
    ),
    "mobile glass-shell canvas",
    18000,
    events
  );
  assert.ok(mobileState.canvasInfo?.hasWebgl, "mobile viewport must expose a WebGL canvas");
  assert.ok(mobileState.canvasInfo?.dataUrlLength > 1000, "mobile canvas should produce a non-empty PNG data URL");
  await captureScreenshot(cdp, mobileScreenshotPath);

  console.log(JSON.stringify({
    targetUrl,
    waitOptions,
    initialState,
    kitchenIslandState,
    kitchenIslandExpandedState,
    kitchenIslandFrontReselectState,
    baseState,
    fittingsState,
    mobileTrayState,
    comboInitialState,
    comboTrayDragState,
    comboDoorDragState,
    glassState,
    glassFittingState,
    accessoryChecks: {
      glassShellActive: glassState.kindButtons.glassModule?.className.includes("active"),
      dropDoorBlocked: glassFittingState.fittingButtons.dropDoor?.disabled === true,
      pullOutShelfRemovedFromModules: glassState.kindButtons.pullOutShelf === null,
      mobileTrayBlocked: glassFittingState.fittingButtons.mobileTray?.disabled === true,
      displayTrayBlocked: glassFittingState.fittingButtons.displayTray?.disabled === true,
      fixedShelfBlocked: glassFittingState.fittingButtons.fixedShelf?.disabled === true,
      glassShelfStillAvailable: glassFittingState.fittingButtons.glassShelf?.disabled === false
    },
    mobileState,
    events: events.slice(-20),
    stderr: stderr.join("").slice(0, 2000),
    screenshots: {
      initial: initialScreenshotPath,
      kitchenIsland: kitchenIslandScreenshotPath,
      kitchenIslandExpanded: kitchenIslandExpandedScreenshotPath,
      mobileTray: mobileTrayScreenshotPath,
      dropDoorTwoTray: dropDoorTwoTrayScreenshotPath,
      glassShell: glassScreenshotPath,
      mobile: mobileScreenshotPath
    }
  }, null, 2));
  cdp.close();
} finally {
  chrome.kill("SIGKILL");
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
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails.exception?.description
          ?? result.exceptionDetails.exception?.value
          ?? result.exceptionDetails.text
          ?? "Runtime.evaluate failed";
        throw new Error(detail);
      }
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

async function getPageState(cdp) {
  return await cdp.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    const scene = document.querySelector(".scene-canvas");
    let canvasInfo = null;
    if (canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      let dataUrlLength = 0;
      let dataUrl = "";
      try {
        dataUrl = canvas.toDataURL("image/png");
        dataUrlLength = dataUrl.length;
      } catch {
        dataUrlLength = -1;
      }
      const dataUrlHash = hashString(dataUrlLength > 0 ? dataUrl : "");
      canvasInfo = {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        hasWebgl: Boolean(gl),
        dataUrlLength,
        dataUrlHash
      };
    }
    const toButtonState = (button) => ({
      text: button.innerText.replace(/\\s+/g, " ").trim(),
      disabled: button.disabled,
      title: button.title,
      className: String(button.className)
    });
    const kindButtons = Array.from(document.querySelectorAll("button.kind-button")).map(toButtonState);
    const fittingButtons = Array.from(document.querySelectorAll("button.toggle")).map(toButtonState);
    const byKindText = (needle) => kindButtons.find((button) => button.text.includes(needle)) ?? null;
    const byFittingText = (needle) => fittingButtons.find((button) => button.text.includes(needle)) ?? null;
    function hashString(value) {
      let hash = 0;
      for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
      }
      return hash;
    }
    return {
      title: document.title,
      href: location.href,
      canvasCount: document.querySelectorAll("canvas").length,
      canvasInfo,
      selectedAccessory: {
        id: scene?.dataset?.selectedAccessory ?? "",
        cell: scene?.dataset?.selectedAccessoryCell ?? ""
      },
      selectedFramePart: scene?.dataset?.selectedFramePart ?? "",
      selectedPanel: scene?.dataset?.selectedPanel ?? "",
      storedConfig: (() => {
        try {
          return JSON.parse(window.localStorage.getItem("usm-local-builder-config") || "null");
        } catch {
          return null;
        }
      })(),
      bodyText: document.body.innerText.slice(0, 3500),
      diagnostics: {
        readyState: document.readyState,
        rootLength: document.querySelector("#root")?.innerHTML.length ?? -1,
        scriptSrcs: Array.from(document.scripts).map((script) => script.src || script.textContent?.slice(0, 80) || ""),
        htmlStart: document.documentElement.outerHTML.slice(0, 1200)
      },
      kindButtonTexts: kindButtons.map((button) => button.text),
      fittingButtonTexts: fittingButtons.map((button) => button.text),
      kindButtons: {
        glassModule: byKindText("含玻璃板模块"),
        dropDoor: byKindText("下翻门"),
        pullOutShelf: byKindText("拉出搁板"),
        displayTray: byKindText("固定托盘"),
        fixedShelf: byKindText("固定层板"),
        glassShelf: byKindText("玻璃搁板")
      },
      fittingButtons: {
        dropDoor: byFittingText("下翻门"),
        flipUpDoor: byFittingText("上翻门"),
        glassDoor: byFittingText("玻璃门"),
        mobileTray: byFittingText("移动托盘"),
        displayTray: byFittingText("固定托盘"),
        fixedShelf: byFittingText("固定层板"),
        glassShelf: byFittingText("玻璃搁板"),
        rimmedDrawer: byFittingText("带围边抽屉"),
        none: byFittingText("无")
      }
    };
  })()`);
}

async function waitForPageState(cdp, predicate, label, timeoutMs = 12000, events = []) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await getPageState(cdp);
    if (predicate(lastState)) return lastState;
    await delay(250);
  }

  throw new Error(`${label} did not become ready. Last state: ${JSON.stringify(lastState, null, 2)}\nRecent events: ${JSON.stringify(events.slice(-30), null, 2)}`);
}

function createInteractionConfig(frontCell, backCell) {
  const front = { ...frontCell };
  const back = { ...backCell };
  return {
    depth: 1000,
    depthSegments: [500, 500],
    columnWidths: [750],
    rowHeights: [350],
    panelColor: "#f4f2eb",
    colorScope: "all",
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    cells: [[{ ...front }]],
    planCells: [[[front], [back]]],
    workSurfaces: []
  };
}

function createSideBySideDoorInteractionConfig() {
  const left = { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", doorOpen: 0, doorState: "closed", fitting: "none" };
  const right = { ...left };
  return {
    depth: 500,
    depthSegments: [500],
    columnWidths: [500, 500],
    rowHeights: [350],
    panelColor: "#f4f2eb",
    colorScope: "all",
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    cells: [[{ ...left }, { ...right }]],
    planCells: [[[left, right]]],
    workSurfaces: []
  };
}

function mobileTrays(cell) {
  return Array.isArray(cell?.interiorAccessories)
    ? cell.interiorAccessories.filter((item) => item?.kind === "mobileTray")
    : [];
}

function mobileTrayById(cell, id) {
  return mobileTrays(cell).find((item) => item.id === id) ?? null;
}

async function installInteractionConfig(cdp, config) {
  const payload = JSON.stringify(config);
  const installed = await cdp.evaluate(`(() => {
    window.localStorage.setItem("usm-local-builder-config", ${JSON.stringify(payload)});
    window.sessionStorage.clear();
    return true;
  })()`);
  assert.equal(installed, true, "interaction config should install");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForCdpLoadState(cdp, waitOptions);
}

async function dragCellControl(cdp, selection, target) {
  const result = await cdp.evaluate(`(() => {
    const selection = ${JSON.stringify(selection)};
    const dragTarget = ${JSON.stringify(target)};
    const SCALE = 0.004;
    const STEEL_PANEL_EDGE_INSET = 7.8 * SCALE;
    const STEEL_PANEL_THICKNESS = 14.5 * SCALE;
    const RIMMED_DRAWER_RIM_HEIGHT_MM = 320;
    const canvas = document.querySelector("canvas");
    const raw = window.localStorage.getItem("usm-local-builder-config");
    const config = raw ? JSON.parse(raw) : null;
    if (!canvas || !config) return { dragged: false, reason: "missing canvas or config" };

    const widths = config.columnWidths.map((value) => value * SCALE);
    const heights = config.rowHeights.map((value) => value * SCALE);
    const depthSegments = (Array.isArray(config.depthSegments) && config.depthSegments.length ? config.depthSegments : [config.depth]).map((value) => value * SCALE);
    const totalWidth = widths.reduce((total, value) => total + value, 0);
    const totalHeight = heights.reduce((total, value) => total + value, 0);
    const totalDepth = depthSegments.reduce((total, value) => total + value, 0);
    const xBounds = [-totalWidth / 2];
    const yBounds = [0];
    const zBounds = [totalDepth / 2];
    widths.forEach((width) => xBounds.push(xBounds[xBounds.length - 1] + width));
    heights.forEach((height) => yBounds.push(yBounds[yBounds.length - 1] + height));
    depthSegments.forEach((depth) => zBounds.push(zBounds[zBounds.length - 1] - depth));

    const cell = {
      x: ((xBounds[selection.column] ?? 0) + (xBounds[selection.column + 1] ?? 0)) / 2,
      y: ((yBounds[selection.row] ?? 0) + (yBounds[selection.row + 1] ?? 0)) / 2 + 0.05,
      z: ((zBounds[selection.depthIndex] ?? 0) + (zBounds[selection.depthIndex + 1] ?? 0)) / 2,
      width: Math.max(0.04, (xBounds[selection.column + 1] ?? 0) - (xBounds[selection.column] ?? 0)),
      height: Math.max(0.04, (yBounds[selection.row + 1] ?? 0) - (yBounds[selection.row] ?? 0)),
      depth: Math.max(0.04, (zBounds[selection.depthIndex] ?? 0) - (zBounds[selection.depthIndex + 1] ?? 0)),
      frontZ: zBounds[selection.depthIndex] ?? totalDepth / 2
    };
    const panelWidth = officialPanelSpan(cell.width);
    const panelHeight = officialPanelSpan(cell.height);
    let startPoint = null;
    let axisStart = null;
    let axisEnd = null;
    let startScreenOffset = [0, 0];

    if (dragTarget.startsWith("dropDoor")) {
      const xBias = dragTarget.endsWith("Left") ? -0.34 : dragTarget.endsWith("Right") ? 0.34 : 0;
      const yRatio = dragTarget.endsWith("Lock") ? 0.82 : 0.5;
      const pivotY = cell.y - cell.height / 2;
      const frontPanelZ = cell.frontZ;
      startPoint = [cell.x + panelWidth * xBias, pivotY + panelHeight * yRatio, frontPanelZ + STEEL_PANEL_THICKNESS / 2 + 0.08];
      axisStart = [cell.x, pivotY + panelHeight / 2, frontPanelZ + STEEL_PANEL_THICKNESS / 2 + 0.075];
      axisEnd = [axisStart[0], axisStart[1] - panelHeight * 0.82, axisStart[2] + panelHeight * 0.82];
    } else if (dragTarget.startsWith("rimmedDrawer")) {
      const xBias = dragTarget.endsWith("Left") ? -0.34 : dragTarget.endsWith("Right") ? 0.34 : 0;
      const yBias = dragTarget.endsWith("Lock") ? 0.28 : 0;
      const maxExtension = Math.min(0.58, officialPanelSpan(cell.depth) * 0.42);
      const frontPanelZ = cell.frontZ;
      startPoint = [cell.x + panelWidth * xBias, cell.y + panelHeight * yBias, frontPanelZ + STEEL_PANEL_THICKNESS / 2 + 0.05];
      axisStart = [cell.x, cell.y, frontPanelZ + STEEL_PANEL_THICKNESS / 2 + 0.05];
      axisEnd = [axisStart[0], axisStart[1], axisStart[2] + maxExtension];
    } else if (dragTarget.startsWith("mobileTray")) {
      const [targetBase, targetId] = dragTarget.split(":");
      const isLeftTarget = targetBase.includes("Left");
      const isRightTarget = targetBase.includes("Right");
      const haloSide = targetBase.endsWith("Halo") ? (isLeftTarget ? -1 : isRightTarget ? 1 : 0) : 0;
      const xBias = isLeftTarget ? (haloSide ? -0.48 : -0.34) : isRightTarget ? (haloSide ? 0.48 : 0.34) : 0;
      const rawCell = config.planCells?.[selection.row]?.[selection.depthIndex]?.[selection.column] ?? config.cells?.[selection.row]?.[selection.column] ?? {};
      const tray = Array.isArray(rawCell.interiorAccessories)
        ? rawCell.interiorAccessories.find((item) => item.kind === "mobileTray" && (!targetId || item.id === targetId))
        : null;
      const fallbackHeightMm = (config.rowHeights?.[selection.row] ?? 350) / 2;
      const mountHeightMm = typeof tray?.mountHeightMm === "number" && Number.isFinite(tray.mountHeightMm) ? tray.mountHeightMm : fallbackHeightMm;
      const bottomY = cell.y - cell.height / 2;
      const mountedY = Math.max(bottomY + 24 * SCALE, Math.min(cell.y + cell.height / 2 - 24 * SCALE, bottomY + mountHeightMm * SCALE));
      const sidePanelHeight = Math.min(0.16, Math.max(0.08, cell.height * 0.24));
      const hitY = mountedY - cell.height * 0.16 + sidePanelHeight / 2;
      const maxExtension = Math.min(0.72, officialPanelSpan(cell.depth) * 0.72);
      startPoint = [cell.x + panelWidth * xBias, hitY, cell.z + 0.04];
      axisStart = [cell.x, hitY, cell.z];
      axisEnd = [axisStart[0], axisStart[1], axisStart[2] + maxExtension];
      if (haloSide) startScreenOffset = [haloSide * 22, 0];
    }

    if (!startPoint || !axisStart || !axisEnd) return { dragged: false, reason: "unknown drag target" };

    const rect = canvas.getBoundingClientRect();
    const aspect = Math.max(0.42, rect.width / Math.max(1, rect.height));
    const dimensionPadding = config.showDimensions === false ? 0 : 0.34 * 2.7;
    const dimensionHeightPadding = config.showDimensions === false ? 0 : 0.34 * 1.7;
    const cameraTotalWidth = totalWidth + dimensionPadding;
    const cameraTotalHeight = totalHeight + dimensionHeightPadding;
    const cameraDepth = totalDepth + dimensionPadding;
    const cameraTarget = [0, totalHeight / 2, 0];
    const wideCabinet = cameraTotalWidth > 4.2;
    const narrow = rect.width < 560;
    const distance = Math.max(4.4, (cameraTotalWidth * (wideCabinet ? 2.35 : 1.38)) / aspect, cameraTotalHeight * 2.2, cameraDepth * 4);
    const direction = normalize([wideCabinet ? 0.34 : narrow ? 0.38 : 0.64, 0.42, wideCabinet || narrow ? 0.82 : 0.72]);
    const eye = add(cameraTarget, scale(direction, distance));
    const start = toClient(project(startPoint, eye, cameraTarget, aspect, 42), rect);
    start.x += startScreenOffset[0];
    start.y += startScreenOffset[1];
    const axisFrom = toClient(project(axisStart, eye, cameraTarget, aspect, 42), rect);
    const axisTo = toClient(project(axisEnd, eye, cameraTarget, aspect, 42), rect);
    const axisX = axisTo.x - axisFrom.x;
    const axisY = axisTo.y - axisFrom.y;
    const axisLength = Math.hypot(axisX, axisY);
    if (axisLength < 4) return { dragged: false, reason: "axis too small", start, axisFrom, axisTo };
    const end = {
      x: start.x + axisX * 1.6,
      y: start.y + axisY * 1.6
    };

    return { dragged: true, dragTarget, start, end, axisFrom, axisTo, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };

    function officialPanelSpan(length) {
      return Math.max(0.05, length - STEEL_PANEL_EDGE_INSET * 2);
    }
    function toClient(projected, rect) {
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - projected.y) / 2) * rect.height
      };
    }
    function normalize(value) {
      const length = Math.hypot(value[0], value[1], value[2]) || 1;
      return [value[0] / length, value[1] / length, value[2] / length];
    }
    function add(a, b) {
      return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    function sub(a, b) {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function scale(value, scalar) {
      return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
    }
    function dot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    function cross(a, b) {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
    }
    function project(point, eye, target, aspect, fovDegrees) {
      const forward = normalize(sub(target, eye));
      const right = normalize(cross(forward, [0, 1, 0]));
      const up = cross(right, forward);
      const offset = sub(point, eye);
      const cameraX = dot(offset, right);
      const cameraY = dot(offset, up);
      const cameraZ = -dot(offset, forward);
      const tangent = Math.tan((fovDegrees * Math.PI / 180) / 2);
      return {
        x: (cameraX / -cameraZ) / (tangent * aspect),
        y: (cameraY / -cameraZ) / tangent
      };
    }
  })()`);
  assert.equal(result.dragged, true, `${target} drag failed: ${JSON.stringify(result)}`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: result.start.x,
    y: result.start.y,
    button: "left",
    buttons: 1,
    pointerType: "mouse",
    clickCount: 1
  });
  for (let index = 1; index <= 4; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: result.start.x + (result.end.x - result.start.x) * (index / 4),
      y: result.start.y + (result.end.y - result.start.y) * (index / 4),
      button: "left",
      buttons: 1,
      pointerType: "mouse"
    });
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: result.end.x,
    y: result.end.y,
    button: "left",
    buttons: 0,
    pointerType: "mouse",
    clickCount: 1
  });
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

async function clickFrontExpandHint(cdp, selection) {
  return clickCellPoint(cdp, selection, "frontExpandHint");
}

async function clickCellFrontFaceLower(cdp, selection) {
  return clickCellPoint(cdp, selection, "frontFaceLower");
}

async function clickCellTopPanel(cdp, selection) {
  return clickCellPoint(cdp, selection, "topPanel");
}

async function clickCanvasBlank(cdp) {
  const result = await cdp.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { clicked: false, reason: "missing canvas" };
    const rect = canvas.getBoundingClientRect();
    return {
      clicked: true,
      clientX: rect.left + 24,
      clientY: rect.top + 24
    };
  })()`);
  assert.equal(result.clicked, true, `blank canvas click failed: ${JSON.stringify(result)}`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: result.clientX,
    y: result.clientY,
    button: "left",
    buttons: 1,
    pointerType: "mouse",
    clickCount: 1
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: result.clientX,
    y: result.clientY,
    button: "left",
    buttons: 0,
    pointerType: "mouse",
    clickCount: 1
  });
}

async function clickCellPoint(cdp, selection, target) {
  const result = await cdp.evaluate(`(() => {
    const selection = ${JSON.stringify(selection)};
    const clickTargetKind = ${JSON.stringify(target)};
    const SCALE = 0.004;
    const EXPAND_HINT_FRONT_OFFSET = 0.68;
    const canvas = document.querySelector("canvas");
    const raw = window.localStorage.getItem("usm-local-builder-config");
    const config = raw ? JSON.parse(raw) : null;
    if (!canvas || !config) return { clicked: false, reason: "missing canvas or config" };

    const widths = config.columnWidths.map((value) => value * SCALE);
    const heights = config.rowHeights.map((value) => value * SCALE);
    const depthSegments = (Array.isArray(config.depthSegments) && config.depthSegments.length ? config.depthSegments : [config.depth]).map((value) => value * SCALE);
    const totalWidth = widths.reduce((total, value) => total + value, 0);
    const totalHeight = heights.reduce((total, value) => total + value, 0);
    const totalDepth = depthSegments.reduce((total, value) => total + value, 0);
    const xBounds = [-totalWidth / 2];
    const yBounds = [0];
    const zBounds = [totalDepth / 2];
    widths.forEach((width) => xBounds.push(xBounds[xBounds.length - 1] + width));
    heights.forEach((height) => yBounds.push(yBounds[yBounds.length - 1] + height));
    depthSegments.forEach((depth) => zBounds.push(zBounds[zBounds.length - 1] - depth));

    const cell = {
      x: ((xBounds[selection.column] ?? 0) + (xBounds[selection.column + 1] ?? 0)) / 2,
      y: ((yBounds[selection.row] ?? 0) + (yBounds[selection.row + 1] ?? 0)) / 2 + 0.05,
      z: ((zBounds[selection.depthIndex] ?? 0) + (zBounds[selection.depthIndex + 1] ?? 0)) / 2,
      width: Math.max(0.04, (xBounds[selection.column + 1] ?? 0) - (xBounds[selection.column] ?? 0)),
      height: Math.max(0.04, (yBounds[selection.row + 1] ?? 0) - (yBounds[selection.row] ?? 0)),
      depth: Math.max(0.04, (zBounds[selection.depthIndex] ?? 0) - (zBounds[selection.depthIndex + 1] ?? 0))
    };
    const point = clickTargetKind === "frontExpandHint"
      ? [cell.x, cell.y, cell.z + cell.depth / 2 + EXPAND_HINT_FRONT_OFFSET]
      : clickTargetKind === "topPanel"
        ? [cell.x, cell.y + cell.height / 2 + 0.018, cell.z]
        : [cell.x + cell.width * 0.2, cell.y + cell.height * 0.4, cell.z + cell.depth / 2 + 0.006];
    const rect = canvas.getBoundingClientRect();
    const aspect = Math.max(0.42, rect.width / Math.max(1, rect.height));
    const target = [0, totalHeight / 2, 0];
    const dimensionPadding = config.showDimensions === false ? 0 : 0.34 * 2.7;
    const dimensionHeightPadding = config.showDimensions === false ? 0 : 0.34 * 1.7;
    const cameraTotalWidth = totalWidth + dimensionPadding;
    const cameraTotalHeight = totalHeight + dimensionHeightPadding;
    const cameraDepth = totalDepth + dimensionPadding;
    const wideCabinet = cameraTotalWidth > 4.2;
    const narrow = rect.width < 560;
    const distance = Math.max(4.4, (cameraTotalWidth * (wideCabinet ? 2.35 : 1.38)) / aspect, cameraTotalHeight * 2.2, cameraDepth * 4);
    const direction = normalize([wideCabinet ? 0.34 : narrow ? 0.38 : 0.64, 0.42, wideCabinet || narrow ? 0.82 : 0.72]);
    const eye = add(target, scale(direction, distance));
    const projected = project(point, eye, target, aspect, 42);
    const clientX = rect.left + ((projected.x + 1) / 2) * rect.width;
    const clientY = rect.top + ((1 - projected.y) / 2) * rect.height;

    return { clicked: true, clientX, clientY, projected, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };

    function normalize(value) {
      const length = Math.hypot(value[0], value[1], value[2]) || 1;
      return [value[0] / length, value[1] / length, value[2] / length];
    }
    function add(a, b) {
      return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    function sub(a, b) {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function scale(value, scalar) {
      return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
    }
    function dot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    function cross(a, b) {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
    }
    function project(point, eye, target, aspect, fovDegrees) {
      const forward = normalize(sub(target, eye));
      const right = normalize(cross(forward, [0, 1, 0]));
      const up = cross(right, forward);
      const offset = sub(point, eye);
      const cameraX = dot(offset, right);
      const cameraY = dot(offset, up);
      const cameraZ = -dot(offset, forward);
      const tangent = Math.tan((fovDegrees * Math.PI / 180) / 2);
      return {
        x: (cameraX / -cameraZ) / (tangent * aspect),
        y: (cameraY / -cameraZ) / tangent
      };
    }
  })()`);
  assert.equal(result.clicked, true, `${target} click failed: ${JSON.stringify(result)}`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: result.clientX,
    y: result.clientY,
    button: "left",
    buttons: 1,
    pointerType: "mouse",
    clickCount: 1
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: result.clientX,
    y: result.clientY,
    button: "left",
    buttons: 0,
    pointerType: "mouse",
    clickCount: 1
  });
}

async function captureScreenshot(cdp, screenshotPath) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
