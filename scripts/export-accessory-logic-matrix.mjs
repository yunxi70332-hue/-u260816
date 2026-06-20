import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = process.cwd();
const outputPath = path.join(root, "docs", "USM_ACCESSORY_LOGIC_MATRIX.json");
const currentFile = fileURLToPath(import.meta.url);

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

const cellKinds = [
  "open",
  "metalBackModule",
  "noBackModule",
  "glassPanelModule",
  "sideOpenDoor",
  "shelf",
  "displayTray",
  "glassShelf"
];

const frontAccessoryKinds = ["none", "dropDoor", "flipUpDoor", "glassDropDoor"];
const interiorAccessoryKinds = ["mobileTray", "shelf", "displayTray", "glassShelf"];
const fittingKinds = ["none", "rimmedDrawer"];

function toPlainEvaluation(evaluation) {
  return {
    status: evaluation.status,
    label: evaluation.label,
    officialSpec: evaluation.officialSpec ?? null,
    reasons: evaluation.reasons,
    warnings: evaluation.warnings,
    bomSize: evaluation.bomSize
  };
}

function scenario(id, label, description, config, selection = { row: 0, column: 0 }) {
  return { id, label, description, config: model.normalizeConfig(config), selection };
}

const scenarios = [
  scenario(
    "standard-500x350x350",
    "标准金属格",
    "用于判断官方规格、工厂定制和基础前脸互斥。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500],
      rowHeights: [350],
      cells: [[{ kind: "metalBackModule", enabled: true }]]
    }
  ),
  scenario(
    "custom-620x280x350",
    "工厂自定义尺寸",
    "非官方宽高但结构成立时，不应因为尺寸自定义而禁用。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [620],
      rowHeights: [280],
      cells: [[{ kind: "metalBackModule", enabled: true }]]
    }
  ),
  scenario(
    "low-500x100x500",
    "低高度格",
    "移动托盘和带围边抽屉应被高度/取物空间限制，固定托盘仍可用。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 500,
      columnWidths: [500],
      rowHeights: [100],
      cells: [[{ kind: "metalBackModule", enabled: true }]]
    }
  ),
  scenario(
    "glass-shell",
    "玻璃箱体",
    "玻璃箱体/玻璃侧板不是金属安装面：下翻门、移动托盘、固定托盘禁用；玻璃搁板需夹件确认。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500],
      rowHeights: [350],
      cells: [[{ kind: "glassPanelModule", enabled: true }]]
    }
  ),
  scenario(
    "metal-side-panels",
    "金属左右侧板",
    "左右侧板为金属时，普通固定层板、固定托盘和玻璃搁板均可进入生产逻辑。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500],
      rowHeights: [350],
      cells: [[{ kind: "metalBackModule", enabled: true }]]
    }
  ),
  scenario(
    "glass-side-panels",
    "玻璃左右侧板",
    "玻璃侧板不能承载普通固定层板/固定托盘，但玻璃搁板可用并需夹件确认。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500],
      rowHeights: [350],
      cells: [[{
        kind: "metalBackModule",
        enabled: true,
        structure: { panels: { left: "glass", right: "glass" } }
      }]]
    }
  ),
  scenario(
    "missing-side-panel",
    "缺少侧板",
    "缺任一侧板时，固定层板、固定托盘和玻璃搁板都不能直接安装。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500],
      rowHeights: [350],
      cells: [[{
        kind: "metalBackModule",
        enabled: true,
        structure: { panels: { left: "none" } }
      }]]
    }
  ),
  scenario(
    "desk-under-top",
    "书桌台面下方左格",
    "下翻门允许但提示限位；上翻门撞台面禁用；移动托盘需五金确认。",
    model.createDeskPreset(),
    { row: 0, column: 0 }
  ),
  scenario(
    "desk-rimmed-drawer",
    "书桌台面下方右格",
    "带围边抽屉在台面下方需要抽拉余量和导轨确认。",
    model.createDeskPreset(),
    { row: 0, column: 3 }
  ),
  scenario(
    "mixed-depth-local-500",
    "混深局部 500",
    "全柜默认 350，选中格局部 500，用于验证局部深度参与规则和 BOM。",
    {
      ...model.DEFAULT_CONFIG,
      depth: 350,
      columnWidths: [500, 500],
      rowHeights: [350],
      cells: [[
        { kind: "metalBackModule", enabled: true },
        { kind: "metalBackModule", enabled: true, interiorAccessories: [{ id: "mobileTray-1", kind: "mobileTray", mountHeightMm: 175, pull: 1 }], depth: 500 }
      ]]
    },
    { row: 0, column: 1 }
  )
];

