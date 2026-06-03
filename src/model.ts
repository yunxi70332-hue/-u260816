export const DEPTH_OPTIONS = [250, 350, 395, 500] as const;
export const HEIGHT_OPTIONS = [100, 175, 250, 350, 395, 500] as const;
export const WIDTH_OPTIONS = [250, 350, 395, 500, 750] as const;
export const MIN_CUSTOM_SIZE = 80;
export const MAX_CUSTOM_SIZE = 1200;

export type TabKey = "structure" | "fittings" | "colors" | "bom";
export type CellKind = "open" | "back" | "drop" | "drawer" | "glass" | "tray";
export type FeetKind = "glides" | "caster-low" | "caster-high";
export type FrameFinish = "chrome" | "graphite";
export type StructureMode = "complete" | "noFront" | "noPanels" | "frameOnly";
export type ColorScope = "all" | "single";

export interface CellConfig {
  kind: CellKind;
  color?: string;
}

export interface CabinetConfig {
  depth: number;
  columnWidths: number[];
  rowHeights: number[];
  panelColor: string;
  colorScope: ColorScope;
  frameFinish: FrameFinish;
  feet: FeetKind;
  structureMode: StructureMode;
  showDimensions: boolean;
  cells: CellConfig[][];
}

export interface Selection {
  row: number;
  column: number;
}

export interface ColorOption {
  id: string;
  label: string;
  value: string;
  text: string;
}

export interface BomItem {
  name: string;
  spec: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface FeetOption {
  id: FeetKind;
  label: string;
  heightOffset: number;
  unitPrice: number;
}

export const COLOR_OPTIONS: ColorOption[] = [
  { id: "black", label: "黑色", value: "#121314", text: "#ffffff" },
  { id: "pure-white", label: "白色", value: "#f4f2eb", text: "#111111" },
  { id: "coffee", label: "奶咖", value: "#b9a68d", text: "#111111" },
  { id: "steel-blue", label: "钢蓝", value: "#506a78", text: "#ffffff" },
  { id: "olive", label: "橄榄绿", value: "#59644c", text: "#ffffff" },
  { id: "sapphire", label: "宝石蓝", value: "#244e7a", text: "#ffffff" },
  { id: "goose-yellow", label: "鹅黄", value: "#f1d86a", text: "#111111" },
  { id: "orange", label: "橙色", value: "#e76f3c", text: "#111111" },
  { id: "pink", label: "粉红", value: "#d9829d", text: "#111111" },
  { id: "eggplant", label: "茄子蓝", value: "#4c426b", text: "#ffffff" },
  { id: "green", label: "绿色", value: "#2f7a55", text: "#ffffff" },
  { id: "ruby", label: "红色", value: "#a4262c", text: "#ffffff" },
  { id: "yellow", label: "黄色", value: "#f2d13b", text: "#111111" },
  { id: "silver", label: "银色", value: "#b8c0c5", text: "#111111" },
  { id: "dark-grey", label: "深灰", value: "#4a4f53", text: "#ffffff" },
  { id: "brown", label: "棕色", value: "#6b4d3a", text: "#ffffff" }
];

export const CELL_OPTIONS: Array<{ id: CellKind; label: string; short: string }> = [
  { id: "open", label: "开放格", short: "开" },
  { id: "back", label: "背板格", short: "背" },
  { id: "drop", label: "下翻门", short: "门" },
  { id: "drawer", label: "三抽屉", short: "抽" },
  { id: "glass", label: "玻璃门", short: "玻" },
  { id: "tray", label: "托盘格", short: "托" }
];

export const STRUCTURE_MODE_OPTIONS: Array<{ id: StructureMode; label: string; description: string }> = [
  { id: "complete", label: "完整箱体", description: "保留当前格子的板件和门板" },
  { id: "noFront", label: "去正面", description: "隐藏正面门板，保留背板和内部结构" },
  { id: "noPanels", label: "去面板", description: "批量显示为开放格，保留底部搁板" },
  { id: "frameOnly", label: "全框架", description: "隐藏全部板件，只保留框架、钢管和节点" }
];

export const FEET_OPTIONS: FeetOption[] = [
  { id: "glides", label: "脚垫", heightOffset: 40, unitPrice: 42 },
  { id: "caster-low", label: "低滚轮", heightOffset: 64, unitPrice: 135 },
  { id: "caster-high", label: "高滚轮", heightOffset: 88, unitPrice: 168 }
];

export const DEFAULT_CONFIG: CabinetConfig = {
  depth: 350,
  columnWidths: [750],
  rowHeights: [350],
  panelColor: "#f4f2eb",
  colorScope: "all",
  frameFinish: "chrome",
  feet: "glides",
  structureMode: "complete",
  showDimensions: true,
  cells: [[{ kind: "drop" }]]
};

export function createCells(rows: number, columns: number, kind: CellKind = "open"): CellConfig[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ kind }))
  );
}

