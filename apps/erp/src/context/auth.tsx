import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { demoTenants } from "../demo-data";
import type { Permission, Session } from "../types";

const DEMO_SESSION_KEY = "usm-erp-demo-session";

const permissionAliases: Record<string, string[]> = {
  "dashboard.view": ["reports.personal.view", "reports.organization.view"],
  "project.manage": ["projects.update"],
  "template.manage": ["templates.view"],
  "quote.manage": ["quotes.update"],
  "quote.approve": ["quotes.approve"],
  "order.manage": ["orders.status.update"],
  "production.manage": ["fulfillment.production.update"],
  "dealer.manage": ["dealer.manage"],
  "pricing.manage": ["prices.manage"],
  "employee.manage": ["account.manage"],
  "order.assign": ["orders.assign"],
  "order.follow-up": ["orders.follow_up"],
  "order.transition.manage": ["orders.status.update"],
  "order.delivery.manage": ["fulfillment.logistics.update"],
  "audit.view": ["audit.view"]
};

const demoPermissions: Permission[] = [
  "platform.entitlements.manage",
  "reports.organization.view", "projects.view", "projects.create", "projects.update", "templates.view",
  "quotes.view", "quotes.create", "quotes.update", "quotes.approve", "quotes.multiplier.view", "quotes.multiplier.manage", "prices.retail.view", "orders.view", "orders.create",
  "orders.status.update", "orders.assign", "orders.follow_up", "orders.export", "fulfillment.production.view",
  "fulfillment.production.update", "fulfillment.logistics.update", "dealer.manage", "prices.master.view",
  "prices.manage", "audit.view", "account.manage", "inventory.availability.view", "inventory.quantity.view",
  "inventory.distribution.view", "inventory.value.view", "inventory.receive", "inventory.issue",
  "inventory.adjust", "inventory.transfer"
];

interface AuthContextValue {
  session: Session | null;
  initializing: boolean;
  loginError: string | null;
  login: (account: string, password: string) => Promise<void>;
  enterDemo: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readDemoSession(): Session | null {
  try {
    const value = localStorage.getItem(DEMO_SESSION_KEY);
    return value ? JSON.parse(value) as Session : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readDemoSession());
  const [initializing, setInitializing] = useState(!session);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.mode === "demo") return;
    let cancelled = false;
    api.getSession()
      .then((current) => {
        if (!cancelled) setSession(current);
      })
      .catch(() => {
        // The login screen remains usable when the API is offline.
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (account: string, password: string) => {
    setLoginError(null);
    try {
      const next = await api.signIn(account, password);
      localStorage.removeItem(DEMO_SESSION_KEY);
      setSession(next);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "登录失败，请稍后重试。";
      setLoginError(message);
      throw error;
    }
  }, []);

  const enterDemo = useCallback(() => {
    const demoSession: Session = {
      user: { id: "demo-admin", name: "林乔", email: "demo@usm.local", role: "admin" },
      tenants: demoTenants,
      activeTenantId: demoTenants[0].id,
      permissions: demoPermissions,
      effectivePermissions: demoPermissions,
      enabledModules: ["warehouse"],
      fieldPolicy: { price: "none", inventory: "value" },
      mode: "demo"
    };
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSession));
    setLoginError(null);
    setSession(demoSession);
  }, []);

  const logout = useCallback(async () => {
    const wasLive = session?.mode === "live";
    localStorage.removeItem(DEMO_SESSION_KEY);
    setSession(null);
    setLoginError(null);
    if (wasLive) {
      try { await api.signOut(); } catch { /* Local logout still succeeds. */ }
    }
  }, [session?.mode]);

  const refreshSession = useCallback(async () => {
    if (session?.mode === "demo") return;
    setSession(await api.getSession(session?.activeTenantId));
  }, [session?.activeTenantId, session?.mode]);

  const switchTenant = useCallback(async (tenantId: string) => {
    if (!session || !session.tenants.some((tenant) => tenant.id === tenantId) || session.activeTenantId === tenantId) return;
    if (session.mode === "demo") {
      const next = { ...session, activeTenantId: tenantId };
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return;
    }

    const next = await api.getSession(tenantId);
    if (!next) throw new ApiError("The selected organization is not available.", 403, "FORBIDDEN");
    const tenants = [...session.tenants];
    for (const tenant of next.tenants) {
      if (!tenants.some((item) => item.id === tenant.id)) tenants.push(tenant);
    }
    setSession({ ...next, tenants, activeTenantId: tenantId });
  }, [session]);

  const can = useCallback((permission: Permission) => {
    if (!session) return false;
    const granted = new Set(session.effectivePermissions ?? session.permissions ?? []);
    if (granted.has(permission)) return true;
    return (permissionAliases[permission] ?? []).some((candidate) => granted.has(candidate));
  }, [session]);

  const value = useMemo(() => ({ session, initializing, loginError, login, enterDemo, logout, refreshSession, switchTenant, can }), [session, initializing, loginError, login, enterDemo, logout, refreshSession, switchTenant, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
