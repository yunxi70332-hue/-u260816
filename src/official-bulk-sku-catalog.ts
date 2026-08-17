export interface OfficialBulkSkuInput {
  materialKey?: string | null;
  canonicalName?: string | null;
  key?: string | null;
  name?: string | null;
  spec?: string | null;
  specification?: string | null;
  baseSpec?: string | null;
  specKey?: string | null;
  color?: string | null;
}

export interface OfficialBulkSkuMatch {
  category: string;
  subcategory: string;
  skuCode: string;
  name: string;
  specification: string;
  color: string;
  unit: string;
}

type DimensionMatrix = Readonly<Record<number, readonly number[]>>;

const PANEL_MATRIX: DimensionMatrix = {
  85: [85],
  160: [85, 160],
  235: [85, 160, 235],
  335: [85, 160, 235, 335],
  380: [85, 160, 235, 335, 380],
  485: [85, 160, 235, 335, 380, 485],
  735: [85, 160, 235, 335, 380, 485]
};

const PERFORATED_PANEL_MATRIX: DimensionMatrix = {
  235: [235],
  335: [85, 160, 235, 335],
  380: [85, 160, 235, 335, 380],
  485: [85, 160, 235, 335, 380, 485],
  735: [85, 160, 235, 335, 380, 485]
};

const FOUR_ROW_HOLE_PANEL_MATRIX: DimensionMatrix = {
  235: [85, 160, 235],
  335: [85, 160, 235, 335],
  380: [85, 160, 235, 335, 380],
  485: [85, 160, 235, 335, 380, 485],
  735: [85, 160, 235, 335, 380]
};

const DOOR_PANEL_MATRIX: DimensionMatrix = {
  235: [85, 160, 235, 335],
  335: [85, 160, 235, 335, 485],
  380: [85, 160, 235, 335, 380],
  485: [85, 160, 235, 335, 380, 485],
  735: [85, 160, 235, 335, 380, 485]
};

const FLIP_UP_DOOR_MATRIX: DimensionMatrix = {
  235: [85, 160, 235, 335, 380, 485, 735],
  335: [85, 160, 235, 335, 380, 485, 735],
  380: [85, 160, 235, 335, 380, 485, 735],
  485: [85, 160, 235, 335, 380, 485, 735],
  735: [85, 160, 235, 335, 380, 485, 735]
};

const TRAY_MATRIX: DimensionMatrix = {
  335: [235, 335, 485],
  380: [235, 335, 380],
  485: [235, 335, 380, 485],
  735: [235, 335, 380, 485]
};

const SHELF_MATRIX: DimensionMatrix = {
  235: [235, 335, 380, 485, 735],
  335: [235, 335, 380, 485, 735],
  380: [235, 335, 380, 485, 735],
  485: [235, 335, 380, 485, 735],
  735: [235, 335, 380, 485, 735]
};

const GLASS_PANEL_MATRIX: DimensionMatrix = {
  155: [155],
  230: [155, 230],
  330: [155, 230, 330],
  375: [155, 230, 330, 375],
  480: [155, 230, 330, 375, 480],
  730: [155, 230, 330, 375, 480, 730]
};

const GLASS_SHELF_MATRIX: DimensionMatrix = {
  230: [230],
  330: [230, 330],
  375: [230, 330, 375],
  480: [230, 330, 375, 480],
  730: [230, 330, 375, 480]
};

const GLASS_DOOR_DIMENSIONS = [153, 228, 328, 373, 478, 728] as const;
const TUBE_LENGTHS = new Set([82, 157, 232, 332, 377, 482, 732]);
const TUBE_HANDLE_SPECS = new Set(["350 推车拉手", "395 推车拉手", "500 推车拉手"]);

