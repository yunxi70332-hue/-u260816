import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { assertAccessoryLogicMatrix, createAccessoryLogicMatrix } from "./export-accessory-logic-matrix.mjs";

const root = process.cwd();
const priceSourcePath = path.join(root, "src", "data", "simple-home-price-source.json");
const nodeRequire = createRequire(import.meta.url);
const ts = await loadTypeScriptCompiler();

async function loadTypeScriptCompiler() {
  const imported = await import("typescript");
  const installed = imported.default ?? imported;
  if (typeof installed.transpileModule === "function") return installed;

  const pnpmDir = path.join(root, "node_modules", ".pnpm");
  const legacyCompiler = fs.readdirSync(pnpmDir)
    .filter((name) => name.startsWith("typescript@"))
    .map((name) => path.join(pnpmDir, name, "node_modules", "typescript", "lib", "typescript.js"))
    .find((candidate) => fs.existsSync(candidate));
  if (!legacyCompiler) throw new Error("No TypeScript compiler API with transpileModule is installed.");
  return nodeRequire(legacyCompiler);
}

function loadTs(relativePath, deps = {}) {
  const sourcePath = path.join(root, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;

  const sandbox = {
    console,
    exports: {},
    module: { exports: {} },
    require(id) {
      if (id === "./accessoryCatalog" || id === "./accessoryCatalog.ts") return deps.accessoryCatalog;
      if (id === "./data/simple-home-price-source.json") return deps.priceSource;
      return nodeRequire(id);
    }
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

const accessoryCatalog = loadTs("src/accessoryCatalog.ts");
const model = loadTs("src/model.ts", { accessoryCatalog });
const priceSource = JSON.parse(fs.readFileSync(priceSourcePath, "utf8"));
const pricing = loadTs("src/pricing.ts", { priceSource });

function pick(evaluation) {
  return {
    status: evaluation.status,
    label: evaluation.label,
    officialSpec: evaluation.officialSpec ?? "",
    reasons: evaluation.reasons,
    warnings: evaluation.warnings,
    bomSize: evaluation.bomSize
  };
}

function expectStatus(actual, expected, label) {
  assert.equal(actual.status, expected, `${label}: expected ${expected}, got ${actual.status}`);
}

function assertIncludesText(lines, text, label) {
  assert.ok(lines.some((line) => line.includes(text)), `${label}: expected text "${text}"`);
}

function cellAt(config, selection) {
  return config.cells[selection.row][selection.column];
}

function firstInterior(config, selection, kind) {
  return cellAt(config, selection).interiorAccessories?.find((item) => item.kind === kind);
}

function selectionCoordinates(selection) {
  return [selection.row, selection.column, selection.depthIndex ?? 0];
}

function bomQty(bom, name, spec) {
  return bom.find((item) => item.name === name && (item.baseSpec ?? item.spec) === spec)?.qty ?? 0;
}

function bomLineByBaseSpecAndColor(bom, name, spec, color) {
  return bom.find((item) => item.name === name && (item.baseSpec ?? item.spec) === spec && item.color === color);
}

const perforatedOption = model.FRONT_ACCESSORY_OPTIONS.find((item) => item.id === "perforatedPanel");
assert.equal(perforatedOption, undefined, "front accessory options exclude perforated panel");
const perforatedCatalog = accessoryCatalog.getAccessory("perforatedPanel");
assert.equal(perforatedCatalog.bomName, "洞洞板", "catalog exposes perforated panel BOM name");
assert.equal(perforatedCatalog.category, "framePanels", "catalog classifies perforated panel as a frame panel");
assert.equal(perforatedCatalog.installTarget, "frame", "catalog installs perforated panel on the frame");

const perforatedBackBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  colorScope: "accessory",
  depth: 700,
  depthSegments: [350, 350],
  columnWidths: [350],
  rowHeights: [350],
  planCells: [[
    [{
      kind: "metalBackModule",
      enabled: true,
      frontAccessory: "perforatedPanel",
      accessoryMountSide: "back",
      accessoryColors: { front: "#2da845" },
      doorOpen: 1,
      doorState: "open"
    }],
    [{ kind: "metalBackModule", enabled: true }]
  ]]
});
const perforatedSelection = { row: 0, column: 0, depthIndex: 0 };
const perforatedBackCell = model.getCellConfig(perforatedBackBase, perforatedSelection);
assert.equal(perforatedBackCell?.frontAccessory, undefined, "normalization removes legacy perforated front accessory");
assert.equal(perforatedBackCell?.structure?.panels?.back, "perforated", "normalization migrates perforated front accessory to the selected frame panel");
assert.equal(perforatedBackCell?.accessoryMountSide, undefined, "normalization clears the legacy perforated mount field");
assert.equal(perforatedBackCell?.doorOpen, undefined, "perforated panel clears stale door progress");
assert.equal(perforatedBackCell?.doorState, undefined, "perforated panel clears stale door state");
assert.equal(model.getEffectivePanelColor(perforatedBackBase, perforatedSelection, "back"), "#2da845", "legacy perforated accessory color migrates to the frame panel");
expectStatus(
  pick(model.evaluateCellFrontAccessory(perforatedBackBase, perforatedSelection, "dropDoor", "back")),
  "blocked",
  "back-mounted drop door still respects adjacent opening collision"
);
const perforatedDoorAttempt = model.setDoorOpen(perforatedBackBase, perforatedSelection, 1);
assert.equal(model.getCellConfig(perforatedDoorAttempt, perforatedSelection)?.doorOpen, undefined, "door controls do not open perforated panels");
const perforatedMotion = model.getMovingAccessorySummary(perforatedBackBase, "all");
assert.equal(perforatedMotion.total, 0, "perforated panels stay out of batch motion totals");
assert.equal(perforatedMotion.open, 0, "perforated panels stay out of batch motion open counts");

const perforatedFrontBase = model.setCellFrontAccessory(
  model.normalizeConfig({
    ...model.DEFAULT_CONFIG,
    depth: 350,
    columnWidths: [350],
    rowHeights: [350],
    cells: [[{ kind: "metalBackModule", enabled: true }]]
  }),
  { row: 0, column: 0 },
  "none",
  "front"
);
const perforatedFrontPanelBase = model.setPhysicalStructurePanel(perforatedFrontBase, { row: 0, column: 0 }, "front", "perforated");
const perforatedFrontCell = model.getCellConfig(perforatedFrontPanelBase, { row: 0, column: 0 });
assert.equal(perforatedFrontCell?.structure?.panels?.front, "perforated", "frame editing installs a perforated front panel");
assert.equal(perforatedFrontCell?.frontAccessory, undefined, "frame perforated panel is not stored as a front accessory");

let perforatedShelfBase = model.setPhysicalStructurePanel(perforatedFrontPanelBase, { row: 0, column: 0 }, "left", "perforated");
perforatedShelfBase = model.setPhysicalStructurePanel(perforatedShelfBase, { row: 0, column: 0 }, "right", "perforated");
expectStatus(
  pick(model.evaluateCellInteriorAccessory(perforatedShelfBase, { row: 0, column: 0 }, "shelf")),
  "officialLogicCustomSize",
  "fixed shelf supports perforated sheet-metal side panels"
);
const perforatedWithShelf = model.addCellInteriorAccessory(perforatedShelfBase, { row: 0, column: 0 }, "shelf", 175);
const perforatedShelfCell = model.getCellConfig(perforatedWithShelf, { row: 0, column: 0 });
assert.equal(perforatedShelfCell?.structure?.panels?.front, "perforated", "adding a fixed shelf preserves the perforated front panel");
assert.equal(perforatedShelfCell?.structure?.panels?.left, "perforated", "adding a fixed shelf preserves the perforated left panel");
assert.equal(perforatedShelfCell?.structure?.panels?.right, "perforated", "adding a fixed shelf preserves the perforated right panel");
assert.ok(perforatedShelfCell?.interiorAccessories?.some((item) => item.kind === "shelf"), "perforated module stores the fixed shelf accessory");
assert.ok(model.buildBom(perforatedWithShelf).some((item) => item.name === "固定搁板"), "perforated module fixed shelf enters the BOM");

const perforatedBom = model.buildBom(perforatedBackBase);
const perforatedBomLine = bomLineByBaseSpecAndColor(perforatedBom, "洞洞板", "350 x 350 mm", "#2da845");
assert.ok(perforatedBomLine, "perforated frame panel replaces the ordinary panel BOM row");
assert.equal(bomLineByBaseSpecAndColor(perforatedBom, "金属扣板", "350 x 350 mm", "#2da845"), undefined, "perforated frame panel does not duplicate an ordinary panel row");
const pricedPanels = pricing.priceBomItems([
  perforatedBomLine,
  { name: "金属扣板", spec: "350 x 350 mm", baseSpec: "350 x 350 mm", qty: 1, unit: "块", unitPrice: 200 }
]);
const pricedPerforated = pricedPanels.find((item) => item.name === "洞洞板");
const pricedPlainPanel = pricedPanels.find((item) => item.name === "金属扣板");
assert.equal(pricedPerforated?.unitPrice, 141.06, "335*335 perforated panel matches the dedicated source price");
assert.deepEqual(Array.from(pricedPerforated?.priceSourceRows ?? []), [42], "perforated panel matches simple-home source row 42");
assert.equal(pricedPlainPanel?.unitPrice, 74.24, "ordinary 335*335 panel keeps the ordinary source price");
assert.deepEqual(Array.from(pricedPlainPanel?.priceSourceRows ?? []), [40], "ordinary panel does not match the perforated source row");

const lowHeightCell = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 500,
  columnWidths: [500],
  rowHeights: [100],
  cells: [[{ kind: "metalBackModule", enabled: true }]]
});
expectStatus(pick(model.evaluateCellFitting(lowHeightCell, { row: 0, column: 0 }, "mobileTray")), "blocked", "100 mm mobile tray");
expectStatus(pick(model.evaluateCellKind(lowHeightCell, { row: 0, column: 0 }, "displayTray")), "officialExact", "100 mm fixed tray");
expectStatus(pick(model.evaluateCellFitting(lowHeightCell, { row: 0, column: 0 }, "rimmedDrawer")), "needsHardwareCheck", "100 mm rimmed drawer");
expectStatus(pick(model.evaluateCellFitting(lowHeightCell, { row: 0, column: 0 }, "rimlessDrawer")), "officialExact", "100 mm rimless drawer");

const tooLowRimlessDrawer = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  columnWidths: [500],
  rowHeights: [80],
  cells: [[{ kind: "metalBackModule", enabled: true }]]
});
expectStatus(pick(model.evaluateCellFitting(tooLowRimlessDrawer, { row: 0, column: 0 }, "rimlessDrawer")), "blocked", "80 mm rimless drawer");