export function normalizeConfig(input: Partial<CabinetConfig> | null | undefined): CabinetConfig {
  const rowHeights = sanitizeSizes(input?.rowHeights, HEIGHT_OPTIONS, DEFAULT_CONFIG.rowHeights);
  const columnWidths = sanitizeSizes(input?.columnWidths, WIDTH_OPTIONS, DEFAULT_CONFIG.columnWidths);
  const rows = rowHeights.length;
  const columns = columnWidths.length;
  const cells = createCells(rows, columns);
  const feet: FeetKind = FEET_OPTIONS.some((option) => option.id === input?.feet) ? input?.feet as FeetKind : "glides";
  const structureMode: StructureMode = STRUCTURE_MODE_OPTIONS.some((option) => option.id === input?.structureMode)
    ? input?.structureMode as StructureMode
    : "complete";

  input?.cells?.slice(0, rows).forEach((row, rowIndex) => {
    row?.slice(0, columns).forEach((cell, columnIndex) => {
      cells[rowIndex][columnIndex] = {
        kind: CELL_OPTIONS.some((option) => option.id === cell?.kind) ? cell.kind : "open",
        color: COLOR_OPTIONS.some((color) => color.value === cell?.color) ? cell.color : undefined
      };
    });
  });

  return {
    depth: sanitizeSize(input?.depth, DEFAULT_CONFIG.depth),
    columnWidths,
    rowHeights,
    panelColor: COLOR_OPTIONS.some((color) => color.value === input?.panelColor)
      ? String(input?.panelColor)
      : DEFAULT_CONFIG.panelColor,
    colorScope: input?.colorScope === "single" ? "single" : "all",
    frameFinish: input?.frameFinish === "graphite" ? "graphite" : "chrome",
    feet,
    structureMode,
    showDimensions: input?.showDimensions ?? DEFAULT_CONFIG.showDimensions,
    cells
  };
}

export function resizeRows(config: CabinetConfig, rows: number): CabinetConfig {
  const nextRows = clamp(rows, 1, 5);
  const rowHeights = fitArray(config.rowHeights, nextRows, 350);
  const cells = createCells(nextRows, config.columnWidths.length);

  for (let row = 0; row < nextRows; row += 1) {
    for (let column = 0; column < config.columnWidths.length; column += 1) {
      cells[row][column] = config.cells[row]?.[column] ?? { kind: "open" };
    }
  }

  return { ...config, rowHeights, cells };
}

export function resizeColumns(config: CabinetConfig, columns: number): CabinetConfig {
  const nextColumns = clamp(columns, 1, 5);
  const columnWidths = fitArray(config.columnWidths, nextColumns, 350);
  const cells = createCells(config.rowHeights.length, nextColumns);

  for (let row = 0; row < config.rowHeights.length; row += 1) {
    for (let column = 0; column < nextColumns; column += 1) {
      cells[row][column] = config.cells[row]?.[column] ?? { kind: "open" };
    }
  }

  return { ...config, columnWidths, cells };
}

export function insertColumn(config: CabinetConfig, index: number): CabinetConfig {
  if (config.columnWidths.length >= 5) {
    return config;
  }

  const insertAt = clamp(index, 0, config.columnWidths.length);
  const columnWidths = [...config.columnWidths];
  const sourceWidth = columnWidths[Math.max(0, Math.min(insertAt - 1, columnWidths.length - 1))] ?? 350;
  columnWidths.splice(insertAt, 0, sourceWidth);

  const cells = config.cells.map((row) => {
    const nextRow = row.map((cell) => ({ ...cell }));
    nextRow.splice(insertAt, 0, { kind: "open" });
    return nextRow;
  });

  return { ...config, columnWidths, cells };
}

