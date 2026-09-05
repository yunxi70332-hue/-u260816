import type { OrderDetail } from "../types";

export interface SalesContractOptions {
  /** The seller information can be supplied by a tenant profile when one exists. */
  sellerName?: string;
  sellerContact?: string;
  sellerAddress?: string;
  generatedAt?: Date;
}

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0
});

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dateText(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(value).replaceAll("/", "-");
}

function dateTimeText(value: string | null | undefined): string {
  if (!value) return "待补充";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(parsed).replaceAll("/", "-");
}

function lineRows(order: OrderDetail): string {
  if (!order.lines.length) {
    return '<tr><td colspan="7" class="empty">暂无价格明细</td></tr>';
  }
  return order.lines.map((line, index) => `<tr>
    <td class="center">${index + 1}</td>
    <td class="mono">${escapeHtml(line.sku)}</td>
    <td>${escapeHtml(line.description)}</td>
    <td>${escapeHtml(line.color || "-")}</td>
    <td class="number">${escapeHtml(line.qty)}</td>
    <td class="number">${escapeHtml(money.format(line.unitPrice))}</td>
    <td class="number">${escapeHtml(money.format(line.total))}</td>
  </tr>`).join("");
}

/**
 * Builds a self-contained, print-ready contract document. The HTML format is
 * readable by Word and can also be printed to PDF from any modern browser.
 */
