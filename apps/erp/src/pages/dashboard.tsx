import { AlertTriangle, ArrowRight, Boxes, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, PackageCheck, TrendingUp, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context/workspace";
import { PageHeader, StatusBadge } from "../components/ui";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

export function DashboardPage() {
  const { projects, quotes, orders, dataSource } = useWorkspace();
  const todayLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
  const openQuotes = quotes.filter((quote) => !["已接受", "已失效"].includes(quote.status));
  const activeOrders = orders.filter((order) => !["已发货", "已取消"].includes(order.status));
  const revenue = orders.filter((order) => order.status === "已发货").reduce((sum, order) => sum + order.amount, 0);
  const pipeline = quotes.filter((quote) => !["已失效"].includes(quote.status)).reduce((sum, quote) => sum + quote.amount, 0);
  const stageCounts = ["线索", "方案中", "已报价", "已成交"].map((stage) => ({ stage, value: projects.filter((project) => project.stage === stage).length }));
  const maxStage = Math.max(...stageCounts.map((item) => item.value), 1);
  const liveTasks = [
    ...quotes.slice(0, 2).map((quote) => ({ href: "/quotes", title: `报价 ${quote.quoteNo}`, detail: `${quote.customer} · ${quote.project}`, priority: "待处理" })),
    ...orders.slice(0, 2).map((order) => ({ href: `/orders/${order.id}`, title: order.orderNo, detail: `${order.customer} · ${order.project}`, priority: "订单" }))
  ];

  return (
    <div className="page dashboard-page">
      <PageHeader title="运营仪表盘" description={`${todayLabel} · 当前组织经营与履约概览`} actions={<Link className="button secondary" to="/orders"><ClipboardCheck size={16} />查看全部订单</Link>} />

      <section className="metric-grid">
        <article className="metric-card"><div className="metric-head"><span>销售机会金额</span><CircleDollarSign size={18} /></div><strong>{money.format(pipeline)}</strong><div className="metric-foot positive"><TrendingUp size={14} />较上月 +12.4%</div></article>
        <article className="metric-card"><div className="metric-head"><span>进行中项目</span><Boxes size={18} /></div><strong>{projects.filter((item) => !["已成交", "暂停"].includes(item.stage)).length}<small> 个</small></strong><div className="metric-foot">{projects.filter((item) => item.stage === "方案中").length} 个等待定稿</div></article>
        <article className="metric-card"><div className="metric-head"><span>待处理报价</span><CircleDollarSign size={18} /></div><strong>{openQuotes.length}<small> 份</small></strong><div className="metric-foot warning"><Clock3 size={14} />{quotes.filter((item) => item.status === "待审批").length} 份等待审批</div></article>
        <article className="metric-card"><div className="metric-head"><span>已交付金额</span><PackageCheck size={18} /></div><strong>{money.format(revenue)}</strong><div className="metric-foot positive"><CheckCircle2 size={14} />本月履约稳定</div></article>
      </section>

      {false && <>
      <section className="dashboard-grid">
        <article className="panel pipeline-panel">
          <header className="panel-header"><div><h2>销售漏斗</h2><p>项目按当前阶段分布</p></div><Link to="/projects">查看项目 <ArrowRight size={14} /></Link></header>
          <div className="pipeline-bars">
            {stageCounts.map((item, index) => <div className="pipeline-row" key={item.stage}><span>{item.stage}</span><div className="pipeline-track"><div style={{ width: `${Math.max(9, item.value / maxStage * 100)}%` }} data-index={index} /></div><strong>{item.value}</strong></div>)}
          </div>
          <div className="pipeline-summary"><span>预计成交金额</span><strong>{money.format(quotes.filter((quote) => ["待审批", "已发送"].includes(quote.status)).reduce((sum, quote) => sum + quote.amount, 0))}</strong></div>
        </article>

        <article className="panel task-panel" data-live={dataSource !== "demo" ? "true" : "false"}>
          <header className="panel-header"><div><h2>今日待办</h2><p><CalendarDays size={13} />按风险与截止时间排序</p></div><span className="count-chip">4 项</span></header>
          {dataSource !== "demo" && <div className="live-task-summary"><span className="count-chip">{liveTasks.length} 项</span></div>}
          {dataSource !== "demo" && <div className="task-list live-task-list">{liveTasks.length ? liveTasks.map((task) => <Link to={task.href} className="task-item" key={`${task.href}-${task.title}`}><span className="task-icon info"><ClipboardCheck size={17} /></span><span><strong>{task.title}</strong><small>{task.detail}</small></span><b>{task.priority}</b></Link>) : <div className="empty-inline">暂无待办</div>}</div>}
          <div className="task-list demo-task-list">
            <Link to="/quotes" className="task-item"><span className="task-icon danger"><AlertTriangle size={17} /></span><span><strong>报价 QT-202608-031 等待审批</strong><small>客户要求今日 16:00 前回复</small></span><b>高</b></Link>
            <Link to="/production" className="task-item"><span className="task-icon warning"><Truck size={17} /></span><span><strong>SO-202608-014 等待提货</strong><small>已完成质检，承运商尚未进场</small></span><b>中</b></Link>
            <Link to="/orders/o-501/production" className="task-item"><span className="task-icon info"><Boxes size={17} /></span><span><strong>组装工序完成度 62%</strong><small>SO-202608-018 · 计划 8 月 18 日终检</small></span><b>中</b></Link>
            <Link to="/projects" className="task-item"><span className="task-icon neutral"><Clock3 size={17} /></span><span><strong>2 个方案超过 48 小时未更新</strong><small>建议联系项目负责人确认进度</small></span><b>低</b></Link>
          </div>
        </article>
      </section>

      <section className="panel recent-orders">
        <header className="panel-header"><div><h2>近期订单</h2><p>当前组织最近创建与更新的订单</p></div><Link to="/orders">查看全部 <ArrowRight size={14} /></Link></header>
        <div className="table-wrap"><table><thead><tr><th>订单号</th><th>客户 / 项目</th><th>金额</th><th>订单状态</th><th>生产</th><th>交付日期</th><th /></tr></thead><tbody>{activeOrders.slice(0, 5).map((order) => <tr key={order.id}><td><Link className="primary-link" to={`/orders/${order.id}`}>{order.orderNo}</Link></td><td><strong>{order.customer}</strong><small>{order.project}</small></td><td className="numeric">{money.format(order.amount)}</td><td><StatusBadge value={order.status} /></td><td><StatusBadge value={order.productionStatus} /></td><td>{order.dueDate}</td><td><Link className="icon-button" title="查看订单" to={`/orders/${order.id}`}><ArrowRight size={16} /></Link></td></tr>)}</tbody></table></div>
      </section>
      </>}
    </div>
  );
}