const lowRimlessDrawer = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  columnWidths: [500],
  rowHeights: [100],
  cells: [[{
    kind: "metalBackModule",
    enabled: true,
    fitting: "rimlessDrawer",
    accessoryMountSide: "left",
    drawerPull: 0
  }]]
});
const normalizedRimlessCell = model.getCellConfig(lowRimlessDrawer, { row: 0, column: 0 });
assert.equal(normalizedRimlessCell?.fitting, "rimlessDrawer", "normalization preserves rimless drawer fitting");
assert.equal(normalizedRimlessCell?.accessoryMountSide, "left", "normalization preserves rimless drawer direction");
assert.equal(normalizedRimlessCell?.drawerPull, 0, "normalization preserves closed rimless drawer state");
const openedRimlessDrawer = model.setMovingAccessoryGroupOpen(lowRimlessDrawer, "drawer", true);
assert.equal(model.getCellConfig(openedRimlessDrawer, { row: 0, column: 0 })?.drawerPull, 1, "drawer batch motion opens rimless drawers");
const rimlessBom = model.buildBom(lowRimlessDrawer);
assert.ok(rimlessBom.some((item) => item.name === "一字拉手门板"), "rimless drawer BOM includes its front panel");
assert.equal(rimlessBom.some((item) => item.name === "围边"), false, "rimless drawer BOM omits surround parts");

const lowRimmedDrawer = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 500,
  columnWidths: [500],
  rowHeights: [100],
  cells: [[{ kind: "metalBackModule", enabled: true, fitting: "rimmedDrawer" }]]
});
const lowRimmedDrawerProduction = model.validateProductionConfig(lowRimmedDrawer);
assert.equal(lowRimmedDrawerProduction.status, "needsReview", "production report keeps low rimmed drawer buildable with review");
assert.ok(lowRimmedDrawerProduction.issues.some((issue) => issue.severity === "check" && issue.message.includes("当前模块高度较低")), "low rimmed drawer production issue becomes review-only");
assert.equal(lowRimmedDrawerProduction.issues.some((issue) => issue.severity === "blocked" && issue.scope.includes("rimmedDrawer")), false, "low rimmed drawer no longer creates blocked production issue");

const lowMobileTray = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 500,
  columnWidths: [500],
  rowHeights: [100],
  cells: [[{ kind: "pullOutShelf", enabled: true }]]
});
assert.equal(cellAt(lowMobileTray, { row: 0, column: 0 }).kind, "metalBackModule", "legacy pull-out shelf migrates to metal shell");
assert.equal(cellAt(lowMobileTray, { row: 0, column: 0 }).fitting, "none", "legacy pull-out shelf no longer stores mobile tray as fitting");
assert.equal(firstInterior(lowMobileTray, { row: 0, column: 0 }, "mobileTray")?.kind, "mobileTray", "legacy pull-out shelf migrates to one mobile tray interior accessory");
assert.equal(cellAt(lowMobileTray, { row: 0, column: 0 }).structure?.panels?.left, "metal", "legacy mobile tray migration adds left side panel");
assert.equal(cellAt(lowMobileTray, { row: 0, column: 0 }).structure?.panels?.right, "metal", "legacy mobile tray migration adds right side panel");
assert.equal(cellAt(lowMobileTray, { row: 0, column: 0 }).structure?.panels?.bottom, "metal", "legacy mobile tray migration adds bottom panel");
const lowMobileTrayProduction = model.validateProductionConfig(lowMobileTray);
assert.equal(lowMobileTrayProduction.status, "blocked", "production report blocks low mobile tray");
assert.ok(lowMobileTrayProduction.issues.some((issue) => issue.severity === "blocked" && issue.message.includes("高度不足")), "low mobile tray production issue explains height conflict");

const custom = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [620],
  rowHeights: [280],
  depth: 350,
  cells: [[{ kind: "metalBackModule", enabled: true }]]
});
expectStatus(pick(model.evaluateCellKind(custom, { row: 0, column: 0 }, "dropDoor")), "officialLogicCustomSize", "custom-size drop door");
expectStatus(pick(model.evaluateCellKind(custom, { row: 0, column: 0 }, "displayTray")), "officialLogicCustomSize", "custom-size fixed tray");
expectStatus(pick(model.evaluateCellFitting(custom, { row: 0, column: 0 }, "mobileTray")), "needsHardwareCheck", "custom-size mobile tray");

const glassShell = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{ kind: "glassPanelModule", enabled: true }]]
});
expectStatus(pick(model.evaluateCellKind(glassShell, { row: 0, column: 0 }, "dropDoor")), "blocked", "drop door in glass shell");
expectStatus(pick(model.evaluateCellFitting(glassShell, { row: 0, column: 0 }, "mobileTray")), "blocked", "mobile tray in glass shell");
expectStatus(pick(model.evaluateCellKind(glassShell, { row: 0, column: 0 }, "displayTray")), "blocked", "fixed tray in glass shell");
expectStatus(pick(model.evaluateCellFitting(glassShell, { row: 0, column: 0 }, "rimmedDrawer")), "blocked", "rimmed drawer in glass shell");
expectStatus(pick(model.evaluateCellKind(glassShell, { row: 0, column: 0 }, "glassShelf")), "needsHardwareCheck", "glass shelf in glass shell");

const metalSidePanels = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{ kind: "metalBackModule", enabled: true }]]
});
expectStatus(pick(model.evaluateCellKind(metalSidePanels, { row: 0, column: 0 }, "shelf")), "officialExact", "fixed shelf on metal side panels");
expectStatus(pick(model.evaluateCellKind(metalSidePanels, { row: 0, column: 0 }, "displayTray")), "officialExact", "fixed tray on metal side panels");
expectStatus(pick(model.evaluateCellKind(metalSidePanels, { row: 0, column: 0 }, "glassShelf")), "needsHardwareCheck", "glass shelf on metal side panels");

const glassSidePanels = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{
    kind: "metalBackModule",
    enabled: true,
    structure: { panels: { left: "glass", right: "glass" } }
  }]]
});
expectStatus(pick(model.evaluateCellKind(glassSidePanels, { row: 0, column: 0 }, "shelf")), "blocked", "fixed shelf on glass side panels");
expectStatus(pick(model.evaluateCellKind(glassSidePanels, { row: 0, column: 0 }, "displayTray")), "blocked", "fixed tray on glass side panels");
expectStatus(pick(model.evaluateCellKind(glassSidePanels, { row: 0, column: 0 }, "glassShelf")), "needsHardwareCheck", "glass shelf on glass side panels");
assertIncludesText(
  pick(model.evaluateCellKind(glassSidePanels, { row: 0, column: 0 }, "shelf")).reasons,
  "玻璃侧板不能直接承载普通固定层板/固定托盘",
  "fixed shelf glass-side warning"
);

const missingSidePanels = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{
    kind: "metalBackModule",
    enabled: true,
    structure: { panels: { left: "none" } }
  }]]
});
expectStatus(pick(model.evaluateCellKind(missingSidePanels, { row: 0, column: 0 }, "shelf")), "blocked", "fixed shelf with missing side panel");
expectStatus(pick(model.evaluateCellKind(missingSidePanels, { row: 0, column: 0 }, "displayTray")), "blocked", "fixed tray with missing side panel");
expectStatus(pick(model.evaluateCellKind(missingSidePanels, { row: 0, column: 0 }, "glassShelf")), "blocked", "glass shelf with missing side panel");

const openFrameOnly = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{ kind: "open", enabled: true }]]
});
["front", "back", "left", "right", "top", "bottom"].forEach((panel) => {
  assert.equal(
    model.getDefaultStructurePanelMaterial("open", panel),
    "none",
    `open module defaults ${panel} panel to none`
  );
});
assert.ok(!model.buildBom(openFrameOnly).some((item) => item.name === "底板"), "default open module BOM excludes bottom panel");

const frontFacingMetalBack = { kind: "metalBackModule", enabled: true };
assert.equal(model.getEffectiveStructurePanelMaterial(frontFacingMetalBack, frontFacingMetalBack.kind, "front"), "none", "front-facing module keeps its opening at the front");
assert.equal(model.getEffectiveStructurePanelMaterial(frontFacingMetalBack, frontFacingMetalBack.kind, "back"), "metal", "front-facing module keeps its metal panel at the back");

const backFacingMetalBack = { kind: "metalBackModule", enabled: true, faceSide: "back" };
assert.equal(model.getEffectiveStructurePanelMaterial(backFacingMetalBack, backFacingMetalBack.kind, "front"), "metal", "back-facing module moves its metal panel to the physical front");
assert.equal(model.getEffectiveStructurePanelMaterial(backFacingMetalBack, backFacingMetalBack.kind, "back"), "none", "back-facing module keeps its opening at the physical back");

const backFacingPanelOverride = {
  ...backFacingMetalBack,
  structure: { panels: { front: "glass", back: "metal" } }
};
assert.equal(model.getEffectiveStructurePanelMaterial(backFacingPanelOverride, backFacingPanelOverride.kind, "front"), "glass", "explicit front panel override wins for a back-facing module");
assert.equal(model.getEffectiveStructurePanelMaterial(backFacingPanelOverride, backFacingPanelOverride.kind, "back"), "metal", "explicit back panel override wins for a back-facing module");

const backFacingPlainShell = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[[{ kind: "metalBackModule", enabled: true, faceSide: "back" }]]]
});
for (const kind of ["open", "noBackModule", "glassPanelModule", "sideOpenDoor"]) {
  const switched = model.setCellKind(backFacingPlainShell, { row: 0, column: 0, depthIndex: 0 }, kind);
  assert.equal(
    model.getCellConfig(switched, { row: 0, column: 0, depthIndex: 0 })?.faceSide,
    undefined,
    `${kind} clears a stale metal-shell face direction`
  );
}
const normalizedStalePlainShell = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[[{ kind: "glassPanelModule", enabled: true, faceSide: "back" }]]]
});
assert.equal(
  model.getCellConfig(normalizedStalePlainShell, { row: 0, column: 0, depthIndex: 0 })?.faceSide,
  undefined,
  "normalization clears legacy face direction from an ordinary module"
);

