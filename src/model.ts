import { ACCESSORY_CATALOG, getAccessory, type AccessoryModelKind } from "./accessoryCatalog";

export const DEPTH_OPTIONS = [250, 350, 395, 500] as const;
export const HEIGHT_OPTIONS = [100, 175, 250, 350, 395, 500] as const;
export const WIDTH_OPTIONS = [250, 350, 395, 500, 750] as const;
export const MIN_CUSTOM_SIZE = 80;
export const MAX_CUSTOM_SIZE = 1200;
export const RIMMED_DRAWER_RIM_HEIGHT_MM = 320;

export type TabKey = "structure" | "fittings" | "colors" | "bom";
export type CellKind = "open" | AccessoryModelKind;
export type DoorAccessoryKind = "none" | "dropDoor" | "flipUpDoor" | "sideOpenDoor" | "glassDropDoor";
export type CellFittingKind = "none" | "rimmedDrawer";
export type DoorOpenState = "closed" | "half" | "open";
export type FeetKind = "glides" | "caster-low" | "caster-high";
export type FrameFinish = "chrome" | "graphite";
export type StructureMode = "complete" | "noFront" | "noPanels" | "frameOnly";
export type ColorScope = "all" | "single";

export interface CellConfig {
  kind: CellKind;
  enabled: boolean;
  color?: string;
  door?: DoorAccessoryKind;
  doorState?: DoorOpenState;
  fitting?: CellFittingKind;
  drawerPull?: number;
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
  { id: "pure-white", label: "纯白", value: "#f4f2eb", text: "#111111" },
  { id: "light-grey", label: "浅灰", value: "#d9dedf", text: "#111111" },
  { id: "steel-blue", label: "钢蓝", value: "#506a78", text: "#ffffff" },
  { id: "olive", label: "橄榄绿", value: "#59644c", text: "#ffffff" },
  { id: "sapphire", label: "宝石蓝", value: "#244e7a", text: "#ffffff" },
  { id: "goose-yellow", label: "鹅黄", value: "#f1d86a", text: "#111111" },
  { id: "orange", label: "橙色", value: "#e76f3c", text: "#111111" },
  { id: "pink", label: "粉红", value: "#d9829d", text: "#111111" },
  { id: "eggplant", label: "茄紫", value: "#4c426b", text: "#ffffff" },
  { id: "green", label: "绿色", value: "#2f7a55", text: "#ffffff" },
  { id: "ruby", label: "红色", value: "#a4262c", text: "#ffffff" },
  { id: "yellow", label: "亮黄", value: "#f2d13b", text: "#111111" },
  { id: "silver", label: "银色", value: "#b8c0c5", text: "#111111" },
  { id: "dark-grey", label: "深灰", value: "#4a4f53", text: "#ffffff" },
  { id: "brown", label: "棕色", value: "#6b4d3a", text: "#ffffff" }
];

export const CELL_OPTIONS: Array<{ id: CellKind; label: string; short: string }> = [
  { id: "open", label: "开放格", short: "开" },
  ...ACCESSORY_CATALOG
    .filter((item) => item.installTarget === "cell" && item.id !== "boxDrawer")
    .map((item) => ({ id: item.id, label: item.name, short: item.shortName }))
];

export const DOOR_ACCESSORY_OPTIONS: Array<{ id: DoorAccessoryKind; label: string }> = [
  { id: "none", label: "无门" },
  { id: "dropDoor", label: "下翻门" },
  { id: "flipUpDoor", label: "上翻门" },
  { id: "sideOpenDoor", label: "侧开门" },
  { id: "glassDropDoor", label: "玻璃门" }
];

export const CELL_FITTING_OPTIONS: Array<{ id: CellFittingKind; label: string }> = [
  { id: "none", label: "无" },
  { id: "rimmedDrawer", label: "带围边抽屉" }
];

