// 9012 is commonly claimed by local device software. Keep the designer pointed
// at the ERP development gateway used by the local workspace instead.
const DEFAULT_ERP_PORT = "9014";
const DEFAULT_ERP_APP_PATH = "/erp";

export interface ErpSession {
  user: {
    id: string;
    name: string;
    email?: string;
    username?: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
    type?: "hq" | "dealer";
    organizationType?: "hq" | "dealer";
  };
  permissions?: string[];
}

export interface SalesPricingPreference {
  salesMultiplierBasisPoints: number;
  source: "user_default" | "system_default";
  updatedAt?: string | null;
}

export interface ErpTemplate {
  id: string;
  code: string;
  name: string;
  category: string;
  tags: string[];
  thumbnailUrl?: string;
  version: number;
  configSnapshot: unknown;
  estimatedPrice?: number;
}

export interface ErpCustomer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
}

export interface ErpProject {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName?: string;
  status?: string;
}

export interface ErpDesignContext {
  designId: string;
  designCode: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  draftRevision: number;
  updatedAt?: string;
}

export interface ErpQuoteWorkflow {
  id: string;
  code: string;
  projectId: string;
  status: string;
  totalMinor: number;
  basePriceTotalMinor?: number | null;
  salesMultiplierBasisPoints?: number | null;
  multiplierQuoteTotalMinor?: number | null;
  revision: number;
  updatedAt?: string;
}

export interface ErpOrderWorkflow {
  id: string;
  orderNo: string;
  projectId: string;
  acceptedQuoteId?: string | null;
  status: string;
  updatedAt?: string;
}

interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
}

export class ErpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ErpApiError";
  }
}

export function getErpBaseUrl() {
  const configured = import.meta.env.VITE_ERP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const handoffUrl = getHandoffErpUrl();
  if (handoffUrl) return handoffUrl;
  if (typeof window === "undefined") return `http://127.0.0.1:${DEFAULT_ERP_PORT}`;
  if (import.meta.env.PROD) return window.location.origin;
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_ERP_PORT}`;
}

function getHandoffErpUrl(): string | null {
  if (typeof window === "undefined") return null;
  const port = Number(new URLSearchParams(window.location.search).get("erpPort"));
  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? `${window.location.protocol}//${window.location.hostname}:${port}`
    : null;
}

export function getErpLoginUrl(returnTo = window.location.href) {
  const url = new URL(withErpAppPath("/login"), getErpBaseUrl());
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function getErpAppUrl(path = "/") {
  return new URL(withErpAppPath(path), getErpBaseUrl()).toString();
}

function withErpAppPath(path: string) {
  const configured = import.meta.env.VITE_ERP_APP_PATH?.trim();
  if (!configured && !import.meta.env.PROD) return ensureLeadingSlash(path);

  const appPath = ensureLeadingSlash(configured || DEFAULT_ERP_APP_PATH).replace(/\/$/, "");
  const suffix = path === "/" ? "/" : ensureLeadingSlash(path);
  return `${appPath}${suffix}`;
}

function ensureLeadingSlash(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

export async function erpRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  const response = await fetch(new URL(path, getErpBaseUrl()), {
    ...options,
    headers,
    credentials: "include"
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    const envelope = asRecord(body);
    const error = asRecord(envelope?.error) ?? envelope;
    throw new ErpApiError(
      stringValue(error?.message) ?? `ERP 请求失败 (${response.status})`,
      response.status,
      stringValue(error?.code),
      error?.details
    );
  }
  return body as T;
}

export async function getSalesPricingPreference(): Promise<SalesPricingPreference> {
  const payload = await erpRequest<unknown>("/api/me/sales-pricing-preferences");
  return unwrapItem<SalesPricingPreference>(payload);
}

export async function saveSalesPricingPreference(salesMultiplierBasisPoints: number): Promise<SalesPricingPreference> {
  const payload = await erpRequest<unknown>("/api/me/sales-pricing-preferences", {
    method: "PUT",
    body: JSON.stringify({ salesMultiplierBasisPoints })
  });
  return unwrapItem<SalesPricingPreference>(payload);
}

export function unwrapItem<T>(value: unknown): T {
  const record = asRecord(value);
  return (record && "item" in record ? record.item : value) as T;
}

export function unwrapItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const record = asRecord(value);
  if (Array.isArray(record?.items)) return record.items as T[];
  if (Array.isArray(record?.data)) return record.data as T[];
  return [];
}

export function createIdempotencyKey(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 204) return undefined;
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text } : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
