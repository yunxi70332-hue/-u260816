import simpleHomePriceSource from "./data/simple-home-price-source.json";
import type { BomItem } from "./model";

export type PriceStatus = "sourceExact" | "sourceComposite" | "sourceFormula" | "sourceIncluded" | "fallback";

export interface DealerPriceItem {
  sourceRow: number;
  page: number;
  name: string;
  canonicalName: string;
  spec: string;
  unit: string;
  unitPrice: number | string;
  pricingRule: string | null;
  note: string;
}

export interface DealerPriceSource {
  schemaVersion: number;
  id: string;
  dealerName: string;
  title: string;
  currency: string;
  generatedAt: string;
  laborRules: Array<{ id: string; label: string; rate: number; scope: string }>;
  items: DealerPriceItem[];
}

export interface PricedBomItem extends BomItem {
  defaultUnitPrice: number;
  priceStatus: PriceStatus;
  priceSourceLabel: string;
  priceSourceRows: number[];
  priceNote: string;
  baseSpec: string;
}

interface PriceMatch {
  unitPrice: number;
  status: PriceStatus;
  sourceRows: number[];
  note: string;
}

export const DEFAULT_DEALER_PRICE_SOURCE = simpleHomePriceSource as DealerPriceSource;

const PANEL_DIMENSION_BY_NOMINAL = new Map([
  [750, 735],
  [580, 580],
  [500, 485],
  [395, 380],
  [350, 335],
  [300, 285],
  [250, 235],
  [175, 160],
  [150, 135],
  [100, 85]
]);

const TUBE_DIMENSION_BY_NOMINAL = new Map([
  [750, 732],
  [580, 577],
  [500, 482],
  [395, 377],
  [350, 332],
  [300, 282],
  [250, 232],
  [175, 157],
  [100, 82]
]);

export function priceBomItems(
  bom: BomItem[],
  priceSource: DealerPriceSource = DEFAULT_DEALER_PRICE_SOURCE
): PricedBomItem[] {
  return bom.map((item) => {
    const match = matchBomItem(item, priceSource);
    return {
      ...item,
      baseSpec: item.baseSpec ?? item.spec,
      defaultUnitPrice: item.unitPrice,
      unitPrice: match.unitPrice,
      priceStatus: match.status,
      priceSourceLabel: priceSource.dealerName,
      priceSourceRows: match.sourceRows,
      priceNote: match.note
    };
  });
}

export function estimatePricedBom(bom: PricedBomItem[]): number {
  return bom.reduce((total, item) => total + item.qty * item.unitPrice, 0);
}

export function summarizePriceMatches(bom: PricedBomItem[]) {
  return bom.reduce<Record<PriceStatus, number>>((summary, item) => {
    summary[item.priceStatus] += 1;
    return summary;
  }, {
    sourceExact: 0,
    sourceComposite: 0,
    sourceFormula: 0,
    sourceIncluded: 0,
    fallback: 0
  });
}

export function normalizeDealerPriceSource(input: unknown): DealerPriceSource {
  const candidate = input as Partial<DealerPriceSource> | null;
  if (!candidate || typeof candidate !== "object") return DEFAULT_DEALER_PRICE_SOURCE;
  if (!Array.isArray(candidate.items)) return DEFAULT_DEALER_PRICE_SOURCE;

  const items = candidate.items
    .map((item, index) => normalizeDealerPriceItem(item, index))
    .filter((item): item is DealerPriceItem => item !== null);

  if (!items.length) return DEFAULT_DEALER_PRICE_SOURCE;

  return {
    schemaVersion: Number(candidate.schemaVersion) || 1,
    id: stringOr(candidate.id, `dealer-price-${Date.now()}`),
    dealerName: stringOr(candidate.dealerName, "自定义经销商"),
    title: stringOr(candidate.title, "配件报价表"),
    currency: stringOr(candidate.currency, "CNY"),
    generatedAt: stringOr(candidate.generatedAt, new Date().toISOString()),
    laborRules: Array.isArray(candidate.laborRules) ? candidate.laborRules : [],
    items
  };
}