export function insertRow(config: CabinetConfig, index: number): CabinetConfig {
  if (config.rowHeights.length >= 5) {
    return config;
  }

  const insertAt = clamp(index, 0, config.rowHeights.length);
  const rowHeights = [...config.rowHeights];
  const sourceHeight = rowHeights[Math.max(0, Math.min(insertAt - 1, rowHeights.length - 1))] ?? 350;
  rowHeights.splice(insertAt, 0, sourceHeight);

  const cells = config.cells.map((row) => row.map((cell) => ({ ...cell })));
  cells.splice(insertAt, 0, Array.from({ length: config.columnWidths.length }, () => ({ kind: "open" })));

  return { ...config, rowHeights, cells };
}

export function setCellKind(config: CabinetConfig, selection: Selection, kind: CellKind): CabinetConfig {
  const cells = config.cells.map((row) => row.map((cell) => ({ ...cell })));
  if (cells[selection.row]?.[selection.column]) {
    cells[selection.row][selection.column] = { ...cells[selection.row][selection.column], kind };
  }
  return { ...config, cells };
}

export function setCellColor(config: CabinetConfig, selection: Selection, color: string): CabinetConfig {
  const cells = config.cells.map((row) => row.map((cell) => ({ ...cell })));
  if (cells[selection.row]?.[selection.column] && COLOR_OPTIONS.some((option) => option.value === color)) {
    cells[selection.row][selection.column] = { ...cells[selection.row][selection.column], color };
  }
  return { ...config, cells };
}

export function setPanelColor(config: CabinetConfig, color: string): CabinetConfig {
  if (!COLOR_OPTIONS.some((option) => option.value === color)) {
    return config;
  }

  return {
    ...config,
    panelColor: color,
    cells: config.cells.map((row) => row.map(({ color: _color, ...cell }) => ({ ...cell })))
  };
}

export function setSelectedColumnWidth(
  config: CabinetConfig,
  selection: Selection,
  width: number
): CabinetConfig {
  const columnWidths = [...config.columnWidths];
  columnWidths[selection.column] = sanitizeSize(width, columnWidths[selection.column]);
  return { ...config, columnWidths };
}

export function setSelectedRowHeight(
  config: CabinetConfig,
  selection: Selection,
  height: number
): CabinetConfig {
  const rowHeights = [...config.rowHeights];
  rowHeights[selection.row] = sanitizeSize(height, rowHeights[selection.row]);
  return { ...config, rowHeights };
}

export function setDepth(config: CabinetConfig, depth: number): CabinetConfig {
  return { ...config, depth: sanitizeSize(depth, config.depth) };
}

export function applyStructureMode(config: CabinetConfig, mode: StructureMode): CabinetConfig {
  if (!STRUCTURE_MODE_OPTIONS.some((option) => option.id === mode)) {
    return config;
  }

  return { ...config, structureMode: mode };
}

export function getCellColor(config: CabinetConfig, selection: Selection): string {
  return config.cells[selection.row]?.[selection.column]?.color ?? config.panelColor;
}

export function getEffectiveCellColor(config: CabinetConfig, row: number, column: number): string {
  return config.cells[row]?.[column]?.color ?? config.panelColor;
}

export function getDimensions(config: CabinetConfig) {
  const innerWidth = sum(config.columnWidths);
  const innerHeight = sum(config.rowHeights);
  const feet = getFeetOption(config.feet);
  const outerWidth = innerWidth + 23;
  const outerDepth = config.depth + 23;
  const outerHeight = innerHeight + feet.heightOffset;

  return {
    innerWidth,
    innerHeight,
    innerDepth: config.depth,
    outerWidth,
    outerHeight,
    outerDepth
  };
}