export function renderSalesContractHtml(order: OrderDetail, options: SalesContractOptions = {}): string {
  const generatedAt = options.generatedAt ?? new Date();
  const sellerName = options.sellerName || order.dealer || "销售方";
  const contractNo = `SC-${order.orderNo}`;
  const lineTotal = order.lines.reduce((sum, line) => sum + line.total, 0);
  const terms = [
    `订单金额：${money.format(order.amount)}。`,
    `付款节点按双方确认的报价或订单约定执行；未约定的，由双方另行书面确认。`,
    `交付日期：${order.dueDate || "待确认"}，交付周期按订单约定执行；收货地址、联系人及运输安排以订单信息为准。`,
    "产品规格、颜色和配置以本订单冻结配置快照为准；价格明细为订单金额的组成信息，最终结算以订单金额为准。",
    "如需变更产品、配置或数量，应由双方书面确认并重新确认订单金额与交付计划。",
    "产品交付后由客户按约定进行验收；发现数量、外观或配置问题，应在验收期内书面提出，双方协商处理。",
    "产品质量、安装和售后服务按双方确认的订单约定执行，保修范围及期限以订单或附件约定为准。",
    "双方签字或盖章后，本合同、订单及冻结配置快照共同作为履约依据；未尽事宜由双方协商解决。"
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(order.orderNo)} 销售合同</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #202623; font-family: "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; font-size: 12px; line-height: 1.6; }
    h1 { margin: 0 0 5px; text-align: center; font-size: 24px; letter-spacing: 3px; }
    .subtitle { margin-bottom: 20px; color: #68746d; text-align: center; }
    .meta, .party, .totals { width: 100%; border-collapse: collapse; }
    .meta { margin-bottom: 14px; }
    .meta td { width: 25%; padding: 6px 8px; border: 1px solid #cfd6d1; }
    .label { color: #68746d; white-space: nowrap; }
    .party { margin: 10px 0 18px; }
    .party td { width: 50%; padding: 10px 12px; border: 1px solid #cfd6d1; vertical-align: top; }
    .party strong { display: block; margin-bottom: 5px; font-size: 13px; }
    .lines { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
    .lines th, .lines td { padding: 7px 6px; border: 1px solid #bfc8c2; }
    .lines th { background: #f2f5f3; font-weight: 700; }
    .center { text-align: center; }
    .number { text-align: right; white-space: nowrap; }
    .mono { font-family: Consolas, monospace; white-space: nowrap; }
    .empty { padding: 20px !important; color: #68746d; text-align: center; }
    .totals { margin-top: 10px; }
    .totals td { padding: 5px 8px; text-align: right; }
    .totals .label { width: 80%; text-align: right; }
    .totals .total { border-top: 2px solid #202623; font-size: 15px; font-weight: 700; }
    h2 { margin: 22px 0 8px; font-size: 14px; }
    ol { margin: 0; padding-left: 22px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 35px; margin-top: 46px; page-break-inside: avoid; }
    .signature { min-height: 78px; border-top: 1px solid #89958e; padding-top: 7px; }
    .signature p { margin: 2px 0; }
    .footer { margin-top: 22px; color: #68746d; font-size: 10px; text-align: right; }
  </style>
</head>
<body>
  <h1>销售合同</h1>
  <div class="subtitle">合同编号：${escapeHtml(contractNo)}</div>
  <table class="meta">
    <tr><td class="label">合同编号</td><td>${escapeHtml(contractNo)}</td><td class="label">签订日期</td><td>${escapeHtml(dateText(generatedAt))}</td></tr>
    <tr><td class="label">客户名称</td><td>${escapeHtml(order.customer)}</td><td class="label">项目名称</td><td>${escapeHtml(order.project)}</td></tr>
    <tr><td class="label">订单编号</td><td>${escapeHtml(order.orderNo)}</td><td class="label">订单版本</td><td>v${escapeHtml(order.version)}</td></tr>
    <tr><td class="label">关联报价</td><td>${escapeHtml(order.quoteNo || "待补充")}</td><td class="label">客户采购单</td><td>${escapeHtml(order.poNumber || "待补充")}</td></tr>
    <tr><td class="label">客户确认时间</td><td>${escapeHtml(dateTimeText(order.customerConfirmedAt))}</td><td class="label">配置快照</td><td>${escapeHtml(order.configuration.snapshotVersion || "待补充")}</td></tr>
  </table>

  <table class="party">
    <tr>
      <td><strong>客户方</strong><div>${escapeHtml(order.customer)}</div><div>联系人：${escapeHtml(order.contact || "-")}</div><div>电话：${escapeHtml(order.phone || "-")}</div><div>收货地址：${escapeHtml(order.address || "-")}</div></td>
      <td><strong>销售方</strong><div>${escapeHtml(sellerName)}</div><div>负责人：${escapeHtml(order.owner || "-")}</div><div>联系方式：${escapeHtml(options.sellerContact || "-")}</div><div>地址：${escapeHtml(options.sellerAddress || "-")}</div></td>
    </tr>
  </table>

  <h2>一、订单明细</h2>
  <table class="lines">
    <thead><tr><th style="width:6%">序号</th><th style="width:16%">物料编码</th><th>产品说明</th><th style="width:12%">颜色</th><th style="width:8%">数量</th><th style="width:14%">单价</th><th style="width:14%">小计</th></tr></thead>
    <tbody>${lineRows(order)}</tbody>
  </table>
  <table class="totals">
    ${order.lines.length ? `<tr><td class="label">明细合计（参考）</td><td>${escapeHtml(money.format(lineTotal))}</td></tr>` : ""}
    <tr><td class="label total">订单金额</td><td class="total">${escapeHtml(money.format(order.amount))}</td></tr>
  </table>

  <h2>二、交付、付款与履约约定</h2>
  <ol>${terms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol>

  <div class="signatures">
    <div class="signature"><strong>客户方（签字/盖章）</strong><p>代表：________________</p><p>日期：________________</p></div>
    <div class="signature"><strong>销售方（签字/盖章）</strong><p>代表：________________</p><p>日期：________________</p></div>
  </div>
  <div class="footer">由订单系统生成 · 生成时间：${escapeHtml(dateText(generatedAt))}</div>
</body>
</html>`;
}

export function downloadSalesContract(order: OrderDetail, options: SalesContractOptions = {}): void {
  const html = renderSalesContractHtml(order, options);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${order.orderNo}-销售合同.doc`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSalesContract(order: OrderDetail, options: SalesContractOptions = {}): boolean {
  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(renderSalesContractHtml(order, options));
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  return true;
}
