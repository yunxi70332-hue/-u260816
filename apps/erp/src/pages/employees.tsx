import { Button, Checkbox, Form, Input, Modal, Select, Space, Statistic, Table, Tag, type TableProps } from "antd";
import { KeyRound, Plus, RefreshCw, UserRound, UserRoundCheck, UserRoundX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/ui";
import { useAuth } from "../context/auth";
import { api, ApiError } from "../lib/api";
import { AUTHORIZATION_MODULES, PERMISSION_LABELS, SCOPE_OPTIONS, scopeResourceForPermission } from "../lib/authorization-catalog";
import type { AccountAuthorization, AccountSummary, AuthorizationDataScope, EmployeeFollowUpSummary, EmployeeOrderSummary, PermissionGrant, Role } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

const ROLE_LABELS: Record<Role, string> = {
  owner: "所有者",
  admin: "管理员",
  sales: "销售",
  designer: "设计",
  production: "生产",
  finance: "财务",
  member: "成员",
  viewer: "只读",
  headquarters_admin: "总部管理员",
  headquarters_sales: "总部销售",
  headquarters_reviewer: "总部审核",
  production_shipping: "生产发运",
  dealer_admin: "经销商管理员",
  dealer_designer_sales: "经销商业务",
  dealer: "经销商",
  factory_employee: "工厂员工"
};

const FIELD_POLICY_LABELS = {
  price: { none: "不返回价格", dealer_only: "仅专属经销价", retail: "零售价", master: "主价格表", cost: "工厂成本" },
  inventory: { none: "不返回库存", availability: "供货状态", quantity: "库存数量", distribution: "仓库分布", value: "库存金额" }
} as const;

const RESOURCE_LABELS: Record<string, string> = {
  customers: "客户",
  projects: "项目",
  designs: "设计",
  quotes: "报价",
  orders: "订单",
  fulfillment: "履约",
  inventory: "仓储",
  reports: "报表",
  accounts: "账号",
  dealers: "经销商",
  audit: "审计"
};

function applyGrantChange(current: AccountAuthorization, permission: string, checked: boolean): AccountAuthorization {
  const existing = current.grants.find((grant) => grant.permission === permission);
  if (checked) {
    if (existing) return current;
    const resource = scopeResourceForPermission(permission);
    const scope = current.dataScopes[resource] ?? { resource, scope: "organization" as AuthorizationDataScope, assignedUserIds: [] };
    return {
      ...current,
      grants: [...current.grants, { permission, scope: scope.scope, assignedUserIds: scope.assignedUserIds }],
      dataScopes: { ...current.dataScopes, [resource]: scope }
    };
  }

  const grants = current.grants.filter((grant) => grant.permission !== permission);
  const resource = scopeResourceForPermission(permission);
  const dataScopes = { ...current.dataScopes };
  if (!grants.some((grant) => scopeResourceForPermission(grant.permission) === resource)) delete dataScopes[resource];
  return { ...current, grants, dataScopes };
}

export function EmployeesPage() {
  const { session, can } = useAuth();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [orderSummary, setOrderSummary] = useState<EmployeeOrderSummary[]>([]);
  const [followUpSummary, setFollowUpSummary] = useState<EmployeeFollowUpSummary[]>([]);
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [authorizationAccount, setAuthorizationAccount] = useState<AccountSummary | null>(null);
  const [authorization, setAuthorization] = useState<AccountAuthorization | null>(null);
  const [authorizationPreview, setAuthorizationPreview] = useState<AccountAuthorization | null>(null);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [authorizationPreviewLoading, setAuthorizationPreviewLoading] = useState(false);
  const [authorizationSaving, setAuthorizationSaving] = useState(false);
  const [authorizationCopying, setAuthorizationCopying] = useState(false);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [authorizationPreviewError, setAuthorizationPreviewError] = useState<string | null>(null);
  const [authorizationMessage, setAuthorizationMessage] = useState<string | null>(null);
  const [copySourceAccountId, setCopySourceAccountId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const canManageAccounts = can("account.manage");
  const canDelegate = can("permission.delegate");
  const canViewReports = can("reports.personal.view") || can("reports.assigned.view") || can("reports.organization.view");
  const canViewOrders = can("orders.view");

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [nextAccounts, nextOrders, nextFollowUps, workspace] = await Promise.all([
        api.listAccounts(session.activeTenantId),
        canViewReports ? api.getEmployeeOrderSummary(session.activeTenantId) : Promise.resolve([]),
        canViewReports ? api.getEmployeeFollowUpSummary(session.activeTenantId) : Promise.resolve([]),
        canViewOrders ? api.loadWorkspace(session.activeTenantId, { ordersOnly: true }) : Promise.resolve(null)
      ]);
      setAccounts(nextAccounts);
      setOrderSummary(nextOrders);
      setFollowUpSummary(nextFollowUps);
      setUnassignedCount(canViewOrders ? workspace?.orders.filter((order) => !order.ownerUserId).length ?? 0 : null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "账号数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [canViewOrders, canViewReports, session]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!authorizationOpen || !session || !authorizationAccount || !authorization || !canDelegate) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAuthorizationPreviewLoading(true);
      setAuthorizationPreviewError(null);
      api.previewAccountAuthorization(authorizationAccount.id, {
        grants: authorization.grants,
        dataScopes: Object.values(authorization.dataScopes)
      }, session.activeTenantId)
        .then((preview) => { if (!cancelled) setAuthorizationPreview(preview); })
        .catch((reason) => {
          if (!cancelled) setAuthorizationPreviewError(reason instanceof ApiError ? reason.message : "最终权限预览失败，请检查授权范围。");
        })
        .finally(() => { if (!cancelled) setAuthorizationPreviewLoading(false); });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authorization, authorizationAccount, authorizationOpen, canDelegate, session]);

  const records = useMemo(() => accounts.map((account) => ({
    ...account,
    order: orderSummary.find((item) => item.employeeUserId === account.userId),
    followUp: followUpSummary.find((item) => item.employeeUserId === account.userId)
  })), [accounts, followUpSummary, orderSummary]);

  const activeCount = accounts.filter((account) => account.status === "active").length;
  const accountUserOptions = useMemo(() => accounts.map((account) => ({
    value: account.userId,
    label: `${account.name}${account.status === "disabled" ? "（已停用）" : ""}`
  })), [accounts]);
  const copySourceOptions = useMemo(() => accounts
    .filter((account) => account.id !== authorizationAccount?.id)
    .map((account) => ({ value: account.id, label: `${account.name} · ${ROLE_LABELS[account.role] ?? account.role}` })), [accounts, authorizationAccount?.id]);

  async function submit(values: { name: string; phone: string; password: string; email?: string }) {
    if (!session || !canManageAccounts) return;
    setCreating(true);
    setError(null);
    try {
      await api.createEmployee({ ...values, email: values.email?.trim() || undefined }, session.activeTenantId);
      form.resetFields();
      setOpen(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "账号创建失败，请检查填写内容。");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(account: AccountSummary) {
    if (!session || !canManageAccounts) return;
    setLoading(true);
    setError(null);
    try {
      await api.setAccountStatus(account.id, account.status === "active" ? "disabled" : "active", session.activeTenantId);
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "账号状态更新失败，请稍后重试。");
      setLoading(false);
    }
  }

  async function openAuthorization(account: AccountSummary) {
    if (!session || !canDelegate) return;
    setAuthorizationAccount(account);
    setAuthorizationOpen(true);
    setAuthorizationLoading(true);
    setAuthorizationError(null);
    setAuthorizationPreviewError(null);
    setAuthorizationMessage(null);
    setCopySourceAccountId(undefined);
    try {
      const current = await api.getAccountAuthorization(account.id, session.activeTenantId);
      setAuthorization(current);
      setAuthorizationPreview(current);
    } catch (reason) {
      setAuthorization(null);
      setAuthorizationPreview(null);
      setAuthorizationError(reason instanceof ApiError ? reason.message : "权限读取失败，请稍后重试。");
    } finally {
      setAuthorizationLoading(false);
    }
  }

  function updateGrant(permission: string, patch: Partial<PermissionGrant>) {
    setAuthorization((current) => {
      if (!current) return current;
      const resource = scopeResourceForPermission(permission);
      const existing = current.grants.find((grant) => grant.permission === permission);
      const nextGrant: PermissionGrant = {
        permission,
        scope: current.dataScopes[resource]?.scope ?? existing?.scope ?? "organization",
        assignedUserIds: current.dataScopes[resource]?.assignedUserIds ?? existing?.assignedUserIds ?? [],
        ...patch
      };
      return {
        ...current,
        grants: current.grants.map((grant) => scopeResourceForPermission(grant.permission) === resource
          ? { ...grant, scope: nextGrant.scope, assignedUserIds: nextGrant.assignedUserIds }
          : grant),
        dataScopes: {
          ...current.dataScopes,
          [resource]: { resource, scope: nextGrant.scope, assignedUserIds: nextGrant.assignedUserIds }
        }
      };
    });
  }

  function toggleGrant(permission: string, checked: boolean) {
    setAuthorization((current) => current ? applyGrantChange(current, permission, checked) : current);
  }

  function toggleModule(permissions: string[], checked: boolean) {
    setAuthorization((current) => current
      ? permissions.reduce((draft, permission) => applyGrantChange(draft, permission, checked), current)
      : current);
  }

  async function saveAuthorization() {
    if (!session || !authorizationAccount || !authorization || !canDelegate) return;
    setAuthorizationSaving(true);
    setAuthorizationError(null);
    setAuthorizationPreviewError(null);
    try {
      const input = { grants: authorization.grants, dataScopes: Object.values(authorization.dataScopes) };
      const preview = await api.previewAccountAuthorization(authorizationAccount.id, input, session.activeTenantId);
      setAuthorizationPreview(preview);
      const updated = await api.updateAccountAuthorization(authorizationAccount.id, input, session.activeTenantId);
      setAuthorization(updated);
      setAuthorizationPreview(updated);
      setAuthorizationMessage("账号权限已保存并即时生效。");
    } catch (reason) {
      setAuthorizationError(reason instanceof ApiError ? reason.message : "权限保存失败，请稍后重试。");
    } finally {
      setAuthorizationSaving(false);
    }
  }

  async function copyAuthorization() {
    if (!session || !authorizationAccount || !copySourceAccountId || !canDelegate) return;
    setAuthorizationCopying(true);
    setAuthorizationError(null);
    setAuthorizationPreviewError(null);
    try {
      const updated = await api.copyAccountAuthorization(authorizationAccount.id, copySourceAccountId, session.activeTenantId);
      setAuthorization(updated);
      setAuthorizationPreview(updated);
      setAuthorizationMessage("已复制并应用来源账号的权限和数据范围。");
    } catch (reason) {
      setAuthorizationError(reason instanceof ApiError ? reason.message : "权限复制失败，请稍后重试。");
    } finally {
      setAuthorizationCopying(false);
    }
  }

  type AccountRecord = AccountSummary & { order?: EmployeeOrderSummary; followUp?: EmployeeFollowUpSummary };
  const delegablePermissions = useMemo(() => new Set(session?.delegablePermissions ?? []), [session?.delegablePermissions]);
  const permissionGroups = useMemo(() => AUTHORIZATION_MODULES
    .map((module) => ({
      ...module,
      permissions: module.permissions.filter((permission) => delegablePermissions.has(permission) || authorization?.grants.some((grant) => grant.permission === permission))
    }))
    .filter((module) => module.permissions.length > 0), [authorization?.grants, delegablePermissions]);
  const preview = authorizationPreview ?? authorization;
  const effectivePermissions = new Set(preview?.effectivePermissions ?? []);
  const blockedGrants = (authorization?.grants ?? []).filter((grant) => !effectivePermissions.has(grant.permission));
  const scopeLabel = (scope: AuthorizationDataScope) => SCOPE_OPTIONS.find((item) => item.value === scope)?.label ?? scope;

  const columns: TableProps<AccountRecord>["columns"] = [
    { title: "账号", key: "name", width: 200, render: (_, account) => <div className="erp-primary-cell"><strong>{account.name}</strong><span>{account.phone || account.email || "-"}</span></div> },
    { title: "账号类型", dataIndex: "role", width: 120, render: (value: Role) => ROLE_LABELS[value] ?? value },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => value === "active" ? <Tag color="success" bordered={false}>启用</Tag> : <Tag color="default" bordered={false}>停用</Tag> },
    { title: "当前订单", key: "orders", width: 105, align: "right", render: (_, account) => canViewReports ? account.order?.orderCount ?? 0 : "-" },
    { title: "有效金额", key: "amount", width: 130, align: "right", render: (_, account) => canViewReports ? <span className="numeric">{account.order?.activeAmount == null ? "-" : money.format(account.order.activeAmount)}</span> : "-" },
    { title: "生产中 / 待发货", key: "fulfillment", width: 140, render: (_, account) => canViewReports ? `${account.order?.inProduction ?? 0} / ${account.order?.readyToShip ?? 0}` : "-" },
    { title: "今日待跟进", key: "today", width: 110, align: "right", render: (_, account) => canViewReports ? account.followUp?.dueTodayCount ?? 0 : "-" },
    { title: "最近登录", dataIndex: "lastActiveAt", width: 160, responsive: ["lg"], render: (value) => value || "-" },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: canManageAccounts && canDelegate ? 190 : 110,
      render: (_, account) => <Space size={6}>
        {canDelegate && <Button size="small" icon={<KeyRound size={14} />} onClick={() => void openAuthorization(account)}>权限</Button>}
        {canManageAccounts && <Button size="small" loading={loading} icon={account.status === "active" ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />} onClick={() => void toggleStatus(account)}>{account.status === "active" ? "停用" : "启用"}</Button>}
      </Space>
    }
  ];

  return <div className="page">
    <PageHeader
      title="账号与权限"
      description="账号可使用的功能由企业模块授权、账号权限和数据范围共同决定。权限变更立即生效。"
      actions={<Space wrap><Button icon={<RefreshCw className={loading ? "spin" : ""} size={15} />} onClick={() => void refresh()} loading={loading}>刷新</Button>{canManageAccounts && <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>新增员工</Button>}</Space>}
    />
    {error && <div className="form-notice"><Tag color="error">{error}</Tag></div>}
    <section className="erp-stat-grid three-columns" aria-label="账号概览">
      <article><span>可管理账号</span><Statistic value={accounts.length} prefix={<UserRound size={17} />} /></article>
      <article><span>已启用账号</span><Statistic value={activeCount} prefix={<UserRoundCheck size={17} />} /></article>
      <article><span>未分配订单</span><Statistic value={unassignedCount ?? "-"} prefix={<UserRoundX size={17} />} /></article>
    </section>
    <section className="erp-table-card">
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={records} scroll={{ x: 1280 }} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: "暂无可管理账号" }} />
    </section>
    <Modal open={open} title="新增员工账号" onCancel={() => setOpen(false)} footer={null} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <div className="erp-form-grid">
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: "请输入员工姓名" }]}><Input /></Form.Item>
          <Form.Item label="登录手机号" name="phone" rules={[{ required: true, message: "请输入登录手机号" }]}><Input inputMode="tel" autoComplete="tel" /></Form.Item>
          <Form.Item label="邮箱（选填）" name="email" rules={[{ type: "email", message: "邮箱格式不正确" }]}><Input autoComplete="email" /></Form.Item>
          <Form.Item label="初始密码" name="password" rules={[{ required: true, min: 12, message: "密码至少 12 位" }]}><Input.Password /></Form.Item>
        </div>
        <div className="form-actions"><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" htmlType="submit" loading={creating}>创建账号</Button></div>
      </Form>
    </Modal>
    <Modal
      open={authorizationOpen}
      title={`账号权限${authorizationAccount ? ` · ${authorizationAccount.name}` : ""}`}
      width={1120}
      style={{ maxWidth: "calc(100vw - 32px)" }}
      onCancel={() => setAuthorizationOpen(false)}
      footer={<Space><Button onClick={() => setAuthorizationOpen(false)}>关闭</Button><Button type="primary" loading={authorizationSaving} disabled={!authorization || authorizationLoading || !canDelegate} onClick={() => void saveAuthorization()}>保存权限</Button></Space>}
      destroyOnClose
    >
      {authorizationLoading ? <div style={{ padding: 24, textAlign: "center" }}>正在读取账号授权…</div> : authorizationError ? <Tag color="error">{authorizationError}</Tag> : authorization ? <div className="authorization-editor">
        <section className="authorization-editor-main">
          <div className="authorization-copy-row">
            <div><strong>复制其他账号配置</strong><span>复制会立即应用来源账号的权限和数据范围。</span></div>
            <Space.Compact className="authorization-copy-controls">
              <Select value={copySourceAccountId} onChange={setCopySourceAccountId} options={copySourceOptions} placeholder="选择来源账号" />
              <Button loading={authorizationCopying} disabled={!copySourceAccountId} onClick={() => void copyAuthorization()}>复制并应用</Button>
            </Space.Compact>
          </div>
          {authorizationMessage && <Tag color="success">{authorizationMessage}</Tag>}
          {authorizationPreviewError && <Tag color="warning">{authorizationPreviewError}</Tag>}
          {!permissionGroups.length && <Tag>当前管理员没有可委派的权限。</Tag>}
          <div className="authorization-module-list">
            {permissionGroups.map((module) => {
              const editable = module.permissions.filter((permission) => delegablePermissions.has(permission));
              const selectedEditable = editable.filter((permission) => authorization.grants.some((grant) => grant.permission === permission));
              const allSelected = editable.length > 0 && selectedEditable.length === editable.length;
              return <section className="authorization-module" key={module.key}>
                <div className="authorization-module-heading">
                  <div><strong>{module.label}</strong><span>{module.description}</span></div>
                  <Checkbox checked={allSelected} indeterminate={selectedEditable.length > 0 && !allSelected} disabled={!editable.length} onChange={(event) => toggleModule(editable, event.target.checked)}>本模块全选</Checkbox>
                </div>
                <div className="authorization-permission-list">
                  {module.permissions.map((permission) => {
                    const grant = authorization.grants.find((item) => item.permission === permission);
                    const editablePermission = delegablePermissions.has(permission);
                    const resource = scopeResourceForPermission(permission);
                    const inheritsParentScope = permission.startsWith("attachments.");
                    return <div className="authorization-permission-row" key={permission}>
                      <Checkbox checked={Boolean(grant)} disabled={!editablePermission} onChange={(event) => toggleGrant(permission, event.target.checked)}>{PERMISSION_LABELS[permission] ?? permission}</Checkbox>
                      {!editablePermission ? <Tag color="default">保留历史授权</Tag> : inheritsParentScope ? <Tag>继承所属业务</Tag> : <Select size="small" value={grant?.scope ?? authorization.dataScopes[resource]?.scope ?? "organization"} disabled={!grant} options={SCOPE_OPTIONS} onChange={(scope: AuthorizationDataScope) => updateGrant(permission, { scope, assignedUserIds: scope === "specified" ? grant?.assignedUserIds ?? [] : [] })} />}
                      {editablePermission && !inheritsParentScope && grant?.scope === "specified" ? <Select size="small" mode="multiple" value={grant.assignedUserIds} options={accountUserOptions} placeholder="选择账号" onChange={(assignedUserIds: string[]) => updateGrant(permission, { assignedUserIds })} /> : <span className="authorization-scope-hint">{inheritsParentScope && grant ? "跟随客户、项目、设计、报价或订单范围" : grant ? scopeLabel(grant.scope) : "未授权"}</span>}
                    </div>;
                  })}
                </div>
              </section>;
            })}
          </div>
        </section>
        <aside className="authorization-preview-panel" aria-label="最终有效权限预览">
          <div className="authorization-preview-heading"><strong>最终有效权限</strong>{authorizationPreviewLoading && <Tag>正在计算</Tag>}</div>
          <div className="authorization-preview-section"><span>已开通模块</span><div>{preview?.enabledModules.length ? preview.enabledModules.map((module) => <Tag key={module} color="blue">{AUTHORIZATION_MODULES.find((item) => item.key === module)?.label ?? module}</Tag>) : <Tag>无</Tag>}</div></div>
          <div className="authorization-preview-section"><span>字段策略</span><div><Tag>{FIELD_POLICY_LABELS.price[preview?.fieldPolicy.price as keyof typeof FIELD_POLICY_LABELS.price] ?? preview?.fieldPolicy.price ?? "不返回价格"}</Tag><Tag>{FIELD_POLICY_LABELS.inventory[preview?.fieldPolicy.inventory as keyof typeof FIELD_POLICY_LABELS.inventory] ?? preview?.fieldPolicy.inventory ?? "不返回库存"}</Tag></div></div>
          <div className="authorization-preview-section"><span>数据范围</span><div>{preview && Object.keys(preview.dataScopes).length ? Object.values(preview.dataScopes).map((scope) => <Tag key={scope.resource}>{RESOURCE_LABELS[scope.resource] ?? scope.resource} · {scopeLabel(scope.scope)}</Tag>) : <Tag>无</Tag>}</div></div>
          <div className="authorization-preview-section"><span>有效功能</span><div className="authorization-effective-list">{preview?.effectivePermissions.length ? preview.effectivePermissions.map((permission) => <Tag key={permission}>{PERMISSION_LABELS[permission] ?? permission}</Tag>) : <Tag>无</Tag>}</div></div>
          {blockedGrants.length > 0 && <div className="authorization-preview-section"><span>未生效授权</span><div className="authorization-effective-list">{blockedGrants.map((grant) => <Tag color="warning" key={grant.permission}>{PERMISSION_LABELS[grant.permission] ?? grant.permission}</Tag>)}</div><small>这些授权受企业模块上限或经销商权限边界限制，记录会保留，重新开通后可恢复生效。</small></div>}
        </aside>
      </div> : <div style={{ padding: 24 }}>暂无授权数据</div>}
    </Modal>
  </div>;
}
