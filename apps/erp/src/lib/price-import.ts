import { unzipSync, zipSync } from "fflate";
import type { PriceListItem } from "../types";

/**
 * A normalized row accepted by both the legacy price-list template and the
 * dealer quote-source format (`canonicalName`, `spec`, `unitPrice`, ...).
 */
export interface PriceImportRow {
  materialKey: string;
  specKey: string;
  canonicalName?: string;
  spec?: string;
  sourceRow?: number;
  page?: number;
  materialCode?: string;
  name?: string;
  specification?: string;
  color?: string;
  unit?: string;
  pricingMethod?: PriceListItem["pricingMethod"];
  /** Final price from the workbook. No file-name/dealer multiplier is applied. */
  unitPrice?: number;
  /** Legacy alias retained for callers that already use this field. */
  retailUnitPrice?: number;
  pricingRule?: PriceListItem["rule"] | string;
  raw?: Record<string, string>;
  note?: string;
}

export interface PriceImportMetadata {
  key: string;
  value: string;
}

export interface PriceImportWorkbook {
  rows: PriceImportRow[];
  metadata: PriceImportMetadata[];
  warnings: string[];
}

export type PriceImportOutcome = "new" | "updated" | "skipped" | "conflict" | "error";

export interface PriceImportPreviewRow {
  rowNumber: number;
  identity: string;
  outcome: PriceImportOutcome;
  message: string;
  input?: PriceImportRow;
  existing?: PriceListItem;
}

export interface PriceImportPreview {
  previewToken?: string;
  rows: PriceImportPreviewRow[];
  counts: Record<PriceImportOutcome, number>;
  errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  materialKey: ["materialkey", "material_key", "材料键", "物料键", "系统物料"],
  specKey: ["speckey", "spec_key", "规格键", "系统规格"],
  canonicalName: ["canonicalname", "canonical_name", "canonical", "报价对象", "计费对象", "报价名称", "报价项目", "项目"],
  spec: ["spec", "specification", "规格", "尺寸", "报价规格", "规格型号"],
  sourceRow: ["sourcerow", "source_row", "来源行"],
  page: ["page", "页码"],
  materialCode: ["materialcode", "material_code", "sku", "物料编码", "材料编码"],
  name: ["name", "materialname", "名称", "物料名称"],
  color: ["color", "颜色"],
  unit: ["unit", "单位"],
  pricingMethod: ["pricingmethod", "pricing_method", "计价方式", "价格类型"],
  unitPrice: ["unitprice", "unit_price", "retailunitprice", "retail_unit_price", "price", "retailprice", "retail_price", "单价", "报价单价", "价格", "单价（管理员修改）", "单价(管理员修改)"],
  pricingRule: ["pricingrule", "pricing_rule", "rule", "计价规则", "计价说明"],
  note: ["note", "remark", "备注", "说明"]
};

const FRIENDLY_MATERIAL_KEYS: Record<string, string> = {
  "球节点": "brassBall",
  "黄铜球": "brassBall",
  "膨胀螺丝": "expansionSet",
  "膨胀套件": "expansionSet",
  "层板": "shelfPanel",
  "固定托盘": "shelfPanel",
  "固定搁板": "shelfPanel",
  "固定层板": "shelfPanel",
  "托盘": "tray",
  "移动托盘": "tray",
  "展示托盘": "tray",
  "扣板": "panel",
  "外板": "panel",
  "金属扣板": "panel",
  "金属背板": "panel",
  "顶板": "panel",
  "底板": "panel",
  "内板": "panel",
  "扣板(四排孔)": "panel.fourRowHole",
  "扣板四排孔": "panel.fourRowHole",
  "四排孔扣板": "panel.fourRowHole",
  "扣板(四边孔)": "panel.fourRowHole",
  "扣板四边孔": "panel.fourRowHole",
  "四边孔": "panel.fourRowHole",
  "扣板(洞洞板)": "panel.perforated",
  "扣板洞洞板": "panel.perforated",
  "洞洞板": "panel.perforated",
  "玻璃": "glass",
  "玻璃板": "glass",
  "玻璃搁板": "glass",
  "门板": "doorPanel",
  "钢管(304)": "tube304",
  "钢管（304）": "tube304",
  "钢管(201)": "tube201",
  "钢管（201）": "tube201",
  "拼接椭圆管": "spliceOvalTube",
  "抽屉": "drawer",
  "玻璃夹": "glassClip",
  "玻璃拉手": "glassHandle",
  "玻璃门转": "glassDoorPivotSet",
  "不锈钢拉手": "stainlessHandle",
  "国内标准木箱": "domesticWoodCrate",
  "海外标准木箱": "exportWoodCrate",
  "脚垫": "glide",
  "脚轮": "caster",
  "扣板门转": "panelDoorPivotSet",
  "下翻门铰链": "dropDoorHinge",
  "钥匙锁+锁盒": "keyLockBox",
  "一元锁+锁盒": "coinLockBox",
  "阻尼器": "damper",
  "T型件": "tFitting",
  "t型件": "tFitting"
};

