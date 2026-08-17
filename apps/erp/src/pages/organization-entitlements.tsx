import { Button, Form, Input, Modal as AntModal, Select, Space, Switch, Tag } from "antd";
import { RefreshCw, Save, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingBlock, Notice, PageHeader } from "../components/ui";
import { useAuth } from "../context/auth";
import { api, ApiError } from "../lib/api";
import { AUTHORIZATION_MODULES, PERMISSION_LABELS } from "../lib/authorization-catalog";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../types";
import type { OrganizationEntitlement } from "../types";

export function OrganizationEntitlementsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<OrganizationEntitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [adminCreated, setAdminCreated] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminForm] = Form.useForm<{ name: string; phone: string; email?: string; password: string }>();

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try { setItems(await api.getOrganizationEntitlements(session.activeTenantId)); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "企业模块授权读取失败，请稍后重试。"); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  const byModule = useMemo(() => new Map(items.map((item) => [item.module, item])), [items]);
  const update = (module: string, patch: Partial<OrganizationEntitlement>) => {
    setItems((current) => {
      const found = current.some((item) => item.module === module);
      if (found) return current.map((item) => item.module === module ? { ...item, ...patch } : item);
      return [...current, { module, enabled: false, permissionAllowlist: null, ...patch }];
    });
    setSaved(false);
  };

  async function save() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try { setItems(await api.updateOrganizationEntitlements(items, session.activeTenantId)); setSaved(true); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "企业模块授权保存失败，请稍后重试。"); }
    finally { setSaving(false); }
  }

  const accountsEnabled = byModule.get("accounts")?.enabled === true;

  async function createOrganizationAdmin(values: { name: string; phone: string; email?: string; password: string }) {
    if (!session || !accountsEnabled) return;
    setAdminSaving(true);
    setError(null);
    try {
      await api.createOrganizationAdmin({ ...values, email: values.email?.trim() || undefined }, session.activeTenantId);
      adminForm.resetFields();
      setAdminOpen(false);
      setAdminCreated(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "企业管理员创建失败，请稍后重试。");
    } finally {
      setAdminSaving(false);
    }
  }

  return <div className="page">
    <PageHeader title="企业模块授权" description="由平台运维控制企业可用模块和企业管理员可分配的权限上限。关闭模块会立即让所有账号失去该模块访问权。" actions={<Space><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button><Button icon={<UserRoundPlus size={15} />} disabled={!accountsEnabled} onClick={() => { setAdminCreated(false); setAdminOpen(true); }}>新增企业管理员</Button><Button type="primary" icon={<Save size={15} />} loading={saving} onClick={() => void save()}>保存授权</Button></Space>} />
    {error && <Notice tone="danger">{error}</Notice>}
    {saved && <Notice tone="info">企业模块授权已保存，账号有效权限已即时重新计算。</Notice>}
    {adminCreated && <Notice tone="info">企业管理员已创建，可在“账号与权限”中继续管理。</Notice>}
    {loading && !items.length ? <LoadingBlock label="正在读取企业模块授权" /> : <section className="erp-table-card">
      <div className="erp-table-toolbar"><span><ShieldCheck size={16} />当前企业：{session?.tenants.find((tenant) => tenant.id === session.activeTenantId)?.name ?? session?.activeTenantId}</span><Tag color="blue">默认拒绝未开通模块</Tag></div>
      <div style={{ display: "grid" }}>
        {AUTHORIZATION_MODULES.map((module) => {
          const item = byModule.get(module.key) ?? { module: module.key, enabled: false, permissionAllowlist: null };
          const options = module.permissions.map((permission) => ({ value: permission, label: PERMISSION_LABELS[permission] }));
          return <div key={module.key} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 90px minmax(260px, 1.4fr)", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
            <div><strong>{module.label}</strong><div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{module.description}</div></div>
            <Switch checked={item.enabled} onChange={(enabled) => update(module.key, { enabled })} checkedChildren="开通" unCheckedChildren="关闭" />
            <Select mode="multiple" allowClear maxTagCount="responsive" disabled={!item.enabled} value={item.permissionAllowlist ?? undefined} placeholder="留空表示本模块全部权限可分配" options={options} onChange={(permissionAllowlist: string[]) => update(module.key, { permissionAllowlist: permissionAllowlist.length ? permissionAllowlist : null })} />
          </div>;
        })}
      </div>
    </section>}
    <AntModal title="新增企业管理员" open={adminOpen} onCancel={() => setAdminOpen(false)} footer={null} destroyOnHidden>
      <Form form={adminForm} layout="vertical" onFinish={(values) => void createOrganizationAdmin(values)} requiredMark={false}>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input autoFocus maxLength={200} /></Form.Item>
        <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请输入手机号" }]}><Input inputMode="tel" maxLength={32} /></Form.Item>
        <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "请输入有效邮箱" }]}><Input type="email" maxLength={320} /></Form.Item>
        <Form.Item name="password" label="初始密码" rules={[{ required: true }, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位` }]}><Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} /></Form.Item>
        <Space style={{ display: "flex", justifyContent: "flex-end" }}><Button onClick={() => setAdminOpen(false)}>取消</Button><Button htmlType="submit" type="primary" loading={adminSaving}>创建</Button></Space>
      </Form>
    </AntModal>
  </div>;
}
