import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { assertAccessoryLogicMatrix, createAccessoryLogicMatrix } from "./export-accessory-logic-matrix.mjs";

const root = process.cwd();

function loadTs(relativePath, deps = {}) {
  const sourcePath = path.join(root, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;

  const sandbox = {
    console,
    exports: {},
    module: { exports: {} },
    require(id) {
      if (id === "./accessoryCatalog" || id === "./accessoryCatalog.ts") return deps.accessoryCatalog;
      return require(id);
    }
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

const accessoryCatalog = loadTs("src/accessoryCatalog.ts");
const model = loadTs("src/model.ts", { accessoryCatalog });

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

function bomQty(bom, name, spec) {
  return bom.find((item) => item.name === name && (item.baseSpec ?? item.spec) === spec)?.qty ?? 0;
}

function bomLineByBaseSpecAndColor(bom, name, spec, color) {
  return bom.find((item) => item.name === name && (item.baseSpec ?? item.spec) === spec && item.color === color);
}

const desk = model.createDeskPreset();
const deskBom = model.buildBom(desk);
const deskTop = deskBom.find((item) => item.name === "跨格桌面");
const deskValidationSkipped = {
  reason: "desk preset BOM amount and tabletop path checks are skipped until the desk model is rebuilt.",
  deskTop: deskTop ?? null
};

const lowDesk = { ...desk, rowHeights: [100, 100] };
expectStatus(pick(model.evaluateCellFitting(lowDesk, { row: 0, column: 0 }, "mobileTray")), "blocked", "100 mm mobile tray");
expectStatus(pick(model.evaluateCellKind(lowDesk, { row: 0, column: 0 }, "displayTray")), "officialExact", "100 mm fixed tray");
expectStatus(pick(model.evaluateCellFitting(lowDesk, { row: 0, column: 0 }, "rimmedDrawer")), "needsHardwareCheck", "100 mm rimmed drawer");

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
assert.equal(bomQty(threeColumnFactoryBom, "横向钢管", "750 mm"), 24, "factory BOM counts 750 horizontal tubes by levels");
assert.equal(bomQty(threeColumnFactoryBom, "深度钢管", "350 mm") + bomQty(threeColumnFactoryBom, "竖向钢管", "350 mm"), 32, "factory BOM counts 350 tubes across depth and vertical runs");
assert.equal(bomQty(threeColumnFactoryBom, "竖向钢管", "175 mm"), 8, "factory BOM counts 175 vertical tubes");
assert.equal(bomQty(threeColumnFactoryBom, "金属扣板", "750 x 350 mm"), 18, "factory BOM merges horizontal panels and door-layer backs into 750 x 350扣板");
assert.equal(bomQty(threeColumnFactoryBom, "下翻门", "750 x 350 mm"), 6, "factory BOM splits lower flap door panels");
assert.equal(bomQty(threeColumnFactoryBom, "外板", "350 x 350 mm"), 4, "factory BOM counts outer side panels only on left/right sides of door layers");
assert.equal(bomQty(threeColumnFactoryBom, "内板", "350 x 350 mm"), 4, "factory BOM counts shared inner mounting panels only where hardware is installed");
assert.equal(bomQty(threeColumnFactoryBom, "一元锁", "下翻门用"), 6, "factory BOM counts one lock per lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "锁盒+螺丝", "1锁盒+2颗螺丝/扇"), 6, "factory BOM counts lock boxes by lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "下翻门铰链", "常用"), 12, "factory BOM counts two hinges per lower flap door");
assert.equal(bomQty(threeColumnFactoryBom, "铰链螺丝", "3颗/只铰链"), 36, "factory BOM counts hinge screws by hinge");
assert.equal(bomQty(threeColumnFactoryBom, "L型金属件", "下翻门铰链配件"), 12, "factory BOM counts L-shaped metal pieces by hinge");
assert.equal(bomQty(threeColumnFactoryBom, "L型垫片", "下翻门铰链配件"), 12, "factory BOM counts L-shaped pads by hinge");
assert.equal(bomQty(threeColumnFactoryBom, "月牙扣", "3个/只铰链"), 36, "factory BOM counts crescent clips by hinge");
assert.equal(bomQty(threeColumnFactoryBom, "膨胀螺丝", "2颗/根钢管"), 128, "factory BOM counts two expansion screws per tube");

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

assert.equal(island.workSurfaces.length, 0, "kitchen island should not add a non-USM tabletop by default");
const islandDimensions = model.getDimensions(island);
assert.equal(islandDimensions.outerWidth, 1773, "kitchen island outer width follows module frame width");
assert.equal(islandDimensions.outerDepth, 1073, "kitchen island outer depth follows three depth segments");
assert.equal(islandDimensions.outerHeight, 740, "kitchen island outer height uses two rows and glides");
const islandBom = model.buildBom(island);
const islandDepthTubes = islandBom.find((item) => item.name === "深度钢管" && item.spec === "350 mm");
assert.ok(islandDepthTubes && islandDepthTubes.qty > 12, "kitchen island BOM traverses all three depth segments");
assert.ok(!islandBom.some((item) => item.name === "桥接台面" || item.name === "跨格桌面"), "kitchen island BOM excludes non-USM tabletops");
assert.equal(islandBom.some((item) => item.name === "金属背板"), false, "factory BOM merges metal back panels into扣板 rows");
assert.equal(bomQty(islandBom, "金属扣板", "500 x 350 mm"), 22, "factory island BOM keeps 500 mm panels in the shared扣板 count");
assert.equal(bomQty(islandBom, "金属扣板", "750 x 350 mm"), 10, "factory island BOM keeps 750 mm panels in the shared扣板 count");

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
assert.ok(model.buildBom(mixedDepth).some((item) => item.name === "深度钢管" && item.spec === "500 mm"), "mixed-depth BOM includes 500 mm depth tubes");
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
assert.ok(islandExpandedBom.some((item) => item.name === "深度钢管" && item.spec === "350 mm" && item.qty > islandDepthTubes.qty), "expanded kitchen island BOM includes the inserted 350 mm depth segment");
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

const logicMatrix = createAccessoryLogicMatrix();
assertAccessoryLogicMatrix(logicMatrix);

console.log("Accessory logic verification passed.");
console.log(JSON.stringify({
  deskValidationSkipped
}, null, 2));