export const STRUCTURE_MODE_OPTIONS: Array<{ id: StructureMode; label: string; description: string }> = [
  { id: "complete", label: "完整柜体", description: "显示当前格子的板件、门和内部配件" },
  { id: "noFront", label: "隐藏正面", description: "隐藏门板，保留背板、搁板和抽屉结构" },
  { id: "noPanels", label: "仅开放格", description: "批量显示为开放格，保留底板和框架" },
  { id: "frameOnly", label: "全框架", description: "只显示钢管、球节点和底部支撑" }
];

export const FEET_OPTIONS: FeetOption[] = [
  { id: "glides", label: "脚垫", heightOffset: 40, unitPrice: 42 },
  { id: "caster-low", label: "低脚轮", heightOffset: 64, unitPrice: 135 },
  { id: "caster-high", label: "高脚轮", heightOffset: 88, unitPrice: 168 }
];

export const DOOR_OPEN_STATE_OPTIONS: Array<{ id: DoorOpenState; label: string }> = [
  { id: "closed", label: "关闭" },
  { id: "half", label: "半开" },
  { id: "open", label: "全开" }
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
  cells: [[{ kind: "metalBackModule", enabled: true }]]
};

export function createCells(rows: number, columns: number, kind: CellKind = "open", enabled = true): CellConfig[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ kind, enabled }))
  );
}

export function normalizeConfig(input: Partial<CabinetConfig> | null | undefined): CabinetConfig {
  const rowHeights = sanitizeSizes(input?.rowHeights, DEFAULT_CONFIG.rowHeights);
  const columnWidths = sanitizeSizes(input?.columnWidths, DEFAULT_CONFIG.columnWidths);
  const rows = rowHeights.length;
  const columns = columnWidths.length;
  const cells = createCells(rows, columns);
  const feet: FeetKind = FEET_OPTIONS.some((option) => option.id === input?.feet) ? input?.feet as FeetKind : "glides";
  const structureMode: StructureMode = STRUCTURE_MODE_OPTIONS.some((option) => option.id === input?.structureMode)
    ? input?.structureMode as StructureMode
    : "complete";

  input?.cells?.slice(0, rows).forEach((row, rowIndex) => {
    row?.slice(0, columns).forEach((cell, columnIndex) => {
      const normalizedKind = normalizeCellKind(cell?.kind);
      const legacyDoor = isDoorCellKind(normalizedKind);
      const legacyDrawer = normalizedKind === "boxDrawer";
      const kind: CellKind = legacyDoor || legacyDrawer ? "metalBackModule" : normalizedKind;
      const door = legacyDoor ? normalizedKind : normalizeDoorAccessory(cell?.door);
      const fitting = legacyDrawer ? "rimmedDrawer" : normalizeCellFitting(cell?.fitting, kind);
      const normalizedDoor = doorCompatible(kind) && fitting === "none" ? door : "none";
      cells[rowIndex][columnIndex] = {
        kind,
        enabled: cell?.enabled !== false,
        color: COLOR_OPTIONS.some((color) => color.value === cell?.color) ? cell.color : undefined,
        door: normalizedDoor,
        doorState: normalizedDoor !== "none" ? normalizeDoorOpenState(cell?.doorState) : undefined,
        fitting,
        drawerPull: fitting === "rimmedDrawer" ? normalizeDrawerPull(legacyDrawer ? undefined : cell?.drawerPull) : undefined
      };
    });
  });

  if (!cells.some((row) => row.some((cell) => cell.enabled))) {
    cells[0][0].enabled = true;
  }

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
      cells[row][column] = config.cells[row]?.[column] ?? { kind: "open", enabled: true };
    }
  }

  return ensureOneActive({ ...config, rowHeights, cells });
}

export function resizeColumns(config: CabinetConfig, columns: number): CabinetConfig {
  const nextColumns = clamp(columns, 1, 5);
  const columnWidths = fitArray(config.columnWidths, nextColumns, 350);
  const cells = createCells(config.rowHeights.length, nextColumns);

  for (let row = 0; row < config.rowHeights.length; row += 1) {
    for (let column = 0; column < nextColumns; column += 1) {
      cells[row][column] = config.cells[row]?.[column] ?? { kind: "open", enabled: true };
    }
  }

  return ensureOneActive({ ...config, columnWidths, cells });
}

