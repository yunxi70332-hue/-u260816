import { ACCESSORY_CATALOG, getAccessory, type AccessoryModelKind } from "./accessoryCatalog";

export const DEPTH_OPTIONS = [250, 350, 395, 500] as const;
export const HEIGHT_OPTIONS = [100, 175, 250, 350, 395, 500] as const;
export const WIDTH_OPTIONS = [250, 350, 395, 500, 750] as const;
export const MIN_CUSTOM_SIZE = 80;
export const MAX_CUSTOM_SIZE = 1200;
export const MAX_GRID_COUNT = 10;
export const RIMMED_DRAWER_RIM_HEIGHT_MM = 320;
export const RIMLESS_DRAWER_MIN_HEIGHT_MM = 100;

export type TabKey = "structure" | "frame" | "fittings" | "colors" | "bom";
export type ExpandDirection = "left" | "right" | "top" | "bottom" | "front";
export type CellKind = "open" | AccessoryModelKind;
export type CellFittingKind = "none" | "mobileTray" | "rimmedDrawer" | "rimlessDrawer";
export type CellInteriorAccessoryKind = "mobileTray" | "shelf" | "displayTray" | "glassShelf";
export type DoorOpenState = "closed" | "half" | "open";
export type GlassDoorHandleSide = "left" | "right";
export type CellFrontAccessoryKind = "none" | "dropDoor" | "flipUpDoor" | "glassDropDoor";
export type AccessoryMountSide = "front" | "back" | "left" | "right";
export type CellFaceSide = "front" | "back";
export type FeetKind = "glides" | "caster-low" | "caster-high";
export type FrameFinish = "chrome" | "graphite";
export type StructureMode = "complete" | "noFront" | "noPanels" | "frameOnly";
export type ColorScope = "all" | "module" | "accessory" | "panel";
export type ColorTargetKind = "cell" | "accessory" | "panel";
export type WorkSurfaceKind = "deskTop" | "bridgeTop";
export type StructurePanelMaterial = "metal" | "perforated" | "glass" | "none";
export type StructurePanelKey = "front" | "back" | "left" | "right" | "top" | "bottom";
export type FramePartKind = "tube" | "vertex" | "panel" | "support";
export type FrameTubeAxis = "x" | "y" | "z";

export interface FramePartRef {
  id: string;
  kind: FramePartKind;
}

export interface FramePartOverride {
  deleted?: boolean;
}
export type StructureFrameKey =
  | "topFrontBeam"
  | "topBackBeam"
  | "bottomFrontBeam"
  | "bottomBackBeam"
  | "topLeftBeam"
  | "topRightBeam"
  | "bottomLeftBeam"
  | "bottomRightBeam"
  | "frontLeftPost"
  | "frontRightPost"
  | "backLeftPost"
  | "backRightPost";
export type StructureVertexKey =
  | "leftFrontTop"
  | "rightFrontTop"
  | "leftBackTop"
  | "rightBackTop"
  | "leftFrontBottom"
  | "rightFrontBottom"
  | "leftBackBottom"
  | "rightBackBottom";

export interface CellStructureOverrides {
  panels?: Partial<Record<StructurePanelKey, StructurePanelMaterial>>;
  frames?: Partial<Record<StructureFrameKey, boolean>>;
  vertices?: Partial<Record<StructureVertexKey, boolean>>;
}

export interface CellInteriorAccessory {
  id: string;
  kind: CellInteriorAccessoryKind;
  mountHeightMm: number;
  pull?: number;
  color?: string;
}

export interface CellConfig {
  kind: CellKind;
  enabled: boolean;
  depth?: number;
  color?: string;
  panelColors?: Partial<Record<StructurePanelKey, string>>;
  accessoryColors?: Record<string, string>;
  doorOpen?: number;
  doorState?: DoorOpenState;
  frontAccessory?: CellFrontAccessoryKind;
  accessoryMountSide?: AccessoryMountSide;
  faceSide?: CellFaceSide;
  glassDoorHandleSide?: GlassDoorHandleSide;
  interiorAccessories?: CellInteriorAccessory[];
  fitting?: CellFittingKind;
  drawerPull?: number;
  structure?: CellStructureOverrides;
}

export interface WorkSurfaceConfig {
  id: string;
  kind: WorkSurfaceKind;
  fromColumn: number;
  toColumn: number;
  row: number;
  depth: number;
  thickness: number;
  overhangFront: number;
  overhangBack: number;
  overhangLeft: number;
  overhangRight: number;
  color?: string;
  enabled: boolean;
}

export interface CabinetConfig {
  depth: number;
  depthSegments?: number[];
  columnWidths: number[];
  rowHeights: number[];
  panelColor: string;
  colorScope: ColorScope;
  frameFinish: FrameFinish;
  feet: FeetKind;
  structureMode: StructureMode;
  showDimensions: boolean;
  dimensionLabelWeights?: Partial<DimensionLabelWeights>;
  cells: CellConfig[][];
  planCells?: CellConfig[][][];
  workSurfaces: WorkSurfaceConfig[];
  framePartOverrides?: Record<string, FramePartOverride>;
}

export interface DimensionLabelWeights {
  horizontal: number;
  vertical: number;
  outer: number;
}

export interface FrameVertexPart extends FramePartRef {
  kind: "vertex";
  position: [number, number, number];
  connectedTubeIds: string[];
  label: string;
}

export interface FrameTubePart extends FramePartRef {
  kind: "tube";
  axis: FrameTubeAxis;
  length: number;
  position: [number, number, number];
  vertexIds: [string, string];
  label: string;
}

export interface FramePanelPart extends FramePartRef {
  kind: "panel";
  cell: Selection;
  panel: StructurePanelKey;
  material: StructurePanelMaterial;
  supportTubeIds: string[];
  label: string;
}

export interface FrameSupportPart extends FramePartRef {
  kind: "support";
  vertexId: string;
  position: [number, number, number];
  label: string;
}

export interface FrameTopology {
  vertices: FrameVertexPart[];
  tubes: FrameTubePart[];
  panels: FramePanelPart[];
  supports: FrameSupportPart[];
  feet: string[];
}

export interface StructureImpact {
  sourcePart: FramePartRef;
  removedTubes: string[];
  removedVertices: string[];
  removedPanels: Array<{ cell: Selection; panel: StructurePanelKey; id: string }>;
  removedSupports: string[];
  bomDelta: BomItem[];
  priceDelta: number;
  warnings: string[];
}

export interface Selection {
  row: number;
  column: number;
  depthIndex?: number;
}

export interface ColorOption {
  id: string;
  label: string;
  code?: string;
  value: string;
  text: string;
}

export interface BomItem {
  materialKey: string;
  specKey: string;
  category: BomCategory;
  name: string;
  spec: string;
  baseSpec?: string;
  color?: string;
  finish?: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export type BomCategory = "frame" | "panel" | "door" | "interior" | "glass" | "hardware";

interface BomItemOptions {
  baseSpec?: string;
  displaySpec?: string;
  color?: string;
  finish?: string;
}

const COLOR_AWARE_BOM_NAMES = new Set([
  "金属扣板",
  "顶板",
  "底板",
  "外板",
  "内板",
  "扣板（四排孔）",
  "前板",
  "后板",
  "左侧板",
  "右侧板",
  "门板",
  "洞洞板",
  "移动托盘",
  "固定搁板",
  "展示托盘",
  "围边"
]);

const COLOR_AWARE_BOM_PREFIXES = [
  "下翻门",
  "上翻门",
  "玻璃门组件"
];

const COLOR_AWARE_BOM_EXACT = new Set([
  "抽屉盒组件"
]);

export interface FeetOption {
  id: FeetKind;
  label: string;
  heightOffset: number;
  unitPrice: number;
}

export interface CatalogPresetOption {
  id: string;
  label: string;
  reference: string;
  createConfig: () => CabinetConfig;
}

export type AccessoryStatus = "officialExact" | "officialLogicCustomSize" | "needsHardwareCheck" | "blocked";

export interface AccessoryEvaluation {
  status: AccessoryStatus;
  label: string;
  reasons: string[];
  warnings: string[];
  officialSpec?: string;
  bomSize: {
    width: number;
    height: number;
    depth: number;
  };
}

export type ProductionValidationStatus = "buildable" | "needsReview" | "blocked";
export type ProductionIssueSeverity = "blocked" | "check" | "info";

export interface ProductionIssue {
  id: string;
  severity: ProductionIssueSeverity;
  scope: string;
  title: string;
  message: string;
  suggestion: string;
}

export interface ProductionValidationReport {
  status: ProductionValidationStatus;
  title: string;
  summary: string;
  issues: ProductionIssue[];
  counts: Record<ProductionIssueSeverity, number>;
}

interface EvaluationContext {
  cell: CellConfig;
  row: number;
  column: number;
  depthIndex: number;
  width: number;
  height: number;
  depth: number;
}

type MovingAccessoryKind = "dropDoor" | "flipUpDoor" | "glassDoor" | "pullOutShelf" | "rimmedDrawer" | "rimlessDrawer";

interface WorkSurfacePathCheck {
  status?: "needsHardwareCheck" | "blocked";
  reasons: string[];
  warnings: string[];
}

export const ACCESSORY_STATUS_META: Record<AccessoryStatus, { label: string; shortLabel: string; description: string }> = {
  officialExact: {
    label: "官方规格",
    shortLabel: "官方",
    description: "命中官方公开尺寸和搭配逻辑。"
  },
  officialLogicCustomSize: {
    label: "工厂定制尺寸",
    shortLabel: "定制",
    description: "配件搭配逻辑成立，BOM 按工厂自定义尺寸输出。"
  },
  needsHardwareCheck: {
    label: "五金确认",
    shortLabel: "确认",
    description: "搭配方向可做，但导轨、铰链、玻璃夹件或承重需要确认。"
  },
  blocked: {
    label: "逻辑冲突",
    shortLabel: "禁用",
    description: "存在前脸、导轨、玻璃支撑或开合路径冲突。"
  }
};

export const USM_COLOR_VALUES = {
  black: "#0c0c0c",
  white: "#fffef0",
  latte: "#b8a68e",
  steelBlue: "#1a2845",
  oliveGreen: "#586840",
  sapphireBlue: "#2255a8",
  gooseYellow: "#fafad2",
  orange: "#e8602a",
  pink: "#f5b8c8",
  xiziBlue: "#8ed0f0",
  green: "#2da845",
  red: "#7a1830",
  yellow: "#e8aa10",
  silver: "#bcc0b8",
  darkGrey: "#5a5a68",
  brown: "#5c3820",
  pureWhite: "#fffef0",
  lightGrey: "#bcc0b8",
  midGrey: "#5a5a68",
  anthracite: "#5a5a68",
  graphiteBlack: "#0c0c0c",
  goldenYellow: "#e8aa10",
  pureOrange: "#e8602a",
  rubyRed: "#7a1830",
  gentianBlue: "#2255a8",
  usmGreen: "#2da845",
  usmBeige: "#b8a68e",
  usmBrown: "#5c3820"
} as const;

export const COLOR_OPTIONS: ColorOption[] = [
  { id: "black", label: "黑色", code: "A类", value: USM_COLOR_VALUES.black, text: "#ffffff" },
  { id: "white", label: "白色", code: "A类", value: USM_COLOR_VALUES.white, text: "#111111" },
  { id: "latte", label: "奶咖色", code: "A类", value: USM_COLOR_VALUES.latte, text: "#111111" },
  { id: "steel-blue", label: "钢蓝色", code: "B类", value: USM_COLOR_VALUES.steelBlue, text: "#ffffff" },
  { id: "olive-green", label: "橄榄绿", code: "B类", value: USM_COLOR_VALUES.oliveGreen, text: "#ffffff" },
  { id: "sapphire-blue", label: "宝石蓝", code: "C类", value: USM_COLOR_VALUES.sapphireBlue, text: "#ffffff" },
  { id: "goose-yellow", label: "鹅黄色", code: "C类", value: USM_COLOR_VALUES.gooseYellow, text: "#111111" },
  { id: "orange", label: "橙色", code: "C类", value: USM_COLOR_VALUES.orange, text: "#111111" },
  { id: "pink", label: "粉红", code: "C类", value: USM_COLOR_VALUES.pink, text: "#111111" },
  { id: "xizi-blue", label: "西子蓝", code: "C类", value: USM_COLOR_VALUES.xiziBlue, text: "#111111" },
  { id: "green", label: "绿色", code: "C类", value: USM_COLOR_VALUES.green, text: "#ffffff" },
  { id: "red", label: "红色", code: "C类", value: USM_COLOR_VALUES.red, text: "#ffffff" },
  { id: "yellow", label: "黄色", code: "C类", value: USM_COLOR_VALUES.yellow, text: "#111111" },
  { id: "silver", label: "银色", code: "C类", value: USM_COLOR_VALUES.silver, text: "#111111" },
  { id: "dark-grey", label: "深灰色", code: "C类", value: USM_COLOR_VALUES.darkGrey, text: "#ffffff" },
  { id: "brown", label: "棕色", code: "C类", value: USM_COLOR_VALUES.brown, text: "#ffffff" }
];

const LEGACY_COLOR_VALUE_MAP = new Map<string, string>([
  ["#121314", USM_COLOR_VALUES.graphiteBlack],
  ["#0a0a0a", USM_COLOR_VALUES.graphiteBlack],
  ["#f4f2eb", USM_COLOR_VALUES.pureWhite],
  ["#fcf9f2", USM_COLOR_VALUES.pureWhite],
  ["#d9dedf", USM_COLOR_VALUES.lightGrey],
  ["#b5bbb7", USM_COLOR_VALUES.lightGrey],
  ["#506a78", USM_COLOR_VALUES.steelBlue],
  ["#001e42", USM_COLOR_VALUES.steelBlue],
  ["#59644c", USM_COLOR_VALUES.oliveGreen],
  ["#50523b", USM_COLOR_VALUES.oliveGreen],
  ["#244e7a", USM_COLOR_VALUES.gentianBlue],
  ["#004a87", USM_COLOR_VALUES.gentianBlue],
  ["#f1d86a", USM_COLOR_VALUES.goldenYellow],
  ["#f0ac01", USM_COLOR_VALUES.goldenYellow],
  ["#e76f3c", USM_COLOR_VALUES.pureOrange],
  ["#cc641b", USM_COLOR_VALUES.pureOrange],
  ["#d9829d", USM_COLOR_VALUES.rubyRed],
  ["#9a0000", USM_COLOR_VALUES.rubyRed],
  ["#4c426b", USM_COLOR_VALUES.anthracite],
  ["#3c4250", USM_COLOR_VALUES.anthracite],
  ["#2f7a55", USM_COLOR_VALUES.usmGreen],
  ["#0f9929", USM_COLOR_VALUES.usmGreen],
  ["#a4262c", USM_COLOR_VALUES.rubyRed],
  ["#f2d13b", USM_COLOR_VALUES.goldenYellow],
  ["#b8c0c5", USM_COLOR_VALUES.lightGrey],
  ["#4a4f53", USM_COLOR_VALUES.midGrey],
  ["#6b4d3a", USM_COLOR_VALUES.usmBrown],
  ["#322512", USM_COLOR_VALUES.usmBrown],
  ["#9b8c6d", USM_COLOR_VALUES.usmBeige]
]);

function normalizeColorValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return COLOR_OPTIONS.some((color) => color.value === normalized)
    ? normalized
    : LEGACY_COLOR_VALUE_MAP.get(normalized);
}

function getColorOption(value: string | undefined): ColorOption | undefined {
  if (!value) return undefined;
  return COLOR_OPTIONS.find((color) => color.value === value);
}

function formatBomColorLabel(color: string | undefined): string | undefined {
  const option = getColorOption(color);
  if (!option) return undefined;
  return option.code ? `${option.label} ${option.code}` : option.label;
}

function formatBomDisplaySpec(baseSpec: string, color?: string): string {
  const colorLabel = formatBomColorLabel(color);
  return colorLabel ? `${baseSpec} / ${colorLabel}` : baseSpec;
}

function normalizePanelColor(value: unknown): string {
  return normalizeColorValue(value) ?? DEFAULT_CONFIG.panelColor;
}

const STRUCTURE_CELL_OPTION_IDS = new Set<AccessoryModelKind>([
  "metalBackModule",
  "noBackModule",
  "glassPanelModule",
  "sideOpenDoor",
  "softPanelLow",
  "softPanelWide",
  "softPanelTall"
]);

export const CELL_OPTIONS: Array<{ id: CellKind; label: string; short: string }> = [
  { id: "open", label: "开放格", short: "开" },
  ...ACCESSORY_CATALOG
    .filter((item) => item.installTarget === "cell" && STRUCTURE_CELL_OPTION_IDS.has(item.id))
    .map((item) => ({ id: item.id, label: item.name, short: item.shortName }))
];

export const CELL_FITTING_OPTIONS: Array<{ id: CellFittingKind; label: string }> = [
  { id: "none", label: "无" },
  { id: "mobileTray", label: "移动托盘" },
  { id: "rimmedDrawer", label: "带围边抽屉" },
  { id: "rimlessDrawer", label: "一字拉手" }
];

export const FRONT_ACCESSORY_OPTIONS: Array<{ id: CellFrontAccessoryKind; label: string }> = [
  { id: "none", label: "无" },
  { id: "dropDoor", label: "下翻门" },
  { id: "flipUpDoor", label: "上翻门" },
  { id: "glassDropDoor", label: "玻璃门" }
];

export const ACCESSORY_MOUNT_SIDE_OPTIONS: Array<{ id: AccessoryMountSide; label: string }> = [
  { id: "front", label: "前" },
  { id: "back", label: "后" },
  { id: "left", label: "左" },
  { id: "right", label: "右" }
];

export const INTERIOR_ACCESSORY_OPTIONS: Array<{ id: CellInteriorAccessoryKind; label: string }> = [
  { id: "mobileTray", label: "移动托盘" },
  { id: "shelf", label: "固定层板" },
  { id: "displayTray", label: "固定托盘" },
  { id: "glassShelf", label: "玻璃搁板" }
];

export const STRUCTURE_PANEL_OPTIONS: Array<{ id: StructurePanelKey; label: string }> = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "left", label: "左面" },
  { id: "right", label: "右面" },
  { id: "top", label: "顶面" },
  { id: "bottom", label: "底面" }
];

export const STRUCTURE_PANEL_MATERIAL_OPTIONS: Array<{ id: StructurePanelMaterial; label: string }> = [
  { id: "metal", label: "钢板" },
  { id: "perforated", label: "洞洞板" },
  { id: "glass", label: "玻璃" },
  { id: "none", label: "无" }
];

export const STRUCTURE_FRAME_OPTIONS: Array<{ id: StructureFrameKey; label: string }> = [
  { id: "topFrontBeam", label: "顶前横梁" },
  { id: "topBackBeam", label: "顶后横梁" },
  { id: "bottomFrontBeam", label: "底前横梁" },
  { id: "bottomBackBeam", label: "底后横梁" },
  { id: "topLeftBeam", label: "顶左纵梁" },
  { id: "topRightBeam", label: "顶右纵梁" },
  { id: "bottomLeftBeam", label: "底左纵梁" },
  { id: "bottomRightBeam", label: "底右纵梁" },
  { id: "frontLeftPost", label: "前左立柱" },
  { id: "frontRightPost", label: "前右立柱" },
  { id: "backLeftPost", label: "后左立柱" },
  { id: "backRightPost", label: "后右立柱" }
];

export const STRUCTURE_VERTEX_OPTIONS: Array<{ id: StructureVertexKey; label: string }> = [
  { id: "leftFrontTop", label: "左前上顶点" },
  { id: "rightFrontTop", label: "右前上顶点" },
  { id: "leftBackTop", label: "左后上顶点" },
  { id: "rightBackTop", label: "右后上顶点" },
  { id: "leftFrontBottom", label: "左前下顶点" },
  { id: "rightFrontBottom", label: "右前下顶点" },
  { id: "leftBackBottom", label: "左后下顶点" },
  { id: "rightBackBottom", label: "右后下顶点" }
];

const STRUCTURE_MODES: readonly StructureMode[] = ["complete", "noFront", "noPanels", "frameOnly"];

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

const OFFICIAL_STANDARD_WIDTHS = [250, 350, 395, 500, 750];
const OFFICIAL_STANDARD_HEIGHTS = [100, 175, 250, 350, 395, 500];
const OFFICIAL_STANDARD_DEPTHS = [250, 350, 395, 500];
const MAX_WORK_SURFACE_COUNT = 12;
const DEFAULT_WORK_SURFACE_THICKNESS = 28;
const MIN_PULL_OUT_CLEARANCE_MM = 120;
const TIGHT_PULL_OUT_CLEARANCE_MM = 175;
const MIN_INTERIOR_ACCESSORY_SPACING_MM = 90;
const WIDE_WORK_SURFACE_OVERHANG_MM = 160;
const DROP_DOOR_OFFICIAL_DEPTHS = [250, 350, 500];
const EXTENSION_OFFICIAL_DEPTHS = [350, 500];
const GLASS_SHELL_BLOCKED_CELL_KINDS = new Set<CellKind>([
  "dropDoor",
  "flipUpDoor",
  "perforatedPanel",
  "openBackPanel",
  "softPanelLow",
  "softPanelWide",
  "softPanelTall",
  "shelf",
  "pullOutShelf",
  "displayTray"
]);
const DROP_DOOR_OFFICIAL_SPECS = [
  { width: 500, height: 175, spec: "7 x 20 inch" },
  { width: 750, height: 175, spec: "7 x 30 inch" },
  { width: 500, height: 250, spec: "10 x 20 inch" },
  { width: 750, height: 250, spec: "10 x 30 inch" },
  { width: 350, height: 350, spec: "14 x 14 inch" },
  { width: 395, height: 350, spec: "14 x 16 inch" },
  { width: 500, height: 350, spec: "14 x 20 inch" },
  { width: 750, height: 350, spec: "14 x 30 inch" },
  { width: 500, height: 395, spec: "16 x 20 inch" },
  { width: 750, height: 395, spec: "16 x 30 inch" }
];
const EXTENSION_SHELF_OFFICIAL_SPECS = [
  { width: 395, depth: 350, spec: "14 x 16 inch" },
  { width: 500, depth: 350, spec: "14 x 20 inch" },
  { width: 750, depth: 350, spec: "14 x 30 inch" },
  { width: 395, depth: 500, spec: "20 x 16 inch" },
  { width: 500, depth: 500, spec: "20 x 20 inch" },
  { width: 750, depth: 250, spec: "10 x 30 inch" }
];
const FIXED_SHELF_OFFICIAL_SPECS = [
  { width: 750, depth: 250, spec: "10 x 30 inch" },
  { width: 500, depth: 350, spec: "14 x 20 inch" },
  { width: 750, depth: 350, spec: "14 x 30 inch" },
  { width: 500, depth: 500, spec: "20 x 20 inch" },
  { width: 750, depth: 500, spec: "20 x 30 inch" }
];

export const DEFAULT_CONFIG: CabinetConfig = {
  depth: 350,
  depthSegments: [350],
  columnWidths: [750],
  rowHeights: [350],
  panelColor: USM_COLOR_VALUES.pureWhite,
  colorScope: "all",
  frameFinish: "chrome",
  feet: "glides",
  structureMode: "complete",
  showDimensions: true,
  dimensionLabelWeights: { horizontal: 600, vertical: 800, outer: 800 },
  cells: [[{ kind: "metalBackModule", enabled: true }]],
  planCells: [[[{
    kind: "metalBackModule",
    enabled: true
  }]]],
  workSurfaces: []
};

export function createCells(rows: number, columns: number, kind: CellKind = "open", enabled = true): CellConfig[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ kind, enabled }))
  );
}

export function createPlanCells(rows: number, depthCount: number, columns: number, kind: CellKind = "open", enabled = true): CellConfig[][][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: depthCount }, () =>
      Array.from({ length: columns }, () => ({ kind, enabled }))
    )
  );
}

export function getDepthSegments(config: CabinetConfig): number[] {
  const segments = sanitizeSizes(config.depthSegments, [config.depth]);
  return segments.length ? segments : [config.depth];
}

export function getDepthSegment(config: CabinetConfig, depthIndex = 0): number {
  const segments = getDepthSegments(config);
  return segments[clamp(depthIndex, 0, segments.length - 1)] ?? config.depth;
}

export function getPlanCells(config: CabinetConfig): CellConfig[][][] {
  if (Array.isArray(config.planCells)) return config.planCells;
  return config.cells.map((row) => [row]);
}

export function getSelectionDepthIndex(config: CabinetConfig, selection: Selection | null | undefined): number {
  const segments = getDepthSegments(config);
  return clamp(selection?.depthIndex ?? 0, 0, segments.length - 1);
}

