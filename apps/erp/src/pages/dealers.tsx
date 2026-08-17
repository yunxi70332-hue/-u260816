import { Button, Form, Input, InputNumber, Modal, Statistic, Table, Tooltip, message, type TableProps } from "antd";
import { KeyRound, MoreHorizontal, Plus, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, StatusBadge } from "../components/ui";
import { useWorkspace } from "../context/workspace";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../types";
import type { Dealer } from "../types";

interface DealerFormValues {
  name: string;
  city?: string;
  discount: number;
  phone: string;
  password: string;
  email?: string;
}

export function DealersPage() {
  const { dealers, addDealer } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<DealerFormValues>();
  const [messageApi, contextHolder] = message.useMessage();

  function openCreateDealer() {
    form.resetFields();
    setOpen(true);
  }

  function closeCreateDealer() {
    form.resetFields();
    setOpen(false);
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? dealers.filter((dealer) => `${dealer.code}${dealer.name}${dealer.contact}${dealer.region}`.toLocaleLowerCase().includes(normalized)) : dealers;
  }, [dealers, query]);

  const columns: TableProps<Dealer>["columns"] = [
    { title: "经销商", dataIndex: "name", width: 220, render: (_, dealer) => <div className="erp-primary-cell"><strong>{dealer.name}</strong><span>{dealer.code}</span></div> },
    { title: "城市", dataIndex: "region", width: 120, responsive: ["sm"] },
    { title: "管理员", dataIndex: "contact", width: 220, render: (_, dealer) => <div className="erp-primary-cell"><strong>{dealer.contact}</strong><span>{dealer.phone || dealer.email || "-"}</span></div> },
    { title: "等级", dataIndex: "level", width: 100, render: (value: string) => <StatusBadge value={value} /> },
    { title: "采购折扣", dataIndex: "discountRate", width: 110, align: "right", render: (value: number) => <strong>{value}%</strong> },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <StatusBadge value={value} /> },
    { title: "最近活动", dataIndex: "lastActiveAt", width: 150, responsive: ["lg"] },
    { title: "操作", key: "actions", width: 56, fixed: "right", render: () => <Tooltip title="更多操作"><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Tooltip> }
  ];

  async function createDealer(values: DealerFormValues) {
    setSubmitting(true);
    try {
      await addDealer({
        name: values.name,
        region: values.city?.trim() ?? "",
        phone: values.phone,
        email: values.email?.trim() || null,
        level: "标准",
        discountRate: values.discount || 90,
        password: values.password
      });
      form.resetFields();
      setOpen(false);
      messageApi.success("经销商及管理员账号已创建");
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "经销商创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      {contextHolder}
      <PageHeader title="经销商账号" description="维护渠道组织、账号权限与适用折扣。" actions={<Button type="primary" icon={<Plus size={15} />} onClick={openCreateDealer}>新增经销商</Button>} />
      <section className="erp-stat-grid three-columns">
        <div className="erp-stat-card"><span className="erp-stat-icon"><UserRoundCheck size={19} /></span><Statistic title="启用账号" value={dealers.filter((item) => item.status === "启用").length} /></div>
        <div className="erp-stat-card"><span className="erp-stat-icon"><ShieldCheck size={19} /></span><Statistic title="核心经销商" value={dealers.filter((item) => item.level === "核心").length} /></div>
        <div className="erp-stat-card"><span className="erp-stat-icon warning"><KeyRound size={19} /></span><Statistic title="30 日未登录" value={1} /></div>
      </section>
      <section className="erp-table-card">
        <div className="erp-table-toolbar"><Input.Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索经销商名称、编号、联系人或城市" /></div>
        <Table<Dealer> rowKey="id" size="small" columns={columns} dataSource={filtered} scroll={{ x: 980 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: "没有匹配的经销商" }} />
      </section>

      <Modal className="erp-dealer-modal" open={open} title="新增经销商" okText="创建账号" cancelText="取消" confirmLoading={submitting} width={680} onCancel={closeCreateDealer} onOk={() => form.submit()} destroyOnHidden>
        <p className="erp-modal-description">创建渠道组织和首个管理员的手机号登录账号。</p>
        <Form<DealerFormValues> form={form} layout="vertical" initialValues={{ discount: 90 }} onFinish={(values) => void createDealer(values)}>
          <div className="erp-form-grid">
            <Form.Item label="经销商名称" name="name" rules={[{ required: true, message: "请输入经销商名称" }]}><Input /></Form.Item>
            <Form.Item label="城市（选填）" name="city"><Input placeholder="例如：杭州" /></Form.Item>
            <Form.Item label="采购折扣" name="discount"><InputNumber min={60} max={100} suffix="%" style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="登录手机号" name="phone" rules={[{ required: true, message: "请输入登录手机号" }]}><Input inputMode="tel" autoComplete="tel" /></Form.Item>
            <Form.Item label="初始密码" name="password" rules={[{ required: true }, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位` }]}><Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} /></Form.Item>
            <Form.Item label="邮箱（选填）" name="email" rules={[{ type: "email", message: "邮箱格式不正确" }]}><Input autoComplete="email" /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
