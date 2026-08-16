import { ArrowUpRight, BadgeCheck, Copy, Download, MoreHorizontal, Plus, Send, ShoppingCart, Stamp, Undo2 } from "lucide-react";
import { Dropdown } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, Notice, PageHeader, SearchField, StatusBadge } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import type { Quote, QuoteStatus } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

function isDealerRole(role: string | undefined): boolean {
  return Boolean(role && role.startsWith("dealer"));
}

function moneyFromMinor(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : money.format(value / 100);
}

export function QuotesPage() {
  const { quotes, orders, transitionQuote, createOrderFromQuote } = useWorkspace();
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canApproveQuotes = can("quotes.approve");
  const showMultiplierPricing = !isDealerRole(session?.user.role) && (session?.mode === "demo" || can("quotes.multiplier.view"));
  const filtered = useMemo(() => quotes.filter((quote) => (status === "全部状态" || quote.status === status) && `${quote.quoteNo}${quote.customer}${quote.project}${quote.owner}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, quotes, status]);

  async function changeStatus(id: string, next: QuoteStatus) {
    setBusy(id); setError(null);
    try { await transitionQuote(id, next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "报价状态更新失败"); }
    finally { setBusy(null); }
  }

  async function convertToOrder(quote: Quote) {
    setBusy(quote.id); setError(null);
    try {
      const order = await createOrderFromQuote(quote.id);
      if (order) navigate(`/orders/${order.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "订单创建失败");
    } finally { setBusy(null); }
  }

  function quoteActions(quote: Quote) {
    const disabled = busy === quote.id;
    const canCreateOrders = can("orders.create");
    const existingOrder = orders.find((order) => order.acceptedQuoteId === quote.id);
    const primary = existingOrder
      ? { label: "查看订单", icon: <ShoppingCart size={14} />, run: () => navigate(`/orders/${existingOrder.id}`) }
      : quote.status === "已转订单"
        ? null
      : quote.status === "待审批" && canApproveQuotes
      ? { label: "批准报价", icon: <Stamp size={14} />, run: () => void changeStatus(quote.id, "已批准") }
      : quote.status === "草稿" || quote.status === "需修改"
        ? { label: "提交总部", icon: <Send size={14} />, run: () => void changeStatus(quote.id, "待审批") }
        : quote.status === "已批准"
          ? { label: "客户确认", icon: <BadgeCheck size={14} />, run: () => void changeStatus(quote.id, "客户已确认") }
          : (quote.status === "客户已确认" || quote.status === "已接受") && canCreateOrders
            ? { label: "创建订单", icon: <ShoppingCart size={14} />, run: () => void convertToOrder(quote) }
            : null;
    const menuItems = [
      ...(quote.status === "待审批" || quote.status === "已批准" || quote.status === "客户已确认"
        ? [{ key: "return", label: <span className="menu-item-with-icon"><Undo2 size={14} />退回修改</span> }]
        : []),
      { key: "copy", label: <span className="menu-item-with-icon"><Copy size={14} />复制报价</span> }
    ];
    return <div className="row-actions">
      {primary && <button disabled={disabled} className="button compact primary" onClick={primary.run}>{primary.icon}{primary.label}</button>}
      <Dropdown disabled={disabled} trigger={["click"]} overlayClassName="erp-quote-actions-menu" menu={{ items: menuItems, onClick: ({ key }) => {
        if (key === "return") void changeStatus(quote.id, "需修改");
      } }}>
        <button type="button" className="icon-button" title="更多报价操作" aria-label="更多报价操作"><MoreHorizontal size={16} /></button>
      </Dropdown>
    </div>;
  }

  return (
    <div className="page">
      <PageHeader title="报价管理" description={showMultiplierPricing ? "管理报价版本、倍率参考价、最终报价与客户确认状态。" : "管理报价版本、折扣审批与客户确认状态。"} actions={<><button className="button secondary"><Download size={16} />导出</button><button className="button primary"><Plus size={16} />新建报价</button></>} />
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="panel table-panel">
        <div className="table-toolbar"><SearchField value={query} onChange={setQuery} placeholder="搜索报价号、客户或项目" /><label className="select-control"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部状态</option><option>草稿</option><option>待审批</option><option>需修改</option><option>已批准</option><option>已发送</option><option>客户已确认</option><option>已接受</option><option>已转订单</option><option>已失效</option></select></label></div>
        {filtered.length ? <div className="table-wrap"><table><thead><tr><th>报价单</th><th>客户 / 项目</th><th>负责人</th>{showMultiplierPricing && <><th>1.0 基准价</th><th>倍率</th><th>倍率参考价</th></>}<th>最终报价</th><th>折扣</th><th>状态</th><th>有效期</th><th>下一步</th></tr></thead><tbody>{filtered.map((quote) => <tr key={quote.id}><td><button className="link-button">{quote.quoteNo}</button><small>版本 v{quote.version}</small></td><td><strong>{quote.customer}</strong><small>{quote.project}</small></td><td>{quote.owner}</td>{showMultiplierPricing && <><td className="numeric">{moneyFromMinor(quote.basePriceTotalMinor)}</td><td>{quote.salesMultiplierBasisPoints === null || quote.salesMultiplierBasisPoints === undefined ? <span className="muted">未记录</span> : (quote.salesMultiplierBasisPoints / 10000).toFixed(2)}</td><td className="numeric">{moneyFromMinor(quote.multiplierQuoteTotalMinor)}</td></>}<td className="numeric strong">{money.format(quote.amount)}</td><td>{quote.discount}%</td><td><StatusBadge value={quote.status} /></td><td>{quote.validUntil}</td><td>{quoteActions(quote)}</td></tr>)}</tbody></table></div> : <EmptyState title="没有匹配的报价" />}
      </section>
      <aside className="summary-strip"><div><ArrowUpRight size={18} /><span>本期报价总额</span><strong>{money.format(filtered.reduce((sum, quote) => sum + quote.amount, 0))}</strong></div><div><BadgeCheck size={18} /><span>已接受</span><strong>{filtered.filter((quote) => quote.status === "已接受" || quote.status === "客户已确认").length} 份</strong></div><div><Send size={18} /><span>平均折扣</span><strong>{filtered.length ? Math.round(filtered.reduce((sum, quote) => sum + quote.discount, 0) / filtered.length) : 0}%</strong></div></aside>
    </div>
  );
}