const COLOR_BY_HEX: Readonly<Record<string, string>> = {
  "#0c0c0c": "黑色",
  "#fffef0": "白色",
  "#b8a68e": "奶咖色",
  "#1a2845": "钢蓝色",
  "#586840": "橄榄绿",
  "#2255a8": "宝石蓝",
  "#fafad2": "鹅黄色",
  "#e8602a": "橙色",
  "#f5b8c8": "粉红",
  "#8ed0f0": "西子蓝",
  "#2da845": "绿色",
  "#7a1830": "红色",
  "#e8aa10": "黄色",
  "#bcc0b8": "银色",
  "#5a5a68": "深灰色",
  "#5c3820": "棕色"
};

const COLOR_BY_ALIAS: Readonly<Record<string, string>> = {
  black: "黑色",
  white: "白色",
  latte: "奶咖色",
  "steel-blue": "钢蓝色",
  steelblue: "钢蓝色",
  "olive-green": "橄榄绿",
  olivegreen: "橄榄绿",
  "sapphire-blue": "宝石蓝",
  sapphireblue: "宝石蓝",
  "goose-yellow": "鹅黄色",
  gooseyellow: "鹅黄色",
  orange: "橙色",
  pink: "粉红",
  "xizi-blue": "西子蓝",
  xiziblue: "西子蓝",
  green: "绿色",
  red: "红色",
  yellow: "黄色",
  silver: "银色",
  "dark-grey": "深灰色",
  darkgrey: "深灰色",
  brown: "棕色",
  graphiteblack: "黑色",
  purewhite: "白色",
  lightgrey: "银色",
  midgrey: "深灰色",
  anthracite: "深灰色",
  "golden-yellow": "黄色",
  goldenyellow: "黄色",
  "pure-orange": "橙色",
  pureorange: "橙色",
  "ruby-red": "红色",
  rubyred: "红色",
  "gentian-blue": "宝石蓝",
  gentianblue: "宝石蓝",
  usmgreen: "绿色",
  "usm-beige": "奶咖色",
  usmbeige: "奶咖色",
  "usm-brown": "棕色",
  usmbrown: "棕色"
};

const HARDWARE_BY_KEY: Readonly<Record<string, { subcategory: string; name: string; specification: string; color: string; unit: string }>> = {
  caster: { subcategory: "脚轮", name: "脚轮", specification: "脚轮", color: "零件", unit: "个" },
  glassLockSet: { subcategory: "零件", name: "玻璃锁套", specification: "玻璃锁套", color: "零件", unit: "套" },
  largeAngleBracket: { subcategory: "零件", name: "大角码", specification: "大角码", color: "零件", unit: "个" },
  washer: { subcategory: "零件", name: "垫片", specification: "垫片", color: "零件", unit: "个" },
  clothesHanger: { subcategory: "零件", name: "挂衣配件", specification: "挂衣配件", color: "零件", unit: "个" },
  glide: { subcategory: "零件", name: "脚垫", specification: "脚垫", color: "黑色", unit: "个" },
  dropDoorHinge: { subcategory: "零件", name: "铰链", specification: "铰链", color: "零件", unit: "个" },
  hingeScrew: { subcategory: "零件", name: "铰链螺丝", specification: "铰链螺丝", color: "零件", unit: "个" },
  expansionSet: { subcategory: "零件", name: "膨胀螺丝", specification: "膨胀螺丝", color: "零件", unit: "个" },
  panelDoorPivotSet: { subcategory: "零件", name: "上翻锁盒套装", specification: "上翻锁盒套装", color: "零件", unit: "个" },
  coinLockBox: { subcategory: "零件", name: "锁头", specification: "锁头", color: "零件", unit: "个" },
  lockHeadScrew: { subcategory: "零件", name: "锁头螺丝", specification: "锁头螺丝", color: "零件", unit: "个" },
  coinLockHardware: { subcategory: "零件", name: "下翻锁盒套装", specification: "下翻锁盒套装", color: "零件", unit: "个" },
  cableGrommet: { subcategory: "零件", name: "线口（62×48mm、R5mm）", specification: "线口（62×48mm、R5mm）", color: "零件", unit: "个" },
  smallAngleBracket: { subcategory: "零件", name: "小角码", specification: "小角码", color: "零件", unit: "个" },
  lPlastic: { subcategory: "零件", name: "L 型塑料", specification: "L 型塑料", color: "黑色", unit: "个" }
};