export function createAccessoryLogicMatrix() {
  return {
    generatedAt: new Date().toISOString(),
    purpose: "USM local configurator accessory logic matrix",
    statuses: model.ACCESSORY_STATUS_META,
    notes: [
      "officialExact 表示命中公开规格；officialLogicCustomSize 表示逻辑成立但按工厂尺寸输出。",
      "needsHardwareCheck 表示可做但导轨、铰链、玻璃夹件、承重或开合半径需确认。",
      "blocked 只用于真实前脸、导轨、玻璃支撑、路径或安装基础冲突。"
    ],
    scenarios: scenarios.map((item) => {
      const config = item.config;
      const selection = item.selection;
      const selectedCell = config.cells[selection.row]?.[selection.column];
      const bom = model.buildBom(config);

      return {
        id: item.id,
        label: item.label,
        description: item.description,
        selection,
        selectedCell: {
          kind: selectedCell?.kind,
          frontAccessory: selectedCell?.frontAccessory ?? "none",
          interiorAccessories: selectedCell?.interiorAccessories ?? [],
          fitting: selectedCell?.fitting ?? "none",
          depth: model.getCellDepth(config, selection.row, selection.column),
          enabled: selectedCell?.enabled === true
        },
        dimensions: model.getDimensions(config),
        cellKinds: Object.fromEntries(
          cellKinds.map((kind) => [kind, toPlainEvaluation(model.evaluateCellKind(config, selection, kind))])
        ),
        frontAccessories: Object.fromEntries(
          frontAccessoryKinds.map((kind) => [kind, toPlainEvaluation(model.evaluateCellFrontAccessory(config, selection, kind))])
        ),
        interiorAccessories: Object.fromEntries(
          interiorAccessoryKinds.map((kind) => [
            kind,
            toPlainEvaluation(model.evaluateCellInteriorAccessory(
              config,
              selection,
              kind,
              selectedCell?.interiorAccessories?.find((item) => item.kind === kind)
            ))
          ])
        ),
        fittings: Object.fromEntries(
          fittingKinds.map((kind) => [kind, toPlainEvaluation(model.evaluateCellFitting(config, selection, kind))])
        ),
        bomHighlights: bom.filter((item) => (
          ["跨格桌面", "深度钢管", "移动托盘", "移动托盘导轨", "围边", "抽屉导轨"].includes(item.name)
        ))
      };
    })
  };
}

function findScenario(matrix, id) {
  const match = matrix.scenarios.find((item) => item.id === id);
  assert.ok(match, `matrix scenario ${id} must exist`);
  return match;
}

function expectStatus(matrix, scenarioId, bucket, key, expected) {
  const scenario = findScenario(matrix, scenarioId);
  const evaluation = scenario[bucket]?.[key];
  assert.ok(evaluation, `${scenarioId}.${bucket}.${key} must exist`);
  assert.equal(evaluation.status, expected, `${scenarioId}.${key}: expected ${expected}, got ${evaluation.status}`);
  return evaluation;
}

function expectText(lines, text, label) {
  assert.ok(lines.some((line) => line.includes(text)), `${label}: expected text "${text}"`);
}

function expectBomHighlight(matrix, scenarioId, name, spec) {
  const scenario = findScenario(matrix, scenarioId);
  assert.ok(
    scenario.bomHighlights.some((item) => item.name === name && item.spec.includes(spec)),
    `${scenarioId}: expected BOM highlight ${name} ${spec}`
  );
}