export async function parsePriceImportWorkbook(file: File): Promise<PriceImportWorkbook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(bytes);
  return parseDelimited(await file.text());
}

/**
 * Preview is intentionally strict: an import may update existing price-list
 * rows, but it never creates an unknown material/spec identity.
 */
export function buildPriceImportPreview(rows: PriceImportRow[], existing: PriceListItem[]): PriceImportPreview {
  const counts: Record<PriceImportOutcome, number> = { new: 0, updated: 0, skipped: 0, conflict: 0, error: 0 };
  const seen = new Set<string>();
  const existingByIdentity = new Map(existing.map((item) => [identity(item.materialKey, item.specKey), item]));
  const previewRows = rows.map((row, index) => {
    const rowNumber = Number.isFinite(row.sourceRow) && (row.sourceRow ?? 0) > 0 ? Number(row.sourceRow) : index + 2;
    const key = identity(row.materialKey, row.specKey);
    const existingItem = existingByIdentity.get(key);
    let outcome: PriceImportOutcome;
    let message: string;
    if (!row.materialKey || !row.specKey) {
      outcome = "error";
      message = "materialKey/canonicalName and specKey/spec are required";
    } else if (rowPrice(row) === undefined && !row.pricingRule) {
      outcome = "error";
      message = "unitPrice must be a non-negative number, or pricingRule must be provided";
    } else if (rowPrice(row) !== undefined && (!Number.isFinite(rowPrice(row)) || (rowPrice(row) as number) < 0)) {
      outcome = "error";
      message = "unitPrice must be a non-negative number";
    } else if (seen.has(key)) {
      outcome = "conflict";
      message = "Duplicate materialKey/specKey in import; color is not part of the price key";
    } else if (!existingItem) {
      outcome = "error";
      message = "Unknown material/spec key; import will not create a new material";
    } else if (["included", "composite"].includes(existingItem.pricingMethod)) {
      outcome = "skipped";
      message = "Included/composite items are not directly priced";
    } else if (samePrice(existingItem, row) && sameRule(existingItem, row)) {
      outcome = "skipped";
      message = "No effective change";
    } else {
      outcome = "updated";
      message = "Existing item will be updated";
    }
    seen.add(key);
    counts[outcome] += 1;
    return { rowNumber, identity: key, outcome, message, input: row, existing: existingItem };
  });
  return {
    rows: previewRows,
    counts,
    errors: previewRows.filter((row) => row.outcome === "error").map((row) => `Row ${row.rowNumber}: ${row.message}`)
  };
}

