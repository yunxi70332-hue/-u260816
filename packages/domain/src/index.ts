import type {
  Design,
  DesignVersion,
  OrderStatus,
  QuoteLine,
  QuoteStatus
} from "@usm/contracts";

export class InvalidTransitionError extends Error {
  constructor(
    readonly entityType: "quote" | "order",
    readonly from: string,
    readonly to: string
  ) {
    super(`Cannot transition ${entityType} from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const QUOTE_TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  draft: ["priced", "submitted", "cancelled"],
  priced: ["draft", "submitted", "sent", "cancelled"],
  submitted: ["approved", "changes_requested", "cancelled"],
  changes_requested: ["submitted", "draft", "cancelled"],
  approved: ["customer_confirmed", "changes_requested", "cancelled"],
  customer_confirmed: ["converted", "changes_requested", "cancelled"],
  converted: [],
  sent: ["accepted", "rejected", "expired", "cancelled"],
  accepted: ["converted", "cancelled"],
  rejected: ["draft", "changes_requested", "cancelled"],
  expired: ["draft", "cancelled"],
  cancelled: []
};

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["ready_for_production", "on_hold", "cancelled"],
  // Legacy statuses remain readable so existing records can be migrated safely.
  technical_review: ["ready_for_production", "on_hold", "cancelled"],
  ready_for_production: ["in_production", "on_hold", "cancelled"],
  in_production: ["ready_to_ship", "on_hold", "cancelled"],
  ready_to_ship: ["shipped", "on_hold", "cancelled"],
  shipped: [],
  delivered: [],
  completed: [],
  on_hold: ["confirmed", "cancelled"],
  cancelled: []
};

export function allowedQuoteTransitions(status: QuoteStatus): readonly QuoteStatus[] {
  return QUOTE_TRANSITIONS[status];
}

export function transitionQuote(from: QuoteStatus, to: QuoteStatus): QuoteStatus {
  if (!QUOTE_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError("quote", from, to);
  }
  return to;
}

export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[status];
}

export function transitionOrder(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError("order", from, to);
  }
  return to;
}

export interface ServerPriceResult {
  sourceRef: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  pricingStatus: "priced" | "included" | "unmatched";
  metadata?: Record<string, unknown>;
}

export interface ServerPriceCalculator {
  priceBomLine(line: Record<string, unknown>, currency: string): Promise<ServerPriceResult>;
}

export interface QuoteCalculation {
  lines: QuoteLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export async function recalculateQuote(input: {
  bomSnapshot: Array<Record<string, unknown>>;
  currency: string;
  discountMinor: number;
  taxRateBasisPoints: number;
  calculator: ServerPriceCalculator;
  createId: () => string;
}): Promise<QuoteCalculation> {
  const lines: QuoteLine[] = [];

  for (const bomLine of input.bomSnapshot) {
    const priced = await input.calculator.priceBomLine(clone(bomLine), input.currency);
    const quantity = Number.isFinite(priced.quantity) && priced.quantity > 0 ? priced.quantity : 0;
    const unitPriceMinor = Math.max(0, Math.round(priced.unitPriceMinor));
    lines.push({
      id: input.createId(),
      sourceRef: priced.sourceRef,
      description: priced.description,
      quantity,
      unitPriceMinor,
      lineTotalMinor: Math.round(quantity * unitPriceMinor),
      pricingStatus: priced.pricingStatus,
      metadata: clone(priced.metadata ?? {})
    });
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const discountMinor = Math.min(subtotalMinor, Math.max(0, Math.round(input.discountMinor)));
  const taxableMinor = subtotalMinor - discountMinor;
  const taxMinor = Math.round(taxableMinor * input.taxRateBasisPoints / 10000);

  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: taxableMinor + taxMinor,
    currency: input.currency.toUpperCase()
  };
}

export function snapshotDesignDraft(design: Design, input: {
  id: string;
  version: number;
  createdBy: string;
  createdAt: string;
  note?: string;
}): DesignVersion {
  return {
    id: input.id,
    tenantId: design.tenantId,
    designId: design.id,
    version: input.version,
    sourceDraftRevision: design.draftRevision,
    configSnapshot: clone(design.configSnapshot),
    bomSnapshot: clone(design.bomSnapshot),
    pricingSnapshot: clone(design.pricingSnapshot),
    note: input.note ?? null,
    createdBy: input.createdBy,
    createdAt: input.createdAt
  };
}

export function createQuoteSnapshot(input: {
  designVersion: DesignVersion;
  calculation: QuoteCalculation;
  calculatedAt: string;
  previewDataUrl?: string;
}): Record<string, unknown> {
  return clone({
    schemaVersion: 1,
    calculatedAt: input.calculatedAt,
    previewDataUrl: input.previewDataUrl ?? null,
    designVersion: input.designVersion,
    calculation: input.calculation
  });
}

export function createOrderSnapshot(input: {
  quote: Record<string, unknown>;
  acceptedAt: string;
  previewDataUrl?: string;
}): Record<string, unknown> {
  const snapshot = {
    schemaVersion: 1,
    acceptedAt: input.acceptedAt,
    quote: clone(input.quote)
  };
  if (input.previewDataUrl) {
    const currentQuoteSnapshot = snapshot.quote.snapshot;
    const quoteSnapshot = currentQuoteSnapshot && typeof currentQuoteSnapshot === "object" && !Array.isArray(currentQuoteSnapshot)
      ? currentQuoteSnapshot as Record<string, unknown>
      : {};
    snapshot.quote.snapshot = { ...quoteSnapshot, previewDataUrl: input.previewDataUrl };
  }
  return clone(snapshot);
}