const doorOrientationSelection = { row: 0, column: 0, depthIndex: 0 };
const frontOrientedDoor = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  depthSegments: [350],
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[[{ kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", faceSide: "front" }]]]
});
const frontOrientedDoorCell = model.getCellConfig(frontOrientedDoor, doorOrientationSelection);
assert.equal(model.getAccessoryMountSide(frontOrientedDoorCell), "front", "front-oriented drop door keeps a logical front mount");
assert.equal(model.getPhysicalAccessoryMountSide(frontOrientedDoorCell), "front", "front-oriented drop door mounts on the physical front");
assert.equal(model.getEffectiveStructurePanelMaterial(frontOrientedDoorCell, frontOrientedDoorCell.kind, "front"), "none", "front-oriented drop door keeps the physical front open");
assert.equal(model.getEffectiveStructurePanelMaterial(frontOrientedDoorCell, frontOrientedDoorCell.kind, "back"), "metal", "front-oriented drop door keeps its metal panel at the physical back");

const backOrientedDoor = model.setMetalShellFaceSide(frontOrientedDoor, doorOrientationSelection, "back");
const backOrientedDoorCell = model.getCellConfig(backOrientedDoor, doorOrientationSelection);
assert.equal(backOrientedDoorCell?.faceSide, "back", "metal shell face setter stores the back-facing direction");
assert.equal(model.getAccessoryMountSide(backOrientedDoorCell), "front", "back-facing drop door keeps the canonical logical front mount");
assert.equal(model.getPhysicalAccessoryMountSide(backOrientedDoorCell), "back", "back-facing drop door mounts on the physical back");
assert.equal(model.getEffectiveStructurePanelMaterial(backOrientedDoorCell, backOrientedDoorCell.kind, "front"), "metal", "back-facing drop door moves its metal panel to the physical front");
assert.equal(model.getEffectiveStructurePanelMaterial(backOrientedDoorCell, backOrientedDoorCell.kind, "back"), "none", "back-facing drop door keeps the physical back open");
const backOrientedDoorRoundTrip = model.normalizeConfig(JSON.parse(JSON.stringify(backOrientedDoor)));
const backOrientedDoorRoundTripCell = model.getCellConfig(backOrientedDoorRoundTrip, doorOrientationSelection);
assert.equal(model.getAccessoryMountSide(backOrientedDoorRoundTripCell), "front", "back-facing drop door keeps its canonical logical mount after export and import");
assert.equal(model.getPhysicalAccessoryMountSide(backOrientedDoorRoundTripCell), "back", "back-facing drop door keeps its physical mount after export and import");
assert.equal(
  model.getPhysicalAccessoryMountSide({ kind: "metalBackModule", enabled: true, faceSide: "back", accessoryMountSide: "left" }),
  "right",
  "back-facing shell rotates a logical left accessory mount to the physical right"
);
assert.equal(
  model.getPhysicalAccessoryMountSide({ kind: "metalBackModule", enabled: true, faceSide: "back", accessoryMountSide: "right" }),
  "left",
  "back-facing shell rotates a logical right accessory mount to the physical left"
);

const restoredFrontDoor = model.setMetalShellFaceSide(backOrientedDoor, doorOrientationSelection, "front");
const restoredFrontDoorCell = model.getCellConfig(restoredFrontDoor, doorOrientationSelection);
assert.equal(restoredFrontDoorCell?.faceSide, "front", "metal shell face setter can restore the front-facing direction");
assert.equal(model.getPhysicalAccessoryMountSide(restoredFrontDoorCell), "front", "restored drop door returns to the physical front");

const legacyBackMountedDoor = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  depthSegments: [350],
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[[{ kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", accessoryMountSide: "back" }]]]
});
const legacyBackMountedDoorCell = model.getCellConfig(legacyBackMountedDoor, doorOrientationSelection);
assert.equal(legacyBackMountedDoorCell?.faceSide, "back", "legacy raw back-mounted door migrates to a back-facing shell");
assert.equal(model.getAccessoryMountSide(legacyBackMountedDoorCell), "front", "legacy raw back mount migrates to the canonical logical front");
assert.equal(model.getPhysicalAccessoryMountSide(legacyBackMountedDoorCell), "back", "legacy raw back-mounted door remains on the physical back");

const frontDoorTopology = model.buildFrameTopology(frontOrientedDoor);
const backDoorTopology = model.buildFrameTopology(backOrientedDoor);
assert.ok(frontDoorTopology.panels.some((part) => part.id === "panel:0:0:0:back" && part.material === "metal"), "front-oriented drop door topology exposes the physical back panel");
assert.equal(frontDoorTopology.panels.some((part) => part.id === "panel:0:0:0:front"), false, "front-oriented drop door topology keeps the physical front open");
assert.ok(backDoorTopology.panels.some((part) => part.id === "panel:0:0:0:front" && part.material === "metal"), "back-oriented drop door topology exposes the physical front panel");
assert.equal(backDoorTopology.panels.some((part) => part.id === "panel:0:0:0:back"), false, "back-oriented drop door topology keeps the physical back open");

const frontDoorBom = model.buildBom(frontOrientedDoor);
const backDoorBom = model.buildBom(backOrientedDoor);
assert.equal(bomQty(frontDoorBom, "下翻门", "500 x 350 mm"), 1, "front-oriented drop door enters the BOM once");
assert.equal(bomQty(backDoorBom, "下翻门", "500 x 350 mm"), 1, "back-oriented drop door enters the BOM once");
assert.equal(bomQty(backDoorBom, "金属扣板", "500 x 350 mm"), bomQty(frontDoorBom, "金属扣板", "500 x 350 mm"), "door face direction preserves the physical panel BOM quantity");

const rearRimlessDrawer = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  depthSegments: [350],
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[[{ kind: "metalBackModule", enabled: true, fitting: "rimlessDrawer", accessoryMountSide: "back" }]]]
});
const rearRimlessCell = model.getCellConfig(rearRimlessDrawer, doorOrientationSelection);
assert.equal(model.getPhysicalAccessoryMountSide(rearRimlessCell), "back", "rear rimless drawer keeps its physical back direction");
assert.equal(
  model.buildFrameTopology(rearRimlessDrawer).panels.some((part) => part.id === "panel:0:0:0:back"),
  false,
  "rear rimless drawer removes its occupied back panel from frame topology"
);
const rearRimlessBom = model.buildBom(rearRimlessDrawer);
assert.equal(bomQty(rearRimlessBom, "金属扣板", "500 x 350 mm"), 2, "rear rimless drawer BOM omits the occupied metal back panel");
assert.ok(
  rearRimlessBom.some((item) => item.name === "一字拉手门板" && item.spec.includes("后向")),
  "rear rimless drawer BOM records its physical direction"
);

const depthCollisionBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 700,
  depthSegments: [350, 350],
  columnWidths: [500],
  rowHeights: [350],
  planCells: [[
    [{ kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", faceSide: "front" }],
    [{ kind: "metalBackModule", enabled: true }]
  ]]
});
expectStatus(
  pick(model.evaluateCellFrontAccessory(depthCollisionBase, doorOrientationSelection, "dropDoor")),
  "officialExact",
  "front-oriented drop door ignores the module behind it"
);
const depthCollisionBackDoor = model.setMetalShellFaceSide(depthCollisionBase, doorOrientationSelection, "back");
expectStatus(
  pick(model.evaluateCellFrontAccessory(depthCollisionBackDoor, doorOrientationSelection, "dropDoor")),
  "blocked",
  "back-oriented drop door detects the module on its physical back side"
);

const rearDoorWithBackOverhang = model.normalizeConfig({
  ...backOrientedDoor,
  workSurfaces: [{
    id: "rear-overhang",
    kind: "deskTop",
    fromColumn: 0,
    toColumn: 0,
    row: 0,
    depth: 350,
    thickness: 19,
    overhangFront: 0,
    overhangBack: 180,
    overhangLeft: 0,
    overhangRight: 0,
    enabled: true
  }]
});
const rearDoorBackOverhangEvaluation = pick(model.evaluateCellFrontAccessory(rearDoorWithBackOverhang, doorOrientationSelection, "dropDoor", "back"));
expectStatus(rearDoorBackOverhangEvaluation, "needsHardwareCheck", "rear drop door checks the physical back work-surface overhang");
assertIncludesText(rearDoorBackOverhangEvaluation.reasons, "后向出沿", "rear drop door reports the physical overhang direction");

const rearDoorWithFrontOverhang = model.normalizeConfig({
  ...backOrientedDoor,
  workSurfaces: [{
    id: "front-overhang",
    kind: "deskTop",
    fromColumn: 0,
    toColumn: 0,
    row: 0,
    depth: 350,
    thickness: 19,
    overhangFront: 180,
    overhangBack: 0,
    overhangLeft: 0,
    overhangRight: 0,
    enabled: true
  }]
});
expectStatus(
  pick(model.evaluateCellFrontAccessory(rearDoorWithFrontOverhang, doorOrientationSelection, "dropDoor", "back")),
  "officialExact",
  "rear drop door ignores a large overhang on the opposite physical front side"
);

const kitchenIsland = model.createKitchenIslandPreset();
const kitchenIslandCells = model.getPlanCells(kitchenIsland);
const islandFrontDrawer = kitchenIslandCells[1][0][0];
const islandBackDrawer = kitchenIslandCells[1][2][0];
assert.equal(model.getEffectiveStructurePanelMaterial(islandFrontDrawer, islandFrontDrawer.kind, "back"), "metal", "island front drawer has a metal back panel");
assert.equal(model.getEffectiveStructurePanelMaterial(islandBackDrawer, islandBackDrawer.kind, "front"), "metal", "island rear drawer has a metal back panel toward the island center");
assert.equal(model.getEffectiveStructurePanelMaterial(islandBackDrawer, islandBackDrawer.kind, "back"), "none", "island rear drawer remains open toward the rear fitting");

const openWithBottomPanel = model.setCellStructurePanel(openFrameOnly, { row: 0, column: 0 }, "bottom", "metal");
assert.equal(cellAt(openWithBottomPanel, { row: 0, column: 0 }).structure?.panels?.bottom, "metal", "open module stores explicit bottom panel override");
assert.ok(model.buildBom(openWithBottomPanel).some((item) => item.name === "金属扣板"), "explicit open bottom panel enters factory panel BOM");

const threeColumnFactoryBom = model.buildBom(model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [750, 750, 750],
  rowHeights: [350, 350, 175],
  depth: 350,
  depthSegments: [350],
  cells: [
    [{ kind: "dropDoor", enabled: true }, { kind: "dropDoor", enabled: true }, { kind: "dropDoor", enabled: true }],
    [{ kind: "dropDoor", enabled: true }, { kind: "dropDoor", enabled: true }, { kind: "dropDoor", enabled: true }],
    [{ kind: "open", enabled: true }, { kind: "open", enabled: true }, { kind: "open", enabled: true }]
  ]
}));
assert.equal(bomQty(threeColumnFactoryBom, "球节点", "标准连接球"), 32, "factory BOM counts brass balls by frame nodes");
assert.equal(bomQty(threeColumnFactoryBom, "钢管", "750 mm"), 24, "factory BOM counts 750 mm tubes by consumable length");
assert.equal(bomQty(threeColumnFactoryBom, "钢管", "350 mm"), 32, "factory BOM counts 350 mm tubes by consumable length");
assert.equal(bomQty(threeColumnFactoryBom, "钢管", "175 mm"), 8, "factory BOM counts 175 mm tubes by consumable length");
assert.equal(bomQty(threeColumnFactoryBom, "金属扣板", "750 x 350 mm"), 18, "factory BOM merges horizontal panels and door-layer backs into 750 x 350扣板");
assert.equal(bomQty(threeColumnFactoryBom, "下翻门", "750 x 350 mm"), 6, "factory BOM splits lower flap door panels");
assert.equal(bomQty(threeColumnFactoryBom, "外板", "350 x 350 mm"), 4, "factory BOM counts outer side panels only on left/right sides of door layers");
assert.equal(bomQty(threeColumnFactoryBom, "扣板（四排孔）", "350 x 350 mm"), 4, "factory BOM uses four-row-hole panels on shared mounting faces");
assert.equal(bomQty(threeColumnFactoryBom, "大角码", "共享安装面"), 8, "factory BOM counts two large angle brackets per shared mounting panel");
assert.equal(bomQty(threeColumnFactoryBom, "一元锁", "下翻门用"), 6, "factory BOM counts one lock per lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "下翻锁盒套装", "1锁盒/扇"), 6, "factory BOM counts lock boxes by lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "锁头螺丝", "2颗/锁头"), 12, "factory BOM counts two lock screws per lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "下翻门铰链", "常用"), 12, "factory BOM counts two hinges per lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "铰链螺丝", "3颗/只铰链"), 36, "factory BOM counts hinge screws by hinge");
assert.equal(bomQty(threeColumnFactoryBom, "L型塑料", "1个/只铰链"), 12, "factory BOM counts one L-shaped plastic part per hinge");
assert.equal(bomQty(threeColumnFactoryBom, "垫片", "2个/只铰链"), 24, "factory BOM counts two pads per hinge");
assert.equal(threeColumnFactoryBom.some((item) => item.name === "月牙扣"), false, "factory BOM excludes competitor-absent crescent clips");
assert.equal(bomQty(threeColumnFactoryBom, "膨胀螺丝", "2颗/根钢管"), 128, "factory BOM counts two expansion screws per tube");