/** Download a price template with metadata, instructions and a reference tab. */
export function downloadPriceImportTemplate(items: PriceListItem[] = []) {
  const rows = buildPriceImportTemplateRows(items);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": textBytes(contentTypesXml()),
    "_rels/.rels": textBytes(rootRelsXml()),
    "xl/workbook.xml": textBytes(workbookXml()),
    "xl/_rels/workbook.xml.rels": textBytes(workbookRelsXml()),
    "xl/worksheets/sheet1.xml": textBytes(sheetXml(rows))
  };
  const blob = new Blob([zipSync(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "价格导入模板_管理员简版.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Build the customer-facing sheet. Technical identities stay in the reference sheet. */
export function buildPriceImportTemplateRows(items: PriceListItem[] = []): string[][] {
  const header = ["报价对象", "规格", "单位", "单价"];
  const source = items.length ? items : [{
    materialKey: "panel", specKey: "500x350", materialCode: "PANEL-500-350", name: "扣板", specification: "500 x 350 mm", color: "", unit: "块", pricingMethod: "fixed", retailPriceMinor: 58000, rule: null, remark: ""
  } as unknown as PriceListItem];
  const seen = new Set<string>();
  const hasDimensionGlass = source.some((item) => item.materialKey === "glass" && normalizeSpecKey(item.specKey) !== "standard");
  const data = source.flatMap((item) => {
    if (item.pricingMethod !== "fixed") return [];
    if (item.materialKey === "tube201") return [];
    if (hasDimensionGlass && item.materialKey === "glass" && normalizeSpecKey(item.specKey) === "standard") return [];
    const key = identity(item.materialKey, item.specKey);
    if (seen.has(key)) return [];
    seen.add(key);
    return [[
      friendlyMaterialName(item),
      friendlySpecification(item),
      item.unit,
      item.retailPriceMinor === null || item.retailPriceMinor === undefined ? "" : String(item.retailPriceMinor / 100)
    ]];
  });
  return [header, ...data];
}

/** A compact reference sheet for users who need the existing material identities. */
export function buildPriceImportReferenceRows(items: PriceListItem[] = []): string[][] {
  const seen = new Set<string>();
  return [
    ["materialKey", "specKey", "name", "specification", "unit", "pricingMethod", "unitPrice", "note"],
    ...items.flatMap((item) => {
      const key = identity(item.materialKey, item.specKey);
      if (seen.has(key)) return [];
      seen.add(key);
      return [[
        item.materialKey,
        item.specKey,
        item.name,
        item.specification,
        item.unit,
        item.pricingMethod,
        item.retailPriceMinor === null || item.retailPriceMinor === undefined ? "" : String(item.retailPriceMinor / 100),
        item.remark
      ]];
    })
  ];
}

/** Apply only rows that match an existing material/spec identity. */
export function toPriceListItems(rows: PriceImportRow[], existing: PriceListItem[], priceListId: string): PriceListItem[] {
  const updates = new Map<string, PriceImportRow>();
  rows.forEach((row) => {
    const key = identity(row.materialKey, row.specKey);
    if (!updates.has(key)) updates.set(key, row);
  });
  return existing.map((item) => {
    const row = updates.get(identity(item.materialKey, item.specKey));
    if (!row || ["included", "composite"].includes(item.pricingMethod)) return item;
    return {
      ...item,
      materialCode: row.materialCode || item.materialCode,
      name: row.name || item.name,
      specification: row.specification || row.spec || item.specification,
      unit: row.unit || item.unit,
      pricingMethod: row.pricingMethod || item.pricingMethod,
      retailPriceMinor: rowPrice(row) === undefined ? item.retailPriceMinor : Math.round((rowPrice(row) as number) * 100),
      rule: normalizePricingRule(row.pricingRule) ?? item.rule,
      remark: row.note ?? item.remark,
      priceListId
    };
  });
}

function parseXlsx(bytes: Uint8Array): PriceImportWorkbook {
  const files = unzipSync(bytes);
  const strings = files["xl/sharedStrings.xml"] ? parseSharedStrings(files["xl/sharedStrings.xml"]) : [];
  const firstSheet = parseSheet(files["xl/worksheets/sheet1.xml"], strings);
  const secondSheet = parseSheet(files["xl/worksheets/sheet2.xml"], strings);
  return { rows: rowsToPriceRows(firstSheet), metadata: rowsToMetadata(secondSheet), warnings: firstSheet.length ? [] : ["The workbook has no rows in sheet 1."] };
}

function parseDelimited(text: string): PriceImportWorkbook {
  const rows = parseDelimitedRows(text.replace(/^\ufeff/, ""));
  return { rows: rowsToPriceRows(rows), metadata: [], warnings: [] };
}

function rowsToPriceRows(rows: string[][]): PriceImportRow[] {
  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, header.findIndex((cell) => aliases.includes(cell))])) as Record<string, number>;
  const hasHeader = header.some((value) => Object.values(HEADER_ALIASES).some((aliases) => aliases.includes(value)) || value.startsWith("raw"));
  const source = hasHeader ? rows.slice(1) : rows;
  return source.filter((row) => row.some((value) => String(value ?? "").trim() !== "")).map((row, sourceIndex) => {
    const canonicalName = cell(row, indexes.canonicalName);
    const materialKey = normalizeMaterialKey(cell(row, indexes.materialKey) || canonicalName);
    const spec = cell(row, indexes.spec) || cell(row, indexes.specKey);
    const specKey = normalizeImportedSpecKey(materialKey, spec);
    const unitPrice = parseNumber(cell(row, indexes.unitPrice));
    const pricingRule = parsePricingRule(cell(row, indexes.pricingRule));
    const raw: Record<string, string> = {};
    header.forEach((name, index) => {
      if (name.startsWith("raw")) raw[name.slice(3).replace(/^\./, "") || `column${index + 1}`] = cell(row, index);
    });
    return {
      materialKey,
      specKey,
      canonicalName: canonicalName || undefined,
      spec: spec || undefined,
      sourceRow: parseInteger(cell(row, indexes.sourceRow)) ?? (hasHeader ? sourceIndex + 2 : sourceIndex + 1),
      page: parseInteger(cell(row, indexes.page)),
      materialCode: cell(row, indexes.materialCode) || undefined,
      name: cell(row, indexes.name) || undefined,
      specification: spec || undefined,
      color: cell(row, indexes.color) || undefined,
      unit: cell(row, indexes.unit) || undefined,
      pricingMethod: normalizePricingMethod(cell(row, indexes.pricingMethod)),
      unitPrice,
      retailUnitPrice: unitPrice,
      pricingRule,
      raw: Object.keys(raw).length ? raw : undefined,
      note: cell(row, indexes.note) || undefined
    };
  });
}