const KNOWN_COLORS = new Set(Object.values(COLOR_BY_HEX));

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_\-]+/g, "");
}

function normalizeColor(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const hex = raw.match(/#[0-9a-f]{6}/i)?.[0]?.toLowerCase();
  if (hex && COLOR_BY_HEX[hex]) return COLOR_BY_HEX[hex];
  if (KNOWN_COLORS.has(raw)) return raw;
  return COLOR_BY_ALIAS[compact(raw)] ?? null;
}

function numbersFrom(value: string): number[] {
  return [...value.normalize("NFKC").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter(Number.isFinite);
}

function dimensionsFrom(input: OfficialBulkSkuInput): number[] {
  const source = [input.baseSpec, input.specKey, input.spec, input.specification].map(text).find(Boolean) ?? "";
  return numbersFrom(source).slice(0, 3);
}

function mapped(value: number, delta: number): number {
  return Math.round(value) - delta;
}

function panelSpec(first: number, second: number, delta: number): string {
  const values = [mapped(first, delta), mapped(second, delta)].sort((a, b) => b - a);
  return `${values[0]} × ${values[1]} mm`;
}

function directionalSpec(first: number, second: number, delta: number): string {
  return `${mapped(first, delta)} × ${mapped(second, delta)} mm`;
}

function matrixHas(matrix: DimensionMatrix, first: number, second: number): boolean {
  return matrix[first]?.includes(second) ?? false;
}

function matrixHasEitherOrientation(matrix: DimensionMatrix, first: number, second: number): boolean {
  return matrixHas(matrix, Math.max(first, second), Math.min(first, second));
}

function inferMaterialKey(input: OfficialBulkSkuInput): string {
  const supplied = text(input.materialKey || input.canonicalName || input.key);
  if (supplied) {
    const knownKey = Object.keys(HARDWARE_BY_KEY).find((candidate) => candidate.toLowerCase() === supplied.toLowerCase());
    const catalogKey = ["brassBall", "tube304", "panel", "panel.perforated", "panel.fourRowHole", "doorPanel", "door.flip.composite", "tray", "shelfPanel", "glass", "glassShelf", "door.glass.composite"]
      .find((candidate) => candidate.toLowerCase() === supplied.toLowerCase());
    if (knownKey || catalogKey) return knownKey ?? catalogKey ?? supplied;
  }
  // Factory files may place the friendly material name in canonicalName/key instead of name.
  const name = text(input.name || supplied);
  const token = compact(name);
  if (token.includes("球节点") || token.includes("黄铜球") || token === "珠子") return "brassBall";
  if (token.includes("钢管") || token.includes("电镀管") || token === "管") return "tube304";
  if (token.includes("四排孔") || token.includes("四边孔")) return "panel.fourRowHole";
  if (token.includes("洞洞")) return token.includes("门") || token.includes("上翻") ? "door.flip.composite" : "panel.perforated";
  if (["扣板", "外板", "金属扣板", "金属背板", "顶板", "底板", "内板"].includes(token)) return "panel";
  if (token.includes("玻璃门")) return "door.glass.composite";
  if (token.includes("上翻")) return "door.flip.composite";
  if (token.includes("下翻") || token.includes("门板")) return "doorPanel";
  if (token.includes("玻璃")) return token.includes("层板") || token.includes("搁板") ? "glassShelf" : "glass";
  if (token === "层板" || token.includes("固定托盘") || token.includes("固定搁板") || token.includes("固定层板")) return "shelfPanel";
  if (token === "托盘" || token.includes("移动托盘") || token.includes("展示托盘")) return "tray";
  const hardware: Readonly<Record<string, string>> = {
    "脚轮": "caster",
    "玻璃锁套": "glassLockSet",
    "大角码": "largeAngleBracket",
    "垫片": "washer",
    "挂衣配件": "clothesHanger",
    "脚垫": "glide",
    "调平脚垫": "glide",
    "铰链": "dropDoorHinge",
    "下翻门铰链": "dropDoorHinge",
    "铰链螺丝": "hingeScrew",
    "膨胀螺丝": "expansionSet",
    "膨胀套件": "expansionSet",
    "上翻锁盒套装": "panelDoorPivotSet",
    "一元锁": "coinLockBox",
    "锁头": "coinLockBox",
    "锁头螺丝": "lockHeadScrew",
    "下翻锁盒套装": "coinLockHardware",
    "锁盒+螺丝": "coinLockHardware",
    "小角码": "smallAngleBracket",
    "线口": "cableGrommet",
    "l型塑料": "lPlastic"
  };
  if (token.startsWith("线口")) return "cableGrommet";
  return hardware[token] ?? supplied;
}

function matchFixed(category: string, row: { subcategory: string; name: string; specification: string; color: string; unit: string }): OfficialBulkSkuMatch {
  return {
    category,
    subcategory: row.subcategory,
    skuCode: `${row.subcategory}|${row.name}|${row.specification}|${row.color}`,
    name: row.name,
    specification: row.specification,
    color: row.color,
    unit: row.unit
  };
}

function matchColored(category: string, subcategory: string, name: string, specification: string, unit: string, color: string | null): OfficialBulkSkuMatch | null {
  if (!color) return null;
  return matchFixed(category, { subcategory, name, specification, color, unit });
}

function matchPanel(key: string, input: OfficialBulkSkuInput, color: string | null): OfficialBulkSkuMatch | null {
  const dimensions = dimensionsFrom(input);
  if (dimensions.length < 2) return null;
  const first = mapped(dimensions[0], 15);
  const second = mapped(dimensions[1], 15);
  const matrix = key === "panel.perforated" ? PERFORATED_PANEL_MATRIX : key === "panel.fourRowHole" ? FOUR_ROW_HOLE_PANEL_MATRIX : PANEL_MATRIX;
  if (!matrixHasEitherOrientation(matrix, first, second)) return null;
  const subcategory = key === "panel.perforated" ? "扣板（洞洞）" : key === "panel.fourRowHole" ? "扣板（四边孔）" : "扣板";
  return matchColored("扣板", subcategory, "扣板", panelSpec(dimensions[0], dimensions[1], 15), "块", color);
}

function matchDoorPanel(key: string, input: OfficialBulkSkuInput, color: string | null): OfficialBulkSkuMatch | null {
  const dimensions = dimensionsFrom(input);
  if (dimensions.length < 2) return null;
  const first = mapped(dimensions[0], 15);
  const second = mapped(dimensions[1], 15);
  const isFlip = key === "door.flip.composite";
  const matrix = isFlip ? FLIP_UP_DOOR_MATRIX : DOOR_PANEL_MATRIX;
  if (!matrixHas(matrix, first, second)) return null;
  const subcategory = isFlip ? (compact(text(input.name)).includes("洞洞") ? "上翻门（洞洞）" : "上翻门板") : compact(text(input.name)).includes("洞洞") ? "门板（洞洞）" : "门板";
  if (!isFlip && subcategory === "门板（洞洞）" && (first !== 335 || second !== 335)) return null;
  const name = isFlip ? (subcategory === "上翻门（洞洞）" ? "上翻门（洞洞）" : "上翻门板") : "门板";
  return matchColored(isFlip ? "上翻门板" : "门板", subcategory, name, directionalSpec(dimensions[0], dimensions[1], 15), "块", color);
}

function matchTrayOrShelf(key: string, input: OfficialBulkSkuInput, color: string | null): OfficialBulkSkuMatch | null {
  const dimensions = dimensionsFrom(input);
  if (dimensions.length < 2) return null;
  const first = mapped(dimensions[0], 15);
  const second = mapped(dimensions[1], 15);
  const matrix = key === "tray" ? TRAY_MATRIX : SHELF_MATRIX;
  if (!matrixHas(matrix, first, second)) return null;
  const category = key === "tray" ? "托盘" : "固定层板";
  const name = key === "tray" ? "托盘" : "固定层板";
  return matchColored(category, category, name, directionalSpec(dimensions[0], dimensions[1], 15), key === "tray" ? "个" : "块", color);
}

function matchGlass(key: string, input: OfficialBulkSkuInput): OfficialBulkSkuMatch | null {
  const dimensions = dimensionsFrom(input);
  if (dimensions.length < 2) return null;
  const delta = key === "door.glass.composite" ? 22 : 20;
  const first = mapped(dimensions[0], delta);
  const second = mapped(dimensions[1], delta);
  if (key === "door.glass.composite") {
    if (!GLASS_DOOR_DIMENSIONS.includes(first as (typeof GLASS_DOOR_DIMENSIONS)[number]) || !GLASS_DOOR_DIMENSIONS.includes(second as (typeof GLASS_DOOR_DIMENSIONS)[number])) return null;
    return matchFixed("玻璃门", { subcategory: "玻璃门", name: "玻璃门", specification: directionalSpec(dimensions[0], dimensions[1], delta), color: "透明玻璃", unit: "块" });
  }
  const glassName = compact(text(input.name));
  const shelf = glassName.includes("搁板") || glassName.includes("层板") || key === "glassShelf";
  const matrix = shelf ? GLASS_SHELF_MATRIX : GLASS_PANEL_MATRIX;
  if (!matrixHasEitherOrientation(matrix, first, second)) return null;
  const category = shelf ? "固定玻璃层板" : "玻璃板";
  return matchFixed(category, { subcategory: category, name: category, specification: panelSpec(dimensions[0], dimensions[1], delta), color: "透明玻璃", unit: "块" });
}

function matchTube(input: OfficialBulkSkuInput): OfficialBulkSkuMatch | null {
  const source = [input.baseSpec, input.specKey, input.spec, input.specification].map(text).find(Boolean) ?? "";
  const handle = source.match(/(350|395|500)\s*推车拉手/);
  if (handle) {
    const specification = `${handle[1]} 推车拉手`;
    if (!TUBE_HANDLE_SPECS.has(specification)) return null;
    return matchFixed("管", { subcategory: "管", name: "管", specification, color: "管", unit: "个" });
  }
  const dimension = numbersFrom(source)[0];
  if (!Number.isFinite(dimension)) return null;
  const length = mapped(dimension, 18);
  if (!TUBE_LENGTHS.has(length)) return null;
  return matchFixed("管", { subcategory: "管", name: "管", specification: `${length} mm`, color: "管", unit: "根" });
}

export function matchOfficialBulkSku(input: OfficialBulkSkuInput | null | undefined): OfficialBulkSkuMatch | null {
  if (!input || typeof input !== "object") return null;
  const key = inferMaterialKey(input);
  const color = normalizeColor(input.color);
  if (key === "brassBall") return matchFixed("零件", HARDWARE_BY_KEY.brassBall ?? { subcategory: "零件", name: "珠子", specification: "珠子", color: "零件", unit: "个" });
  if (key === "tube304") return matchTube(input);
  if (key === "panel" || key === "panel.perforated" || key === "panel.fourRowHole") return matchPanel(key, input, color);
  if (key === "doorPanel" || key === "door.drop.composite" || key === "door.flip.composite") return matchDoorPanel(key === "door.drop.composite" ? "doorPanel" : key, input, color);
  if (key === "tray" || key === "shelfPanel") return matchTrayOrShelf(key, input, color);
  if (key === "glass" || key === "glassShelf" || key === "door.glass.composite") return matchGlass(key, input);
  const hardware = HARDWARE_BY_KEY[key];
  return hardware ? matchFixed("零件", hardware) : null;
}
