import { ProLayout, type MenuDataItem } from "@ant-design/pro-components";
import { Button, Dropdown, Tag } from "antd";
import {
  Activity, Building2, CircleDollarSign, ClipboardList, Files, LayoutDashboard,
  ArrowLeft, LockKeyhole, LogOut, Truck, Users, Warehouse, ArrowDownToLine, ArrowUpFromLine, ListTree, ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api, ApiError } from "../lib/api";
import { getDesignerBaseUrl } from "../lib/designer";
import { ERP_LAYOUT_TOKEN } from "../theme";
import type { Permission } from "../types";
import { FormActions, Modal, Notice } from "./ui";

interface NavItem {
  key?: string;
  path?: string;
  name: string;
  icon: ReactNode;
  permission: Permission;
  anyPermissions?: Permission[];
  dependencies?: Permission[];
  children?: NavItem[];
}

interface NavGroup {
  name: string;
  children: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { name: "库存", children: [
    {
      key: "inventory",
      name: "库存总览",
      icon: <Warehouse size={18} />,
      permission: "inventory.availability.view",
      children: [
        { path: "/inventory", name: "库存概览", icon: <Warehouse size={18} />, permission: "inventory.availability.view" },
        { path: "/inventory/ledger", name: "库存台账", icon: <ListTree size={18} />, permission: "inventory.quantity.view", dependencies: ["inventory.availability.view"] },
        { path: "/inventory/inbound", name: "入库单", icon: <ArrowDownToLine size={18} />, permission: "inventory.receive", dependencies: ["inventory.availability.view"] },
        { path: "/inventory/outbound", name: "出库单", icon: <ArrowUpFromLine size={18} />, permission: "inventory.issue", dependencies: ["inventory.availability.view"] }
      ]
    }
  ] },
  { name: "概览", children: [
    {
      key: "dashboard",
      name: "运营仪表盘",
      icon: <LayoutDashboard size={18} />,
      permission: "dashboard.view",
      anyPermissions: ["dashboard.view", "projects.view", "quotes.view", "orders.view", "fulfillment.production.view"],
      children: [
        { path: "/", name: "运营概览", icon: <LayoutDashboard size={18} />, permission: "dashboard.view" },
        { path: "/projects", name: "客户与项目", icon: <Building2 size={18} />, permission: "project.manage" },
        { path: "/quotes", name: "报价管理", icon: <CircleDollarSign size={18} />, permission: "quote.manage" },
        { path: "/orders", name: "销售订单", icon: <ClipboardList size={18} />, permission: "order.manage" },
        { path: "/production", name: "生产与发货", icon: <Truck size={18} />, permission: "production.manage" }
      ]
    }
  ] },
  { name: "渠道", children: [
    { path: "/dealers", name: "经销商账号", icon: <Users size={18} />, permission: "dealer.manage" },
    { path: "/pricing", name: "价格表", icon: <Files size={18} />, permission: "pricing.manage" }
  ] },
  { name: "工厂团队", children: [
    { path: "/employees", name: "账号与权限", icon: <Users size={18} />, permission: "account.manage", anyPermissions: ["account.manage", "permission.delegate"] }
  ] },
  { name: "系统管理", children: [
    { path: "/settings/entitlements", name: "企业模块授权", icon: <ShieldCheck size={18} />, permission: "platform.entitlements.manage" }
  ] }
];

const NAV_PERMISSION_OVERRIDES: Partial<Record<string, Permission>> = {
  "/projects": "projects.view",
  "/quotes": "quotes.view",
  "/orders": "orders.view",
  "/production": "fulfillment.production.view",
  "/pricing": "prices.master.view"
};

const ROLE_LABELS: Record<string, string> = {
  owner: "所有者", admin: "管理员", finance: "财务", sales: "销售", designer: "设计", production: "生产", member: "成员", viewer: "只读",
  headquarters_admin: "总部管理员", headquarters_sales: "总部销售", headquarters_reviewer: "总部审核", production_shipping: "生产发运",
  dealer: "经销商", dealer_admin: "经销商管理员", dealer_designer_sales: "经销商业务", factory_employee: "工厂员工"
};