export function insertColumn(config: CabinetConfig, index: number): CabinetConfig {
  if (config.columnWidths.length >= 5) return config;
  const insertAt = clamp(index, 0, config.columnWidths.length);
  const columnWidths = [...config.columnWidths];
  const sourceWidth = columnWidths[Math.max(0, Math.min(insertAt - 1, columnWidths.length - 1))] ?? 350;
  columnWidths.splice(insertAt, 0, sourceWidth);

  const cells = config.cells.map((row) => {
    const nextRow = row.map((cell) => ({ ...cell }));
    nextRow.splice(insertAt, 0, { kind: "metalBackModule", enabled: true });
    return nextRow;
  });

  return { ...config, columnWidths, cells };
}

export function insertRow(config: CabinetConfig, index: number): CabinetConfig {
  if (config.rowHeights.length >= 5) return config;
  const insertAt = clamp(index, 0, config.rowHeights.length);
  const rowHeights = [...config.rowHeights];
  const sourceHeight = rowHeights[Math.max(0, Math.min(insertAt - 1, rowHeights.length - 1))] ?? 350;
  rowHeights.splice(insertAt, 0, sourceHeight);

  const cells = cloneCells(config.cells);
  cells.splice(insertAt, 0, Array.from({ length: config.columnWidths.length }, () => ({ kind: "metalBackModule", enabled: true })));

  return { ...config, rowHeights, cells };
}

export function expandCell(
  config: CabinetConfig,
  selection: Selection,
  direction: "left" | "right" | "top" | "front"
): { config: CabinetConfig; selection: Selection } {
  if (direction === "front") {
    return { config: setDepth(config, config.depth + 100), selection };
  }

  if (direction === "top") {
    const targetRow = selection.row + 1;
    if (targetRow < config.rowHeights.length) return enableCell(config, { row: targetRow, column: selection.column });
    if (config.rowHeights.length >= 5) return { config, selection };
    return { config: insertRow(config, config.rowHeights.length), selection: { row: targetRow, column: selection.column } };
  }

  if (direction === "right") {
    const targetColumn = selection.column + 1;
    if (targetColumn < config.columnWidths.length) return enableCell(config, { row: selection.row, column: targetColumn });
    if (config.columnWidths.length >= 5) return { config, selection };
    return { config: insertColumn(config, config.columnWidths.length), selection: { row: selection.row, column: targetColumn } };
  }

  const targetColumn = selection.column - 1;
  if (targetColumn >= 0) return enableCell(config, { row: selection.row, column: targetColumn });
  if (config.columnWidths.length >= 5) return { config, selection };
  return { config: insertColumn(config, 0), selection: { row: selection.row, column: 0 } };
}

export function deleteCell(config: CabinetConfig, selection: Selection): CabinetConfig {
  if (getActiveCellCount(config) <= 1) return config;
  const cells = cloneCells(config.cells);
  if (cells[selection.row]?.[selection.column]) {
    cells[selection.row][selection.column] = { ...cells[selection.row][selection.column], enabled: false };
  }
  return { ...config, cells };
}

export function setCellKind(config: CabinetConfig, selection: Selection, kind: CellKind): CabinetConfig {
  const cells = cloneCells(config.cells);
  if (cells[selection.row]?.[selection.column]?.enabled) {
    const current = cells[selection.row][selection.column];
    if (isDoorCellKind(kind)) {
      cells[selection.row][selection.column] = {
        ...current,
        kind: "metalBackModule",
        door: kind,
        doorState: current.doorState ?? "half",
        fitting: "none",
        drawerPull: undefined
      };
      return { ...config, cells };
    }
    const door = doorCompatible(kind) ? current.door ?? "none" : "none";
    const fitting = fittingCompatible(kind) && door === "none" ? current.fitting ?? "none" : "none";
    cells[selection.row][selection.column] = {
      ...current,
      kind,
      door,
      doorState: door !== "none" ? current.doorState ?? "half" : undefined,
      fitting,
      drawerPull: fitting === "rimmedDrawer" ? normalizeDrawerPull(current.drawerPull) : undefined
    };
  }
  return { ...config, cells };
}