const competitorReferenceBom = model.buildBom(model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [750, 750, 750],
  rowHeights: [350, 175],
  depth: 350,
  depthSegments: [350],
  cells: [
    [
      { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor" },
      { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor" },
      { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor" }
    ],
    [{ kind: "open", enabled: true }, { kind: "open", enabled: true }, { kind: "open", enabled: true }]
  ]
}));
assert.equal(competitorReferenceBom.reduce((total, item) => total + item.qty, 0), 247, "competitor reference BOM total quantity");
assert.equal(bomQty(competitorReferenceBom, "球节点", "标准连接球"), 24, "competitor reference brass balls");
assert.equal(bomQty(competitorReferenceBom, "钢管", "750 mm"), 18, "competitor reference 750 mm tubes");
assert.equal(bomQty(competitorReferenceBom, "钢管", "350 mm"), 20, "competitor reference 350 mm tubes");
assert.equal(bomQty(competitorReferenceBom, "钢管", "175 mm"), 8, "competitor reference 175 mm tubes");
assert.equal(bomQty(competitorReferenceBom, "金属扣板", "750 x 350 mm"), 12, "competitor reference wide panels");
assert.equal(bomQty(competitorReferenceBom, "外板", "350 x 350 mm"), 2, "competitor reference ordinary side panels");
assert.equal(bomQty(competitorReferenceBom, "扣板（四排孔）", "350 x 350 mm"), 2, "competitor reference four-row-hole shared panels");
assert.equal(competitorReferenceBom.find((item) => item.name === "扣板（四排孔）")?.materialKey, "panel.fourRowHole", "four-row-hole panels keep a distinct material identity");
assert.equal(bomQty(competitorReferenceBom, "大角码", "共享安装面"), 4, "competitor reference large angle brackets");
assert.equal(bomQty(competitorReferenceBom, "下翻门", "750 x 350 mm"), 3, "competitor reference flap doors");
assert.equal(bomQty(competitorReferenceBom, "脚垫", "底部支撑"), 8, "competitor reference glides");
assert.equal(bomQty(competitorReferenceBom, "膨胀螺丝", "2颗/根钢管"), 92, "competitor reference expansion screws");
assert.equal(bomQty(competitorReferenceBom, "下翻门铰链", "常用"), 6, "competitor reference hinges");
assert.equal(bomQty(competitorReferenceBom, "L型塑料", "1个/只铰链"), 6, "competitor reference L-shaped plastic parts");
assert.equal(bomQty(competitorReferenceBom, "垫片", "2个/只铰链"), 12, "competitor reference pads");
assert.equal(bomQty(competitorReferenceBom, "铰链螺丝", "3颗/只铰链"), 18, "competitor reference hinge screws");
assert.equal(bomQty(competitorReferenceBom, "一元锁", "下翻门用"), 3, "competitor reference locks");
assert.equal(bomQty(competitorReferenceBom, "下翻锁盒套装", "1锁盒/扇"), 3, "competitor reference lock boxes");
assert.equal(bomQty(competitorReferenceBom, "锁头螺丝", "2颗/锁头"), 6, "competitor reference lock screws");
assert.equal(competitorReferenceBom.find((item) => item.name === "钢管" && item.baseSpec === "750 mm")?.spec, "732 mm", "BOM displays factory-cut 732 mm tubes");
assert.equal(competitorReferenceBom.find((item) => item.name === "钢管" && item.baseSpec === "350 mm")?.spec, "332 mm", "BOM displays factory-cut 332 mm tubes");
assert.equal(competitorReferenceBom.find((item) => item.name === "钢管" && item.baseSpec === "175 mm")?.spec, "157 mm", "BOM displays factory-cut 157 mm tubes");
assert.match(competitorReferenceBom.find((item) => item.name === "金属扣板" && item.baseSpec === "750 x 350 mm")?.spec ?? "", /^735 x 335 mm/, "BOM displays factory-cut wide panel size");
assert.match(competitorReferenceBom.find((item) => item.name === "扣板（四排孔）")?.spec ?? "", /^335 x 335 mm/, "BOM displays factory-cut four-row-hole panel size");
assert.match(competitorReferenceBom.find((item) => item.name === "下翻门")?.spec ?? "", /^735 x 335 mm/, "BOM displays factory-cut flap door size");

const stepped = model.createSteppedPreset();
const singleGlassModuleBom = model.buildBom(model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [750],
  rowHeights: [350],
  depth: 350,
  depthSegments: [350],
  cells: [[{ kind: "glassPanelModule", enabled: true }]]
}));
assert.equal(singleGlassModuleBom.some((item) => item.name === "玻璃板模块"), false, "glass module BOM should not keep composite module row");
assert.equal(bomQty(singleGlassModuleBom, "玻璃板", "750 x 350 mm"), 3, "glass module BOM splits into 3 wide glass panels");
assert.equal(bomQty(singleGlassModuleBom, "玻璃板", "350 x 350 mm"), 2, "glass module BOM splits into 2 side glass panels");
assert.equal(singleGlassModuleBom.filter((item) => item.name === "玻璃板").length, 2, "glass module BOM keeps only two glass panel specs");

assert.ok(stepped.cells.flat().some((cell) => !cell.enabled), "stepped preset must include disabled cells for irregular shape");
assert.equal(stepped.columnWidths.length, 4, "stepped preset column count");
assert.equal(stepped.rowHeights.length, 3, "stepped preset row count");

const island = model.createKitchenIslandPreset();
const islandPlan = model.getPlanCells(island);
assert.deepEqual(Array.from(island.columnWidths), [500, 750, 500], "kitchen island column widths");
assert.deepEqual(Array.from(island.rowHeights), [350, 350], "kitchen island row heights");
assert.deepEqual(Array.from(model.getDepthSegments(island)), [350, 350, 350], "kitchen island depth segments");
assert.equal(islandPlan.length, 2, "kitchen island row count");
assert.equal(islandPlan[0].length, 3, "kitchen island depth count");
assert.equal(islandPlan[0][0].length, 3, "kitchen island column count");

islandPlan[1][0].forEach((cell, column) => {
  assert.equal(cell.kind, "metalBackModule", `front upper drawer ${column + 1} shell`);
  assert.equal(cell.fitting, "rimmedDrawer", `front upper drawer ${column + 1} fitting`);
  assert.equal(cell.faceSide, "front", `front upper drawer ${column + 1} face`);
});
assert.deepEqual(Array.from(islandPlan[0][0].map((cell) => cell.kind)), ["metalBackModule", "sideOpenDoor", "metalBackModule"], "front lower structural modules");
assert.deepEqual(Array.from(islandPlan[0][0].map((cell) => cell.frontAccessory ?? "none")), ["dropDoor", "none", "dropDoor"], "front lower door fronts");
assert.equal(islandPlan[0][0][0].faceSide, "front", "front lower left door faces front");
assert.equal(islandPlan[0][0][2].faceSide, "front", "front lower right door faces front");

islandPlan.forEach((row, rowIndex) => {
  row[1].forEach((cell, column) => {
    assert.equal(cell.kind, "sideOpenDoor", `middle bridge cell ${rowIndex + 1}.${column + 1}`);
  });
});

islandPlan[1][2].forEach((cell, column) => {
  assert.equal(cell.kind, "metalBackModule", `back upper drawer ${column + 1} shell`);
  assert.equal(cell.fitting, "rimmedDrawer", `back upper drawer ${column + 1} fitting`);
  assert.equal(cell.faceSide, "back", `back upper drawer ${column + 1} face`);
  assert.equal(cell.structure?.panels?.back, "none", `back upper drawer ${column + 1} back panel override`);
});
assert.deepEqual(Array.from(islandPlan[0][2].map((cell) => cell.kind)), ["metalBackModule", "sideOpenDoor", "metalBackModule"], "back lower structural modules");
assert.deepEqual(Array.from(islandPlan[0][2].map((cell) => cell.frontAccessory ?? "none")), ["dropDoor", "none", "dropDoor"], "back lower door fronts");
assert.equal(islandPlan[0][2][0].faceSide, "back", "back lower left door faces back");
assert.equal(islandPlan[0][2][0].structure?.panels?.back, "none", "back lower left door hides outward back panel");
assert.equal(islandPlan[0][2][2].faceSide, "back", "back lower right door faces back");
assert.equal(islandPlan[0][2][2].structure?.panels?.back, "none", "back lower right door hides outward back panel");
assert.equal(model.getPhysicalAccessoryMountSide(islandPlan[0][0][0]), "front", "island front lower door mounts on the physical front");
assert.equal(model.getPhysicalAccessoryMountSide(islandPlan[0][2][0]), "back", "island back lower door mounts on the physical back");
const islandTopology = model.buildFrameTopology(island);
assert.ok(islandTopology.panels.some((part) => part.id === "panel:0:0:0:back"), "island front lower door keeps its metal panel toward the island center");
assert.ok(islandTopology.panels.some((part) => part.id === "panel:0:2:0:front"), "island back lower door keeps its metal panel toward the island center");
assert.equal(islandTopology.vertices.length, 48, "island shares vertices on adjacent depth planes");
assert.equal(islandTopology.tubes.length, 104, "island shares tubes on adjacent depth planes");
assert.equal(islandTopology.supports.length, 16, "island creates one support per physical bottom vertex");
assert.equal(new Set(islandTopology.vertices.map((part) => part.position.join(":"))).size, islandTopology.vertices.length, "island has no colocated duplicate vertices");
assert.equal(new Set(islandTopology.tubes.map((part) => `${part.axis}:${part.position.join(":")}:${part.length}`)).size, islandTopology.tubes.length, "island has no colocated duplicate tubes");
assert.equal(new Set(islandTopology.supports.map((part) => part.position.join(":"))).size, islandTopology.supports.length, "island has no colocated duplicate supports");
const islandProduction = model.validateProductionConfig(island);
assert.equal(islandProduction.counts.blocked, 0, "double-sided island production validation has no false door collision blocks");
assert.equal(
  islandProduction.issues.some((issue) => issue.severity === "blocked" && issue.id.includes("dropDoor")),
  false,
  "double-sided island production validation keeps both outward drop-door paths clear"
);