export function getCellConfig(config: CabinetConfig, selection: Selection | null | undefined): CellConfig | undefined {
  if (!selection) return undefined;
  const depthIndex = getSelectionDepthIndex(config, selection);
  return getPlanCells(config)[selection.row]?.[depthIndex]?.[selection.column];
}

export function getPlanCellConfig(config: CabinetConfig, row: number, depthIndex: number, column: number): CellConfig | undefined {
  return getPlanCells(config)[row]?.[getSelectionDepthIndex(config, { row, column, depthIndex })]?.[column];
}

export function normalizeConfig(input: Partial<CabinetConfig> | null | undefined): CabinetConfig {
  const rowHeights = sanitizeSizes(input?.rowHeights, DEFAULT_CONFIG.rowHeights);
  const columnWidths = sanitizeSizes(input?.columnWidths, DEFAULT_CONFIG.columnWidths);
  const fallbackDepth = sanitizeSize(input?.depth, DEFAULT_CONFIG.depth);
  const rawDepthSegments = input?.depthSegments === DEFAULT_CONFIG.depthSegments ? undefined : input?.depthSegments;
  const depthSegments = sanitizeSizes(rawDepthSegments, [fallbackDepth]);
  const depth = sum(depthSegments);
  const rows = rowHeights.length;
  const columns = columnWidths.length;
  const depthCount = depthSegments.length;
  const planCells = createPlanCells(rows, depthCount, columns);
  const feet: FeetKind = FEET_OPTIONS.some((option) => option.id === input?.feet) ? input?.feet as FeetKind : "glides";
  const structureMode: StructureMode = STRUCTURE_MODES.includes(input?.structureMode as StructureMode)
    ? input?.structureMode as StructureMode
    : "complete";

  const inputPlanCells = input?.planCells;
  const hasExplicitPlanCells = Array.isArray(inputPlanCells) && inputPlanCells !== DEFAULT_CONFIG.planCells;

  if (hasExplicitPlanCells) {
    inputPlanCells.slice(0, rows).forEach((row, rowIndex) => {
      row?.slice(0, depthCount).forEach((depthRow, depthIndex) => {
        depthRow?.slice(0, columns).forEach((cell, columnIndex) => {
          planCells[rowIndex][depthIndex][columnIndex] = normalizeCellConfig(cell, depthSegments[depthIndex], rowHeights[rowIndex]);
        });
      });
    });
  } else {
    input?.cells?.slice(0, rows).forEach((row, rowIndex) => {
      row?.slice(0, columns).forEach((cell, columnIndex) => {
        planCells[rowIndex][0][columnIndex] = normalizeCellConfig(cell, depthSegments[0], rowHeights[rowIndex]);
      });
    });
  }

  if (!planCells.some((row) => row.some((depthRow) => depthRow.some((cell) => cell.enabled)))) {
    planCells[0][0][0].enabled = true;
  }

  const colorScope = (input?.colorScope as string) === "single" ? "module" : input?.colorScope === "module" || input?.colorScope === "accessory" || input?.colorScope === "panel" ? input.colorScope : "all";

  const cells = getLegacyCellsFromPlan(planCells);

  const normalized: CabinetConfig = {
    depth,
    depthSegments,
    columnWidths,
    rowHeights,
    panelColor: normalizePanelColor(input?.panelColor),
    colorScope,
    frameFinish: input?.frameFinish === "graphite" ? "graphite" : "chrome",
    feet,
    structureMode,
    showDimensions: input?.showDimensions ?? DEFAULT_CONFIG.showDimensions,
    dimensionLabelWeights: normalizeDimensionLabelWeights(input?.dimensionLabelWeights),
    cells,
    planCells,
    workSurfaces: normalizeWorkSurfaces(input?.workSurfaces, rows, columns, depth),
    framePartOverrides: normalizeFramePartOverrides(input?.framePartOverrides)
  };
  return normalized;
}

export function resizeRows(config: CabinetConfig, rows: number): CabinetConfig {
  const nextRows = clamp(rows, 1, MAX_GRID_COUNT);
  const rowHeights = fitArray(config.rowHeights, nextRows, 350);
  const depthSegments = getDepthSegments(config);
  const source = normalizePlanShape(config);
  const planCells = createPlanCells(nextRows, depthSegments.length, config.columnWidths.length);

  for (let row = 0; row < nextRows; row += 1) {
    for (let depthIndex = 0; depthIndex < depthSegments.length; depthIndex += 1) {
      for (let column = 0; column < config.columnWidths.length; column += 1) {
        planCells[row][depthIndex][column] = source[row]?.[depthIndex]?.[column] ?? { kind: "open", enabled: true };
      }
    }
  }

  return ensureOneActive(withPlanCells({ ...config, rowHeights }, planCells, depthSegments));
}

export function resizeColumns(config: CabinetConfig, columns: number): CabinetConfig {
  const nextColumns = clamp(columns, 1, MAX_GRID_COUNT);
  const columnWidths = fitArray(config.columnWidths, nextColumns, 350);
  const depthSegments = getDepthSegments(config);
  const source = normalizePlanShape(config);
  const planCells = createPlanCells(config.rowHeights.length, depthSegments.length, nextColumns);

  for (let row = 0; row < config.rowHeights.length; row += 1) {
    for (let depthIndex = 0; depthIndex < depthSegments.length; depthIndex += 1) {
      for (let column = 0; column < nextColumns; column += 1) {
        planCells[row][depthIndex][column] = source[row]?.[depthIndex]?.[column] ?? { kind: "open", enabled: true };
      }
    }
  }

  return ensureOneActive(withPlanCells({ ...config, columnWidths }, planCells, depthSegments));
}

export interface InsertActiveCell {
  row?: number;
  column?: number;
  depthIndex?: number;
}

function createPlaceholderCell() {
  return { kind: "metalBackModule" as CellKind, enabled: false };
}

export function insertColumn(
  config: CabinetConfig,
  index: number,
  active?: InsertActiveCell
): CabinetConfig {
  if (config.columnWidths.length >= MAX_GRID_COUNT) return config;
  const insertAt = clamp(index, 0, config.columnWidths.length);
  const columnWidths = [...config.columnWidths];
  const sourceWidth = columnWidths[Math.max(0, Math.min(insertAt - 1, columnWidths.length - 1))] ?? 350;
  columnWidths.splice(insertAt, 0, sourceWidth);

  const planCells = normalizePlanShape(config).map((row, rowIndex) => row.map((depthRow, depthIndex) => {
    const nextRow = depthRow.map(cloneCell);
    const isActive = !active
      || ((active.row ?? rowIndex) === rowIndex && (active.depthIndex ?? depthIndex) === depthIndex);
    nextRow.splice(insertAt, 0, isActive ? { kind: "metalBackModule", enabled: true } : createPlaceholderCell());
    return nextRow;
  }));

  return withPlanCells({ ...config, columnWidths }, planCells);
}

export function insertRow(
  config: CabinetConfig,
  index: number,
  active?: InsertActiveCell
): CabinetConfig {
  if (config.rowHeights.length >= MAX_GRID_COUNT) return config;
  const insertAt = clamp(index, 0, config.rowHeights.length);
  const rowHeights = [...config.rowHeights];
  const sourceHeight = rowHeights[Math.max(0, Math.min(insertAt - 1, rowHeights.length - 1))] ?? 350;
  rowHeights.splice(insertAt, 0, sourceHeight);

  const depthCount = getDepthSegments(config).length;
  const cells: CellConfig[][] = Array.from({ length: depthCount }, (_, depthIndex) =>
    Array.from({ length: config.columnWidths.length }, (_, columnIndex) => {
      const isActive = !active
        || ((active.depthIndex ?? depthIndex) === depthIndex && (active.column ?? columnIndex) === columnIndex);
      return isActive ? { kind: "metalBackModule", enabled: true } : createPlaceholderCell();
    })
  );
  const planCells = normalizePlanShape(config);
  planCells.splice(insertAt, 0, cells);

  return withPlanCells({ ...config, rowHeights }, planCells);
}

export function insertDepthSegment(
  config: CabinetConfig,
  index: number,
  active?: InsertActiveCell
): CabinetConfig {
  const currentDepthSegments = getDepthSegments(config);
  if (currentDepthSegments.length >= MAX_GRID_COUNT) return config;
  const insertAt = clamp(index, 0, currentDepthSegments.length);
  const depthSegments = [...currentDepthSegments];
  const sourceDepth = depthSegments[Math.max(0, Math.min(insertAt - 1, depthSegments.length - 1))] ?? 350;
  depthSegments.splice(insertAt, 0, sourceDepth);

  const planCells = normalizePlanShape(config).map((row, rowIndex) => {
    const nextRow = row.map((depthRow) => depthRow.map(cloneCell));
    nextRow.splice(
      insertAt,
      0,
      Array.from({ length: config.columnWidths.length }, (_, columnIndex) => {
        const isActive = !active || (active.row ?? rowIndex) === rowIndex && (active.column ?? columnIndex) === columnIndex;
        return isActive ? { kind: "metalBackModule", enabled: true } : createPlaceholderCell();
      })
    );
    return nextRow;
  });

  return withPlanCells(config, planCells, depthSegments);
}

function insertFrontDepthSegment(config: CabinetConfig, active?: InsertActiveCell): CabinetConfig {
  const inserted = insertDepthSegment(config, 0, active);
  const planCells = normalizePlanShape(inserted);

  planCells.forEach((row, rowIndex) => {
    const insertedDepthRow = row[0];
    const formerFrontDepthRow = row[1];
    formerFrontDepthRow?.forEach((cell, columnIndex) => {
      if (active && ((active.row ?? rowIndex) !== rowIndex || (active.column ?? columnIndex) !== columnIndex)) return;
      if (!cell.enabled || !isFrontFacingClosableCell(cell)) return;
      insertedDepthRow[columnIndex] = createBackPanelShellFromFrontCell(cell);
      formerFrontDepthRow[columnIndex] = createBridgeCellFromFormerFront(cell);
    });
  });

  return withPlanCells(inserted, planCells);
}

export function expandCell(
  config: CabinetConfig,
  selection: Selection,
  direction: ExpandDirection
): { config: CabinetConfig; selection: Selection } {
  if (direction === "front") {
    const depthIndex = getSelectionDepthIndex(config, selection);
    const targetDepthIndex = depthIndex - 1;
    if (targetDepthIndex >= 0) return enableCell(config, { row: selection.row, column: selection.column, depthIndex: targetDepthIndex });
    if (getDepthSegments(config).length >= MAX_GRID_COUNT) return { config, selection: { ...selection, depthIndex } };
    return {
      config: insertFrontDepthSegment(config, { row: selection.row, column: selection.column }),
      selection: { row: selection.row, column: selection.column, depthIndex: 0 }
    };
  }

  if (direction === "top") {
    const targetRow = selection.row + 1;
    if (targetRow < config.rowHeights.length) return enableCell(config, { row: targetRow, column: selection.column, depthIndex: selection.depthIndex });
    if (config.rowHeights.length >= MAX_GRID_COUNT) return { config, selection };
    return {
      config: insertRow(config, config.rowHeights.length, { row: targetRow, column: selection.column, depthIndex: selection.depthIndex }),
      selection: { row: targetRow, column: selection.column, depthIndex: selection.depthIndex }
    };
  }

  if (direction === "bottom") {
    const targetRow = selection.row - 1;
    if (targetRow >= 0) return enableCell(config, { row: targetRow, column: selection.column, depthIndex: selection.depthIndex });
    if (config.rowHeights.length >= MAX_GRID_COUNT) return { config, selection };
    return {
      config: insertRow(config, 0, { row: 0, column: selection.column, depthIndex: selection.depthIndex }),
      selection: { row: 0, column: selection.column, depthIndex: selection.depthIndex }
    };
  }

  if (direction === "right") {
    const targetColumn = selection.column + 1;
    if (targetColumn < config.columnWidths.length) return enableCell(config, { row: selection.row, column: targetColumn, depthIndex: selection.depthIndex });
    if (config.columnWidths.length >= MAX_GRID_COUNT) return { config, selection };
    return {
      config: insertColumn(config, config.columnWidths.length, { row: selection.row, column: targetColumn, depthIndex: selection.depthIndex }),
      selection: { row: selection.row, column: targetColumn, depthIndex: selection.depthIndex }
    };
  }

  const targetColumn = selection.column - 1;
  if (targetColumn >= 0) return enableCell(config, { row: selection.row, column: targetColumn, depthIndex: selection.depthIndex });
  if (config.columnWidths.length >= MAX_GRID_COUNT) return { config, selection };
  return {
    config: insertColumn(config, 0, { row: selection.row, column: 0, depthIndex: selection.depthIndex }),
    selection: { row: selection.row, column: 0, depthIndex: selection.depthIndex }
  };
}

export function cloneColumn(
  config: CabinetConfig,
  sourceColumn: number,
  insertAt: number = sourceColumn + 1
): { config: CabinetConfig; column: number } {
  if (config.columnWidths.length >= MAX_GRID_COUNT) return { config, column: sourceColumn };
  const from = clamp(sourceColumn, 0, config.columnWidths.length - 1);
  const at = clamp(insertAt, 0, config.columnWidths.length);
  const columnWidths = [...config.columnWidths];
  columnWidths.splice(at, 0, columnWidths[from]);

  // 新列整列克隆源列配置: 门板/配件/颜色随格子一起复制(含源列中的空洞)
  const planCells = normalizePlanShape(config).map((row) => row.map((depthRow) => {
    const nextRow = depthRow.map(cloneCell);
    nextRow.splice(at, 0, cloneCell(depthRow[from]));
    return nextRow;
  }));

  return { config: withPlanCells({ ...config, columnWidths }, planCells), column: at };
}

export function deleteCell(config: CabinetConfig, selection: Selection): CabinetConfig {
  if (getActiveCellCount(config) <= 1) return config;
  return updatePlanCell(config, selection, (cell) => ({ ...cell, enabled: false }));
}

export function setCellKind(config: CabinetConfig, selection: Selection, kind: CellKind): CabinetConfig {
  if (kind === "pullOutShelf") {
    return addCellInteriorAccessory(config, selection, "mobileTray");
  }
  if (kind === "glassDropDoor") {
    const side = getCellConfig(config, selection)?.glassDoorHandleSide ?? "right";
    return setGlassDoorHandleSide(config, selection, side);
  }
  if (kind === "dropDoor" || kind === "flipUpDoor") {
    return setCellFrontAccessory(config, selection, kind);
  }
  if (kind === "perforatedPanel") {
    return setPhysicalStructurePanel(config, selection, "front", "perforated");
  }
  if (kind === "shelf" || kind === "displayTray" || kind === "glassShelf") {
    return addCellInteriorAccessory(config, selection, kind);
  }
  if (kind === "boxDrawer") {
    return setCellFitting(config, selection, "rimmedDrawer");
  }
  return updatePlanCell(config, selection, (current) => {
    if (!current.enabled) return null;
    if (isGlassShellBlockedKind(current.kind, kind)) return null;
    const nextFront = isFrontAccessoryCompatibleWithShell(current.frontAccessory ?? "none", kind) ? current.frontAccessory : undefined;
    const nextInterior = (current.interiorAccessories ?? []).filter((item) => isInteriorAccessoryCompatibleWithCell(item.kind, current, kind));
    const nextFitting = isDrawerFitting(current.fitting) && fittingCompatible(kind) ? current.fitting : "none";
    const nextFaceSide = kind === "metalBackModule" || nextFront === "dropDoor" || isDrawerFitting(nextFitting)
      ? current.faceSide
      : undefined;
    const physicalMountSide = getPhysicalAccessoryMountSide(current);
    return {
      ...current,
      kind,
      faceSide: nextFaceSide,
      doorOpen: isOpenableFrontAccessory(nextFront) ? normalizeDoorOpen(current.doorOpen, current.doorState, 0) : undefined,
      doorState: isOpenableFrontAccessory(nextFront) ? current.doorState ?? "closed" : undefined,
      frontAccessory: hasFrontAccessory(nextFront) ? nextFront : undefined,
      accessoryMountSide: hasFrontAccessory(nextFront) || nextFitting === "rimlessDrawer"
        ? toLocalAccessoryMountSide(physicalMountSide, nextFaceSide)
        : undefined,
      glassDoorHandleSide: nextFront === "glassDropDoor" ? normalizeGlassDoorHandleSide(current.glassDoorHandleSide) : undefined,
      interiorAccessories: nextInterior.length ? nextInterior : undefined,
      fitting: nextFitting,
      drawerPull: isDrawerFitting(nextFitting) ? normalizeDrawerPull(current.drawerPull) : undefined
    };
  });
}

export function fittingCompatible(kind: CellKind): boolean {
  return kind === "metalBackModule" || kind === "noBackModule";
}

function isDrawerFitting(fitting: CellFittingKind | undefined): fitting is "rimmedDrawer" | "rimlessDrawer" {
  return fitting === "rimmedDrawer" || fitting === "rimlessDrawer";
}

export function supportsMobileTrayFitting(kind: CellKind): boolean {
  return kind !== "glassPanelModule";
}

export function setCellFitting(config: CabinetConfig, selection: Selection, fitting: CellFittingKind): CabinetConfig {
  if (fitting === "mobileTray") {
    return addCellInteriorAccessory(config, selection, "mobileTray");
  }
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    if (fitting === "none") {
      return {
        ...cell,
        fitting: "none",
        drawerPull: undefined
      };
    }
    if (cell.kind === "glassPanelModule") return null;

    const kind = isDrawerFitting(fitting) && !fittingCompatible(cell.kind) ? "metalBackModule" : cell.kind;
    return {
      ...cell,
      kind,
      doorOpen: undefined,
      doorState: undefined,
      frontAccessory: undefined,
      accessoryMountSide: fitting === "rimlessDrawer" ? getAccessoryMountSide(cell) : undefined,
      glassDoorHandleSide: undefined,
      interiorAccessories: undefined,
      fitting,
      drawerPull: fitting === "rimlessDrawer" ? normalizeDrawerPull(cell.drawerPull ?? 0) : normalizeDrawerPull(cell.drawerPull)
    };
  });
}

export function setDrawerDoorSide(config: CabinetConfig, selection: Selection, side: AccessoryMountSide): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => (
    cell.enabled && cell.fitting === "rimlessDrawer"
      ? { ...cell, accessoryMountSide: toLocalAccessoryMountSide(side, cell.faceSide) }
      : null
  ));
}

export function setMetalShellFaceSide(config: CabinetConfig, selection: Selection, faceSide: CellFaceSide): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const keepDropDoor = cell.frontAccessory === "dropDoor";
    const keepFrontAccessory = faceSide === "front" || keepDropDoor ? cell.frontAccessory : undefined;
    const keepOpenable = isOpenableFrontAccessory(keepFrontAccessory);
    return {
      ...cell,
      kind: "metalBackModule",
      faceSide,
      structure: clearFacingPanelOverrides(cell.structure),
      frontAccessory: keepFrontAccessory,
      accessoryMountSide: keepDropDoor || cell.fitting === "rimlessDrawer" ? "front" : undefined,
      doorOpen: keepOpenable ? normalizeDoorOpen(cell.doorOpen, cell.doorState, 0) : undefined,
      doorState: keepOpenable ? cell.doorState ?? "closed" : undefined,
      glassDoorHandleSide: keepFrontAccessory === "glassDropDoor" ? normalizeGlassDoorHandleSide(cell.glassDoorHandleSide) : undefined,
      fitting: cell.fitting,
      drawerPull: cell.fitting === "rimlessDrawer" || cell.fitting === "rimmedDrawer" ? normalizeDrawerPull(cell.drawerPull) : undefined
    };
  });
}

export function setCellFrontAccessory(
  config: CabinetConfig,
  selection: Selection,
  frontAccessory: CellFrontAccessoryKind,
  accessoryMountSide: AccessoryMountSide = getPhysicalAccessoryMountSide(getCellConfig(config, selection))
): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    if (frontAccessory === "none") {
      return {
        ...cell,
        doorOpen: undefined,
        doorState: undefined,
        frontAccessory: undefined,
        accessoryMountSide: undefined,
        glassDoorHandleSide: undefined
      };
    }
    if (!isFrontAccessoryCompatibleWithShell(frontAccessory, cell.kind)) return null;
    const requestedPhysicalSide = normalizeAccessoryMountSide(accessoryMountSide);
    const isDropDoor = frontAccessory === "dropDoor";
    const nextFaceSide: CellFaceSide = isDropDoor && (requestedPhysicalSide === "front" || requestedPhysicalSide === "back")
      ? requestedPhysicalSide
      : "front";
    const nextMountSide = isDropDoor
      ? toLocalAccessoryMountSide(requestedPhysicalSide, nextFaceSide)
      : "front";
    const kind = frontAccessory === "glassDropDoor" && cell.kind === "glassPanelModule"
      ? "glassPanelModule"
      : "metalBackModule";
    const openable = isOpenableFrontAccessory(frontAccessory);
    return {
      ...cell,
      kind,
      faceSide: nextFaceSide,
      structure: clearFacingPanelOverrides(cell.structure),
      doorOpen: openable ? normalizeDoorOpen(cell.doorOpen, cell.doorState, 0) : undefined,
      doorState: openable ? cell.doorState ?? "closed" : undefined,
      frontAccessory,
      accessoryMountSide: nextMountSide,
      glassDoorHandleSide: frontAccessory === "glassDropDoor" ? normalizeGlassDoorHandleSide(cell.glassDoorHandleSide) : undefined,
      fitting: isDrawerFitting(cell.fitting) ? "none" : cell.fitting,
      drawerPull: isDrawerFitting(cell.fitting) ? undefined : cell.drawerPull
    };
  });
}

export function setGlassDoorHandleSide(config: CabinetConfig, selection: Selection, glassDoorHandleSide: GlassDoorHandleSide): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    if (isGlassShellBlockedKind(cell.kind, "glassDropDoor")) return null;
    const kind: CellKind = cell.kind === "glassPanelModule" ? "glassPanelModule" : "metalBackModule";
    return {
      ...cell,
      kind,
      faceSide: "front",
      structure: clearFacingPanelOverrides(cell.structure),
      doorOpen: 0,
      doorState: "closed",
      frontAccessory: "glassDropDoor",
      accessoryMountSide: "front",
      glassDoorHandleSide: normalizeGlassDoorHandleSide(glassDoorHandleSide),
      fitting: isDrawerFitting(cell.fitting) ? "none" : cell.fitting,
      drawerPull: isDrawerFitting(cell.fitting) ? undefined : cell.drawerPull
    };
  });
}

export function setDrawerPull(config: CabinetConfig, selection: Selection, drawerPull: number): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    const firstTray = cell.interiorAccessories?.find((item) => item.kind === "mobileTray");
    if (cell.enabled && firstTray) {
      return updateInteriorAccessoryInCell(cell, firstTray.id, { pull: normalizeDrawerPull(drawerPull) });
    }
    if (cell.enabled && isDrawerFitting(cell.fitting) && fittingCompatible(cell.kind)) {
      return {
      ...cell,
      drawerPull: normalizeDrawerPull(drawerPull)
      };
    }
    return null;
  });
}

export function addCellInteriorAccessory(
  config: CabinetConfig,
  selection: Selection,
  kind: CellInteriorAccessoryKind,
  mountHeightMm?: number
): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    if (!isInteriorAccessoryCompatibleWithCell(kind, cell) || (kind === "mobileTray" && hasGlassMobileTrayMount(cell))) return null;
    const height = config.rowHeights[selection.row] ?? 350;
    const nextKind = kind === "mobileTray" || kind === "shelf" || kind === "displayTray"
      ? ensureMetalInteriorShellKind(cell.kind)
      : cell.kind;
    const baseCell = { ...cell, kind: nextKind };
    const nextAccessory: CellInteriorAccessory = {
      id: nextInteriorAccessoryId(cell, kind),
      kind,
      mountHeightMm: normalizeInteriorMountHeight(mountHeightMm, height),
      pull: kind === "mobileTray" ? normalizeDrawerPull(undefined) : undefined
    };
    const nextAccessories = [...(cell.interiorAccessories ?? []), nextAccessory];
    const structure = nextAccessories.some((item) => item.kind === "mobileTray")
      ? applyRequiredMobileTrayPanels(baseCell, nextKind, cell.kind)
      : cell.structure;
    const shouldRevealMobileTray = kind === "mobileTray" && hasOpenableDoor(cell);
    return {
      ...cell,
      kind: nextKind,
      doorOpen: shouldRevealMobileTray ? Math.max(normalizeDoorOpen(cell.doorOpen, cell.doorState, 0), 0.48) : cell.doorOpen,
      doorState: shouldRevealMobileTray ? "half" : cell.doorState,
      fitting: "none",
      drawerPull: undefined,
      interiorAccessories: nextAccessories,
      structure
    };
  });
}

export function updateCellInteriorAccessory(
  config: CabinetConfig,
  selection: Selection,
  id: string,
  patch: Partial<Pick<CellInteriorAccessory, "kind" | "mountHeightMm" | "pull">>
): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const height = config.rowHeights[selection.row] ?? 350;
    return updateInteriorAccessoryInCell(cell, id, patch, height);
  });
}

