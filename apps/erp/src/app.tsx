import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppShell } from "./components/shell";
import { LoadingBlock } from "./components/ui";
import { useAuth } from "./context/auth";
import { WorkspaceProvider } from "./context/workspace";
import type { Permission } from "./types";
import { DashboardPage } from "./pages/dashboard";
import { DealersPage } from "./pages/dealers";
import { EmployeesPage } from "./pages/employees";
import { LoginPage } from "./pages/login";
import { NotFoundPage } from "./pages/not-found";
import { OrderDetailPage } from "./pages/order-detail";
import { OrdersPage } from "./pages/orders";
import { PricingPage } from "./pages/pricing";
import { PriceListDetailPage } from "./pages/price-list-detail";
import { ProductionPage } from "./pages/production";
import { ProjectsPage } from "./pages/projects";
import { QuotesPage } from "./pages/quotes";
import { TemplatesPage } from "./pages/templates";
import { InventoryPage, InventoryLedgerPage, InventoryInboundPage, InventoryOutboundPage } from "./pages/inventory";
import { LoginLogsPage } from "./pages/login-logs";
import { OrganizationEntitlementsPage } from "./pages/organization-entitlements";

function ProtectedLayout() {
  const { session, initializing } = useAuth();
  if (initializing) return <main className="app-loading"><LoadingBlock label="正在验证会话" /></main>;
  if (!session) return <Navigate to="/login" replace />;
  return <WorkspaceProvider><AppShell /></WorkspaceProvider>;
}

function PermissionRoute({ permission, dependencies = [], children }: { permission: Permission; dependencies?: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) && dependencies.every((dependency) => can(dependency)) ? children : <Navigate to="/" replace />;
}

function AnyPermissionRoute({ permissions, children }: { permissions: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  return permissions.some((permission) => can(permission)) ? children : <Navigate to="/" replace />;
}

function PlatformAdminRoute({ children }: { children: ReactNode }) {
  const { isPlatformAdmin } = useAuth();
  return isPlatformAdmin ? children : <Navigate to="/" replace />;
}

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<PermissionRoute permission="projects.view"><ProjectsPage /></PermissionRoute>} />
      <Route path="templates" element={<PermissionRoute permission="templates.view"><TemplatesPage /></PermissionRoute>} />
      <Route path="quotes" element={<PermissionRoute permission="quotes.view"><QuotesPage /></PermissionRoute>} />
      <Route path="orders" element={<PermissionRoute permission="orders.view"><OrdersPage /></PermissionRoute>} />
      <Route path="orders/:orderId/:tab?" element={<PermissionRoute permission="orders.view"><OrderDetailPage /></PermissionRoute>} />
      <Route path="production" element={<PermissionRoute permission="fulfillment.production.view"><ProductionPage /></PermissionRoute>} />
      <Route path="dealers" element={<PermissionRoute permission="dealer.manage"><DealersPage /></PermissionRoute>} />
      <Route path="employees" element={<AnyPermissionRoute permissions={["account.manage", "permission.delegate"]}><EmployeesPage /></AnyPermissionRoute>} />
      <Route path="pricing" element={<PermissionRoute permission="prices.master.view"><PricingPage /></PermissionRoute>} />
      <Route path="pricing/:priceListId" element={<PermissionRoute permission="prices.master.view"><PriceListDetailPage /></PermissionRoute>} />
      <Route path="inventory" element={<PermissionRoute permission="inventory.availability.view"><InventoryPage /></PermissionRoute>} />
      <Route path="inventory/ledger" element={<PermissionRoute permission="inventory.quantity.view" dependencies={["inventory.availability.view"]}><InventoryLedgerPage /></PermissionRoute>} />
      <Route path="inventory/inbound" element={<PermissionRoute permission="inventory.receive" dependencies={["inventory.availability.view"]}><InventoryInboundPage /></PermissionRoute>} />
      <Route path="inventory/outbound" element={<PermissionRoute permission="inventory.issue" dependencies={["inventory.availability.view"]}><InventoryOutboundPage /></PermissionRoute>} />
      <Route path="settings/entitlements" element={<PermissionRoute permission="platform.entitlements.manage"><OrganizationEntitlementsPage /></PermissionRoute>} />
      <Route path="settings/login-logs" element={<PlatformAdminRoute><LoginLogsPage /></PlatformAdminRoute>} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
