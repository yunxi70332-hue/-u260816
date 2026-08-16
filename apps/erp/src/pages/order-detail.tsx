import { ArrowLeft, Boxes, CalendarClock, Check, ClipboardList, Clock3, ExternalLink, FileClock, MapPin, MessageSquarePlus, PackageCheck, PauseCircle, Phone, PlayCircle, RotateCcw, Send, ShieldCheck, Truck, UserRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { EmptyState, FormActions, LoadingBlock, Modal, Notice, PageHeader, StatusBadge, stopSubmit } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api } from "../lib/api";
import { addCalendarDays, beijingDateKey, calendarDayDifference, calculateDeliveryDate, formatBeijingDateTime } from "../lib/delivery-date";
import type { InventoryRequirement, OrderDetail, OrderFollowUp, OrderStatus } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const tabs = [
  { id: "materials", label: "物料", icon: ClipboardList },
  { id: "overview", label: "概览", icon: ClipboardList },
  { id: "configuration", label: "配置", icon: Boxes },
  { id: "production", label: "生产", icon: PackageCheck },
  { id: "shipment", label: "发货", icon: Truck },
  { id: "follow-ups", label: "跟进", icon: MessageSquarePlus },
  { id: "audit", label: "操作记录", icon: ShieldCheck }
];

const nextOrderAction: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: typeof Check }>> = {
  "待确认": { status: "已确认", label: "确认订单", icon: Check },
  "已确认": { status: "待生产", label: "释放生产", icon: PackageCheck }
};

const pauseable = new Set<OrderStatus>(["已确认", "待生产", "生产中", "待发货"]);
const cancellable = new Set<OrderStatus>(["待确认", "已确认", "待生产", "生产中", "待发货", "暂停"]);

type OrderConfiguration = OrderDetail["configuration"];
type ConfigurationModule = OrderConfiguration["moduleItems"][number];

function colorStyle(color: string | undefined, variable: "--module-color" | "--swatch-color"): CSSProperties | undefined {
  return color ? { [variable]: color } as CSSProperties : undefined;
}

function moduleAccessories(module: ConfigurationModule) {
  return [
    module.frontAccessoryLabel,
    module.fittingLabel,
    ...module.interiorAccessories.map((accessory) => accessory.kindLabel)
  ].filter((value): value is string => Boolean(value));
}

function ConfigurationPreview({ configuration }: { configuration: OrderConfiguration }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [configuration.previewDataUrl]);
  const showCameraSnapshot = Boolean(configuration.previewDataUrl) && !previewFailed;
  const frontModules = new Map<string, ConfigurationModule>();
  [...configuration.moduleItems]
    .sort((left, right) => left.depthIndex - right.depthIndex)
    .forEach((module) => {
      const key = `${module.row}:${module.column}`;
      if (!frontModules.has(key)) frontModules.set(key, module);
    });
  const cells = Array.from({ length: configuration.rows * configuration.columns }, (_, index) => {
    const row = Math.floor(index / configuration.columns);
    const column = index % configuration.columns;
    return frontModules.get(`${row}:${column}`);
  });

  return <section className="panel config-preview-panel">
    <div className={`large-cabinet-preview${showCameraSnapshot ? " has-camera-snapshot" : ""}`}>
      {showCameraSnapshot ? <img
        className="cabinet-camera-snapshot"
        src={configuration.previewDataUrl ?? undefined}
        alt="下单时设计台 3D 相机冻结快照"
        onError={() => setPreviewFailed(true)}
      /> : <div className="cabinet-preview-stage">
        <div className="cabinet-frame" style={{ gridTemplateColumns: `repeat(${Math.max(configuration.columns, 1)}, minmax(64px, 1fr))` }} aria-label="前视配置网格">
          {cells.map((module, index) => module
            ? <div className={`cabinet-module${module.enabled ? "" : " is-disabled"}`} key={module.id} style={colorStyle(module.color, "--module-color")} />
            : <div className="cabinet-module is-empty" key={`empty-${index}`} />)}
        </div>
      </div>}
    </div>
  </section>;
}