function BrandMark() {
  return <span className="pro-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}

export function AppShell() {
  const { session, logout, can } = useAuth();
  const workspace = useWorkspace();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>([]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);

  const routeOpenKeys = location.pathname.startsWith("/inventory/")
    ? ["inventory"]
    : ["/projects", "/quotes", "/orders", "/production"].some((path) => location.pathname.startsWith(path))
      ? ["dashboard"]
      : openMenuKeys;

  useEffect(() => {
    if (collapsed) setOpenMenuKeys([]);
  }, [collapsed, location.pathname]);

  const routes = useMemo<MenuDataItem[]>(() => {
    const buildMenuItem = (item: NavItem, group?: string): MenuDataItem | null => {
      const isAllowed = (item.anyPermissions?.some((permission) => can(permission)) ?? can(item.path ? NAV_PERMISSION_OVERRIDES[item.path] ?? item.permission : item.permission))
        && (item.dependencies ?? []).every((dependency) => can(dependency));
      if (!isAllowed) return null;

      const children = item.children?.map((child) => buildMenuItem(child)).filter((child): child is MenuDataItem => child !== null);
      return {
        key: item.key ?? item.path,
        path: item.path,
        name: item.name,
        icon: item.icon,
        ...(group ? { group } : {}),
        ...(children?.length ? { children } : {})
      };
    };

    return NAV_GROUPS.flatMap((group) => group.children
      .map((item) => buildMenuItem(item, group.name))
      .filter((item): item is MenuDataItem => item !== null));
  }, [can]);

  function openPasswordDialog() {
    setPasswordError("");
    setPasswordChanged(false);
    setPasswordOpen(true);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    setPasswordError("");
    setPasswordChanged(false);
    if (newPassword.length < 12) {
      setPasswordError("新密码至少需要 12 个字符。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的新密码不一致。");
      return;
    }
    setPasswordBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      formElement.reset();
      setPasswordChanged(true);
    } catch (error) {
      setPasswordError(error instanceof ApiError ? error.message : "密码修改失败，请稍后重试。");
    } finally {
      setPasswordBusy(false);
    }
  }

  const profileMenu = {
    items: [
      { key: "identity", disabled: true, label: <span className="profile-menu-identity"><strong>{session?.user.name}</strong><small>{session?.user.email}</small></span> },
      { type: "divider" as const },
      { key: "password", icon: <LockKeyhole size={15} />, label: "修改密码", disabled: session?.mode !== "live" },
      { key: "logout", icon: <LogOut size={15} />, label: "退出登录", danger: true }
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "password") openPasswordDialog();
      if (key === "logout") void logout();
    }
  };

  return (
    <>
      <ProLayout
        className="erp-pro-layout"
        title="USM 运营中心"
        logo={<BrandMark />}
        route={{ path: "/", routes }}
        location={{ pathname: location.pathname }}
        layout="side"
        navTheme="light"
        fixedHeader
        fixSiderbar
        siderWidth={240}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        menuProps={{
          // A collapsed sider renders submenu items in a floating menu. Do not
          // open that menu solely because the current route belongs to it.
          openKeys: collapsed ? openMenuKeys : routeOpenKeys,
          onOpenChange: (keys) => setOpenMenuKeys(keys.map(String))
        }}
        menuItemRender={(item, defaultDom) => item.path?.startsWith("/") ? <Link to={item.path}>{defaultDom}</Link> : defaultDom}
        pageTitleRender={false}
        breadcrumbRender={false}
        footerRender={false}
        contentStyle={{ margin: 0, padding: 0 }}
        token={ERP_LAYOUT_TOKEN}
        menuFooterRender={() => <div className="pro-system-health"><Activity size={15} /><span>{workspace.dataSource === "live" ? "服务在线" : "演示数据"}</span><i className={workspace.dataSource === "live" ? "online" : "demo"} /></div>}
        actionsRender={() => [
          <Button key="designer" className="pro-designer-link" href={getDesignerBaseUrl()} icon={<ArrowLeft size={16} />} aria-label="返回设计台" title="返回设计台">
            <span>返回设计台</span>
          </Button>
        ]}
      >
        <main className="content-area">
          <div className="workspace-account-bar">
            <Dropdown menu={profileMenu} trigger={["click"]} placement="bottomRight">
              <Button type="text" className="pro-profile-button"><span className="pro-avatar">{session?.user.name.slice(-2) || "US"}</span><span><strong>{session?.user.name}</strong><small>{session ? ROLE_LABELS[session.user.role] : ""}</small></span></Button>
            </Dropdown>
          </div>
          <div className="workspace-content">
            {workspace.warning && <Notice>{workspace.warning}</Notice>}
            {session?.mode === "demo" && <div className="demo-strip"><Tag color="gold" bordered={false}>演示工作区</Tag><span>操作仅保存在当前浏览器会话，不会写入生产数据。</span></div>}
            <Outlet />
          </div>
        </main>
      </ProLayout>

      <Modal open={passwordOpen} title="修改密码" description="更新后，其他设备上的登录会话将退出。" onClose={() => setPasswordOpen(false)}>
        <form className="modal-form" onSubmit={(event) => void changePassword(event)}>
          <div className="form-grid">
            <label className="span-2"><span>当前密码</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label className="span-2"><span>新密码</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
            <label className="span-2"><span>确认新密码</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
          </div>
          {passwordError && <div className="form-notice"><Notice tone="danger">{passwordError}</Notice></div>}
          {passwordChanged && <div className="form-notice"><Notice tone="info">密码已更新，其他设备上的会话已退出。</Notice></div>}
          <FormActions onCancel={() => setPasswordOpen(false)} submitting={passwordBusy} submitLabel="更新密码" />
        </form>
      </Modal>
    </>
  );
}