export function removeCellInteriorAccessory(config: CabinetConfig, selection: Selection, id: string): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const interiorAccessories = (cell.interiorAccessories ?? []).filter((item) => item.id !== id);
      return {
        ...cell,
        interiorAccessories: interiorAccessories.length ? interiorAccessories : undefined
      };
  });
}

export function setCellInteriorAccessoryPull(config: CabinetConfig, selection: Selection, id: string, pull: number): CabinetConfig {
  return updateCellInteriorAccessory(config, selection, id, { pull: normalizeDrawerPull(pull) });
}

export function setDoorState(config: CabinetConfig, selection: Selection, doorState: DoorOpenState): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => (
    cell.enabled && hasOpenableDoor(cell) ? { ...cell, doorState, doorOpen: normalizeDoorOpen(undefined, doorState) } : null
  ));
}

export function setDoorOpen(config: CabinetConfig, selection: Selection, doorOpen: number): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => (
    cell.enabled && hasOpenableDoor(cell) ? { ...cell, doorOpen: normalizeDoorOpen(doorOpen, cell.doorState) } : null
  ));
}

export type MovingAccessoryGroup = "all" | "dropDoor" | "flipUpDoor" | "glassDoor" | "drawer" | "mobileTray";

export const MOVING_ACCESSORY_GROUPS = ["dropDoor", "flipUpDoor", "glassDoor", "drawer", "mobileTray"] as const;

export interface MovingAccessorySummary {
  total: number;
  open: number;
}

function isMovingAccessoryOpen(value: number | undefined): boolean {
  return (value ?? 0) >= 0.98;
}

function includesMovingAccessory(group: MovingAccessoryGroup, kind: Exclude<MovingAccessoryGroup, "all">): boolean {
  return group === "all" || group === kind;
}

function isDropDoorCell(cell: CellConfig): boolean {
  return cell.kind === "dropDoor" || cell.frontAccessory === "dropDoor";
}

function isFlipUpDoorCell(cell: CellConfig): boolean {
  return cell.kind === "flipUpDoor" || cell.frontAccessory === "flipUpDoor";
}

function isGlassDoorCell(cell: CellConfig): boolean {
  return cell.kind === "glassDropDoor" || cell.frontAccessory === "glassDropDoor";
}

export function getMovingAccessorySummary(config: CabinetConfig, group: MovingAccessoryGroup): MovingAccessorySummary {
  let total = 0;
  let open = 0;
  getPlanCells(config).forEach((row) => row.forEach((depthRow) => depthRow.forEach((cell) => {
    if (!cell.enabled) return;
    if (includesMovingAccessory(group, "dropDoor") && isDropDoorCell(cell)) {
      total += 1;
      if (isMovingAccessoryOpen(cell.doorOpen)) open += 1;
    }
    if (includesMovingAccessory(group, "flipUpDoor") && isFlipUpDoorCell(cell)) {
      total += 1;
      if (isMovingAccessoryOpen(cell.doorOpen)) open += 1;
    }
    if (includesMovingAccessory(group, "glassDoor") && isGlassDoorCell(cell)) {
      total += 1;
      if (isMovingAccessoryOpen(cell.doorOpen)) open += 1;
    }
    if (includesMovingAccessory(group, "drawer") && isDrawerFitting(cell.fitting)) {
      total += 1;
      if (isMovingAccessoryOpen(cell.drawerPull)) open += 1;
    }
    if (includesMovingAccessory(group, "mobileTray")) {
      (cell.interiorAccessories ?? []).forEach((accessory) => {
        if (accessory.kind !== "mobileTray") return;
        total += 1;
        if (isMovingAccessoryOpen(accessory.pull)) open += 1;
      });
    }
  })));
  return { total, open };
}

export function getAvailableMovingAccessoryGroups(config: CabinetConfig): Array<Exclude<MovingAccessoryGroup, "all">> {
  return MOVING_ACCESSORY_GROUPS.filter((group) => getMovingAccessorySummary(config, group).total > 0);
}

export function setMovingAccessoryGroupOpen(config: CabinetConfig, group: MovingAccessoryGroup, open: boolean): CabinetConfig {
  const planCells = normalizePlanShape(config);
  let changed = false;
  planCells.forEach((row, rowIndex) => row.forEach((depthRow, depthIndex) => depthRow.forEach((cell, columnIndex) => {
    if (!cell.enabled) return;
    const appliesToDropDoor = includesMovingAccessory(group, "dropDoor") && isDropDoorCell(cell);
    const appliesToFlipUpDoor = includesMovingAccessory(group, "flipUpDoor") && isFlipUpDoorCell(cell);
    const appliesToGlassDoor = includesMovingAccessory(group, "glassDoor") && isGlassDoorCell(cell);
    const appliesToDrawer = includesMovingAccessory(group, "drawer") && isDrawerFitting(cell.fitting);
    const appliesToTray = includesMovingAccessory(group, "mobileTray") && Boolean(cell.interiorAccessories?.some((accessory) => accessory.kind === "mobileTray"));
    if (!appliesToDropDoor && !appliesToFlipUpDoor && !appliesToGlassDoor && !appliesToDrawer && !appliesToTray) return;
    const nextCell: CellConfig = { ...cell };
    if (appliesToDropDoor || appliesToFlipUpDoor || appliesToGlassDoor) {
      nextCell.doorOpen = open ? 1 : 0;
      nextCell.doorState = open ? "open" : "closed";
    }
    if (appliesToDrawer) nextCell.drawerPull = open ? 1 : 0;
    if (appliesToTray) {
      nextCell.interiorAccessories = (cell.interiorAccessories ?? []).map((accessory) => (
        accessory.kind === "mobileTray" ? { ...accessory, pull: open ? 1 : 0 } : accessory
      ));
    }
    planCells[rowIndex][depthIndex][columnIndex] = nextCell;
    changed = true;
  })));
  return changed ? withPlanCells(config, planCells) : config;
}
export function setCellColor(config: CabinetConfig, selection: Selection, color: string): CabinetConfig {
  const nextColor = normalizeColorValue(color);
  if (!nextColor) return config;
  return updatePlanCell(config, selection, (cell) => (
    cell.enabled ? { ...cell, color: nextColor } : null
  ));
}

export function setPanelColor(config: CabinetConfig, color: string): CabinetConfig {
  const nextColor = normalizeColorValue(color);
  return nextColor ? { ...config, panelColor: nextColor } : config;
}

export function setWholeCabinetColor(config: CabinetConfig, color: string): CabinetConfig {
  const nextColor = normalizeColorValue(color);
  if (!nextColor) return config;
  const planCells = getPlanCells(config).map((row) => row.map((depthRow) => depthRow.map((cell) => {
    const {
      color: _color,
      panelColors: _panelColors,
      accessoryColors: _accessoryColors,
      interiorAccessories: sourceInteriorAccessories,
      ...rest
    } = cell;
    const interiorAccessories = sourceInteriorAccessories?.map(({ color: _accessoryColor, ...accessory }) => accessory);
    return {
      ...rest,
      interiorAccessories: interiorAccessories?.length ? interiorAccessories : undefined
    };
  })));
  const workSurfaces = config.workSurfaces.map(({ color: _surfaceColor, ...surface }) => surface);
  return withPlanCells({ ...config, panelColor: nextColor, colorScope: "all", workSurfaces }, planCells);
}

export function getEffectiveModuleColor(config: CabinetConfig, selection: Selection): string {
  if (config.colorScope === "all") return config.panelColor;
  return getCellConfig(config, selection)?.color ?? config.panelColor;
}

export function getEffectiveAccessoryColor(config: CabinetConfig, selection: Selection, accessoryId: string): string {
  if (config.colorScope === "all") return config.panelColor;
  const cell = getCellConfig(config, selection);
  const accessory = cell?.interiorAccessories?.find((item) => item.id === accessoryId);
  return accessory?.color ?? cell?.accessoryColors?.[accessoryId] ?? cell?.color ?? config.panelColor;
}

export function getEffectivePanelColor(config: CabinetConfig, selection: Selection, panel: StructurePanelKey): string {
  if (config.colorScope === "all") return config.panelColor;
  const cell = getCellConfig(config, selection);
  return cell?.panelColors?.[panel] ?? cell?.color ?? config.panelColor;
}

export function getPhysicalStructurePanelTargets(
  config: CabinetConfig,
  selection: Selection,
  panel: StructurePanelKey
): Array<{ selection: Selection; panel: StructurePanelKey }> {
  const depthIndex = getSelectionDepthIndex(config, selection);
  const currentSelection = { ...selection, depthIndex };
  const current = getCellConfig(config, currentSelection);
  const targets: Array<{ selection: Selection; panel: StructurePanelKey }> = [{ selection: currentSelection, panel }];
  if (!current?.enabled || (panel !== "top" && panel !== "bottom")) return targets;

  const neighborRow = panel === "top" ? selection.row + 1 : selection.row - 1;
  const neighborPanel: StructurePanelKey = panel === "top" ? "bottom" : "top";
  const neighborSelection = { row: neighborRow, column: selection.column, depthIndex };
  const neighbor = getCellConfig(config, neighborSelection);
  if (!neighbor?.enabled) return targets;

  const currentDepth = getCellDepth(config, selection.row, selection.column, depthIndex);
  const neighborDepth = getCellDepth(config, neighborRow, selection.column, depthIndex);
  if (currentDepth !== neighborDepth) return targets;

  targets.push({ selection: neighborSelection, panel: neighborPanel });
  return targets;
}

export function getPhysicalStructurePanelSurfaceTarget(
  config: CabinetConfig,
  selection: Selection,
  panel: StructurePanelKey,
  surface: "upper" | "lower"
): { selection: Selection; panel: StructurePanelKey } {
  const targets = getPhysicalStructurePanelTargets(config, selection, panel);
  if (targets.length < 2) return targets[0];
  const preferredPanel: StructurePanelKey = surface === "upper" ? "bottom" : "top";
  return targets.find((target) => target.panel === preferredPanel) ?? targets[0];
}

export function setPhysicalStructurePanel(
  config: CabinetConfig,
  selection: Selection,
  panel: StructurePanelKey,
  material: StructurePanelMaterial
): CabinetConfig {
  return getPhysicalStructurePanelTargets(config, selection, panel).reduce(
    (current, target) => setCellStructurePanel(current, target.selection, target.panel, material),
    config
  );
}

export function setColorByScope(config: CabinetConfig, selection: Selection | null, scope: ColorScope, color: string, target?: { accessoryId?: string; panel?: StructurePanelKey }): CabinetConfig {
  const nextColor = normalizeColorValue(color);
  if (!nextColor) return config;
  if (scope === "all") return setWholeCabinetColor(config, nextColor);
  if (!selection) return config;
  if (scope === "module") return setCellColor(config, selection, nextColor);
  if (scope === "panel" && target?.panel) {
    return getPhysicalStructurePanelTargets(config, selection, target.panel).reduce(
      (current, panelTarget) => updatePlanCell(current, panelTarget.selection, (cell) => ({
        ...cell,
        panelColors: { ...cell.panelColors, [panelTarget.panel]: nextColor }
      })),
      config
    );
  }
  if (scope === "accessory" && target?.accessoryId) {
    const accessoryId = target.accessoryId;
    return updatePlanCell(config, selection, (cell) => {
      const isInterior = (cell.interiorAccessories ?? []).some((item) => item.id === accessoryId);
      if (isInterior) return { ...cell, interiorAccessories: (cell.interiorAccessories ?? []).map((item) => item.id === accessoryId ? { ...item, color: nextColor } : item) };
      return { ...cell, accessoryColors: { ...(cell.accessoryColors ?? {}), [accessoryId]: nextColor } };
    });
  }
  return config;
}

export function clearColorOverride(config: CabinetConfig, selection: Selection | null, target: { kind: ColorTargetKind; accessoryId?: string; panel?: StructurePanelKey }): CabinetConfig {
  if (!selection) return config;
  if (target.kind === "cell") return updatePlanCell(config, selection, (cell) => { const { color: _color, ...rest } = cell; return rest; });
  if (target.kind === "panel" && target.panel) {
    return getPhysicalStructurePanelTargets(config, selection, target.panel).reduce(
      (current, panelTarget) => updatePlanCell(current, panelTarget.selection, (cell) => {
        const panelColors = { ...(cell.panelColors ?? {}) };
        delete panelColors[panelTarget.panel];
        return { ...cell, panelColors: Object.keys(panelColors).length ? panelColors : undefined };
      }),
      config
    );
  }
  if (target.kind === "accessory" && target.accessoryId) {
    const accessoryId = target.accessoryId;
    return updatePlanCell(config, selection, (cell) => {
      const isInterior = (cell.interiorAccessories ?? []).some((item) => item.id === accessoryId);
      if (isInterior) return { ...cell, interiorAccessories: (cell.interiorAccessories ?? []).map((item) => item.id === accessoryId ? { ...item, color: undefined } : item) };
      const accessoryColors = { ...(cell.accessoryColors ?? {}) }; delete accessoryColors[accessoryId];
      return { ...cell, accessoryColors: Object.keys(accessoryColors).length ? accessoryColors : undefined };
    });
  }
  return config;
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

export function setSelectedCellDepth(config: CabinetConfig, selection: Selection, depth: number): CabinetConfig {
  return updatePlanCell(config, selection, (cell, depthIndex) => {
    if (!cell.enabled) return null;
    const segmentDepth = getDepthSegment(config, depthIndex);
    const nextDepth = sanitizeSize(depth, getCellDepth(config, selection.row, selection.column, depthIndex));
    return {
      ...cell,
      depth: nextDepth === segmentDepth ? undefined : nextDepth
    };
  });
}

export function setDepth(config: CabinetConfig, depth: number): CabinetConfig {
  const nextDepth = sanitizeSize(depth, config.depth);
  const currentSegments = getDepthSegments(config);
  const depthSegments = currentSegments.length === 1 ? [nextDepth] : currentSegments.map(() => nextDepth);
  return withPlanCells(config, clearMatchingCellDepthOverrides(normalizePlanShape(config), depthSegments), depthSegments);
}

export function resizeDepthSegments(config: CabinetConfig, depthCount: number): CabinetConfig {
  const nextCount = clamp(depthCount, 1, MAX_GRID_COUNT);
  const depthSegments = fitArray(getDepthSegments(config), nextCount, 500);
  const source = normalizePlanShape(config);
  const planCells = createPlanCells(config.rowHeights.length, nextCount, config.columnWidths.length);

  for (let row = 0; row < config.rowHeights.length; row += 1) {
    for (let depthIndex = 0; depthIndex < nextCount; depthIndex += 1) {
      for (let column = 0; column < config.columnWidths.length; column += 1) {
        planCells[row][depthIndex][column] = source[row]?.[depthIndex]?.[column] ?? { kind: "open", enabled: true };
      }
    }
  }

  return ensureOneActive(withPlanCells(config, planCells, depthSegments));
}

export function setSelectedDepthSegmentSize(config: CabinetConfig, selection: Selection, depth: number): CabinetConfig {
  const depthIndex = getSelectionDepthIndex(config, selection);
  const depthSegments = [...getDepthSegments(config)];
  depthSegments[depthIndex] = sanitizeSize(depth, depthSegments[depthIndex] ?? config.depth);
  return withPlanCells(config, clearMatchingCellDepthOverrides(normalizePlanShape(config), depthSegments), depthSegments);
}

export function setCellStructurePanel(
  config: CabinetConfig,
  selection: Selection,
  panel: StructurePanelKey,
  material: StructurePanelMaterial
): CabinetConfig {
  if (!isStructurePanelKey(panel) || !isStructurePanelMaterial(material)) return config;
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const structure = normalizeCellStructure({
      ...cell.structure,
      panels: {
        ...cell.structure?.panels,
        [panel]: material
      }
    });
    return { ...cell, structure };
  });
}

export function setCellStructureFrameVisible(
  config: CabinetConfig,
  selection: Selection,
  frame: StructureFrameKey,
  visible: boolean
): CabinetConfig {
  if (!isStructureFrameKey(frame)) return config;
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const structure = normalizeCellStructure({
      ...cell.structure,
      frames: {
        ...cell.structure?.frames,
        [frame]: visible
      }
    });
    return { ...cell, structure };
  });
}

export function setCellStructureVertexVisible(
  config: CabinetConfig,
  selection: Selection,
  vertex: StructureVertexKey,
  visible: boolean
): CabinetConfig {
  if (!isStructureVertexKey(vertex)) return config;
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled) return null;
    const structure = normalizeCellStructure({
      ...cell.structure,
      vertices: {
        ...cell.structure?.vertices,
        [vertex]: visible
      }
    });
    return { ...cell, structure };
  });
}

export function resetCellStructure(config: CabinetConfig, selection: Selection): CabinetConfig {
  return updatePlanCell(config, selection, (cell) => {
    if (!cell.enabled || !cell.structure) return null;
    const { structure: _structure, ...rest } = cell;
    return rest;
  });
}

export function getCellColor(config: CabinetConfig, selection: Selection): string {
  return getEffectiveModuleColor(config, selection);
}

export function getEffectiveCellColor(config: CabinetConfig, row: number, column: number, depthIndex = 0): string {
  return getEffectiveModuleColor(config, { row, column, depthIndex });
}

export function getDefaultStructurePanelMaterial(kind: CellKind, panel: StructurePanelKey): StructurePanelMaterial {
  if (panel === "front") return "none";

  if (kind === "glassPanelModule") {
    return panel === "back" || panel === "left" || panel === "right" || panel === "top" || panel === "bottom" ? "glass" : "none";
  }

  if (kind === "metalBackModule" || kind === "dropDoor" || kind === "flipUpDoor") {
    return panel === "back" || panel === "left" || panel === "right" || panel === "top" || panel === "bottom" ? "metal" : "none";
  }

  if (kind === "noBackModule") {
    return panel === "left" || panel === "right" || panel === "top" || panel === "bottom" ? "metal" : "none";
  }

  if (kind === "sideOpenDoor") {
    return panel === "top" || panel === "bottom" ? "metal" : "none";
  }

  if (kind === "openBackPanel") {
    return panel === "back" || panel === "bottom" ? "metal" : "none";
  }

  if (kind === "sidePanel") {
    return panel === "back" || panel === "left" || panel === "bottom" ? "metal" : "none";
  }

  if (kind === "open") {
    return "none";
  }

  if (kind === "glassDropDoor") {
    return "none";
  }

  if (kind === "shelf" || kind === "pullOutShelf" || kind === "boxDrawer" || kind === "displayTray" || kind === "glassShelf") {
    return panel === "back" ? "metal" : "none";
  }

  return "none";
}

export function getEffectiveStructurePanelMaterial(cell: CellConfig, kind: CellKind, panel: StructurePanelKey): StructurePanelMaterial {
  const override = cell.structure?.panels?.[panel];
  if (override) return override;

  const defaultPanel = cell.faceSide === "back"
    ? panel === "front"
      ? "back"
      : panel === "back"
        ? "front"
        : panel
    : panel;
  return getDefaultStructurePanelMaterial(kind, defaultPanel);
}

export function getEffectiveStructureFrameVisible(cell: CellConfig, frame: StructureFrameKey): boolean {
  return cell.structure?.frames?.[frame] ?? true;
}

export function getEffectiveStructureVertexVisible(cell: CellConfig, vertex: StructureVertexKey): boolean {
  return cell.structure?.vertices?.[vertex] ?? true;
}

export function getCellDepth(config: CabinetConfig, row: number, column: number, depthIndex = 0): number {
  return getPlanCellConfig(config, row, depthIndex, column)?.depth ?? getDepthSegment(config, depthIndex);
}

export function getDimensions(config: CabinetConfig) {
  const bounds = getActiveBounds(config);
  const xBounds = getCenteredColumnBounds(config.columnWidths);
  const innerWidth = sum(config.columnWidths.slice(bounds.minColumn, bounds.maxColumn + 1));
  const innerHeight = sum(config.rowHeights.slice(bounds.minRow, bounds.maxRow + 1));
  const feet = getFeetOption(config.feet);
  const innerDepth = getMaxActiveDepth(config);
  let footprintMinX = xBounds[bounds.minColumn] ?? 0;
  let footprintMaxX = xBounds[bounds.maxColumn + 1] ?? innerWidth;
  let footprintDepth = innerDepth + 23;
  let footprintHeight = innerHeight;

  config.workSurfaces.forEach((surface) => {
    if (!surface.enabled) return;
    const x0 = (xBounds[surface.fromColumn] ?? 0) - surface.overhangLeft;
    const x1 = (xBounds[surface.toColumn + 1] ?? 0) + surface.overhangRight;
    const surfaceTop = sum(config.rowHeights.slice(0, surface.row + 1)) + surface.thickness;
    footprintMinX = Math.min(footprintMinX, x0);
    footprintMaxX = Math.max(footprintMaxX, x1);
    footprintDepth = Math.max(footprintDepth, surface.depth + surface.overhangFront + surface.overhangBack);
    footprintHeight = Math.max(footprintHeight, surfaceTop);
  });

  const outerWidth = Math.round(Math.max(innerWidth + 23, footprintMaxX - footprintMinX));
  const outerDepth = Math.round(footprintDepth);
  const outerHeight = Math.round(footprintHeight + feet.heightOffset);

  return { innerWidth, innerHeight, innerDepth, outerWidth, outerHeight, outerDepth };
}

export function evaluateCellKind(config: CabinetConfig, selection: Selection | null, kind: CellKind): AccessoryEvaluation {
  const context = getEvaluationContext(config, selection);
  if (!context) return emptyEvaluation("请先选中模块");
  const { width, height, depth, cell } = context;
  const base = createEvaluationBase(kindLabel(kind), width, height, depth);

  if (!cell.enabled) {
    return block(base, "请先恢复该模块。");
  }

  if (config.structureMode === "frameOnly" && kind !== "open") {
    return block(base, "当前是全框架模式，没有配件安装面。");
  }

  if (kind === "open") {
    return withStandardSizeStatus(base, width, height, depth);
  }

  const glassShellConflict = getGlassShellBlockReason(cell.kind, kind);
  if (glassShellConflict) {
    return block(base, glassShellConflict);
  }

  if (kind === "dropDoor") {
    return mergePathCheck(
      evaluateDropDoor(base, width, height, depth),
      evaluateWorkSurfacePath(config, context, "dropDoor", getPhysicalAccessoryMountSide(cell))
    );
  }

  if (kind === "flipUpDoor") {
    const evaluated = {
      ...withStandardSizeStatus(base, width, height, depth),
      reasons: ["上翻门作为前脸配件，需要格口上方保留开启路径。"]
    };
    return mergePathCheck(evaluated, evaluateWorkSurfacePath(config, context, "flipUpDoor"));
  }

  if (kind === "sideOpenDoor") {
    return {
      ...withStandardSizeStatus(base, width, height, depth),
      reasons: ["官方 buhanceban 结构：保留顶板和底板，左右侧面与背面开放。"]
    };
  }

  if (kind === "pullOutShelf") {
    return mergePathCheck(
      evaluatePullOutShelf(base, width, height, depth),
      evaluateWorkSurfacePath(config, context, "pullOutShelf", getPhysicalAccessoryMountSide(cell))
    );
  }

  if (kind === "displayTray" || kind === "shelf") {
    return evaluateFixedShelfLike(base, width, height, depth, kind, cell);
  }

  if (kind === "glassShelf") {
    return evaluateFixedShelfLike(base, width, height, depth, kind, cell);
  }

  if (kind === "glassDropDoor") {
    const evaluated = withStandardSizeStatus(base, width, height, depth);
    return mergePathCheck({
      ...evaluated,
      reasons: ["玻璃门作为前脸配件，默认按左右侧开玻璃门处理。"],
      warnings: isStandardSize(width, height, depth) ? [] : ["非官方公开尺寸按工厂定制玻璃门输出。"]
    }, evaluateWorkSurfacePath(config, context, "glassDoor"));
  }

  if (kind === "glassPanelModule") {
    const evaluated = withStandardSizeStatus(base, width, height, depth);
    return {
      ...evaluated,
      reasons: ["玻璃箱体适合展示格，默认不承载抽屉导轨。"]
    };
  }

  if (kind === "softPanelLow" || kind === "softPanelWide" || kind === "softPanelTall") {
    return {
      ...withStandardSizeStatus(base, width, height, depth),
      status: "needsHardwareCheck",
      reasons: ["Soft Panel 属于附加面板，需要按实际安装位置确认。"]
    };
  }

  return withStandardSizeStatus(base, width, height, depth);
}