function rowsToMetadata(rows: string[][]): PriceImportMetadata[] {
  return rows.slice(1).filter((row) => row[0]).map((row) => ({ key: row[0], value: row[1] ?? "" }));
}

function parseSheet(bytes: Uint8Array | undefined, sharedStrings: string[]): string[][] {
  if (!bytes) return [];
  const xml = new TextDecoder().decode(bytes);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("row")).map((row) => {
    const cells: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cellNode) => {
      const ref = cellNode.getAttribute("r") ?? "A1";
      const index = columnIndex(ref.replace(/\d+$/, ""));
      const type = cellNode.getAttribute("t");
      const value = type === "inlineStr" ? cellNode.getElementsByTagName("t")[0]?.textContent ?? "" : cellNode.getElementsByTagName("v")[0]?.textContent ?? "";
      cells[index] = type === "s" ? sharedStrings[Number(value)] ?? "" : value;
    });
    return cells.map((value) => value ?? "");
  });
}

function parseSharedStrings(bytes: Uint8Array): string[] {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((item) => Array.from(item.getElementsByTagName("t")).map((text) => text.textContent ?? "").join(""));
}

function parseDelimitedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === "," || char === "\t")) { row.push(value.trim()); value = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function friendlyMaterialName(item: PriceListItem): string {
  const description = `${item.materialKey} ${item.name} ${item.specification} ${item.specKey}`;
  if (item.materialKey === "panel.fourRowHole" || (item.materialKey === "panel" && /四排孔|四边孔/.test(description))) return "扣板（四排孔）";
  if (item.materialKey === "panel.perforated" || (item.materialKey === "panel" && /洞洞板/.test(description))) return "扣板（洞洞板）";
  const labels: Record<string, string> = {
    brassBall: "球节点",
    expansionSet: "膨胀套件",
    shelfPanel: "固定托盘",
    tray: "移动托盘",
    panel: "扣板",
    glass: "玻璃板"
  };
  return labels[item.materialKey] ?? item.name ?? item.materialKey;
}

function friendlySpecification(item: PriceListItem): string {
  const raw = (item.specification || item.specKey || "").normalize("NFKC").trim();
  if (!raw || normalizeSpecKey(raw) === "standard") return "通用";
  const withoutVariant = item.materialKey === "panel.fourRowHole" || item.materialKey === "panel.perforated" || /四排孔|四边孔|洞洞板/.test(raw)
    ? raw.replace(/[（(]\s*(?:四排孔|四边孔|洞洞板)\s*[）)]/g, "").replace(/[-_]?\s*(?:四排孔|四边孔|洞洞板)\s*$/g, "").trim()
    : raw;
  const dimensions = withoutVariant.replace(/\s*(?:mm|毫米)\s*$/i, "").split(/\s*[x×✕＊*]\s*/).map((part) => part.trim());
  if (["tube201", "tube304"].includes(item.materialKey) && dimensions.length === 2 && dimensions[0] === "19" && /^\d+(?:\.\d+)?$/.test(dimensions[1])) {
    return `${dimensions[1]} mm`;
  }
  if (dimensions.length >= 2 && dimensions.every((part) => /^\d+(?:\.\d+)?$/.test(part))) return `${dimensions.join(" × ")} mm`;
  return withoutVariant;
}

function friendlyNote(item: PriceListItem): string {
  const guidance: Record<string, string> = {
    expansionSet: "1根钢管配2颗膨胀螺丝，按1套膨胀套件报价",
    shelfPanel: "固定托盘整套报价，随附五金不再单独计价",
    tray: "移动托盘整套报价，滑轨、边板和随附五金不再单独计价"
  };
  return [item.remark, guidance[item.materialKey]].filter((value, index, values) => value && values.indexOf(value) === index).join("；");
}

function normalizeMaterialKey(value: string): string {
  const raw = value.normalize("NFKC").trim();
  return FRIENDLY_MATERIAL_KEYS[raw.toLocaleLowerCase().replace(/\s+/g, "")] ?? raw;
}

function normalizeHeader(value: string) { return value.trim().toLocaleLowerCase().replace(/[\s_-]/g, ""); }
function normalizePricingMethod(value: string): PriceListItem["pricingMethod"] | undefined {
  const methods: PriceListItem["pricingMethod"][] = ["fixed", "area", "length", "formula", "included", "composite"];
  return methods.includes(value as PriceListItem["pricingMethod"]) ? value as PriceListItem["pricingMethod"] : undefined;
}
function cell(row: string[], index: number) { return index >= 0 ? String(row[index] ?? "").trim() : ""; }
function parseNumber(value: string) {
  if (value === "") return undefined;
  const normalized = value.replace(/[,，\s¥￥$元]/g, "");
  if (!/[\d]/.test(normalized) || /[A-Za-z]/.test(normalized)) return undefined;
  const number = Number(normalized.replace(/[^\d.+-eE]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}
function parseInteger(value: string) { if (value.trim() === "") return undefined; const number = Number(value); return Number.isInteger(number) ? number : undefined; }
function normalizeSpecKey(value: string) {
  const text = value.normalize("NFKC").trim().toLocaleLowerCase();
  if (!text || ["通用", "标准", "无规格", "standard"].includes(text)) return "standard";
  return text
    .replace(/[×✕＊*]/g, "x")
    .replace(/\s*x\s*/g, "x")
    .replace(/\s*(?:mm|毫米)(?=\s*(?:\(|$))/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeImportedSpecKey(materialKey: string, value: string) {
  const specKey = normalizeSpecKey(value);
  if (["tube201", "tube304"].includes(materialKey) && /^\d+(?:\.\d+)?$/.test(specKey)) return `19x${specKey}`;
  return specKey;
}
function identity(materialKey: string, specKey: string) { return `${materialKey.trim()}|${normalizeSpecKey(specKey)}`.toLocaleLowerCase(); }
function rowPrice(row: PriceImportRow): number | undefined { return row.retailUnitPrice ?? row.unitPrice; }
function samePrice(item: PriceListItem, row: PriceImportRow) { const price = rowPrice(row); return price === undefined ? item.retailPriceMinor === null : item.retailPriceMinor === Math.round(price * 100); }
function sameRule(item: PriceListItem, row: PriceImportRow) {
  if (row.pricingRule === undefined) return true;
  const next = normalizePricingRule(row.pricingRule);
  return JSON.stringify(item.rule ?? null) === JSON.stringify(next);
}
function parsePricingRule(value: string): PriceListItem["rule"] | string | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as PriceListItem["rule"] : value;
  } catch { return value; }
}
function normalizePricingRule(value: PriceImportRow["pricingRule"]): PriceListItem["rule"] | null {
  if (!value) return null;
  return typeof value === "string" ? { expression: value } : value;
}
function columnIndex(value: string) { return value.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1; }
function textBytes(value: string) { return new TextEncoder().encode(value); }
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sheetXml(rows: string[][]) { return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => `<c r="${columnName(ci)}${ri + 1}" t="inlineStr"><is><t>${xml(String(value ?? ""))}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`; }
function columnName(index: number) { let value = ""; let current = index + 1; while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); } return value; }
function contentTypesXml() { return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`; }
function rootRelsXml() { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`; }
function workbookXml() { return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="管理员填写" sheetId="1" r:id="rId1"/></sheets></workbook>`; }
function workbookRelsXml() { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`; }