function ConfigurationDetails({ configuration }: { configuration: OrderConfiguration }) {
  const specialParts = [
    ...configuration.moduleItems.flatMap((module) => [
      module.frontAccessoryLabel ? { id: `${module.id}-front`, name: module.frontAccessoryLabel, location: module.position, detail: module.color } : null,
      module.fittingLabel ? { id: `${module.id}-fitting`, name: module.fittingLabel, location: module.position, detail: module.color } : null,
      ...module.interiorAccessories.map((accessory) => ({ id: `${module.id}-${accessory.id}`, name: accessory.kindLabel, location: module.position, detail: accessory.color ?? module.color }))
    ].filter((part): part is { id: string; name: string; location: string; detail: string } => Boolean(part))),
    ...configuration.workSurfaces.filter((surface) => surface.enabled).map((surface) => ({ id: surface.id, name: surface.kindLabel, location: `第 ${surface.row + 1} 层 · 第 ${surface.fromColumn + 1}-${surface.toColumn + 1} 列`, detail: `${surface.width} × ${surface.depth} × ${surface.thickness} mm${surface.color ? ` · ${surface.color}` : ""}` }))
  ];

  return <div className="configuration-details-grid">
    <section className="panel config-data-panel">
      <header className="panel-header"><div><h2>全部颜色</h2><p>下单冻结快照中的所有实际使用颜色</p></div><span className="count-chip">{configuration.colors.length}</span></header>
      <div className="config-colors">
        {configuration.colors.map((color) => <article className="config-color-item" key={color.value}>
          <span className="config-color-swatch" style={colorStyle(color.value, "--swatch-color")} aria-hidden="true" />
          <div><strong>{color.name}</strong><span>{color.code || color.value}</span><small>{color.categories.join("、")} · {color.references} 处{color.bomQuantity !== undefined ? ` · BOM ${color.bomQuantity}` : ""}<br />{color.positions.join("、")}</small></div>
        </article>)}
      </div>
    </section>

    <section className="panel config-data-panel">
      <header className="panel-header"><div><h2>特殊部件</h2><p>门、抽屉、托盘、玻璃与工作台面</p></div><span className="count-chip">{specialParts.length}</span></header>
      {specialParts.length ? <div className="config-special-list">{specialParts.map((part) => <div className="config-special-row" key={part.id}><div><strong>{part.name}</strong><span>{part.location}</span></div><small>{part.detail}</small></div>)}</div> : <p className="config-special-empty">本配置未使用门、抽屉、托盘、玻璃或工作台面等特殊部件。</p>}
    </section>

    <section className="panel config-data-panel">
      <header className="panel-header"><div><h2>模块清单</h2><p>按层、列与深度段保留完整下单结构</p></div><span className="count-chip">{configuration.moduleItems.length}</span></header>
      <div className="config-module-list">
        {configuration.moduleItems.map((module) => {
          const accessories = moduleAccessories(module);
          const colorValues = [module.color, ...module.panelColors.map((panel) => panel.color)].filter((color, index, colors) => colors.indexOf(color) === index);
          const colorNames = colorValues.map((value) => configuration.colors.find((color) => color.value === value)?.name ?? value);
          return <div className="config-module-row" key={module.id}>
            <div className="config-module-position">{module.position}<br />深度段 {module.depthIndex + 1}</div>
            <div className="config-module-name"><span className="module-color-dot" style={colorStyle(module.color, "--swatch-color")} /><strong>{module.kindLabel}</strong></div>
            <div className="config-module-size">{module.width} × {module.height} × {module.depth} mm<br />{module.enabled ? "已启用" : "已停用"}</div>
            <div className="config-module-accessories">{accessories.length ? accessories.join("、") : "无附加部件"}<br />{colorNames.join(" / ")}</div>
          </div>;
        })}
      </div>
    </section>
  </div>;
}

