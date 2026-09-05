import { Button, DatePicker, Input, Select, Space, Table, Tag, type TableProps } from "antd";
import { Filter, History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LoadingBlock, Notice, PageHeader } from "../components/ui";
import { useAuth } from "../context/auth";
import { api, ApiError } from "../lib/api";
import type { LoginLogEntry } from "../types";

const PAGE_SIZE = 20;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function LoginLogsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<LoginLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listLoginLogs({
        search, tenantId, start: dateRange.start, end: dateRange.end, page: targetPage, pageSize: PAGE_SIZE
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录日志加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [search, tenantId, dateRange.start, dateRange.end]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const columns: TableProps<LoginLogEntry>["columns"] = [
    { title: "登录时间", dataIndex: "createdAt", width: 190, render: (value: string) => <span className="mono">{formatTime(value)}</span> },
    {
      title: "登录账号", dataIndex: "userName", width: 240,
      render: (_, entry) => <div className="erp-primary-cell"><strong>{entry.userName}</strong><span>{entry.accountIdentifier ?? "—"}</span></div>
    },
    { title: "所属企业", dataIndex: "tenantName", width: 200, responsive: ["md"], ellipsis: true, render: (value: string | null) => value ?? "—" },
    { title: "登录IP", dataIndex: "ipAddress", width: 150, render: (value: string | null) => value ? <Tag bordered={false} className="mono">{value}</Tag> : "—" },
    { title: "设备 / 浏览器", dataIndex: "userAgent", ellipsis: true, responsive: ["lg"], render: (value: string | null) => value ?? "—" }
  ];

  return (
    <div className="page">
      <PageHeader
        title="登录日志"
        description="查看全部企业账号的登录时间、登录IP与设备信息。仅超级管理员可见。"
        actions={<Button icon={<History size={15} />} onClick={() => void load(page)}>刷新</Button>}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="erp-table-card">
        <div className="erp-table-toolbar audit-toolbar">
          <Input.Search
            allowClear
            onSearch={(value) => { setSearch(value); setPage(1); }}
            onChange={(event) => { if (!event.target.value && search) { setSearch(""); setPage(1); } }}
            placeholder="搜索账号、姓名或IP"
          />
          <Space wrap>
            <Select
              allowClear
              placeholder="全部企业"
              style={{ minWidth: 180 }}
              value={tenantId}
              onChange={(value) => { setTenantId(value); setPage(1); }}
              options={(session?.tenants ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name }))}
              prefix={<Filter size={14} />}
            />
            <DatePicker.RangePicker
              allowClear
              placeholder={["开始日期", "结束日期"]}
              onChange={(values) => {
                setDateRange({ start: values?.[0]?.format("YYYY-MM-DD"), end: values?.[1]?.format("YYYY-MM-DD") });
                setPage(1);
              }}
            />
          </Space>
        </div>
        {loading ? <LoadingBlock label="正在加载登录日志" /> : (
          <Table<LoginLogEntry>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={items}
            scroll={{ x: 920 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              onChange: (next) => setPage(next),
              showTotal: (count) => `共 ${count} 条`
            }}
            locale={{ emptyText: "暂无登录记录" }}
          />
        )}
      </section>
    </div>
  );
}
