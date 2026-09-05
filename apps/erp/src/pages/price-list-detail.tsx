import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Upload,
  message,
  type TableProps,
  type UploadProps
} from "antd";
import {
  ArrowLeft,
  ClipboardPaste,
  CloudDownload,
  Copy,
  FileCheck2,
  FileUp,
  RefreshCw,
  Save,
  Search,
  Send,
  TriangleAlert
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader, StatusBadge } from "../components/ui";
import { useAuth } from "../context/auth";
import { useWorkspace } from "../context/workspace";
import { api, ApiError } from "../lib/api";
import { createClientId } from "../lib/id";
import type {
  PriceItemCategory,
  PriceItemPricingMethod,
  PriceList,
  PriceListDetail,
  PriceListItem,
  PriceListValidationIssue,
  PriceListValidationResult
} from "../types";

const categories: PriceItemCategory[] = ["框架管件", "板件", "门类", "内部配件", "玻璃", "五金与支撑"];
const categoryOptions = categories.map((value) => ({ value, label: value }));
const methodLabels: Record<PriceItemPricingMethod, string> = {
  fixed: "固定单价",
  area: "按面积",
  length: "按长度",
  formula: "预设公式",
  included: "包含价",
  composite: "组合计算"
};

const demoCatalog: Array<[PriceItemCategory, string, string, string, string, PriceItemPricingMethod, number | null]> = [
  ["框架管件", "FR-TUBE-350", "横向钢管", "350 mm", "根", "fixed", 4200],
  ["框架管件", "FR-TUBE-395", "横向钢管", "395 mm", "根", "fixed", 4600],
  ["框架管件", "FR-TUBE-750", "立柱钢管", "750 mm", "根", "fixed", 7200],
  ["框架管件", "FR-TUBE-1090", "立柱钢管", "1090 mm", "根", "fixed", 8900],
  ["框架管件", "FR-CONNECTOR", "球形连接件", "标准", "个", "fixed", 1800],
  ["板件", "PN-350-350", "金属板件", "350 × 350 mm", "块", "fixed", 13800],
  ["板件", "PN-395-350", "金属板件", "395 × 350 mm", "块", "fixed", 14900],
  ["板件", "PN-750-350", "金属板件", "750 × 350 mm", "块", "fixed", 22800],
  ["板件", "PN-750-395", "金属板件", "750 × 395 mm", "块", "fixed", 24600],
  ["板件", "PN-CUSTOM", "非标金属板件", "按展开面积", "m²", "area", 68200],
  ["门类", "DR-DROP-750", "下翻门", "750 × 350 mm", "扇", "fixed", 49600],
  ["门类", "DR-DROP-395", "下翻门", "395 × 350 mm", "扇", "fixed", 37200],
  ["门类", "DR-HINGE-750", "平开门", "750 × 350 mm", "扇", "fixed", 51800],
  ["门类", "DR-LOCK", "门板锁具组件", "标准", "套", "composite", null],
  ["内部配件", "IN-SHELF-750", "内部层板", "750 × 350 mm", "块", "fixed", 21500],
  ["内部配件", "IN-DRAWER-350", "抽屉组件", "350 mm", "套", "fixed", 68500],
  ["内部配件", "IN-DRAWER-750", "双抽屉组件", "750 mm", "套", "fixed", 118000],
  ["内部配件", "IN-TRAY-350", "拉出托盘", "350 mm", "套", "fixed", 42100],
  ["内部配件", "IN-CABLE", "走线盒", "标准", "套", "fixed", null],
  ["玻璃", "GL-350-CLEAR", "透明玻璃板", "350 × 350 mm", "块", "fixed", 16800],
  ["玻璃", "GL-750-CLEAR", "透明玻璃板", "750 × 350 mm", "块", "fixed", 28600],
  ["玻璃", "GL-750-RIBBED", "长虹玻璃板", "750 × 350 mm", "块", "fixed", 34800],
  ["玻璃", "GL-CUSTOM", "非标玻璃", "按面积", "m²", "area", 96000],
  ["五金与支撑", "HW-FOOT", "调平脚", "标准", "个", "fixed", 2200],
  ["五金与支撑", "HW-CASTER", "脚轮", "带刹车", "个", "fixed", 8600],
  ["五金与支撑", "HW-WALL", "墙面固定组件", "标准", "套", "fixed", 12800],
  ["五金与支撑", "HW-HINGE", "铰链", "标准", "个", "fixed", 3600],
  ["五金与支撑", "HW-INCLUDED", "基础紧固件", "随柜体", "套", "included", null]
];