export function evaluateCellFitting(config: CabinetConfig, selection: Selection | null, fitting: CellFittingKind): AccessoryEvaluation {
  const context = getEvaluationContext(config, selection);
  if (!context) return emptyEvaluation("请先选中模块");
  const { width, height, depth, cell } = context;
  const base = createEvaluationBase(fittingLabel(fitting), width, height, depth);

  if (fitting === "rimlessDrawer") {
    if (!cell.enabled) return block(base, "请先恢复该模块。");
    if (config.structureMode === "frameOnly") return block(base, "当前是全框架模式，没有抽屉导轨安装面。");
    if (cell.kind === "glassPanelModule") return block(base, "玻璃箱体默认不承载一字拉手抽屉导轨。");

    const reasons = ["一字拉手占用该格前脸，抽拉盒体与前板沿安装方向移动。"];
    const warnings = !fittingCompatible(cell.kind) ? ["选择后会自动切换为含金属背板模块。"] : [];
    const pathCheck = evaluateWorkSurfacePath(config, context, "rimlessDrawer", getPhysicalAccessoryMountSide(cell));
    if (height < RIMLESS_DRAWER_MIN_HEIGHT_MM) {
      return mergePathCheck({
        ...base,
        status: "blocked",
        reasons: [...reasons, `一字拉手最低需要 ${RIMLESS_DRAWER_MIN_HEIGHT_MM} mm 模块高度。`],
        warnings
      }, pathCheck);
    }

    const standard = isStandardSize(width, height, depth) && [350, 500].includes(depth) && width >= 250;
    return mergePathCheck({
      ...base,
      status: standard ? "officialExact" : "officialLogicCustomSize",
      reasons,
      warnings: depth === 350 || depth === 500 ? warnings : [...warnings, "自定义深度需要确认导轨长度和抽拉行程。"],
      officialSpec: isStandardSize(width, height, depth) ? `${height} x ${width} x ${depth} mm` : undefined
    }, pathCheck);
  }

  if (!cell.enabled) {
    return block(base, "请先恢复该模块。");
  }

  if (fitting === "none") {
    return { ...base, status: "officialExact", reasons: ["不安装额外内部配件。"], warnings: [] };
  }

  if (config.structureMode === "frameOnly") {
    return block(base, "当前是全框架模式，没有抽屉导轨和围边安装面。");
  }

  if (fitting === "mobileTray") {
    if (!supportsMobileTrayFitting(cell.kind) || hasGlassMobileTrayMount(cell)) {
      return block(base, "当前格是玻璃侧板/玻璃箱体，不能承载移动托盘导轨；只能改金属箱体、玻璃搁板或重新拆分结构。");
    }

    const evaluated = evaluatePullOutShelf(base, width, height, depth);
    const warnings = [...(evaluated.warnings ?? [])];
    if (isDrawerFitting(cell.fitting)) {
      warnings.push("选择普通内部配件会清除带围边抽屉。官方 DWG 已确认移动托盘可与门类前脸共存。");
    }
    if (cell.kind === "open") {
      warnings.push("选择后会自动补齐左右侧板和底板为金属板，背板、顶板和颜色保持当前设置。");
    }
    return mergePathCheck(
      { ...evaluated, warnings },
      evaluateWorkSurfacePath(config, context, "pullOutShelf", getPhysicalAccessoryMountSide(cell))
    );
  }

  const reasons = ["带围边抽屉会独占前脸，并自带导轨和移动托盘逻辑。"];
  const warnings: string[] = [];

  if (!fittingCompatible(cell.kind)) {
    warnings.push("选择后会自动切换为含金属背板模块。");
  }

  if (cell.kind === "glassPanelModule") {
    return block(base, "玻璃箱体默认不承载抽屉导轨。");
  }

  if (isDoorCellKind(cell.kind) || cell.kind === "pullOutShelf") {
    warnings.push("选择后会替换当前前脸或移动托盘。");
  }

  const pathCheck = evaluateWorkSurfacePath(config, context, "rimmedDrawer", getPhysicalAccessoryMountSide(cell));

  if (height < RIMMED_DRAWER_RIM_HEIGHT_MM) {
    return mergePathCheck({
      ...base,
      status: "needsHardwareCheck",
      reasons: [
        ...reasons,
        `带围边抽屉仍按 ${RIMMED_DRAWER_RIM_HEIGHT_MM} mm 围边建模，当前模块高度较低，但允许建模。`
      ],
      warnings: [...warnings, "需确认围边、导轨、安装结构和 BOM 输出是否满足当前格高。"]
    }, pathCheck);
  }

  if (isStandardSize(width, height, depth) && [350, 500].includes(depth) && width >= 500) {
    return mergePathCheck({ ...base, status: "officialExact", reasons, warnings, officialSpec: `${height} x ${width} x ${depth} mm` }, pathCheck);
  }

  if (depth !== 350 && depth !== 500) {
    return mergePathCheck({
      ...base,
      status: "needsHardwareCheck",
      reasons,
      warnings: [...warnings, "自定义深度需要确认导轨长度、承重和防倾。"]
    }, pathCheck);
  }

  return mergePathCheck({
    ...base,
    status: "officialLogicCustomSize",
    reasons,
    warnings: [...warnings, "按工厂自定义抽屉尺寸输出 BOM。"]
  }, pathCheck);
}

function getAccessoryMountNeighbor(config: CabinetConfig, selection: Selection, side: AccessoryMountSide): CellConfig | undefined {
  const depthIndex = getSelectionDepthIndex(config, selection);
  if (side === "left") return getPlanCellConfig(config, selection.row, depthIndex, selection.column - 1);
  if (side === "right") return getPlanCellConfig(config, selection.row, depthIndex, selection.column + 1);
  if (side === "front") return depthIndex > 0 ? getPlanCellConfig(config, selection.row, depthIndex - 1, selection.column) : undefined;
  return depthIndex + 1 < getDepthSegments(config).length
    ? getPlanCellConfig(config, selection.row, depthIndex + 1, selection.column)
    : undefined;
}

export function evaluateCellFrontAccessory(
  config: CabinetConfig,
  selection: Selection | null,
  frontAccessory: CellFrontAccessoryKind,
  accessoryMountSide: AccessoryMountSide = getPhysicalAccessoryMountSide(getCellConfig(config, selection))
): AccessoryEvaluation {
  const context = getEvaluationContext(config, selection);
  if (!context || !selection) return emptyEvaluation("请先选中模块");
  const { width, height, depth, cell } = context;
  const mountSide = normalizeAccessoryMountSide(accessoryMountSide);
  const faceWidth = mountSide === "left" || mountSide === "right" ? depth : width;
  const faceDepth = mountSide === "left" || mountSide === "right" ? width : depth;
  const base = createEvaluationBase(`${frontAccessoryLabel(frontAccessory)} · ${accessoryMountSideLabel(mountSide)}向`, faceWidth, height, faceDepth);

  if (!cell.enabled) {
    return block(base, "请先恢复该模块。");
  }

  if (frontAccessory === "none") {
    return { ...base, status: "officialExact", reasons: ["该格不安装门类前脸。"], warnings: [] };
  }

  if (isOpenableFrontAccessory(frontAccessory)) {
    const neighbor = getAccessoryMountNeighbor(config, selection, mountSide);
    if (neighbor?.enabled) {
      return block(base, `${accessoryMountSideLabel(mountSide)}侧紧邻其他模块，门板没有安全开启空间。`);
    }
  }

  if (config.structureMode === "frameOnly") {
    return block(base, "当前是全框架模式，没有门板安装面。");
  }

  const frontShellKind = frontAccessory === "glassDropDoor" ? "glassDropDoor" : frontAccessory;
  const glassShellConflict = getGlassShellBlockReason(cell.kind, frontShellKind);
  if (glassShellConflict) {
    return block(base, glassShellConflict);
  }

  if (!isFrontAccessoryCompatibleWithShell(frontAccessory, cell.kind)) {
    return block(base, "当前壳体不支持该门类前脸，请先切换为匹配的金属箱体或玻璃箱体。");
  }

  const warnings = isDrawerFitting(cell.fitting) ? ["选择门类前脸会清除当前抽屉。普通内部配件会保留。"] : [];

  if (frontAccessory === "dropDoor") {
    return mergePathCheck({
      ...evaluateDropDoor(base, faceWidth, height, faceDepth),
      warnings: [...warnings, ...evaluateDropDoor(base, faceWidth, height, faceDepth).warnings]
    }, evaluateWorkSurfacePath(config, context, "dropDoor", mountSide));
  }

  if (frontAccessory === "flipUpDoor") {
    const evaluated = {
      ...withStandardSizeStatus(base, faceWidth, height, faceDepth),
      reasons: ["上翻门作为单个前脸配件安装，内部普通配件可按高度继续叠加。"],
      warnings
    };
    return mergePathCheck(evaluated, evaluateWorkSurfacePath(config, context, "flipUpDoor", mountSide));
  }

  const evaluated = withStandardSizeStatus(base, faceWidth, height, faceDepth);
  return mergePathCheck({
    ...evaluated,
    reasons: ["玻璃门作为单个前脸配件，默认按左右侧开玻璃门处理。"],
    warnings: isStandardSize(faceWidth, height, faceDepth) ? warnings : [...warnings, "非官方公开尺寸按工厂定制玻璃门输出。"]
  }, evaluateWorkSurfacePath(config, context, "glassDoor", mountSide));
}

export function evaluateCellInteriorAccessory(
  config: CabinetConfig,
  selection: Selection | null,
  kind: CellInteriorAccessoryKind,
  existing?: CellInteriorAccessory
): AccessoryEvaluation {
  const context = getEvaluationContext(config, selection);
  if (!context) return emptyEvaluation("请先选中模块");
  const { width, height, depth, cell } = context;
  const base = createEvaluationBase(interiorAccessoryLabel(kind), width, height, depth);

  if (!cell.enabled) {
    return block(base, "请先恢复该模块。");
  }

  if (config.structureMode === "frameOnly") {
    return block(base, "当前是全框架模式，没有内部配件安装面。");
  }

  if (isDrawerFitting(cell.fitting)) {
    return block(base, "抽屉独占该格，不能同时叠加普通内部配件。");
  }

  if (!isInteriorAccessoryCompatibleWithCell(kind, cell) || (kind === "mobileTray" && hasGlassMobileTrayMount(cell))) {
    return block(base, getInteriorAccessoryShellBlockReason(kind));
  }

  if (kind === "mobileTray") {
    const evaluated = mergePathCheck(
      evaluatePullOutShelf(base, width, height, depth),
      evaluateWorkSurfacePath(config, context, "pullOutShelf", getPhysicalAccessoryMountSide(cell))
    );
    const warnings = [...evaluated.warnings];
    const mobileTrays = (cell.interiorAccessories ?? []).filter((item) => item.kind === "mobileTray" && item.id !== existing?.id);
    const mountHeight = normalizeInteriorMountHeight(existing?.mountHeightMm, height);
    if (mobileTrays.some((item) => Math.abs(item.mountHeightMm - mountHeight) < MIN_INTERIOR_ACCESSORY_SPACING_MM)) {
      warnings.push(`同格多个移动托盘高度间距小于 ${MIN_INTERIOR_ACCESSORY_SPACING_MM} mm，需要确认导轨安装空间和拉出路径。`);
      return { ...evaluated, status: evaluated.status === "blocked" ? "blocked" : "needsHardwareCheck", warnings };
    }
    if (mobileTrays.length) {
      warnings.push("同格多个移动托盘允许保存，但每层导轨、承重和拉出路径需要工厂确认。");
      return { ...evaluated, status: evaluated.status === "blocked" ? "blocked" : "needsHardwareCheck", warnings };
    }
    if (isOpenableFrontAccessory(cell.frontAccessory)) {
      warnings.push("官方 DWG 已确认门类前脸存在时可新增移动托盘；生产时仍需确认门板全开和托盘拉出路径互不干涉。");
    }
    return { ...evaluated, warnings };
  }

  return evaluateFixedShelfLike(base, width, height, depth, kind, cell);
}

export function buildBom(config: CabinetConfig): BomItem[] {
  const items: BomItem[] = [];
  const frame = collectFrameParts(config);

  addItem(items, "球节点", "标准连接球", frame.points.size, "个", 88);

  const tubeQuantities = new Map<number, number>();
  [frame.xLengths, frame.yLengths, frame.zLengths].forEach((lengths) => {
    lengths.forEach((qty, length) => tubeQuantities.set(length, (tubeQuantities.get(length) ?? 0) + qty));
  });
  tubeQuantities.forEach((qty, length) => addItem(items, "钢管", `${length} mm`, qty, "根", tubePrice(length), { displaySpec: `${factoryTubeLength(length)} mm`, finish: config.frameFinish }));
  addItem(items, "膨胀螺丝", "2颗/根钢管", totalFrameTubeQty(frame) * 2, "颗", 0);

  const feet = getFeetOption(config.feet);
  addItem(items, feet.label, "底部支撑", frame.feet.size, "个", feet.unitPrice);

  addFactoryPanelBom(items, config);

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
      if (!cell.enabled || config.structureMode === "frameOnly") return;
      const width = config.columnWidths[columnIndex];
      const height = config.rowHeights[rowIndex];
      const depth = getCellDepth(config, rowIndex, columnIndex, depthIndex);
      const effectiveKind = getBomStructureKind(config, cell);
      const spec = `${width} x ${height} x ${depth} mm`;
      const color = getEffectiveCellColor(config, rowIndex, columnIndex, depthIndex);

      if (effectiveKind === "dropDoor") {
        addDropDoorFactoryBom(items, width, height, color);
        addCellFittingBom(items, cell, effectiveKind, width, height, depth, color);
        return;
      }

      if (effectiveKind === "open") {
        addFactoryFrontAccessoryBom(items, cell, width, height, depth, color);
        addCellFittingBom(items, cell, effectiveKind, width, height, depth, color);
        return;
      }

      const accessory = getAccessory(effectiveKind as AccessoryModelKind);
      if (shouldKeepCompositeBomLine(effectiveKind)) {
        addItem(items, accessory.bomName, spec, 1, accessory.unit, accessory.unitPrice);
      }
      addFactoryFrontAccessoryBom(items, cell, width, height, depth, color);

      if (effectiveKind === "sideOpenDoor") {
        return;
      }

      addCellFittingBom(items, cell, effectiveKind, width, height, depth, color);
      });
    });
  });

  if (config.structureMode !== "frameOnly") {
    config.workSurfaces.forEach((surface) => {
      if (!surface.enabled) return;
      const size = getWorkSurfaceBomSize(config, surface);
      const label = surface.kind === "deskTop" ? "跨格桌面" : "桥接台面";
      const unitPrice = Math.round(480 + size.width * size.depth * 0.00032 + size.thickness * 9);
      addItem(items, label, `${size.width} x ${size.depth} x ${size.thickness} mm`, 1, "块", unitPrice);
    });
  }

  return items;
}

function getBomStructureKind(config: CabinetConfig, cell: CellConfig): CellKind {
  const structuralKind: CellKind = cell.kind === "glassDropDoor" ? "open" : cell.kind;
  return config.structureMode === "noPanels" ? "open" : structuralKind;
}

function totalFrameTubeQty(frame: ReturnType<typeof collectFrameParts>): number {
  return sum([...frame.xLengths.values(), ...frame.yLengths.values(), ...frame.zLengths.values()]);
}

function addFactoryPanelBom(items: BomItem[], config: CabinetConfig) {
  if (config.structureMode === "frameOnly" || config.structureMode === "noPanels") return;

  const horizontalPanels = new Set<string>();
  const sidePanels = new Set<string>();
  const planCells = getPlanCells(config);

  planCells.forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
        if (!cell.enabled) return;
        const kind = getBomStructureKind(config, cell);
        const width = config.columnWidths[columnIndex];
        const height = config.rowHeights[rowIndex];
        const depth = getCellDepth(config, rowIndex, columnIndex, depthIndex);

        const selection = { row: rowIndex, column: columnIndex, depthIndex };
        const color = getEffectiveCellColor(config, rowIndex, columnIndex, depthIndex);

        addFactoryHorizontalPanel(items, horizontalPanels, rowIndex, columnIndex, depthIndex, "bottom", cell, kind, width, depth, getEffectivePanelColor(config, selection, "bottom"));
        addFactoryHorizontalPanel(items, horizontalPanels, rowIndex + 1, columnIndex, depthIndex, "top", cell, kind, width, depth, getEffectivePanelColor(config, selection, "top"));

        const backMaterial = getFactoryBackPanelMaterial(cell, kind);
        if (backMaterial === "metal") {
          addItem(items, "金属扣板", `${width} x ${height} mm`, 1, "块", factoryPanelPrice(width, height), {
            displaySpec: factoryPanelSpec(width, height),
            color: getEffectivePanelColor(config, selection, "back")
          });
        } else if (backMaterial === "perforated") {
          addPerforatedPanelItem(items, width, height, getEffectivePanelColor(config, selection, "back"));
        } else if (backMaterial === "glass") {
          addItem(items, "玻璃板", `${width} x ${height} mm`, 1, "块", Math.round(260 + width * height * 0.00048));
          addItem(items, "玻璃夹角", "固定玻璃板四角夹", 4, "个", 0);
        }

        const frontMaterial = getFactoryFrontPanelMaterial(cell, kind);
        if (frontMaterial === "metal") {
          addItem(items, "金属扣板", `${width} x ${height} mm`, 1, "块", factoryPanelPrice(width, height), {
            displaySpec: factoryPanelSpec(width, height),
            color: getEffectivePanelColor(config, selection, "front")
          });
        } else if (frontMaterial === "perforated") {
          addPerforatedPanelItem(items, width, height, getEffectivePanelColor(config, selection, "front"));
        } else if (frontMaterial === "glass") {
          addItem(items, "玻璃板", `${width} x ${height} mm`, 1, "块", Math.round(260 + width * height * 0.00048));
          addItem(items, "玻璃夹角", "固定玻璃板四角夹", 4, "个", 0);
        }
      });

      const activeColumns = depthRow
        .map((cell, columnIndex) => ({ cell, columnIndex }))
        .filter(({ cell }) => cell.enabled);
      if (!activeColumns.length) return;

      const first = activeColumns[0];
      const last = activeColumns[activeColumns.length - 1];
      addFactoryOuterPanel(items, sidePanels, config, rowIndex, depthIndex, first.columnIndex, first.cell, "left");
      addFactoryOuterPanel(items, sidePanels, config, rowIndex, depthIndex, last.columnIndex, last.cell, "right");

      for (let columnIndex = 0; columnIndex < depthRow.length - 1; columnIndex += 1) {
        const left = depthRow[columnIndex];
        const right = depthRow[columnIndex + 1];
        if (!left?.enabled || !right?.enabled) continue;
        const leftKind = getBomStructureKind(config, left);
        const rightKind = getBomStructureKind(config, right);
        if (!needsFactoryMountingFace(left, leftKind) && !needsFactoryMountingFace(right, rightKind)) continue;
        const leftMaterial = getFactorySidePanelMaterial(left, leftKind, "right");
        const rightMaterial = getFactorySidePanelMaterial(right, rightKind, "left");
        const hasMetalMount = leftMaterial === "metal"
          || leftMaterial === "perforated"
          || rightMaterial === "metal"
          || rightMaterial === "perforated";
        if (!hasMetalMount) continue;
        const height = config.rowHeights[rowIndex];
        const depth = Math.max(
          getCellDepth(config, rowIndex, columnIndex, depthIndex),
          getCellDepth(config, rowIndex, columnIndex + 1, depthIndex)
        );
        const key = `inner:${rowIndex}:${depthIndex}:${columnIndex}:${depth}:${height}`;
        if (sidePanels.has(key)) continue;
        sidePanels.add(key);
        const innerColor = getEffectiveCellColor(config, rowIndex, columnIndex, depthIndex);
        if (leftMaterial === "perforated" || rightMaterial === "perforated") {
          addPerforatedPanelItem(items, depth, height, innerColor);
          addItem(items, "大角码", "共享安装面", 2, "个", 0);
        } else {
          addFourSideHolePanelItem(items, depth, height, innerColor);
          addItem(items, "大角码", "共享安装面", 2, "个", 0);
        }
      }
    });
  });
}

function addFactoryHorizontalPanel(
  items: BomItem[],
  keys: Set<string>,
  boundaryIndex: number,
  columnIndex: number,
  depthIndex: number,
  panel: "top" | "bottom",
  cell: CellConfig,
  kind: CellKind,
  width: number,
  depth: number,
  color: string
) {
  const material = getFactoryHorizontalPanelMaterial(cell, kind, panel);
  if (material === "none") return;
  const key = `${material}:${boundaryIndex}:${columnIndex}:${depthIndex}:${width}:${depth}`;
  if (keys.has(key)) return;
  keys.add(key);
  if (material === "glass") {
    addItem(items, "玻璃板", `${width} x ${depth} mm`, 1, "块", Math.round(260 + width * depth * 0.00048));
    addItem(items, "玻璃夹角", "固定玻璃板四角夹", 4, "个", 0);
    return;
  }
  if (material === "perforated") {
    addPerforatedPanelItem(items, width, depth, color);
    return;
  }
  addItem(items, "金属扣板", `${width} x ${depth} mm`, 1, "块", factoryPanelPrice(width, depth), { displaySpec: factoryPanelSpec(width, depth), color });
}

function addFactoryOuterPanel(
  items: BomItem[],
  keys: Set<string>,
  config: CabinetConfig,
  rowIndex: number,
  depthIndex: number,
  columnIndex: number,
  cell: CellConfig,
  side: "left" | "right"
) {
  const kind = getBomStructureKind(config, cell);
  const material = getFactorySidePanelMaterial(cell, kind, side);
  if (material === "none") return;
  const height = config.rowHeights[rowIndex];
  const depth = getCellDepth(config, rowIndex, columnIndex, depthIndex);
  const key = `outer:${side}:${rowIndex}:${depthIndex}:${columnIndex}:${depth}:${height}`;
  if (keys.has(key)) return;
  keys.add(key);
  if (material === "glass") {
    addItem(items, "玻璃板", `${depth} x ${height} mm`, 1, "块", Math.round(260 + depth * height * 0.00048));
    addItem(items, "玻璃夹角", "固定玻璃板四角夹", 4, "个", 0);
    return;
  }
  if (material === "perforated") {
    addPerforatedPanelItem(items, depth, height, getEffectivePanelColor(config, { row: rowIndex, column: columnIndex, depthIndex }, side));
    return;
  }
  addItem(items, "外板", `${depth} x ${height} mm`, 1, "块", factoryPanelPrice(depth, height), {
    displaySpec: factoryPanelSpec(depth, height),
    color: getEffectivePanelColor(config, { row: rowIndex, column: columnIndex, depthIndex }, side)
  });
}

function getFactoryHorizontalPanelMaterial(cell: CellConfig, kind: CellKind, panel: "top" | "bottom"): StructurePanelMaterial {
  const override = cell.structure?.panels?.[panel];
  if (override) return override;
  if (kind === "glassPanelModule") return "glass";
  if (kind === "open") return "metal";
  return getEffectiveStructurePanelMaterial(cell, kind, panel);
}

function occupiesPhysicalPanel(cell: CellConfig, panel: StructurePanelKey): boolean {
  const hasDirectionalFront = hasFrontAccessory(cell.frontAccessory) || cell.fitting === "rimlessDrawer";
  return hasDirectionalFront && getPhysicalAccessoryMountSide(cell) === panel;
}

function getFactoryFrontPanelMaterial(cell: CellConfig, kind: CellKind): StructurePanelMaterial {
  if (occupiesPhysicalPanel(cell, "front")) return "none";
  return getEffectiveStructurePanelMaterial(cell, kind, "front");
}

function getFactoryBackPanelMaterial(cell: CellConfig, kind: CellKind): StructurePanelMaterial {
  if (occupiesPhysicalPanel(cell, "back")) return "none";
  const override = cell.structure?.panels?.back;
  if (override) return override;
  if (kind === "open" && needsFactoryMountingFace(cell, kind)) return "metal";
  return getEffectiveStructurePanelMaterial(cell, kind, "back");
}

function getFactorySidePanelMaterial(cell: CellConfig, kind: CellKind, side: "left" | "right"): StructurePanelMaterial {
  if (occupiesPhysicalPanel(cell, side)) return "none";
  const override = cell.structure?.panels?.[side];
  if (override) return override;
  if (kind === "open" && needsFactoryMountingFace(cell, kind)) return "metal";
  return getEffectiveStructurePanelMaterial(cell, kind, side);
}

function addPerforatedPanelItem(items: BomItem[], width: number, height: number, color: string) {
  const accessory = getAccessory("perforatedPanel");
  addItem(items, accessory.bomName, `${width} x ${height} mm`, 1, accessory.unit, accessory.unitPrice, { color });
}

function addFourSideHolePanelItem(items: BomItem[], width: number, height: number, color: string) {
  addItem(items, "扣板（四排孔）", `${width} x ${height} mm`, 1, "块", factoryPanelPrice(width, height), { displaySpec: factoryPanelSpec(width, height), color });
}