export function doorCompatible(kind: CellKind): boolean {
  return kind === "metalBackModule" || kind === "noBackModule";
}

export function fittingCompatible(kind: CellKind): boolean {
  return kind === "metalBackModule" || kind === "noBackModule";
}

export function setCellDoor(config: CabinetConfig, selection: Selection, door: DoorAccessoryKind): CabinetConfig {
  const cells = cloneCells(config.cells);
  const cell = cells[selection.row]?.[selection.column];
  if (cell?.enabled) {
    if (door === "none") {
      cells[selection.row][selection.column] = { ...cell, door: "none", doorState: undefined };
      return { ...config, cells };
    }
    const kind = doorCompatible(cell.kind) ? cell.kind : "metalBackModule";
    cells[selection.row][selection.column] = {
      ...cell,
      kind,
      door,
      doorState: cell.doorState ?? "half",
      fitting: "none",
      drawerPull: undefined
    };
  }
  return { ...config, cells };
}

export function setCellFitting(config: CabinetConfig, selection: Selection, fitting: CellFittingKind): CabinetConfig {
  const cells = cloneCells(config.cells);
  const cell = cells[selection.row]?.[selection.column];
  if (cell?.enabled) {
    const kind = fitting === "rimmedDrawer" && !fittingCompatible(cell.kind) ? "metalBackModule" : cell.kind;
    cells[selection.row][selection.column] = {
      ...cell,
      kind,
      door: fitting === "rimmedDrawer" ? "none" : cell.door ?? "none",
      doorState: fitting === "rimmedDrawer" ? undefined : cell.doorState,
      fitting,
      drawerPull: fitting === "rimmedDrawer" ? normalizeDrawerPull(cell.drawerPull) : undefined
    };
  }
  return { ...config, cells };
}

export function setDrawerPull(config: CabinetConfig, selection: Selection, drawerPull: number): CabinetConfig {
  const cells = cloneCells(config.cells);
  const cell = cells[selection.row]?.[selection.column];
  if (cell?.enabled && cell.fitting === "rimmedDrawer" && fittingCompatible(cell.kind)) {
    cells[selection.row][selection.column] = {
      ...cell,
      drawerPull: normalizeDrawerPull(drawerPull)
    };
  }
  return { ...config, cells };
}

export function setDoorState(config: CabinetConfig, selection: Selection, doorState: DoorOpenState): CabinetConfig {
  const cells = cloneCells(config.cells);
  const cell = cells[selection.row]?.[selection.column];
  if (cell?.enabled && cell.door && cell.door !== "none") {
    cells[selection.row][selection.column] = { ...cell, doorState };
  }
  return { ...config, cells };
}

export function setCellColor(config: CabinetConfig, selection: Selection, color: string): CabinetConfig {
  const cells = cloneCells(config.cells);
  if (cells[selection.row]?.[selection.column]?.enabled && COLOR_OPTIONS.some((option) => option.value === color)) {
    cells[selection.row][selection.column] = { ...cells[selection.row][selection.column], color };
  }
  return { ...config, cells };
}

export function setPanelColor(config: CabinetConfig, color: string): CabinetConfig {
  if (!COLOR_OPTIONS.some((option) => option.value === color)) return config;
  return {
    ...config,
    panelColor: color,
    cells: config.cells.map((row) => row.map(({ color: _color, ...cell }) => ({ ...cell })))
  };
}

export function setSelectedColumnWidth(config: CabinetConfig, selection: Selection, width: number): CabinetConfig {
  const columnWidths = [...config.columnWidths];
  columnWidths[selection.column] = sanitizeSize(width, columnWidths[selection.column]);
  return { ...config, columnWidths };
}