assert.equal(island.workSurfaces.length, 0, "kitchen island should not add a non-USM tabletop by default");
const islandDimensions = model.getDimensions(island);
assert.equal(islandDimensions.outerWidth, 1773, "kitchen island outer width follows module frame width");
assert.equal(islandDimensions.outerDepth, 1073, "kitchen island outer depth follows three depth segments");
assert.equal(islandDimensions.outerHeight, 740, "kitchen island outer height uses two rows and glides");
const islandBom = model.buildBom(island);
const islandDepthTubes = islandBom.find((item) => item.name === "钢管" && item.baseSpec === "350 mm");
assert.equal(bomQty(islandBom, "球节点", "标准连接球"), 48, "kitchen island BOM counts physical shared vertices once");
assert.equal(bomQty(islandBom, "钢管", "500 mm"), 24, "kitchen island BOM counts physical 500 mm tubes once");
assert.equal(bomQty(islandBom, "钢管", "750 mm"), 12, "kitchen island BOM counts physical 750 mm tubes once");
assert.equal(islandDepthTubes?.qty, 68, "kitchen island BOM counts physical 350 mm tubes once");
assert.equal(bomQty(islandBom, "脚垫", "底部支撑"), 16, "kitchen island BOM counts one support per physical bottom vertex");
assert.ok(!islandBom.some((item) => item.name === "桥接台面" || item.name === "跨格桌面"), "kitchen island BOM excludes non-USM tabletops");
assert.equal(islandBom.some((item) => item.name === "金属背板"), false, "factory BOM merges metal back panels into扣板 rows");
assert.equal(bomQty(islandBom, "金属扣板", "500 x 350 mm"), 26, "factory island BOM includes both rear-facing drop-door mounting panels in the shared扣板 count");
assert.equal(bomQty(islandBom, "金属扣板", "750 x 350 mm"), 11, "factory island BOM includes the rear-facing 750 mm back panel in the shared扣板 count");

const mixedDepth = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  columnWidths: [500, 500],
  rowHeights: [350],
  cells: [[
    { kind: "metalBackModule", enabled: true },
    { kind: "metalBackModule", enabled: true, interiorAccessories: [{ id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 175, pull: 1 }], depth: 500 }
  ]]
});
assert.equal(model.getCellDepth(mixedDepth, 0, 0), 350, "first mixed-depth cell inherits default depth");
assert.equal(model.getCellDepth(mixedDepth, 0, 1), 500, "second mixed-depth cell stores local depth");
expectStatus(pick(model.evaluateCellFitting(mixedDepth, { row: 0, column: 1 }, "mobileTray")), "officialExact", "local-depth mobile tray evaluates against 500 depth");
assert.equal(model.getDimensions(mixedDepth).innerDepth, 500, "mixed-depth dimensions use max active cell depth");
assert.ok(model.buildBom(mixedDepth).some((item) => item.name === "钢管" && item.baseSpec === "500 mm"), "mixed-depth BOM includes 500 mm tubes");
assert.ok(model.buildBom(mixedDepth).some((item) => item.name === "移动托盘" && item.spec.includes("500 x 500 mm")), "mixed-depth mobile tray enters BOM");
assert.ok(model.buildBom(mixedDepth).some((item) => item.name === "移动托盘导轨" && item.spec.includes("500 mm")), "mixed-depth mobile tray uses local depth rails");

const actionBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 500,
  columnWidths: [500],
  rowHeights: [350],
  cells: [[{ kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor" }]]
});

const doorToDrawer = model.setCellFitting(actionBase, { row: 0, column: 0 }, "rimmedDrawer");
assert.equal(cellAt(doorToDrawer, { row: 0, column: 0 }).kind, "metalBackModule", "rimmed drawer replaces door front with metal shell");
assert.equal(cellAt(doorToDrawer, { row: 0, column: 0 }).fitting, "rimmedDrawer", "rimmed drawer fitting is stored");
assert.equal(cellAt(doorToDrawer, { row: 0, column: 0 }).doorState, undefined, "rimmed drawer clears door opening state");

const drawerToDoor = model.setCellKind(doorToDrawer, { row: 0, column: 0 }, "dropDoor");
assert.equal(cellAt(drawerToDoor, { row: 0, column: 0 }).kind, "metalBackModule", "drop door keeps a structural metal shell");
assert.equal(cellAt(drawerToDoor, { row: 0, column: 0 }).frontAccessory, "dropDoor", "drop door is stored as front accessory");
assert.equal(cellAt(drawerToDoor, { row: 0, column: 0 }).fitting, "none", "drop door clears rimmed drawer fitting");
assert.equal(cellAt(drawerToDoor, { row: 0, column: 0 }).drawerPull, undefined, "drop door clears drawer pull");

const dropDoorRightExpand = model.expandCell(actionBase, { row: 0, column: 0 }, "right");
assert.equal(dropDoorRightExpand.config.columnWidths.length, 2, "drop door cell can expand structure to the right");
assert.equal(dropDoorRightExpand.selection.column, 1, "drop door right expansion selects the new column");
const dropDoorTopExpand = model.expandCell(actionBase, { row: 0, column: 0 }, "top");
assert.equal(dropDoorTopExpand.config.rowHeights.length, 2, "drop door cell can expand structure upward");
assert.equal(dropDoorTopExpand.selection.row, 1, "drop door top expansion selects the new row");

const lowModuleExpandBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  depthSegments: [350],
  columnWidths: [500],
  rowHeights: [100],
  cells: [[{ kind: "metalBackModule", enabled: true }]]
});
const lowModuleSelection = { row: 0, column: 0, depthIndex: 0 };
const lowModuleLeftExpand = model.expandCell(lowModuleExpandBase, lowModuleSelection, "left");
assert.deepEqual(Array.from(lowModuleLeftExpand.config.columnWidths), [500, 500], "500 x 100 x 350 module expands left with matching width");
assert.deepEqual(selectionCoordinates(lowModuleLeftExpand.selection), [0, 0, 0], "left expansion selects the inserted column");
const lowModuleRightExpand = model.expandCell(lowModuleExpandBase, lowModuleSelection, "right");
assert.deepEqual(Array.from(lowModuleRightExpand.config.columnWidths), [500, 500], "500 x 100 x 350 module expands right with matching width");
assert.deepEqual(selectionCoordinates(lowModuleRightExpand.selection), [0, 1, 0], "right expansion selects the inserted column");
const lowModuleTopExpand = model.expandCell(lowModuleExpandBase, lowModuleSelection, "top");
assert.deepEqual(Array.from(lowModuleTopExpand.config.rowHeights), [100, 100], "500 x 100 x 350 module expands upward with matching height");
assert.deepEqual(selectionCoordinates(lowModuleTopExpand.selection), [1, 0, 0], "top expansion selects the inserted upper row");
const lowModuleBottomExpand = model.expandCell(lowModuleExpandBase, lowModuleSelection, "bottom");
assert.deepEqual(Array.from(lowModuleBottomExpand.config.rowHeights), [100, 100], "500 x 100 x 350 module expands downward with matching height");
assert.deepEqual(selectionCoordinates(lowModuleBottomExpand.selection), [0, 0, 0], "bottom expansion selects the inserted lower row");
assert.equal(model.getPlanCells(lowModuleBottomExpand.config)[1][0][0].enabled, true, "bottom insertion preserves the original module in the shifted row");

const disabledLowerModule = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  depthSegments: [350],
  columnWidths: [500],
  rowHeights: [100, 100],
  cells: [
    [{ kind: "metalBackModule", enabled: false }],
    [{ kind: "metalBackModule", enabled: true }]
  ]
});
const enabledLowerModule = model.expandCell(disabledLowerModule, { row: 1, column: 0, depthIndex: 0 }, "bottom");
assert.equal(enabledLowerModule.config.rowHeights.length, 2, "bottom expansion reuses an existing lower row");
assert.equal(model.getPlanCells(enabledLowerModule.config)[0][0][0].enabled, true, "bottom expansion enables the existing lower cell");
assert.deepEqual(selectionCoordinates(enabledLowerModule.selection), [0, 0, 0], "bottom expansion selects the enabled lower cell");

const dropDoorFrontExpand = model.expandCell(actionBase, { row: 0, column: 0 }, "front");
assert.deepEqual(Array.from(model.getDepthSegments(dropDoorFrontExpand.config)), [500, 500], "drop door front expansion inserts a new depth segment");
assert.equal(dropDoorFrontExpand.config.depth, 1000, "drop door front expansion grows total depth by a module segment");
assert.equal(dropDoorFrontExpand.selection.depthIndex, 0, "drop door front expansion selects the inserted front depth segment");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][0][0].kind, "metalBackModule", "inserted front depth segment receives the former front as a back-panel shell");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][0][0].fitting, "none", "inserted front back-panel shell does not inherit door hardware");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][0][0].doorState, undefined, "inserted front back-panel shell clears door state");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][0][0].faceSide, undefined, "inserted front back-panel shell clears face direction");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][1][0].kind, "sideOpenDoor", "original drop door cell becomes an open bridge after front expansion");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][1][0].doorState, undefined, "original drop door bridge clears door state");
assert.equal(model.getPlanCells(dropDoorFrontExpand.config)[0][1][0].faceSide, undefined, "original drop door bridge clears face direction");

const glassFrontBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  depth: 350,
  columnWidths: [500],
  rowHeights: [350],
  cells: [[{
    kind: "metalBackModule",
    enabled: true,
    frontAccessory: "glassDropDoor",
    doorOpen: 0,
    doorState: "closed",
    faceSide: "front"
  }]]
});
const glassFrontExpand = model.expandCell(glassFrontBase, { row: 0, column: 0 }, "front");
assert.equal(model.getPlanCells(glassFrontExpand.config)[0][0][0].kind, "metalBackModule", "inserted front glass-door segment receives a back-panel shell");
assert.equal(model.getPlanCells(glassFrontExpand.config)[0][0][0].frontAccessory, undefined, "inserted front glass-door shell clears front accessory");
assert.equal(model.getPlanCells(glassFrontExpand.config)[0][1][0].kind, "sideOpenDoor", "original glass-door front becomes an open bridge after front expansion");
assert.equal(model.getPlanCells(glassFrontExpand.config)[0][1][0].frontAccessory, undefined, "original glass-door bridge clears front accessory");
assert.equal(model.getPlanCells(glassFrontExpand.config)[0][1][0].faceSide, undefined, "original glass-door bridge clears face direction");

