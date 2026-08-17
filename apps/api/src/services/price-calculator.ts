import type { ServerPriceCalculator, ServerPriceResult } from "@usm/domain";
import type { PriceList, PriceListItem } from "@usm/contracts";
import type { Repository } from "../repository.js";
import { repriceServerBom } from "./configurator.js";
import {
  DEFAULT_DEALER_PRICE_SOURCE,
  priceBomItems,
  type DealerPriceItem,
  type DealerPriceSource
} from "../../../../src/pricing.js";

const STATUS_MAP = {
  sourceExact: "priced",
  sourceComposite: "priced",
  sourceFormula: "priced",
  sourceIncluded: "included",
  fallback: "unmatched"
} as const;

const GLASS_QUOTE_DIMENSIONS = [160, 235, 335, 380, 485, 735] as const;

export class ConfiguratorPriceCalculator implements ServerPriceCalculator {
  constructor(private readonly priceSource?: DealerPriceSource, private readonly priceItems: PriceListItem[] = []) {}

  async priceBomLine(line: Record<string, unknown>, _currency: string): Promise<ServerPriceResult> {
    const [priced] = repriceServerBom([line], this.priceSource);
    const quantity = Number.isFinite(priced.qty) && priced.qty > 0 ? priced.qty : 0;
    const exactItem = findExactDirectItem(this.priceItems, priced.materialKey, priced.specKey, priced.baseSpec);
    const standardItem = !exactItem && (priced.priceStatus === "fallback" || priced.materialKey === "expansionSet")
      ? findStandardDirectItem(this.priceItems, priced.materialKey)
      : undefined;
    const directItem = exactItem ?? standardItem;
    const unitPriceMinor = resolveUnitPriceMinor(priced, directItem);
    return {
      sourceRef: String(line.materialCode ?? line.code ?? `${priced.name}:${priced.baseSpec}`),
      description: [priced.name, priced.spec, priced.color].filter(Boolean).join(" / "),
      quantity,
      unitPriceMinor,
      pricingStatus: directItem ? (directItem.pricingMethod === "included" ? "included" : "priced") : STATUS_MAP[priced.priceStatus],
      metadata: {
        materialKey: priced.materialKey,
        specKey: priced.specKey,
        category: priced.category,
        unit: priced.unit,
        sourceRows: priced.priceSourceRows,
        sourceLabel: priced.priceSourceLabel,
        sourceStatus: priced.priceStatus,
        note: priced.priceNote
      }
    };
  }
}

export interface DynamicPricingLine {
  materialKey: string;
  specKey: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  dealerLineTotalMinor: number | null;
  pricingStatus: "priced" | "included" | "unmatched";
}

export interface DynamicPricingResult {
  status: "priced" | "pending";
  currency: string;
  priceList: Pick<PriceList, "id" | "version" | "effectiveFrom"> | null;
  retailTotalMinor: number | null;
  dealer: { settlementRatePercent: number; purchaseTotalMinor: number } | null;
  lines: DynamicPricingLine[];
  unmatched: string[];
}