export function setSelectedRowHeight(config: CabinetConfig, selection: Selection, height: number): CabinetConfig {
  const rowHeights = [...config.rowHeights];
  rowHeights[selection.row] = sanitizeSize(height, rowHeights[selection.row]);
  return { ...config, rowHeights };
}

export function setDepth(config: CabinetConfig, depth: number): CabinetConfig {
  return { ...config, depth: sanitizeSize(depth, config.depth) };
}

export function applyStructureMode(config: CabinetConfig, mode: StructureMode): CabinetConfig {
  if (!STRUCTURE_MODE_OPTIONS.some((option) => option.id === mode)) return config;
  return { ...config, structureMode: mode };
}

export function getCellColor(config: CabinetConfig, selection: Selection): string {
  return config.cells[selection.row]?.[selection.column]?.color ?? config.panelColor;
}

export function getEffectiveCellColor(config: CabinetConfig, row: number, column: number): string {
  return config.cells[row]?.[column]?.color ?? config.panelColor;
}

export function getDimensions(config: CabinetConfig) {
  const bounds = getActiveBounds(config);
  const innerWidth = sum(config.columnWidths.slice(bounds.minColumn, bounds.maxColumn + 1));
  const innerHeight = sum(config.rowHeights.slice(bounds.minRow, bounds.maxRow + 1));
  const feet = getFeetOption(config.feet);
  const outerWidth = innerWidth + 23;
  const outerDepth = config.depth + 23;
  const outerHeight = innerHeight + feet.heightOffset;

  return { innerWidth, innerHeight, innerDepth: config.depth, outerWidth, outerHeight, outerDepth };
}

export function buildBom(config: CabinetConfig): BomItem[] {
  const items: BomItem[] = [];
  const frame = collectFrameParts(config);

  addItem(items, "球节点", "标准连接球", frame.points.size, "个", 88);

  frame.xLengths.forEach((qty, width) => addItem(items, "横向钢管", `${width} mm`, qty, "根", tubePrice(width)));
  frame.yLengths.forEach((qty, height) => addItem(items, "竖向钢管", `${height} mm`, qty, "根", tubePrice(height)));
  addItem(items, "深度钢管", `${config.depth} mm`, frame.zCount, "根", tubePrice(config.depth));

  const feet = getFeetOption(config.feet);
  addItem(items, feet.label, "底部支撑", frame.feet.size, "个", feet.unitPrice);

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell.enabled || config.structureMode === "frameOnly") return;
      const width = config.columnWidths[columnIndex];
      const height = config.rowHeights[rowIndex];
      const effectiveKind = config.structureMode === "noPanels" ? "open" : cell.kind;
      const spec = `${width} x ${height} x ${config.depth} mm`;

      if (effectiveKind === "open") {
        addItem(items, "底板", `${width} x ${config.depth} mm`, 1, "块", Math.round(180 + width * config.depth * 0.00035));
        return;
      }

      const accessory = getAccessory(effectiveKind as AccessoryModelKind);
      addItem(items, accessory.bomName, spec, 1, accessory.unit, accessory.unitPrice);

      if (effectiveKind === "metalBackModule" || effectiveKind === "noBackModule") {
        addItem(items, "金属扣板", `${width} x ${height} mm`, effectiveKind === "metalBackModule" ? 5 : 4, "块", Math.round(180 + width * height * 0.00018));
      }

      if (effectiveKind === "glassPanelModule") {
        addItem(items, "透明玻璃板", `${width} x ${height} mm`, 5, "块", Math.round(360 + width * height * 0.00062));
      }

      if (needsBackPanel(effectiveKind)) {
        addItem(items, "金属背板", `${width} x ${height} mm`, 1, "块", Math.round(220 + width * height * 0.00028));
      }

      const effectiveDoor = config.structureMode === "noPanels" ? "none" : cell.door ?? "none";
      if (effectiveDoor !== "none") {
        const doorAccessory = getAccessory(effectiveDoor);
        addItem(items, doorAccessory.bomName, spec, 1, doorAccessory.unit, doorAccessory.unitPrice);
      }

      if (cell.fitting === "rimmedDrawer" && fittingCompatible(effectiveKind)) {
        addItem(items, "门板", `${width} x ${height} mm`, 1, "件", 0);
        addItem(items, "移动托盘", `${width} x ${config.depth} mm`, 1, "件", 0);
        addItem(items, "围边", `${width} x ${config.depth} x ${RIMMED_DRAWER_RIM_HEIGHT_MM} mm`, 1, "件", 0);
        addItem(items, "抽屉导轨", `${config.depth} mm`, 2, "条", 0);
      }
      if (effectiveKind === "pullOutShelf") addItem(items, "拉出搁板导轨", `${config.depth} mm`, 2, "根", 120);
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

