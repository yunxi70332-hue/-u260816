import { createHash, randomBytes, randomUUID } from "node:crypto";

export type PortalMilestone = "opened" | "first_generated" | "config_changed" | "saved" | "exported" | "consultation_submitted";

export interface PortalConfig {
  tenantId: string;
  enabled: boolean;
  slug: string;
  defaultTemplateId: string | null;
  visibleModules: string[];
  signupCodeHash: string | null;
  updatedAt: string;
}

export interface PortalCustomer {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface PortalEvent {
  id: string;
  tenantId: string;
  customerId: string;
  designId: string;
  milestone: PortalMilestone;
  configSnapshot: Record<string, unknown> | null;
  moduleId?: string;
  createdAt: string;
}

export interface PortalDraft {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  configSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const configs = new Map<string, PortalConfig>();
const customers = new Map<string, PortalCustomer>();
const sessions = new Map<string, { customerId: string; tenantId: string; expiresAt: number }>();
const events: PortalEvent[] = [];
const drafts = new Map<string, PortalDraft>();

export function hashPortalSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function now() { return new Date().toISOString(); }

export function getPortalConfig(tenantId: string): PortalConfig {
  const existing = configs.get(tenantId);
  if (existing) return structuredClone(existing);
  const config: PortalConfig = { tenantId, enabled: false, slug: `portal-${tenantId}`, defaultTemplateId: null, visibleModules: [], signupCodeHash: null, updatedAt: now() };
  configs.set(tenantId, config);
  return structuredClone(config);
}

export function updatePortalConfig(tenantId: string, patch: Partial<Omit<PortalConfig, "tenantId" | "updatedAt">>): PortalConfig {
  const current = getPortalConfig(tenantId);
  const slug = String(patch.slug ?? current.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `portal-${tenantId}`;
  for (const existing of configs.values()) {
    if (existing.tenantId !== tenantId && existing.slug === slug) throw new Error("PORTAL_SLUG_EXISTS");
  }
  const next = { ...current, ...patch, slug, updatedAt: now() };
  configs.set(tenantId, next);
  return structuredClone(next);
}

export function findPortalBySlug(slug: string): PortalConfig | null {
  const needle = slug.trim().toLowerCase();
  for (const config of configs.values()) if (config.slug === needle) return structuredClone(config);
  return null;
}

export function createPortalCustomer(tenantId: string, email: string, password: string): PortalCustomer {
  const normalized = email.trim().toLowerCase();
  const existing = [...customers.values()].find((customer) => customer.tenantId === tenantId && customer.email === normalized);
  if (existing) throw new Error("PORTAL_EMAIL_EXISTS");
  const customer: PortalCustomer = { id: `pc_${randomUUID()}`, tenantId, email: normalized, passwordHash: hashPortalSecret(password), createdAt: now() };
  customers.set(customer.id, customer);
  return structuredClone(customer);
}

export function findPortalCustomer(tenantId: string, email: string): PortalCustomer | null {
  const normalized = email.trim().toLowerCase();
  const found = [...customers.values()].find((customer) => customer.tenantId === tenantId && customer.email === normalized);
  return found ? structuredClone(found) : null;
}

export function createPortalSession(customer: PortalCustomer): string {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { customerId: customer.id, tenantId: customer.tenantId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  return token;
}

export function getPortalSession(token: string | undefined): { customer: PortalCustomer; tenantId: string } | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(token); return null; }
  const customer = customers.get(session.customerId);
  return customer ? { customer: structuredClone(customer), tenantId: session.tenantId } : null;
}

export function recordPortalEvent(input: Omit<PortalEvent, "id" | "createdAt">): PortalEvent {
  const event: PortalEvent = { ...input, id: randomUUID(), createdAt: now() };
  events.push(structuredClone(event));
  return structuredClone(event);
}

export function listPortalEvents(tenantId: string): PortalEvent[] {
  return events.filter((event) => event.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((event) => structuredClone(event));
}

export function savePortalDraft(input: Omit<PortalDraft, "id" | "createdAt" | "updatedAt"> & { id?: string }): PortalDraft {
  const stamp = now();
  const existing = input.id ? drafts.get(input.id) : undefined;
  const draft: PortalDraft = { id: existing?.id ?? input.id ?? `pd_${randomUUID()}`, tenantId: input.tenantId, customerId: input.customerId, name: input.name, configSnapshot: structuredClone(input.configSnapshot), createdAt: existing?.createdAt ?? stamp, updatedAt: stamp };
  drafts.set(draft.id, draft);
  return structuredClone(draft);
}

export function listPortalDrafts(tenantId: string, customerId?: string): PortalDraft[] {
  return [...drafts.values()].filter((draft) => draft.tenantId === tenantId && (!customerId || draft.customerId === customerId)).map((draft) => structuredClone(draft));
}
