import type { AuditEvent, Dealer, DesignTemplate, FactoryEmployee, Order, OrderDetail, PriceList, Quote, Tenant, WorkspaceData, CustomerProject } from "./types";
import { unavailableOrderConfiguration } from "./lib/order-configuration";

export const demoTenants: Tenant[] = [
  { id: "tenant-sh", name: "上海旗舰展厅", code: "SH01", plan: "总部" },
  { id: "tenant-hz", name: "杭州经销中心", code: "HZ02", plan: "渠道" },
  { id: "tenant-sz", name: "深圳项目部", code: "SZ03", plan: "项目" }
];

export const demoProjects: CustomerProject[] = [
  { id: "p-101", code: "PJ-260811", customer: "澄远建筑事务所", contact: "许嘉", phone: "138 0000 2119", name: "徐汇办公空间改造", site: "上海 · 徐汇", owner: "林乔", stage: "方案中", budget: 680000, quoteAmount: 286400, suggestedQuoteAmount: 296800, quoteSource: "manual", quoteId: "q-301", quoteRevision: 3, quoteStatus: "submitted", quoteEditable: false, quoteNote: null, updatedAt: "2026-08-11 09:42" },
  { id: "p-102", code: "PJ-260807", customer: "明介科技", contact: "沈一苇", phone: "136 0000 9043", name: "董事层会议区", site: "杭州 · 滨江", owner: "陈默", stage: "已报价", budget: 238000, quoteAmount: 174800, suggestedQuoteAmount: 184000, quoteSource: "quote", quoteId: "q-302", quoteRevision: 2, quoteStatus: "sent", quoteEditable: false, quoteNote: null, updatedAt: "2026-08-10 17:20" },
  { id: "p-103", code: "PJ-260728", customer: "秩序设计研究室", contact: "姜宁", phone: "135 0000 1182", name: "样品资料库", site: "深圳 · 南山", owner: "林乔", stage: "已成交", budget: 420000, quoteAmount: 398600, suggestedQuoteAmount: 398600, quoteSource: "quote", quoteId: "q-303", quoteRevision: 5, quoteStatus: "accepted", quoteEditable: false, quoteNote: "随单赠送标准色卡一套。", updatedAt: "2026-08-09 13:06" },
  { id: "p-104", code: "PJ-260722", customer: "白线品牌咨询", contact: "叶子", phone: "139 0000 3351", name: "接待与档案墙", site: "上海 · 静安", owner: "周航", stage: "线索", budget: 160000, quoteAmount: 128900, suggestedQuoteAmount: 132000, quoteSource: "manual", quoteId: "q-304", quoteRevision: 1, quoteStatus: "draft", quoteEditable: true, quoteNote: "送白色板材小样 1 套，发货前确认。", updatedAt: "2026-08-08 10:25" },
  { id: "p-105", code: "PJ-260715", customer: "南屿私宅", contact: "梁先生", phone: "137 0000 7094", name: "客厅组合柜", site: "宁波 · 鄞州", owner: "陈默", stage: "暂停", budget: 92000, quoteAmount: null, suggestedQuoteAmount: 92800, quoteSource: "suggested_retail", quoteId: null, quoteRevision: null, quoteStatus: null, quoteEditable: true, quoteNote: null, updatedAt: "2026-08-03 15:48" }
];

export const demoTemplates: DesignTemplate[] = [
  { id: "t-01", name: "双列三层文件柜", code: "TPL-OFF-021", category: "办公", dimensions: "1500 × 350 × 1090 mm", modules: 6, version: 4, status: "已发布", usageCount: 46, updatedAt: "2026-08-09", layout: [2, 2, 2] },
  { id: "t-02", name: "横向矮柜组合", code: "TPL-LIV-014", category: "客厅", dimensions: "2250 × 500 × 390 mm", modules: 3, version: 7, status: "已发布", usageCount: 81, updatedAt: "2026-08-06", layout: [3] },
  { id: "t-03", name: "玄关衣帽收纳", code: "TPL-ENT-008", category: "玄关", dimensions: "1500 × 500 × 1440 mm", modules: 7, version: 2, status: "草稿", usageCount: 0, updatedAt: "2026-08-11", layout: [2, 2, 2, 1] },
  { id: "t-04", name: "移动档案塔", code: "TPL-STO-036", category: "储物", dimensions: "750 × 500 × 1790 mm", modules: 5, version: 5, status: "已发布", usageCount: 28, updatedAt: "2026-07-30", layout: [1, 1, 1, 1, 1] },
  { id: "t-05", name: "双面空间隔断", code: "TPL-OFF-044", category: "办公", dimensions: "2250 × 350 × 1090 mm", modules: 9, version: 1, status: "已归档", usageCount: 12, updatedAt: "2026-07-18", layout: [3, 3, 3] }
];

