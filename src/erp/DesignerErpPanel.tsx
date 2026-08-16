import {
  Building2,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  LogIn,
  Pencil,
  Save,
  ShoppingCart,
  UserRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BomItem, CabinetConfig } from "../model";
import {
  ErpApiError,
  createIdempotencyKey,
  erpRequest,
  getErpAppUrl,
  getErpLoginUrl,
  getSalesPricingPreference,
  saveSalesPricingPreference,
  type ErpCustomer,
  type ErpDesignContext,
  type ErpOrderWorkflow,
  type ErpProject,
  type ErpQuoteWorkflow,
  type ErpSession,
  type ErpTemplate,
  unwrapItem,
  unwrapItems
} from "./api";

const ACTIVE_DESIGN_KEY = "usm-erp-active-design-v1";
const MAX_QUOTE_PREVIEW_DATA_URL_LENGTH = 900_000;

type ConnectionState = "loading" | "authenticated" | "unauthenticated" | "offline";
type PanelView = "project" | "templates";

interface DesignerErpPanelProps {
  config: CabinetConfig;
  bom: BomItem[];
  pricingSnapshot: unknown;
  dimensions: { outerWidth: number; outerHeight: number; outerDepth: number };
  salesMultiplierBasisPoints: number;
  salesMultiplierSource: "user_default" | "system_default";
  onSalesMultiplierChange: (value: number, source?: "user_default" | "system_default") => void;
  getPreviewDataUrl: () => string | undefined;
  onApplyConfig: (config: CabinetConfig) => void;
  onNotice: (message: string) => void;
  resumeDraftId?: string | null;
}

