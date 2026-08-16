import { Alert, Button, Divider, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message, type TableProps } from "antd";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, CircleDollarSign, ClipboardList, Download, FileSpreadsheet, Plus, RefreshCw, Search, Upload, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Notice, PageHeader, StatusBadge } from "../components/ui";
import { useAuth } from "../context/auth";
import { api, ApiError } from "../lib/api";
import { downloadInventoryImportTemplate, parseInventoryImportWorkbook } from "../lib/inventory-import";
import type { InventoryBalance, InventoryImportPreview, InventoryLedgerEntry, InventoryMaterial, InventoryShortageAlert, StockDocument, StockDocumentLineInput, Warehouse as WarehouseType } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

const demoWarehouses: WarehouseType[] = [
  { id: "wh-main", code: "WH-MAIN", name: "主仓库", address: "一号厂房", status: "active" },
  { id: "wh-finished", code: "WH-FIN", name: "成品仓", address: "二号厂房", status: "active" }
];
const demoMaterials: InventoryMaterial[] = [
  { id: "m-tube201", materialKey: "tube201", specKey: "standard", materialCode: "USM-T201", name: "201 不锈钢管", specification: "Ø25 × 1.2mm", unit: "支", category: "框架管件" },
  { id: "m-panel-white", materialKey: "panel", specKey: "white", materialCode: "USM-PANEL-W", name: "面板", specification: "350 × 350mm", color: "白色", unit: "块", category: "板件" },
  { id: "m-panel-black", materialKey: "panel", specKey: "black", materialCode: "USM-PANEL-B", name: "面板", specification: "350 × 350mm", color: "黑色", unit: "块", category: "板件" },
  { id: "m-hinge", materialKey: "dropDoorHinge", specKey: "left", materialCode: "USM-HINGE-L", name: "下翻门铰链", specification: "左开", unit: "件", category: "五金" }
];
const demoBalances: InventoryBalance[] = [
  { id: "b-1", warehouseId: "wh-main", warehouseName: "主仓库", materialId: "m-tube201", materialKey: "tube201", specKey: "standard", materialCode: "USM-T201", name: "201 不锈钢管", specification: "Ø25 × 1.2mm", unit: "支", onHandQty: 860, availableQty: 720, reservedQty: 140, inboundQty: 120, outboundQty: 56, valueMinor: 2580000, updatedAt: "2026-08-15 09:30" },
  { id: "b-2", warehouseId: "wh-main", warehouseName: "主仓库", materialId: "m-panel-white", materialKey: "panel", specKey: "white", color: "白色", materialCode: "USM-PANEL-W", name: "面板", specification: "350 × 350mm", unit: "块", onHandQty: 420, availableQty: 388, reservedQty: 32, inboundQty: 80, outboundQty: 24, valueMinor: 1260000, updatedAt: "2026-08-15 09:30" },
  { id: "b-3", warehouseId: "wh-main", warehouseName: "主仓库", materialId: "m-panel-black", materialKey: "panel", specKey: "black", color: "黑色", materialCode: "USM-PANEL-B", name: "面板", specification: "350 × 350mm", unit: "块", onHandQty: 80, availableQty: 80, reservedQty: 0, inboundQty: 20, outboundQty: 8, valueMinor: 240000, updatedAt: "2026-08-15 09:30" },
  { id: "b-4", warehouseId: "wh-finished", warehouseName: "成品仓", materialId: "m-hinge", materialKey: "dropDoorHinge", specKey: "left", materialCode: "USM-HINGE-L", name: "下翻门铰链", specification: "左开", unit: "件", onHandQty: 96, availableQty: 74, reservedQty: 22, inboundQty: 20, outboundQty: 8, valueMinor: 192000, updatedAt: "2026-08-14 17:45" }
];
const demoLedger: InventoryLedgerEntry[] = [
  { id: "l-1", documentNo: "IN-20260815-001", documentType: "inbound", status: "posted", warehouseId: "wh-main", warehouseName: "主仓库", materialId: "m-tube201", materialKey: "tube201", specKey: "standard", materialCode: "USM-T201", name: "201 不锈钢管", specification: "Ø25 × 1.2mm", unit: "支", quantity: 120, direction: "in", reference: "采购单 PO-1021", operatorName: "林工", occurredAt: "2026-08-15 09:30", note: "到货验收" },
  { id: "l-2", documentNo: "OUT-20260814-003", documentType: "outbound", status: "posted", warehouseId: "wh-main", warehouseName: "主仓库", materialId: "m-panel-white", materialKey: "panel", specKey: "white", color: "白色", materialCode: "USM-PANEL-W", name: "面板", specification: "350 × 350mm", unit: "块", quantity: 24, direction: "out", reference: "订单 SO-202608-018", operatorName: "周工", occurredAt: "2026-08-14 16:20", note: "生产领料" }
];
const demoShortages: InventoryShortageAlert[] = [
  { id: "shortage-demo-custom", kind: "custom_made", reason: "该颜色规格没有可直接领用的标准库存，需按订单定制生产。", followUp: "production", orderId: "o-202608-021", orderCode: "SO-202608-021", orderStatus: "待生产", materialId: "m-panel-custom", materialKey: "panel", specKey: "custom-yellow", materialCode: "USM-PANEL-CUSTOM", name: "定制面板", specification: "350 × 350mm", color: "金黄色", finish: "粉末喷涂", unit: "块", officialSkuCode: null, requiredQty: 12, reservedQty: 0, issuedQty: 0, availableQty: 0, shortageQty: 12, createdAt: "2026-08-15 10:20", updatedAt: "2026-08-15 10:20" },
  { id: "shortage-demo-stock", kind: "depleted_stock", reason: "散装五金库存已经耗尽，当前订单仍有未满足需求。", followUp: "replenishment", orderId: "o-202608-018", orderCode: "SO-202608-018", orderStatus: "生产中", materialId: "m-hinge", materialKey: "dropDoorHinge", specKey: "left", materialCode: "USM-HINGE-L", name: "下翻门铰链", specification: "左开", color: "镀锌", finish: "", unit: "件", officialSkuCode: "BULK-HINGE-L", requiredQty: 24, reservedQty: 10, issuedQty: 8, availableQty: 0, shortageQty: 6, createdAt: "2026-08-15 09:45", updatedAt: "2026-08-15 10:05" }
];

