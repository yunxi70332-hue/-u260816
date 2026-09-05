import { Alert, Button, Card, Dropdown, Form, Input, Modal, Select, Space, Tag, Upload as AntUpload, message, type MenuProps, type UploadProps } from "antd";
import { ArrowRight, CalendarClock, CheckCircle2, Copy, FileDown, MoreHorizontal, Plus, Upload as UploadIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, StatusBadge } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api } from "../lib/api";
import { createClientId } from "../lib/id";
import { buildPriceImportPreview, downloadPriceImportTemplate, parsePriceImportWorkbook, type PriceImportPreview, type PriceImportRow } from "../lib/price-import";
import type { PriceList } from "../types";

interface PriceListFormValues {
  name: string;
  code: string;
  market: string;
  currency: PriceList["currency"];
  version: string;
  effectiveFrom: string;
}

function isDraft(priceList: PriceList) {
  return String(priceList.status) === "draft" || String(priceList.status) === "草稿" || String(priceList.status) === "鑽夌";
}

function normalizeRemotePreview(raw: Record<string, unknown>, fallback: PriceImportPreview): PriceImportPreview {
  const source = raw.counts && typeof raw.counts === "object" ? raw.counts as Record<string, unknown> : {};
  const rows = Array.isArray(raw.rows) ? raw.rows.map((item, index) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const outcome = ["new", "updated", "skipped", "conflict", "error"].includes(String(value.outcome)) ? String(value.outcome) as PriceImportPreview["rows"][number]["outcome"] : "error";
    return {
      rowNumber: Number(value.rowNumber ?? index + 2),
      identity: String(value.identity ?? value.materialKey ?? "unknown"),
      outcome,
      message: String(value.message ?? "Server preview"),
      input: value.input as PriceImportPreview["rows"][number]["input"]
    };
  }) : fallback.rows;
  return {
    previewToken: typeof raw.previewToken === "string" ? raw.previewToken : undefined,
    rows,
    counts: {
      new: Number(source.new ?? source.added ?? fallback.counts.new),
      updated: Number(source.updated ?? fallback.counts.updated),
      skipped: Number(source.skipped ?? fallback.counts.skipped),
      conflict: Number(source.conflict ?? source.conflicts ?? fallback.counts.conflict),
      error: Number(source.error ?? source.errors ?? fallback.counts.error)
    },
    errors: Array.isArray(raw.errors) ? raw.errors.map(String) : fallback.errors
  };
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // iOS Safari 的下载是异步开始的，同步 revoke 会中断下载
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PricingPage() {
  const { priceLists, addPriceList, refresh } = useWorkspace();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<string>();
  const [importRows, setImportRows] = useState<PriceImportRow[]>([]);
  const [importPreview, setImportPreview] = useState<PriceImportPreview | null>(null);
  const [importPreviewToken, setImportPreviewToken] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<PriceListFormValues>();
  const [messageApi, contextHolder] = message.useMessage();

  function openCreatePriceList() {
    form.resetFields();
    setError(null);
    setOpen(true);
  }

  function closeCreatePriceList() {
    form.resetFields();
    setError(null);
    setOpen(false);
  }

  async function createPriceList(values: PriceListFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await addPriceList({ id: createClientId(), name: values.name, code: values.code, market: values.market, currency: values.currency, version: values.version, itemCount: 0, effectiveFrom: values.effectiveFrom, status: "鑽夌" as PriceList["status"], updatedAt: "鍒氬垰" });
      form.resetFields();
      setOpen(false);
      messageApi.success("价格表草稿已创建");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "价格表创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportPriceList(priceList: PriceList) {
    if (!session) return;
    try {
      if (session.mode === "demo") {
        messageApi.info("演示模式没有可导出的服务端价格表");
        return;
      }
      const csv = await api.exportPriceList(priceList.id, session.activeTenantId);
      downloadText(csv, `${priceList.code}-${priceList.version}.csv`);
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "价格表导出失败");
    }
  }

  async function clonePriceList(priceList: PriceList) {
    if (!session) return;
    try {
      if (session.mode === "demo") {
        const cloned = { ...priceList, id: createClientId(), version: `${priceList.version}-copy`, status: "鑽夌" as PriceList["status"], updatedAt: "鍒氬垰" };
        await addPriceList(cloned);
        navigate(`/pricing/${cloned.id}`);
        return;
      }
      const cloned = await api.clonePriceList(priceList.id, session.activeTenantId);
      messageApi.success("已复制为新草稿版本");
      await refresh();
      navigate(`/pricing/${cloned.id}`);
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "复制价格表失败");
    }
  }

  async function previewPriceListFile(file: File) {
    if (!session || !importTarget || session.mode === "demo") throw new Error("Select a live draft price list before importing.");
    const workbook = await parsePriceImportWorkbook(file);
    if (!workbook.rows.length) throw new Error("The workbook has no import rows.");
    const target = await api.getPriceList(importTarget, session.activeTenantId);
    const localPreview = buildPriceImportPreview(workbook.rows, target.items);
    setImportRows(workbook.rows);
    setImportPreview(localPreview);
    setImportPreviewToken(undefined);
    try {
      const remote = await api.previewPriceListImport(importTarget, workbook.rows, session.activeTenantId);
      const raw = remote && typeof remote === "object" ? remote as Record<string, unknown> : {};
      if (typeof raw.previewToken === "string") setImportPreviewToken(raw.previewToken);
      if (raw.counts && Array.isArray(raw.rows)) setImportPreview(normalizeRemotePreview(raw, localPreview));
    } catch {
      // Older servers can still use the client-side preview until import endpoints are deployed.
    }
    messageApi.success("Import preview is ready.");
  }

  async function commitPriceListImport() {
    if (!session || !importTarget || !importPreview) return;
    if (importPreview.counts.error > 0 || importPreview.counts.conflict > 0) {
      messageApi.error("Resolve import errors and conflicts before committing.");
      return;
    }
    setImporting(true);
    try {
      await api.commitPriceListImport(importTarget, { rows: importRows, previewToken: importPreviewToken }, session.activeTenantId);
      await refresh();
      setImportOpen(false);
      setImportPreview(null);
      setImportRows([]);
      messageApi.success(`Imported ${importPreview.counts.new + importPreview.counts.updated} price rows.`);
      navigate(`/pricing/${importTarget}`);
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "Price import failed.");
    } finally {
      setImporting(false);
    }
  }

  const uploadProps: UploadProps = {
    accept: ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    showUploadList: false,
    beforeUpload: async (file) => {
      setImporting(true);
      try { await previewPriceListFile(file as unknown as File); }
      catch (reason) { messageApi.error(reason instanceof Error ? reason.message : "CSV 导入失败"); }
      finally { setImporting(false); }
      return AntUpload.LIST_IGNORE;
    }
  };
  function downloadCurrentTemplate() {
    const target = priceLists.find((item) => item.id === importTarget) ?? priceLists.find(isDraft) ?? priceLists[0];
    if (!target) {
      downloadPriceImportTemplate();
      return;
    }
    void (async () => {
      try {
        if (!session || session.mode === "demo") {
          downloadPriceImportTemplate();
          return;
        }
        const detail = await api.getPriceList(target.id, session.activeTenantId);
        downloadPriceImportTemplate(detail.items);
      } catch {
        downloadPriceImportTemplate();
      }
    })();
  }

  return (
    <div className="page">
      {contextHolder}
      <PageHeader title="价格表" description="版本化管理市场价格、渠道价与项目特批规则。" actions={<Space wrap><Button icon={<UploadIcon size={15} />} onClick={() => { setImportTarget(priceLists.find(isDraft)?.id); setImportOpen(true); }}>导入</Button><Button type="primary" icon={<Plus size={15} />} onClick={openCreatePriceList}>新建价格表</Button></Space>} />
      <div style={{ marginBottom: 16 }}><Button icon={<FileDown size={15} />} onClick={downloadCurrentTemplate}>Download XLSX import template</Button></div>
      <section className="erp-price-grid">
        {priceLists.map((priceList) => {
          const menuItems: MenuProps["items"] = [
            { key: "export", icon: <FileDown size={14} />, label: "导出价格表", onClick: () => void exportPriceList(priceList) },
            { key: "copy", icon: <Copy size={14} />, label: "复制为新版本", onClick: () => void clonePriceList(priceList) },
            { key: "manage", icon: <ArrowRight size={14} />, label: "管理价格", onClick: () => navigate(`/pricing/${priceList.id}`) }
          ];
          return <Card key={priceList.id} size="small" className="erp-price-card">
            <div className="erp-card-title-row"><Tag color="gold">{priceList.currency}</Tag><Dropdown menu={{ items: menuItems }} trigger={["click"]}><Button type="text" size="small" icon={<MoreHorizontal size={17} />} aria-label="更多操作" /></Dropdown></div>
            <div className="erp-price-heading"><h2>{priceList.name}</h2><p>{priceList.code} · {priceList.market}</p><StatusBadge value={priceList.status} /></div>
            <div className="erp-price-facts"><span><small>当前版本</small><strong>{priceList.version}</strong></span><span><small>价格条目</small><strong>{priceList.itemCount}</strong></span><span><small>生效日期</small><strong>{priceList.effectiveFrom}</strong></span><span><small>更新时间</small><strong>{priceList.updatedAt}</strong></span></div>
            <Space wrap><Button size="small" icon={<FileDown size={14} />} onClick={() => void exportPriceList(priceList)}>导出</Button><Button size="small" icon={<Copy size={14} />} onClick={() => void clonePriceList(priceList)}>复制版本</Button><Button size="small" type="primary" icon={<ArrowRight size={14} />} onClick={() => navigate(`/pricing/${priceList.id}`)}>管理价格</Button></Space>
          </Card>;
        })}
      </section>
      <Card size="small" title="定价规则" extra={<span className="erp-card-extra">系统计算报价时按优先级应用</span>}>
        <div className="erp-rule-list">
          <div><span className="erp-rule-icon success"><CheckCircle2 size={17} /></span><span><strong>经销商等级折扣</strong><small>基于账号所属经销商等级自动应用</small></span><Tag bordered={false}>优先级 10</Tag></div>
          <div><span className="erp-rule-icon info"><CalendarClock size={17} /></span><span><strong>价格表生效日期</strong><small>订单日期落在版本有效区间内</small></span><Tag bordered={false}>优先级 20</Tag></div>
          <div><span className="erp-rule-icon"><Copy size={17} /></span><span><strong>项目特批覆盖</strong><small>须经管理员审批，并写入报价快照</small></span><Tag bordered={false}>优先级 30</Tag></div>
        </div>
      </Card>

      <Modal open={importOpen} title="导入价格表" okText="选择 XLSX/CSV 文件" cancelText="取消" confirmLoading={importing} onCancel={() => setImportOpen(false)} footer={null} destroyOnHidden>
        <p className="erp-modal-description">导入只会更新现有 BOM 物料的 1.0 基准单价和备注。该价格不含运费和包装，不会新增未知物料。</p>
        <Select style={{ width: "100%", marginBottom: 16 }} value={importTarget} onChange={setImportTarget} placeholder="选择要更新的草稿价格表" options={priceLists.filter(isDraft).map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))} />
        <AntUpload {...uploadProps} disabled={!importTarget || importing}><Button icon={<UploadIcon size={15} />} loading={importing}>选择 XLSX/CSV 文件</Button></AntUpload>
      </Modal>

      <Modal open={open} title="新建价格表" okText="创建草稿" cancelText="取消" confirmLoading={submitting} width={680} onCancel={closeCreatePriceList} onOk={() => form.submit()} destroyOnHidden>
        <p className="erp-modal-description">创建草稿后，可同步 BOM、批量导入价格并校验发布。</p>
        {error && <Alert type="error" showIcon message={error} className="erp-form-alert" />}
        <Form<PriceListFormValues> form={form} layout="vertical" initialValues={{ market: "中国大陆", currency: "CNY" }} onFinish={(values) => void createPriceList(values)}>
          <div className="erp-form-grid">
            <Form.Item label="价格表名称" name="name" rules={[{ required: true, message: "请输入价格表名称" }]}><Input /></Form.Item>
            <Form.Item label="价格表编码" name="code" rules={[{ required: true, message: "请输入价格表编码" }]}><Input placeholder="CN-RRP" /></Form.Item>
            <Form.Item label="市场" name="market" rules={[{ required: true, message: "请输入市场" }]}><Input /></Form.Item>
            <Form.Item label="币种" name="currency"><Select options={["CNY", "USD", "EUR"].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item label="版本号" name="version" rules={[{ required: true, message: "请输入版本号" }]}><Input placeholder="2026.10" /></Form.Item>
            <Form.Item label="计划生效日期" name="effectiveFrom" rules={[{ required: true, message: "请选择生效日期" }]}><Input type="date" /></Form.Item>
          </div>
        </Form>
      </Modal>
      <Modal open={Boolean(importPreview)} title="Import preview" okText="Commit import" cancelText="Back" confirmLoading={importing} onOk={() => void commitPriceListImport()} onCancel={() => setImportPreview(null)} destroyOnHidden>
        {importPreview ? <>
          <Space wrap>{(["new", "updated", "skipped", "conflict", "error"] as const).map((key) => <Tag key={key} color={key === "error" || key === "conflict" ? "red" : key === "new" ? "green" : "blue"}>{key}: {importPreview.counts[key]}</Tag>)}</Space>
          {importPreview.errors.length ? <Alert style={{ marginTop: 12 }} type="error" showIcon message={importPreview.errors.join("; ")} /> : null}
          <div style={{ marginTop: 12, maxHeight: 220, overflow: "auto" }}>{importPreview.rows.slice(0, 50).map((row) => <div key={`${row.rowNumber}-${row.identity}`}><strong>Row {row.rowNumber}</strong> · {row.identity} · {row.outcome} · {row.message}</div>)}</div>
        </> : null}
      </Modal>
    </div>
  );
}