function matchBomItem(item: BomItem, source: DealerPriceSource): PriceMatch {
  const numbers = extractNumbers(item.baseSpec ?? item.spec);
  const first = numbers[0];
  const second = numbers[1];
  const normalizedName = normalizeMaterialLabel(item.name);

  if (item.materialKey === "brassBall" || item.name === "球节点" || item.name === "黄铜球") {
    return exact(source, "brassBall", undefined, item);
  }

  if (item.materialKey === "expansionSet" || item.name === "膨胀螺丝") {
    const found = findSourceItem(source, "expansionSet");
    const kitPrice = found ? numericPrice(found) : null;
    if (!found || kitPrice == null) return fallback(item, "报价表缺少膨胀套件单价。");
    return {
      unitPrice: Math.round((kitPrice / 2) * 100) / 100,
      status: "sourceFormula",
      sourceRows: [found.sourceRow],
      note: "生产 BOM 按每根钢管 2 颗螺丝统计；报价按 2 颗螺丝 = 1 套膨胀套件折算。"
    };
  }

  if (item.name === "脚垫" || item.name === "调平脚垫") {
    return exact(source, "glide", undefined, item);
  }

  if (item.name.includes("脚轮")) {
    return exact(source, "caster", undefined, item);
  }

  if ((item.name.endsWith("钢管") || item.name.endsWith("电镀管")) && Number.isFinite(first)) {
    return exact(source, "tube304", `19*${tubeDimension(first)}`, item);
  }

  if ((item.materialKey === "panel.perforated" || item.name === "洞洞板") && Number.isFinite(first) && Number.isFinite(second)) {
    return exact(source, "panel.perforated", `${panelSpec(first, second)}（洞洞板）`, item);
  }

  if (
    (item.materialKey === "panel.fourRowHole" || normalizedName === "扣板(四排孔)" || normalizedName === "扣板(四边孔)")
    && Number.isFinite(first)
    && Number.isFinite(second)
  ) {
    return exact(source, "panel.fourRowHole", `${panelSpec(first, second)}（四排孔）`, item);
  }

  if (["金属扣板", "扣板", "金属背板", "顶板", "底板", "外板", "内板"].includes(item.name) && Number.isFinite(first) && Number.isFinite(second)) {
    return exact(source, "panel", panelSpec(first, second), item);
  }

  if ((item.name === "门板" || item.name === "下翻门") && Number.isFinite(first) && Number.isFinite(second)) {
    return exact(source, "doorPanel", panelSpec(first, second), item);
  }

  if (item.name === "下翻门铰链") {
    return exact(source, "dropDoorHinge", undefined, item);
  }

  if (item.name === "一元锁") {
    return exact(source, "coinLockBox", undefined, item);
  }

  if (item.name === "锁盒+螺丝") {
    const found = findSourceItem(source, "coinLockBox");
    return {
      unitPrice: 0,
      status: "sourceIncluded",
      sourceRows: found ? [found.sourceRow] : [],
      note: found ? "已包含在一元锁+锁盒套价中。" : "已包含在一元锁套价中。"
    };
  }

  if (item.name === "下翻门组件" && Number.isFinite(first) && Number.isFinite(second)) {
    return composite(source, item, [
      ["doorPanel", panelSpec(first, second), 1],
      ["dropDoorHinge", undefined, 2],
      ["coinLockBox", undefined, 1]
    ], "按报价表拆为门板 + 下翻门铰链*2 + 一元锁+锁盒。");
  }

  if (item.name === "上翻门组件" && Number.isFinite(first) && Number.isFinite(second)) {
    return composite(source, item, [
      ["doorPanel", panelSpec(first, second), 1],
      ["panelDoorPivotSet", undefined, 1],
      ["coinLockBox", undefined, 1]
    ], "报价表未单列上翻门组件，暂按门板 + 扣板门转 + 一元锁+锁盒计。");
  }

  if (item.name === "玻璃门组件" && Number.isFinite(first) && Number.isFinite(second)) {
    return composite(source, item, [
      ["glass", undefined, squareMeters(first, second)],
      ["glassDoorPivotSet", undefined, 1],
      ["glassHandle", undefined, 1]
    ], "按报价表拆为玻璃面积 + 玻璃门转 + 玻璃拉手。");
  }

  if ((item.name === "玻璃板" || item.name === "玻璃搁板") && Number.isFinite(first) && Number.isFinite(second)) {
    const directSpecs = [dimensionSpec(first, second), panelSpec(first, second)];
    for (const spec of [...new Set(directSpecs)]) {
      const found = findSourceItem(source, "glass", spec);
      const price = found ? numericPrice(found) : null;
      if (found && price != null) {
        return {
          unitPrice: price,
          status: "sourceExact",
          sourceRows: [found.sourceRow],
          note: `${found.name}${found.spec ? ` ${found.spec}` : ""}`
        };
      }
    }
    return formula(source, "glass", squareMeters(first, second), item, "玻璃按平方米计价。");
  }

  if (item.materialKey === "shelfPanel" || ["固定搁板", "固定托盘", "固定层板", "层板"].includes(item.name)) {
    return exact(source, "shelfPanel", undefined, item);
  }

  if (item.materialKey === "tray" || ["托盘", "展示托盘", "移动托盘"].includes(item.name)) {
    return exact(source, "tray", undefined, item);
  }

  if (item.name === "抽屉盒组件") {
    return exact(source, "drawer", undefined, item);
  }

  return fallback(item, "报价表暂未匹配该 BOM 行，保留模型默认估算价。");
}

