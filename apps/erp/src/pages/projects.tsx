import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tooltip, message, type TableProps } from "antd";
import { Download, FileClock, Filter, Pencil, PencilRuler, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api, ApiError } from "../lib/api";
import { getDesignerDraftUrl } from "../lib/designer";
import { createClientId } from "../lib/id";
import type { CustomerProject, QuoteAdjustmentAudit, SavedDesignDraft } from "../types";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 });
const projectStages = ["全部阶段", "线索", "方案中", "已报价", "已成交", "暂停"];
const sourceLabels: Record<Exclude<CustomerProject["quoteSource"], null>, string> = {
  suggested_retail: "1.0 基准价",
  quote: "正式报价",
  manual: "人工报价"
};

const quoteStatusLabels: Record<string, string> = {
  draft: "草稿",
  priced: "草稿",
  submitted: "待审批",
  changes_requested: "需修改",
  approved: "已批准",
  sent: "已发送",
  customer_confirmed: "客户已确认",
  accepted: "已接受",
  converted: "已转订单",
  rejected: "已失效",
  expired: "已失效",
  cancelled: "已失效"
};

interface ProjectFormValues {
  name: string;
  customer: string;
  contact: string;
  phone: string;
  site: string;
  owner: string;
  budget?: number;
}

interface QuoteAdjustmentFormValues {
  salesMultiplier: number;
  finalQuote: number;
  adjustmentReason?: string;
  notes?: string;
}

const DEFAULT_SALES_MULTIPLIER_BASIS_POINTS = 15000;
const DEFAULT_SALES_MULTIPLIER = DEFAULT_SALES_MULTIPLIER_BASIS_POINTS / 10000;
const LEGACY_QUOTE_ADJUSTMENT_REASON = "前端人工调整报价";

function isDealerRole(role: string | undefined): boolean {
  return Boolean(role && role.startsWith("dealer"));
}

function amountFromMinor(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value / 100;
}

function projectBasePriceTotalMinor(project: CustomerProject): number | null {
  return project.basePriceTotalMinor ?? (project.suggestedQuoteAmount === null ? null : Math.round(project.suggestedQuoteAmount * 100));
}

function multiplierQuoteMinor(basePriceTotalMinor: number | null | undefined, salesMultiplier: number): number | null {
  if (basePriceTotalMinor === null || basePriceTotalMinor === undefined || !Number.isFinite(salesMultiplier)) return null;
  return Math.round(basePriceTotalMinor * salesMultiplier);
}

function hasRecordedMultiplier(project: CustomerProject): boolean {
  return project.salesMultiplierBasisPoints !== null && project.salesMultiplierBasisPoints !== undefined;
}

function quoteDisplayAmount(project: CustomerProject): number | null {
  return project.quoteAmount ?? amountFromMinor(project.multiplierQuoteTotalMinor) ?? project.suggestedQuoteAmount;
}

function quoteEditHint(project: CustomerProject): string {
  if (!project.quoteEditable) {
    const status = project.quoteStatus ? quoteStatusLabels[project.quoteStatus] ?? project.quoteStatus : "当前";
    return project.quoteId ? `${status}报价已锁定，不能再调整` : "尚未生成可报价的设计方案";
  }
  return project.quoteId ? "调整对客报价" : "基于 1.0 基准价创建报价";
}

function formatAuditTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function ProjectsPage() {
  const { projects, addProject, refresh } = useWorkspace();
  const { session, can } = useAuth();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("全部阶段");
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<SavedDesignDraft[]>([]);
  const [quoteProject, setQuoteProject] = useState<CustomerProject | null>(null);
  const [quoteAudits, setQuoteAudits] = useState<QuoteAdjustmentAudit[]>([]);
  const [quoteAuditLoading, setQuoteAuditLoading] = useState(false);
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteAuditRequest = useRef(0);
  const openedQuoteProject = useRef<string | null>(null);
  const [form] = Form.useForm<ProjectFormValues>();
  const [quoteForm] = Form.useForm<QuoteAdjustmentFormValues>();
  const quoteMultiplier = Form.useWatch("salesMultiplier", quoteForm);
  const quoteFinalAmount = Form.useWatch("finalQuote", quoteForm);
  const [messageApi, messageContext] = message.useMessage();
  const internalPricingVisible = !isDealerRole(session?.user.role) && (session?.mode === "demo" || can("quotes.multiplier.view"));
  const canManageMultiplier = internalPricingVisible && (session?.mode === "demo" || can("quotes.multiplier.manage"));
  const requestedQuoteProjectId = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("quoteProject");

  function canEditProjectQuote(project: CustomerProject): boolean {
    return project.quoteId ? can("quotes.update") : can("quotes.create");
  }

  useEffect(() => {
    if (!session || session.mode !== "live") {
      setDrafts([]);
      return;
    }
    let cancelled = false;
    void api.listSavedDesignDrafts(session.activeTenantId)
      .then((items) => {
        if (!cancelled) setDrafts(items.filter((item) => item.status !== "archived"));
      })
      .catch(() => {
        if (!cancelled) setDrafts([]);
      });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!quoteProject) return;
    const salesMultiplier = hasRecordedMultiplier(quoteProject)
      ? Number(quoteProject.salesMultiplierBasisPoints) / 10000
      : DEFAULT_SALES_MULTIPLIER;
    const multiplierQuote = amountFromMinor(quoteProject.multiplierQuoteTotalMinor)
      ?? amountFromMinor(multiplierQuoteMinor(projectBasePriceTotalMinor(quoteProject), salesMultiplier));
    quoteForm.setFieldsValue({
      salesMultiplier,
      finalQuote: quoteProject.quoteAmount ?? multiplierQuote ?? quoteDisplayAmount(quoteProject) ?? 0,
      adjustmentReason: undefined,
      notes: quoteProject.quoteNote ?? undefined
    });
  }, [quoteForm, quoteProject]);

  useEffect(() => {
    if (!requestedQuoteProjectId || openedQuoteProject.current === requestedQuoteProjectId) return;
    const project = projects.find((item) => item.id === requestedQuoteProjectId);
    if (!project || !project.quoteEditable || !canEditProjectQuote(project)) return;
    openedQuoteProject.current = requestedQuoteProjectId;
    openQuoteAdjustment(project);
  }, [can, projects, requestedQuoteProjectId]);

  function openCreateProject() {
    form.resetFields();
    setOpen(true);
  }

  function closeCreateProject() {
    form.resetFields();
    setOpen(false);
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      const stageMatches = stage === "全部阶段" || project.stage === stage;
      const queryMatches = !normalized || `${project.code}${project.name}${project.customer}${project.owner}`.toLocaleLowerCase().includes(normalized);
      return stageMatches && queryMatches;
    });
  }, [projects, query, stage]);

  const draftsByProject = useMemo(() => {
    const grouped = new Map<string, SavedDesignDraft>();
    for (const draft of drafts) {
      const current = grouped.get(draft.projectId);
      if (!current || draft.updatedAt > current.updatedAt) grouped.set(draft.projectId, draft);
    }
    return grouped;
  }, [drafts]);

  const columns: TableProps<CustomerProject>["columns"] = [
    { title: "项目", dataIndex: "name", width: 220, render: (_, project) => <div className="erp-primary-cell"><strong>{project.name}</strong><span>{project.code}</span></div> },
    { title: "客户", dataIndex: "customer", width: 220, render: (_, project) => <div className="erp-primary-cell"><strong>{project.customer}</strong><span>{project.contact} · {project.phone}</span></div> },
    { title: "地点", dataIndex: "site", width: 160, ellipsis: true, responsive: ["md"] },
    { title: "接待销售", dataIndex: "owner", width: 120, responsive: ["sm"] },
    {
      title: "报价",
      key: "quote",
      width: internalPricingVisible ? 280 : 190,
      align: "right",
      render: (_, project) => {
        const value = quoteDisplayAmount(project);
        const source = project.quoteSource ? sourceLabels[project.quoteSource] : "待生成建议价";
        const baseAmount = amountFromMinor(projectBasePriceTotalMinor(project));
        const savedMultiplier = hasRecordedMultiplier(project) ? Number(project.salesMultiplierBasisPoints) / 10000 : null;
        const referenceAmount = project.quoteId && savedMultiplier === null
          ? null
          : amountFromMinor(project.multiplierQuoteTotalMinor)
            ?? amountFromMinor(multiplierQuoteMinor(projectBasePriceTotalMinor(project), savedMultiplier ?? DEFAULT_SALES_MULTIPLIER));
        return (
          <div className="erp-quote-cell">
            <div>
              <strong>{value === null ? "-" : money.format(value)}</strong>
              {internalPricingVisible ? <>
                <small>1.0 基准价：{baseAmount === null ? "-" : money.format(baseAmount)}</small>
                <small>倍率：{savedMultiplier === null ? (project.quoteId ? "未记录倍率" : DEFAULT_SALES_MULTIPLIER.toFixed(2)) : savedMultiplier.toFixed(2)}</small>
                <small>倍率参考价：{referenceAmount === null ? "-" : money.format(referenceAmount)}</small>
              </> : <span className={`erp-quote-source source-${project.quoteSource ?? "pending"}`}>{source}</span>}
            </div>
            {canEditProjectQuote(project) && (
              <Tooltip title={quoteEditHint(project)}>
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={14} />}
                  aria-label={`调整${project.name}的报价`}
                  disabled={!project.quoteEditable}
                  onClick={() => openQuoteAdjustment(project)}
                />
              </Tooltip>
            )}
          </div>
        );
      }
    },
    {
      title: "草稿模型",
      key: "draft",
      width: 220,
      render: (_, project) => {
        const draft = draftsByProject.get(project.id);
        if (!draft) return <span className="muted">-</span>;
        return <div className="erp-primary-cell"><strong>{draft.name}</strong><Button type="link" size="small" icon={<PencilRuler size={14} />} href={getDesignerDraftUrl(draft.id)}>返回设计台修改</Button></div>;
      }
    },
    { title: "最后更新", dataIndex: "updatedAt", width: 150, responsive: ["lg"] }
  ];

  function createProject(values: ProjectFormValues) {
    const now = new Date();
    addProject({
      id: createClientId(),
      code: `PJ-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`,
      customer: values.customer,
      contact: values.contact,
      phone: values.phone,
      name: values.name,
      site: values.site,
      owner: values.owner,
      stage: "线索",
      budget: values.budget || 0,
      quoteAmount: null,
      suggestedQuoteAmount: null,
      quoteSource: null,
      quoteId: null,
      quoteRevision: null,
      quoteStatus: null,
      quoteEditable: false,
      quoteNote: null,
      updatedAt: new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(now)
    });
    form.resetFields();
    setOpen(false);
  }

  function openQuoteAdjustment(project: CustomerProject) {
    if (!project.quoteEditable) return;
    const requestId = ++quoteAuditRequest.current;
    setQuoteProject(project);
    setQuoteAudits([]);
    setQuoteError(null);
    setQuoteAuditLoading(false);
    if (!session || session.mode !== "live" || !internalPricingVisible) return;
    setQuoteAuditLoading(true);
    void api.listProjectQuoteHistory(project.id, session.activeTenantId)
      .then((items) => {
        if (quoteAuditRequest.current === requestId) setQuoteAudits(items);
      })
      .catch(() => {
        if (quoteAuditRequest.current === requestId) setQuoteAudits([]);
      })
      .finally(() => {
        if (quoteAuditRequest.current === requestId) setQuoteAuditLoading(false);
      });
  }

  function closeQuoteAdjustment() {
    if (quoteSaving) return;
    quoteAuditRequest.current += 1;
    setQuoteProject(null);
    setQuoteAudits([]);
    setQuoteAuditLoading(false);
    setQuoteError(null);
    quoteForm.resetFields();
  }

  async function saveQuoteAdjustment(values: QuoteAdjustmentFormValues) {
    if (!quoteProject || !session) return;
    if (session.mode !== "live") {
      messageApi.info("演示模式不会写入报价数据。");
      closeQuoteAdjustment();
      return;
    }
    const manualTotalMinor = Math.round(values.finalQuote * 100);
    const salesMultiplierBasisPoints = Math.round((values.salesMultiplier || DEFAULT_SALES_MULTIPLIER) * 10000);
    const multiplierTotalMinor = multiplierQuoteMinor(projectBasePriceTotalMinor(quoteProject), salesMultiplierBasisPoints / 10000);
    const adjustmentReason = values.adjustmentReason?.trim();
    const requiresAdjustmentReason = internalPricingVisible && multiplierTotalMinor !== null && manualTotalMinor !== multiplierTotalMinor;
    if (requiresAdjustmentReason && !adjustmentReason) {
      quoteForm.setFields([{ name: "adjustmentReason", errors: ["最终报价与倍率参考价不一致时，请填写调整原因"] }]);
      return;
    }
    const notes = values.notes?.trim() || null;
    setQuoteSaving(true);
    setQuoteError(null);
    try {
      if (quoteProject.quoteId) {
        if (quoteProject.quoteRevision === null) throw new Error("报价版本缺失，请刷新页面后重试。");
        await api.updateQuote(
          quoteProject.quoteId,
          {
            manualTotalMinor,
            ...(internalPricingVisible ? { salesMultiplierBasisPoints, adjustmentReason: requiresAdjustmentReason ? adjustmentReason : undefined } : { adjustmentReason: LEGACY_QUOTE_ADJUSTMENT_REASON }),
            notes
          },
          session.activeTenantId,
          quoteProject.quoteRevision
        );
      } else {
        await api.createProjectQuote(
          quoteProject.id,
          {
            manualTotalMinor,
            ...(internalPricingVisible ? { salesMultiplierBasisPoints, adjustmentReason: requiresAdjustmentReason ? adjustmentReason : undefined } : { adjustmentReason: LEGACY_QUOTE_ADJUSTMENT_REASON }),
            notes
          },
          session.activeTenantId
        );
      }
      await refresh();
      messageApi.success("报价已保存，调整记录已备案。");
      setQuoteProject(null);
      setQuoteAudits([]);
      quoteForm.resetFields();
    } catch (error) {
      const fallback = error instanceof ApiError && error.status === 409
        ? "报价已被其他人更新或当前状态不可修改，请刷新后重试。"
        : error instanceof Error ? error.message : "报价保存失败，请稍后重试。";
      setQuoteError(fallback);
    } finally {
      setQuoteSaving(false);
    }
  }

  const activeSalesMultiplier = typeof quoteMultiplier === "number" && Number.isFinite(quoteMultiplier) && quoteMultiplier > 0
    ? quoteMultiplier
    : DEFAULT_SALES_MULTIPLIER;
  const multiplierReferenceMinor = quoteProject && internalPricingVisible
    ? multiplierQuoteMinor(projectBasePriceTotalMinor(quoteProject), activeSalesMultiplier)
    : null;
  const multiplierReferenceAmount = amountFromMinor(multiplierReferenceMinor);
  const finalQuoteOverridesMultiplier = multiplierReferenceMinor !== null
    && typeof quoteFinalAmount === "number"
    && Math.round(quoteFinalAmount * 100) !== multiplierReferenceMinor;

  return (
    <div className="page">
      {messageContext}
      <PageHeader
        title="客户与项目"
        description="维护销售机会、客户联系人与方案推进状态。"
        actions={<Space wrap><Button icon={<Download size={15} />}>导出</Button></Space>}
      />
      <section className="erp-table-card">
        <div className="erp-table-toolbar">
          <Input.Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目编号、客户或负责人" />
          <Space wrap>
            <Select
              className="erp-project-stage-select"
              popupClassName="erp-project-stage-dropdown"
              value={stage}
              onChange={setStage}
              options={projectStages.map((value) => ({ value, label: value }))}
              prefix={<Filter size={14} />}
            />
            <Button icon={<SlidersHorizontal size={15} />} aria-label="更多筛选" title="更多筛选" />
          </Space>
        </div>
        <Table<CustomerProject>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: "没有匹配的项目" }}
        />
      </section>

      <Modal
        className="erp-project-modal"
        open={open}
        title="新建客户项目"
        okText="创建项目"
        cancelText="取消"
        width={680}
        onCancel={closeCreateProject}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <p className="erp-modal-description">建立销售机会后，可继续创建配置方案与报价。</p>
        <Form<ProjectFormValues> form={form} layout="vertical" initialValues={{ owner: "林乔" }} onFinish={createProject}>
          <div className="erp-form-grid">
            <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}><Input placeholder="例如：总部会议区改造" /></Form.Item>
            <Form.Item label="客户名称" name="customer" rules={[{ required: true, message: "请输入客户名称" }]}><Input placeholder="公司或个人名称" /></Form.Item>
            <Form.Item label="联系人" name="contact" rules={[{ required: true, message: "请输入联系人" }]}><Input /></Form.Item>
            <Form.Item label="联系电话" name="phone" rules={[{ required: true, message: "请输入联系电话" }]}><Input /></Form.Item>
            <Form.Item label="项目地点" name="site" rules={[{ required: true, message: "请输入项目地点" }]}><Input placeholder="城市 · 区域" /></Form.Item>
            <Form.Item label="接待销售" name="owner" rules={[{ required: true, message: "请输入接待销售" }]}><Input /></Form.Item>
            <Form.Item className="span-2" label="预算金额" name="budget"><InputNumber min={0} step={1000} prefix="¥" style={{ width: "100%" }} /></Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        className="erp-quote-modal"
        open={Boolean(quoteProject)}
        title="项目报价备案"
        okText="保存并备案"
        cancelText="取消"
        width={680}
        confirmLoading={quoteSaving}
        onCancel={closeQuoteAdjustment}
        onOk={() => quoteForm.submit()}
        destroyOnHidden
      >
        {quoteProject && (
          <>
            <div className="erp-quote-context">
              <div><span>项目</span><strong>{quoteProject.name}</strong></div>
              <div><span>接待销售</span><strong>{quoteProject.owner}</strong></div>
              {internalPricingVisible && <div><span>1.0 基准价</span><strong>{amountFromMinor(projectBasePriceTotalMinor(quoteProject)) === null ? "-" : money.format(amountFromMinor(projectBasePriceTotalMinor(quoteProject))!)}</strong></div>}
              {internalPricingVisible && <div><span>倍率参考价</span><strong>{multiplierReferenceAmount === null ? "-" : money.format(multiplierReferenceAmount)}</strong></div>}
              <div><span>当前对客报价</span><strong>{quoteProject.quoteAmount === null ? "尚未建立" : money.format(quoteProject.quoteAmount)}</strong></div>
            </div>
            {internalPricingVisible ? <p className="erp-modal-description erp-quote-guidance">1.0 基准价不含运费和包装。倍率参考价仅供企业内部报价判断；保存后会和最终报价一并备案，价格表后续变更不会影响历史记录。</p> : <p className="erp-modal-description erp-quote-guidance">当前报价按经销商结算规则计算。此处不展示企业内部基准价和倍率信息。</p>}
            {quoteError && <Alert className="notice" type="error" showIcon message={quoteError} />}
            <Form<QuoteAdjustmentFormValues> form={quoteForm} layout="vertical" onFinish={saveQuoteAdjustment}>
              {internalPricingVisible && <Form.Item
                label="销售倍率"
                name="salesMultiplier"
                extra="默认 1.50；倍率参考价按 1.0 基准价实时计算。"
                rules={[
                  { required: true, message: "请输入销售倍率" },
                  { type: "number", min: 1, max: 9.99, message: "倍率范围为 1.00 至 9.99" }
                ]}
              >
                <InputNumber min={1} max={9.99} precision={2} step={0.01} disabled={!canManageMultiplier} style={{ width: "100%" }} />
              </Form.Item>}
              <Form.Item
                label="最终对客报价"
                name="finalQuote"
                rules={[
                  { required: true, message: "请输入最终对客报价" },
                  { type: "number", min: 0.01, message: "最终报价必须大于 0" }
                ]}
              >
                <InputNumber min={0.01} precision={2} step={100} prefix="¥" style={{ width: "100%" }} />
              </Form.Item>
              {internalPricingVisible && finalQuoteOverridesMultiplier && <Form.Item
                label="调整原因"
                name="adjustmentReason"
                rules={[{ required: true, whitespace: true, message: "最终报价与倍率参考价不一致时，请填写调整原因" }]}
              >
                <Input.TextArea rows={2} maxLength={500} showCount placeholder="说明本次优惠、加价或客户约定" />
              </Form.Item>}
              <Form.Item
                label="客户备注（选填）"
                name="notes"
                extra="随报价保存，并在创建订单后继续显示，适合记录赠送小样、礼物或其他客户约定。"
              >
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder="例如：随单赠送白色板材小样 1 套，发货前由销售确认。"
                />
              </Form.Item>
            </Form>
            {internalPricingVisible && <section className="erp-quote-audit-section">
              <header><FileClock size={16} /><strong>报价备案记录</strong></header>
              {quoteAuditLoading ? (
                <div className="erp-quote-audit-empty">正在读取调整记录...</div>
              ) : quoteAudits.length ? (
                <div className="erp-quote-audit-list">
                  {quoteAudits.slice(0, 5).map((audit) => (
                    <div key={audit.id} className="erp-quote-audit-row">
                      <span className="erp-quote-audit-icon"><FileClock size={14} /></span>
                      <div>
                        <strong>{audit.actor} {audit.action === "quote.created" ? "创建报价" : "调整报价"}</strong>
                        <p>
                          {audit.basePriceAmount !== null && audit.basePriceAmount !== undefined && <><span>1.0 {money.format(audit.basePriceAmount)}</span><span> · </span></>}
                          {audit.salesMultiplierBasisPoints !== null && audit.salesMultiplierBasisPoints !== undefined && <><span>倍率 {(audit.salesMultiplierBasisPoints / 10000).toFixed(2)}</span><span> · </span></>}
                          {audit.multiplierQuoteAmount !== null && audit.multiplierQuoteAmount !== undefined && <><span>参考 {money.format(audit.multiplierQuoteAmount)}</span><span> → </span></>}
                          {audit.finalAmount === null ? "-" : money.format(audit.finalAmount)}
                        </p>
                        <small>{audit.reason} · {formatAuditTime(audit.createdAt)}</small>
                        {audit.note && <p className="erp-quote-audit-note">客户备注：{audit.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无人工报价调整记录" />
              )}
            </section>}
          </>
        )}
      </Modal>
    </div>
  );
}
