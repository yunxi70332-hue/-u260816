import { erpRequest } from "./erp/api";
import type { BomCategory, CabinetConfig } from "./model";

export interface ServerPriceLine {
  materialKey: string;
  specKey: string;
  category: BomCategory;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  dealerLineTotalMinor: number | null;
  pricingStatus: "priced" | "included" | "unmatched";
}

interface PricingCalculationBase {
  currency: "CNY";
  priceList: {
    id: string;
    version: string;
    effectiveFrom: string;
  } | null;
  lines: ServerPriceLine[];
  unmatched: string[];
}

export type PricingCalculation = PricingCalculationBase & ({
  status: "priced";
  retailTotalMinor: number;
  salesMultiplierBasisPoints: number | null;
  multiplierQuoteTotalMinor: number | null;
  dealer: {
    settlementRatePercent: number;
    purchaseTotalMinor: number;
  } | null;
} | {
  status: "pending";
  retailTotalMinor: null;
  salesMultiplierBasisPoints: number | null;
  multiplierQuoteTotalMinor: null;
  dealer: null;
});

export type PricingState =
  | { status: "loading" }
  | { status: "priced"; data: Extract<PricingCalculation, { status: "priced" }> }
  | { status: "pending"; data: Extract<PricingCalculation, { status: "pending" }>; message: string }
  | { status: "error"; message: string };

export async function calculateConfigurationPrice(
  configSnapshot: CabinetConfig,
  salesMultiplierBasisPoints?: number,
  signal?: AbortSignal
): Promise<PricingCalculation> {
  return erpRequest<PricingCalculation>("/api/pricing/calculate", {
    method: "POST",
    signal,
    body: JSON.stringify({
      configSnapshot,
      market: "中国大陆",
      currency: "CNY",
      ...(salesMultiplierBasisPoints ? { salesMultiplierBasisPoints } : {})
    })
  });
}