export function createPreset(columns: number, rows: number, kind: CellKind = "dropDoor"): CabinetConfig {
  const rowHeights = Array.from({ length: rows }, () => 350);
  const columnWidths = Array.from({ length: columns }, () => (columns === 1 ? 750 : 500));
  return normalizeConfig({ ...DEFAULT_CONFIG, columnWidths, rowHeights, cells: createCells(rows, columns, kind) });
}

export function isCellEnabled(config: CabinetConfig, selection: Selection | null): boolean {
  if (!selection) return false;
  return config.cells[selection.row]?.[selection.column]?.enabled === true;
}

export function isDoorCellKind(kind: CellKind | DoorAccessoryKind): kind is Exclude<DoorAccessoryKind, "none"> {
  return kind === "dropDoor" || kind === "flipUpDoor" || kind === "sideOpenDoor" || kind === "glassDropDoor";
}

export function getActiveCellCount(config: CabinetConfig): number {
  return config.cells.reduce((total, row) => total + row.filter((cell) => cell.enabled).length, 0);
}

export function findNearestEnabled(config: CabinetConfig, preferred: Selection = { row: 0, column: 0 }): Selection {
  if (isCellEnabled(config, preferred)) return preferred;
  let best: Selection | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell.enabled) return;
      const distance = Math.abs(rowIndex - preferred.row) + Math.abs(columnIndex - preferred.column);
      if (distance < bestDistance) {
        best = { row: rowIndex, column: columnIndex };
        bestDistance = distance;
      }
    });
  });

  return best ?? { row: 0, column: 0 };
}

function normalizeCellKind(value: unknown): CellKind {
  const legacy: Record<string, CellKind> = {
    back: "openBackPanel",
    drop: "dropDoor",
    drawer: "boxDrawer",
    glass: "glassDropDoor",
    tray: "displayTray"
  };
  if (typeof value === "string" && legacy[value]) return legacy[value];
  if (value === "open" || ACCESSORY_CATALOG.some((item) => item.id === value)) return value as CellKind;
  return "open";
}

function normalizeDoorOpenState(value: unknown): DoorOpenState {
  return value === "closed" || value === "open" ? value : "half";
}

function normalizeDoorAccessory(value: unknown): DoorAccessoryKind {
  return isDoorCellKind(value as CellKind) ? value as Exclude<DoorAccessoryKind, "none"> : "none";
}

function normalizeCellFitting(value: unknown, kind: CellKind): CellFittingKind {
  if (value !== "rimmedDrawer" || !fittingCompatible(kind)) return "none";
  return "rimmedDrawer";
}

