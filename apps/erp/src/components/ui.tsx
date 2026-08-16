import { ProTable, type ProColumns, type ProTableProps } from "@ant-design/pro-components";
import { Alert, Button, Empty, Input, Modal as AntModal, Pagination as AntPagination, Spin, Steps, Tag } from "antd";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const statusTone: Record<string, string> = {
  "线索": "neutral", "草稿": "neutral", "待确认": "neutral", "未排产": "neutral", "未创建": "neutral", "待处理": "neutral",
  "方案中": "info", "待审批": "warning", "待提货": "warning", "备料": "warning", "阻塞": "danger",
  "已报价": "info", "已发送": "info", "已确认": "info", "运输中": "info", "进行中": "info", "组装": "info", "质检": "info",
  "已成交": "success", "已接受": "success", "已批准": "success", "已发布": "success", "生效中": "success", "启用": "success", "已完工": "success", "已签收": "success", "已完成": "success", "已发货": "success",
  "暂停": "danger", "已失效": "danger", "已取消": "danger", "已过期": "danger", "暂停使用": "danger", "已归档": "neutral",
  "生产中": "violet", "待发货": "warning", "核心": "success", "标准": "info", "观察": "warning"
};

export function StatusBadge({ value }: { value: string }) {
  const tone = statusTone[value] || "neutral";
  const color = tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "danger" ? "error" : tone === "info" ? "processing" : tone === "violet" ? "purple" : "default";
  return <Tag className="status-badge" color={color} bordered={false}><span className="status-dot" />{value}</Tag>;
}

export function ErpPageHeader({ title, description, actions, breadcrumbs }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: string[] }) {
  return (
    <header className="page-header">
      <div>
        {breadcrumbs?.length ? <div className="page-breadcrumbs">{breadcrumbs.join(" / ")}</div> : null}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export const PageHeader = ErpPageHeader;

export function SearchField({ value, onChange, placeholder = "搜索" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <Input className="search-field" prefix={<Search size={16} aria-hidden="true" />} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} allowClear onClear={() => onChange("")} />;
}

export function EmptyState({ title = "暂无数据", detail = "调整筛选条件后再试。" }: { title?: string; detail?: string }) {
  return <div className="empty-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span><strong>{title}</strong><small>{detail}</small></span>} /></div>;
}

export function LoadingBlock({ label = "正在加载" }: { label?: string }) {
  return <div className="loading-block"><Spin size="small" /><span>{label}</span></div>;
}

export function Notice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "danger" | "info" }) {
  return <Alert className={cx("notice", `notice-${tone}`)} type={tone === "danger" ? "error" : tone} showIcon message={children} />;
}

export function Modal({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void }) {
  return (
    <AntModal open={open} title={<div className="modal-title"><h2>{title}</h2>{description && <p>{description}</p>}</div>} onCancel={onClose} footer={null} destroyOnHidden width={640}>
      {children}
    </AntModal>
  );
}

export function FormActions({ onCancel, submitting = false, submitLabel = "保存" }: { onCancel: () => void; submitting?: boolean; submitLabel?: string }) {
  return <div className="form-actions"><Button onClick={onCancel}>取消</Button><Button type="primary" htmlType="submit" loading={submitting}>{submitLabel}</Button></div>;
}

export function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  return (
    <div className="pagination">
      <span>共 {total} 条</span>
      <AntPagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={onPageChange} size="small" />
    </div>
  );
}

export interface SummaryItem {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}

export function ObjectSummary({ items }: { items: SummaryItem[] }) {
  return <section className="object-summary">{items.map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.emphasis ? "emphasis" : undefined}>{item.value}</strong></div>)}</section>;
}

export function LifecycleSteps({ current, items }: { current: number; items: Array<{ title: string; description?: string; status?: "wait" | "process" | "finish" | "error" }> }) {
  return <section className="lifecycle-steps"><Steps current={current} items={items} responsive size="small" /></section>;
}

export type ErpColumn<T> = ProColumns<T>;

export function ErpTable<T extends Record<string, unknown>>(props: ProTableProps<T, Record<string, unknown>>) {
  return <ProTable<T, Record<string, unknown>> rowKey="id" search={false} options={{ density: false, fullScreen: false, reload: false }} pagination={{ pageSize: 10, showSizeChanger: false }} cardBordered className="erp-table" {...props} />;
}

export function useFilteredPage<T>(items: T[], query: string, predicate: (item: T, normalizedQuery: string) => boolean, pageSize = 8) {
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter((item) => predicate(item, normalized)) : items;
  }, [items, predicate, query]);
  useEffect(() => setPage(1), [query, items.length]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return { filtered, visible, page, setPage, pageSize };
}

export function stopSubmit(callback: (form: FormData) => void | Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void callback(new FormData(event.currentTarget));
  };
}