export const demoQuotes: Quote[] = [
  { id: "q-301", quoteNo: "QT-202608-031", customer: "澄远建筑事务所", project: "徐汇办公空间改造", owner: "林乔", amount: 286400, discount: 92, status: "待审批", validUntil: "2026-08-25", version: 3, updatedAt: "2026-08-11 09:40" },
  { id: "q-302", quoteNo: "QT-202608-026", customer: "明介科技", project: "董事层会议区", owner: "陈默", amount: 174800, discount: 95, status: "已发送", validUntil: "2026-08-21", version: 2, updatedAt: "2026-08-10 17:18" },
  { id: "q-303", quoteNo: "QT-202608-019", customer: "秩序设计研究室", project: "样品资料库", owner: "林乔", amount: 398600, discount: 90, status: "已接受", validUntil: "2026-08-18", version: 5, updatedAt: "2026-08-09 13:05" },
  { id: "q-304", quoteNo: "QT-202608-012", customer: "白线品牌咨询", project: "接待与档案墙", owner: "周航", amount: 128900, discount: 100, status: "草稿", validUntil: "2026-08-30", version: 1, updatedAt: "2026-08-08 10:21" },
  { id: "q-305", quoteNo: "QT-202607-098", customer: "汇声文化", project: "唱片资料陈列", owner: "陈默", amount: 208500, discount: 88, status: "已失效", validUntil: "2026-08-02", version: 2, updatedAt: "2026-08-03 09:10" }
];

export const demoOrders: Order[] = [
  { id: "o-501", orderNo: "SO-202608-018", customer: "秩序设计研究室", project: "样品资料库", dealer: "上海旗舰展厅", owner: "林乔", amount: 398600, status: "生产中", productionStatus: "组装", shipmentStatus: "未创建", dueDate: "2026-08-22", createdAt: "2026-08-09", version: 5 },
  { id: "o-502", orderNo: "SO-202608-014", customer: "正则联合办公", project: "陆家嘴二期", dealer: "华东合伙人", owner: "周航", amount: 612800, status: "待发货", productionStatus: "已完工", shipmentStatus: "待提货", dueDate: "2026-08-13", createdAt: "2026-08-06", version: 7 },
  { id: "o-503", orderNo: "SO-202607-092", customer: "瀚蓝私宅", project: "书房与客厅", dealer: "杭州经销中心", owner: "陈默", amount: 186300, status: "已发货", productionStatus: "已完工", shipmentStatus: "运输中", dueDate: "2026-08-10", createdAt: "2026-07-29", version: 6 },
  { id: "o-504", orderNo: "SO-202607-081", customer: "唐栖酒店", project: "行政楼层茶歇区", dealer: "深圳项目部", owner: "林乔", amount: 257900, status: "已发货", productionStatus: "已完工", shipmentStatus: "已签收", dueDate: "2026-08-04", createdAt: "2026-07-22", version: 8 },
  { id: "o-505", orderNo: "SO-202608-020", customer: "叙石咨询", project: "合伙人办公室", dealer: "上海旗舰展厅", owner: "周航", amount: 146700, status: "待确认", productionStatus: "未排产", shipmentStatus: "未创建", dueDate: "2026-08-28", createdAt: "2026-08-10", version: 1 }
];

export const demoEmployees: FactoryEmployee[] = [
  { id: "emp-linqiao", userId: "emp-linqiao", name: "林乔", username: "linqiao", email: "linqiao@usm.local", phone: "138 0000 2119", status: "active", lastLoginAt: "2026-08-13 09:18", createdAt: "2026-06-03" },
  { id: "emp-chenmo", userId: "emp-chenmo", name: "陈默", username: "chenmo", email: "chenmo@usm.local", phone: "136 0000 9043", status: "active", lastLoginAt: "2026-08-13 08:47", createdAt: "2026-06-08" },
  { id: "emp-zhouhang", userId: "emp-zhouhang", name: "周航", username: "zhouhang", email: "zhouhang@usm.local", phone: "139 0000 3351", status: "active", lastLoginAt: "2026-08-12 17:25", createdAt: "2026-06-22" }
];

