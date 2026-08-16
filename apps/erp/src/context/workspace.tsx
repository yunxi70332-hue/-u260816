import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoEmployees, demoOrderDetails, demoWorkspace } from "../demo-data";
import { api, ApiError } from "../lib/api";
import { createClientId } from "../lib/id";
import { calculateDeliveryDate } from "../lib/delivery-date";
import type { CreateShipmentInput, CustomerProject, Dealer, Order, OrderDetail, OrderFollowUp, OrderStatus, PriceList, ProductionStatus, Quote, QuoteStatus, Shipment, WorkspaceData } from "../types";
import { useAuth } from "./auth";

type DataSource = "live" | "demo" | "fallback";

interface WorkspaceContextValue extends WorkspaceData {
  loading: boolean;
  dataSource: DataSource;
  warning: string | null;
  refresh: () => Promise<void>;
  getOrderDetail: (orderId: string) => Promise<OrderDetail | null>;
  transitionOrder: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  updateOrderDeliverySchedule: (orderId: string, deliveryLeadTimeDays: number) => Promise<OrderDetail | null>;
  transitionQuote: (quoteId: string, nextStatus: QuoteStatus) => Promise<void>;
  createOrderFromQuote: (quoteId: string) => Promise<Order | null>;
  updateProduction: (orderId: string, nextStatus: ProductionStatus) => Promise<void>;
  createShipment: (input: CreateShipmentInput) => Promise<Shipment>;
  assignOrder: (orderId: string, ownerUserId: string | null) => Promise<void>;
  getOrderFollowUps: (orderId: string) => Promise<OrderFollowUp[]>;
  addOrderFollowUp: (orderId: string, input: { content: string; nextFollowUpAt?: string | null }) => Promise<OrderFollowUp>;
  addProject: (project: CustomerProject) => void;
  addDealer: (dealer: Pick<Dealer, "name" | "region" | "phone" | "email" | "level" | "discountRate"> & { password: string }) => Promise<void>;
  addPriceList: (priceList: PriceList) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const cloneDemo = (): WorkspaceData => structuredClone(demoWorkspace);
const emptyWorkspace = (): WorkspaceData => ({ projects: [], templates: [], quotes: [], orders: [], dealers: [], priceLists: [], audits: [] });

const orderActions: Partial<Record<OrderStatus, string>> = {
  "已确认": "confirmed",
  "待生产": "ready_for_production",
  "生产中": "in_production",
  "待发货": "ready_to_ship",
  "已发货": "shipped",
  "暂停": "on_hold",
  "已取消": "cancelled"
};

const quoteActions: Partial<Record<QuoteStatus, string>> = {
  "待审批": "submitted",
  "需修改": "changes_requested",
  "已批准": "approved",
  "已发送": "sent",
  "客户已确认": "customer_confirmed",
  "已接受": "accepted",
  "已转订单": "converted",
  "已失效": "expired"
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [data, setData] = useState<WorkspaceData>(() => session?.mode === "demo" ? cloneDemo() : emptyWorkspace());
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>(session?.mode === "live" ? "live" : "demo");
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    if (session.mode === "demo") {
      setData(cloneDemo());
      setDataSource("demo");
      setWarning(null);
      return;
    }
    setData(emptyWorkspace());
    setLoading(true);
    try {
      const ordersScope = session.dataScopes?.orders?.scope;
      const live = await api.loadWorkspace(session.activeTenantId, {
        ordersOnly: ordersScope === "own" || ordersScope === "assigned"
      });
      setData(live);
      setDataSource("live");
      setWarning(null);
    } catch (error) {
      setData(emptyWorkspace());
      setDataSource("fallback");
      setWarning(error instanceof ApiError ? `${error.message} 未显示演示数据，请稍后重试。` : "工作区加载失败，未显示演示数据，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  const getOrderDetail = useCallback(async (orderId: string) => {
    if (!session) return null;
    if (session.mode === "live") {
      try { return await api.getOrder(orderId, session.activeTenantId); } catch { return null; }
    }
    const detail = demoOrderDetails[orderId];
    const current = data.orders.find((order) => order.id === orderId);
    return detail && current ? { ...detail, ...current } : detail ?? null;
  }, [data.orders, session]);

  const transitionOrder = useCallback(async (orderId: string, nextStatus: OrderStatus) => {
    const current = data.orders.find((order) => order.id === orderId);
    if (!current || !session) return;
    if (session.mode === "live" && orderActions[nextStatus]) {
      await api.transitionOrder(orderId, orderActions[nextStatus]!, session.activeTenantId, current.version);
      await refresh();
      return;
    }
    setData((workspace) => ({
      ...workspace,
      orders: workspace.orders.map((order) => order.id === orderId ? { ...order, status: nextStatus, version: order.version + 1 } : order)
    }));
  }, [data.orders, refresh, session]);

  const updateOrderDeliverySchedule = useCallback(async (orderId: string, deliveryLeadTimeDays: number) => {
    if (!session) return null;
    const current = data.orders.find((order) => order.id === orderId);
    const source = current ?? await getOrderDetail(orderId);
    if (!source) throw new ApiError("订单不存在或无法读取当前版本。", 404, "NOT_FOUND");
    if (session.mode === "live") {
      const detail = await api.updateOrderDeliverySchedule(orderId, deliveryLeadTimeDays, session.activeTenantId, source.version);
      await refresh();
      return detail;
    }
    const detail = await getOrderDetail(orderId);
    if (!detail) throw new ApiError("订单详情不存在，暂不能调整交付计划。", 404, "NOT_FOUND");
    const customerConfirmedAt = detail.customerConfirmedAt ?? (Number.isNaN(new Date(detail.createdAt).getTime()) ? null : detail.createdAt);
    if (!customerConfirmedAt) throw new ApiError("客户确认时间缺失，暂不能计算交付日期。", 409, "VALIDATION_ERROR");
    const dueDate = calculateDeliveryDate(customerConfirmedAt, deliveryLeadTimeDays) ?? "-";
    const updated: OrderDetail = { ...detail, customerConfirmedAt, deliveryLeadTimeDays, dueDate, version: detail.version + 1 };
    setData((workspace) => ({
      ...workspace,
      orders: workspace.orders.some((order) => order.id === orderId)
        ? workspace.orders.map((order) => order.id === orderId ? updated : order)
        : [updated, ...workspace.orders]
    }));
    return updated;
  }, [data.orders, getOrderDetail, refresh, session]);

  const transitionQuote = useCallback(async (quoteId: string, nextStatus: QuoteStatus) => {
    const current = data.quotes.find((quote) => quote.id === quoteId);
    if (!current || !session) return;
    if (session.mode === "live" && quoteActions[nextStatus]) {
      await api.transitionQuote(quoteId, quoteActions[nextStatus]!, session.activeTenantId, current.version);
      await refresh();
      return;
    }
    setData((workspace) => ({
      ...workspace,
      quotes: workspace.quotes.map((quote) => quote.id === quoteId ? { ...quote, status: nextStatus, version: quote.version + 1 } : quote)
    }));
  }, [data.quotes, refresh, session]);

  const createOrderFromQuote = useCallback(async (quoteId: string) => {
    const quote = data.quotes.find((item) => item.id === quoteId);
    if (!quote || !session) return null;
    if (session.mode === "live") {
      const order = await api.createOrderFromQuote(quoteId, session.activeTenantId);
      await refresh();
      return order;
    }
    const customerConfirmedAt = new Date().toISOString();
    const deliveryLeadTimeDays = 30;
    const order: Order = { id: createClientId(), orderNo: `SO-DEMO-${String(data.orders.length + 1).padStart(3, "0")}`, acceptedQuoteId: quote.id, customer: quote.customer, project: quote.project, dealer: "直营", owner: quote.owner, amount: quote.amount, status: "待确认", productionStatus: "未排产", shipmentStatus: "未创建", dueDate: calculateDeliveryDate(customerConfirmedAt, deliveryLeadTimeDays) ?? "-", customerConfirmedAt, deliveryLeadTimeDays, createdAt: customerConfirmedAt, version: 1 };
    setData((workspace) => ({ ...workspace, quotes: workspace.quotes.map((item) => item.id === quoteId ? { ...item, status: "已转订单", version: item.version + 1 } : item), orders: [order, ...workspace.orders] }));
    return order;
  }, [data.orders.length, data.quotes, refresh, session]);

  const updateProduction = useCallback(async (orderId: string, nextStatus: ProductionStatus) => {
    const current = data.orders.find((order) => order.id === orderId);
    if (!current || !session) return;
    if (session.mode === "live") {
      const nextOrderStatus: OrderStatus = nextStatus === "已完工" ? "待发货" : "生产中";
      if (current.status !== nextOrderStatus) {
        await api.transitionOrder(orderId, orderActions[nextOrderStatus]!, session.activeTenantId, current.version);
        await refresh();
      }
      return;
    }
    setData((workspace) => ({
      ...workspace,
      orders: workspace.orders.map((order) => order.id === orderId ? { ...order, status: nextStatus === "已完工" ? "待发货" : "生产中", productionStatus: nextStatus, version: order.version + 1 } : order)
    }));
  }, [data.orders, refresh, session]);

  const createShipment = useCallback(async (input: CreateShipmentInput) => {
    if (!session) throw new ApiError("请先登录后再创建发运单。", 401, "UNAUTHORIZED");
    if (session.mode === "live") {
      const shipment = await api.createShipment(input, session.activeTenantId);
      await refresh();
      return shipment;
    }
    const shipment: Shipment = { id: createClientId(), shipmentNo: `SHP-DEMO-${Date.now()}`, carrier: input.carrier, trackingNo: input.trackingNo, status: "运输中", packages: input.packages, shippedAt: input.shippedAt ?? "刚刚" };
    setData((workspace) => ({ ...workspace, orders: workspace.orders.map((order) => order.id === input.orderId ? { ...order, status: "已发货", shipmentStatus: "运输中", version: order.version + 1 } : order) }));
    return shipment;
  }, [refresh, session]);

  const assignOrder = useCallback(async (orderId: string, ownerUserId: string | null) => {
    if (!session) throw new ApiError("请先登录后再分配订单。", 401, "UNAUTHORIZED");
    if (session.mode === "live") {
      await api.assignOrder(orderId, ownerUserId, session.activeTenantId);
      await refresh();
      return;
    }
    setData((workspace) => ({
      ...workspace,
      orders: workspace.orders.map((order) => order.id === orderId
        ? { ...order, ownerUserId, owner: demoEmployees.find((employee) => employee.userId === ownerUserId)?.name ?? "未分配", assignedAt: new Date().toISOString(), version: order.version + 1 }
        : order)
    }));
  }, [refresh, session]);

  const getOrderFollowUps = useCallback(async (orderId: string) => {
    if (!session) return [];
    if (session.mode === "live") return api.getOrderFollowUps(orderId, session.activeTenantId);
    return [];
  }, [session]);

  const addOrderFollowUp = useCallback(async (orderId: string, input: { content: string; nextFollowUpAt?: string | null }) => {
    if (!session) throw new ApiError("请先登录后再添加跟进。", 401, "UNAUTHORIZED");
    if (session.mode === "live") return api.createOrderFollowUp(orderId, input, session.activeTenantId);
    return {
      id: createClientId(),
      orderId,
      employeeUserId: session.user.id,
      employeeName: session.user.name,
      content: input.content,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      createdAt: new Date().toISOString()
    };
  }, [session]);

  const addProject = useCallback((project: CustomerProject) => setData((workspace) => ({ ...workspace, projects: [project, ...workspace.projects] })), []);
  const addDealer = useCallback(async (dealer: Pick<Dealer, "name" | "region" | "phone" | "email" | "level" | "discountRate"> & { password: string }) => {
    if (session?.mode === "live") {
      const created = await api.createDealer(dealer, session.activeTenantId);
      setData((workspace) => ({ ...workspace, dealers: [created, ...workspace.dealers] }));
      return;
    }
    const id = createClientId();
    setData((workspace) => ({ ...workspace, dealers: [{ ...dealer, contact: dealer.name, id, code: `DLR-CN-${id.slice(0, 8).toUpperCase()}`, status: "启用", lastActiveAt: "尚未登录" }, ...workspace.dealers] }));
  }, [session]);
  const addPriceList = useCallback(async (priceList: PriceList) => {
    if (session?.mode === "live") {
      const created = await api.createPriceList(priceList, session.activeTenantId);
      setData((workspace) => ({ ...workspace, priceLists: [created, ...workspace.priceLists] }));
      return;
    }
    setData((workspace) => ({ ...workspace, priceLists: [priceList, ...workspace.priceLists] }));
  }, [session]);

  const value = useMemo(() => ({ ...data, loading, dataSource, warning, refresh, getOrderDetail, transitionOrder, updateOrderDeliverySchedule, transitionQuote, createOrderFromQuote, updateProduction, createShipment, assignOrder, getOrderFollowUps, addOrderFollowUp, addProject, addDealer, addPriceList }), [data, loading, dataSource, warning, refresh, getOrderDetail, transitionOrder, updateOrderDeliverySchedule, transitionQuote, createOrderFromQuote, updateProduction, createShipment, assignOrder, getOrderFollowUps, addOrderFollowUp, addProject, addDealer, addPriceList]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