export async function calculatePublishedPrice(input: {
  repository: Repository;
  pricingTenantId: string;
  organizationId?: string;
  market: string;
  currency: string;
  bom: Array<Record<string, unknown>>;
}): Promise<DynamicPricingResult> {
  const priceList = await input.repository.getActivePriceList(input.pricingTenantId, input.market, input.currency);
  if (!priceList) return { status: "pending", currency: input.currency, priceList: null, retailTotalMinor: null, dealer: null, lines: [], unmatched: ["NO_ACTIVE_PRICE_LIST"] };
  const items = await input.repository.listPriceListItems(input.pricingTenantId, priceList.id);
  const source = toDealerPriceSource(priceList, items);
  const pricedBom = priceBomItems(input.bom as never[], source);
  const lines = pricedBom.map((priced) => {
    const exactItem = findExactDirectItem(items, priced.materialKey, priced.specKey, priced.baseSpec);
    const standardItem = !exactItem && (priced.priceStatus === "fallback" || priced.materialKey === "expansionSet")
      ? findStandardDirectItem(items, priced.materialKey)
      : undefined;
    const directItem = exactItem ?? standardItem;
    const unitPriceMinor = resolveUnitPriceMinor(priced, directItem);
    return {
      materialKey: priced.materialKey,
      specKey: priced.specKey,
      category: priced.category,
      description: [priced.name, priced.spec, priced.color].filter(Boolean).join(" / "),
      quantity: Number.isFinite(priced.qty) && priced.qty > 0 ? priced.qty : 0,
      unit: priced.unit,
      unitPriceMinor,
      lineTotalMinor: Math.max(0, Math.round(priced.qty * unitPriceMinor)),
      dealerLineTotalMinor: null,
      pricingStatus: directItem ? (directItem.pricingMethod === "included" ? "included" as const : "priced" as const) : STATUS_MAP[priced.priceStatus]
    };
  });
  const unmatched = lines.filter((line) => line.pricingStatus === "unmatched").map((line) => `${line.materialKey}:${line.specKey}`);
  if (unmatched.length) return { status: "pending", currency: priceList.currency, priceList: pickPriceList(priceList), retailTotalMinor: null, dealer: null, lines, unmatched };
  const retailTotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const dealerRecord = input.organizationId ? await input.repository.getDealerForOrganization(input.organizationId) : null;
  if (dealerRecord?.status !== "active") {
    return { status: "priced", currency: priceList.currency, priceList: pickPriceList(priceList), retailTotalMinor, dealer: null, lines, unmatched: [] };
  }

  const allocation = allocateDealerLineTotals(lines.map((line) => line.lineTotalMinor), dealerRecord.settlementRatePercent);
  const dealerLines = lines.map((line, index) => ({ ...line, dealerLineTotalMinor: allocation.lineTotalsMinor[index] ?? 0 }));
  return {
    status: "priced",
    currency: priceList.currency,
    priceList: pickPriceList(priceList),
    retailTotalMinor,
    dealer: {
      settlementRatePercent: dealerRecord.settlementRatePercent,
      purchaseTotalMinor: allocation.purchaseTotalMinor
    },
    lines: dealerLines,
    unmatched: []
  };
}

export function allocateDealerLineTotals(
  retailLineTotalsMinor: number[],
  settlementRatePercent: number
): { purchaseTotalMinor: number; lineTotalsMinor: number[] } {
  const normalizedRate = Math.min(100, Math.max(0, settlementRatePercent));
  const normalizedLines = retailLineTotalsMinor.map((amount) => Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0);
  const retailTotalMinor = normalizedLines.reduce((sum, amount) => sum + amount, 0);
  const purchaseTotalMinor = Math.round(retailTotalMinor * normalizedRate / 100);
  const lineTotalsMinor = normalizedLines.map((amount) => Math.round(amount * normalizedRate / 100));
  let lastPricedLineIndex = -1;
  for (let index = normalizedLines.length - 1; index >= 0; index -= 1) {
    if (normalizedLines[index] > 0) {
      lastPricedLineIndex = index;
      break;
    }
  }

  if (lastPricedLineIndex >= 0) {
    const allocatedTotalMinor = lineTotalsMinor.reduce((sum, amount) => sum + amount, 0);
    lineTotalsMinor[lastPricedLineIndex] += purchaseTotalMinor - allocatedTotalMinor;
  }

  return { purchaseTotalMinor, lineTotalsMinor };
}

function pickPriceList(priceList: PriceList): Pick<PriceList, "id" | "version" | "effectiveFrom"> {
  return { id: priceList.id, version: priceList.version, effectiveFrom: priceList.effectiveFrom };
}

function findExactDirectItem(items: PriceListItem[], materialKey: string, specKey: string, baseSpec?: string): PriceListItem | undefined {
  const specKeys = new Set([normalizeSpecKey(specKey), ...factorySpecAliases(materialKey, baseSpec ?? specKey)]);
  return items.find((item) => item.materialKey === materialKey && specKeys.has(normalizeSpecKey(item.specKey)) && isDirectPricingMethod(item));
}