export function buildBom(config: CabinetConfig): BomItem[] {
  const columns = config.columnWidths.length;
  const rows = config.rowHeights.length;
  const items: BomItem[] = [];

  addItem(items, "球节点", "标准连接球", (columns + 1) * (rows + 1) * 2, "个", 88);

  config.columnWidths.forEach((width) => {
    addItem(items, "横向钢管", `${width} mm`, (rows + 1) * 2, "根", tubePrice(width));
  });

  config.rowHeights.forEach((height) => {
    addItem(items, "立向钢管", `${height} mm`, (columns + 1) * 2, "根", tubePrice(height));
  });

  addItem(items, "深度钢管", `${config.depth} mm`, (columns + 1) * (rows + 1), "根", tubePrice(config.depth));
  const feet = getFeetOption(config.feet);
  addItem(items, feet.label, "底部支撑", (columns + 1) * 2, "个", feet.unitPrice);

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (config.structureMode === "frameOnly") {
        return;
      }
      const width = config.columnWidths[columnIndex];
      const height = config.rowHeights[rowIndex];
      const area = (width * height) / 1000000;
      const effectiveKind = config.structureMode === "noPanels" ? "open" : cell.kind;

      if (effectiveKind === "back" || effectiveKind === "drop" || effectiveKind === "drawer" || effectiveKind === "tray") {
        addItem(items, "金属背板", `${width} x ${height} mm`, 1, "块", Math.round(220 + area * 260));
      }

      if (effectiveKind === "drop" && config.structureMode !== "noFront") {
        addItem(items, "下翻门板", `${width} x ${height} mm`, 1, "套", Math.round(520 + area * 680));
        addItem(items, "门铰链五金", "下翻门", 1, "套", 180);
      }

      if (effectiveKind === "drawer" && config.structureMode !== "noFront") {
        addItem(items, "抽屉面板", `${width} x ${Math.round(height / 3)} mm`, 3, "块", Math.round(180 + area * 220));
        addItem(items, "抽屉导轨", "三抽屉", 3, "套", 160);
      }

      if (effectiveKind === "glass" && config.structureMode !== "noFront") {
        addItem(items, "玻璃门", `${width} x ${height} mm`, 1, "套", Math.round(680 + area * 920));
        addItem(items, "玻璃铰链五金", "玻璃门", 1, "套", 210);
      }

      if (effectiveKind === "tray") {
        addItem(items, "内托盘", `${width} x ${config.depth} mm`, 1, "个", Math.round(260 + (width * config.depth) / 1000000 * 420));
      }
    });
  });

  return items;
}

export function estimatePrice(config: CabinetConfig): number {
  return buildBom(config).reduce((total, item) => total + item.qty * item.unitPrice, 0);
}

export function formatRmb(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

export function createPreset(columns: number, rows: number, kind: CellKind = "drop"): CabinetConfig {
  const rowHeights = Array.from({ length: rows }, () => 350);
  const columnWidths = Array.from({ length: columns }, () => (columns === 1 ? 750 : 500));
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    columnWidths,
    rowHeights,
    cells: createCells(rows, columns, kind)
  });
}

function addItem(items: BomItem[], name: string, spec: string, qty: number, unit: string, unitPrice: number) {
  const existing = items.find((item) => item.name === name && item.spec === spec && item.unitPrice === unitPrice);
  if (existing) {
    existing.qty += qty;
    return;
  }
  items.push({ name, spec, qty, unit, unitPrice });
}

function sanitizeSizes(
  values: number[] | undefined,
  options: readonly number[],
  fallback: number[]
): number[] {
  const clean = values?.map((value) => sanitizeSize(value, 350)).filter(Boolean).slice(0, 5);
  return clean?.length ? clean : fallback;
}

function sanitizeSize(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(Math.max(MIN_CUSTOM_SIZE, Math.min(MAX_CUSTOM_SIZE, numeric)));
}

function fitArray<T>(values: T[], length: number, filler: T): T[] {
  return Array.from({ length }, (_, index) => values[index] ?? filler);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tubePrice(length: number): number {
  return Math.round(74 + length * 0.34);
}

function getFeetOption(feet: FeetKind): FeetOption {
  return FEET_OPTIONS.find((option) => option.id === feet) ?? FEET_OPTIONS[0];
}