const islandFrontExpand = model.expandCell(island, { row: 0, column: 0, depthIndex: 0 }, "front");
const islandFrontExpandPlan = model.getPlanCells(islandFrontExpand.config);
assert.deepEqual(Array.from(model.getDepthSegments(islandFrontExpand.config)), [350, 350, 350, 350], "kitchen island front plus inserts a fourth editable depth segment");
assert.equal(islandFrontExpand.selection.depthIndex, 0, "kitchen island front expansion selects the new front segment");
assert.equal(islandFrontExpandPlan[0][0][0].kind, "metalBackModule", "kitchen island inserted front lower module receives a back-panel shell");
assert.equal(islandFrontExpandPlan[0][0][0].doorState, undefined, "kitchen island inserted lower shell clears door state");
assert.equal(islandFrontExpandPlan[0][0][0].faceSide, undefined, "kitchen island inserted lower shell clears face direction");
assert.equal(islandFrontExpandPlan[0][1][0].kind, "sideOpenDoor", "kitchen island original front lower door becomes an open bridge");
assert.equal(islandFrontExpandPlan[0][1][0].doorState, undefined, "kitchen island original lower bridge clears door state");
assert.equal(islandFrontExpandPlan[0][1][0].faceSide, undefined, "kitchen island original lower bridge clears face direction");
assert.equal(islandFrontExpandPlan[1][0][0].kind, "metalBackModule", "kitchen island inserted front upper drawer becomes a back-panel shell");
assert.equal(islandFrontExpandPlan[1][0][0].fitting, "none", "kitchen island inserted upper back-panel shell does not inherit drawer hardware");
assert.equal(islandFrontExpandPlan[1][0][0].drawerPull, undefined, "kitchen island inserted upper back-panel shell clears drawer pull");
assert.equal(islandFrontExpandPlan[1][0][0].faceSide, undefined, "kitchen island inserted upper back-panel shell clears face direction");
assert.equal(islandFrontExpandPlan[1][1][0].kind, "sideOpenDoor", "kitchen island original front upper drawer becomes an open bridge");
assert.equal(islandFrontExpandPlan[1][1][0].fitting, "none", "kitchen island original front upper bridge drops drawer hardware");
assert.equal(islandFrontExpandPlan[1][1][0].drawerPull, undefined, "kitchen island original front upper bridge clears drawer pull");
assert.equal(islandFrontExpandPlan[1][1][0].faceSide, undefined, "kitchen island original front upper bridge clears face direction");
assert.equal(islandFrontExpandPlan[0][3][0].kind, "metalBackModule", "kitchen island back lower door shell remains in the back depth segment");
assert.equal(islandFrontExpandPlan[0][3][0].frontAccessory, "dropDoor", "kitchen island back lower door front remains in the back depth segment");
assert.equal(islandFrontExpandPlan[0][3][0].faceSide, "back", "kitchen island back lower door keeps back-facing direction");
assert.equal(islandFrontExpandPlan[0][3][0].structure?.panels?.back, "none", "kitchen island back lower door keeps outward back panel override");
assert.equal(islandFrontExpandPlan[1][3][0].kind, "metalBackModule", "kitchen island back upper drawer shell remains in the back depth segment");
assert.equal(islandFrontExpandPlan[1][3][0].fitting, "rimmedDrawer", "kitchen island back upper drawer keeps drawer fitting");
assert.equal(islandFrontExpandPlan[1][3][0].faceSide, "back", "kitchen island back upper drawer keeps back-facing direction");
assert.equal(islandFrontExpandPlan[1][3][0].structure?.panels?.back, "none", "kitchen island back upper drawer keeps outward back panel override");
const islandExpandedBom = model.buildBom(islandFrontExpand.config);
assert.ok(islandExpandedBom.some((item) => item.name === "钢管" && item.baseSpec === "350 mm" && item.qty > islandDepthTubes.qty), "expanded kitchen island BOM includes the inserted 350 mm tube segment");
assert.ok(!islandExpandedBom.some((item) => item.name === "桥接台面" || item.name === "跨格桌面"), "expanded kitchen island BOM still excludes non-USM tabletops");

const drawerToMobileTray = model.setCellFitting(doorToDrawer, { row: 0, column: 0 }, "mobileTray");
assert.equal(cellAt(drawerToMobileTray, { row: 0, column: 0 }).kind, "metalBackModule", "mobile tray keeps compatible shell");
assert.equal(cellAt(drawerToMobileTray, { row: 0, column: 0 }).fitting, "none", "mobile tray is no longer stored as fitting");
assert.equal(firstInterior(drawerToMobileTray, { row: 0, column: 0 }, "mobileTray")?.pull, 1, "mobile tray defaults to extended position");
assert.equal(cellAt(drawerToMobileTray, { row: 0, column: 0 }).structure?.panels?.left, "metal", "mobile tray adds left side panel");
assert.equal(cellAt(drawerToMobileTray, { row: 0, column: 0 }).structure?.panels?.right, "metal", "mobile tray adds right side panel");
assert.equal(cellAt(drawerToMobileTray, { row: 0, column: 0 }).structure?.panels?.bottom, "metal", "mobile tray adds bottom panel");
const mobileTrayInside = model.setDrawerPull(drawerToMobileTray, { row: 0, column: 0 }, 0);
assert.equal(firstInterior(mobileTrayInside, { row: 0, column: 0 }, "mobileTray")?.pull, 0, "mobile tray can store inside position");
const mobileTrayOutside = model.setDrawerPull(mobileTrayInside, { row: 0, column: 0 }, 1);
assert.equal(firstInterior(mobileTrayOutside, { row: 0, column: 0 }, "mobileTray")?.pull, 1, "mobile tray can store outside position");

let dropDoorTwoTrays = model.setCellFrontAccessory(actionBase, { row: 0, column: 0 }, "dropDoor");
dropDoorTwoTrays = model.addCellInteriorAccessory(dropDoorTwoTrays, { row: 0, column: 0 }, "mobileTray", 120);
dropDoorTwoTrays = model.addCellInteriorAccessory(dropDoorTwoTrays, { row: 0, column: 0 }, "mobileTray", 260);
const dropDoorTwoTrayCell = cellAt(dropDoorTwoTrays, { row: 0, column: 0 });
assert.equal(dropDoorTwoTrayCell.frontAccessory, "dropDoor", "drop door can coexist with mobile trays");
assert.equal(dropDoorTwoTrayCell.interiorAccessories.filter((item) => item.kind === "mobileTray").length, 2, "same cell can store two mobile trays");
assert.ok(model.buildBom(dropDoorTwoTrays).some((item) => item.name === "下翻门"), "drop door + trays BOM includes front door");
assert.ok(model.buildBom(dropDoorTwoTrays).filter((item) => item.name === "移动托盘").length >= 2, "drop door + trays BOM includes both trays");

let glassDoorShelves = model.setCellFrontAccessory(custom, { row: 0, column: 0 }, "glassDropDoor");
glassDoorShelves = model.addCellInteriorAccessory(glassDoorShelves, { row: 0, column: 0 }, "shelf", 120);
glassDoorShelves = model.addCellInteriorAccessory(glassDoorShelves, { row: 0, column: 0 }, "glassShelf", 220);
assert.equal(cellAt(glassDoorShelves, { row: 0, column: 0 }).frontAccessory, "glassDropDoor", "glass door can coexist with fixed shelf and glass shelf");
assert.equal(cellAt(glassDoorShelves, { row: 0, column: 0 }).interiorAccessories.length, 2, "glass door cell stores two interior accessories");
assert.equal(model.validateProductionConfig(glassDoorShelves).issues.some((issue) => issue.title.includes("玻璃搁板需要夹件确认")), true, "glass shelf coexistence prompts clip confirmation");

let flipUpTrayShelf = model.setCellFrontAccessory(custom, { row: 0, column: 0 }, "flipUpDoor");
flipUpTrayShelf = model.addCellInteriorAccessory(flipUpTrayShelf, { row: 0, column: 0 }, "displayTray", 110);
flipUpTrayShelf = model.addCellInteriorAccessory(flipUpTrayShelf, { row: 0, column: 0 }, "shelf", 220);
assert.equal(cellAt(flipUpTrayShelf, { row: 0, column: 0 }).frontAccessory, "flipUpDoor", "flip-up door can coexist with fixed tray and shelf");
assert.deepEqual(Array.from(cellAt(flipUpTrayShelf, { row: 0, column: 0 }).interiorAccessories.map((item) => item.kind)), ["displayTray", "shelf"], "flip-up door keeps multiple interior accessories");

const drawerClearsCoexistence = model.setCellFitting(dropDoorTwoTrays, { row: 0, column: 0 }, "rimmedDrawer");
assert.equal(cellAt(drawerClearsCoexistence, { row: 0, column: 0 }).fitting, "rimmedDrawer", "rimmed drawer is stored as exclusive fitting");
assert.equal(cellAt(drawerClearsCoexistence, { row: 0, column: 0 }).frontAccessory, undefined, "rimmed drawer clears front accessory");
assert.equal(cellAt(drawerClearsCoexistence, { row: 0, column: 0 }).interiorAccessories, undefined, "rimmed drawer clears all interior accessories");

const drawerToGlassShell = model.setCellKind(doorToDrawer, { row: 0, column: 0 }, "glassPanelModule");
assert.equal(cellAt(drawerToGlassShell, { row: 0, column: 0 }).kind, "glassPanelModule", "glass shell can replace drawer shell");
assert.equal(cellAt(drawerToGlassShell, { row: 0, column: 0 }).fitting, "none", "glass shell clears rail-based drawer fitting");
assert.equal(model.buildBom(drawerToGlassShell).some((item) => item.name === "抽屉导轨"), false, "glass shell replacement removes drawer rails from BOM");

const glassToDropDoor = model.setCellKind(glassShell, { row: 0, column: 0 }, "dropDoor");
assert.equal(cellAt(glassToDropDoor, { row: 0, column: 0 }).kind, "glassPanelModule", "glass shell rejects direct drop door installation");
const glassToTray = model.setCellKind(glassShell, { row: 0, column: 0 }, "displayTray");
assert.equal(cellAt(glassToTray, { row: 0, column: 0 }).kind, "glassPanelModule", "glass shell rejects direct fixed tray installation");
const glassToPullOut = model.setCellKind(glassShell, { row: 0, column: 0 }, "pullOutShelf");
assert.equal(cellAt(glassToPullOut, { row: 0, column: 0 }).kind, "glassPanelModule", "glass shell rejects direct pull-out shelf installation");
const glassToMobileTray = model.setCellFitting(glassShell, { row: 0, column: 0 }, "mobileTray");
assert.equal(cellAt(glassToMobileTray, { row: 0, column: 0 }).kind, "glassPanelModule", "glass shell rejects mobile tray fitting");
assert.equal(cellAt(glassToMobileTray, { row: 0, column: 0 }).fitting, "none", "glass shell does not store mobile tray fitting");