export const demoDealers: Dealer[] = [
  { id: "d-01", code: "DLR-SH-001", name: "上海旗舰展厅", region: "华东", contact: "林乔", phone: "138 0000 2119", email: "linqiao@example.cn", level: "核心", discountRate: 88, status: "启用", lastActiveAt: "2026-08-11 09:48" },
  { id: "d-02", code: "DLR-HZ-007", name: "杭州经销中心", region: "华东", contact: "陈默", phone: "136 0000 9043", email: "chenmo@example.cn", level: "核心", discountRate: 86, status: "启用", lastActiveAt: "2026-08-11 08:26" },
  { id: "d-03", code: "DLR-SZ-012", name: "深圳项目部", region: "华南", contact: "姜宁", phone: "135 0000 1182", email: "jiangning@example.cn", level: "标准", discountRate: 90, status: "启用", lastActiveAt: "2026-08-10 18:02" },
  { id: "d-04", code: "DLR-CD-015", name: "成都空间合作社", region: "西南", contact: "陆庭", phone: "139 0000 3351", email: "luting@example.cn", level: "观察", discountRate: 94, status: "暂停", lastActiveAt: "2026-07-28 11:40" }
];

export const demoPriceLists: PriceList[] = [
  { id: "pl-01", name: "中国大陆标准零售价", code: "CN-RRP", market: "中国大陆", currency: "CNY", version: "2026.08", itemCount: 486, effectiveFrom: "2026-08-01", status: "生效中", updatedAt: "2026-07-28 14:30" },
  { id: "pl-02", name: "核心经销商采购价", code: "CN-DLR-A", market: "中国大陆", currency: "CNY", version: "2026.08", itemCount: 486, effectiveFrom: "2026-08-01", status: "生效中", updatedAt: "2026-07-28 14:36" },
  { id: "pl-03", name: "项目特批价格", code: "CN-PROJECT", market: "中国大陆", currency: "CNY", version: "2026.Q3.2", itemCount: 112, effectiveFrom: "2026-07-15", status: "生效中", updatedAt: "2026-08-08 16:12" },
  { id: "pl-04", name: "下一季度渠道价", code: "CN-DLR-NEXT", market: "中国大陆", currency: "CNY", version: "2026.10-draft", itemCount: 492, effectiveFrom: "2026-10-01", status: "草稿", updatedAt: "2026-08-10 10:05" }
];

export const demoAudits: AuditEvent[] = [
  { id: "a-01", actor: "林乔", role: "销售主管", action: "提交审批", resource: "报价", resourceId: "QT-202608-031", tenant: "上海旗舰展厅", createdAt: "2026-08-11 09:40:16", ip: "10.21.4.18", detail: "报价 v3，含税金额 ¥286,400" },
  { id: "a-02", actor: "系统", role: "自动任务", action: "状态更新", resource: "订单", resourceId: "SO-202608-018", tenant: "上海旗舰展厅", createdAt: "2026-08-11 09:12:04", ip: "internal", detail: "生产状态由备料变更为组装" },
  { id: "a-03", actor: "陈默", role: "销售", action: "发送报价", resource: "报价", resourceId: "QT-202608-026", tenant: "杭州经销中心", createdAt: "2026-08-10 17:18:52", ip: "10.24.8.03", detail: "发送至 shenyiwei@example.cn" },
  { id: "a-04", actor: "姜宁", role: "生产协调", action: "创建发运", resource: "发运单", resourceId: "SHP-260810-006", tenant: "深圳项目部", createdAt: "2026-08-10 15:37:28", ip: "10.22.6.90", detail: "6 件，德邦物流" },
  { id: "a-05", actor: "周航", role: "管理员", action: "调整折扣", resource: "经销商", resourceId: "DLR-CD-015", tenant: "上海旗舰展厅", createdAt: "2026-08-10 11:03:17", ip: "10.21.3.67", detail: "折扣由 92% 调整为 94%" },
  { id: "a-06", actor: "陆庭", role: "经销商", action: "登录失败", resource: "账号", resourceId: "luting@example.cn", tenant: "成都空间合作社", createdAt: "2026-08-09 22:14:01", ip: "116.169.44.21", detail: "连续第 2 次密码错误" }
];

