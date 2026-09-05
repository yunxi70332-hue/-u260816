import {
  DEFAULT_CONFIG,
  expandCell,
  cloneColumn,
  getPlanCells,
  getDimensions,
  getActiveCellCount,
  setCellFrontAccessory
} from "../src/model";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else {
    console.log("ok:", message);
  }
}

function enabledMap(config: ReturnType<typeof getPlanCells> extends never ? never : any) {
  const plan = getPlanCells(config);
  return plan.map((row: any) => row.map((depth: any) => depth.map((cell: any) => (cell.enabled ? 1 : 0))));
}

// --- 1. 单格扩展: 1x1 起步, 向右扩展只激活一格 ---
let config = DEFAULT_CONFIG; // 1 列 x 1 层, 单格
let sel = { row: 0, column: 0, depthIndex: 0 };

const right = expandCell(config, sel, "right");
config = right.config; sel = right.selection;
assert(config.columnWidths.length === 2, "right: 新增一列, columnWidths=2");
assert(config.columnWidths[1] === config.columnWidths[0], "right: 新列宽度复制源列");
const mapR = enabledMap(config);
assert(mapR[0][0][0] === 1 && mapR[0][0][1] === 1, "right: 仅选中行/深度的格子被启用");
assert(getActiveCellCount(config) === 2, "right: 活动格数=2 (而不是整列 2 格全开 → 若多层时这里才会暴露)");
assert(sel.column === 1, "right: 选中态移动到新格");

// 构造 3 层 x 1 列, 再向右扩展 → 只应激活 1 格 (旧行为会激活 3 格)
config = expandCell(expandCell(DEFAULT_CONFIG, { row: 0, column: 0, depthIndex: 0 }, "top").config, { row: 1, column: 0, depthIndex: 0 }, "top").config;
sel = { row: 2, column: 0, depthIndex: 0 };
const right3 = expandCell(config, sel, "right");
const mapR3 = enabledMap(right3.config);
assert(enabledMap(right3.config).flat(2).reduce((a: number, b: number) => a + b, 0) === 4,
  `top+right: 3 层结构向右扩展只加 1 格 (总活动格 3→4, 旧行为会变 6): 实际 ${enabledMap(right3.config).flat(2).reduce((a: number, b: number) => a + b, 0)}`);
assert(mapR3[1]?.[0]?.[1] === 0 && mapR3[2]?.[0]?.[1] === 1, "right: 仅相邻行(row2)的新格启用, 其他行保持禁用");

// --- 2. 向上扩展 (网格边缘) ---
const up = expandCell(DEFAULT_CONFIG, { row: 0, column: 0, depthIndex: 0 }, "top");
assert(up.config.rowHeights.length === 2, "top: 新增一行 rowHeights=2");
assert(enabledMap(up.config).flat(2).reduce((a: number, b: number) => a + b, 0) === 2, "top: 只激活 1 个新格");

// --- 3. cloneColumn: 整列同配置克隆(门板/配件/颜色随列复制) ---
// 搭一个 3 层 x 1 列, 顶层装下翻门, 克隆后新列每格配置应与源列一致(含门)
let base = DEFAULT_CONFIG;
base = expandCell(base, { row: 0, column: 0, depthIndex: 0 }, "top").config;
base = expandCell(base, { row: 1, column: 0, depthIndex: 0 }, "top").config;
base = setCellFrontAccessory(base, { row: 1, column: 0, depthIndex: 0 }, "dropDoor");
const cloned = cloneColumn(base, 0);
assert(cloned.column === 1, "cloneColumn: 新列索引=1 (插在右侧)");
assert(cloned.config.columnWidths[1] === cloned.config.columnWidths[0], "cloneColumn: 列宽一致(同模块参数)");
const srcCells = getPlanCells(base);
const dstCells = getPlanCells(cloned.config);
let sameConfig = true;
for (let row = 0; row < srcCells.length; row += 1) {
  const a = srcCells[row][0][0];
  const b = dstCells[row][0][1];
  if (JSON.stringify({ ...a, depth: undefined }) !== JSON.stringify({ ...b, depth: undefined })) sameConfig = false;
}
assert(sameConfig, "cloneColumn: 每行格子配置(含下翻门)与源列完全一致");
assert(dstCells[1][0][1].frontAccessory === "dropDoor", "cloneColumn: 门板(下翻门配件)随列复制");
const outerBefore = getDimensions(base).outerWidth;
const outerAfter = getDimensions(cloned.config).outerWidth;
assert(outerAfter === outerBefore + cloned.config.columnWidths[0], `cloneColumn: 外部尺寸增加一列宽 (${outerBefore} → ${outerAfter})`);

// --- 3b. cloneColumn 左插入: insertAt=0 时新列在源列左侧 ---
const leftCloned = cloneColumn(base, 0, 0);
assert(leftCloned.column === 0, "cloneColumn: 左插入新列索引=0");
assert(getPlanCells(leftCloned.config)[1][0][0].frontAccessory === "dropDoor"
  && getPlanCells(leftCloned.config)[1][0][1].frontAccessory === "dropDoor",
  "cloneColumn: 左插入后两列顶层均带下翻门");

// --- 4. cloneColumn 保留源列的空洞 (enabled=false 同样克隆) ---
const withHole = expandCell(base, { row: 2, column: 0, depthIndex: 0 }, "right");
const holeCol = getPlanCells(withHole.config);
assert(holeCol[0][0][1].enabled === false && holeCol[0][0][1].enabled === false, "预置: 右列只激活一格(其余为洞)");
const clonedHole = cloneColumn(withHole.config, 1);
const clonedHoleCells = getPlanCells(clonedHole.config);
assert(clonedHoleCells[0][0][2].enabled === false && clonedHoleCells[1][0][2].enabled === false, "cloneColumn: 源列的空洞同样被克隆为禁用");

// --- 5. MAX 守卫 ---
let maxed = clonedHole.config;
for (let i = 0; i < 12; i += 1) maxed = cloneColumn(maxed, 0).config;
assert(maxed.columnWidths.length <= 10, `cloneColumn: 列数不超过 MAX_GRID_COUNT=10 (实际 ${maxed.columnWidths.length})`);

console.log(process.exitCode ? "\n=== 存在失败 ===" : "\n=== 全部通过 ===");