function exact(source: DealerPriceSource, canonicalName: string, spec: string | undefined, item: BomItem): PriceMatch {
  const found = findSourceItem(source, canonicalName, spec);
  if (!found) return fallback(item, spec ? `报价表缺少 ${canonicalName} ${spec}。` : `报价表缺少 ${canonicalName}。`);
  const price = numericPrice(found);
  if (price == null) return fallback(item, `${found.name} 使用公式价格，当前 BOM 行尚未展开公式。`);
  return {
    unitPrice: price,
    status: "sourceExact",
    sourceRows: [found.sourceRow],
    note: `${found.name}${found.spec ? ` ${found.spec}` : ""}`
  };
}

function formula(
  source: DealerPriceSource,
  canonicalName: string,
  multiplier: number,
  item: BomItem,
  note: string
): PriceMatch {
  const found = findSourceItem(source, canonicalName);
  const price = found ? numericPrice(found) : null;
  if (!found || price == null) return fallback(item, `报价表缺少公式材料 ${canonicalName}。`);
  return {
    unitPrice: Math.round(price * multiplier * 100) / 100,
    status: "sourceFormula",
    sourceRows: [found.sourceRow],
    note
  };
}

function composite(
  source: DealerPriceSource,
  item: BomItem,
  parts: Array<[canonicalName: string, spec: string | undefined, qty: number]>,
  note: string
): PriceMatch {
  let total = 0;
  const rows: number[] = [];

  for (const [canonicalName, spec, qty] of parts) {
    const found = findSourceItem(source, canonicalName, spec);
    const price = found ? numericPrice(found) : null;
    if (!found || price == null) {
      return fallback(item, `组合计价缺少 ${canonicalName}${spec ? ` ${spec}` : ""}。`);
    }
    total += price * qty;
    rows.push(found.sourceRow);
  }

  return {
    unitPrice: Math.round(total * 100) / 100,
    status: "sourceComposite",
    sourceRows: rows,
    note
  };
}

function fallback(item: BomItem, note: string): PriceMatch {
  return {
    unitPrice: item.unitPrice,
    status: "fallback",
    sourceRows: [],
    note
  };
}

