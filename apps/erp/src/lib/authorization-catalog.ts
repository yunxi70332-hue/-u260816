import type { AuthorizationDataScope, Permission } from "../types";

export type AuthorizationModuleKey =
  | "configurator"
  | "crm"
  | "quotes"
  | "orders"
  | "fulfillment"
  | "pricing"
  | "warehouse"
  | "reports"
  | "accounts"
  | "dealers"
  | "audit";

export interface AuthorizationModuleDefinition {
  key: AuthorizationModuleKey;
  label: string;
  description: string;
  permissions: Permission[];
}

export const AUTHORIZATION_MODULES: AuthorizationModuleDefinition[] = [
  {
    key: "configurator",
    label: "配置器与设计",
    description: "配置器、模板、设计图、BOM 和附件",
    permissions: [
      "configurator.use", "templates.view", "designs.view", "designs.create", "designs.update",
      "designs.copy", "designs.delete", "designs.export", "designs.bom.export", "attachments.view", "attachments.create"
    ]
  },
  {
    key: "crm",
    label: "客户与项目",
    description: "客户、项目和客户相关导出",
    permissions: [
      "customers.view", "customers.create", "customers.update", "customers.delete", "customers.export",
      "projects.view", "projects.create", "projects.update", "projects.delete", "projects.transfer", "projects.export"
    ]
  },
  {
    key: "quotes",
    label: "报价",
    description: "报价创建、提交、审核、倍率报价、作废和导出",
    permissions: ["quotes.view", "quotes.create", "quotes.update", "quotes.submit", "quotes.approve", "quotes.cancel", "quotes.export", "quotes.multiplier.view", "quotes.multiplier.manage"]
  },
  {
    key: "orders",
    label: "订单",
    description: "下单、订单状态、负责人和订单跟进",
    permissions: ["orders.view", "orders.create", "orders.status.update", "orders.cancel", "orders.assign", "orders.follow_up", "orders.export"]
  },
  {
    key: "fulfillment",
    label: "履约",
    description: "生产、发运和物流",
    permissions: ["fulfillment.production.view", "fulfillment.production.update", "fulfillment.shipments.view", "fulfillment.shipments.create", "fulfillment.logistics.update"]
  },
  {
    key: "pricing",
    label: "价格",
    description: "经销价、零售价、主价格表和工厂成本",
    permissions: ["prices.dealer.view", "prices.retail.view", "prices.master.view", "prices.cost.view", "prices.manage"]
  },
  {
    key: "warehouse",
    label: "仓储",
    description: "库存、入库、出库、调整和调拨",
    permissions: ["inventory.availability.view", "inventory.quantity.view", "inventory.distribution.view", "inventory.value.view", "inventory.receive", "inventory.issue", "inventory.adjust", "inventory.transfer"]
  },
  {
    key: "reports",
    label: "报表",
    description: "个人、指定账号、企业汇总和财务报表",
    permissions: ["reports.personal.view", "reports.assigned.view", "reports.organization.view", "reports.financial.view", "reports.export"]
  },
  {
    key: "accounts",
    label: "账号管理",
    description: "账号管理和账号权限分配",
    permissions: ["account.manage", "permission.delegate"]
  },
  {
    key: "dealers",
    label: "经销商管理",
    description: "经销商组织和经销商工作区",
    permissions: ["dealer.manage", "dealer.workspace.access"]
  },
  {
    key: "audit",
    label: "审计",
    description: "审计日志和敏感操作记录",
    permissions: ["audit.view"]
  }
];

export const PERMISSION_LABELS: Record<string, string> = {
  "configurator.use": "使用配置器",
  "templates.view": "查看设计模板",
  "customers.view": "查看客户", "customers.create": "新建客户", "customers.update": "编辑客户", "customers.delete": "删除客户", "customers.export": "导出客户",
  "projects.view": "查看项目", "projects.create": "新建项目", "projects.update": "编辑项目", "projects.delete": "删除项目", "projects.transfer": "转交项目", "projects.export": "导出项目",
  "designs.view": "查看设计", "designs.create": "新建设计", "designs.update": "修改设计", "designs.copy": "复制设计", "designs.delete": "删除设计", "designs.export": "导出设计图", "designs.bom.export": "导出 BOM",
  "attachments.view": "查看附件", "attachments.create": "上传附件",
  "quotes.view": "查看报价", "quotes.create": "新建报价", "quotes.update": "修改报价", "quotes.submit": "提交报价", "quotes.approve": "审核报价", "quotes.cancel": "作废报价", "quotes.export": "导出报价", "quotes.multiplier.view": "查看倍率报价", "quotes.multiplier.manage": "调整倍率报价",
  "orders.view": "查看订单", "orders.create": "创建订单", "orders.status.update": "更新订单状态", "orders.cancel": "取消订单", "orders.assign": "分配负责人", "orders.follow_up": "订单跟进", "orders.export": "导出订单",
  "fulfillment.production.view": "查看生产", "fulfillment.production.update": "更新生产", "fulfillment.shipments.view": "查看发运", "fulfillment.shipments.create": "创建发运", "fulfillment.logistics.update": "更新物流",
  "prices.dealer.view": "查看专属经销价", "prices.retail.view": "查看零售价", "prices.master.view": "查看主价格表", "prices.cost.view": "查看工厂成本", "prices.manage": "管理价格",
  "inventory.availability.view": "查看供货状态", "inventory.quantity.view": "查看库存数量", "inventory.distribution.view": "查看仓库分布", "inventory.value.view": "查看库存金额", "inventory.receive": "入库", "inventory.issue": "出库", "inventory.adjust": "库存调整", "inventory.transfer": "库存调拨",
  "reports.personal.view": "个人报表", "reports.assigned.view": "指定账号报表", "reports.organization.view": "企业汇总", "reports.financial.view": "财务报表", "reports.export": "导出报表",
  "account.manage": "管理员工账号", "dealer.manage": "管理经销商账号", "permission.delegate": "分配权限", "audit.view": "查看审计日志", "dealer.workspace.access": "切换经销商工作区", "platform.entitlements.manage": "管理企业模块"
};

export const SCOPE_OPTIONS: Array<{ value: AuthorizationDataScope; label: string }> = [
  { value: "own", label: "本人创建" },
  { value: "assigned", label: "分配给本人" },
  { value: "specified", label: "指定账号" },
  { value: "organization", label: "当前企业全部" }
];

export function moduleForPermission(permission: string): AuthorizationModuleDefinition | undefined {
  return AUTHORIZATION_MODULES.find((module) => module.permissions.includes(permission as Permission));
}

export function scopeResourceForPermission(permission: string): string {
  if (permission === "account.manage" || permission === "permission.delegate") return "accounts";
  if (permission === "dealer.manage" || permission === "dealer.workspace.access") return "dealers";
  if (permission.startsWith("fulfillment.")) return "orders";
  return permission.split(".")[0] ?? permission;
}
