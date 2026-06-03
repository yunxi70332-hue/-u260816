export const DEPTH_OPTIONS = [250, 350, 500] as const;
export const HEIGHT_OPTIONS = [100, 175, 250, 350, 395, 500] as const;
export const WIDTH_OPTIONS = [250, 350, 395, 500, 750] as const;

export type TabKey = "structure" | "fittings" | "colors" | "bom";
export type CellKind = "open" | "back" | "drop" | "drawer" | "glass" | "tray";
export type FeetKind = "glides" | "casters";
export type FrameFinish = "chrome" | "graphite";

export interface CellConfig {
  kind: CellKind;
}

export interface CabinetConfig {
  depth: number;
  columnWidths: number[];
  rowHeights: number[];
  panelColor: string;
  frameFinish: FrameFinish;
  feet: FeetKind;
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

export const COLOR_OPTIONS: ColorOption[] = [
  { id: "pure-white", label: "纯白", value: "#f4f2eb", text: "#111111" },
  { id: "light-grey", label: "浅灰", value: "#d9dde0", text: "#111111" },
  { id: "graphite", label: "石墨黑", value: "#202326", text: "#ffffff" },
  { id: "steel-blue", label: "钢蓝", value: "#506a78", text: "#ffffff" },
  { id: "olive", label: "橄榄绿", value: "#59644c", text: "#ffffff" },
  { id: "ruby", label: "宝石红", value: "#a4262c", text: "#ffffff" },
  { id: "yellow", label: "金黄", value: "#f2d13b", text: "#111111" },
  { id: "beige", label: "米灰", value: "#cfc5ad", text: "#111111" }
];

export const CELL_OPTIONS: Array<{ id: CellKind; label: string; short: string }> = [
  { id: "open", label: "开放格", short: "开" },
  { id: "back", label: "背板格", short: "背" },
  { id: "drop", label: "下翻门", short: "门" },
  { id: "drawer", label: "三抽屉", short: "抽" },
  { id: "glass", label: "玻璃门", short: "玻" },
  { id: "tray", label: "托盘格", short: "托" }
];

export const DEFAULT_CONFIG: CabinetConfig = {
  depth: 350,
  columnWidths: [750],
  rowHeights: [350],
  panelColor: "#f4f2eb",
  frameFinish: "chrome",
  feet: "glides",
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

  input?.cells?.slice(0, rows).forEach((row, rowIndex) => {
    row?.slice(0, columns).forEach((cell, columnIndex) => {
      cells[rowIndex][columnIndex] = {
        kind: CELL_OPTIONS.some((option) => option.id === cell?.kind) ? cell.kind : "open"
      };
    });
  });

  return {
    depth: DEPTH_OPTIONS.includes(input?.depth as never) ? Number(input?.depth) : DEFAULT_CONFIG.depth,
    columnWidths,
    rowHeights,
    panelColor: COLOR_OPTIONS.some((color) => color.value === input?.panelColor)
      ? String(input?.panelColor)
      : DEFAULT_CONFIG.panelColor,
    frameFinish: input?.frameFinish === "graphite" ? "graphite" : "chrome",
    feet: input?.feet === "casters" ? "casters" : "glides",
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

export function setCellKind(config: CabinetConfig, selection: Selection, kind: CellKind): CabinetConfig {
  const cells = config.cells.map((row) => row.map((cell) => ({ ...cell })));
  if (cells[selection.row]?.[selection.column]) {
    cells[selection.row][selection.column] = { kind };
  }
  return { ...config, cells };
}

export function setSelectedColumnWidth(
  config: CabinetConfig,
  selection: Selection,
  width: number
): CabinetConfig {
  const columnWidths = [...config.columnWidths];
  if (WIDTH_OPTIONS.includes(width as never)) {
    columnWidths[selection.column] = width;
  }
  return { ...config, columnWidths };
}

export function setSelectedRowHeight(
  config: CabinetConfig,
  selection: Selection,
  height: number
): CabinetConfig {
  const rowHeights = [...config.rowHeights];
  if (HEIGHT_OPTIONS.includes(height as never)) {
    rowHeights[selection.row] = height;
  }
  return { ...config, rowHeights };
}

export function getDimensions(config: CabinetConfig) {
  const innerWidth = sum(config.columnWidths);
  const innerHeight = sum(config.rowHeights);
  const outerWidth = innerWidth + 23;
  const outerDepth = config.depth + 23;
  const outerHeight = innerHeight + (config.feet === "casters" ? 64 : 40);

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
  addItem(items, config.feet === "casters" ? "滚轮脚" : "调平脚垫", "底部支撑", (columns + 1) * 2, "个", config.feet === "casters" ? 135 : 42);

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const width = config.columnWidths[columnIndex];
      const height = config.rowHeights[rowIndex];
      const area = (width * height) / 1000000;

      if (cell.kind === "back" || cell.kind === "drop" || cell.kind === "drawer" || cell.kind === "tray") {
        addItem(items, "金属背板", `${width} x ${height} mm`, 1, "块", Math.round(220 + area * 260));
      }

      if (cell.kind === "drop") {
        addItem(items, "下翻门板", `${width} x ${height} mm`, 1, "套", Math.round(520 + area * 680));
        addItem(items, "门铰链五金", "下翻门", 1, "套", 180);
      }

      if (cell.kind === "drawer") {
        addItem(items, "抽屉面板", `${width} x ${Math.round(height / 3)} mm`, 3, "块", Math.round(180 + area * 220));
        addItem(items, "抽屉导轨", "三抽屉", 3, "套", 160);
      }

      if (cell.kind === "glass") {
        addItem(items, "玻璃门", `${width} x ${height} mm`, 1, "套", Math.round(680 + area * 920));
        addItem(items, "玻璃铰链五金", "玻璃门", 1, "套", 210);
      }

      if (cell.kind === "tray") {
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
  const clean = values?.filter((value) => options.includes(value)).slice(0, 5);
  return clean?.length ? clean : fallback;
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