function needsFactoryMountingFace(cell: CellConfig, kind: CellKind): boolean {
  if (
    kind === "dropDoor"
    || kind === "flipUpDoor"
    || kind === "sideOpenDoor"
    || kind === "pullOutShelf"
    || kind === "boxDrawer"
  ) {
    return true;
  }

  if (hasFrontAccessory(cell.frontAccessory)) return true;
  if (cell.fitting === "mobileTray" || isDrawerFitting(cell.fitting)) return true;
  return Boolean(cell.interiorAccessories?.some((accessory) => (
    accessory.kind === "mobileTray"
    || accessory.kind === "shelf"
    || accessory.kind === "displayTray"
    || accessory.kind === "glassShelf"
  )));
}

function shouldKeepCompositeBomLine(kind: CellKind): boolean {
  return ![
    "metalBackModule",
    "noBackModule",
    "glassPanelModule",
    "dropDoor",
    "sideOpenDoor",
    "openBackPanel",
    "sidePanel"
  ].includes(kind);
}

function addFactoryFrontAccessoryBom(items: BomItem[], cell: CellConfig, width: number, height: number, depth: number, color: string) {
  const mountSide = getPhysicalAccessoryMountSide(cell);
  const faceWidth = mountSide === "left" || mountSide === "right" ? depth : width;
  const accessoryColor = cell.accessoryColors?.front ?? color;
  if (cell.frontAccessory === "dropDoor") {
    addDropDoorFactoryBom(items, faceWidth, height, accessoryColor);
    return;
  }
  addFrontAccessoryBom(items, cell, width, height, depth, accessoryColor);
}

function addDropDoorFactoryBom(items: BomItem[], width: number, height: number, color: string) {
  addItem(items, "下翻门", `${width} x ${height} mm`, 1, "扇", Math.round(220 + width * height * 0.0003), { displaySpec: factoryPanelSpec(width, height), color });
  addItem(items, "一元锁", "下翻门用", 1, "个", 0);
  addItem(items, "下翻锁盒套装", "1锁盒/扇", 1, "套", 20);
  addItem(items, "锁头螺丝", "2颗/锁头", 2, "颗", 0);
  addItem(items, "下翻门铰链", "常用", 2, "只", 33);
  addItem(items, "铰链螺丝", "3颗/只铰链", 6, "颗", 0);
  addItem(items, "L型塑料", "1个/只铰链", 2, "个", 0);
  addItem(items, "垫片", "2个/只铰链", 4, "个", 0);
}

function factoryPanelSpec(width: number, height: number): string {
  return `${factoryPanelDimension(width)} x ${factoryPanelDimension(height)} mm`;
}

function factoryPanelDimension(value: number): number {
  const nominal = Math.round(value);
  const mapped: Record<number, number> = {
    750: 735,
    580: 580,
    350: 335,
    175: 160,
    500: 485,
    395: 380,
    300: 285,
    250: 235,
    150: 135,
    100: 85
  };
  return mapped[nominal] ?? Math.max(1, nominal - 15);
}

function factoryTubeLength(value: number): number {
  const nominal = Math.round(value);
  const mapped: Record<number, number> = {
    750: 732,
    580: 577,
    350: 332,
    175: 157,
    500: 482,
    395: 377,
    300: 282,
    250: 232,
    100: 82
  };
  return mapped[nominal] ?? Math.max(1, nominal - 18);
}

function factoryPanelPrice(width: number, height: number): number {
  return Math.round(180 + width * height * 0.00018);
}

export function validateProductionConfig(config: CabinetConfig): ProductionValidationReport {
  const issues: ProductionIssue[] = [];
  const activeCount = getActiveCellCount(config);

  if (config.structureMode === "frameOnly") {
    issues.push({
      id: "structure.frameOnly",
      severity: "blocked",
      scope: "整柜",
      title: "全框架模式不能作为完整柜体生产",
      message: "当前只保留钢管、球节点和底部支撑，没有板件、门板或导轨安装面。",
      suggestion: "切回完整柜体，或把它作为裸框架订单单独处理。"
    });
  }

  if (activeCount < config.rowHeights.length * config.columnWidths.length * getDepthSegments(config).length) {
    issues.push({
      id: "structure.irregular",
      severity: "check",
      scope: "整柜",
      title: "异形缺格需要工厂确认钢管连续性",
      message: "当前存在被删除/禁用的格子，BOM 会按异形结构输出，但生产前需要确认相邻球节点、钢管和支撑点。",
      suggestion: "保留异形结构，出图时让工厂确认缺格边界和落地支撑。"
    });
  }

  config.workSurfaces.forEach((surface) => {
    if (!surface.enabled) return;
    const size = getWorkSurfaceBomSize(config, surface);
    issues.push({
      id: `surface.${surface.id}`,
      severity: "check",
      scope: `${surface.fromColumn + 1}-${surface.toColumn + 1} 列 / 第 ${surface.row + 1} 层`,
      title: surface.kind === "deskTop" ? "跨格桌面需要路径和支撑确认" : "桥接台面需要支撑确认",
      message: `${size.width} x ${size.depth} x ${size.thickness} mm 台面会影响上翻门、抽拉件、抽屉和门板开合路径。`,
      suggestion: "生产前确认台面下沿、出沿、连接件、限位链和抽拉行程。"
    });
  });

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
      if (!cell.enabled) return;
      const context = getEvaluationContext(config, { row: rowIndex, column: columnIndex, depthIndex });
      if (!context) return;
      const scope = `${columnIndex + 1} 列 / ${depthIndex + 1} 深度 / ${rowIndex + 1} 层`;
      const { width, height, depth } = context;

      if (!isStandardSize(width, height, depth)) {
        issues.push({
          id: `cell.${rowIndex}.${columnIndex}.customSize`,
          severity: "info",
          scope,
          title: "非官方模数按工厂定制输出",
          message: `当前格尺寸 ${width} x ${height} x ${depth} mm 不是完整官方公开模数组合。`,
          suggestion: "可以生产，但门板、玻璃、钢管和板件按工厂尺寸复核。"
        });
      }

      pushCurrentCellKindIssue(issues, config, { row: rowIndex, column: columnIndex, depthIndex }, cell.kind, scope);

      if (hasFrontAccessory(cell.frontAccessory)) {
        const evaluation = evaluateCellFrontAccessory(config, { row: rowIndex, column: columnIndex, depthIndex }, cell.frontAccessory);
        pushEvaluationIssue(issues, `front.${rowIndex}.${depthIndex}.${columnIndex}.${cell.frontAccessory}`, scope, evaluation, `当前${frontAccessoryLabel(cell.frontAccessory)}生产校验`);
        if (cell.frontAccessory === "dropDoor") {
          issues.push({
            id: `front.${rowIndex}.${depthIndex}.${columnIndex}.dropDoorHardware`,
            severity: "check",
            scope,
            title: "下翻门需要铰链和限位确认",
            message: "下翻门生产时需要门板、2 只下翻门铰链、锁盒和限位/开合半径确认；若同格有移动托盘，还要确认门板全开后托盘可拉出。",
            suggestion: "按官方 DWG 的下翻门 + 移动托盘效果复核铰链、限位链、门板角度和托盘导轨行程。"
          });
        }
      }

      cell.interiorAccessories?.forEach((accessory) => {
        const evaluation = evaluateCellInteriorAccessory(config, { row: rowIndex, column: columnIndex, depthIndex }, accessory.kind, accessory);
        pushEvaluationIssue(issues, `interior.${rowIndex}.${depthIndex}.${columnIndex}.${accessory.id}`, scope, evaluation, `当前${interiorAccessoryLabel(accessory.kind)}生产校验`);
        if (accessory.kind === "mobileTray" && evaluation.status !== "blocked") {
          issues.push({
            id: `interior.${rowIndex}.${depthIndex}.${columnIndex}.${accessory.id}.railHardware`,
            severity: "check",
            scope,
            title: "移动托盘需要导轨和防倾确认",
            message: `移动托盘安装高 ${accessory.mountHeightMm} mm，需要确认左右安装面、导轨长度、承重、防倾和拉出行程。`,
            suggestion: "保留左右金属侧板和底板；同格多移动托盘或门类前脸共存时单独确认导轨型号和拉出路径。"
          });
        }
        if (accessory.kind === "glassShelf" && evaluation.status !== "blocked") {
          issues.push({
            id: `interior.${rowIndex}.${depthIndex}.${columnIndex}.${accessory.id}.glassClips`,
            severity: "check",
            scope,
            title: "玻璃搁板需要夹件确认",
            message: `玻璃搁板安装高 ${accessory.mountHeightMm} mm，不能只按一块玻璃生产。`,
            suggestion: "生产前确认玻璃厚度、玻璃夹数量、支撑点和承重。"
          });
        }
      });

      const mobileTrays = (cell.interiorAccessories ?? []).filter((accessory) => accessory.kind === "mobileTray");
      mobileTrays.forEach((accessory, index) => {
        const closeTray = mobileTrays.slice(index + 1).find((other) => Math.abs(other.mountHeightMm - accessory.mountHeightMm) < MIN_INTERIOR_ACCESSORY_SPACING_MM);
        if (!closeTray) return;
        issues.push({
          id: `interior.${rowIndex}.${depthIndex}.${columnIndex}.${accessory.id}.${closeTray.id}.spacing`,
          severity: "check",
          scope,
          title: "多个移动托盘高度间距需要确认",
          message: `移动托盘安装高 ${accessory.mountHeightMm} mm 与 ${closeTray.mountHeightMm} mm 间距小于 ${MIN_INTERIOR_ACCESSORY_SPACING_MM} mm。`,
          suggestion: "配置允许保存，但生产前需要确认导轨安装空间、承重、防倾和两层拉出路径不会互相干涉。"
        });
      });

      if (isDrawerFitting(cell.fitting)) {
        const evaluation = evaluateCellFitting(config, { row: rowIndex, column: columnIndex, depthIndex }, cell.fitting);
        pushEvaluationIssue(issues, `fitting.${rowIndex}.${depthIndex}.${columnIndex}.${cell.fitting}`, scope, evaluation, "当前抽屉生产校验");
      }
      });
    });
  });

  const counts = {
    blocked: issues.filter((issue) => issue.severity === "blocked").length,
    check: issues.filter((issue) => issue.severity === "check").length,
    info: issues.filter((issue) => issue.severity === "info").length
  };
  const status: ProductionValidationStatus = counts.blocked > 0 ? "blocked" : counts.check > 0 ? "needsReview" : "buildable";
  const title = status === "blocked" ? "当前配置不能直接生产" : status === "needsReview" ? "当前配置可生产但需确认" : "当前配置生产逻辑成立";
  const summary = status === "blocked"
    ? `发现 ${counts.blocked} 个硬冲突，需调整后再出 BOM。`
    : status === "needsReview"
      ? `没有硬冲突，仍有 ${counts.check} 个五金/结构确认项。`
      : "未发现硬冲突或必须确认项，可进入工厂 BOM 复核。";

  return { status, title, summary, issues, counts };
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

function closedDropDoor(): CellConfig {
  return { kind: "dropDoor", enabled: true, doorOpen: 0, doorState: "closed" };
}

function openModule(kind: CellKind = "metalBackModule"): CellConfig {
  return { kind, enabled: true };
}

function rimmedDrawer(drawerPull = 0.12): CellConfig {
  return {
    kind: "metalBackModule",
    enabled: true,
    fitting: "rimmedDrawer",
    drawerPull
  };
}

function normalizeCatalogPreset(input: Partial<CabinetConfig>): CabinetConfig {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    depth: 350,
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    workSurfaces: [],
    ...input
  });
}

function createTwoDoorLowCatalogPreset(): CabinetConfig {
  const cells = createCells(2, 2, "open");
  cells[0] = [openModule("open"), openModule("open")];
  cells[1] = [closedDropDoor(), closedDropDoor()];

  return normalizeCatalogPreset({
    columnWidths: [500, 500],
    rowHeights: [100, 350],
    panelColor: USM_COLOR_VALUES.steelBlue,
    cells
  });
}

function createTwoByTwoOpenDropCatalogPreset(): CabinetConfig {
  const cells = createCells(2, 2, "metalBackModule");
  cells[0] = [closedDropDoor(), closedDropDoor()];
  cells[1] = [openModule("metalBackModule"), openModule("metalBackModule")];

  return normalizeCatalogPreset({
    columnWidths: [500, 500],
    rowHeights: [350, 350],
    panelColor: USM_COLOR_VALUES.usmGreen,
    cells
  });
}

function createSingleColumnThreeLevelCatalogPreset(): CabinetConfig {
  return normalizeCatalogPreset({
    columnWidths: [750],
    rowHeights: [350, 350, 175],
    panelColor: USM_COLOR_VALUES.midGrey,
    cells: [
      [closedDropDoor()],
      [closedDropDoor()],
      [closedDropDoor()]
    ]
  });
}

function createThreeColumnTvCatalogPreset(): CabinetConfig {
  const cells = createCells(2, 3, "open");
  cells[0] = [openModule("open"), openModule("open"), openModule("open")];
  cells[1] = [closedDropDoor(), closedDropDoor(), closedDropDoor()];

  return normalizeCatalogPreset({
    columnWidths: [750, 750, 750],
    rowHeights: [100, 350],
    panelColor: USM_COLOR_VALUES.gentianBlue,
    cells
  });
}

function createTwoColumnTallDisplayCatalogPreset(): CabinetConfig {
  const cells = createCells(5, 2, "metalBackModule");
  cells[0] = [closedDropDoor(), closedDropDoor()];
  cells[1] = [closedDropDoor(), closedDropDoor()];
  cells[2] = [openModule("metalBackModule"), openModule("metalBackModule")];
  cells[3] = [openModule("metalBackModule"), openModule("metalBackModule")];
  cells[4] = [openModule("metalBackModule"), openModule("metalBackModule")];

  return normalizeCatalogPreset({
    columnWidths: [750, 750],
    rowHeights: [350, 350, 350, 350, 350],
    panelColor: USM_COLOR_VALUES.pureWhite,
    cells
  });
}

function createThreeColumnDrawerSideboardCatalogPreset(): CabinetConfig {
  const cells = createCells(3, 3, "dropDoor");
  cells[0] = [closedDropDoor(), closedDropDoor(), closedDropDoor()];
  cells[1] = [closedDropDoor(), closedDropDoor(), closedDropDoor()];
  cells[2] = [rimmedDrawer(), rimmedDrawer(), rimmedDrawer()];

  return normalizeCatalogPreset({
    columnWidths: [750, 750, 750],
    rowHeights: [350, 350, 175],
    panelColor: USM_COLOR_VALUES.pureWhite,
    cells
  });
}

function createSingleColumnBookshelfCatalogPreset(): CabinetConfig {
  const cells = createCells(5, 1, "noBackModule");
  cells[0] = [closedDropDoor()];
  cells[1] = [closedDropDoor()];
  cells[2] = [openModule("noBackModule")];
  cells[3] = [openModule("noBackModule")];
  cells[4] = [openModule("noBackModule")];

  return normalizeCatalogPreset({
    columnWidths: [750],
    rowHeights: [350, 350, 350, 350, 350],
    panelColor: USM_COLOR_VALUES.usmBrown,
    cells
  });
}

export const EIGHTCOLORS_CATALOG_PRESETS: CatalogPresetOption[] = [
  {
    id: "two-door-low",
    label: "2列翻门低柜",
    reference: "8colors: W1020 x D370 x H490 approx; internal 2 x 500, base 100 + door 350",
    createConfig: createTwoDoorLowCatalogPreset
  },
  {
    id: "two-by-two-open-drop",
    label: "2列开放翻门",
    reference: "8colors: W1020 x D370 x H740; internal 2 x 500, 2 x 350",
    createConfig: createTwoByTwoOpenDropCatalogPreset
  },
  {
    id: "single-column-three-level",
    label: "750三层柜",
    reference: "8colors: W770 x D370 x H915; internal 750, 350 + 350 + 175",
    createConfig: createSingleColumnThreeLevelCatalogPreset
  },
  {
    id: "three-column-tv",
    label: "3列电视柜",
    reference: "8colors: W2270 x D370 x H490; internal 3 x 750, base 100 + door 350",
    createConfig: createThreeColumnTvCatalogPreset
  },
  {
    id: "two-column-tall-display",
    label: "2列高展示柜",
    reference: "8colors: W1520 x D370 x H1790; internal 2 x 750, 5 x 350",
    createConfig: createTwoColumnTallDisplayCatalogPreset
  },
  {
    id: "three-column-drawer-sideboard",
    label: "3列抽屉边柜",
    reference: "8colors: W2270 x D370 x H915; internal 3 x 750, 175 drawer + 2 x 350 doors",
    createConfig: createThreeColumnDrawerSideboardCatalogPreset
  },
  {
    id: "single-column-bookshelf",
    label: "单列书架",
    reference: "8colors: W770 x D370 x H1790; internal 750, 5 x 350",
    createConfig: createSingleColumnBookshelfCatalogPreset
  }
];

export function createSteppedPreset(): CabinetConfig {
  const columnWidths = [500, 500, 500, 500];
  const rowHeights = [350, 350, 350];
  const cells = createCells(rowHeights.length, columnWidths.length, "metalBackModule");

  cells[2][2].enabled = false;
  cells[2][3].enabled = false;
  cells[1][3].enabled = false;
  cells[0][0].kind = "dropDoor";
  cells[0][1].kind = "dropDoor";
  cells[1][0].kind = "metalBackModule";
  cells[1][1].kind = "displayTray";
  cells[2][0].frontAccessory = "glassDropDoor";
  cells[2][0].glassDoorHandleSide = "right";
  cells[2][0].doorOpen = 0;
  cells[2][0].doorState = "closed";

  return normalizeConfig({ ...DEFAULT_CONFIG, columnWidths, rowHeights, cells });
}

export function createSquareCoffeeTablePreset(): CabinetConfig {
  const openCell = (): CellConfig => ({
    kind: "sideOpenDoor",
    enabled: true,
    color: USM_COLOR_VALUES.graphiteBlack,
    structure: {
      panels: {
        top: "glass",
        bottom: "metal"
      }
    }
  });
  const dropDoorCell = (): CellConfig => ({
    kind: "dropDoor",
    enabled: true,
    color: USM_COLOR_VALUES.graphiteBlack,
    doorOpen: 0,
    doorState: "closed",
    faceSide: "front",
    structure: {
      panels: {
        top: "glass",
        bottom: "metal"
      }
    }
  });
  const planCells: CellConfig[][][] = [[
    [openCell(), dropDoorCell()],
    [openCell(), openCell()]
  ]];

  return normalizeConfig({
    depth: 1000,
    depthSegments: [500, 500],
    columnWidths: [500, 500],
    rowHeights: [350],
    panelColor: USM_COLOR_VALUES.graphiteBlack,
    colorScope: "all",
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    planCells,
    workSurfaces: []
  });
}

export function createKitchenIslandPreset(): CabinetConfig {
  const panelColor = USM_COLOR_VALUES.pureWhite;
  const frontDropDoor = (): CellConfig => ({
    kind: "dropDoor",
    enabled: true,
    doorOpen: 0,
    doorState: "closed",
    faceSide: "front"
  });
  const backDropDoor = (): CellConfig => ({
    kind: "dropDoor",
    enabled: true,
    doorOpen: 0,
    doorState: "closed",
    faceSide: "back",
    structure: {
      panels: {
        back: "none"
      }
    }
  });
  const rimmedIslandDrawer = (faceSide: CellFaceSide): CellConfig => ({
    kind: "metalBackModule",
    enabled: true,
    fitting: "rimmedDrawer",
    drawerPull: 0.12,
    faceSide,
    structure: faceSide === "back" ? {
      panels: {
        back: "none"
      }
    } : undefined
  });
  const bridgeModule = (): CellConfig => ({
    kind: "sideOpenDoor",
    enabled: true
  });

  const planCells: CellConfig[][][] = [
    [
      [frontDropDoor(), bridgeModule(), frontDropDoor()],
      [bridgeModule(), bridgeModule(), bridgeModule()],
      [backDropDoor(), bridgeModule(), backDropDoor()]
    ],
    [
      [rimmedIslandDrawer("front"), rimmedIslandDrawer("front"), rimmedIslandDrawer("front")],
      [bridgeModule(), bridgeModule(), bridgeModule()],
      [rimmedIslandDrawer("back"), rimmedIslandDrawer("back"), rimmedIslandDrawer("back")]
    ]
  ];

  return normalizeConfig({
    depth: 1050,
    depthSegments: [350, 350, 350],
    columnWidths: [500, 750, 500],
    rowHeights: [350, 350],
    panelColor,
    colorScope: "all",
    frameFinish: "chrome",
    feet: "glides",
    structureMode: "complete",
    showDimensions: true,
    planCells,
    workSurfaces: []
  });
}

export function isCellEnabled(config: CabinetConfig, selection: Selection | null): boolean {
  if (!selection) return false;
  return getCellConfig(config, selection)?.enabled === true;
}

export function isDoorCellKind(kind: CellKind): boolean {
  return kind === "dropDoor" || kind === "flipUpDoor";
}

export function getActiveCellCount(config: CabinetConfig): number {
  return getPlanCells(config).reduce((total, row) => (
    total + row.reduce((rowTotal, depthRow) => rowTotal + depthRow.filter((cell) => cell.enabled).length, 0)
  ), 0);
}

export function findNearestEnabled(config: CabinetConfig, preferred: Selection = { row: 0, column: 0 }): Selection {
  if (isCellEnabled(config, preferred)) return preferred;
  let best: Selection | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const preferredDepth = getSelectionDepthIndex(config, preferred);

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
        if (!cell.enabled) return;
        const distance = Math.abs(rowIndex - preferred.row) + Math.abs(columnIndex - preferred.column) + Math.abs(depthIndex - preferredDepth);
        if (distance < bestDistance) {
          best = { row: rowIndex, column: columnIndex, depthIndex };
          bestDistance = distance;
        }
      });
    });
  });

  return best ?? { row: 0, column: 0, depthIndex: 0 };
}

export function getWorkSurfaceBomSize(config: CabinetConfig, surface: WorkSurfaceConfig) {
  const width = sum(config.columnWidths.slice(surface.fromColumn, surface.toColumn + 1)) + surface.overhangLeft + surface.overhangRight;
  const depth = surface.depth + surface.overhangFront + surface.overhangBack;
  return {
    width: Math.round(width),
    depth: Math.round(depth),
    thickness: Math.round(surface.thickness)
  };
}

function normalizeDimensionLabelWeights(input: Partial<DimensionLabelWeights> | undefined): DimensionLabelWeights {
  return {
    horizontal: normalizeDimensionLabelWeight(input?.horizontal, 600),
    vertical: normalizeDimensionLabelWeight(input?.vertical, 800),
    outer: normalizeDimensionLabelWeight(input?.outer, 800)
  };
}

function normalizeDimensionLabelWeight(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, 100, 900));
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

function normalizeDoorOpen(value: unknown, legacyDoorState?: unknown, fallback = 0.48): number {
  if (typeof value === "number" && Number.isFinite(value)) return clamp(value, 0, 1);
  if (legacyDoorState === "closed") return 0;
  if (legacyDoorState === "open") return 1;
  return fallback;
}

function normalizeCellFrontAccessory(value: unknown, legacyKind?: CellKind): CellFrontAccessoryKind {
  if (value === "dropDoor" || legacyKind === "dropDoor") return "dropDoor";
  if (value === "flipUpDoor" || legacyKind === "flipUpDoor") return "flipUpDoor";
  if (value === "glassDropDoor" || legacyKind === "glassDropDoor") return "glassDropDoor";
  return "none";
}

function isInteriorAccessoryKind(value: unknown): value is CellInteriorAccessoryKind {
  return value === "mobileTray" || value === "shelf" || value === "displayTray" || value === "glassShelf";
}

function normalizeInteriorMountHeight(value: unknown, cellHeight: number): number {
  const fallback = Math.round(cellHeight / 2);
  const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(clamp(raw, 0, Math.max(0, cellHeight)));
}

function normalizeInteriorAccessory(
  value: Partial<CellInteriorAccessory> | null | undefined,
  index: number,
  cellHeight: number
): CellInteriorAccessory | null {
  if (!isInteriorAccessoryKind(value?.kind)) return null;
  const id = typeof value?.id === "string" && value.id.trim() ? value.id : createInteriorAccessoryId(value.kind, index + 1);
  return {
    id,
    kind: value.kind,
    mountHeightMm: normalizeInteriorMountHeight(value.mountHeightMm, cellHeight),
    pull: value.kind === "mobileTray" ? normalizeDrawerPull(value.pull) : undefined,
    color: normalizeColorValue(value.color)
  };
}

function createInteriorAccessoryId(kind: CellInteriorAccessoryKind, serial: number): string {
  return `${kind}-${serial}`;
}