function findStandardDirectItem(items: PriceListItem[], materialKey: string): PriceListItem | undefined {
  return items.find((item) => item.materialKey === materialKey && item.specKey === "standard" && isDirectPricingMethod(item));
}

function isDirectPricingMethod(item: PriceListItem): boolean {
  return item.pricingMethod === "fixed" || item.pricingMethod === "included";
}

export function toDealerPriceSource(priceList: PriceList, items: PriceListItem[]): DealerPriceSource {
  return {
    schemaVersion: 1,
    id: priceList.id,
    dealerName: priceList.name,
    title: `${priceList.code} ${priceList.version}`,
    currency: priceList.currency,
    generatedAt: priceList.publishedAt ?? priceList.updatedAt,
    laborRules: [],
    items: items.map((item, index): DealerPriceItem => ({
      sourceRow: Number(item.sourceRef?.match(/^source-row:(\d+)$/)?.[1]) || index + 1,
      page: 0,
      name: item.name,
      canonicalName: item.materialKey,
      spec: item.specification,
      unit: item.unit,
      unitPrice: item.pricingMethod === "included"
        ? 0
        : item.retailUnitPriceMinor === null
          ? ""
          : item.retailUnitPriceMinor / 100,
      pricingRule: ruleLabel(item),
      note: item.note
    }))
  };
}

function ruleLabel(item: PriceListItem): string | null {
  if (item.pricingMethod === "fixed" || item.pricingMethod === "included") return null;
  const value = item.pricingRule?.expression ?? item.pricingRule?.type ?? item.pricingMethod;
  return String(value);
}

export function buildLegacyPriceCatalog(): Array<{
  materialKey: string;
  specKey: string;
  category: PriceListItem["category"];
  name: string;
  specification: string;
  unit: string;
  pricingMethod: PriceListItem["pricingMethod"];
  retailUnitPriceMinor: number | null;
  pricingRule: Record<string, unknown> | null;
  note: string;
  sourceRef: string;
}> {
  const catalog = DEFAULT_DEALER_PRICE_SOURCE.items.map((item) => {
    const materialKey = legacyMaterialKey(item.canonicalName, item.spec);
    const specification = materialKey === item.canonicalName ? item.spec : stripPanelVariant(item.spec);
    return {
      materialKey,
      specKey: normalizeSpecKey(specification),
      category: categoryForMaterial(materialKey),
      name: item.name,
      specification,
      unit: item.unit,
      pricingMethod: item.pricingRule && typeof item.unitPrice !== "number" ? "formula" as const : "fixed" as const,
      retailUnitPriceMinor: typeof item.unitPrice === "number" ? Math.round(item.unitPrice * 100) : null,
      pricingRule: item.pricingRule && typeof item.unitPrice !== "number" ? { expression: item.pricingRule } : null,
      note: item.note,
      sourceRef: `source-row:${item.sourceRow}`
    };
  });
  const glassRate = DEFAULT_DEALER_PRICE_SOURCE.items.find((item) => item.canonicalName === "glass" && !item.spec.trim());
  const glassRatePerSquareMeter = typeof glassRate?.unitPrice === "number" ? glassRate.unitPrice : null;
  const existingKeys = new Set(catalog.map((item) => `${item.materialKey}\u0000${item.specKey}`));
  const glassRows = GLASS_QUOTE_DIMENSIONS.flatMap((longSide, longIndex) => (
    GLASS_QUOTE_DIMENSIONS.slice(0, longIndex + 1).map((shortSide) => {
      const specification = `${longSide} × ${shortSide} mm`;
      const specKey = normalizeSpecKey(`${longSide}*${shortSide}`);
      return {
        materialKey: "glass",
        specKey,
        category: "glass" as const,
        name: "玻璃板",
        specification,
        unit: "块",
        pricingMethod: "fixed" as const,
        retailUnitPriceMinor: glassRatePerSquareMeter === null
          ? null
          : Math.round(glassRatePerSquareMeter * (longSide + 15) * (shortSide + 15) / 1_000_000 * 100),
        pricingRule: null,
        note: "玻璃板按规格单独报价；初始值由玻璃方价折算，颜色不参与价格键",
        sourceRef: "generated:glass-price-spec"
      };
    })
  )).filter((item) => !existingKeys.has(`${item.materialKey}\u0000${item.specKey}`));
  return [...catalog, ...glassRows];
}

function normalizeSpecKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s*[x×*]\s*/g, "x").replace(/\s+/g, "-").replace(/[^a-z0-9.\-\u4e00-\u9fff]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "standard";
}

function factorySpecAliases(materialKey: string, value: string): string[] {
  const numbers = (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (materialKey === "tube304" && numbers.length >= 1) {
    const length = Math.max(1, Math.round(numbers[numbers.length - 1] - 18));
    return [normalizeSpecKey(`19*${length}`)];
  }
  if (materialKey === "glass" && numbers.length >= 2) {
    return [15, 20].map((allowance) => {
      const dimensions = numbers.slice(0, 2).map((number) => Math.max(1, Math.round(number - allowance))).sort((left, right) => right - left);
      return normalizeSpecKey(dimensions.join("*"));
    });
  }
  if (!["panel", "panel.fourRowHole", "panel.perforated", "doorPanel", "shelfPanel", "tray"].includes(materialKey) || numbers.length < 2) return [];
  const dimensions = numbers.slice(0, 2).map((number) => Math.max(1, Math.round(number - 15))).sort((left, right) => right - left);
  return [normalizeSpecKey(dimensions.join("*"))];
}

function categoryForMaterial(materialKey: string): PriceListItem["category"] {
  if (["tube201", "tube304", "spliceOvalTube", "brassBall"].includes(materialKey)) return "frame";
  if (["panel", "panel.fourRowHole", "panel.perforated"].includes(materialKey)) return "panel";
  if (["doorPanel", "dropDoorHinge", "coinLockBox", "keyLockBox", "glassDoorPivotSet", "panelDoorPivotSet"].includes(materialKey)) return "door";
  if (["glass", "glassHandle", "glassClip"].includes(materialKey)) return "glass";
  if (["shelfPanel", "tray", "drawer"].includes(materialKey)) return "interior";
  return "hardware";
}

function resolveUnitPriceMinor(
  priced: { materialKey: string; unit: string; spec: string; baseSpec: string; unitPrice: number },
  directItem?: PriceListItem
): number {
  if (directItem?.pricingMethod === "included") return 0;
  const unitPriceMinor = directItem?.retailUnitPriceMinor ?? Math.max(0, Math.round(priced.unitPrice * 100));
  if (!directItem || !isExpansionScrewLine(priced) || isIndividualScrewUnit(directItem.unit)) return unitPriceMinor;
  return Math.max(0, Math.round(unitPriceMinor / 2));
}

function isExpansionScrewLine(priced: { materialKey: string; unit: string; spec: string; baseSpec: string }): boolean {
  if (priced.materialKey !== "expansionSet") return false;
  const lineDescription = `${priced.baseSpec} ${priced.spec}`.normalize("NFKC");
  return isIndividualScrewUnit(priced.unit) || /2\s*\u9897\s*[/／]\s*\u6839\u94a2\u7ba1/.test(lineDescription);
}

function isIndividualScrewUnit(unit: string): boolean {
  return unit.normalize("NFKC").trim() === "\u9897";
}

function legacyMaterialKey(materialKey: string, specification: string): string {
  if (materialKey !== "panel") return materialKey;
  const normalized = specification.normalize("NFKC").replace(/\s+/g, "");
  if (/\u56db(?:\u6392|\u8fb9)\u5b54/.test(normalized)) return "panel.fourRowHole";
  if (/\u6d1e\u6d1e\u677f/.test(normalized)) return "panel.perforated";
  return materialKey;
}

function stripPanelVariant(specification: string): string {
  return specification
    .normalize("NFKC")
    .replace(/[（(]?\s*(?:\u56db(?:\u6392|\u8fb9)\u5b54|\u6d1e\u6d1e\u677f)\s*[）)]?/g, "")
    .trim();
}
