import { Button, Card, Dropdown, Empty, Input, Segmented, Space, Tag, type MenuProps } from "antd";
import { Archive, Boxes, Copy, Grid2X2, List, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, StatusBadge, cx } from "../components/ui";
import { useWorkspace } from "../context/workspace";
import type { DesignTemplate } from "../types";

function templateMenu(template: DesignTemplate): MenuProps["items"] {
  return [
    { key: "copy", icon: <Copy size={14} />, label: "复制版本" },
    { key: "project", icon: <Boxes size={14} />, label: "用于项目" },
    ...(template.status === "草稿" ? [{ key: "archive", icon: <Archive size={14} />, label: "归档草稿", danger: true }] : [])
  ];
}

export function TemplatesPage() {
  const { templates } = useWorkspace();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return templates.filter((template) => !normalized || `${template.name}${template.code}${template.dimensions}`.toLocaleLowerCase().includes(normalized));
  }, [query, templates]);

  return (
    <div className="page">
      <PageHeader title="方案模板" description="沉淀可复用的模块组合，版本化发布到配置器。" actions={<Button type="primary" icon={<Plus size={15} />}>新建模板</Button>} />
      <section className="erp-filter-bar">
        <Input.Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板名称或编号" />
        <Segmented
          value={view}
          onChange={(value) => setView(value as "grid" | "list")}
          options={[{ value: "grid", icon: <Grid2X2 size={15} />, label: "卡片" }, { value: "list", icon: <List size={16} />, label: "列表" }]}
        />
      </section>
      {filtered.length ? (
        <div className={cx("erp-template-grid", view === "list" && "list-view")}>
          {filtered.map((template) => (
            <Card
              key={template.id}
              size="small"
              className="erp-template-card"
              cover={<div className="template-visual"><div className="cabinet-preview" style={{ gridTemplateRows: `repeat(${template.layout.length}, 1fr)` }}>{template.layout.flatMap((columns, row) => Array.from({ length: columns }, (_, column) => <span key={`${row}-${column}`} style={{ width: `${100 / columns}%` }} />))}</div><Tag bordered={false}>{template.category}</Tag></div>}
              actions={[<Button key="copy" type="text" size="small" icon={<Copy size={14} />}>复制</Button>, <Button key="project" type="text" size="small" icon={<Boxes size={14} />}>用于项目</Button>]}
            >
              <div className="erp-card-title-row"><div><h2>{template.name}</h2><p>{template.code} · v{template.version}</p></div><Dropdown overlayClassName="erp-template-actions-menu" menu={{ items: templateMenu(template) }} trigger={["click"]}><Button type="text" size="small" icon={<MoreHorizontal size={17} />} aria-label="更多操作" /></Dropdown></div>
              <div className="erp-template-specs"><span><small>规格</small><strong>{template.dimensions}</strong></span><span><small>模块</small><strong>{template.modules} 个</strong></span></div>
              <Space size={[8, 6]} wrap className="erp-card-meta"><StatusBadge value={template.status} /><span>使用 {template.usageCount} 次</span><span>更新 {template.updatedAt}</span></Space>
            </Card>
          ))}
        </div>
      ) : <Empty description="没有匹配的模板" />}
    </div>
  );
}