function normalizeDrawerPull(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

function needsBackPanel(kind: CellKind) {
  return !["open", "noBackModule", "glassPanelModule", "dropDoor", "flipUpDoor", "sideOpenDoor", "glassDropDoor", "sidePanel", "softPanelLow", "softPanelWide", "softPanelTall", "glassShelf"].includes(kind);
}

function addItem(items: BomItem[], name: string, spec: string, qty: number, unit: string, unitPrice: number) {
  if (qty <= 0) return;
  const existing = items.find((item) => item.name === name && item.spec === spec && item.unitPrice === unitPrice);
  if (existing) {
    existing.qty += qty;
    return;
  }
  items.push({ name, spec, qty, unit, unitPrice });
}

function enableCell(config: CabinetConfig, selection: Selection): { config: CabinetConfig; selection: Selection } {
  const cells = cloneCells(config.cells);
  if (cells[selection.row]?.[selection.column]) {
    cells[selection.row][selection.column] = { ...cells[selection.row][selection.column], enabled: true };
  }
  return { config: { ...config, cells }, selection };
}

function ensureOneActive(config: CabinetConfig): CabinetConfig {
  if (getActiveCellCount(config) > 0) return config;
  const cells = cloneCells(config.cells);
  cells[0][0].enabled = true;
  return { ...config, cells };
}

function cloneCells(cells: CellConfig[][]): CellConfig[][] {
  return cells.map((row) => row.map((cell) => ({ ...cell })));
}

function getActiveBounds(config: CabinetConfig) {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = 0;

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell.enabled) return;
      minRow = Math.min(minRow, rowIndex);
      maxRow = Math.max(maxRow, rowIndex);
      minColumn = Math.min(minColumn, columnIndex);
      maxColumn = Math.max(maxColumn, columnIndex);
    });
  });

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn)) {
    return { minRow: 0, maxRow: 0, minColumn: 0, maxColumn: 0 };
  }

  return { minRow, maxRow, minColumn, maxColumn };
}

function collectFrameParts(config: CabinetConfig) {
  const points = new Set<string>();
  const feet = new Set<string>();
  const xSegments = new Set<string>();
  const ySegments = new Set<string>();
  const zSegments = new Set<string>();
  const xLengths = new Map<number, number>();
  const yLengths = new Map<number, number>();

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell.enabled) return;
      const width = config.columnWidths[columnIndex];
      const height = config.rowHeights[rowIndex];

      [columnIndex, columnIndex + 1].forEach((x) => {
        [rowIndex, rowIndex + 1].forEach((y) => {
          [0, 1].forEach((z) => points.add(`${x}:${y}:${z}`));
          zSegments.add(`${x}:${y}`);
        });
      });

      [rowIndex, rowIndex + 1].forEach((y) => {
        [0, 1].forEach((z) => {
          const key = `${columnIndex}:${y}:${z}`;
          if (!xSegments.has(key)) {
            xSegments.add(key);
            xLengths.set(width, (xLengths.get(width) ?? 0) + 1);
          }
        });
      });

      [columnIndex, columnIndex + 1].forEach((x) => {
        [0, 1].forEach((z) => {
          const key = `${x}:${rowIndex}:${z}`;
          if (!ySegments.has(key)) {
            ySegments.add(key);
            yLengths.set(height, (yLengths.get(height) ?? 0) + 1);
          }
        });
      });

      if (rowIndex === 0) {
        [columnIndex, columnIndex + 1].forEach((x) => [0, 1].forEach((z) => feet.add(`${x}:${z}`)));
      }
    });
  });

  return { points, feet, xLengths, yLengths, zCount: zSegments.size };
}

function sanitizeSizes(values: number[] | undefined, fallback: number[]): number[] {
  const clean = values?.map((value) => sanitizeSize(value, 350)).filter(Boolean).slice(0, 5);
  return clean?.length ? clean : fallback;
}

function sanitizeSize(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(MIN_CUSTOM_SIZE, Math.min(MAX_CUSTOM_SIZE, numeric)));
}

function fitArray<T>(values: T[], length: number, filler: T): T[] {
  return Array.from({ length }, (_, index) => values[index] ?? filler);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tubePrice(length: number) {
  return Math.round(74 + length * 0.34);
}

function getFeetOption(feet: FeetKind): FeetOption {
  return FEET_OPTIONS.find((option) => option.id === feet) ?? FEET_OPTIONS[0];
}