const demoSyncItems: Array<[PriceItemCategory, string, string, string, string, PriceItemPricingMethod, number | null]> = [
  ["内部配件", "IN-LIGHT-750", "感应灯组件", "750 mm", "套", "fixed", null],
  ["五金与支撑", "HW-ANCHOR-HD", "重型墙锚", "加强型", "套", "fixed", null]
];

function createDemoItems(priceListId: string, catalog = demoCatalog): PriceListItem[] {
  return catalog.map(([category, materialCode, name, specification, unit, pricingMethod, price], index) => ({
    id: `demo-${materialCode}`,
    priceListId,
    materialKey: materialCode.toLocaleLowerCase(),
    specKey: specification.toLocaleLowerCase().replaceAll(" ", "-"),
    category,
    materialCode,
    name,
    specification,
    unit,
    pricingMethod,
    retailPriceMinor: price,
    previousRetailPriceMinor: price === null ? null : index % 7 === 0 ? Math.round(price * 0.94) : price,
    rule: pricingMethod === "area" ? { formula: "area", minimumChargeMinor: price } : pricingMethod === "composite" ? { components: ["base", "hardware"] } : null,
    remark: pricingMethod === "included" ? "随基础柜体计价，不单独收费" : "",
    source: "bom",
    usesFallbackPrice: false,
    updatedAt: "2026-08-10 10:05"
  }));
}

function createDemoDetail(priceList: PriceList): PriceListDetail {
  const draftItems = createDemoItems(priceList.id).map((item, index) => priceList.status === "草稿" && index % 9 === 1 ? { ...item, retailPriceMinor: item.retailPriceMinor === null ? null : Math.round(item.retailPriceMinor * 1.03) } : item);
  return { ...priceList, itemCount: draftItems.length, effectiveTo: null, publishedBy: priceList.status === "生效中" ? "周航" : null, publishedAt: priceList.status === "生效中" ? "2026-07-28 14:30" : null, items: draftItems };
}

function formatMoney(minor: number | null, currency = "CNY") {
  if (minor === null) return "-";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, minimumFractionDigits: 2 }).format(minor / 100);
}

function isPriceItemComplete(item: PriceListItem) {
  if (item.usesFallbackPrice) return false;
  if (item.pricingMethod === "included") return true;
  if (["area", "length", "formula", "composite"].includes(item.pricingMethod)) return item.rule !== null;
  return item.retailPriceMinor !== null;
}

function preserveComparisonPrices(nextItems: PriceListItem[], currentItems: PriceListItem[]) {
  const currentByKey = new Map(currentItems.map((item) => [`${item.materialKey}\u0000${item.specKey}`, item]));
  return nextItems.map((item) => ({
    ...item,
    previousRetailPriceMinor: currentByKey.get(`${item.materialKey}\u0000${item.specKey}`)?.previousRetailPriceMinor ?? null
  }));
}

function parseDelimitedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === "," || char === "\t")) { row.push(cell.trim()); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function validateItems(items: PriceListItem[]): PriceListValidationResult {
  const issues: PriceListValidationIssue[] = [];
  const keys = new Map<string, PriceListItem>();
  for (const item of items) {
    const compositeKey = `${item.materialKey}::${item.specKey}`;
    if (keys.has(compositeKey)) issues.push({ code: "DUPLICATE_MATERIAL_SPEC", message: `物料与规格键重复：${item.materialCode} / ${item.specification}`, itemId: item.id, materialKey: item.materialKey, severity: "error" });
    else keys.set(compositeKey, item);
    const requiresDirectPrice = !["included", "composite"].includes(item.pricingMethod);
    if (requiresDirectPrice && item.retailPriceMinor === null) issues.push({ code: "MISSING_PRICE", message: `${item.materialCode} 尚未填写 1.0 基准单价`, itemId: item.id, materialKey: item.materialKey, severity: "error" });
    if (item.retailPriceMinor !== null && (!Number.isFinite(item.retailPriceMinor) || item.retailPriceMinor < 0)) issues.push({ code: "INVALID_PRICE", message: `${item.materialCode} 的单价必须大于或等于 0`, itemId: item.id, materialKey: item.materialKey, severity: "error" });
    if (["area", "length", "formula"].includes(item.pricingMethod) && !item.rule) issues.push({ code: "MISSING_FORMULA_RULE", message: `${item.materialCode} 缺少预设计价参数`, itemId: item.id, materialKey: item.materialKey, severity: "error" });
    if (item.usesFallbackPrice) issues.push({ code: "FALLBACK_PRICE", message: `${item.materialCode} 仍在使用 BOM 回退价`, itemId: item.id, materialKey: item.materialKey, severity: "error" });
  }
  return { valid: issues.every((issue) => issue.severity !== "error"), issues, checkedAt: new Date().toISOString() };
}

export function PriceListDetailPage() {
  const { priceListId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { priceLists, dealers, addPriceList, refresh } = useWorkspace();
  const [detail, setDetail] = useState<PriceListDetail | null>(null);
  const [savedItems, setSavedItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PriceItemCategory | "all">("all");
  const [dealerId, setDealerId] = useState<string>();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [validation, setValidation] = useState<PriceListValidationResult | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [publishDate, setPublishDate] = useState<string>("");
  const [messageApi, contextHolder] = message.useMessage();
  const tableRef = useRef<HTMLDivElement>(null);

  const sourcePriceList = priceLists.find((item) => item.id === priceListId);
  const editable = detail?.status === "草稿";
  const dirty = useMemo(() => JSON.stringify(detail?.items ?? []) !== JSON.stringify(savedItems), [detail?.items, savedItems]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (!session || !sourcePriceList) throw new ApiError("未找到价格表。", 404, "NOT_FOUND");
        const next = session.mode === "demo" ? createDemoDetail(sourcePriceList) : await api.getPriceList(priceListId, session.activeTenantId);
        if (!cancelled) { setDetail(next); setSavedItems(structuredClone(next.items)); }
      } catch (reason) {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "价格表加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [priceListId, session, sourcePriceList]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (detail?.items ?? []).filter((item) => {
      const matchesQuery = !normalized || `${item.materialCode}${item.name}${item.specification}${item.materialKey}`.toLocaleLowerCase().includes(normalized);
      const matchesCategory = category === "all" || item.category === category;
      const missing = !isPriceItemComplete(item);
      const changed = item.retailPriceMinor !== item.previousRetailPriceMinor;
      return matchesQuery && matchesCategory && (!onlyMissing || missing) && (!onlyChanged || changed);
    });
  }, [category, detail?.items, onlyChanged, onlyMissing, query]);

  const stats = useMemo(() => {
    const items = detail?.items ?? [];
    const priced = items.filter(isPriceItemComplete).length;
    const formula = items.filter((item) => ["area", "length", "formula", "composite"].includes(item.pricingMethod)).length;
    return { total: items.length, priced, missing: items.length - priced, formula, coverage: items.length ? Math.round(priced / items.length * 100) : 100 };
  }, [detail?.items]);

  const activeDealer = useMemo(() => dealers.find((dealer) => dealer.id === dealerId) ?? dealers.find((dealer) => dealer.status === "启用"), [dealerId, dealers]);
  const dealerRate = activeDealer?.discountRate ?? 90;
  const dealerPriceLabel = activeDealer ? `${activeDealer.name} ${dealerRate}%` : `Dealer ${dealerRate}%`;

  const changedItems = useMemo(() => (detail?.items ?? []).filter((item) => item.retailPriceMinor !== item.previousRetailPriceMinor), [detail?.items]);

  function updateItem(itemId: string, patch: Partial<PriceListItem>) {
    if (!editable) return;
    setDetail((current) => current ? { ...current, items: current.items.map((item) => item.id === itemId ? { ...item, ...patch, updatedAt: "刚刚" } : item) } : current);
    setValidation(null);
  }

  async function saveDraft(silent = false) {
    if (!detail || !session || !editable) return detail;
    setWorking("save");
    try {
      const response = session.mode === "demo" ? { ...detail, itemCount: detail.items.length, updatedAt: "刚刚" } : await api.savePriceListItems(detail.id, detail.items, session.activeTenantId);
      const responseItems = response.items.length ? preserveComparisonPrices(response.items, detail.items) : detail.items;
      const next = { ...detail, ...response, items: responseItems, itemCount: responseItems.length };
      setDetail(next);
      setSavedItems(structuredClone(next.items));
      if (!silent) messageApi.success("价格草稿已保存，消费者端价格未受影响");
      return next;
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "草稿保存失败");
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function syncBomCatalog() {
    if (!detail || !session || !editable) return;
    setWorking("sync");
    try {
      let next: PriceListDetail;
      if (session.mode === "demo") {
        const additions = createDemoItems(detail.id, demoSyncItems).filter((candidate) => !detail.items.some((item) => item.materialKey === candidate.materialKey && item.specKey === candidate.specKey));
        next = { ...detail, items: [...detail.items, ...additions], itemCount: detail.items.length + additions.length };
        messageApi.success(additions.length ? `已从 BOM 目录补充 ${additions.length} 个新零件` : "已是最新 BOM 目录，没有新增零件");
      } else {
        const response = await api.syncPriceListBom(detail.id, session.activeTenantId);
        const responseItems = response.items.length ? preserveComparisonPrices(response.items, detail.items) : detail.items;
        next = { ...detail, ...response, items: responseItems, itemCount: responseItems.length };
        messageApi.success("BOM 目录同步完成，已保留现有价格");
      }
      setDetail(next);
      setValidation(null);
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "BOM 目录同步失败");
    } finally {
      setWorking(null);
    }
  }

  function applyImportedRows(rows: string[][], sourceLabel: string) {
    if (!detail || !editable || !rows.length) return;
    const first = rows[0].map((cell) => cell.toLocaleLowerCase());
    const hasHeader = first.some((cell) => ["物料编码", "materialcode", "material_code", "sku"].includes(cell));
    const codeIndex = hasHeader ? Math.max(first.findIndex((cell) => ["物料编码", "materialcode", "material_code", "sku"].includes(cell)), 0) : 0;
    const priceIndex = hasHeader ? Math.max(first.findIndex((cell) => ["零售单价", "1.0基准单价", "1.0 基准单价", "retailprice", "retailunitprice", "retail_unit_price", "price", "价格"].includes(cell)), 1) : 1;
    const remarkIndex = hasHeader ? first.findIndex((cell) => ["备注", "remark", "note"].includes(cell)) : 2;
    const values = hasHeader ? rows.slice(1) : rows;
    const updates = new Map<string, { priceMinor: number; remark?: string }>();
    let invalid = 0;
    values.forEach((row) => {
      const code = row[codeIndex]?.trim();
      const rawPrice = row[priceIndex]?.replace(/[¥￥,\s]/g, "");
      const price = Number(rawPrice);
      if (!code || rawPrice === "" || !Number.isFinite(price) || price < 0) { invalid += 1; return; }
      updates.set(code.toLocaleLowerCase(), { priceMinor: Math.round(price * 100), remark: remarkIndex >= 0 ? row[remarkIndex]?.trim() : undefined });
    });
    let matched = 0;
    const nextItems = detail.items.map((item) => {
      const update = updates.get(item.materialCode.toLocaleLowerCase()) ?? updates.get(item.materialKey.toLocaleLowerCase());
      if (!update || ["included", "composite"].includes(item.pricingMethod)) return item;
      matched += 1;
      return { ...item, retailPriceMinor: update.priceMinor, remark: update.remark || item.remark, updatedAt: "刚刚" };
    });
    setDetail({ ...detail, items: nextItems });
    setValidation(null);
    setPasteOpen(false);
    setPasteValue("");
    if (!matched) messageApi.warning(`${sourceLabel}中没有匹配到现有物料编码`);
    else messageApi.success(`已匹配并更新 ${matched} 条价格${invalid ? `，忽略 ${invalid} 条无效数据` : ""}`);
  }

  const uploadProps: UploadProps = {
    accept: ".csv,text/csv",
    showUploadList: false,
    beforeUpload: async (file) => {
      try { applyImportedRows(parseDelimitedRows(await file.text()), "CSV 文件"); }
      catch { messageApi.error("CSV 文件读取失败"); }
      return Upload.LIST_IGNORE;
    }
  };

  async function runValidation(showSuccess = true) {
    if (!detail || !session) return null;
    if (dirty) {
      const saved = await saveDraft(true);
      if (!saved) return null;
    }
    setWorking("validate");
    try {
      const result = session.mode === "demo" ? validateItems(detail.items) : await api.validatePriceList(detail.id, session.activeTenantId);
      setValidation(result);
      if (!result.valid) setValidationOpen(true);
      else if (showSuccess) messageApi.success("完整性校验通过，可以进入发布流程");
      return result;
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "价格表校验失败");
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function previewPublish() {
    const result = await runValidation(false);
    if (result?.valid) setDiffOpen(true);
  }

  function locateIssue(issue: PriceListValidationIssue) {
    setValidationOpen(false);
    setOnlyMissing(issue.code === "MISSING_PRICE");
    setOnlyChanged(false);
    setCategory("all");
    setQuery(issue.materialKey ?? "");
    window.setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function publish() {
    if (!detail || !session || !validation?.valid) return;
    const effectiveFrom = publishMode === "now" ? new Date().toLocaleDateString("en-CA") : publishDate;
    if (!effectiveFrom) { messageApi.warning("请选择生效日期"); return; }
    setWorking("publish");
    try {
      const response = session.mode === "demo"
        ? { ...detail, status: "生效中" as const, effectiveFrom, publishedBy: session.user.name, publishedAt: new Date().toLocaleString("zh-CN") }
        : await api.publishPriceList(detail.id, effectiveFrom, session.activeTenantId);
      const next = session.mode === "demo"
        ? { ...detail, ...response }
        : await api.getPriceList(detail.id, session.activeTenantId);
      setDetail(next);
      setSavedItems(structuredClone(next.items));
      setPublishOpen(false);
      setDiffOpen(false);
      await refresh();
      messageApi.success(`价格表已发布，将于 ${effectiveFrom} 生效`);
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "价格表发布失败");
    } finally {
      setWorking(null);
    }
  }

  async function cloneVersion() {
    if (!detail || !session) return;
    setWorking("clone");
    try {
      if (session.mode === "demo") {
        const cloned: PriceList = { ...detail, id: createClientId(), version: `${detail.version}-copy`, status: "草稿", effectiveFrom: "待定", updatedAt: "刚刚" };
        await addPriceList(cloned);
        messageApi.success("已复制为新草稿版本");
        navigate(`/pricing/${cloned.id}`);
      } else {
        const cloned = await api.clonePriceList(detail.id, session.activeTenantId);
        await refresh();
        navigate(`/pricing/${cloned.id}`);
      }
    } catch (reason) {
      messageApi.error(reason instanceof Error ? reason.message : "复制版本失败");
    } finally {
      setWorking(null);
    }
  }

  async function exportCsv() {
    if (!detail) return;
    if (session?.mode === "live" && !dirty) {
      try {
        const csv = await api.exportPriceList(detail.id, session.activeTenantId);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${detail.code}-${detail.version}.csv`;
        anchor.click();
        // iOS Safari 的下载是异步开始的，同步 revoke 会中断下载
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      } catch (reason) {
        messageApi.error(reason instanceof Error ? reason.message : "Price list export failed");
      }
    }
    const quote = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["分类", "物料编码", "零件名称", "规格", "单位", "计价方式", "1.0基准单价", "备注"],
      ...detail.items.map((item) => [item.category, item.materialCode, item.name, item.specification, item.unit, methodLabels[item.pricingMethod], item.retailPriceMinor === null ? "" : (item.retailPriceMinor / 100).toFixed(2), item.remark])
    ];
    const blob = new Blob(["\ufeff", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${detail.code}-${detail.version}.csv`;
    anchor.click();
    // iOS Safari 的下载是异步开始的，同步 revoke 会中断下载
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const columns: TableProps<PriceListItem>["columns"] = [
    { title: "分类", dataIndex: "category", width: 116, fixed: "left", render: (value: PriceItemCategory) => <Tag>{value}</Tag> },
    { title: "物料编码", dataIndex: "materialCode", width: 145, render: (value: string, item) => <div className="erp-primary-cell"><strong>{value}</strong><span>{item.materialKey}</span></div> },
    { title: "零件名称", dataIndex: "name", width: 150 },
    { title: "规格", dataIndex: "specification", width: 150, render: (value: string, item) => <div className="erp-primary-cell"><strong>{value}</strong><span>{item.specKey}</span></div> },
    { title: "单位", dataIndex: "unit", width: 70, align: "center" },
    { title: "计价方式", dataIndex: "pricingMethod", width: 110, render: (value: PriceItemPricingMethod) => <Tag color={["area", "length", "formula"].includes(value) ? "blue" : value === "composite" ? "purple" : undefined}>{methodLabels[value]}</Tag> },
    {
      title: "1.0 基准单价（不含运费、包装）",
      dataIndex: "retailPriceMinor",
      width: 160,
      align: "right",
      render: (value: number | null, item) => ["included", "composite"].includes(item.pricingMethod)
        ? <Tooltip title={item.pricingMethod === "composite" ? "由基础零件自动汇总" : "已包含在基础柜体价格中"}><Tag>{methodLabels[item.pricingMethod]}</Tag></Tooltip>
        : editable
          ? <InputNumber className="price-input" min={0} precision={2} prefix="¥" value={value === null ? null : value / 100} placeholder="未定价" onChange={(next) => updateItem(item.id, { retailPriceMinor: next === null ? null : Math.round(Number(next) * 100) })} />
          : <strong>{formatMoney(value, detail?.currency)}</strong>
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 210,
      render: (value: string, item) => editable ? <Input value={value} placeholder="可选" onChange={(event) => updateItem(item.id, { remark: event.target.value })} /> : value || "-"
    },
    {
      title: "定价状态",
      key: "status",
      width: 110,
      fixed: "right",
      render: (_, item) => {
        if (item.usesFallbackPrice) return <Tag color="error">回退价</Tag>;
        if (["included", "composite", "area", "length", "formula"].includes(item.pricingMethod)) return isPriceItemComplete(item) ? <Tag color="processing">自动计算</Tag> : <Tag color="warning">参数缺失</Tag>;
        if (!isPriceItemComplete(item)) return <Tag color="warning">未定价</Tag>;
        if (item.retailPriceMinor !== item.previousRetailPriceMinor) return <Tag color="gold">已变更</Tag>;
        return <Tag color="success">已定价</Tag>;
      }
    }
  ];

  columns.splice(7, 0, {
    title: dealerPriceLabel,
    key: "dealerPrice",
    width: 150,
    align: "right",
    render: (_, item) => item.retailPriceMinor === null || ["included", "composite"].includes(item.pricingMethod)
      ? <span className="erp-muted">-</span>
      : <div className="erp-primary-cell erp-price-cell"><strong>{formatMoney(Math.round(item.retailPriceMinor * dealerRate / 100), detail?.currency)}</strong><span>{dealerRate}%</span></div>
  });

  if (loading) return <div className="page"><Card loading /></div>;
  if (loadError || !detail) return <div className="page"><PageHeader title="价格表详情" breadcrumbs={["价格表"]} /><Alert type="error" showIcon message={loadError || "价格表不存在"} action={<Button onClick={() => navigate("/pricing")}>返回列表</Button>} /></div>;

  return (
    <div className="page price-workbench">
      {contextHolder}
      <PageHeader
        breadcrumbs={["价格表", detail.code]}
        title={detail.name}
        description={`${detail.market} · ${detail.currency} · 版本 ${detail.version}`}
        actions={<Space wrap>
          <Button icon={<ArrowLeft size={15} />} onClick={() => navigate("/pricing")}>返回</Button>
          <Button icon={<CloudDownload size={15} />} onClick={() => void exportCsv()}>导出</Button>
          {editable ? <>
            <Button icon={<RefreshCw size={15} />} loading={working === "sync"} onClick={() => void syncBomCatalog()}>同步 BOM 目录</Button>
            <Button icon={<Save size={15} />} loading={working === "save"} disabled={!dirty} onClick={() => void saveDraft()}>保存草稿</Button>
            <Button type="primary" icon={<Send size={15} />} loading={working === "validate"} onClick={() => void previewPublish()}>校验并发布</Button>
          </> : <Button type="primary" icon={<Copy size={15} />} loading={working === "clone"} onClick={() => void cloneVersion()}>复制为新版本</Button>}
        </Space>}
      />

      {dirty && <Alert type="warning" showIcon message="当前有未保存修改" description="未保存内容不会进入发布校验，也不会影响消费者端价格。" />}
      {!editable && <Alert type="info" showIcon message="当前为生效版本，只读展示" description="生效价格表不可直接修改。如需调价，请复制为新草稿版本。" />}

      <section className="price-summary-strip">
        <div><span>零件总数</span><strong>{stats.total}</strong></div>
        <div><span>已定价</span><strong>{stats.priced}</strong></div>
        <div className={stats.missing ? "warning" : ""}><span>未定价</span><strong>{stats.missing}</strong></div>
        <div><span>公式 / 自动价</span><strong>{stats.formula}</strong></div>
        <div className="coverage-cell"><span>价格覆盖率</span><strong>{stats.coverage}%</strong><Progress percent={stats.coverage} showInfo={false} strokeColor={stats.coverage === 100 ? "#27714f" : "#d6a332"} /></div>
      </section>

      <Card size="small" className="price-meta-card">
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} items={[
          { key: "status", label: "状态", children: <StatusBadge value={detail.status} /> },
          { key: "effective", label: "计划 / 生效日期", children: detail.effectiveFrom },
          { key: "publishedBy", label: "发布人", children: detail.publishedBy || "尚未发布" },
          { key: "updated", label: "最近更新", children: detail.updatedAt }
        ]} />
      </Card>

      <section className="erp-table-card" ref={tableRef}>
        <div className="price-workbench-toolbar">
          <Input allowClear prefix={<Search size={15} />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物料编码、名称、规格或物料键" />
          <Select value={category} onChange={setCategory} options={[{ value: "all", label: "全部分类" }, ...categoryOptions]} />
          {dealers.length > 0 && <Select value={activeDealer?.id} onChange={setDealerId} options={dealers.filter((dealer) => dealer.status === "启用").map((dealer) => ({ value: dealer.id, label: `${dealer.name} · ${dealer.discountRate}%` }))} placeholder="经销商折扣" />}
          <Checkbox checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)}>仅看未定价</Checkbox>
          <Checkbox checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)}>仅看本版变更</Checkbox>
          {editable && <Space wrap className="price-import-actions">
            <Button icon={<ClipboardPaste size={15} />} onClick={() => setPasteOpen(true)}>批量粘贴</Button>
            <Upload {...uploadProps}><Button icon={<FileUp size={15} />}>导入 CSV</Button></Upload>
          </Space>}
        </div>
        <Table<PriceListItem>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filteredItems}
          scroll={{ x: 1510 }}
          pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: "没有符合当前筛选条件的价格条目" }}
          rowClassName={(item) => !isPriceItemComplete(item) ? "price-row-missing" : ""}
        />
      </section>

      <Modal open={pasteOpen} title="批量粘贴价格" okText="匹配并更新" cancelText="取消" width={720} onCancel={() => setPasteOpen(false)} onOk={() => applyImportedRows(parseDelimitedRows(pasteValue), "粘贴内容")}>
        <Alert type="info" showIcon message="按物料编码匹配现有 BOM 条目" description="支持从 Excel 直接粘贴三列：物料编码、1.0基准单价、备注。单价单位为元，不含运费和包装；不会新增未知物料。" />
        <Input.TextArea className="price-paste-area" rows={12} value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder={"物料编码\t1.0基准单价\t备注\nFR-TUBE-350\t45.00\t2026 年采购价\nPN-350-350\t142.00"} />
      </Modal>

      <Modal open={validationOpen} title="完整性校验" footer={<Button onClick={() => setValidationOpen(false)}>关闭</Button>} width={760} onCancel={() => setValidationOpen(false)}>
        {validation?.valid ? <Alert type="success" showIcon message="校验通过" /> : <Alert type="error" showIcon message={`发现 ${validation?.issues.filter((issue) => issue.severity === "error").length ?? 0} 个阻断问题`} description="处理全部阻断问题并重新保存后，才能发布使用。" />}
        <div className="validation-issue-list">
          {validation?.issues.map((issue, index) => <button key={`${issue.code}-${issue.itemId}-${index}`} type="button" onClick={() => locateIssue(issue)}>
            <span className={issue.severity}><TriangleAlert size={16} /></span>
            <span><strong>{issue.message}</strong><small>{issue.code}</small></span>
            {issue.itemId && <span>定位条目</span>}
          </button>)}
        </div>
      </Modal>

      <Modal open={diffOpen} title="价格变更预览" okText="确认发布设置" cancelText="返回修改" width={900} onCancel={() => setDiffOpen(false)} onOk={() => { setDiffOpen(false); setPublishOpen(true); }}>
        <Alert type="success" showIcon message="完整性校验已通过" description={`本版本有 ${changedItems.length} 个价格条目发生变化。发布后，新配置将使用新价格，历史报价不受影响。`} />
        <Table<PriceListItem> rowKey="id" size="small" className="price-diff-table" dataSource={changedItems} pagination={{ pageSize: 6, showSizeChanger: false }} columns={[
          { title: "物料", dataIndex: "materialCode", width: 150 },
          { title: "零件名称", dataIndex: "name" },
          { title: "原价", dataIndex: "previousRetailPriceMinor", width: 130, align: "right", render: (value: number | null) => formatMoney(value, detail.currency) },
          { title: "新价", dataIndex: "retailPriceMinor", width: 130, align: "right", render: (value: number | null) => formatMoney(value, detail.currency) },
          { title: "变动", key: "change", width: 110, align: "right", render: (_, item) => {
            if (item.retailPriceMinor === null || item.previousRetailPriceMinor === null || item.previousRetailPriceMinor === 0) return <Tag color="blue">新增</Tag>;
            const rate = (item.retailPriceMinor - item.previousRetailPriceMinor) / item.previousRetailPriceMinor * 100;
            return <Tag color={rate > 0 ? "error" : rate < 0 ? "success" : undefined}>{rate > 0 ? "+" : ""}{rate.toFixed(1)}%</Tag>;
          } }
        ]} />
      </Modal>

      <Modal open={publishOpen} title="发布价格表" okText="确认发布使用" cancelText="取消" confirmLoading={working === "publish"} onCancel={() => setPublishOpen(false)} onOk={() => void publish()}>
        <div className="publish-settings">
          <Alert type="warning" showIcon message="发布后当前版本不可直接修改" description="系统会自动归档原生效版本；历史报价继续保留其价格快照。" />
          <Divider />
          <Radio.Group value={publishMode} onChange={(event) => setPublishMode(event.target.value)}>
            <Space direction="vertical">
              <Radio value="now"><strong>立即生效</strong><span>发布成功后，新配置立即使用此版本</span></Radio>
              <Radio value="scheduled"><strong>指定日期生效</strong><span>在指定日期 00:00 自动切换价格版本</span></Radio>
            </Space>
          </Radio.Group>
          {publishMode === "scheduled" && <DatePicker className="publish-date-picker" onChange={(_, value) => setPublishDate(String(value))} placeholder="选择生效日期" />}
          <div className="publish-confirmation"><FileCheck2 size={18} /><span><strong>{detail.name} · {detail.version}</strong><small>{stats.priced} 个直接定价条目，{stats.formula} 个公式或自动计算条目</small></span></div>
        </div>
      </Modal>
    </div>
  );
}