const glassProduction = model.validateProductionConfig(glassShell);
assert.equal(glassProduction.status, "needsReview", "glass shell alone is buildable with production review");
assert.equal(glassProduction.counts.blocked, 0, "glass shell alone has no hard production conflicts");
assert.ok(glassProduction.issues.some((issue) => issue.title.includes("玻璃箱体")), "glass shell production report explains glass shell limits");

const invalidImportedGlass = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{ kind: "glassPanelModule", enabled: true, fitting: "rimmedDrawer" }]]
});
const invalidGlassProduction = model.validateProductionConfig(invalidImportedGlass);
assert.equal(invalidGlassProduction.status, "needsReview", "invalid imported glass fitting is normalized away before production validation");

const legacyDrawer = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  cells: [[{ kind: "boxDrawer", enabled: true }]]
});
assert.equal(cellAt(legacyDrawer, { row: 0, column: 0 }).kind, "metalBackModule", "legacy boxDrawer migrates to metal shell");
assert.equal(cellAt(legacyDrawer, { row: 0, column: 0 }).fitting, "rimmedDrawer", "legacy boxDrawer migrates to rimmed drawer fitting");

const colorSelection = { row: 0, column: 0 };
const colorConfig = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  colorScope: "accessory",
  cells: [[{ kind: "metalBackModule", enabled: true, color: "#0c0c0c", panelColors: { front: "#2da845" }, accessoryColors: { front: "#2255a8" }, interiorAccessories: [{ id: "shelf-1", kind: "shelf", mountHeightMm: 160, color: "#e8602a" }] }]]
});
assert.equal(model.getEffectiveModuleColor(colorConfig, colorSelection), "#0c0c0c", "color scope module override");
assert.equal(model.getEffectiveAccessoryColor(colorConfig, colorSelection, "shelf-1"), "#e8602a", "interior accessory color survives normalization");
assert.equal(model.getEffectiveAccessoryColor(colorConfig, colorSelection, "front"), "#2255a8", "front accessory color override");
assert.equal(model.getEffectivePanelColor(colorConfig, colorSelection, "front"), "#2da845", "panel color override");
const wholeCabinetColor = model.setColorByScope(colorConfig, colorSelection, "all", "#2255a8");
const wholeCabinetCell = model.getCellConfig(wholeCabinetColor, colorSelection);
assert.equal(wholeCabinetColor.panelColor, "#2255a8", "all scope updates the whole-cabinet color");
assert.equal(wholeCabinetColor.colorScope, "all", "all scope locks the whole-cabinet color mode");
assert.equal(wholeCabinetCell?.color, undefined, "all scope clears module color overrides");
assert.equal(wholeCabinetCell?.panelColors, undefined, "all scope clears panel color overrides");
assert.equal(wholeCabinetCell?.accessoryColors, undefined, "all scope clears accessory color overrides");
assert.equal(wholeCabinetCell?.interiorAccessories?.[0]?.color, undefined, "all scope clears interior accessory color overrides");
assert.equal(model.getEffectiveModuleColor(wholeCabinetColor, colorSelection), "#2255a8", "all scope has highest module color priority");
assert.equal(model.getEffectiveAccessoryColor(wholeCabinetColor, colorSelection, "shelf-1"), "#2255a8", "all scope has highest accessory color priority");
assert.equal(model.getEffectivePanelColor(wholeCabinetColor, colorSelection, "front"), "#2255a8", "all scope has highest panel color priority");
const coloredDrawerConfig = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  colorScope: "accessory",
  cells: [[{ kind: "metalBackModule", enabled: true, fitting: "rimmedDrawer", drawerPull: 1, color: "#0c0c0c", accessoryColors: { fitting: "#2255a8" } }]]
});
const lockedDrawerConfig = model.setWholeCabinetColor(coloredDrawerConfig, "#fffef0");
const lockedDrawerCell = model.getCellConfig(lockedDrawerConfig, colorSelection);
assert.equal(lockedDrawerCell?.fitting, "rimmedDrawer", "whole-cabinet color lock preserves the rimmed drawer fitting");
assert.equal(lockedDrawerCell?.drawerPull, 1, "whole-cabinet color lock preserves drawer pull state");
assert.equal(lockedDrawerCell?.accessoryColors, undefined, "whole-cabinet color lock removes only the drawer color override");
const recoloredModule = model.setColorByScope(colorConfig, colorSelection, "module", "#fafad2");
assert.equal(model.getEffectiveModuleColor(recoloredModule, colorSelection), "#fafad2", "module scope updates selected cell");
assert.equal(model.getEffectivePanelColor(recoloredModule, colorSelection, "front"), "#2da845", "module scope preserves panel override");
const clearedPanel = model.clearColorOverride(recoloredModule, colorSelection, { kind: "panel", panel: "front" });
assert.equal(model.getEffectivePanelColor(clearedPanel, colorSelection, "front"), "#fafad2", "clearing panel restores module inheritance");
const roundTripColorConfig = model.normalizeConfig(recoloredModule);
assert.equal(roundTripColorConfig.cells[0][0].panelColors.front, "#2da845", "panel override serializes");
assert.equal(roundTripColorConfig.cells[0][0].accessoryColors.front, "#2255a8", "accessory override serializes");

const localDepthBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500, 500],
  rowHeights: [350],
  depth: 350,
  depthSegments: [350],
  cells: [[
    { kind: "metalBackModule", enabled: true },
    { kind: "metalBackModule", enabled: true }
  ]]
});
const localDepthSelection = { row: 0, column: 0, depthIndex: 0 };
const localDepth250 = model.setSelectedCellDepth(localDepthBase, localDepthSelection, 250);
assert.equal(cellAt(localDepth250, localDepthSelection).depth, 250, "selected module stores a local depth override");
assert.equal(model.getCellDepth(localDepth250, 0, 0, 0), 250, "selected module resolves its local 250 mm depth");
assert.equal(model.getCellDepth(localDepth250, 0, 1, 0), 350, "neighbor module keeps the 350 mm segment depth");
assert.equal(model.getDimensions(localDepth250).innerDepth, 350, "one recessed module does not shrink the cabinet depth envelope");
const localDepthBom = model.buildBom(localDepth250);
assert.ok(bomQty(localDepthBom, "钢管", "250 mm") > 0, "local 250 mm module adds 250 mm tubes");
assert.ok(bomQty(localDepthBom, "钢管", "350 mm") > 0, "neighbor 350 mm module keeps 350 mm tubes");
const localDepthRestored = model.setSelectedCellDepth(localDepth250, localDepthSelection, 350);
assert.equal(cellAt(localDepthRestored, localDepthSelection).depth, undefined, "matching the segment depth restores inheritance");
const localDepthBatchMatched = model.setDepth(localDepth250, 250);
assert.equal(cellAt(localDepthBatchMatched, localDepthSelection).depth, undefined, "batch depth change clears a matching local override");

const sharedPanelBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500],
  rowHeights: [350, 350],
  depth: 350,
  depthSegments: [350],
  cells: [
    [{ kind: "metalBackModule", enabled: true }],
    [{ kind: "metalBackModule", enabled: true }]
  ]
});
const sharedPanelSelection = { row: 0, column: 0, depthIndex: 0 };
const sharedPanelTargets = model.getPhysicalStructurePanelTargets(sharedPanelBase, sharedPanelSelection, "top");
assert.equal(sharedPanelTargets.length, 2, "shared horizontal panel resolves both cell aliases");
assert.equal(sharedPanelTargets[1].selection.row, 1, "shared horizontal panel resolves the upper cell");
assert.equal(sharedPanelTargets[1].panel, "bottom", "shared horizontal panel resolves the upper bottom alias");
const sharedUpperSurfaceTarget = model.getPhysicalStructurePanelSurfaceTarget(sharedPanelBase, sharedPanelSelection, "top", "upper");
assert.equal(sharedUpperSurfaceTarget.selection.row, 1, "shared panel upper surface selects the upper module");
assert.equal(sharedUpperSurfaceTarget.panel, "bottom", "shared panel upper surface selects the upper module bottom");
const sharedLowerSurfaceTarget = model.getPhysicalStructurePanelSurfaceTarget(sharedPanelBase, { row: 1, column: 0, depthIndex: 0 }, "bottom", "lower");
assert.equal(sharedLowerSurfaceTarget.selection.row, 0, "shared panel lower surface selects the lower module");
assert.equal(sharedLowerSurfaceTarget.panel, "top", "shared panel lower surface selects the lower module top");
const sharedPanelBomQty = model.buildBom(sharedPanelBase).reduce((sum, item) => sum + item.qty, 0);
const sharedPanelDimensions = model.getDimensions(sharedPanelBase);
const sharedPanelRemoved = model.setPhysicalStructurePanel(sharedPanelBase, sharedPanelSelection, "top", "none");
assert.equal(cellAt(sharedPanelRemoved, { row: 0, column: 0 }).structure?.panels?.top, "none", "shared panel deletion clears lower top alias");
assert.equal(cellAt(sharedPanelRemoved, { row: 1, column: 0 }).structure?.panels?.bottom, "none", "shared panel deletion clears upper bottom alias");
assert.equal(model.buildBom(sharedPanelRemoved).reduce((sum, item) => sum + item.qty, 0), sharedPanelBomQty - 1, "shared panel deletion removes one physical BOM panel");
assert.deepEqual(model.getDimensions(sharedPanelRemoved), sharedPanelDimensions, "shared panel deletion preserves cabinet dimensions");
const sharedPanelColored = model.setColorByScope(sharedPanelBase, sharedPanelSelection, "panel", "#e8602a", { panel: "top" });
assert.equal(cellAt(sharedPanelColored, { row: 0, column: 0 }).panelColors?.top, "#e8602a", "shared panel color updates lower top alias");
assert.equal(cellAt(sharedPanelColored, { row: 1, column: 0 }).panelColors?.bottom, "#e8602a", "shared panel color updates upper bottom alias");
const sharedPanelColorCleared = model.clearColorOverride(sharedPanelColored, sharedPanelSelection, { kind: "panel", panel: "top" });
assert.equal(cellAt(sharedPanelColorCleared, { row: 0, column: 0 }).panelColors?.top, undefined, "shared panel color clear resets lower top alias");
assert.equal(cellAt(sharedPanelColorCleared, { row: 1, column: 0 }).panelColors?.bottom, undefined, "shared panel color clear resets upper bottom alias");

const panelSelection = { row: 0, column: 0, depthIndex: 0 };
const panelBase = model.normalizeConfig({ ...model.DEFAULT_CONFIG, cells: [[{ kind: "metalBackModule", enabled: true }]] });
const panelBaseBomQty = model.buildBom(panelBase).reduce((sum, item) => sum + item.qty, 0);
const panelWithoutTop = model.setCellStructurePanel(panelBase, panelSelection, "top", "none");
assert.equal(panelWithoutTop.cells[0][0].kind, panelBase.cells[0][0].kind, "panel deletion keeps module");
assert.equal(model.getEffectiveStructurePanelMaterial(panelWithoutTop.cells[0][0], panelWithoutTop.cells[0][0].kind, "top"), "none", "panel deletion writes none material");
assert.ok(model.buildBom(panelWithoutTop).reduce((sum, item) => sum + item.qty, 0) < panelBaseBomQty, "panel deletion reduces BOM quantity");