function nextInteriorAccessoryId(cell: CellConfig, kind: CellInteriorAccessoryKind): string {
  const used = new Set((cell.interiorAccessories ?? []).map((item) => item.id));
  let serial = 1;
  while (used.has(createInteriorAccessoryId(kind, serial))) serial += 1;
  return createInteriorAccessoryId(kind, serial);
}

function normalizeGlassDoorHandleSide(value: unknown): GlassDoorHandleSide {
  return value === "left" ? "left" : "right";
}

function normalizeAccessoryMountSide(value: unknown): AccessoryMountSide {
  return value === "back" || value === "left" || value === "right" ? value : "front";
}

export function getAccessoryMountSide(cell: CellConfig | null | undefined): AccessoryMountSide {
  return normalizeAccessoryMountSide(cell?.accessoryMountSide);
}

function rotateAccessoryMountSide(side: AccessoryMountSide): AccessoryMountSide {
  if (side === "front") return "back";
  if (side === "back") return "front";
  if (side === "left") return "right";
  return "left";
}

function toLocalAccessoryMountSide(side: AccessoryMountSide, faceSide: CellFaceSide | undefined): AccessoryMountSide {
  return faceSide === "back" ? rotateAccessoryMountSide(normalizeAccessoryMountSide(side)) : normalizeAccessoryMountSide(side);
}

export function getPhysicalAccessoryMountSide(cell: CellConfig | null | undefined): AccessoryMountSide {
  const localSide = getAccessoryMountSide(cell);
  return cell?.faceSide === "back" ? rotateAccessoryMountSide(localSide) : localSide;
}

export function accessoryMountSideLabel(side: AccessoryMountSide): string {
  return ACCESSORY_MOUNT_SIDE_OPTIONS.find((option) => option.id === side)?.label ?? "前";
}

function glassDoorHandleSideLabel(value: unknown): string {
  return normalizeGlassDoorHandleSide(value) === "left" ? "左把手" : "右把手";
}

function normalizeCellFitting(value: unknown, kind: CellKind): CellFittingKind {
  if (value === "mobileTray" && supportsMobileTrayFitting(kind)) return "mobileTray";
  if (value === "rimmedDrawer" && fittingCompatible(kind)) return "rimmedDrawer";
  if (value === "rimlessDrawer" && fittingCompatible(kind)) return "rimlessDrawer";
  return "none";
}

function normalizeCellFaceSide(value: unknown): CellFaceSide | undefined {
  return value === "back" || value === "front" ? value : undefined;
}

function normalizeCellDepth(value: unknown, defaultDepth: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const depth = sanitizeSize(value, defaultDepth);
  return depth === defaultDepth ? undefined : depth;
}

function normalizeCellConfig(cell: Partial<CellConfig> | null | undefined, defaultDepth: number, cellHeight = 350): CellConfig {
  const rawKind = (cell as { kind?: unknown } | null | undefined)?.kind;
  const rawFrontAccessory = (cell as { frontAccessory?: unknown } | null | undefined)?.frontAccessory;
  const legacyPerforatedPanel = rawKind === "perforatedPanel" || rawFrontAccessory === "perforatedPanel";
  const normalizedKind = legacyPerforatedPanel ? "metalBackModule" : normalizeCellKind(cell?.kind);
  const legacyDrawer = normalizedKind === "boxDrawer";
  const legacyMobileTray = normalizedKind === "pullOutShelf";
  const legacyInteriorKind = getLegacyInteriorAccessoryKind(normalizedKind);
  const rawStructure = normalizeCellStructure(cell?.structure);
  const legacyPanelSide = normalizeAccessoryMountSide(cell?.accessoryMountSide);
  const migratedStructure: CellStructureOverrides | undefined = legacyPerforatedPanel
    ? {
      ...rawStructure,
      panels: {
        ...rawStructure?.panels,
        [legacyPanelSide]: "perforated"
      }
    }
    : rawStructure;
  let baseKind: CellKind = normalizedKind;
  if (legacyDrawer || legacyMobileTray || legacyInteriorKind || isDoorCellKind(normalizedKind) || normalizedKind === "perforatedPanel") {
    baseKind = "metalBackModule";
  } else if (normalizedKind === "glassDropDoor") {
    baseKind = "open";
  }
  const requestedFitting = legacyDrawer
    ? "rimmedDrawer"
    : legacyMobileTray
      ? "mobileTray"
      : normalizeCellFitting(cell?.fitting, baseKind);
  const baseCell: CellConfig = {
    kind: baseKind,
    enabled: cell?.enabled !== false,
    structure: migratedStructure
  };
  const fitting = requestedFitting === "mobileTray" && hasGlassMobileTrayMount(baseCell, legacyMobileTray ? "pullOutShelf" : baseKind)
    ? "none"
    : requestedFitting;
  const frontAccessory = isDrawerFitting(fitting)
    ? "none"
    : normalizeCellFrontAccessory(cell?.frontAccessory, normalizedKind);
  const rawInterior = Array.isArray(cell?.interiorAccessories)
    ? cell.interiorAccessories
      .map((item, index) => normalizeInteriorAccessory(item, index, cellHeight))
      .filter((item): item is CellInteriorAccessory => !!item)
    : [];
  const legacyInteriorAccessories: CellInteriorAccessory[] = [];
  const inheritedInteriorKind = legacyMobileTray ? "mobileTray" : legacyInteriorKind;
  if (inheritedInteriorKind && !isDrawerFitting(fitting)) {
    legacyInteriorAccessories.push({
      id: createInteriorAccessoryId(inheritedInteriorKind, rawInterior.length + 1),
      kind: inheritedInteriorKind,
      mountHeightMm: normalizeInteriorMountHeight(undefined, cellHeight),
      pull: inheritedInteriorKind === "mobileTray" ? normalizeDrawerPull(cell?.drawerPull) : undefined
    });
  }
  const fittingInterior = fitting === "mobileTray" && !legacyInteriorAccessories.length
    ? [{
      id: createInteriorAccessoryId("mobileTray", rawInterior.length + 1),
      kind: "mobileTray" as const,
      mountHeightMm: normalizeInteriorMountHeight(undefined, cellHeight),
      pull: normalizeDrawerPull(cell?.drawerPull)
    }]
    : [];
  const requestedInteriorAccessories = isDrawerFitting(fitting)
    ? []
    : [...rawInterior, ...legacyInteriorAccessories, ...fittingInterior]
      .filter((item) => isInteriorAccessoryCompatibleWithCell(item.kind, baseCell, baseKind));
  const kind = requestedInteriorAccessories.some((item) => item.kind === "mobileTray" || item.kind === "shelf" || item.kind === "displayTray")
    ? ensureMetalInteriorShellKind(baseKind)
    : baseKind;
  const interiorAccessories = requestedInteriorAccessories.map((item, index) => ({
    ...item,
    id: item.id || createInteriorAccessoryId(item.kind, index + 1),
    mountHeightMm: normalizeInteriorMountHeight(item.mountHeightMm, cellHeight)
  }));
  const hasFront = hasFrontAccessory(frontAccessory);
  const hasOpenableFront = isOpenableFrontAccessory(frontAccessory);
  const rawFaceSide = normalizeCellFaceSide(cell?.faceSide);
  const rawMountSide = normalizeAccessoryMountSide(cell?.accessoryMountSide);
  const legacyBackMountedDropDoor = frontAccessory === "dropDoor" && rawFaceSide !== "back" && rawMountSide === "back";
  const faceSide = frontAccessory === "dropDoor"
    ? legacyBackMountedDropDoor ? "back" : rawFaceSide ?? "front"
    : frontAccessory === "flipUpDoor" || frontAccessory === "glassDropDoor"
      ? "front"
      : kind === "metalBackModule" || isDrawerFitting(fitting)
        ? rawFaceSide
        : undefined;
  const accessoryMountSide = hasFront || fitting === "rimlessDrawer"
    ? legacyBackMountedDropDoor
      ? "front"
      : frontAccessory === "flipUpDoor" || frontAccessory === "glassDropDoor"
        ? "front"
        : rawMountSide
    : undefined;
  const structure = interiorAccessories.some((item) => item.kind === "mobileTray")
    ? applyRequiredMobileTrayPanels(baseCell, kind, legacyMobileTray ? "pullOutShelf" : baseKind)
    : migratedStructure;
  const normalizedAccessoryColors = normalizeAccessoryColors(cell?.accessoryColors);
  if (legacyPerforatedPanel && normalizedAccessoryColors) delete normalizedAccessoryColors.front;
  const accessoryColors = normalizedAccessoryColors && Object.keys(normalizedAccessoryColors).length ? normalizedAccessoryColors : undefined;
  const normalizedPanelColors = normalizePanelColors(cell?.panelColors) ?? {};
  const legacyPanelColor = legacyPerforatedPanel ? normalizeColorValue(cell?.accessoryColors?.front) : undefined;
  if (legacyPanelColor) normalizedPanelColors[legacyPanelSide] = legacyPanelColor;
  const panelColors = Object.keys(normalizedPanelColors).length ? normalizedPanelColors : undefined;
  return {
    kind,
    enabled: cell?.enabled !== false,
    depth: normalizeCellDepth(cell?.depth, defaultDepth),
    color: normalizeColorValue(cell?.color),
    panelColors,
    accessoryColors,
    doorOpen: hasOpenableFront ? normalizeDoorOpen(cell?.doorOpen, cell?.doorState) : undefined,
    doorState: hasOpenableFront ? normalizeDoorOpenState(cell?.doorState) : undefined,
    frontAccessory: hasFront ? frontAccessory : undefined,
    accessoryMountSide,
    faceSide,
    glassDoorHandleSide: frontAccessory === "glassDropDoor" ? normalizeGlassDoorHandleSide(cell?.glassDoorHandleSide) : undefined,
    interiorAccessories: interiorAccessories.length ? interiorAccessories : undefined,
    fitting: isDrawerFitting(fitting) ? fitting : "none",
    drawerPull: fitting === "rimlessDrawer"
      ? normalizeDrawerPull(cell?.drawerPull ?? 0)
      : fitting === "rimmedDrawer"
        ? normalizeDrawerPull(legacyDrawer ? undefined : cell?.drawerPull)
        : undefined,
    structure
  };
}

function normalizeDrawerPull(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

function normalizeWorkSurfaces(
  values: WorkSurfaceConfig[] | undefined,
  rows: number,
  columns: number,
  defaultDepth: number
): WorkSurfaceConfig[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_WORK_SURFACE_COUNT).map((raw, index) => {
    const fromColumn = clamp(toInteger(raw?.fromColumn, 0), 0, columns - 1);
    const toColumn = clamp(toInteger(raw?.toColumn, fromColumn), 0, columns - 1);
    const left = Math.min(fromColumn, toColumn);
    const right = Math.max(fromColumn, toColumn);
    const color = normalizeColorValue(raw?.color);

    return {
      id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : `surface-${index + 1}`,
      kind: raw?.kind === "bridgeTop" ? "bridgeTop" : "deskTop",
      fromColumn: left,
      toColumn: right,
      row: clamp(toInteger(raw?.row, rows - 1), 0, rows - 1),
      depth: sanitizeSize(raw?.depth, defaultDepth),
      thickness: sanitizeSurfaceThickness(raw?.thickness, DEFAULT_WORK_SURFACE_THICKNESS),
      overhangFront: sanitizeOverhang(raw?.overhangFront),
      overhangBack: sanitizeOverhang(raw?.overhangBack),
      overhangLeft: sanitizeOverhang(raw?.overhangLeft),
      overhangRight: sanitizeOverhang(raw?.overhangRight),
      color,
      enabled: raw?.enabled !== false
    };
  });
}

function getEvaluationContext(config: CabinetConfig, selection: Selection | null) {
  if (!selection) return null;
  const depthIndex = getSelectionDepthIndex(config, selection);
  const cell = getCellConfig(config, selection);
  if (!cell) return null;
  return {
    cell,
    row: selection.row,
    column: selection.column,
    depthIndex,
    width: config.columnWidths[selection.column] ?? DEFAULT_CONFIG.columnWidths[0],
    height: config.rowHeights[selection.row] ?? DEFAULT_CONFIG.rowHeights[0],
    depth: getCellDepth(config, selection.row, selection.column, depthIndex)
  };
}

function emptyEvaluation(reason: string): AccessoryEvaluation {
  return {
    status: "blocked",
    label: "未选中",
    reasons: [reason],
    warnings: [],
    bomSize: { width: 0, height: 0, depth: 0 }
  };
}

function createEvaluationBase(label: string, width: number, height: number, depth: number): AccessoryEvaluation {
  return {
    status: "officialLogicCustomSize",
    label,
    reasons: [],
    warnings: [],
    bomSize: { width, height, depth }
  };
}

function block(base: AccessoryEvaluation, reason: string): AccessoryEvaluation {
  return {
    ...base,
    status: "blocked",
    reasons: [reason],
    warnings: []
  };
}

function mergePathCheck(evaluation: AccessoryEvaluation, check: WorkSurfacePathCheck): AccessoryEvaluation {
  if (!check.reasons.length && !check.warnings.length) return evaluation;
  const status = strongestStatus(evaluation.status, check.status);
  return {
    ...evaluation,
    status,
    reasons: [...evaluation.reasons, ...check.reasons],
    warnings: [...evaluation.warnings, ...check.warnings]
  };
}

function strongestStatus(current: AccessoryStatus, next?: "needsHardwareCheck" | "blocked"): AccessoryStatus {
  if (current === "blocked" || next === "blocked") return "blocked";
  if (current === "needsHardwareCheck" || next === "needsHardwareCheck") return "needsHardwareCheck";
  return current;
}

function withStandardSizeStatus(base: AccessoryEvaluation, width: number, height: number, depth: number): AccessoryEvaluation {
  if (isStandardSize(width, height, depth)) {
    return {
      ...base,
      status: "officialExact",
      reasons: ["命中官方公开尺寸体系或本地标准模数。"]
    };
  }

  return {
    ...base,
    status: "officialLogicCustomSize",
    reasons: ["尺寸按工厂自定义 BOM 输出，配件逻辑继续按官方方式校验。"]
  };
}

function evaluateDropDoor(base: AccessoryEvaluation, width: number, height: number, depth: number): AccessoryEvaluation {
  const officialSpec = DROP_DOOR_OFFICIAL_SPECS.find((item) => item.width === width && item.height === height)?.spec;
  const warnings: string[] = [];

  if (!DROP_DOOR_OFFICIAL_DEPTHS.includes(depth)) {
    return {
      ...base,
      status: "needsHardwareCheck",
      reasons: ["下翻门逻辑成立，但当前深度不是官方公开下翻门深度。"],
      warnings: ["需要确认铰链、限位链、门板重量和开合半径。"]
    };
  }

  if (officialSpec) {
    return {
      ...base,
      status: "officialExact",
      reasons: ["命中官方公开 metal drop-down door 尺寸。"],
      warnings,
      officialSpec
    };
  }

  if (!OFFICIAL_STANDARD_WIDTHS.includes(width) || !OFFICIAL_STANDARD_HEIGHTS.includes(height)) {
    warnings.push("自定义宽高按工厂门板尺寸输出，不作为官方 SKU。");
  }

  if (height >= 500 || width > 750) {
    return {
      ...base,
      status: "needsHardwareCheck",
      reasons: ["自定义下翻门需要五金确认。"],
      warnings: [...warnings, "门板偏大时必须确认铰链、限位和承重。"]
    };
  }

  return {
    ...base,
    status: "officialLogicCustomSize",
    reasons: ["下翻门搭配逻辑成立，尺寸按工厂自定义输出。"],
    warnings
  };
}

function evaluatePullOutShelf(base: AccessoryEvaluation, width: number, height: number, depth: number): AccessoryEvaluation {
  const officialSpec = EXTENSION_SHELF_OFFICIAL_SPECS.find((item) => item.width === width && item.depth === depth)?.spec;

  if (height < MIN_PULL_OUT_CLEARANCE_MM) {
    return {
      ...base,
      status: "blocked",
      reasons: ["移动托盘需要可抽拉和取物空间，当前模块高度不足，只能改固定托盘或开放格。"]
    };
  }

  if (officialSpec) {
    const warnings = height < TIGHT_PULL_OUT_CLEARANCE_MM ? ["当前高度取物空间偏低，建议确认拉出后手部空间。"] : [];
    return {
      ...base,
      status: "officialExact",
      reasons: ["命中官方公开 metal extension shelf 尺寸，需保留导轨逻辑。"],
      warnings,
      officialSpec
    };
  }

  if (!EXTENSION_OFFICIAL_DEPTHS.includes(depth)) {
    return {
      ...base,
      status: "needsHardwareCheck",
      reasons: ["移动托盘需要左右导轨安装基础。"],
      warnings: ["当前深度不是官方 extension shelf 常用深度，需要确认导轨长度、承重和防倾。"]
    };
  }

  if (height < 175) {
    return {
      ...base,
      status: "needsHardwareCheck",
      reasons: ["移动托盘可做工厂定制，但当前高度取物空间低。"],
      warnings: ["建议改固定托盘或确认抽拉手部空间。"]
    };
  }

  return {
    ...base,
    status: "needsHardwareCheck",
    reasons: ["移动托盘逻辑成立，但自定义宽深需要导轨确认。"],
    warnings: ["导轨长度、承重和防倾需要工厂确认。"]
  };
}

function evaluateWorkSurfacePath(
  config: CabinetConfig,
  context: EvaluationContext,
  kind: MovingAccessoryKind,
  mountSide: AccessoryMountSide = "front"
): WorkSurfacePathCheck {
  const surfaces = getRelevantWorkSurfaces(config, context);
  if (!surfaces.length) return { reasons: [], warnings: [] };

  const messages = surfaces.map((surface) => {
    const size = getWorkSurfaceBomSize(config, surface);
    return `${surface.kind === "deskTop" ? "桌面" : "桥接台面"} ${size.width} x ${size.depth} x ${size.thickness} mm`;
  });
  const warnings: string[] = [];
  const reasons: string[] = [];
  const hasImmediateTopSurface = surfaces.some((surface) => surface.row === context.row);
  const hasLargeOverhang = surfaces.some((surface) => getWorkSurfaceMountSideOverhang(surface, context, mountSide) >= WIDE_WORK_SURFACE_OVERHANG_MM);
  const mountDirection = `${accessoryMountSideLabel(mountSide)}向`;

  if (kind === "flipUpDoor" && hasImmediateTopSurface) {
    return {
      status: "blocked",
      reasons: [`当前格上沿有跨格台面（${messages.join("、")}），上翻门打开会撞到台面。`],
      warnings: []
    };
  }

  if (kind === "pullOutShelf") {
    if (context.height < TIGHT_PULL_OUT_CLEARANCE_MM && hasImmediateTopSurface) {
      return {
        status: "blocked",
        reasons: [`当前格高度低且上方有跨格台面（${messages.join("、")}），移动托盘装入后取物和抽拉空间不足，建议改固定托盘。`],
        warnings: []
      };
    }
    if (hasImmediateTopSurface || hasLargeOverhang) {
      reasons.push("移动托盘需要完整抽拉路径，跨格台面会影响手部空间和防倾判断。");
      warnings.push(`需确认台面出沿、导轨行程和承重：${messages.join("、")}。`);
    }
  }

  if (kind === "rimlessDrawer") {
    if (hasImmediateTopSurface || hasLargeOverhang) {
      reasons.push(`一字拉手需要完整${mountDirection}抽拉路径，需确认台面下沿与前板、导轨行程互不干涉。`);
      warnings.push(`需确认抽屉门抽拉余量：${messages.join("、")}。`);
    }
  }

  if (kind === "rimmedDrawer") {
    if (hasImmediateTopSurface && context.height < RIMMED_DRAWER_RIM_HEIGHT_MM + 80) {
      reasons.push("当前格上方有跨格台面，带围边抽屉的抽拉余量偏紧。");
      warnings.push(`需确认围边高度、导轨位置和台面下沿间隙：${messages.join("、")}。`);
    }
    if (hasLargeOverhang) {
      reasons.push(`带围边抽屉需要抽拉路径，台面${mountDirection}出沿偏大时要确认把手、锁位和抽拉行程。`);
      warnings.push(`需确认台面与抽屉前脸互不干涉：${messages.join("、")}。`);
    }
  }

  if (kind === "dropDoor") {
    if (hasLargeOverhang) {
      reasons.push(`下翻门可与书桌台面共存，但台面${mountDirection}出沿偏大时要确认门板全开角度和限位链。`);
      warnings.push(`需确认跨格台面下方的下翻门开启半径：${messages.join("、")}。`);
    } else if (hasImmediateTopSurface) {
      warnings.push(`当前格上方有跨格台面，按跨格台面方案可做，但需保留限位链和门板开启间隙：${messages.join("、")}。`);
    }
  }

  if (kind === "glassDoor" && hasLargeOverhang) {
    reasons.push(`玻璃门${mountDirection}有台面出沿时，需要确认把手和门板开启角度。`);
    warnings.push(`需确认前脸开合路径：${messages.join("、")}。`);
  }

  return {
    status: reasons.length ? "needsHardwareCheck" : undefined,
    reasons,
    warnings
  };
}

function getWorkSurfaceMountSideOverhang(
  surface: WorkSurfaceConfig,
  context: EvaluationContext,
  mountSide: AccessoryMountSide
): number {
  if (mountSide === "front") return surface.overhangFront;
  if (mountSide === "back") return surface.overhangBack;
  if (mountSide === "left") return context.column === surface.fromColumn ? surface.overhangLeft : 0;
  return context.column === surface.toColumn ? surface.overhangRight : 0;
}

function getRelevantWorkSurfaces(config: CabinetConfig, context: EvaluationContext): WorkSurfaceConfig[] {
  return config.workSurfaces.filter((surface) => (
    surface.enabled
    && context.column >= surface.fromColumn
    && context.column <= surface.toColumn
    && surface.row >= context.row
    && surface.row <= context.row + 1
  ));
}

function evaluateFixedShelfLike(base: AccessoryEvaluation, width: number, height: number, depth: number, kind: CellKind, cell: CellConfig): AccessoryEvaluation {
  const officialSpec = FIXED_SHELF_OFFICIAL_SPECS.find((item) => item.width === width && item.depth === depth)?.spec;
  const label = kind === "displayTray" ? "固定托盘" : kind === "glassShelf" ? "玻璃搁板" : "固定层板";
  const sidePanels = getSidePanelMaterials(cell);

  if (kind === "shelf" || kind === "displayTray") {
    if (!isSheetMetalPanelMaterial(sidePanels.left) || !isSheetMetalPanelMaterial(sidePanels.right)) {
      const hasGlassSide = sidePanels.left === "glass" || sidePanels.right === "glass";
      return block(
        { ...base, label },
        hasGlassSide
          ? "玻璃侧板不能直接承载普通固定层板/固定托盘，请改玻璃搁板或换金属侧板。"
          : "普通固定层板/固定托盘需要左右金属侧板支撑，请先补齐左右金属侧板。"
      );
    }
  }

  if (kind === "glassShelf" && (sidePanels.left === "none" || sidePanels.right === "none")) {
    return block(
      { ...base, label },
      "玻璃搁板需要左右侧板作为支撑，可补玻璃侧板或金属侧板后再安装。"
    );
  }

  if (officialSpec) {
    const evaluated: AccessoryEvaluation = {
      ...base,
      label,
      status: "officialExact",
      reasons: [`${label} 命中官方公开层板/托盘尺寸逻辑。`],
      officialSpec
    };
    if (kind !== "glassShelf") return evaluated;
    return {
      ...evaluated,
      status: "needsHardwareCheck",
      reasons: ["玻璃搁板可装在玻璃侧板或金属侧板之间，生产需确认夹件、支撑和承重。"],
      warnings: ["玻璃搁板不能只按一块玻璃生产，需要确认玻璃夹、支撑点和承重。"]
    };
  }

  const evaluated: AccessoryEvaluation = {
    ...base,
    label,
    status: "officialLogicCustomSize",
    reasons: [`${label} 不需要抽拉导轨，可按工厂自定义尺寸输出 BOM。`],
    warnings: height < 100 ? ["当前高度很低，需要确认实际使用空间。"] : []
  };
  if (kind !== "glassShelf") return evaluated;
  return {
    ...evaluated,
    status: "needsHardwareCheck",
    reasons: ["玻璃搁板可装在玻璃侧板或金属侧板之间，生产需确认夹件、支撑和承重。"],
    warnings: [...(evaluated.warnings ?? []), "玻璃搁板不能只按一块玻璃生产，需要确认玻璃夹、支撑点和承重。"]
  };
}

function isStandardSize(width: number, height: number, depth: number): boolean {
  return OFFICIAL_STANDARD_WIDTHS.includes(width) && OFFICIAL_STANDARD_HEIGHTS.includes(height) && OFFICIAL_STANDARD_DEPTHS.includes(depth);
}