function materialVariant(material: InventoryMaterial) {
  return [material.specKey, material.color, material.finish].filter(Boolean).join(" / ") || material.specKey;
}

function materialLabel(material: InventoryMaterial) {
  const variant = materialVariant(material);
  const surface = [material.color, material.finish].filter(Boolean).join(" / ");
  return `${material.materialCode} · ${material.name} · ${variant}${surface ? ` · ${surface}` : ""}`;
}

function quantity(value: number | null | undefined, hidden = false) {
  return hidden || value === null || value === undefined ? "—" : value.toLocaleString("zh-CN");
}

function shortageQuantity(value: number | null, unit: string, canQuantity: boolean) {
  return canQuantity && value !== null ? `${value.toLocaleString("zh-CN")} ${unit}` : "—";
}

function shortageReasonLabel(reason: string) {
  switch (reason) {
    case "not_in_official_bulk_catalog":
      return "不在官方散装 SKU 表内，按定制生产";
    case "insufficient_available_stock":
      return "官方散装 SKU 可用库存不足";
    case "no_available_stock":
      return "官方散装 SKU 库存已耗尽";
    default:
      return reason || "库存不足";
  }
}

function documentFromLedger(entry: InventoryLedgerEntry): StockDocument {
  return {
    id: entry.documentNo,
    documentNo: entry.documentNo,
    documentType: entry.documentType,
    status: entry.status ?? "posted",
    warehouseId: entry.warehouseId,
    warehouseName: entry.warehouseName,
    reference: entry.reference,
    note: entry.note,
    lines: [{ materialId: entry.materialId, materialKey: entry.materialKey, specKey: entry.specKey, color: entry.color, finish: entry.finish, materialCode: entry.materialCode, name: entry.name, specification: entry.specification, unit: entry.unit, quantity: entry.quantity }],
    createdAt: entry.occurredAt,
    postedAt: entry.occurredAt
  };
}