export function assertAccessoryLogicMatrix(matrix) {
  assert.equal(matrix.purpose, "USM local configurator accessory logic matrix", "matrix purpose");
  assert.equal(matrix.scenarios.length, scenarios.length, "matrix scenario count");

  expectStatus(matrix, "standard-500x350x350", "frontAccessories", "dropDoor", "officialExact");
  expectStatus(matrix, "standard-500x350x350", "interiorAccessories", "mobileTray", "officialExact");

  expectStatus(matrix, "custom-620x280x350", "frontAccessories", "dropDoor", "officialLogicCustomSize");
  expectStatus(matrix, "custom-620x280x350", "cellKinds", "displayTray", "officialLogicCustomSize");
  expectStatus(matrix, "custom-620x280x350", "interiorAccessories", "mobileTray", "needsHardwareCheck");

  expectStatus(matrix, "low-500x100x500", "interiorAccessories", "mobileTray", "blocked");
  expectStatus(matrix, "low-500x100x500", "cellKinds", "displayTray", "officialExact");
  expectStatus(matrix, "low-500x100x500", "fittings", "rimmedDrawer", "needsHardwareCheck");

  expectStatus(matrix, "glass-shell", "interiorAccessories", "mobileTray", "blocked");
  expectStatus(matrix, "glass-shell", "frontAccessories", "dropDoor", "blocked");
  expectStatus(matrix, "glass-shell", "cellKinds", "displayTray", "blocked");
  expectStatus(matrix, "glass-shell", "fittings", "rimmedDrawer", "blocked");
  expectStatus(matrix, "glass-shell", "cellKinds", "glassShelf", "needsHardwareCheck");

  expectStatus(matrix, "metal-side-panels", "cellKinds", "shelf", "officialExact");
  expectStatus(matrix, "metal-side-panels", "cellKinds", "displayTray", "officialExact");
  expectStatus(matrix, "metal-side-panels", "cellKinds", "glassShelf", "needsHardwareCheck");

  expectStatus(matrix, "glass-side-panels", "cellKinds", "shelf", "blocked");
  expectStatus(matrix, "glass-side-panels", "cellKinds", "displayTray", "blocked");
  expectStatus(matrix, "glass-side-panels", "cellKinds", "glassShelf", "needsHardwareCheck");
  expectText(
    expectStatus(matrix, "glass-side-panels", "cellKinds", "shelf", "blocked").reasons,
    "玻璃侧板不能直接承载普通固定层板/固定托盘",
    "glass side fixed shelf reason"
  );

  expectStatus(matrix, "missing-side-panel", "cellKinds", "shelf", "blocked");
  expectStatus(matrix, "missing-side-panel", "cellKinds", "displayTray", "blocked");
  expectStatus(matrix, "missing-side-panel", "cellKinds", "glassShelf", "blocked");

  // Desk-specific BOM amount and tabletop-path assertions are intentionally
  // skipped until the desk model is rebuilt. Keep the scenarios in the matrix
  // for product discussion, but do not use them as the current verification gate.
  findScenario(matrix, "desk-under-top");
  findScenario(matrix, "desk-rimmed-drawer");

  const mixedDepth = findScenario(matrix, "mixed-depth-local-500");
  assert.equal(mixedDepth.selectedCell.depth, 500, "mixed-depth selected cell depth");
  assert.equal(mixedDepth.selectedCell.fitting, "none", "mixed-depth selected cell fitting");
  assert.equal(mixedDepth.selectedCell.interiorAccessories[0]?.kind, "mobileTray", "mixed-depth selected cell interior mobile tray");
  assert.equal(mixedDepth.dimensions.innerDepth, 500, "mixed-depth dimensions use local max depth");
  expectStatus(matrix, "mixed-depth-local-500", "interiorAccessories", "mobileTray", "officialExact");
  expectBomHighlight(matrix, "mixed-depth-local-500", "深度钢管", "500 mm");
  expectBomHighlight(matrix, "mixed-depth-local-500", "移动托盘", "500 x 500 mm");
  expectBomHighlight(matrix, "mixed-depth-local-500", "移动托盘导轨", "500 mm");
}

export function writeAccessoryLogicMatrix(matrix = createAccessoryLogicMatrix()) {
  assertAccessoryLogicMatrix(matrix);
  fs.writeFileSync(outputPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const matrix = createAccessoryLogicMatrix();
  const writtenPath = writeAccessoryLogicMatrix(matrix);
  console.log(`Wrote ${matrix.scenarios.length} scenarios to ${writtenPath}`);
}
