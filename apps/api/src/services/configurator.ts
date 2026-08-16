import { buildBom, getDimensions, validateProductionConfig, type CabinetConfig } from "../../../../src/model.js";
import {
  DEFAULT_DEALER_PRICE_SOURCE,
  estimatePricedBom,
  priceBomItems,
  type DealerPriceSource,
  type PricedBomItem
} from "../../../../src/pricing.js";
import { AppError } from "../errors.js";

export interface ServerDesignCalculation {
  configSnapshot: Record<string, unknown>;
  bomSnapshot: Array<Record<string, unknown>>;
  pricingSnapshot: Record<string, unknown>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function recalculateDesignSnapshot(
  configSnapshot: Record<string, unknown>
): ServerDesignCalculation {
  try {
    const config = clone(configSnapshot) as unknown as CabinetConfig;
    const bom = buildBom(config);
    const pricedBom = priceBomItems(bom);
    const productionValidation = validateProductionConfig(config);
    const dimensions = getDimensions(config);
    return {
      configSnapshot: {
        ...clone(configSnapshot),
        // Preserve the physical envelope confirmed in the designer with the frozen configuration.
        frozenOuterDimensions: {
          width: dimensions.outerWidth,
          height: dimensions.outerHeight,
          depth: dimensions.outerDepth
        }
      },
      bomSnapshot: clone(pricedBom as unknown as Array<Record<string, unknown>>),
      pricingSnapshot: {
        sourceId: DEFAULT_DEALER_PRICE_SOURCE.id,
        sourceTitle: DEFAULT_DEALER_PRICE_SOURCE.title,
        dealerName: DEFAULT_DEALER_PRICE_SOURCE.dealerName,
        currency: DEFAULT_DEALER_PRICE_SOURCE.currency,
        calculatedAt: new Date().toISOString(),
        totalMajor: estimatePricedBom(pricedBom),
        serverCalculated: true,
        productionValidation: clone(productionValidation)
      }
    };
  } catch (error) {
    throw new AppError(422, "VALIDATION_ERROR", "The configurator snapshot is not buildable", {
      cause: error instanceof Error ? error.message : "Unknown configurator error"
    });
  }
}

export function buildCanonicalBom(configSnapshot: Record<string, unknown>): Array<Record<string, unknown>> {
  try {
    const config = clone(configSnapshot) as unknown as CabinetConfig;
    return clone(buildBom(config) as unknown as Array<Record<string, unknown>>);
  } catch (error) {
    throw new AppError(422, "VALIDATION_ERROR", "The configurator snapshot is not buildable", {
      cause: error instanceof Error ? error.message : "Unknown configurator error"
    });
  }
}

export function repriceServerBom(
  bomSnapshot: Array<Record<string, unknown>>,
  priceSource?: DealerPriceSource
): PricedBomItem[] {
  try {
    const canonicalBom = bomSnapshot.map((line) => ({
      materialKey: String(line.materialKey ?? `legacy.${stableToken(String(line.name ?? ""))}`),
      specKey: String(line.specKey ?? stableToken(String(line.baseSpec ?? line.spec ?? "standard"))),
      category: normalizeCategory(line.category),
      name: String(line.name ?? ""),
      spec: String(line.spec ?? ""),
      baseSpec: typeof line.baseSpec === "string" ? line.baseSpec : undefined,
      color: typeof line.color === "string" ? line.color : undefined,
      qty: Number(line.qty ?? 0),
      unit: String(line.unit ?? "件"),
      unitPrice: 0
    }));
    return priceBomItems(canonicalBom, priceSource);
  } catch (error) {
    throw new AppError(422, "VALIDATION_ERROR", "The saved BOM snapshot cannot be priced", {
      cause: error instanceof Error ? error.message : "Unknown pricing error"
    });
  }
}

function normalizeCategory(value: unknown): "frame" | "panel" | "door" | "interior" | "glass" | "hardware" {
  return ["frame", "panel", "door", "interior", "glass", "hardware"].includes(String(value))
    ? value as "frame" | "panel" | "door" | "interior" | "glass" | "hardware"
    : "hardware";
}

function stableToken(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s*[x×*]\s*/g, "x").replace(/[^a-z0-9.\-\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "standard";
}