﻿const frameCells = Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => ({ kind: "metalBackModule", enabled: true }))));
const frameBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500, 500],
  rowHeights: [350, 350],
  depthSegments: [350, 350],
  depth: 700,
  planCells: frameCells
});
const frameTopology = model.buildFrameTopology(frameBase);
assert.ok(frameTopology.vertices.length >= 8, "frame topology creates shared vertices");
assert.ok(frameTopology.tubes.length >= 12, "frame topology creates shared tubes");
assert.ok(frameTopology.panels.length > 0, "frame topology creates panels");
assert.ok(frameTopology.supports.length > 0, "frame topology creates independently addressable bottom supports");
assert.ok(frameTopology.vertices.every((part) => part.label.includes("球节点")), "frame vertex labels are human-readable Chinese");
assert.ok(frameTopology.tubes.every((part) => part.label.includes("钢管")), "frame tube labels are human-readable Chinese");
assert.ok(frameTopology.supports.every((part) => part.label.includes("脚垫")), "frame support labels are human-readable Chinese");
assert.equal(
  frameTopology.panels.find((part) => part.id === "panel:0:0:0:top")?.label,
  "第 1 列 · 第 1 深度 · 第 1 层 · 顶面",
  "frame panel label includes a human-readable location"
);
const frameTube = frameTopology.tubes.find((part) => part.axis === "x") ?? frameTopology.tubes[0];
const tubeImpact = model.evaluateFramePartRemoval(frameBase, frameTube.id);
assert.ok(tubeImpact, "tube removal has an impact preview");
assert.ok(tubeImpact.removedTubes.includes(frameTube.id), "tube removal marks the selected tube");
const frameDimensions = model.getDimensions(frameBase);
const frameSupport = frameTopology.supports[0];
assert.equal(model.getFramePart(frameBase, frameSupport.id)?.kind, "support", "support can be selected through the generic frame-part lookup");
const supportImpact = model.evaluateFramePartRemoval(frameBase, frameSupport.id);
assert.ok(supportImpact, "support removal has an impact preview");
assert.equal(supportImpact.removedSupports.length, 1, "support removal marks exactly one support");
assert.equal(supportImpact.removedSupports[0], frameSupport.id, "support removal marks only the selected support");
assert.equal(supportImpact.removedTubes.length, 0, "support removal keeps all tubes");
assert.equal(supportImpact.removedVertices.length, 0, "support removal keeps its ball joint");
assert.equal(supportImpact.removedPanels.length, 0, "support removal keeps all panels");
assert.ok(supportImpact.priceDelta > 0, "support removal reduces the estimated price");
const frameBeforeSupportBom = model.buildBom(frameBase);
const frameAfterSupport = model.applyFramePartRemoval(frameBase, supportImpact);
const frameAfterSupportTopology = model.buildFrameTopology(frameAfterSupport);
assert.equal(model.getFramePart(frameAfterSupport, frameSupport.id), undefined, "removed support disappears from topology");
assert.equal(frameAfterSupportTopology.supports.length, frameTopology.supports.length - 1, "support removal decreases only the support count");
assert.equal(frameAfterSupportTopology.vertices.length, frameTopology.vertices.length, "support removal preserves ball joints");
assert.equal(frameAfterSupportTopology.tubes.length, frameTopology.tubes.length, "support removal preserves tubes");
assert.equal(frameAfterSupportTopology.panels.length, frameTopology.panels.length, "support removal preserves panels");
assert.equal(bomQty(model.buildBom(frameAfterSupport), "脚垫", "底部支撑"), bomQty(frameBeforeSupportBom, "脚垫", "底部支撑") - 1, "support removal decreases the BOM by one foot");
assert.deepEqual(model.getDimensions(frameAfterSupport), frameDimensions, "support removal preserves cabinet dimensions");
const frameSupportRoundTrip = model.normalizeConfig(JSON.parse(JSON.stringify(frameAfterSupport)));
assert.equal(model.getFramePart(frameSupportRoundTrip, frameSupport.id), undefined, "support deletion survives config export and import normalization");
const legacyFrameVertexId = frameSupport.vertexId.replace(/:plane:(-?\d+(?:\.\d+)?)$/, ":front:0:$1");
const legacyFrameTube = frameTopology.tubes.find((part) => part.axis === "x");
const legacyFrameTubeId = legacyFrameTube.id.replace(/:plane:(-?\d+(?:\.\d+)?)$/, ":back:1:$1");
const migratedLegacyFrameOverrides = model.normalizeConfig({
  ...frameBase,
  framePartOverrides: {
    [`support:${legacyFrameVertexId}`]: { deleted: true },
    [legacyFrameTubeId]: { deleted: true }
  }
});
assert.equal(model.getFramePart(migratedLegacyFrameOverrides, frameSupport.id), undefined, "legacy support deletion migrates to the shared physical plane ID");
assert.equal(model.getFramePart(migratedLegacyFrameOverrides, legacyFrameTube.id), undefined, "legacy tube deletion migrates to the shared physical plane ID");
assert.equal(Object.keys(migratedLegacyFrameOverrides.framePartOverrides ?? {}).length, 2, "legacy frame override migration keeps only canonical IDs");
const frameAfterTube = model.applyFramePartRemoval(frameBase, tubeImpact);
assert.equal(model.getFramePart(frameAfterTube, frameTube.id), undefined, "removed tube disappears from topology");
assert.deepEqual(model.getDimensions(frameAfterTube), frameDimensions, "tube removal preserves cabinet dimensions");
assert.ok(tubeImpact.removedPanels.length >= 0, "tube impact reports affected panels");
const frameVertex = frameTopology.vertices.find((part) => part.connectedTubeIds.length > 0);
const vertexImpact = model.evaluateFramePartRemoval(frameBase, frameVertex.id);
assert.ok(vertexImpact.removedTubes.length > 0, "vertex removal includes connected tubes");
const frameAfterVertex = model.applyFramePartRemoval(frameBase, vertexImpact);
assert.equal(model.getFramePart(frameAfterVertex, frameVertex.id), undefined, "removed vertex disappears from topology");
const supportedVertexImpact = model.evaluateFramePartRemoval(frameBase, frameSupport.vertexId);
assert.ok(supportedVertexImpact.removedSupports.includes(frameSupport.id), "removing a supported vertex also removes its attached bottom support");
const framePanel = frameTopology.panels[0];
const panelImpact = model.evaluateFramePartRemoval(frameBase, framePanel.id);
assert.equal(panelImpact.removedPanels.length, 1, "panel removal only removes the selected panel");
const frameAfterPanel = model.applyFramePartRemoval(frameBase, panelImpact);
assert.equal(model.getFramePart(frameAfterPanel, framePanel.id), undefined, "removed panel disappears from topology");
assert.deepEqual(model.getDimensions(frameAfterPanel), frameDimensions, "panel removal preserves cabinet dimensions");

const motionBase = model.normalizeConfig({
  ...model.DEFAULT_CONFIG,
  columnWidths: [500, 500, 500, 500, 500],
  rowHeights: [500],
  depthSegments: [500],
  depth: 500,
  planCells: [[[
    { kind: "metalBackModule", enabled: true, frontAccessory: "dropDoor", doorOpen: 0 },
    { kind: "metalBackModule", enabled: true, frontAccessory: "flipUpDoor", doorOpen: 0 },
    { kind: "metalBackModule", enabled: true, frontAccessory: "glassDropDoor", doorOpen: 0 },
    { kind: "metalBackModule", enabled: true, fitting: "rimmedDrawer", drawerPull: 0 },
    { kind: "metalBackModule", enabled: true, interiorAccessories: [{ id: "motion-tray", kind: "mobileTray", mountHeightMm: 0, pull: 0 }] }
  ]]]
});
const motionDimensions = model.getDimensions(motionBase);
function expectMotionSummary(config, group, total, open, label) {
  const summary = model.getMovingAccessorySummary(config, group);
  assert.equal(summary.total, total, label + " total");
  assert.equal(summary.open, open, label + " open");
}

expectMotionSummary(motionBase, "all", 5, 0, "motion summary includes glass doors");
expectMotionSummary(motionBase, "dropDoor", 1, 0, "drop-door summary excludes flip and glass doors");
expectMotionSummary(motionBase, "flipUpDoor", 1, 0, "flip-up summary finds only flip-up doors");
expectMotionSummary(motionBase, "glassDoor", 1, 0, "glass-door summary finds only glass doors");
expectMotionSummary(motionBase, "drawer", 1, 0, "drawer summary finds rimmed drawers");
expectMotionSummary(motionBase, "mobileTray", 1, 0, "mobile-tray summary finds interior trays");
assert.deepEqual([...model.getAvailableMovingAccessoryGroups(motionBase)], ["dropDoor", "flipUpDoor", "glassDoor", "drawer", "mobileTray"], "available motion groups include installed glass doors");
const allMotionOpen = model.setMovingAccessoryGroupOpen(motionBase, "all", true);
expectMotionSummary(allMotionOpen, "all", 5, 5, "all-motion toggle opens every batch-capable accessory");
assert.equal(model.getCellConfig(allMotionOpen, { row: 0, column: 2, depthIndex: 0 })?.doorOpen, 1, "all-motion toggle opens glass doors");
const dropDoorClosed = model.setMovingAccessoryGroupOpen(allMotionOpen, "dropDoor", false);
expectMotionSummary(dropDoorClosed, "dropDoor", 1, 0, "drop-door toggle closes only lower-hinged doors");
expectMotionSummary(dropDoorClosed, "all", 5, 4, "drop-door toggle preserves other moving accessory states");
const glassDoorClosed = model.setMovingAccessoryGroupOpen(dropDoorClosed, "glassDoor", false);
expectMotionSummary(glassDoorClosed, "glassDoor", 1, 0, "glass-door toggle closes only glass doors");
expectMotionSummary(glassDoorClosed, "all", 5, 3, "glass-door toggle preserves other moving accessory states");
const drawerClosed = model.setMovingAccessoryGroupOpen(glassDoorClosed, "drawer", false);
expectMotionSummary(drawerClosed, "drawer", 1, 0, "drawer toggle closes only drawers");
const trayClosed = model.setMovingAccessoryGroupOpen(drawerClosed, "mobileTray", false);
expectMotionSummary(trayClosed, "mobileTray", 1, 0, "mobile-tray toggle closes only trays");
assert.deepEqual(model.getDimensions(trayClosed), motionDimensions, "batch motion never changes cabinet dimensions");

const logicMatrix = createAccessoryLogicMatrix();
assertAccessoryLogicMatrix(logicMatrix);

console.log("Accessory logic verification passed.");