function useInventorySource() {
  const { session, can } = useAuth();
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [alerts, setAlerts] = useState<InventoryShortageAlert[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canQuantity = can("inventory.quantity.view");
  const canWarehouseList = can("inventory.distribution.view") || can("inventory.value.view") || can("inventory.receive") || can("inventory.issue") || can("inventory.adjust") || can("inventory.transfer");
  const demo = session?.mode === "demo";
  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    if (demo) {
      setWarehouses(canWarehouseList ? demoWarehouses : []);
      setMaterials(demoMaterials);
      setBalances(demoBalances);
      setAlerts(canQuantity ? demoShortages : demoShortages.map((item) => ({ ...item, requiredQty: null, reservedQty: null, issuedQty: null, availableQty: null, shortageQty: null })));
      setLedger(canQuantity ? demoLedger : []);
      setDocuments(canQuantity ? demoLedger.map(documentFromLedger) : []);
      setLoading(false);
      return;
    }
    try {
      const [nextWarehouses, nextMaterials, nextBalances, nextAlerts, nextLedger, nextDocuments] = await Promise.all([
        canWarehouseList ? api.listWarehouses(session.activeTenantId) : Promise.resolve([]),
        api.listInventoryMaterials(session.activeTenantId),
        api.listInventoryBalances(session.activeTenantId),
        api.listInventoryShortages(session.activeTenantId),
        canQuantity ? api.listInventoryLedger(session.activeTenantId) : Promise.resolve([]),
        canQuantity ? api.listStockDocuments(session.activeTenantId) : Promise.resolve([])
      ]);
      setWarehouses(nextWarehouses);
      setMaterials(nextMaterials);
      setBalances(nextBalances);
      setAlerts(nextAlerts);
      setLedger(nextLedger);
      setDocuments(nextDocuments);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "库存数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [canQuantity, canWarehouseList, demo, session]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { session, demo, warehouses, materials, balances, alerts, ledger, documents, loading, error, refresh, setBalances, setLedger, setDocuments };
}

function InventoryUnavailable({ error }: { error: string | null }) {
  return error ? <Notice tone="danger">{error}</Notice> : null;
}

export function InventoryPage() {
  const { session, balances, alerts, warehouses, loading, error, refresh } = useInventorySource();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>();
  const [shortageQuery, setShortageQuery] = useState("");
  const [shortageFollowUp, setShortageFollowUp] = useState<"all" | InventoryShortageAlert["followUp"]>("all");
  const policy = session?.fieldPolicy?.inventory ?? (can("inventory.value.view") ? "value" : can("inventory.quantity.view") ? "quantity" : can("inventory.availability.view") ? "availability" : "none");
  const filtered = useMemo(() => balances.filter((item) => (!warehouseId || item.warehouseId === warehouseId) && (!query.trim() || `${item.materialCode}${item.name}${item.specification}${item.materialKey}${item.color ?? ""}${item.finish ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [balances, query, warehouseId]);
  const filteredShortages = useMemo(() => alerts.filter((item) => {
    if (shortageFollowUp !== "all" && item.followUp !== shortageFollowUp) return false;
    const keyword = shortageQuery.trim().toLocaleLowerCase();
    return !keyword || `${item.orderCode ?? ""}${item.orderStatus ?? ""}${item.materialCode}${item.name}${item.specification}${item.specKey}${item.color}${item.finish}${item.officialSkuCode ?? ""}${item.reason}`.toLocaleLowerCase().includes(keyword);
  }), [alerts, shortageFollowUp, shortageQuery]);
  const showQty = policy !== "none" && policy !== "availability";
  const showDistribution = policy === "distribution" || policy === "value";
  const showValue = policy === "value";
  useEffect(() => {
    if (!showDistribution) setWarehouseId(undefined);
  }, [showDistribution]);
  const availability = (item: InventoryBalance) => item.isAvailable ?? (item.availableQty === null || item.availableQty === undefined ? null : item.availableQty > 0);
  const availableCount = filtered.filter((item) => availability(item) === true).length;
  const availabilityKnown = filtered.every((item) => availability(item) !== null);
  const totalAvailable = policy === "availability" ? null : filtered.reduce((sum, item) => sum + (item.availableQty ?? 0), 0);
  const totalReserved = filtered.reduce((sum, item) => sum + (item.reservedQty ?? 0), 0);
  const totalValue = filtered.reduce((sum, item) => sum + (item.valueMinor ?? 0), 0) / 100;
  const productionShortageCount = alerts.filter((item) => item.followUp === "production").length;
  const replenishmentShortageCount = alerts.filter((item) => item.followUp === "replenishment").length;
  const canQuantity = can("inventory.quantity.view");
  const shortageColumns: TableProps<InventoryShortageAlert>["columns"] = [
    { title: "类型", key: "kind", width: 230, render: (_, item) => <div className="erp-primary-cell"><Tag color={item.kind === "custom_made" ? "blue" : item.kind === "depleted_stock" ? "red" : "orange"}>{item.kind === "custom_made" ? "定制件" : item.kind === "depleted_stock" ? "库存耗尽" : "库存不足"}</Tag><span>{shortageReasonLabel(item.reason)}</span></div> },
    { title: "订单", key: "order", width: 170, render: (_, item) => <div className="erp-primary-cell">{item.orderId && item.orderCode ? <Link className="primary-link" to={`/orders/${item.orderId}`}>{item.orderCode}</Link> : <strong>未关联订单</strong>}<span>{item.orderStatus ?? "—"}</span></div> },
    { title: "物料 / 规格", key: "material", width: 310, render: (_, item) => <div className="erp-primary-cell"><strong>{item.materialCode} · {item.name}</strong><span>{[item.specification, item.specKey, item.color, item.finish].filter(Boolean).join(" · ")}</span></div> },
    { title: "散装 SKU", dataIndex: "officialSkuCode", width: 150, render: (value: string | null) => value ? <span className="mono">{value}</span> : "—" },
    ...(canQuantity && alerts.some((item) => item.requiredQty !== null) ? [{ title: "需求", dataIndex: "requiredQty", width: 100, align: "right" as const, render: (value: number | null, item: InventoryShortageAlert) => shortageQuantity(value, item.unit, canQuantity) }] : []),
    ...(canQuantity && alerts.some((item) => item.reservedQty !== null) ? [{ title: "预留", dataIndex: "reservedQty", width: 100, align: "right" as const, render: (value: number | null, item: InventoryShortageAlert) => shortageQuantity(value, item.unit, canQuantity) }] : []),
    ...(canQuantity && alerts.some((item) => item.issuedQty !== null) ? [{ title: "已领", dataIndex: "issuedQty", width: 100, align: "right" as const, render: (value: number | null, item: InventoryShortageAlert) => shortageQuantity(value, item.unit, canQuantity) }] : []),
    ...(canQuantity && alerts.some((item) => item.availableQty !== null) ? [{ title: "可用", dataIndex: "availableQty", width: 100, align: "right" as const, render: (value: number | null, item: InventoryShortageAlert) => shortageQuantity(value, item.unit, canQuantity) }] : []),
    ...(canQuantity && alerts.some((item) => item.shortageQty !== null) ? [{ title: "缺口", dataIndex: "shortageQty", width: 100, align: "right" as const, render: (value: number | null, item: InventoryShortageAlert) => shortageQuantity(value, item.unit, canQuantity) }] : []),
    { title: "跟进", dataIndex: "followUp", width: 110, fixed: "right", render: (value: InventoryShortageAlert["followUp"]) => <Tag color={value === "production" ? "blue" : "gold"}>{value === "production" ? "定制生产" : "库存补货"}</Tag> }
  ];
  const columns: TableProps<InventoryBalance>["columns"] = [
    { title: "物料", key: "material", width: 300, render: (_, item) => <div className="erp-primary-cell"><strong>{item.materialCode}</strong><span>{item.name} · {item.specification}{[item.color, item.finish].filter(Boolean).length ? ` · ${[item.color, item.finish].filter(Boolean).join(" / ")}` : ""}</span></div> },
    { title: "仓库", dataIndex: "warehouseName", width: 120, responsive: ["md"] },
    { title: "可用", dataIndex: "availableQty", width: 100, align: "right", render: (value: number | null) => quantity(value, policy === "none") },
    ...(showQty ? [{ title: "现有", dataIndex: "onHandQty", width: 100, align: "right" as const, render: (value: number | null) => quantity(value) }, { title: "预留", dataIndex: "reservedQty", width: 100, align: "right" as const, render: (value: number | null) => quantity(value) }] : []),
    ...(showDistribution ? [{ title: "最近入库", dataIndex: "inboundQty", width: 110, align: "right" as const, render: (value: number | null) => quantity(value) }, { title: "最近出库", dataIndex: "outboundQty", width: 110, align: "right" as const, render: (value: number | null) => quantity(value) }] : []),
    ...(showValue ? [{ title: "库存价值", dataIndex: "valueMinor", width: 130, align: "right" as const, render: (value: number | null) => value === null ? "—" : money.format(value / 100) }] : []),
    { title: "更新", dataIndex: "updatedAt", width: 150, responsive: ["lg"] }
  ];
  if (policy === "availability") {
    columns.splice(1, 2, {
      title: "供货状态",
      key: "availability",
      width: 120,
      align: "center",
      render: (_value: unknown, item: InventoryBalance) => availability(item) === true ? <Tag color="green">可供货</Tag> : availability(item) === false ? <Tag color="orange">暂不可供货</Tag> : <Tag>状态未知</Tag>
    });
  } else if (!showDistribution) {
    columns.splice(1, 1);
  }
  return <div className="page inventory-page">
    <PageHeader title="库存总览" description="按物料与仓库查看可用库存，敏感字段按账户授权展示。" actions={<Space><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button><Button type="primary" icon={<ArrowDownToLine size={15} />} disabled={!can("inventory.receive")}><Link to="/inventory/inbound">入库</Link></Button><Button icon={<ArrowUpFromLine size={15} />} disabled={!can("inventory.issue")}><Link to="/inventory/outbound">出库</Link></Button></Space>} />
    <Alert className="inventory-shortage-summary" type={loading ? "info" : alerts.length ? "warning" : "success"} showIcon message={loading ? "正在汇总缺货预警" : alerts.length ? `当前有 ${alerts.length} 条缺货预警待跟进` : "当前没有缺货预警"} description={!loading && alerts.length ? `定制生产 ${productionShortageCount} 条，库存补货 ${replenishmentShortageCount} 条。预警汇总为全局数据，不受下方库存余额筛选影响。` : undefined} />
    <InventoryUnavailable error={error} />
    <section className="metric-grid inventory-metrics">
      <article className="metric-card"><div className="metric-head"><span>物料种类</span><Boxes size={18} /></div><strong>{filtered.length}<small> 项</small></strong><div className="metric-foot">当前筛选范围</div></article>
      <article className="metric-card"><div className="metric-head"><span>{policy === "availability" ? "供货状态" : "可用数量"}</span><Warehouse size={18} /></div><strong>{policy === "availability" ? (availabilityKnown ? `${availableCount} / ${filtered.length}` : "—") : quantity(totalAvailable, policy === "none")}<small>{policy === "availability" ? " 种" : " 件"}</small></strong><div className="metric-foot">{policy === "availability" ? "仅显示是否有可供货库存，不显示库存数量" : "可直接用于生产"}</div></article>
      {showQty && <article className="metric-card"><div className="metric-head"><span>预留数量</span><Boxes size={18} /></div><strong>{quantity(totalReserved)}<small> 件</small></strong><div className="metric-foot">进入生产订单的预留</div></article>}
      {showValue && <article className="metric-card"><div className="metric-head"><span>库存价值</span><CircleDollarSign size={18} /></div><strong>{money.format(totalValue)}</strong><div className="metric-foot">按当前主数据参考成本</div></article>}
      <article className={`metric-card${alerts.length ? " metric-card-warning" : ""}`}><div className="metric-head"><span>全局缺货预警</span><AlertTriangle size={18} /></div><strong>{alerts.length}<small> 条</small></strong><div className="metric-foot">不受库存搜索与仓库筛选影响</div></article>
    </section>
    <section className="inventory-shortage-section" aria-labelledby="inventory-shortage-heading">
      <div className="inventory-shortage-heading"><div><h2 id="inventory-shortage-heading">缺货跟进</h2><p>区分定制生产与库存补货，按订单和物料持续处理。</p></div><Tag color={alerts.length ? "orange" : "green"}>{filteredShortages.length} / {alerts.length} 条</Tag></div>
      <div className="erp-table-card">
        <div className="erp-table-toolbar"><Input prefix={<Search size={15} />} allowClear value={shortageQuery} onChange={(event) => setShortageQuery(event.target.value)} placeholder="搜索订单、物料、规格或散装 SKU" /><Select value={shortageFollowUp} onChange={setShortageFollowUp} style={{ width: 150 }} options={[{ value: "all", label: "全部跟进" }, { value: "production", label: "定制生产" }, { value: "replenishment", label: "库存补货" }]} /></div>
        {alerts.length ? <Table<InventoryShortageAlert> rowKey="id" size="small" loading={loading} columns={shortageColumns} dataSource={filteredShortages} scroll={{ x: 1450 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: "没有符合当前条件的缺货预警" }} /> : <div className="inventory-shortage-empty"><AlertTriangle size={18} /><span>暂无需要跟进的缺货预警</span></div>}
      </div>
    </section>
    <section className="erp-table-card">
      <div className="erp-table-toolbar"><Input prefix={<Search size={15} />} allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物料编码、名称、规格或颜色" /><Select allowClear value={warehouseId} onChange={setWarehouseId} placeholder="筛选仓库" style={{ width: 160, display: showDistribution ? undefined : "none" }} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></div>
      <Table<InventoryBalance> rowKey="id" size="small" loading={loading} columns={columns} dataSource={filtered} scroll={{ x: 1050 }} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 项` }} locale={{ emptyText: "暂无库存余额" }} />
    </section>
  </div>;
}

export function InventoryLedgerPage() {
  const { ledger, warehouses, materials, loading, error, refresh } = useInventorySource();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>();
  const [direction, setDirection] = useState<string>();
  const [documentType, setDocumentType] = useState<string>();
  const filtered = useMemo(() => ledger.filter((item) => (!warehouseId || item.warehouseId === warehouseId) && (!direction || item.direction === direction) && (!documentType || item.documentType === documentType) && (!query.trim() || `${item.documentNo}${item.materialCode}${item.name}${item.reference ?? ""}${item.color ?? ""}${item.finish ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [direction, documentType, ledger, query, warehouseId]);
  const exportLedger = () => {
    const headers = ["单据号", "单据类型", "物料编码", "名称", "规格", "颜色/表面处理", "仓库", "数量", "方向", "发生时间", "关联单据"];
    const rows = filtered.map((item) => [item.documentNo, item.documentType, item.materialCode, item.name, item.specification, [item.color, item.finish].filter(Boolean).join(" / "), item.warehouseName ?? item.warehouseId, item.quantity, item.direction === "in" ? "入库" : "出库", item.occurredAt, item.reference ?? ""]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `库存台账-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const columns: TableProps<InventoryLedgerEntry>["columns"] = [
    { title: "单据", key: "document", width: 190, render: (_, item) => <div className="erp-primary-cell"><strong>{item.documentNo}</strong><span>{item.reference || "无关联单据"}</span></div> },
    { title: "物料", key: "material", width: 290, render: (_, item) => <div className="erp-primary-cell"><strong>{item.materialCode}</strong><span>{item.name} · {item.specification}{[item.color, item.finish].filter(Boolean).length ? ` · ${[item.color, item.finish].filter(Boolean).join(" / ")}` : ""}</span></div> },
    { title: "方向", dataIndex: "direction", width: 80, render: (value: string) => <Tag color={value === "in" ? "green" : "orange"}>{value === "in" ? "入库" : "出库"}</Tag> },
    { title: "数量", dataIndex: "quantity", width: 100, align: "right", render: (value: number, item) => <span className="numeric strong">{item.direction === "out" ? "-" : "+"}{value.toLocaleString("zh-CN")} {item.unit}</span> },
    { title: "仓库", dataIndex: "warehouseName", width: 120, responsive: ["md"] },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <StatusBadge value={value === "posted" ? "已过账" : value === "reversed" ? "已冲销" : "草稿"} /> },
    { title: "发生时间", dataIndex: "occurredAt", width: 160, responsive: ["lg"] },
    { title: "操作人", dataIndex: "operatorName", width: 100, responsive: ["lg"] }
  ];
  return <div className="page inventory-page"><PageHeader title="库存台账" description="按物料、仓库、日期和单据类型追踪库存流水。" actions={<Space><Button icon={<Download size={15} />} onClick={exportLedger}>导出 CSV</Button><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button></Space>} /><InventoryUnavailable error={error} /><section className="erp-table-card"><div className="erp-table-toolbar"><Input prefix={<Search size={15} />} allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索单据号、物料、颜色或关联单据" /><Space wrap><Select allowClear value={documentType} onChange={setDocumentType} placeholder="单据类型" style={{ width: 130 }} options={[{ value: "inbound", label: "入库" }, { value: "outbound", label: "出库" }, { value: "adjustment", label: "调整" }, { value: "transfer", label: "调拨" }]} /><Select allowClear value={direction} onChange={setDirection} placeholder="出入方向" style={{ width: 120 }} options={[{ value: "in", label: "入库" }, { value: "out", label: "出库" }]} /><Select allowClear value={warehouseId} onChange={setWarehouseId} placeholder="仓库" style={{ width: 140 }} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></Space></div><Table<InventoryLedgerEntry> rowKey="id" size="small" loading={loading} columns={columns} dataSource={filtered} scroll={{ x: 1200 }} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: "暂无库存变动" }} /></section><Divider /><section className="inventory-variant-hint"><strong>当前物料主数据：{materials.length} 个变体</strong><span>颜色/表面处理按独立库存 SKU 记录，台账查询不会合并不同变体。</span></section></div>;
}

function ImportPanel({ materials, warehouses, session, demo, onCommitted }: { materials: InventoryMaterial[]; warehouses: WarehouseType[]; session: ReturnType<typeof useInventorySource>["session"]; demo: boolean; onCommitted: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ materialRows: Array<Record<string, unknown>>; openingRows: Array<Record<string, unknown>>; warnings: string[] } | null>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const pickFile = async (file: File) => {
    setBusy(true); setCommitted(false); setPreview(null); setFileName(file.name);
    try {
      const [result, digest] = await Promise.all([
        parseInventoryImportWorkbook(file),
        crypto.subtle.digest("SHA-256", await file.arrayBuffer())
      ]);
      setBatchId(`inventory-${Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
      const materialRows = result.materialRows.map((row) => ({ ...row }));
      const openingRows = result.openingRows.map((row) => ({ ...row }));
      setParsed({ materialRows, openingRows, warnings: result.warnings });
      if (!session) return;
      if (demo) {
        setPreview({ materialRows, openingRows, created: materialRows.length, updated: 0, skipped: 0, conflicts: 0, errors: result.warnings.map((warning, index) => ({ row: index + 2, message: warning })) });
      } else setPreview(await api.previewInventoryImport({ materialRows, openingRows }, session.activeTenantId));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "文件解析失败");
      setParsed(null);
    } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!session || !parsed || !preview || preview.errors.length || preview.conflicts) return;
    setBusy(true);
    try {
      if (!demo) await api.commitInventoryImport({ materialRows: parsed.materialRows, openingRows: parsed.openingRows, batchId, source: fileName }, session.activeTenantId);
      setCommitted(true); message.success("库存导入已提交"); await onCommitted();
    } catch (cause) { message.error(cause instanceof ApiError ? cause.message : "库存导入提交失败"); } finally { setBusy(false); }
  };
  const downloadErrors = () => {
    if (!preview?.errors.length) return;
    const csv = ["工作表,行号,错误", ...preview.errors.map((error) => [error.sheet ?? "", error.row, error.message].map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "库存导入错误报告.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="inventory-import-panel"><div className="inventory-import-header"><div><h2>首次物料与期初库存导入</h2><p>下载双表模板，填写物料主数据和期初库存后预览，确认后整批提交。</p></div><Space><Button icon={<Download size={15} />} onClick={() => downloadInventoryImportTemplate(materials, warehouses)}>下载导入模板</Button><Button type="primary" icon={<Upload size={15} />} loading={busy} onClick={() => inputRef.current?.click()}>选择文件</Button><input ref={inputRef} type="file" hidden accept=".xlsx,.csv,.tsv,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void pickFile(file); event.target.value = ""; }} /></Space></div>{fileName && <div className="inventory-import-file"><FileSpreadsheet size={16} />{fileName}<span>{parsed ? `${parsed.materialRows.length} 条物料，${parsed.openingRows.length} 条期初库存` : "解析中"}</span></div>}{parsed?.warnings.length ? <Alert type="warning" showIcon message="文件解析提示" description={<ul>{parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>} /> : null}{preview && <div className="inventory-import-preview"><div className="inventory-import-summary"><span>新增 <strong>{preview.created}</strong></span><span>更新 <strong>{preview.updated}</strong></span><span>跳过 <strong>{preview.skipped}</strong></span><span>冲突 <strong className={preview.conflicts ? "danger" : ""}>{preview.conflicts}</strong></span><span>错误 <strong className={preview.errors.length ? "danger" : ""}>{preview.errors.length}</strong></span></div>{preview.errors.length ? <Alert type="error" showIcon message="导入存在错误，请修正后重新上传" description={<div><ul>{preview.errors.slice(0, 8).map((error) => <li key={`${error.sheet}-${error.row}-${error.message}`}>{error.sheet ? `${error.sheet} ` : ""}第 {error.row} 行：{error.message}</li>)}</ul><Button size="small" icon={<Download size={14} />} onClick={downloadErrors}>下载错误报告</Button></div>} /> : <Alert type="success" showIcon message="预检通过，可确认提交" description="空白字段不会覆盖已有资料；重复编码将按增量更新处理。" />}</div>}{preview && <div className="inventory-import-actions"><Button onClick={() => { setParsed(null); setPreview(null); setFileName(""); setBatchId(""); }} disabled={busy}>重新选择</Button><Button type="primary" onClick={() => void commit()} disabled={busy || committed || !batchId || preview.errors.length > 0 || preview.conflicts > 0}>确认导入</Button>{committed && <Tag color="green">已提交</Tag>}</div>}</section>;
}

type StockDocumentPageProps = { mode: "inbound" | "outbound" };

function DocumentList({ documents, materials, loading, canReverse, onReverse, onDetail }: { documents: StockDocument[]; materials: InventoryMaterial[]; loading: boolean; canReverse: boolean; onReverse: (document: StockDocument) => void; onDetail: (document: StockDocument) => void }) {
  const columns: TableProps<StockDocument>["columns"] = [
    { title: "单据号", dataIndex: "documentNo", width: 190, render: (value: string, item) => <button type="button" className="table-link" onClick={() => onDetail(item)}>{value}</button> },
    { title: "类型", dataIndex: "documentType", width: 90, render: (value: string) => <Tag color={value === "outbound" || value === "issue" ? "orange" : "green"}>{value === "outbound" || value === "issue" ? "出库" : "入库"}</Tag> },
    { title: "仓库", dataIndex: "warehouseName", width: 130 },
    { title: "明细", key: "lines", render: (_, item) => { const first = item.lines[0]; const material = materials.find((candidate) => candidate.id === first?.materialId || (candidate.materialKey === first?.materialKey && candidate.specKey === first?.specKey && candidate.color === first?.color && candidate.finish === first?.finish)); return <span>{material?.materialCode ?? first?.materialCode ?? first?.materialKey ?? "—"}{item.lines.length > 1 ? ` 等 ${item.lines.length} 项` : ""}</span>; } },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <StatusBadge value={value === "posted" ? "已过账" : value === "reversed" ? "已冲销" : "草稿"} /> },
    { title: "创建时间", dataIndex: "createdAt", width: 170 },
    { title: "操作", key: "actions", width: 100, render: (_, item) => <Space><Button type="link" size="small" onClick={() => onDetail(item)}>明细</Button>{canReverse && item.status === "posted" && <Popconfirm title="确认冲销这张已过账单据？" description="冲销会生成反向库存流水，原单据不会被删除。" onConfirm={() => onReverse(item)}><Button type="link" danger size="small">冲销</Button></Popconfirm>}</Space> }
  ];
  return <section className="erp-table-card"><Table<StockDocument> rowKey="id" size="small" loading={loading} columns={columns} dataSource={documents} scroll={{ x: 900 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 张` }} locale={{ emptyText: "暂无库存单据" }} /></section>;
}

function StockDocumentPage({ mode }: StockDocumentPageProps) {
  const { session, demo, warehouses, materials, documents, loading, error, refresh, setBalances, setLedger, setDocuments } = useInventorySource();
  const { can } = useAuth();
  const [warehouseId, setWarehouseId] = useState<string>();
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<StockDocumentLineInput[]>([{ materialKey: "", quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<StockDocument | null>(null);
  const permission = mode === "inbound" ? "inventory.receive" : "inventory.issue";
  const title = mode === "inbound" ? "入库管理" : "出库管理";
  const canSubmit = can(permission) && Boolean(warehouseId) && lines.every((line) => line.materialKey && line.quantity > 0);
  const selectedMaterial = (line: StockDocumentLineInput) => materials.find((material) => material.id === line.materialId) ?? materials.find((material) => material.materialKey === line.materialKey && material.specKey === line.specKey && material.color === line.color && material.finish === line.finish);
  function updateLine(index: number, patch: Partial<StockDocumentLineInput>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)); }
  function selectMaterial(index: number, materialId: string) { const material = materials.find((item) => item.id === materialId); if (!material) return; updateLine(index, { materialId: material.id, materialKey: material.materialKey, specKey: material.specKey, color: material.color, finish: material.finish, materialCode: material.materialCode, name: material.name, specification: material.specification, unit: material.unit }); }
  function addLine() { setLines((current) => [...current, { materialKey: "", quantity: 1 }]); }
  function removeLine(index: number) { setLines((current) => current.length <= 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)); }
  async function submit() {
    if (!session || !warehouseId || !canSubmit) return;
    setSubmitting(true);
    try {
      const payload = { documentType: mode, warehouseId, reference: reference.trim() || undefined, note: note.trim() || undefined, lines };
      if (demo) {
        const now = new Date().toISOString();
        const documentNo = `${mode === "inbound" ? "IN" : "OUT"}-DEMO-${Date.now()}`;
        const warehouseName = warehouses.find((item) => item.id === warehouseId)?.name;
        const newEntries = lines.map((line, index) => { const material = selectedMaterial(line); return { id: `${documentNo}-${index + 1}`, documentNo, documentType: mode, status: "posted", warehouseId, warehouseName, materialId: material?.id, materialKey: line.materialKey, specKey: line.specKey, color: line.color, finish: line.finish, materialCode: material?.materialCode ?? line.materialCode ?? line.materialKey, name: material?.name ?? line.name ?? "物料", specification: material?.specification ?? line.specification ?? "", unit: material?.unit ?? line.unit ?? "件", quantity: line.quantity, direction: mode === "inbound" ? "in" as const : "out" as const, reference: reference || null, occurredAt: now, note: note || null }; });
        const created = documentFromLedger(newEntries[0]); created.id = documentNo; created.lines = lines; setDocuments((current) => [created, ...current]); setLedger((current) => [...newEntries, ...current]);
        setBalances((current) => current.map((balance) => { const line = lines.find((item) => { const material = selectedMaterial(item); return material && balance.warehouseId === warehouseId && (balance.materialId === material.id || (balance.materialKey === material.materialKey && balance.specKey === material.specKey && balance.color === material.color && balance.finish === material.finish)); }); if (!line) return balance; const delta = mode === "inbound" ? line.quantity : -line.quantity; return { ...balance, onHandQty: (balance.onHandQty ?? 0) + delta, availableQty: (balance.availableQty ?? 0) + delta, updatedAt: now }; }));
      } else {
        const created = await api.createStockDocument(payload, session.activeTenantId);
        const posted = await api.postStockDocument(created.id, session.activeTenantId);
        setDocuments((current) => [posted, ...current.filter((item) => item.id !== posted.id)]);
        await refresh();
      }
      message.success(`${mode === "inbound" ? "入库" : "出库"}单已提交并过账`); setReference(""); setNote(""); setLines([{ materialKey: "", quantity: 1 }]);
    } catch (cause) { message.error(cause instanceof ApiError ? cause.message : `${title}提交失败`); } finally { setSubmitting(false); }
  }
  async function reverse(document: StockDocument) {
    if (!session) return;
    try {
      if (demo) setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "reversed" } : item));
      else { const reversed = await api.reverseStockDocument(document.id, session.activeTenantId); setDocuments((current) => current.map((item) => item.id === document.id ? reversed : item)); await refresh(); }
      message.success("单据已冲销");
    } catch (cause) { message.error(cause instanceof ApiError ? cause.message : "单据冲销失败"); }
  }
  return <div className="page inventory-page"><PageHeader title={title} description={mode === "inbound" ? "登记采购、调拨或期初导入的到货数量。" : "登记生产领料、销售出库或仓间调拨的发出数量。"} actions={<Space><Button icon={<ClipboardList size={15} />}><Link to="/inventory/ledger">查看台账</Link></Button><Button type="primary" loading={submitting} disabled={!canSubmit} onClick={() => void submit()} icon={mode === "inbound" ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}>提交并过账</Button></Space>} /><InventoryUnavailable error={error} />
    {mode === "inbound" && can("inventory.adjust") && <ImportPanel materials={materials} warehouses={warehouses} session={session} demo={demo} onCommitted={refresh} />}
    <section className="inventory-document-form"><div className="erp-form-grid"><label><span>仓库</span><Select value={warehouseId} onChange={setWarehouseId} placeholder="选择仓库" options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.name} (${warehouse.code})` }))} /></label><label><span>关联单据</span><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === "inbound" ? "采购单 / 调拨单号" : "订单 / 生产单号"} /></label><label className="span-2"><span>备注</span><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选，记录验收、领料或异常说明" /></label></div><div className="inventory-lines-header"><h2>物料明细</h2><Button icon={<Plus size={15} />} onClick={addLine}>添加物料</Button></div><div className="inventory-lines">{lines.map((line, index) => { const material = selectedMaterial(line); return <div className="inventory-line" key={`${index}-${line.materialId ?? line.materialKey}`}><span className="inventory-line-index">{index + 1}</span><Select showSearch optionFilterProp="label" value={line.materialId || undefined} onChange={(value) => selectMaterial(index, String(value))} placeholder="选择物料变体" options={materials.filter((item) => item.active !== false).map((item) => ({ value: item.id, label: materialLabel(item) }))} /><InputNumber min={1} step={1} precision={0} value={line.quantity} onChange={(value) => updateLine(index, { quantity: Number(value ?? 0) })} addonAfter={material?.unit ?? "件"} /><Button type="text" danger disabled={lines.length <= 1} onClick={() => removeLine(index)}>移除</Button></div>; })}</div>{!can(permission) && <Notice tone="warning">当前账号没有{mode === "inbound" ? "入库" : "出库"}权限，页面仅供查看。</Notice>}</section>
    <div className="inventory-documents-heading"><div><h2>单据记录</h2><p>已过账单据不可直接编辑，只能通过冲销生成反向流水。</p></div><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button></div><DocumentList documents={documents.filter((item) => mode === "inbound" ? !["outbound", "issue"].includes(item.documentType) : ["outbound", "issue"].includes(item.documentType))} materials={materials} loading={loading} canReverse={can("inventory.adjust")} onReverse={(document) => void reverse(document)} onDetail={setDetail} />
    <Modal open={Boolean(detail)} title={detail ? `${detail.documentNo} · 单据明细` : "单据明细"} footer={null} onCancel={() => setDetail(null)}>{detail && <div className="inventory-document-detail"><DescriptionsList document={detail} materials={materials} /></div>}</Modal>
  </div>;
}

function DescriptionsList({ document, materials }: { document: StockDocument; materials: InventoryMaterial[] }) {
  return <><div className="inventory-detail-meta"><span>仓库：{document.warehouseName ?? document.warehouseId}</span><span>状态：{document.status}</span><span>创建：{document.createdAt}</span>{document.reference && <span>关联：{document.reference}</span>}</div><Table<StockDocumentLineInput> rowKey={(_, index) => `${document.id}-${index}`} size="small" pagination={false} dataSource={document.lines} columns={[{ title: "物料", render: (_, line) => { const material = materials.find((item) => item.id === line.materialId); return <div className="erp-primary-cell"><strong>{material?.materialCode ?? line.materialCode ?? line.materialKey}</strong><span>{material?.name ?? line.name ?? "物料"}</span></div>; } }, { title: "规格/变体", render: (_, line) => [line.specification ?? line.specKey, line.color, line.finish].filter(Boolean).join(" · ") }, { title: "数量", dataIndex: "quantity", align: "right" }, { title: "单位", dataIndex: "unit" }]} /></>;
}

export function InventoryInboundPage() { return <StockDocumentPage mode="inbound" />; }
export function InventoryOutboundPage() { return <StockDocumentPage mode="outbound" />; }