function pushCurrentCellKindIssue(
  issues: ProductionIssue[],
  config: CabinetConfig,
  selection: Selection,
  kind: CellKind,
  scope: string
) {
  const cellId = `cell.${selection.row}.${selection.depthIndex ?? 0}.${selection.column}`;
  if (kind === "open") {
    issues.push({
      id: `${cellId}.open`,
      severity: "info",
      scope,
      title: "开放格按纯框架生产",
      message: "当前格没有门板、导轨件或钣金面板，默认只保留框架、球节点和底部支撑。",
      suggestion: "如需底板、背板、侧板或隐藏前脸，请明确切换结构元素。"
    });
    return;
  }

  const evaluation = evaluateCellKind(config, selection, kind);
  pushEvaluationIssue(issues, `${cellId}.${kind}`, scope, evaluation, `${evaluation.label}生产校验`);

  if (kind === "glassPanelModule") {
    issues.push({
      id: `${cellId}.glassShell`,
      severity: "check",
      scope,
      title: "玻璃箱体只按展示格生产",
      message: "玻璃侧板/玻璃箱体不是金属安装面，后续不能直接叠加普通下翻门、移动托盘或固定托盘。",
      suggestion: "若要装门或托盘，先切回金属箱体；若要内部层板，优先用玻璃搁板并确认夹件。"
    });
  }

  if (kind === "glassShelf") {
    issues.push({
      id: `${cellId}.glassShelfHardware`,
      severity: "check",
      scope,
      title: "玻璃搁板需要夹件确认",
      message: "玻璃搁板不能只按一块玻璃生产，还需要确认夹件、支撑和承重。",
      suggestion: "生产前确认玻璃厚度、玻璃夹数量和金属支撑位置。"
    });
  }

  if (kind === "pullOutShelf") {
    issues.push({
      id: `${cellId}.pullOutRail`,
      severity: "check",
      scope,
      title: "移动托盘需要导轨和防倾确认",
      message: "移动托盘是导轨件，生产中要确认左右安装面、导轨长度、承重和拉出行程。",
      suggestion: "保留完整金属箱体安装面；深度或宽度定制时单独确认导轨型号。"
    });
  }

  if (kind === "dropDoor") {
    issues.push({
      id: `${cellId}.dropDoorHardware`,
      severity: "check",
      scope,
      title: "下翻门需要铰链和限位确认",
      message: "下翻门生产时需要门板、2 只下翻门铰链、锁盒和限位/开合半径确认。",
      suggestion: "确认门板重量、铰链承重、限位链和相邻结构不会挡住全开角度。"
    });
  }
}

function pushEvaluationIssue(
  issues: ProductionIssue[],
  id: string,
  scope: string,
  evaluation: AccessoryEvaluation,
  title: string
) {
  if (evaluation.status === "officialExact") return;
  const severity: ProductionIssueSeverity = evaluation.status === "blocked" ? "blocked" : "check";
  issues.push({
    id,
    severity,
    scope,
    title,
    message: [...evaluation.reasons, ...evaluation.warnings].filter(Boolean).join(" ") || ACCESSORY_STATUS_META[evaluation.status].description,
    suggestion: evaluation.status === "blocked"
      ? "调整该格结构或配件，避免前脸、导轨、玻璃支撑或开合路径冲突。"
      : "可以继续做工厂定制，但需要在生产前确认五金、承重、夹件或尺寸。"
  });
}

function kindLabel(kind: CellKind): string {
  if (kind === "open") return "开放格";
  return getAccessory(kind as AccessoryModelKind).name;
}

function frontAccessoryLabel(frontAccessory: CellFrontAccessoryKind): string {
  if (frontAccessory === "dropDoor") return "下翻门";
  if (frontAccessory === "flipUpDoor") return "上翻门";
  if (frontAccessory === "glassDropDoor") return "玻璃门";
  return "无门类前脸";
}

function interiorAccessoryLabel(kind: CellInteriorAccessoryKind): string {
  if (kind === "mobileTray") return "移动托盘";
  if (kind === "displayTray") return "固定托盘";
  if (kind === "glassShelf") return "玻璃搁板";
  return "固定层板";
}

function fittingLabel(fitting: CellFittingKind): string {
  if (fitting === "mobileTray") return "移动托盘";
  if (fitting === "rimmedDrawer") return "带围边抽屉";
  if (fitting === "rimlessDrawer") return "一字拉手";
  return "无内部配件";
}

function clearFrontKind(kind: CellKind): CellKind {
  return kind === "dropDoor" || kind === "flipUpDoor" || kind === "glassDropDoor" || kind === "pullOutShelf" ? "open" : kind;
}

function hasFrontAccessory(value: CellFrontAccessoryKind | undefined): value is Exclude<CellFrontAccessoryKind, "none"> {
  return value === "dropDoor" || value === "flipUpDoor" || value === "glassDropDoor";
}

function isOpenableFrontAccessory(value: CellFrontAccessoryKind | undefined): value is "dropDoor" | "flipUpDoor" | "glassDropDoor" {
  return value === "dropDoor" || value === "flipUpDoor" || value === "glassDropDoor";
}

function getLegacyInteriorAccessoryKind(kind: CellKind): CellInteriorAccessoryKind | null {
  if (kind === "shelf" || kind === "displayTray" || kind === "glassShelf") return kind;
  return null;
}

function isFrontAccessoryCompatibleWithShell(frontAccessory: CellFrontAccessoryKind | undefined, shellKind: CellKind): boolean {
  if (!hasFrontAccessory(frontAccessory)) return true;
  if (shellKind === "glassPanelModule") return frontAccessory === "glassDropDoor";
  return true;
}

function isInteriorAccessoryCompatibleWithShell(kind: CellInteriorAccessoryKind, shellKind: CellKind): boolean {
  if (shellKind === "glassPanelModule") return kind === "glassShelf";
  return true;
}

function isInteriorAccessoryCompatibleWithCell(
  kind: CellInteriorAccessoryKind,
  cell: Pick<CellConfig, "kind" | "structure">,
  shellKind: CellKind = cell.kind
): boolean {
  if (isInteriorAccessoryCompatibleWithShell(kind, shellKind)) return true;
  if (kind !== "shelf" && kind !== "displayTray") return false;
  const sidePanels = getSidePanelMaterials(cell, shellKind);
  return isSheetMetalPanelMaterial(sidePanels.left) && isSheetMetalPanelMaterial(sidePanels.right);
}

function ensureMetalInteriorShellKind(kind: CellKind): CellKind {
  if (
    kind === "open"
    || kind === "dropDoor"
    || kind === "flipUpDoor"
    || kind === "glassDropDoor"
    || kind === "pullOutShelf"
    || kind === "shelf"
    || kind === "displayTray"
    || kind === "glassShelf"
    || kind === "boxDrawer"
  ) {
    return "metalBackModule";
  }
  return kind;
}

function updateInteriorAccessoryInCell(
  cell: CellConfig,
  id: string,
  patch: Partial<Pick<CellInteriorAccessory, "kind" | "mountHeightMm" | "pull">>,
  cellHeight = 350
): CellConfig | null {
  const source = cell.interiorAccessories ?? [];
  let found = false;
  const interiorAccessories = source.map((item, index) => {
    if (item.id !== id) return item;
    found = true;
    const kind = isInteriorAccessoryKind(patch.kind) ? patch.kind : item.kind;
    if (!isInteriorAccessoryCompatibleWithCell(kind, cell) || (kind === "mobileTray" && hasGlassMobileTrayMount(cell))) return item;
    return {
      id: item.id || createInteriorAccessoryId(kind, index + 1),
      kind,
      mountHeightMm: normalizeInteriorMountHeight(patch.mountHeightMm ?? item.mountHeightMm, cellHeight),
      pull: kind === "mobileTray" ? normalizeDrawerPull(patch.pull ?? item.pull) : undefined
    };
  });
  if (!found) return null;
  const nextKind = interiorAccessories.some((item) => item.kind === "mobileTray" || item.kind === "shelf" || item.kind === "displayTray")
    ? ensureMetalInteriorShellKind(cell.kind)
    : cell.kind;
  const baseCell = { ...cell, kind: nextKind };
  const structure = interiorAccessories.some((item) => item.kind === "mobileTray")
    ? applyRequiredMobileTrayPanels(baseCell, nextKind, cell.kind)
    : cell.structure;
  return {
    ...cell,
    kind: nextKind,
    interiorAccessories,
    structure
  };
}

function getSidePanelMaterials(cell: Pick<CellConfig, "kind" | "structure">, kind: CellKind = cell.kind): { left: StructurePanelMaterial; right: StructurePanelMaterial } {
  return {
    left: getEffectiveStructurePanelMaterial(cell as CellConfig, kind, "left"),
    right: getEffectiveStructurePanelMaterial(cell as CellConfig, kind, "right")
  };
}

function isSheetMetalPanelMaterial(material: StructurePanelMaterial): boolean {
  return material === "metal" || material === "perforated";
}

function hasGlassMobileTrayMount(cell: Pick<CellConfig, "kind" | "structure">, legacyKind: CellKind = cell.kind): boolean {
  if (legacyKind === "glassPanelModule" || cell.kind === "glassPanelModule") return true;
  const { left, right } = getSidePanelMaterials(cell, legacyKind);
  const bottom = getEffectiveStructurePanelMaterial(cell as CellConfig, legacyKind, "bottom");
  return left === "glass" || right === "glass" || bottom === "glass";
}

function applyRequiredMobileTrayPanels(cell: Pick<CellConfig, "structure">, kind: CellKind, legacyKind: CellKind = kind): CellStructureOverrides | undefined {
  const panels: Partial<Record<StructurePanelKey, StructurePanelMaterial>> = {
    ...cell.structure?.panels
  };

  if (legacyKind !== kind) {
    (["back", "left", "right", "top", "bottom"] as StructurePanelKey[]).forEach((panel) => {
      panels[panel] = getEffectiveStructurePanelMaterial(cell as CellConfig, legacyKind, panel);
    });
  }

  panels.left = "metal";
  panels.right = "metal";
  panels.bottom = "metal";

  return normalizeCellStructure({
    ...cell.structure,
    panels
  });
}

function isGlassShellBlockedKind(currentKind: CellKind, nextKind: CellKind): boolean {
  return currentKind === "glassPanelModule" && GLASS_SHELL_BLOCKED_CELL_KINDS.has(nextKind);
}

function getGlassShellBlockReason(currentKind: CellKind, nextKind: CellKind): string | null {
  if (!isGlassShellBlockedKind(currentKind, nextKind)) return null;
  if (nextKind === "dropDoor" || nextKind === "flipUpDoor") {
    return "当前格是玻璃侧板/玻璃箱体，不是金属门板安装面，不能直接安装普通门类；请先切换为金属箱体或改玻璃门。";
  }
  if (nextKind === "pullOutShelf") {
    return "当前格是玻璃侧板/玻璃箱体，不能承载移动托盘导轨；只能改金属箱体、玻璃搁板或重新拆分结构。";
  }
  if (nextKind === "displayTray" || nextKind === "shelf") {
    return "当前格是玻璃侧板/玻璃箱体，不能直接安装普通固定托盘/金属搁板；可改玻璃搁板并确认夹件，或切换为金属箱体。";
  }
  return "当前格是玻璃侧板/玻璃箱体，不能直接安装该金属配件；请先切换 shell 或重新拆分结构。";
}

function getInteriorAccessoryShellBlockReason(kind: CellInteriorAccessoryKind): string {
  if (kind === "mobileTray") {
    return "当前格是玻璃侧板/玻璃箱体，不能承载移动托盘导轨；只能改金属箱体、玻璃搁板或重新拆分结构。";
  }
  if (kind === "shelf" || kind === "displayTray") {
    return "当前格是玻璃侧板/玻璃箱体，不能直接安装普通固定托盘/金属搁板；可改玻璃搁板并确认夹件，或切换为金属箱体。";
  }
  return "玻璃搁板需要左右侧板作为夹件/支撑安装面，请先补齐侧板。";
}

function needsBackPanel(kind: CellKind) {
  return !["open", "noBackModule", "glassPanelModule", "glassDropDoor", "sidePanel", "softPanelLow", "softPanelWide", "softPanelTall", "glassShelf"].includes(kind);
}

function hasOpenableDoor(cell: CellConfig): boolean {
  return isDoorCellKind(cell.kind) || isOpenableFrontAccessory(cell.frontAccessory);
}

function addFrontAccessoryBom(items: BomItem[], cell: CellConfig, width: number, height: number, depth: number, color: string) {
  if (!hasFrontAccessory(cell.frontAccessory)) return;
  const accessory = getAccessory(cell.frontAccessory);
  const mountSide = getPhysicalAccessoryMountSide(cell);
  const faceWidth = mountSide === "left" || mountSide === "right" ? depth : width;
  const faceDepth = mountSide === "left" || mountSide === "right" ? width : depth;
  const directionSpec = `${accessoryMountSideLabel(mountSide)}向`;
  const spec = cell.frontAccessory === "glassDropDoor"
    ? `${faceWidth} x ${height} x ${faceDepth} mm / ${directionSpec} / ${glassDoorHandleSideLabel(cell.glassDoorHandleSide)}`
    : `${faceWidth} x ${height} x ${faceDepth} mm / ${directionSpec}`;
  addItem(
    items,
    accessory.bomName,
    spec,
    1,
    accessory.unit,
    accessory.unitPrice,
    { color }
  );
}

function addCellFittingBom(items: BomItem[], cell: CellConfig, kind: CellKind, width: number, height: number, depth: number, color: string) {
  cell.interiorAccessories?.forEach((accessory) => {
    addInteriorAccessoryBom(items, accessory, cell, kind, width, depth, color);
  });

  if (cell.fitting === "rimmedDrawer" && fittingCompatible(kind)) {
    addItem(items, "门板", `${width} x ${height} mm`, 1, "件", 0, { color });
    addItem(items, "移动托盘", `${width} x ${depth} mm`, 1, "件", 0, { color });
    addItem(items, "围边", `${width} x ${depth} x ${RIMMED_DRAWER_RIM_HEIGHT_MM} mm`, 1, "件", 0, { color });
    addItem(items, "抽屉导轨", `${depth} mm`, 2, "条", 0);
  }
  if (cell.fitting === "rimlessDrawer" && fittingCompatible(kind)) {
    const mountSide = getPhysicalAccessoryMountSide(cell);
    const faceWidth = mountSide === "left" || mountSide === "right" ? depth : width;
    const drawerDepth = mountSide === "left" || mountSide === "right" ? width : depth;
    const directionSpec = `${accessoryMountSideLabel(mountSide)}向`;
    addItem(items, "一字拉手门板", `${faceWidth} x ${height} mm / ${directionSpec}`, 1, "件", 0, { color });
    addItem(items, "抽屉盒组件", `${faceWidth} x ${drawerDepth} mm / ${directionSpec}`, 1, "件", 0, { color });
    addItem(items, "抽屉导轨", `${drawerDepth} mm / ${directionSpec}`, 2, "条", 0);
  }
}

function addInteriorAccessoryBom(items: BomItem[], accessory: CellInteriorAccessory, cell: CellConfig, kind: CellKind, width: number, depth: number, color: string) {
  if (!isInteriorAccessoryCompatibleWithCell(accessory.kind, cell, kind)) return;

  if (accessory.kind === "mobileTray") {
    if (!supportsMobileTrayFitting(kind)) return;
    addItem(items, "移动托盘", `${width} x ${depth} mm / 安装高 ${accessory.mountHeightMm} mm`, 1, "件", 0, { color });
    addItem(items, "移动托盘导轨", `${depth} mm / 安装高 ${accessory.mountHeightMm} mm`, 2, "根", 120);
    return;
  }

  if (accessory.kind === "shelf") {
    addItem(items, "固定搁板", `${width} x ${depth} mm / 安装高 ${accessory.mountHeightMm} mm`, 1, "块", 0, { color });
    return;
  }

  if (accessory.kind === "displayTray") {
    addItem(items, "展示托盘", `${width} x ${depth} mm / 安装高 ${accessory.mountHeightMm} mm`, 1, "件", 0, { color });
    return;
  }

  addItem(items, "玻璃搁板", `${width} x ${depth} mm / 安装高 ${accessory.mountHeightMm} mm`, 1, "块", Math.round(260 + width * depth * 0.00048));
  addItem(items, "玻璃搁板夹件", `安装高 ${accessory.mountHeightMm} mm`, 4, "个", 0);
}

function addStructurePanelBom(items: BomItem[], cell: CellConfig, kind: CellKind, width: number, _height: number, depth: number) {
  const addHorizontal = (panel: "top" | "bottom", metalName: string, glassName: string) => {
    const material = getEffectiveStructurePanelMaterial(cell, kind, panel);
    if (material === "none") return;
    if (material === "glass") {
      addItem(items, glassName, `${width} x ${depth} mm`, 1, "块", Math.round(260 + width * depth * 0.00048));
      return;
    }
    addItem(items, metalName, `${width} x ${depth} mm`, 1, "块", Math.round(180 + width * depth * 0.00035));
  };
  const addVertical = (panel: "front" | "back" | "left" | "right", metalName: string, glassName: string, panelWidth: number) => {
    const material = getEffectiveStructurePanelMaterial(cell, kind, panel);
    if (material === "none") return;
    if (material === "glass") {
      addItem(items, glassName, `${panelWidth} x ${_height} mm`, 1, "块", Math.round(260 + panelWidth * _height * 0.00048));
      return;
    }
    addItem(items, metalName, `${panelWidth} x ${_height} mm`, 1, "块", Math.round(180 + panelWidth * _height * 0.00028));
  };

  addVertical("front", "前板", "玻璃前板", width);
  addVertical("back", "金属背板", "玻璃背板", width);
  addVertical("left", "左侧板", "左玻璃侧板", depth);
  addVertical("right", "右侧板", "右玻璃侧板", depth);
  addHorizontal("top", "顶板", "玻璃顶板");
  addHorizontal("bottom", "底板", "玻璃底板");
}

function shouldTrackBomColor(name: string, color?: string): boolean {
  if (!color) return false;
  if (COLOR_AWARE_BOM_NAMES.has(name)) return true;
  if (COLOR_AWARE_BOM_EXACT.has(name)) return true;
  return COLOR_AWARE_BOM_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function addItem(items: BomItem[], name: string, spec: string, qty: number, unit: string, unitPrice: number, options: BomItemOptions = {}) {
  if (qty <= 0) return;
  const baseSpec = options.baseSpec ?? spec;
  const identity = getBomMaterialIdentity(name, baseSpec);
  const color = shouldTrackBomColor(name, options.color) ? options.color : undefined;
  const finish = options.finish;
  const displaySpec = formatBomDisplaySpec(options.displaySpec ?? baseSpec, color);
  const existing = items.find((item) => (
    item.name === name
    && item.baseSpec === baseSpec
    && item.color === color
    && item.finish === finish
    && item.unitPrice === unitPrice
  ));
  if (existing) {
    existing.qty += qty;
    return;
  }
  items.push({ ...identity, name, spec: displaySpec, baseSpec, color, finish, qty, unit, unitPrice });
}

function getBomMaterialIdentity(name: string, baseSpec: string): Pick<BomItem, "materialKey" | "specKey" | "category"> {
  const materialKey = BOM_MATERIAL_KEYS[name] ?? `custom.${stableBomToken(name)}`;
  return {
    materialKey,
    specKey: normalizeBomSpecKey(baseSpec),
    category: getBomCategory(name, materialKey)
  };
}

const BOM_MATERIAL_KEYS: Record<string, string> = {
  "球节点": "brassBall",
  "黄铜球": "brassBall",
  "横向钢管": "tube304",
  "竖向钢管": "tube304",
  "深度钢管": "tube304",
  "钢管": "tube304",
  "横向电镀管": "tube304",
  "竖向电镀管": "tube304",
  "深度电镀管": "tube304",
  "金属扣板": "panel",
  "扣板": "panel",
  "金属背板": "panel",
  "顶板": "panel",
  "底板": "panel",
  "外板": "panel",
  "内板": "panel",
  "扣板（四排孔）": "panel.fourRowHole",
  "前板": "panel",
  "左侧板": "panel",
  "右侧板": "panel",
  "洞洞板": "panel.perforated",
  "门板": "doorPanel",
  "下翻门": "doorPanel",
  "一字拉手门板": "doorPanel.handle",
  "下翻门组件": "door.drop.composite",
  "上翻门组件": "door.flip.composite",
  "玻璃门组件": "door.glass.composite",
  "下翻门铰链": "dropDoorHinge",
  "一元锁": "coinLockBox",
  "锁盒+螺丝": "coinLockHardware",
  "下翻锁盒套装": "coinLockHardware",
  "锁头螺丝": "lockHeadScrew",
  "铰链螺丝": "hingeScrew",
  "抽屉盒组件": "drawer",
  "抽屉导轨": "drawerRail",
  "固定搁板": "shelfPanel",
  "展示托盘": "tray",
  "移动托盘": "tray",
  "移动托盘导轨": "trayRail",
  "玻璃板": "glass",
  "玻璃搁板": "glass",
  "玻璃前板": "glass",
  "玻璃背板": "glass",
  "左玻璃侧板": "glass",
  "右玻璃侧板": "glass",
  "玻璃顶板": "glass",
  "玻璃底板": "glass",
  "玻璃搁板夹件": "glassShelfClip",
  "玻璃夹角": "glassCorner",
  "脚垫": "glide",
  "调平脚垫": "glide",
  "脚轮": "caster",
  "围边": "drawerBorder",
  "月牙扣": "crescentClip",
  "L型垫片": "lPad",
  "L型金属件": "lBracket",
  "L型塑料": "lPlastic",
  "垫片": "washer",
  "大角码": "largeAngleBracket",
  "膨胀螺丝": "expansionSet"
};

function getBomCategory(name: string, materialKey: string): BomCategory {
  if (materialKey === "tube304" || materialKey === "brassBall") return "frame";
  if (materialKey === "panel" || materialKey === "panel.perforated" || materialKey === "panel.fourRowHole") return "panel";
  if (materialKey.startsWith("door") || materialKey === "dropDoorHinge" || materialKey === "coinLockBox" || materialKey === "coinLockHardware" || materialKey === "hingeScrew") return "door";
  if (materialKey === "glass" || name.includes("玻璃")) return "glass";
  if (["drawer", "drawerRail", "shelfPanel", "tray", "trayRail", "drawerBorder"].includes(materialKey)) return "interior";
  return "hardware";
}

function normalizeBomSpecKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/毫米/g, "mm")
    .replace(/\s*[x×*]\s*/g, "x")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-\u4e00-\u9fff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "standard";
}

function stableBomToken(value: string): string {
  let hash = 2166136261;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function enableCell(config: CabinetConfig, selection: Selection): { config: CabinetConfig; selection: Selection } {
  const depthIndex = getSelectionDepthIndex(config, selection);
  const nextConfig = updatePlanCell(config, { ...selection, depthIndex }, (cell) => ({ ...cell, enabled: true }));
  return { config: nextConfig, selection: { ...selection, depthIndex } };
}

function ensureOneActive(config: CabinetConfig): CabinetConfig {
  if (getActiveCellCount(config) > 0) return config;
  const planCells = normalizePlanShape(config);
  planCells[0][0][0].enabled = true;
  return withPlanCells(config, planCells);
}

function cloneCells(cells: CellConfig[][]): CellConfig[][] {
  return cells.map((row) => row.map(cloneCell));
}

function clonePlanCells(planCells: CellConfig[][][]): CellConfig[][][] {
  return planCells.map((row) => row.map((depthRow) => depthRow.map(cloneCell)));
}

function getLegacyCellsFromPlan(planCells: CellConfig[][][]): CellConfig[][] {
  return planCells.map((row) => (row[0] ?? []).map(cloneCell));
}

function normalizePlanShape(config: CabinetConfig): CellConfig[][][] {
  const rows = config.rowHeights.length;
  const columns = config.columnWidths.length;
  const depthSegments = getDepthSegments(config);
  const depthCount = depthSegments.length;
  const source = getPlanCells(config);
  const planCells = createPlanCells(rows, depthCount, columns);

  for (let row = 0; row < rows; row += 1) {
    for (let depthIndex = 0; depthIndex < depthCount; depthIndex += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sourceCell = source[row]?.[depthIndex]?.[column] ?? (depthIndex === 0 ? config.cells[row]?.[column] : undefined);
        if (sourceCell) planCells[row][depthIndex][column] = cloneCell(sourceCell);
      }
    }
  }

  return planCells;
}

function withPlanCells(config: CabinetConfig, planCells: CellConfig[][][], depthSegments = getDepthSegments(config)): CabinetConfig {
  return {
    ...config,
    depth: sum(depthSegments),
    depthSegments,
    planCells,
    cells: getLegacyCellsFromPlan(planCells)
  };
}