export function DesignerErpPanel({
  config,
  bom,
  pricingSnapshot,
  dimensions,
  salesMultiplierBasisPoints,
  salesMultiplierSource,
  onSalesMultiplierChange,
  getPreviewDataUrl,
  onApplyConfig,
  onNotice,
  resumeDraftId
}: DesignerErpPanelProps) {
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [session, setSession] = useState<ErpSession | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>("project");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<ErpTemplate[]>([]);
  const [customers, setCustomers] = useState<ErpCustomer[]>([]);
  const [projects, setProjects] = useState<ErpProject[]>([]);
  const [quotes, setQuotes] = useState<ErpQuoteWorkflow[]>([]);
  const [orders, setOrders] = useState<ErpOrderWorkflow[]>([]);
  const [activeDesign, setActiveDesign] = useState<ErpDesignContext | null>(() => readActiveDesign());
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [multiplierInput, setMultiplierInput] = useState((salesMultiplierBasisPoints / 10000).toFixed(2));
  const [quoteCreated, setQuoteCreated] = useState<{ code: string; totalMinor: number } | null>(null);
  const restoredDraftId = useRef<string | null>(null);
  const authRequired = import.meta.env.VITE_ERP_AUTH_REQUIRED === "true";

  const refreshSession = useCallback(async () => {
    setConnection("loading");
    try {
      const payload = await erpRequest<unknown>("/api/session");
      const next = unwrapItem<ErpSession | null>(payload);
      if (!next?.user || !next.organization) {
        setSession(null);
        setConnection("unauthenticated");
        return;
      }
      setSession(next);
      setConnection("authenticated");
    } catch (requestError) {
      if (requestError instanceof ErpApiError && requestError.status === 401) {
        setSession(null);
        setConnection("unauthenticated");
        return;
      }
      setSession(null);
      setConnection("offline");
    }
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [templatePayload, customerPayload, projectPayload, quotePayload, orderPayload] = await Promise.all([
        erpRequest<unknown>("/api/templates?status=published"),
        erpRequest<unknown>("/api/customers"),
        erpRequest<unknown>("/api/projects"),
        erpRequest<unknown>("/api/quotes"),
        erpRequest<unknown>("/api/orders")
      ]);
      setTemplates(unwrapItems<unknown>(templatePayload).map(normalizeTemplate));
      setCustomers(unwrapItems<ErpCustomer>(customerPayload));
      setProjects(unwrapItems<ErpProject>(projectPayload));
      setQuotes(unwrapItems<unknown>(quotePayload).map(normalizeQuoteWorkflow));
      setOrders(unwrapItems<unknown>(orderPayload).map(normalizeOrderWorkflow));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (connection === "authenticated") void loadWorkspaceData();
    if (connection === "unauthenticated" && authRequired) {
      window.location.assign(getErpLoginUrl());
    }
  }, [authRequired, connection, loadWorkspaceData]);

  useEffect(() => {
    setMultiplierInput((salesMultiplierBasisPoints / 10000).toFixed(2));
  }, [salesMultiplierBasisPoints]);

  useEffect(() => {
    if (connection !== "authenticated" || !isHeadquarters(session)) return;
    void getSalesPricingPreference()
      .then((preference) => onSalesMultiplierChange(preference.salesMultiplierBasisPoints, preference.source))
      .catch(() => undefined);
  }, [connection, onSalesMultiplierChange, session]);

  useEffect(() => {
    if (!resumeDraftId || connection !== "authenticated" || restoredDraftId.current === resumeDraftId) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        const draftPayload = await erpRequest<unknown>(`/api/designs/${encodeURIComponent(resumeDraftId)}/draft`);
        const draft = unwrapItem<Record<string, unknown>>(draftPayload);
        const projectId = String(draft.projectId ?? "");
        if (!projectId || !draft.configSnapshot || typeof draft.configSnapshot !== "object") {
          throw new Error("该草稿模型缺少可编辑配置。");
        }
        const projectPayload = await erpRequest<unknown>(`/api/projects/${encodeURIComponent(projectId)}`);
        const project = unwrapItem<Record<string, unknown>>(projectPayload);
        if (cancelled) return;
        const context: ErpDesignContext = {
          designId: String(draft.id ?? resumeDraftId),
          designCode: String(draft.code ?? "未编号方案"),
          projectId,
          projectCode: String(project.code ?? projectId),
          projectName: String(project.name ?? draft.name ?? "未命名项目"),
          draftRevision: numberValue(draft.draftRevision ?? draft.revision, 1),
          updatedAt: stringValue(draft.updatedAt)
        };
        persistActiveDesign(context);
        onApplyConfig(draft.configSnapshot as CabinetConfig);
        restoredDraftId.current = resumeDraftId;
        onNotice(`已恢复草稿：${context.designCode}`);
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connection, onApplyConfig, onNotice, resumeDraftId]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeDesign?.projectId),
    [activeDesign?.projectId, projects]
  );

  const activeQuote = useMemo(() => {
    if (!activeDesign) return null;
    return quotes
      .filter((quote) => quote.projectId === activeDesign.projectId && !["rejected", "expired", "cancelled"].includes(quote.status))
      .sort((left, right) => right.updatedAt?.localeCompare(left.updatedAt ?? "") || right.revision - left.revision)[0] ?? null;
  }, [activeDesign, quotes]);

  const activeOrder = useMemo(() => {
    if (!activeQuote) return null;
    return orders.find((order) => order.acceptedQuoteId === activeQuote.id) ?? null;
  }, [activeQuote, orders]);

  const suggestedRetailTotalMinor = useMemo(() => suggestedRetailFromPricingSnapshot(pricingSnapshot), [pricingSnapshot]);
  const salesMultiplierReferenceMinor = suggestedRetailTotalMinor === null
    ? null
    : Math.round(suggestedRetailTotalMinor * salesMultiplierBasisPoints / 10000);
  const canViewEnterpriseMultiplier = isHeadquarters(session);
  const quoteCanBeAdjusted = activeQuote?.status === "draft" || activeQuote?.status === "priced";
  const quoteCanCreateOrder = activeQuote?.status === "customer_confirmed" || activeQuote?.status === "accepted";
  const canCreateOrders = session?.permissions?.includes("orders:write") ?? false;

  function parseMultiplier(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const basisPoints = Math.round(parsed * 10000);
    return basisPoints >= 10000 && basisPoints <= 99900 ? basisPoints : null;
  }

  function applyMultiplierInput(value: string) {
    setMultiplierInput(value);
    const basisPoints = parseMultiplier(value);
    if (basisPoints !== null) onSalesMultiplierChange(basisPoints, salesMultiplierSource);
  }

  async function saveMultiplierPreference() {
    const basisPoints = parseMultiplier(multiplierInput);
    if (basisPoints === null) {
      setError("销售倍率需在 1.00 至 9.99 之间");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const preference = await saveSalesPricingPreference(basisPoints);
      onSalesMultiplierChange(preference.salesMultiplierBasisPoints, "user_default");
      onNotice(`已保存你的默认倍率 ${(basisPoints / 10000).toFixed(2)}`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function capturePreviewDataUrl() {
    try {
      const captured = getPreviewDataUrl();
      if (
        captured
        && /^data:image\/(?:png|jpeg|webp);base64,/i.test(captured)
        && captured.length <= MAX_QUOTE_PREVIEW_DATA_URL_LENGTH
      ) {
        return captured;
      }
    } catch {
      // The order can still be created from the frozen configuration snapshot.
    }
    return undefined;
  }

  function persistActiveDesign(next: ErpDesignContext | null) {
    setActiveDesign(next);
    if (next) window.localStorage.setItem(ACTIVE_DESIGN_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(ACTIVE_DESIGN_KEY);
  }

  async function createCustomer() {
    if (!newCustomerName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = await erpRequest<unknown>("/api/customers", {
        method: "POST",
        idempotencyKey: createIdempotencyKey("customer"),
        body: JSON.stringify({ name: newCustomerName.trim(), phone: newCustomerPhone.trim() || undefined })
      });
      const customer = unwrapItem<ErpCustomer>(payload);
      setCustomers((items) => [customer, ...items]);
      setCustomerId(customer.id);
      setNewCustomerName("");
      setNewCustomerPhone("");
      onNotice("客户已创建");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function createProjectAndDesign() {
    if (!customerId || !projectName.trim()) {
      setError("请选择客户并填写项目名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const projectPayload = await erpRequest<unknown>("/api/projects", {
        method: "POST",
        idempotencyKey: createIdempotencyKey("project"),
        body: JSON.stringify({ customerId, name: projectName.trim() })
      });
      const project = unwrapItem<ErpProject>(projectPayload);
      const designPayload = await erpRequest<unknown>("/api/designs", {
        method: "POST",
        idempotencyKey: createIdempotencyKey("design"),
        body: JSON.stringify(buildDesignPayload(project.id, project.name))
      });
      const design = unwrapItem<Record<string, unknown>>(designPayload);
      const context: ErpDesignContext = {
        designId: String(design.id),
        designCode: String(design.code ?? "未编号方案"),
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        draftRevision: numberValue(design.draftRevision, 1),
        updatedAt: stringValue(design.updatedAt)
      };
      setProjects((items) => [project, ...items]);
      persistActiveDesign(context);
      setProjectName("");
      onNotice(`${context.designCode} 已建立`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(showSuccess = true) {
    if (!activeDesign) {
      setOpen(true);
      setView("project");
      setError("请先建立项目和设计方案");
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await erpRequest<unknown>(`/api/designs/${activeDesign.designId}/draft`, {
        method: "PUT",
        headers: { "If-Match": String(activeDesign.draftRevision) },
        body: JSON.stringify(buildDesignPayload(activeDesign.projectId, activeDesign.projectName))
      });
      const draft = unwrapItem<Record<string, unknown>>(payload);
      const next = {
        ...activeDesign,
        draftRevision: numberValue(draft.draftRevision ?? draft.revision, activeDesign.draftRevision + 1),
        updatedAt: stringValue(draft.updatedAt) ?? new Date().toISOString()
      };
      persistActiveDesign(next);
      if (showSuccess) onNotice("草稿已保存到 ERP");
      return next;
    } catch (requestError) {
      if (requestError instanceof ErpApiError && requestError.status === 409) {
        setError("服务器上已有更新版本，请在 ERP 中确认后再继续保存");
        setOpen(true);
      } else {
        setError(errorMessage(requestError));
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    const previewDataUrl = capturePreviewDataUrl();
    const saved = await saveDraft(false);
    if (!saved) return;
    const project = projects.find((item) => item.id === saved.projectId);
    if (!project?.customerId) {
      setError("项目客户信息尚未同步，请稍后重试创建报价");
      setOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const versionPayload = await erpRequest<unknown>(`/api/designs/${saved.designId}/versions`, {
        method: "POST",
        idempotencyKey: createIdempotencyKey("design-version"),
        body: JSON.stringify({ sourceDraftRevision: saved.draftRevision })
      });
      const version = unwrapItem<Record<string, unknown>>(versionPayload);
      const quotePayload = await erpRequest<unknown>("/api/quotes", {
        method: "POST",
        idempotencyKey: createIdempotencyKey("quote"),
        body: JSON.stringify({
          projectId: saved.projectId,
          customerId: project.customerId,
          designVersionId: version.id,
          validUntil: defaultQuoteValidUntil(),
          previewDataUrl,
          salesMultiplierBasisPoints
        })
      });
      const quote = unwrapItem<Record<string, unknown>>(quotePayload);
      const previewNotice = previewDataUrl ? "" : "；3D 快照未生成，订单页将显示前视结构图";
      onNotice(`${String(quote.code ?? "报价")} 已按建议零售价创建，可由接待销售调整后提交审核${previewNotice}`);
      await loadWorkspaceData();
      setQuoteCreated({ code: String(quote.code ?? "报价"), totalMinor: Number(quote.totalMinor ?? salesMultiplierReferenceMinor ?? 0) });
    } catch (requestError) {
      setError(errorMessage(requestError));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function createOrderFromActiveQuote() {
    if (!activeQuote) return;
    if (activeQuote.status !== "customer_confirmed" && activeQuote.status !== "accepted") {
      setError("客户确认报价后才能创建订单，请先在 ERP 报价管理中完成客户确认。");
      return;
    }
    const previewDataUrl = capturePreviewDataUrl();
    setBusy(true);
    setError("");
    try {
      const payload = await erpRequest<unknown>("/api/orders", {
        method: "POST",
        idempotencyKey: createIdempotencyKey("order"),
        body: JSON.stringify({
          acceptedQuoteId: activeQuote.id,
          ...(previewDataUrl ? { previewDataUrl } : {})
        })
      });
      const order = unwrapItem<ErpOrderWorkflow>(payload);
      await loadWorkspaceData();
      onNotice(`订单 ${order.orderNo} 已创建，报价与配置已冻结`);
      window.open(getErpAppUrl(`/orders/${order.id}`), "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function openActiveOrder() {
    if (!activeOrder) return;
    window.open(getErpAppUrl(`/orders/${activeOrder.id}`), "_blank", "noopener,noreferrer");
  }

  function openQuoteAdjustment() {
    if (!activeDesign) return;
    window.open(getErpAppUrl(`/projects?quoteProject=${encodeURIComponent(activeDesign.projectId)}`), "_blank", "noopener,noreferrer");
  }

  function buildDesignPayload(projectId: string, name: string) {
    return {
      projectId,
      name: `${name} 设计方案`,
      schemaVersion: "4.22.0",
      configSnapshot: config,
      bomSnapshot: bom,
      pricingSnapshot: {
        ...(pricingSnapshot && typeof pricingSnapshot === "object" ? pricingSnapshot as Record<string, unknown> : {}),
        salesMultiplierBasisPoints,
        multiplierQuoteTotalMinor: salesMultiplierReferenceMinor
      }
    };
  }

  function applyTemplate(template: ErpTemplate) {
    if (!template.configSnapshot || typeof template.configSnapshot !== "object") {
      setError("该模板缺少配置快照");
      return;
    }
    onApplyConfig(template.configSnapshot as CabinetConfig);
    onNotice(`已应用模板：${template.name}`);
    setOpen(false);
  }

  function openPanel(nextView: PanelView) {
    if (connection === "unauthenticated") {
      window.location.assign(getErpLoginUrl());
      return;
    }
    setView(nextView);
    setError("");
    setOpen(true);
  }

  return (
    <>
      <button className={`erp-connection ${connection}`} type="button" onClick={() => openPanel("project")} title="项目与 ERP 连接">
        {connection === "loading" ? <Loader2 size={15} className="spin" /> : null}
        {connection === "authenticated" ? <CheckCircle2 size={15} /> : null}
        {connection === "unauthenticated" ? <LogIn size={15} /> : null}
        {connection === "offline" ? <CloudOff size={15} /> : null}
        <span>{connectionLabel(connection, session)}</span>
      </button>
      <button className="icon-button" type="button" title="保存项目草稿" aria-label="保存项目草稿" disabled={busy || connection !== "authenticated"} onClick={() => void saveDraft()}>
        {busy ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
      </button>

      {open ? (
        <div className="erp-panel-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="erp-designer-panel" role="dialog" aria-modal="true" aria-label="ERP 项目工作台">
            <header>
              <div>
                <span>ERP 项目工作台</span>
                <strong>{activeDesign?.designCode ?? "尚未建立方案"}</strong>
              </div>
              <button className="icon-button" type="button" aria-label="关闭" title="关闭" onClick={() => setOpen(false)}><X size={18} /></button>
            </header>

            <div className="erp-panel-tabs" role="tablist">
              <button className={view === "project" ? "active" : ""} type="button" onClick={() => setView("project")}><Building2 size={16} /> 项目</button>
            </div>

            {error ? <div className="erp-panel-error">{error}</div> : null}

            <div className="erp-panel-body">
              {view === "project" ? (
                <div className="erp-project-view">
                  <div className="erp-account-row">
                    <div className="erp-account-icon"><UserRound size={18} /></div>
                    <div><strong>{session?.user.name ?? "未登录"}</strong><span>{session?.organization.name ?? "ERP"} · {session?.user.role ?? "-"}</span></div>
                    <a href={getErpAppUrl("/")} target="_blank" rel="noreferrer">打开后台 <ExternalLink size={14} /></a>
                  </div>

                  {activeDesign ? (
                    <section className="erp-active-design">
                      <div><span>当前项目</span><strong>{activeDesign.projectName}</strong></div>
                      <div><span>项目编号</span><strong>{activeDesign.projectCode}</strong></div>
                      <div><span>草稿版本</span><strong>v{activeDesign.draftRevision}</strong></div>
                      <div><span>客户</span><strong>{activeProject?.customerName ?? "已关联"}</strong></div>
                      <div>
                        <span>1.0 基准价</span>
                        <strong>{suggestedRetailTotalMinor === null ? "价格待确认" : formatRmbMinor(suggestedRetailTotalMinor)}</strong>
                        <small>{suggestedRetailTotalMinor === null ? "请等待设计器完成价格计算" : "不含运费、包装"}</small>
                      </div>
                      {canViewEnterpriseMultiplier && (
                        <div>
                          <span>销售倍率 / 参考价</span>
                          <strong>{multiplierInput} 倍 · {salesMultiplierReferenceMinor === null ? "价格待确认" : formatRmbMinor(salesMultiplierReferenceMinor)}</strong>
                          <small>{salesMultiplierSource === "user_default" ? "当前使用你的默认倍率" : "当前使用系统默认 1.50 倍"}</small>
                        </div>
                      )}
                      {canViewEnterpriseMultiplier && activeDesign ? (
                        <div className="erp-multiplier-editor">
                          <label htmlFor="designer-sales-multiplier">本项目销售倍率</label>
                          <div>
                            <input
                              id="designer-sales-multiplier"
                              type="number"
                              min="1"
                              max="9.99"
                              step="0.01"
                              value={multiplierInput}
                              onChange={(event) => applyMultiplierInput(event.target.value)}
                            />
                            <button type="button" disabled={busy} onClick={() => void saveMultiplierPreference()}>保存为我的默认倍率</button>
                          </div>
                          <small>项目内可直接调整；保存默认倍率只影响后续新报价，不会改动已备案报价。</small>
                        </div>
                      ) : null}
                      {quoteCreated ? (
                        <div className="erp-quote-created">
                          <strong>{quoteCreated.code} 已创建</strong>
                          <span>当前报价 {formatRmbMinor(quoteCreated.totalMinor)}，下一步请进入报价备案完成客户确认。</span>
                          <button type="button" onClick={openQuoteAdjustment}>进入报价备案</button>
                        </div>
                      ) : null}
                      <div>
                        <span>报价 / 订单</span>
                        <strong>{activeOrder ? `订单已创建 ${activeOrder.orderNo}` : activeQuote ? quoteWorkflowLabel(activeQuote.status) : "尚未创建报价"}</strong>
                        <small>{activeOrder
                          ? "已基于当前客户确认报价创建，可进入订单继续处理"
                          : quoteCanCreateOrder
                            ? `客户已确认，等待销售创建订单 · ${formatRmbMinor(activeQuote.totalMinor)}`
                            : activeQuote
                              ? `当前对客报价 ${formatRmbMinor(activeQuote.totalMinor)}`
                              : "创建后可由接待销售调整最终报价"}</small>
                      </div>
                      <button type="button" className="erp-text-button" onClick={() => persistActiveDesign(null)}>退出当前方案</button>
                    </section>
                  ) : (
                    <>
                      <section className="erp-form-section">
                        <h2>选择客户</h2>
                        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                          <option value="">请选择客户</option>
                          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</option>)}
                        </select>
                        <div className="erp-inline-form">
                          <input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} placeholder="新客户名称" />
                          <input value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} placeholder="联系电话" />
                          <button type="button" disabled={busy || !newCustomerName.trim()} onClick={() => void createCustomer()}>新增</button>
                        </div>
                      </section>
                      <section className="erp-form-section">
                        <h2>建立项目与方案</h2>
                        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：上海办公室储物柜" />
                        <button type="button" className="erp-submit-button" disabled={busy || !customerId || !projectName.trim()} onClick={() => void createProjectAndDesign()}>
                          {busy ? <Loader2 size={16} className="spin" /> : <Building2 size={16} />} 建立项目
                        </button>
                      </section>
                    </>
                  )}
                </div>
              ) : (
                <div className="erp-template-view">
                  {templates.length ? templates.map((template) => (
                    <article className="erp-template-item" key={template.id}>
                      <div className="erp-template-preview">
                        {template.thumbnailUrl ? <img src={template.thumbnailUrl} alt="" /> : <LayoutTemplate size={24} />}
                      </div>
                      <div>
                        <span>{template.code} · v{template.version}</span>
                        <strong>{template.name}</strong>
                        <small>{template.category}{template.tags?.length ? ` · ${template.tags.join(" / ")}` : ""}</small>
                      </div>
                      <button type="button" onClick={() => applyTemplate(template)}>应用</button>
                    </article>
                  )) : <div className="erp-empty-state">暂无已发布模板。总部可在 `9014` 模板管理中发布。</div>}
                </div>
              )}
            </div>

            <footer>
              <span>{dimensions.outerWidth} × {dimensions.outerHeight} × {dimensions.outerDepth} mm</span>
              <div>
                <button type="button" disabled={!activeDesign || busy} onClick={() => void saveDraft()}><Save size={16} /> 保存草稿</button>
                {!activeQuote && <button type="button" className="erp-submit-button" disabled={!activeDesign || busy || suggestedRetailTotalMinor === null} onClick={() => void createQuote()}><ShoppingCart size={16} /> 创建倍率报价</button>}
                {activeQuote && !activeOrder && quoteCanBeAdjusted && <button type="button" disabled={busy} onClick={openQuoteAdjustment}><Pencil size={16} /> 调整报价</button>}
                {activeQuote && !activeOrder && quoteCanCreateOrder && canCreateOrders && <button type="button" className="erp-submit-button" disabled={busy} onClick={() => void createOrderFromActiveQuote()}><ShoppingCart size={16} /> 创建订单</button>}
                {activeOrder && <button type="button" className="erp-submit-button" onClick={openActiveOrder}><ExternalLink size={16} /> 查看已创建订单</button>}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function normalizeTemplate(value: unknown): ErpTemplate {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const latestVersion = raw.latestVersion && typeof raw.latestVersion === "object"
    ? raw.latestVersion as Record<string, unknown>
    : {};
  return {
    id: String(raw.id ?? latestVersion.templateId ?? ""),
    code: String(raw.code ?? raw.id ?? "TPL"),
    name: String(raw.name ?? latestVersion.name ?? "Untitled template"),
    category: String(raw.category ?? "standard"),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    thumbnailUrl: stringValue(raw.thumbnailUrl),
    version: numberValue(latestVersion.version ?? raw.version ?? raw.revision, 1),
    configSnapshot: latestVersion.configSnapshot ?? raw.configSnapshot,
    estimatedPrice: typeof raw.estimatedPrice === "number" ? raw.estimatedPrice : undefined
  };
}

function normalizeQuoteWorkflow(value: unknown): ErpQuoteWorkflow {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? raw.quoteNo ?? "报价"),
    projectId: String(raw.projectId ?? ""),
    status: String(raw.status ?? ""),
    totalMinor: numberValue(raw.totalMinor, 0),
    basePriceTotalMinor: raw.basePriceTotalMinor === null || raw.basePriceTotalMinor === undefined ? null : numberValue(raw.basePriceTotalMinor, 0),
    salesMultiplierBasisPoints: raw.salesMultiplierBasisPoints === null || raw.salesMultiplierBasisPoints === undefined ? null : numberValue(raw.salesMultiplierBasisPoints, 15000),
    multiplierQuoteTotalMinor: raw.multiplierQuoteTotalMinor === null || raw.multiplierQuoteTotalMinor === undefined ? null : numberValue(raw.multiplierQuoteTotalMinor, 0),
    revision: numberValue(raw.revision, 1),
    updatedAt: stringValue(raw.updatedAt)
  };
}

function normalizeOrderWorkflow(value: unknown): ErpOrderWorkflow {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: String(raw.id ?? ""),
    orderNo: String(raw.orderNo ?? raw.code ?? "订单"),
    projectId: String(raw.projectId ?? ""),
    acceptedQuoteId: raw.acceptedQuoteId === null || raw.acceptedQuoteId === undefined ? null : String(raw.acceptedQuoteId),
    status: String(raw.status ?? ""),
    updatedAt: stringValue(raw.updatedAt)
  };
}

function quoteWorkflowLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "报价草稿",
    priced: "报价待确认",
    submitted: "等待审核",
    approved: "已批准，等待客户确认",
    sent: "已发送，等待客户确认",
    customer_confirmed: "客户已确认，等待创建订单",
    accepted: "报价已接受，等待创建订单",
    converted: "订单已创建",
    changes_requested: "待修改",
    rejected: "已失效",
    expired: "已失效",
    cancelled: "已取消"
  };
  return labels[status] ?? "报价处理中";
}

function defaultQuoteValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function readActiveDesign(): ErpDesignContext | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_DESIGN_KEY);
    return raw ? JSON.parse(raw) as ErpDesignContext : null;
  } catch {
    return null;
  }
}

function connectionLabel(connection: ConnectionState, session: ErpSession | null) {
  if (connection === "loading") return "连接 ERP";
  if (connection === "authenticated") return session?.organization.name ?? "ERP 已连接";
  if (connection === "unauthenticated") return "登录 ERP";
  return "ERP 离线";
}

function isHeadquarters(session: ErpSession | null) {
  return session?.organization.type === "hq" || session?.organization.organizationType === "hq";
}

function errorMessage(error: unknown) {
  if (error instanceof ErpApiError) return error.message;
  return error instanceof Error ? error.message : "ERP 操作失败";
}

function suggestedRetailFromPricingSnapshot(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.status !== "priced") return null;
  const total = Number(raw.retailTotalMinor);
  return Number.isInteger(total) && total >= 0 ? total : null;
}

function formatRmbMinor(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value / 100);
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
