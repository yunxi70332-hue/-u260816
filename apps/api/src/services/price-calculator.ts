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

export class ConfiguratorPriceCalculator implements ServerPriceCalculator {
  constructor(private readonly priceSource?: DealerPriceSource, private readonly priceItems: PriceListItem[] = []) {}

  async priceBomLine(line: Record<string, unknown>, _currency: string): Promise<ServerPriceResult> {
    const [priced] = repriceServerBom([line], this.priceSource);
    const quantity = Number.isFinite(priced.qty) && priced.qty > 0 ? priced.qty : 0;
    const exactItem = findExactDirectItem(this.priceItems, priced.materialKey, priced.specKey);
    const standardItem = priced.priceStatus === "fallback" && !exactItem
      ? findStandardDirectItem(this.priceItems, priced.materialKey)
      : undefined;
    const directItem = exactItem ?? standardItem;
    const unitPriceMinor = directItem?.pricingMethod === "included" ? 0 : directItem?.retailUnitPriceMinor ?? Math.max(0, Math.round(priced.unitPrice * 100));
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
    const exactItem = findExactDirectItem(items, priced.materialKey, priced.specKey);
    const standardItem = priced.priceStatus === "fallback" && !exactItem
      ? findStandardDirectItem(items, priced.materialKey)
      : undefined;
    const directItem = exactItem ?? standardItem;
    const unitPriceMinor = directItem?.pricingMethod === "included" ? 0 : directItem?.retailUnitPriceMinor ?? Math.max(0, Math.round(priced.unitPrice * 100));
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

function findExactDirectItem(items: PriceListItem[], materialKey: string, specKey: string): PriceListItem | undefined {
  return items.find((item) => item.materialKey === materialKey && item.specKey === specKey && isDirectPricingMethod(item));
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
      sourceRow: Number(item.sourceRef?.match(/\d+/)?.[0]) || index + 1,
      page: 0,
      name: item.name,
      canonicalName: item.materialKey,
      spec: item.specification,
      unit: item.unit,
      unitPrice: item.pricingMethod === "included" ? 0 : (item.retailUnitPriceMinor ?? 0) / 100,
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
  return DEFAULT_DEALER_PRICE_SOURCE.items.map((item) => ({
    materialKey: item.canonicalName,
    specKey: normalizeSpecKey(item.spec),
    category: categoryForMaterial(item.canonicalName),
    name: item.name,
    specification: item.spec,
    unit: item.unit,
    pricingMethod: item.pricingRule && typeof item.unitPrice !== "number" ? "formula" : "fixed",
    retailUnitPriceMinor: typeof item.unitPrice === "number" ? Math.round(item.unitPrice * 100) : null,
    pricingRule: item.pricingRule && typeof item.unitPrice !== "number" ? { expression: item.pricingRule } : null,
    note: item.note,
    sourceRef: `source-row:${item.sourceRow}`
  }));
}

function normalizeSpecKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s*[x×*]\s*/g, "x").replace(/\s+/g, "-").replace(/[^a-z0-9.\-\u4e00-\u9fff]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "standard";
}

function categoryForMaterial(materialKey: string): PriceListItem["category"] {
  if (["tube201", "tube304", "spliceOvalTube", "brassBall"].includes(materialKey)) return "frame";
  if (["panel"].includes(materialKey)) return "panel";
  if (["doorPanel", "dropDoorHinge", "coinLockBox", "keyLockBox", "glassDoorPivotSet", "panelDoorPivotSet"].includes(materialKey)) return "door";
  if (["glass", "glassHandle", "glassClip"].includes(materialKey)) return "glass";
  if (["shelfPanel", "tray", "drawer"].includes(materialKey)) return "interior";
  return "hardware";
}