export function OrderDetailPage() {
  const { orderId = "", tab } = useParams();
  const activeTab = tab || "overview";
  const { can, session } = useAuth();
  const { orders, audits, getOrderDetail, transitionOrder, updateOrderDeliverySchedule, updateProduction, createShipment, getOrderFollowUps, addOrderFollowUp } = useWorkspace();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [deliveryScheduleOpen, setDeliveryScheduleOpen] = useState(false);
  const [deliveryDaysDraft, setDeliveryDaysDraft] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<OrderFollowUp[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [materialRequirements, setMaterialRequirements] = useState<InventoryRequirement[]>([]);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialActionBusy, setMaterialActionBusy] = useState(false);
  const [materialWarehouses, setMaterialWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [materialWarehouseId, setMaterialWarehouseId] = useState("default");
  const [materialIssueQty, setMaterialIssueQty] = useState<Record<string, number>>({});
  const current = orders.find((order) => order.id === orderId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrderDetail(orderId).then((value) => { if (!cancelled) setDetail(value); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [getOrderDetail, orderId]);

  useEffect(() => {
    if (current) setDetail((value) => value ? { ...value, ...current } : value);
  }, [current]);

  useEffect(() => {
    if (activeTab !== "follow-ups" || !detail || !can("order.follow-up")) return;
    let cancelled = false;
    setFollowUpLoading(true);
    getOrderFollowUps(detail.id).then((items) => { if (!cancelled) setFollowUps(items); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "跟进记录加载失败。"); }).finally(() => { if (!cancelled) setFollowUpLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, can, detail, getOrderFollowUps]);

  useEffect(() => {
    if (activeTab !== "materials" || !detail || !can("inventory.availability.view")) return;
    let cancelled = false;
    setMaterialLoading(true);
    const fallback = detail.lines.map((line) => ({ id: line.id, orderId: detail.id, materialKey: line.sku, materialCode: line.sku, name: line.description, specification: line.color, unit: "件", requiredQty: line.qty, reservedQty: 0, issuedQty: 0, availableQty: null, status: "unreserved" as const }));
    const task = session?.mode === "demo" ? Promise.resolve(fallback) : api.getOrderMaterialRequirements(detail.id, session?.activeTenantId || "");
    task.then((items) => { if (!cancelled) setMaterialRequirements(items); }).catch((reason) => { if (!cancelled) { setMaterialRequirements(fallback); setError(reason instanceof Error ? reason.message : "物料需求加载失败"); } }).finally(() => { if (!cancelled) setMaterialLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, can, detail, session]);

  useEffect(() => {
    if (activeTab !== "materials" || !session || session.mode === "demo" || !can("inventory.issue")) {
      if (session?.mode === "demo") setMaterialWarehouses([{ id: "default", name: "主仓" }]);
      return;
    }
    let cancelled = false;
    api.listWarehouses(session.activeTenantId).then((items) => {
      if (cancelled) return;
      setMaterialWarehouses(items);
      if (items[0] && !items.some((item) => item.id === materialWarehouseId)) setMaterialWarehouseId(items[0].id);
    }).catch(() => { if (!cancelled) setMaterialWarehouses([]); });
    return () => { cancelled = true; };
  }, [activeTab, can, materialWarehouseId, session]);

  const lineTotal = useMemo(() => detail?.lines.reduce((sum, line) => sum + line.total, 0) ?? 0, [detail]);

  if (!tabs.some((item) => item.id === activeTab)) return <Navigate to={`/orders/${orderId}/overview`} replace />;
  if (loading) return <div className="page"><LoadingBlock label="正在读取订单快照" /></div>;
  if (!detail) return <div className="page"><Notice tone="danger">订单不存在或你无权访问该订单。</Notice><Link className="button secondary" to="/orders"><ArrowLeft size={16} />返回订单</Link></div>;

  const action = nextOrderAction[detail.status];
  const cancelledLifecycle = detail.status === "已取消";
  const pausedLifecycle = detail.status === "暂停";
  const deliveryLeadTimeDays = detail.deliveryLeadTimeDays ?? 30;
  const daysUntilDue = calendarDayDifference(beijingDateKey(), detail.dueDate);
  const deliverySignal = ["已发货", "已取消"].includes(detail.status)
    ? detail.status
    : daysUntilDue === null
      ? "日期待确认"
      : daysUntilDue < 0
        ? `已逾期 ${Math.abs(daysUntilDue)} 天`
        : daysUntilDue === 0
          ? "今日交付"
          : daysUntilDue <= 3
            ? `${daysUntilDue} 天内交付`
            : "按期推进";
  const deliveryTone = daysUntilDue !== null && daysUntilDue < 0
    ? "danger"
    : daysUntilDue !== null && daysUntilDue <= 3
      ? "warning"
      : "neutral";

  async function runTransition(status: OrderStatus) {
    setBusy(true); setError(null);
    try { await transitionOrder(detail!.id, status); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "状态更新失败"); }
    finally { setBusy(false); }
  }

  function openDeliverySchedule() {
    setDeliveryDaysDraft(deliveryLeadTimeDays);
    setDeliveryScheduleOpen(true);
  }

  async function submitDeliverySchedule(form: FormData) {
    const days = Number(form.get("deliveryLeadTimeDays"));
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("交付周期需填写 1–365 天。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOrderDeliverySchedule(detail!.id, days);
      if (!updated) throw new Error("订单交付计划未保存，请刷新订单后重试。");
      setDetail(updated);
      setDeliveryScheduleOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "交付计划保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function runProduction(next: "组装" | "已完工") {
    setBusy(true); setError(null);
    try {
      await updateProduction(detail!.id, next);
      const refreshed = await getOrderDetail(detail!.id);
      if (refreshed) setDetail(refreshed);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生产状态更新失败"); }
    finally { setBusy(false); }
  }

  async function submitShipment(form: FormData) {
    setBusy(true); setError(null);
    try {
      const shippedAt = String(form.get("shippedAt") || "");
      await createShipment({ orderId: detail!.id, carrier: String(form.get("carrier")), trackingNo: String(form.get("trackingNo")), packages: Number(form.get("packages")) || 1, shippedAt: shippedAt ? new Date(shippedAt).toISOString() : undefined });
      const refreshed = await getOrderDetail(detail!.id);
      if (refreshed) setDetail(refreshed);
      setShipmentOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发运单创建失败"); }
    finally { setBusy(false); }
  }

  async function submitFollowUp(form: FormData) {
    if (!detail) return;
    const content = String(form.get("content") ?? "").trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const nextFollowUpAt = String(form.get("nextFollowUpAt") ?? "").trim();
      const created = await addOrderFollowUp(detail.id, { content, nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null });
      setFollowUps((items) => [created, ...items]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "跟进记录保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function runMaterialAction(action: "reserve" | "issue") {
    if (!detail || !session || !can("inventory.issue")) return;
    const lines = materialRequirements
      .map((item) => {
        const remaining = Math.max(0, item.requiredQty - (action === "reserve" ? item.reservedQty : item.issuedQty));
        const requested = action === "issue" && materialIssueQty[item.id] !== undefined ? Math.min(remaining, Math.max(0, Number(materialIssueQty[item.id]) || 0)) : remaining;
        return { item, quantity: requested };
      })
      .filter((line) => line.quantity > 0)
      .map(({ item, quantity }) => ({ materialId: item.materialId, materialKey: item.materialKey, specKey: item.specKey || item.specification || "standard", color: item.color || undefined, finish: item.finish || undefined, quantity }));
    if (!lines.length) return;
    setMaterialActionBusy(true); setError(null);
    try {
      const next = session.mode === "demo"
        ? materialRequirements.map((item) => {
          const line = lines.find((candidate) => candidate.materialKey === item.materialKey && candidate.specKey === (item.specKey || item.specification || "standard"));
          if (!line) return item;
          return action === "reserve"
            ? { ...item, reservedQty: Math.min(item.requiredQty, item.reservedQty + line.quantity), status: "reserved" as const }
            : { ...item, issuedQty: Math.min(item.requiredQty, item.issuedQty + line.quantity), reservedQty: Math.max(0, item.reservedQty - line.quantity), status: item.issuedQty + line.quantity >= item.requiredQty ? "issued" as const : "partial" as const };
        })
        : action === "reserve"
          ? await api.reserveOrderMaterials(detail.id, { warehouseId: materialWarehouseId, lines }, session.activeTenantId)
          : await api.issueOrderMaterials(detail.id, { warehouseId: materialWarehouseId, lines }, session.activeTenantId);
      setMaterialRequirements(next);
      setMaterialIssueQty({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "物料操作失败"); }
    finally { setMaterialActionBusy(false); }
  }

  return (
    <div className="page order-detail-page">
      <Link className="back-link" to="/orders"><ArrowLeft size={15} />返回订单列表</Link>
      <PageHeader title={detail.orderNo} description={`${detail.customer} · ${detail.project}`} actions={<>
        {can("order.transition.manage") && action && <button className="button primary" disabled={busy} onClick={() => void runTransition(action.status)}><action.icon size={16} />{action.label}</button>}
        {can("order.transition.manage") && detail.status === "暂停" && <button className="button primary" disabled={busy} onClick={() => void runTransition("已确认")}><RotateCcw size={16} />恢复订单</button>}
        {can("order.transition.manage") && pauseable.has(detail.status) && <button className="button secondary" disabled={busy} onClick={() => void runTransition("暂停")}><PauseCircle size={16} />暂停</button>}
        {can("order.transition.manage") && cancellable.has(detail.status) && <button className="button secondary" disabled={busy} onClick={() => void runTransition("已取消")}><XCircle size={16} />取消</button>}
        {can("production.manage") && detail.status === "待发货" && <button className="button primary" disabled={busy} onClick={() => setShipmentOpen(true)}><Send size={16} />创建发运</button>}
      </>} />
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="object-summary" aria-label="订单摘要">
        <div className="object-summary-item"><span>订单状态</span><StatusBadge value={detail.status} /><small>{pausedLifecycle ? "流程已暂停，恢复后返回已确认" : cancelledLifecycle ? "订单流程已终止" : "销售订单生命周期"}</small></div>
        <div className="object-summary-item"><span>含税金额</span><strong>{money.format(detail.amount)}</strong><small>{detail.lines.length} 项价格明细</small></div>
        <div className={`object-summary-item object-summary-${deliveryTone}`}><span>期望交付</span><div className="delivery-summary-value"><strong>{detail.dueDate}</strong>{can("order.delivery.manage") && <button className="icon-button" type="button" title="调整交付周期" aria-label="调整交付周期" onClick={openDeliverySchedule}><CalendarClock size={15} /></button>}</div><small>{deliverySignal}</small></div>
        <div className="object-summary-item"><span>生产 / 发运</span><div className="object-summary-statuses"><StatusBadge value={detail.productionStatus} /><StatusBadge value={detail.shipmentStatus} /></div><small>生产与物流同步跟踪</small></div>
        <div className="object-summary-item"><span>责任与版本</span><strong>{detail.owner}</strong><small>订单 v{detail.version} · {detail.configuration.snapshotVersion}</small></div>
      </section>

      <nav className="detail-tabs" aria-label="订单详情视图">{tabs.map(({ id, label, icon: Icon }) => <NavLink key={id} to={`/orders/${orderId}/${id}`} aria-current={activeTab === id ? "page" : undefined} className={activeTab === id ? "active" : ""}><Icon size={16} />{label}</NavLink>)}</nav>

      {activeTab === "overview" && <div className="detail-grid">
        <section className="panel detail-section"><header className="panel-header"><div><h2>订单信息</h2><p>客户采购与交付约定</p></div></header><dl className="detail-list"><div><dt>关联报价</dt><dd><button className="link-button">{detail.quoteNo}</button></dd></div><div><dt>客户采购单</dt><dd>{detail.poNumber}</dd></div><div><dt>销售负责人</dt><dd>{detail.owner}</dd></div><div><dt>经销渠道</dt><dd>{detail.dealer}</dd></div><div><dt>客户确认时间</dt><dd>{formatBeijingDateTime(detail.customerConfirmedAt)}</dd></div><div><dt>交付周期</dt><dd>{deliveryLeadTimeDays} 个自然日</dd></div><div><dt>期望交付日</dt><dd>{detail.dueDate}</dd></div><div><dt>创建日期</dt><dd>{detail.createdAt}</dd></div><div><dt>配置快照</dt><dd>{detail.configuration.snapshotVersion}</dd></div></dl></section>
        <section className="panel detail-section"><header className="panel-header"><div><h2>收货与联系人</h2><p>发运前请再次确认</p></div></header><div className="contact-block"><MapPin size={18} /><span><strong>收货地址</strong><p>{detail.address}</p></span></div><div className="contact-block"><UserRound size={18} /><span><strong>{detail.contact}</strong><p>项目联系人</p></span></div><div className="contact-block"><Phone size={18} /><span><strong>{detail.phone}</strong><p>联系电话</p></span></div></section>
        <section className="panel detail-section"><header className="panel-header"><div><h2>客户约定</h2><p>来自冻结报价备注</p></div></header><div className="note-block">{detail.quoteNote || "暂无客户备注"}</div></section>
        <section className="panel detail-section"><header className="panel-header"><div><h2>生产 / 发运备注</h2><p>订单履约过程中的内部说明</p></div></header><div className="note-block">{detail.note || "暂无生产或发运备注"}</div></section>
      </div>}

      {activeTab === "materials" && <section className="panel table-panel order-materials-panel">
        <header className="panel-header padded"><div><h2>订单物料需求</h2><p>根据订单冻结快照汇总需求、可用量、预留与已领料数量。</p></div><div className="page-actions">{can("inventory.issue") && <><select className="compact-select" value={materialWarehouseId} onChange={(event) => setMaterialWarehouseId(event.target.value)} aria-label="领料仓库">{materialWarehouses.length ? materialWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>) : <option value="default">主仓</option>}</select><button className="button secondary compact" disabled={materialActionBusy || materialLoading} onClick={() => void runMaterialAction("reserve")}><ClipboardList size={15} />预留物料</button><button className="button primary compact" disabled={materialActionBusy || materialLoading} onClick={() => void runMaterialAction("issue")}><PackageCheck size={15} />领料过账</button></>}</div></header>
        {!can("inventory.quantity.view") && <Notice tone="info">当前账号仅可查看库存可用性，物料数量、预留和领料明细已隐藏。</Notice>}
        {materialLoading ? <LoadingBlock label="正在读取物料需求" /> : materialRequirements.length ? <div className="table-wrap"><table className="order-lines-table" aria-label="订单物料需求"><thead><tr><th>物料</th><th>规格 / 变体</th><th>需求</th>{can("inventory.quantity.view") && <><th>可用</th><th>预留</th><th>领料</th></>}<th>状态</th></tr></thead><tbody>{materialRequirements.map((item) => { const remaining = Math.max(0, item.requiredQty - item.issuedQty); return <tr key={item.id}><td><strong>{item.materialCode}</strong><small>{item.name}</small></td><td>{[item.specKey || item.specification, item.color, item.finish].filter(Boolean).join(" · ")}</td><td>{can("inventory.quantity.view") ? `${item.requiredQty} ${item.unit}` : "—"}</td>{can("inventory.quantity.view") && <><td>{item.availableQty === null || item.availableQty === undefined ? "—" : `${item.availableQty} ${item.unit}`}</td><td>{item.reservedQty} {item.unit}</td><td><input className="compact-number-input" type="number" min="0" max={remaining} step="1" value={materialIssueQty[item.id] ?? remaining} onChange={(event) => setMaterialIssueQty((current) => ({ ...current, [item.id]: Number(event.target.value) }))} aria-label={`${item.materialCode} 本次领料数量`} /></td></>}<td><StatusBadge value={item.status === "issued" ? "已领料" : item.status === "partial" ? "部分领料" : item.status === "reserved" ? "已预留" : item.status === "shortage" ? "库存不足" : "待预留"} /></td></tr>; })}</tbody></table></div> : <EmptyState title="暂无物料需求" detail="该订单没有可读取的物料快照。" />}
      </section>}

      {activeTab === "configuration" && <div className="configuration-page">
        {detail.configuration.available ? <>
          <div className="configuration-layout">
            <ConfigurationPreview configuration={detail.configuration} />
            <section className="panel config-summary-panel"><header className="panel-header"><div><h2>冻结配置摘要</h2><p>订单已确认，编辑需生成新版本并重新走审核</p></div></header><dl className="detail-list"><div><dt>外形尺寸</dt><dd>{detail.configuration.dimensions}</dd></div><div><dt>结构网格</dt><dd>{detail.configuration.rows} 层 × {detail.configuration.columns} 列 × {detail.configuration.depthSegments.length} 个深度段</dd></div><div><dt>深度段</dt><dd>{detail.configuration.depthSegments.map((depth) => `${depth} mm`).join(" + ")}</dd></div><div><dt>框架材质</dt><dd>{detail.configuration.frameFinish}</dd></div><div><dt>框架颜色</dt><dd>{detail.configuration.frameColor}</dd></div><div><dt>脚垫</dt><dd>{detail.configuration.feet}</dd></div><div><dt>模块数量</dt><dd>{detail.configuration.modules} 个</dd></div><div><dt>配置版本</dt><dd>{detail.configuration.snapshotVersion}</dd></div></dl><a className="button secondary full-width" href={`/?readonly=1&orderId=${encodeURIComponent(detail.id)}`}><ExternalLink size={16} />在配置器中只读打开</a></section>
          </div>
          <ConfigurationDetails configuration={detail.configuration} />
        </> : <section className="panel configuration-empty"><div><h2>订单没有可用配置快照</h2><p>{detail.configuration.unavailableReason || "此历史订单没有保存可读取的配置冻结快照，因此无法展示尺寸、模块与颜色明细。"}</p><button className="button secondary" type="button" disabled><ExternalLink size={16} />配置器只读查看不可用</button></div></section>}
      </div>}

      {activeTab === "pricing" && <section className="panel table-panel"><header className="panel-header padded"><div><h2>订单明细</h2><p>价格基于下单时价格表与折扣快照</p></div><span className="count-chip">{detail.lines.length} 项</span></header>{detail.lines.length ? <><div className="table-wrap"><table className="order-lines-table" aria-label="订单价格明细"><thead><tr><th scope="col">物料编码</th><th scope="col">说明</th><th scope="col">颜色</th><th scope="col">数量</th><th scope="col">单价</th><th scope="col">小计</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td className="mono">{line.sku}</td><td><strong>{line.description}</strong></td><td>{line.color}</td><td>{line.qty}</td><td className="numeric">{money.format(line.unitPrice)}</td><td className="numeric strong">{money.format(line.total)}</td></tr>)}</tbody></table></div><div className="price-summary"><dl><div><dt>物料小计</dt><dd>{money.format(lineTotal)}</dd></div><div><dt>项目服务与安装</dt><dd>{money.format(Math.max(0, detail.amount - lineTotal))}</dd></div><div className="total"><dt>订单含税金额</dt><dd>{money.format(detail.amount)}</dd></div></dl></div></> : <EmptyState title="订单快照没有价格明细" detail="该订单仍可继续履约，价格明细暂不可用。" />}</section>}

      {activeTab === "production" && <section className="panel production-detail"><header className="panel-header padded"><div><h2>生产进度</h2><p>当前：{detail.productionStatus}</p></div>{can("production.manage") && detail.status === "待生产" && <button className="button compact primary" disabled={busy} onClick={() => void runProduction("组装")}><PlayCircle size={15} />开始生产</button>}{can("production.manage") && detail.status === "生产中" && <button className="button compact primary" disabled={busy} onClick={() => void runProduction("已完工")}><PackageCheck size={15} />完成生产</button>}</header>{detail.production.length ? <div className="step-timeline">{detail.production.map((step, index) => <div className="timeline-step" key={step.id}><div className="timeline-marker">{step.status === "已完成" ? <Check size={15} /> : index + 1}</div><div><div className="timeline-title"><strong>{step.name}</strong><StatusBadge value={step.status} /></div><p>负责人：{step.owner} · 计划 {step.plannedAt}</p>{step.completedAt && <small>完成于 {step.completedAt}</small>}</div></div>)}</div> : <EmptyState title="暂无细分工序" detail="开始与完成生产会同步更新订单生命周期。" />}</section>}

      {activeTab === "shipment" && <div>{detail.shipments.length ? detail.shipments.map((shipment) => <section className="panel shipment-card" key={shipment.id}><header><div className="shipment-icon"><Truck size={22} /></div><div><h2>{shipment.shipmentNo}</h2><p>{shipment.carrier} · {shipment.packages} 件</p></div><StatusBadge value={shipment.status} /></header><dl className="detail-list horizontal"><div><dt>运单号</dt><dd className="mono">{shipment.trackingNo}</dd></div><div><dt>发出时间</dt><dd>{shipment.shippedAt || "待提货"}</dd></div><div><dt>签收时间</dt><dd>{shipment.signedAt || "-"}</dd></div></dl></section>) : <section className="panel shipment-empty"><Truck size={30} /><h2>尚未创建发运单</h2><p>生产完工并确认包装数量后，可在此创建发运。</p>{can("production.manage") && detail.status === "待发货" && <button className="button primary" onClick={() => setShipmentOpen(true)}><Send size={16} />创建发运单</button>}</section>}</div>}

      {activeTab === "follow-ups" && <div className="detail-grid"><section className="panel detail-section"><header className="panel-header"><div><h2>跟进记录</h2><p>订单转交后，历史记录仍保留实际填写人。</p></div></header>{followUpLoading ? <LoadingBlock label="正在读取跟进记录" /> : followUps.length ? <div className="audit-timeline">{followUps.map((item) => <div className="audit-row" key={item.id}><span className="audit-icon"><MessageSquarePlus size={16} /></span><div><strong>{item.employeeName}</strong><p>{item.content}</p><small>{item.createdAt}{item.nextFollowUpAt ? ` · 下次跟进 ${item.nextFollowUpAt}` : ""}</small></div></div>)}</div> : <EmptyState title="暂无跟进记录" detail="填写第一条跟进，便于团队掌握交付进度。" />}</section>{can("order.follow-up") && <section className="panel detail-section"><header className="panel-header"><div><h2>新增跟进</h2><p>仅可为有访问权限的订单填写。</p></div></header><form className="modal-form compact-form" onSubmit={stopSubmit(submitFollowUp)}><label><span>跟进内容</span><textarea name="content" rows={5} required /></label><label><span>下次跟进时间</span><input name="nextFollowUpAt" type="datetime-local" /></label><div className="form-actions"><button type="submit" className="button primary" disabled={busy}><MessageSquarePlus size={16} />保存跟进</button></div></form></section>}</div>}

      {activeTab === "audit" && <section className="panel audit-timeline"><header className="panel-header padded"><div><h2>订单操作记录</h2><p>状态、价格与配置变更均会留痕</p></div></header>{audits.filter((item) => item.resourceId === detail.orderNo || item.resource === "订单").map((item) => <div className="audit-row" key={item.id}><span className="audit-icon"><FileClock size={16} /></span><div><strong>{item.actor} · {item.action}</strong><p>{item.detail}</p><small>{item.createdAt} · {item.ip}</small></div></div>)}<div className="audit-row"><span className="audit-icon"><Clock3 size={16} /></span><div><strong>{detail.owner} · 创建订单</strong><p>由报价 {detail.quoteNo} 转为销售订单，固化价格与配置快照。</p><small>{detail.createdAt}</small></div></div></section>}

      <Modal open={deliveryScheduleOpen} onClose={() => setDeliveryScheduleOpen(false)} title="调整交付计划" description="客户确认时间按北京时间记录，周期按自然日计算。"><form className="modal-form" onSubmit={stopSubmit(submitDeliverySchedule)}><div className="form-grid"><label><span>客户确认时间（北京时间）</span><input value={formatBeijingDateTime(detail.customerConfirmedAt)} readOnly /></label><label><span>交付周期（自然日）</span><input name="deliveryLeadTimeDays" type="number" min="1" max="365" value={deliveryDaysDraft} onChange={(event) => setDeliveryDaysDraft(Number(event.target.value) || 0)} required /></label></div><div className="note-block">期望交付日：{calculateDeliveryDate(detail.customerConfirmedAt, deliveryDaysDraft) ?? "日期待确认"}</div><FormActions onCancel={() => setDeliveryScheduleOpen(false)} submitting={busy} submitLabel="保存交付计划" /></form></Modal>
      <Modal open={shipmentOpen} onClose={() => setShipmentOpen(false)} title="创建发运单" description="登记承运商与运单信息后，订单将进入已发货状态。"><form className="modal-form" onSubmit={stopSubmit(submitShipment)}><div className="form-grid"><label><span>承运商</span><input name="carrier" required /></label><label><span>运单号</span><input name="trackingNo" required /></label><label><span>包装件数</span><input name="packages" type="number" min="1" defaultValue="1" required /></label><label><span>发出时间</span><input name="shippedAt" type="datetime-local" /></label></div><FormActions onCancel={() => setShipmentOpen(false)} submitting={busy} submitLabel="创建并发运" /></form></Modal>
    </div>
  );
}
