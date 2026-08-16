import { AlertTriangle, Boxes, CalendarClock, Check, PackageCheck, PlayCircle, ScanLine, Send, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, FormActions, Modal, Notice, PageHeader, SearchField, StatusBadge, stopSubmit } from "../components/ui";
import { useWorkspace } from "../context/workspace";
import type { Order, ProductionStatus } from "../types";

const progress: Record<ProductionStatus, number> = { "未排产": 0, "备料": 24, "组装": 62, "质检": 88, "已完工": 100 };

export function ProductionPage() {
  const { orders, updateProduction, createShipment } = useWorkspace();
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const threeDayKey = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shipmentOrder, setShipmentOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useMemo(() => orders.filter((order) => !["已发货", "已取消"].includes(order.status) && `${order.orderNo}${order.customer}${order.project}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [orders, query]);
  const shipmentQueue = active.filter((order) => order.status === "待发货" || order.shipmentStatus !== "未创建");

  async function changeProduction(order: Order, next: "组装" | "已完工") {
    setBusy(order.id); setError(null);
    try { await updateProduction(order.id, next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "生产状态更新失败"); }
    finally { setBusy(null); }
  }

  async function submitShipment(form: FormData) {
    if (!shipmentOrder) return;
    setBusy(shipmentOrder.id); setError(null);
    try {
      const shippedAt = String(form.get("shippedAt") || "");
      await createShipment({ orderId: shipmentOrder.id, carrier: String(form.get("carrier")), trackingNo: String(form.get("trackingNo")), packages: Number(form.get("packages")) || 1, shippedAt: shippedAt ? new Date(shippedAt).toISOString() : undefined });
      setShipmentOrder(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发运单创建失败"); }
    finally { setBusy(null); }
  }

  return (
    <div className="page">
      <PageHeader title="生产与发货" description="按订单生命周期下达生产、完成生产并创建发运单。" actions={<button className="button secondary"><ScanLine size={16} />扫描工单</button>} />
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="production-kpis"><div><span className="kpi-icon info"><Boxes size={19} /></span><span><small>生产中</small><strong>{active.filter((order) => order.status === "生产中").length}</strong></span></div><div><span className="kpi-icon warning"><CalendarClock size={19} /></span><span><small>三日内交付</small><strong>{active.filter((order) => order.dueDate >= todayKey && order.dueDate <= threeDayKey).length}</strong></span></div><div><span className="kpi-icon success"><PackageCheck size={19} /></span><span><small>已完成生产</small><strong>{active.filter((order) => order.productionStatus === "已完工").length}</strong></span></div><div><span className="kpi-icon danger"><AlertTriangle size={19} /></span><span><small>暂停订单</small><strong>{active.filter((order) => order.status === "暂停").length}</strong></span></div></section>
      <section className="panel table-panel"><div className="table-toolbar"><SearchField value={query} onChange={setQuery} placeholder="搜索生产订单" /><div className="legend"><span><i className="legend-dot delayed" />临近交付</span><span><i className="legend-dot normal" />计划正常</span></div></div>{active.length ? <div className="table-wrap"><table><thead><tr><th>订单</th><th>客户 / 项目</th><th>计划交付</th><th>当前工序</th><th>完成度</th><th>发运</th><th>生产动作</th></tr></thead><tbody>{active.map((order) => { const isDueSoon = order.dueDate >= todayKey && order.dueDate <= threeDayKey; return <tr key={order.id}><td><Link className="primary-link" to={`/orders/${order.id}/production`}>{order.orderNo}</Link><small>{order.owner}</small></td><td><strong>{order.customer}</strong><small>{order.project}</small></td><td><span className={isDueSoon ? "date-risk" : ""}>{order.dueDate}</span></td><td><StatusBadge value={order.productionStatus} /></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${progress[order.productionStatus]}%` }} /></div><b>{progress[order.productionStatus]}%</b></div></td><td><StatusBadge value={order.shipmentStatus} /></td><td>{order.status === "待生产" ? <button className="button compact primary" disabled={busy === order.id} onClick={() => void changeProduction(order, "组装")}><PlayCircle size={14} />开始生产</button> : order.status === "生产中" ? <button className="button compact primary" disabled={busy === order.id} onClick={() => void changeProduction(order, "已完工")}><Check size={14} />完成生产</button> : <span className="muted">等待前置流程</span>}</td></tr>; })}</tbody></table></div> : <EmptyState title="没有生产任务" />}</section>
      <section className="panel shipment-queue"><header className="panel-header padded"><div><h2>发运队列</h2><p>生产完工或已有发运记录的订单</p></div><span className="count-chip">{shipmentQueue.length}</span></header>{shipmentQueue.length ? <div className="shipment-queue-grid">{shipmentQueue.map((order) => <article key={order.id}><div className="shipment-queue-icon"><Truck size={19} /></div><div><Link to={`/orders/${order.id}/shipment`}>{order.orderNo}</Link><p>{order.customer} · {order.project}</p><small>{order.shipmentStatus === "未创建" ? "等待创建发运单" : `当前状态：${order.shipmentStatus}`}</small></div>{order.status === "待发货" && order.shipmentStatus === "未创建" ? <button className="button compact primary" disabled={busy === order.id} onClick={() => setShipmentOrder(order)}><Send size={14} />创建发运</button> : <Link className="button compact secondary" to={`/orders/${order.id}/shipment`}>查看发运</Link>}</article>)}</div> : <EmptyState title="暂无待发运订单" detail="生产完成的订单会自动进入此队列。" />}</section>

      <Modal open={Boolean(shipmentOrder)} onClose={() => setShipmentOrder(null)} title="创建发运单" description={shipmentOrder ? `${shipmentOrder.orderNo} · ${shipmentOrder.customer}` : undefined}><form className="modal-form" onSubmit={stopSubmit(submitShipment)}><div className="form-grid"><label><span>承运商</span><input name="carrier" required /></label><label><span>运单号</span><input name="trackingNo" required /></label><label><span>包装件数</span><input name="packages" type="number" min="1" defaultValue="1" required /></label><label><span>发出时间</span><input name="shippedAt" type="datetime-local" /></label></div><FormActions onCancel={() => setShipmentOrder(null)} submitting={Boolean(busy)} submitLabel="创建并发运" /></form></Modal>
    </div>
  );
}