function updatePlanCell(
  config: CabinetConfig,
  selection: Selection,
  updater: (cell: CellConfig, depthIndex: number) => CellConfig | null
): CabinetConfig {
  const depthIndex = getSelectionDepthIndex(config, selection);
  const planCells = normalizePlanShape(config);
  const cell = planCells[selection.row]?.[depthIndex]?.[selection.column];
  if (!cell) return config;
  const nextCell = updater(cell, depthIndex);
  if (!nextCell) return config;
  planCells[selection.row][depthIndex][selection.column] = nextCell;
  return withPlanCells(config, planCells);
}

function clearMatchingCellDepthOverrides(planCells: CellConfig[][][], depthSegments: number[]): CellConfig[][][] {
  planCells.forEach((row) => row.forEach((depthRow, depthIndex) => depthRow.forEach((cell) => {
    if (cell.depth === depthSegments[depthIndex]) cell.depth = undefined;
  })));
  return planCells;
}

function cloneCell(cell: CellConfig): CellConfig {
  return {
    ...cell,
    panelColors: cell.panelColors ? { ...cell.panelColors } : undefined,
    accessoryColors: cell.accessoryColors ? { ...cell.accessoryColors } : undefined,
    structure: cell.structure ? {
      panels: cell.structure.panels ? { ...cell.structure.panels } : undefined,
      frames: cell.structure.frames ? { ...cell.structure.frames } : undefined,
      vertices: cell.structure.vertices ? { ...cell.structure.vertices } : undefined
    } : undefined
  };
}

function isFrontFacingClosableCell(cell: CellConfig): boolean {
  if (cell.faceSide === "back") return false;
  return isDoorCellKind(cell.kind) || hasFrontAccessory(cell.frontAccessory) || isDrawerFitting(cell.fitting);
}

function createBackPanelShellFromFrontCell(cell: CellConfig): CellConfig {
  return {
    kind: "metalBackModule",
    enabled: true,
    color: cell.color,
    fitting: "none"
  };
}

function createBridgeCellFromFormerFront(cell: CellConfig): CellConfig {
  return {
    kind: "sideOpenDoor",
    enabled: true,
    color: cell.color,
    fitting: "none"
  };
}

function normalizeCellStructure(input: CellStructureOverrides | undefined): CellStructureOverrides | undefined {
  const panels: Partial<Record<StructurePanelKey, StructurePanelMaterial>> = {};
  const frames: Partial<Record<StructureFrameKey, boolean>> = {};
  const vertices: Partial<Record<StructureVertexKey, boolean>> = {};

  STRUCTURE_PANEL_OPTIONS.forEach((option) => {
    const value = input?.panels?.[option.id];
    if (isStructurePanelMaterial(value)) panels[option.id] = value;
  });

  STRUCTURE_FRAME_OPTIONS.forEach((option) => {
    const value = input?.frames?.[option.id];
    if (typeof value === "boolean") frames[option.id] = value;
  });

  STRUCTURE_VERTEX_OPTIONS.forEach((option) => {
    const value = input?.vertices?.[option.id];
    if (typeof value === "boolean") vertices[option.id] = value;
  });

  const normalized: CellStructureOverrides = {};
  if (Object.keys(panels).length) normalized.panels = panels;
  if (Object.keys(frames).length) normalized.frames = frames;
  if (Object.keys(vertices).length) normalized.vertices = vertices;
  return Object.keys(normalized).length ? normalized : undefined;
}

function clearFacingPanelOverrides(input: CellStructureOverrides | undefined): CellStructureOverrides | undefined {
  if (!input?.panels) return input;
  const panels = { ...input.panels };
  delete panels.front;
  delete panels.back;
  return normalizeCellStructure({
    ...input,
    panels
  });
}

function normalizeFramePartOverrides(input: Record<string, FramePartOverride> | undefined): Record<string, FramePartOverride> | undefined {
  if (!input) return undefined;
  const result: Record<string, FramePartOverride> = {};
  Object.entries(input).forEach(([id, override]) => {
    if (!id || override?.deleted !== true) return;
    const migratedId = id.replace(
      /^(support:)?((?:vertex|tube:x|tube:y):.+):(?:front|back):\d+:(-?\d+(?:\.\d+)?)$/,
      (_match, supportPrefix: string | undefined, partPrefix: string, z: string) =>
        `${supportPrefix ?? ""}${partPrefix}:plane:${Number(z).toFixed(3)}`
    );
    result[migratedId] = { deleted: true };
  });
  return Object.keys(result).length ? result : undefined;
}

function normalizeAccessoryColors(input: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!input) return undefined;
  const result: Record<string, string> = {};
  Object.entries(input).forEach(([key, value]) => { const color = normalizeColorValue(value); if (color) result[key] = color; });
  return Object.keys(result).length ? result : undefined;
}

function normalizePanelColors(input: Partial<Record<StructurePanelKey, string>> | undefined): Partial<Record<StructurePanelKey, string>> | undefined {
  if (!input) return undefined;
  const result: Partial<Record<StructurePanelKey, string>> = {};
  STRUCTURE_PANEL_OPTIONS.forEach((option) => { const color = normalizeColorValue(input[option.id]); if (color) result[option.id] = color; });
  return Object.keys(result).length ? result : undefined;
}

function isStructurePanelKey(value: unknown): value is StructurePanelKey {
  return STRUCTURE_PANEL_OPTIONS.some((option) => option.id === value);
}

function isStructureFrameKey(value: unknown): value is StructureFrameKey {
  return STRUCTURE_FRAME_OPTIONS.some((option) => option.id === value);
}

function isStructureVertexKey(value: unknown): value is StructureVertexKey {
  return STRUCTURE_VERTEX_OPTIONS.some((option) => option.id === value);
}

function isStructurePanelMaterial(value: unknown): value is StructurePanelMaterial {
  return STRUCTURE_PANEL_MATERIAL_OPTIONS.some((option) => option.id === value);
}

function getCenteredColumnBounds(widths: number[]) {
  const totalWidth = sum(widths);
  const xBounds = [-totalWidth / 2];
  widths.forEach((width) => xBounds.push(xBounds[xBounds.length - 1] + width));
  return xBounds;
}

function getActiveBounds(config: CabinetConfig) {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = 0;
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = 0;

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
        if (!cell.enabled) return;
        minRow = Math.min(minRow, rowIndex);
        maxRow = Math.max(maxRow, rowIndex);
        minColumn = Math.min(minColumn, columnIndex);
        maxColumn = Math.max(maxColumn, columnIndex);
        minDepth = Math.min(minDepth, depthIndex);
        maxDepth = Math.max(maxDepth, depthIndex);
      });
    });
  });

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn) || !Number.isFinite(minDepth)) {
    return { minRow: 0, maxRow: 0, minColumn: 0, maxColumn: 0, minDepth: 0, maxDepth: 0 };
  }

  return { minRow, maxRow, minColumn, maxColumn, minDepth, maxDepth };
}

function getMaxActiveDepth(config: CabinetConfig): number {
  const depthSegments = getDepthSegments(config);
  if (depthSegments.length > 1) {
    const bounds = getActiveBounds(config);
    return sum(depthSegments.slice(bounds.minDepth, bounds.maxDepth + 1));
  }

  let maxDepth = 0;
  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => depthRow.forEach((cell, columnIndex) => {
      if (!cell.enabled) return;
      maxDepth = Math.max(maxDepth, getCellDepth(config, rowIndex, columnIndex, depthIndex));
    }));
  });
  return maxDepth || depthSegments[0] || config.depth;
}

function getHorizontalFrameKey(rowIndex: number, yIndex: number, zIndex: number): StructureFrameKey {
  const top = yIndex === rowIndex + 1;
  const front = zIndex === 1;
  if (top && front) return "topFrontBeam";
  if (top) return "topBackBeam";
  if (front) return "bottomFrontBeam";
  return "bottomBackBeam";
}

function getDepthFrameKey(columnIndex: number, rowIndex: number, xIndex: number, yIndex: number): StructureFrameKey {
  const top = yIndex === rowIndex + 1;
  const right = xIndex === columnIndex + 1;
  if (top && right) return "topRightBeam";
  if (top) return "topLeftBeam";
  if (right) return "bottomRightBeam";
  return "bottomLeftBeam";
}

function getVerticalFrameKey(columnIndex: number, xIndex: number, zIndex: number): StructureFrameKey {
  const right = xIndex === columnIndex + 1;
  const front = zIndex === 1;
  if (front && right) return "frontRightPost";
  if (front) return "frontLeftPost";
  if (right) return "backRightPost";
  return "backLeftPost";
}

function getStructureVertexKey(columnIndex: number, rowIndex: number, xIndex: number, yIndex: number, zIndex: number): StructureVertexKey {
  const right = xIndex === columnIndex + 1;
  const top = yIndex === rowIndex + 1;
  const front = zIndex === 1;

  if (top && front && right) return "rightFrontTop";
  if (top && front) return "leftFrontTop";
  if (top && right) return "rightBackTop";
  if (top) return "leftBackTop";
  if (front && right) return "rightFrontBottom";
  if (front) return "leftFrontBottom";
  if (right) return "rightBackBottom";
  return "leftBackBottom";
}

export function isFramePartDeleted(config: CabinetConfig, partId: string): boolean {
  return config.framePartOverrides?.[partId]?.deleted === true;
}

export function buildFrameTopology(config: CabinetConfig): FrameTopology {
  const widths = config.columnWidths;
  const heights = config.rowHeights;
  const depths = getDepthSegments(config);
  const xBounds = getCenteredColumnBounds(widths);
  const yBounds = [0];
  heights.forEach((height) => yBounds.push(yBounds[yBounds.length - 1] + height));
  const totalDepth = sum(depths);
  const zBounds = [totalDepth / 2];
  depths.forEach((depth) => zBounds.push(zBounds[zBounds.length - 1] - depth));

  const vertices = new Map<string, FrameVertexPart>();
  const tubes = new Map<string, FrameTubePart>();
  const panels = new Map<string, FramePanelPart>();
  const feet = new Set<string>();
  const planeId = (z: number) => `plane:${z.toFixed(3)}`;
  const vertexId = (x: number, y: number, plane: string) => `vertex:${x}:${y}:${plane}`;
  const xTubeId = (column: number, y: number, plane: string) => `tube:x:${column}:${y}:${plane}`;
  const yTubeId = (x: number, row: number, plane: string) => `tube:y:${x}:${row}:${plane}`;
  const zTubeId = (x: number, y: number, depthIndex: number, backZ: number, frontZ: number) => `tube:z:${x}:${y}:${depthIndex}:${backZ.toFixed(3)}:${frontZ.toFixed(3)}`;
  const addVertex = (id: string, position: [number, number, number], label: string) => {
    if (isFramePartDeleted(config, id)) return;
    if (!vertices.has(id)) vertices.set(id, { id, kind: "vertex", position, connectedTubeIds: [], label });
  };
  const addTube = (part: FrameTubePart) => {
    if (!isFramePartDeleted(config, part.id) && !tubes.has(part.id)) tubes.set(part.id, part);
  };

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cell, columnIndex) => {
        if (!cell.enabled) return;
        const x0 = xBounds[columnIndex];
        const x1 = xBounds[columnIndex + 1];
        const y0 = yBounds[rowIndex];
        const y1 = yBounds[rowIndex + 1];
        const backZ = zBounds[depthIndex + 1] ?? -totalDepth / 2;
        const depth = getCellDepth(config, rowIndex, columnIndex, depthIndex);
        const frontZ = backZ + depth;
        const centerZ = (backZ + frontZ) / 2;
        const backPlane = planeId(backZ);
        const frontPlane = planeId(frontZ);
        const planes: Array<[number, string, number]> = [[0, backPlane, backZ], [1, frontPlane, frontZ]];

        [columnIndex, columnIndex + 1].forEach((xIndex) => {
          [rowIndex, rowIndex + 1].forEach((yIndex) => {
            planes.forEach(([localZ, plane, z]) => {
              const legacyKey = getStructureVertexKey(columnIndex, rowIndex, xIndex, yIndex, localZ);
              if (getEffectiveStructureVertexVisible(cell, legacyKey)) {
                const id = vertexId(xIndex, yIndex, plane);
                const horizontalSide = xIndex === columnIndex ? "左" : "右";
                const verticalSide = yIndex === rowIndex ? "下" : "上";
                const depthSide = localZ === 0 ? "后" : "前";
                addVertex(
                  id,
                  [xBounds[xIndex], yBounds[yIndex], z],
                  `第 ${columnIndex + 1} 列 · 第 ${depthIndex + 1} 深度 · 第 ${rowIndex + 1} 层 · ${horizontalSide}${depthSide}${verticalSide}球节点`
                );
                if (rowIndex === 0 && yIndex === 0) feet.add(id);
              }
            });
            const legacyKey = getDepthFrameKey(columnIndex, rowIndex, xIndex, yIndex);
            if (getEffectiveStructureFrameVisible(cell, legacyKey)) {
              const id = zTubeId(xIndex, yIndex, depthIndex, backZ, frontZ);
              addTube({
                id,
                kind: "tube",
                axis: "z",
                length: depth,
                position: [xBounds[xIndex], yBounds[yIndex], centerZ],
                vertexIds: [vertexId(xIndex, yIndex, backPlane), vertexId(xIndex, yIndex, frontPlane)],
                label: `第 ${columnIndex + 1} 列 · 第 ${depthIndex + 1} 深度 · 第 ${rowIndex + 1} 层 · ${xIndex === columnIndex ? "左" : "右"}${yIndex === rowIndex ? "下" : "上"}深度钢管（${depth} mm）`
              });
            }
          });
        });

        [rowIndex, rowIndex + 1].forEach((yIndex) => {
          planes.forEach(([localZ, plane, z]) => {
            const legacyKey = getHorizontalFrameKey(rowIndex, yIndex, localZ);
            if (!getEffectiveStructureFrameVisible(cell, legacyKey)) return;
            const id = xTubeId(columnIndex, yIndex, plane);
            addTube({
              id,
              kind: "tube",
              axis: "x",
              length: widths[columnIndex],
              position: [(x0 + x1) / 2, yBounds[yIndex], z],
              vertexIds: [vertexId(columnIndex, yIndex, plane), vertexId(columnIndex + 1, yIndex, plane)],
                label: `第 ${columnIndex + 1} 列 · 第 ${depthIndex + 1} 深度 · 第 ${rowIndex + 1} 层 · ${yIndex === rowIndex ? "下" : "上"}${localZ === 0 ? "后" : "前"}横向钢管（${widths[columnIndex]} mm）`
            });
          });
        });

        [columnIndex, columnIndex + 1].forEach((xIndex) => {
          planes.forEach(([localZ, plane, z]) => {
            const legacyKey = getVerticalFrameKey(columnIndex, xIndex, localZ);
            if (!getEffectiveStructureFrameVisible(cell, legacyKey)) return;
            const id = yTubeId(xIndex, rowIndex, plane);
            addTube({
              id,
              kind: "tube",
              axis: "y",
              length: heights[rowIndex],
              position: [xBounds[xIndex], (y0 + y1) / 2, z],
              vertexIds: [vertexId(xIndex, rowIndex, plane), vertexId(xIndex, rowIndex + 1, plane)],
                label: `第 ${columnIndex + 1} 列 · 第 ${depthIndex + 1} 深度 · 第 ${rowIndex + 1} 层 · ${xIndex === columnIndex ? "左" : "右"}${localZ === 0 ? "后" : "前"}竖向钢管（${heights[rowIndex]} mm）`
            });
          });
        });

        const selection = { row: rowIndex, column: columnIndex, depthIndex };
        const supportMap: Record<StructurePanelKey, string[]> = {
          front: [xTubeId(columnIndex, rowIndex, frontPlane), xTubeId(columnIndex, rowIndex + 1, frontPlane), yTubeId(columnIndex, rowIndex, frontPlane), yTubeId(columnIndex + 1, rowIndex, frontPlane)],
          back: [xTubeId(columnIndex, rowIndex, backPlane), xTubeId(columnIndex, rowIndex + 1, backPlane), yTubeId(columnIndex, rowIndex, backPlane), yTubeId(columnIndex + 1, rowIndex, backPlane)],
          left: [yTubeId(columnIndex, rowIndex, backPlane), yTubeId(columnIndex, rowIndex, frontPlane), zTubeId(columnIndex, rowIndex, depthIndex, backZ, frontZ), zTubeId(columnIndex, rowIndex + 1, depthIndex, backZ, frontZ)],
          right: [yTubeId(columnIndex + 1, rowIndex, backPlane), yTubeId(columnIndex + 1, rowIndex, frontPlane), zTubeId(columnIndex + 1, rowIndex, depthIndex, backZ, frontZ), zTubeId(columnIndex + 1, rowIndex + 1, depthIndex, backZ, frontZ)],
          top: [xTubeId(columnIndex, rowIndex + 1, backPlane), xTubeId(columnIndex, rowIndex + 1, frontPlane), zTubeId(columnIndex, rowIndex + 1, depthIndex, backZ, frontZ), zTubeId(columnIndex + 1, rowIndex + 1, depthIndex, backZ, frontZ)],
          bottom: [xTubeId(columnIndex, rowIndex, backPlane), xTubeId(columnIndex, rowIndex, frontPlane), zTubeId(columnIndex, rowIndex, depthIndex, backZ, frontZ), zTubeId(columnIndex + 1, rowIndex, depthIndex, backZ, frontZ)]
        };
        STRUCTURE_PANEL_OPTIONS.forEach((option) => {
          if (occupiesPhysicalPanel(cell, option.id)) return;
          const material = getEffectiveStructurePanelMaterial(cell, cell.kind, option.id);
          const id = `panel:${rowIndex}:${depthIndex}:${columnIndex}:${option.id}`;
          if (material === "none" || isFramePartDeleted(config, id)) return;
          panels.set(id, {
            id,
            kind: "panel",
            cell: selection,
            panel: option.id,
            material,
            supportTubeIds: supportMap[option.id],
            label: `第 ${columnIndex + 1} 列 · 第 ${depthIndex + 1} 深度 · 第 ${rowIndex + 1} 层 · ${option.label}`
          });
        });
      });
    });
  });

  tubes.forEach((tube) => tube.vertexIds.forEach((id) => {
    const vertex = vertices.get(id);
    if (vertex && !vertex.connectedTubeIds.includes(tube.id)) vertex.connectedTubeIds.push(tube.id);
  }));

  const supports = [...feet].flatMap((vertexId): FrameSupportPart[] => {
    const vertex = vertices.get(vertexId);
    const id = `support:${vertexId}`;
    if (!vertex || isFramePartDeleted(config, id)) return [];
    return [{
      id,
      kind: "support",
      vertexId,
      position: vertex.position,
      label: vertex.label.replace(/球节点$/, "脚垫")
    }];
  });

  return {
    vertices: [...vertices.values()],
    tubes: [...tubes.values()],
    panels: [...panels.values()],
    supports,
    feet: supports.map((part) => part.vertexId)
  };
}

export function getFramePart(config: CabinetConfig, partId: string): FrameVertexPart | FrameTubePart | FramePanelPart | FrameSupportPart | undefined {
  const topology = buildFrameTopology(config);
  return topology.vertices.find((part) => part.id === partId)
    ?? topology.tubes.find((part) => part.id === partId)
    ?? topology.panels.find((part) => part.id === partId)
    ?? topology.supports.find((part) => part.id === partId);
}

export function getFramePartConnections(config: CabinetConfig, partId: string): FramePartRef[] {
  const topology = buildFrameTopology(config);
  const vertex = topology.vertices.find((part) => part.id === partId);
  if (vertex) return vertex.connectedTubeIds.map((id) => ({ id, kind: "tube" as const }));
  const tube = topology.tubes.find((part) => part.id === partId);
  if (tube) {
    const panels = topology.panels.filter((panel) => panel.supportTubeIds.includes(tube.id)).map((panel) => ({ id: panel.id, kind: "panel" as const }));
    return [...tube.vertexIds.map((id) => ({ id, kind: "vertex" as const })), ...panels];
  }
  const panel = topology.panels.find((part) => part.id === partId);
  if (panel) return panel.supportTubeIds.map((id) => ({ id, kind: "tube" as const }));
  const support = topology.supports.find((part) => part.id === partId);
  return support ? [{ id: support.vertexId, kind: "vertex" }] : [];
}

function getBomDelta(before: BomItem[], after: BomItem[]): BomItem[] {
  const totals = new Map<string, BomItem>();
  before.forEach((item) => totals.set(`${item.name}|${item.spec}|${item.color ?? ""}`, { ...item }));
  after.forEach((item) => {
    const key = `${item.name}|${item.spec}|${item.color ?? ""}`;
    const current = totals.get(key);
    if (current) current.qty -= item.qty;
  });
  return [...totals.values()].filter((item) => item.qty > 0);
}

function applyFrameImpactDraft(config: CabinetConfig, impact: Pick<StructureImpact, "removedTubes" | "removedVertices" | "removedPanels" | "removedSupports">): CabinetConfig {
  const framePartOverrides = { ...config.framePartOverrides };
  [...impact.removedTubes, ...impact.removedVertices, ...impact.removedSupports].forEach((id) => { framePartOverrides[id] = { deleted: true }; });
  let next: CabinetConfig = { ...config, framePartOverrides };
  impact.removedPanels.forEach((item) => {
    framePartOverrides[item.id] = { deleted: true };
    next = setPhysicalStructurePanel(next, item.cell, item.panel, "none");
  });
  return normalizeConfig({ ...next, framePartOverrides });
}

export function evaluateFramePartRemoval(config: CabinetConfig, partId: string): StructureImpact | null {
  const topology = buildFrameTopology(config);
  const source = getFramePart(config, partId);
  if (!source) return null;
  const removedTubes = new Set<string>();
  const removedVertices = new Set<string>();
  const removedSupports = new Set<string>();
  if (source.kind === "tube") removedTubes.add(source.id);
  if (source.kind === "vertex") {
    removedVertices.add(source.id);
    source.connectedTubeIds.forEach((id) => removedTubes.add(id));
  }
  if (source.kind === "support") removedSupports.add(source.id);

  const affectedVertexIds = new Set<string>();
  topology.tubes.filter((tube) => removedTubes.has(tube.id)).forEach((tube) => tube.vertexIds.forEach((id) => affectedVertexIds.add(id)));
  affectedVertexIds.forEach((id) => {
    if (removedVertices.has(id)) return;
    const vertex = topology.vertices.find((part) => part.id === id);
    if (vertex && vertex.connectedTubeIds.every((tubeId) => removedTubes.has(tubeId))) removedVertices.add(id);
  });

  const removedPanels = topology.panels
    .filter((panel) => source.kind === "panel" ? panel.id === source.id : panel.supportTubeIds.some((id) => removedTubes.has(id)))
    .map((panel) => ({ cell: panel.cell, panel: panel.panel, id: panel.id }));
  topology.supports
    .filter((support) => removedVertices.has(support.vertexId))
    .forEach((support) => removedSupports.add(support.id));
  const baseImpact = {
    sourcePart: { id: source.id, kind: source.kind },
    removedTubes: [...removedTubes],
    removedVertices: [...removedVertices],
    removedPanels,
    removedSupports: [...removedSupports],
    bomDelta: [] as BomItem[],
    priceDelta: 0,
    warnings: ["Outer and crate dimensions remain unchanged."]
  };
  const next = applyFrameImpactDraft(config, baseImpact);
  return {
    ...baseImpact,
    bomDelta: getBomDelta(buildBom(config), buildBom(next)),
    priceDelta: Math.max(0, estimatePrice(config) - estimatePrice(next))
  };
}

export function applyFramePartRemoval(config: CabinetConfig, impact: StructureImpact): CabinetConfig {
  return applyFrameImpactDraft(config, impact);
}

function collectFrameParts(config: CabinetConfig) {
  const topology = buildFrameTopology(config);
  const points = new Set(topology.vertices.map((part) => part.id));
  const feet = new Set(topology.supports.map((part) => part.id));
  const xLengths = new Map<number, number>();
  const yLengths = new Map<number, number>();
  const zLengths = new Map<number, number>();
  topology.tubes.forEach((tube) => {
    const target = tube.axis === "x" ? xLengths : tube.axis === "y" ? yLengths : zLengths;
    target.set(tube.length, (target.get(tube.length) ?? 0) + 1);
  });
  return { points, feet, xLengths, yLengths, zLengths };
}

function sanitizeSizes(values: number[] | undefined, fallback: number[]): number[] {
  const clean = values?.map((value) => sanitizeSize(value, 350)).filter(Boolean).slice(0, MAX_GRID_COUNT);
  return clean?.length ? clean : fallback;
}

function sanitizeSize(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(MIN_CUSTOM_SIZE, Math.min(MAX_CUSTOM_SIZE, numeric)));
}

function sanitizeSurfaceThickness(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(clamp(numeric, 8, 80));
}

function sanitizeOverhang(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(clamp(numeric, 0, 500));
}

function toInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(numeric);
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