function findSourceItem(source: DealerPriceSource, canonicalName: string, spec?: string) {
  const candidates = source.items.filter((item) => sourceCanonicalMatches(item, canonicalName));
  if (spec === undefined) {
    return candidates.find((item) => normalizeSourceSpec(item.spec) === "") ?? candidates[0];
  }

  const normalizedSpec = normalizeSourceSpec(spec);
  const exactMatch = candidates.find((item) => normalizeSourceSpec(item.spec) === normalizedSpec);
  if (exactMatch) return exactMatch;

  if (canonicalName === "panel.fourRowHole" || canonicalName === "panel.perforated") {
    const baseSpec = stripPanelVariant(normalizedSpec);
    return candidates.find((item) => stripPanelVariant(normalizeSourceSpec(item.spec)) === baseSpec);
  }

  return undefined;
}

function sourceCanonicalMatches(item: DealerPriceItem, canonicalName: string): boolean {
  if (item.canonicalName === canonicalName) return true;
  const normalizedSpec = normalizeSourceSpec(item.spec);
  if (canonicalName === "panel.fourRowHole") {
    return item.canonicalName === "panel" && normalizedSpec.includes("(四排孔)");
  }
  if (canonicalName === "panel.perforated") {
    return item.canonicalName === "panel" && normalizedSpec.includes("(洞洞板)");
  }
  return false;
}

function normalizeSourceSpec(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/四边孔/g, "四排孔")
    .replace(/毫米/g, "mm")
    .replace(/\s+/g, "")
    .replace(/[x×]/g, "*")
    .replace(/mm/g, "")
    .replace(/\(四排孔\)/g, "(四排孔)")
    .replace(/\(洞洞板\)/g, "(洞洞板)");
  const dimensions = normalized.match(/^(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)(.*)$/);
  if (!dimensions) return normalized;
  const values = [Number(dimensions[1]), Number(dimensions[2])].sort((left, right) => right - left);
  return `${values[0]}*${values[1]}${dimensions[3]}`;
}

function stripPanelVariant(value: string): string {
  return value.replace(/\((?:四排孔|洞洞板)\)/g, "");
}

function normalizeMaterialLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

function numericPrice(item: DealerPriceItem): number | null {
  return typeof item.unitPrice === "number" ? item.unitPrice : null;
}

function extractNumbers(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function panelSpec(a: number, b: number): string {
  return [panelDimension(a), panelDimension(b)].sort((left, right) => right - left).join("*");
}

function dimensionSpec(a: number, b: number): string {
  return [Math.round(a), Math.round(b)].sort((left, right) => right - left).join("*");
}

function panelDimension(value: number): number {
  return PANEL_DIMENSION_BY_NOMINAL.get(Math.round(value)) ?? Math.max(1, Math.round(value - 15));
}

function tubeDimension(value: number): number {
  return TUBE_DIMENSION_BY_NOMINAL.get(Math.round(value)) ?? Math.max(1, Math.round(value - 18));
}

function squareMeters(widthMm: number, heightMm: number): number {
  return (widthMm * heightMm) / 1_000_000;
}

function normalizeDealerPriceItem(input: unknown, index: number): DealerPriceItem | null {
  const item = input as Partial<DealerPriceItem> | null;
  if (!item || typeof item !== "object") return null;
  const canonicalName = stringOr(item.canonicalName, "");
  if (!canonicalName) return null;
  const unitPrice = typeof item.unitPrice === "number" || typeof item.unitPrice === "string" ? item.unitPrice : 0;
  return {
    sourceRow: Number(item.sourceRow) || index + 1,
    page: Number(item.page) || 0,
    name: stringOr(item.name, canonicalName),
    canonicalName,
    spec: stringOr(item.spec, ""),
    unit: stringOr(item.unit, "件"),
    unitPrice,
    pricingRule: typeof item.pricingRule === "string" ? item.pricingRule : null,
    note: stringOr(item.note, "")
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
