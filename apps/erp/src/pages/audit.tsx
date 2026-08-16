import { Avatar, Button, DatePicker, Input, Select, Space, Table, Tag, type TableProps } from "antd";
import { Download, Filter, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/ui";
import { useWorkspace } from "../context/workspace";
import type { AuditEvent } from "../types";

const resources = ["全部对象", "报价", "订单", "发运单", "经销商", "账号"];

export function AuditPage() {
  const { audits } = useWorkspace();
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [resource, setResource] = useState("全部对象");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return audits.filter((event) => {
      const eventDate = event.createdAt.slice(0, 10);
      const dateMatches = (!dateRange.start || eventDate >= dateRange.start) && (!dateRange.end || eventDate <= dateRange.end);
      const textMatches = !normalized || `${event.actor}${event.action}${event.resource}${event.resourceId}${event.detail}`.toLocaleLowerCase().includes(normalized);
      return dateMatches && (resource === "全部对象" || event.resource === resource) && textMatches;
    });
  }, [audits, dateRange.end, dateRange.start, query, resource]);

  const columns: TableProps<AuditEvent>["columns"] = [
    { title: "时间 / 操作人", dataIndex: "createdAt", width: 220, render: (_, event) => <div className="erp-audit-person"><Avatar size={30}>{event.actor.slice(-2)}</Avatar><div className="erp-primary-cell"><strong>{event.createdAt}</strong><span>{event.actor} · {event.role}</span></div></div> },
    { title: "事件", dataIndex: "action", width: 420, render: (_, event) => <div className="erp-audit-event"><span className={event.action.includes("失败") ? "erp-event-icon danger" : "erp-event-icon"}><ShieldCheck size={15} /></span><div className="erp-primary-cell"><strong>{event.action} · {event.resource} <Button type="link" size="small">{event.resourceId}</Button></strong><span>{event.detail}</span></div></div> },
    { title: "所属组织", dataIndex: "tenant", width: 180, responsive: ["md"], ellipsis: true },
    { title: "来源", dataIndex: "ip", width: 140, responsive: ["sm"], render: (value: string) => <Tag bordered={false} className="mono">{value}</Tag> }
  ];

  return (
    <div className="page">
      <PageHeader title="审计日志" description="查询跨组织的关键操作、状态变更与安全事件。" actions={<Button icon={<Download size={15} />}>导出日志</Button>} />
      <section className="erp-table-card">
        <div className="erp-table-toolbar audit-toolbar">
          <Input.Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索人员、对象编号或操作内容" />
          <Space wrap>
            <Select value={resource} onChange={setResource} options={resources.map((value) => ({ value, label: value }))} prefix={<Filter size={14} />} />
            <DatePicker.RangePicker
              allowClear
              placeholder={["开始日期", "结束日期"]}
              onChange={(values) => setDateRange({ start: values?.[0]?.format("YYYY-MM-DD"), end: values?.[1]?.format("YYYY-MM-DD") })}
            />
          </Space>
        </div>
        <Table<AuditEvent> rowKey="id" size="small" columns={columns} dataSource={filtered} scroll={{ x: 920 }} pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: "没有匹配的审计事件" }} />
      </section>
    </div>
  );
}
