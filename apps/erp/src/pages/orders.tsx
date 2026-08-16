import { Button, Input, Segmented, Select, Space, Table, Tooltip, type TableProps } from "antd";
import { ArrowRight, Download, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, StatusBadge } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api } from "../lib/api";
import type { FactoryEmployee, Order } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const orderStatuses = ["全部状态", "待确认", "已确认", "待生产", "生产中", "待发货", "已发货"];

export function OrdersPage() {
  const { orders, refresh, loading, assignOrder } = useWorkspace();
  const { can, session } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [ownerUserId, setOwnerUserId] = useState<string | undefined>();
  const [employees, setEmployees] = useState<FactoryEmployee[]>([]);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const orderScope = session?.dataScopes?.orders?.scope;
  const isAssignedOnly = !can("orders.assign") && (orderScope === "own" || orderScope === "assigned");
  const canSeePrice = session?.fieldPolicy?.price !== "none";

  useEffect(() => {
    if (!can("orders.assign") || !session) return;
    let cancelled = false;
    api.listEmployees(session.activeTenantId).then((items) => { if (!cancelled) setEmployees(items.filter((item) => item.status === "active")); }).catch(() => { if (!cancelled) setEmployees([]); });
    return () => { cancelled = true; };
  }, [can, session]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return orders.filter((order) => (status === "全部状态" || order.status === status)
      && (!ownerUserId || (ownerUserId === "unassigned" ? !order.ownerUserId : order.ownerUserId === ownerUserId))
      && (!normalized || `${order.orderNo}${order.customer}${order.project}${order.dealer}${order.owner}`.toLocaleLowerCase().includes(normalized)));
  }, [orders, ownerUserId, query, status]);

  async function changeAssignee(order: Order, nextOwnerUserId: string | undefined) {
    setAssigningOrderId(order.id);
    try { await assignOrder(order.id, nextOwnerUserId || null); }
    finally { setAssigningOrderId(null); }
  }

  const columns: TableProps<Order>["columns"] = [
    { title: "订单号", dataIndex: "orderNo", width: 180, fixed: "left", render: (_, order) => <div className="erp-primary-cell"><Link className="primary-link" to={`/orders/${order.id}`}>{order.orderNo}</Link><span>v{order.version} · {order.createdAt}</span></div> },
    { title: "客户 / 项目", dataIndex: "customer", width: 220, render: (_, order) => <div className="erp-primary-cell"><strong>{order.customer}</strong><span>{order.project}</span></div> },
    { title: "渠道", dataIndex: "dealer", width: 140, responsive: ["md"], ellipsis: true },
    ...(can("orders.assign") ? [{
      title: "负责人", dataIndex: "owner", width: 170,
      render: (_: unknown, order: Order) => <Select
        size="small"
        value={order.ownerUserId ?? "unassigned"}
        loading={assigningOrderId === order.id}
        options={[{ value: "unassigned", label: "未分配" }, ...employees.map((employee) => ({ value: employee.userId, label: employee.name }))]}
        onChange={(value) => void changeAssignee(order, value === "unassigned" ? undefined : String(value))}
      />
    }] : isAssignedOnly ? [] : [{ title: "负责人", dataIndex: "owner", width: 110, render: (value: string) => <span>{value}</span> }]),
    ...(canSeePrice ? [{ title: "金额", dataIndex: "amount", width: 130, align: "right" as const, render: (value: number) => <span className="numeric strong">{money.format(value)}</span> }] : []),
    { title: "订单状态", dataIndex: "status", width: 110, render: (value: string) => <StatusBadge value={value} /> },
    { title: "生产", dataIndex: "productionStatus", width: 100, responsive: ["sm"], render: (value: string) => <StatusBadge value={value} /> },
    { title: "发运", dataIndex: "shipmentStatus", width: 100, responsive: ["lg"], render: (value: string) => <StatusBadge value={value} /> },
    { title: "交付日期", dataIndex: "dueDate", width: 120, responsive: ["md"] },
    { title: "", key: "detail", width: 56, fixed: "right", render: (_, order) => <Tooltip title="查看订单"><Link className="ant-btn ant-btn-text ant-btn-sm ant-btn-icon-only" to={`/orders/${order.id}`}><ArrowRight size={15} /></Link></Tooltip> }
  ];

  const statusOptions = orderStatuses.map((value) => ({
    value,
    label: <span className="erp-segment-label"><span>{value}</span><b>{value === "全部状态" ? orders.length : orders.filter((order) => order.status === value).length}</b></span>
  }));

  return (
    <div className="page">
      <PageHeader
        title={isAssignedOnly ? "我的订单" : "销售订单"}
        description={isAssignedOnly ? "仅显示当前分配给你的订单和处理进度。" : "订单由销售基于客户已确认报价创建，跟踪确认、生产与发运的完整生命周期。"}
        actions={<Space wrap><Button icon={<RefreshCw className={loading ? "spin" : ""} size={15} />} onClick={() => void refresh()} disabled={loading}>同步</Button>{can("orders.export") && <Button icon={<Download size={15} />}>导出</Button>}</Space>}
      />
      <div className="erp-segment-scroll"><Segmented block value={status} onChange={(value) => setStatus(String(value))} options={statusOptions} /></div>
      <section className="erp-table-card">
        <div className="erp-table-toolbar"><Input.Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索订单号、客户、项目或经销商" />{can("order.assign") && <Select allowClear value={ownerUserId} onChange={(value) => setOwnerUserId(value)} placeholder="筛选负责人" prefix={<UserRound size={14} />} options={[{ value: "unassigned", label: "未分配" }, ...employees.map((employee) => ({ value: employee.userId, label: employee.name }))]} style={{ width: 170 }} />}</div>
        <Table<Order> rowKey="id" size="small" columns={columns} dataSource={filtered} scroll={{ x: 1100 }} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: "没有匹配的订单" }} />
      </section>
    </div>
  );
}