export const demoWorkspace: WorkspaceData = {
  projects: demoProjects,
  templates: demoTemplates,
  quotes: demoQuotes,
  orders: demoOrders,
  dealers: demoDealers,
  priceLists: demoPriceLists,
  audits: demoAudits
};

export const demoOrderDetails: Record<string, OrderDetail> = Object.fromEntries(
  demoOrders.map((order, orderIndex) => [
    order.id,
    {
      ...order,
      quoteNo: `QT-${order.orderNo.slice(3)}`,
      poNumber: orderIndex === 4 ? "待补充" : `PO-${260800 + orderIndex + 31}`,
      address: orderIndex % 2 === 0 ? "上海市徐汇区龙腾大道 2600 号 A3 栋" : "杭州市滨江区江南大道 1768 号 12 层",
      contact: ["姜宁", "何竞", "梁先生", "宋垣", "秦悦"][orderIndex],
      phone: `138 0000 ${3100 + orderIndex * 173}`,
      note: orderIndex === 0 ? "现场电梯净高 2.2m，外包装单件高度需控制；安装前联系物业预约。" : "按确认图纸与颜色样交付，出厂前上传质检照片。",
      quoteNote: orderIndex === 0 ? "随单赠送标准色卡一套，发货前由销售确认。" : "",
      configuration: unavailableOrderConfiguration("演示订单没有冻结配置快照。", `config-4.22.${orderIndex}`),
      lines: [
        { id: `${order.id}-l1`, sku: "USM-FRM-750-CH", description: "750mm 镀铬横杆", color: "镀铬", qty: 18 + orderIndex * 2, unitPrice: 428, total: (18 + orderIndex * 2) * 428 },
        { id: `${order.id}-l2`, sku: "USM-PNL-750-350", description: "750 × 350 金属面板", color: orderIndex % 2 === 0 ? "石墨黑" : "纯白", qty: 12 + orderIndex, unitPrice: 1260, total: (12 + orderIndex) * 1260 },
        { id: `${order.id}-l3`, sku: "USM-ACC-DROP", description: "下翻门组件", color: orderIndex % 2 === 0 ? "石墨黑" : "纯白", qty: 4 + orderIndex, unitPrice: 2180, total: (4 + orderIndex) * 2180 },
        { id: `${order.id}-l4`, sku: "USM-HDW-BALL", description: "球形连接件与紧固件套装", color: "镀铬", qty: 24 + orderIndex * 4, unitPrice: 196, total: (24 + orderIndex * 4) * 196 }
      ],
      production: [
        { id: `${order.id}-s1`, name: "物料齐套", owner: "周师傅", status: orderIndex === 4 ? "待处理" : "已完成", plannedAt: "2026-08-11", completedAt: orderIndex === 4 ? undefined : "2026-08-10 16:20" },
        { id: `${order.id}-s2`, name: "框架组装", owner: "A 组", status: order.productionStatus === "组装" ? "进行中" : order.productionStatus === "未排产" || order.productionStatus === "备料" ? "待处理" : "已完成", plannedAt: "2026-08-13" },
        { id: `${order.id}-s3`, name: "面板安装", owner: "B 组", status: order.productionStatus === "质检" || order.productionStatus === "已完工" ? "已完成" : "待处理", plannedAt: "2026-08-15" },
        { id: `${order.id}-s4`, name: "终检包装", owner: "质检组", status: order.productionStatus === "质检" ? "进行中" : order.productionStatus === "已完工" ? "已完成" : "待处理", plannedAt: "2026-08-18" }
      ],
      shipments: order.shipmentStatus === "未创建" ? [] : [{
        id: `${order.id}-sh1`, shipmentNo: `SHP-${order.orderNo.slice(-9)}`, carrier: "德邦物流", trackingNo: `DPK${82190573 + orderIndex * 1097}`, status: order.shipmentStatus, packages: 6 + orderIndex, shippedAt: order.shipmentStatus === "待提货" ? undefined : "2026-08-09 14:30", signedAt: order.shipmentStatus === "已签收" ? "2026-08-10 11:08" : undefined
      }]
    }
  ])
);
