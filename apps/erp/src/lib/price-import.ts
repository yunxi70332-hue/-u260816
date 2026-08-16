import { unzipSync, zipSync } from "fflate";
import type { PriceListItem } from "../types";

export interface PriceImportRow {
  materialKey: string;
  specKey: string;
  materialCode?: string;
  name?: string;
  specification?: string;
  color?: string;
  unit?: string;
  pricingMethod?: PriceListItem["pricingMethod"];
  retailUnitPrice?: number;
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

const HEADER_ALIASES: Record<keyof PriceImportRow, string[]> = {
  materialKey: ["materialkey", "material_key", "物料key", "物料键"],
  specKey: ["speckey", "spec_key", "规格key", "规格键"],
  materialCode: ["materialcode", "material_code", "sku", "物料编码"],
  name: ["name", "materialname", "物料名称", "名称"],
  specification: ["specification", "spec", "规格", "规格描述"],
  color: ["color", "颜色", "颜色编码"],
  unit: ["unit", "单位"],
  pricingMethod: ["pricingmethod", "pricing_method", "定价方式"],
  retailUnitPrice: ["retailunitprice", "retail_unit_price", "price", "零售价", "零售单价", "1.0基准单价", "1.0 基准单价", "价格"],
  note: ["note", "remark", "备注"]
};

export async function parsePriceImportWorkbook(file: File): Promise<PriceImportWorkbook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(bytes);
  return parseDelimited(await file.text());
}

export function buildPriceImportPreview(rows: PriceImportRow[], existing: PriceListItem[]): PriceImportPreview {
  const counts: Record<PriceImportOutcome, number> = { new: 0, updated: 0, skipped: 0, conflict: 0, error: 0 };
  const seen = new Set<string>();
  const existingByIdentity = new Map(existing.map((item) => [identity(item.materialKey, item.specKey), item]));
  const previewRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const key = identity(row.materialKey, row.specKey);
    let outcome: PriceImportOutcome;
    let message: string;
    const existingItem = existingByIdentity.get(key);
    if (!row.materialKey || !row.specKey) {
      outcome = "error";
      message = "materialKey and specKey are required";
    } else if (!Number.isFinite(row.retailUnitPrice ?? NaN) || (row.retailUnitPrice ?? -1) < 0) {
      outcome = "error";
      message = "retailUnitPrice must be a non-negative number";
    } else if (seen.has(key)) {
      outcome = "conflict";
      message = "Duplicate materialKey/specKey in import";
    } else if (!existingItem) {
      outcome = "new";
      message = "New item";
    } else if (["included", "composite"].includes(existingItem.pricingMethod)) {
      outcome = "skipped";
      message = "Included/composite items are not directly priced";
    } else if (samePrice(existingItem, row)) {
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
  return { rows: previewRows, counts, errors: previewRows.filter((row) => row.outcome === "error").map((row) => `Row ${row.rowNumber}: ${row.message}`) };
}

export function downloadPriceImportTemplate() {
  const rows = [
    ["materialKey", "specKey", "materialCode", "name", "specification", "color", "unit", "pricingMethod", "retailUnitPrice", "note"],
    ["panel", "500x350", "PANEL-500-350", "Metal panel", "500 x 350 mm", "white", "piece", "fixed", "580", ""],
  ];
  const metadata = [["key", "value"], ["template", "usm-price-import-v1"], ["mode", "incremental"]];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": textBytes(contentTypesXml()),
    "_rels/.rels": textBytes(rootRelsXml()),
    "xl/workbook.xml": textBytes(workbookXml()),
    "xl/_rels/workbook.xml.rels": textBytes(workbookRelsXml()),
    "xl/worksheets/sheet1.xml": textBytes(sheetXml(rows)),
    "xl/worksheets/sheet2.xml": textBytes(sheetXml(metadata))
  };
  const blob = new Blob([zipSync(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "usm-price-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function toPriceListItems(rows: PriceImportRow[], existing: PriceListItem[], priceListId: string): PriceListItem[] {
  const updates = new Map(rows.map((row) => [identity(row.materialKey, row.specKey), row]));
  const merged = existing.map((item) => {
    const row = updates.get(identity(item.materialKey, item.specKey));
    if (!row || ["included", "composite"].includes(item.pricingMethod)) return item;
    return {
      ...item,
      materialCode: row.materialCode || item.materialCode,
      name: row.name || item.name,
      specification: row.specification || item.specification,
      unit: row.unit || item.unit,
      pricingMethod: row.pricingMethod || item.pricingMethod,
      retailPriceMinor: Math.round((row.retailUnitPrice ?? 0) * 100),
      remark: row.note ?? item.remark,
      priceListId
    };
  });
  const existingKeys = new Set(existing.map((item) => identity(item.materialKey, item.specKey)));
  rows.forEach((row, index) => {
    const key = identity(row.materialKey, row.specKey);
    if (existingKeys.has(key)) return;
    merged.push({
      id: `import-${Date.now().toString(36)}-${index}`,
      priceListId,
      materialKey: row.materialKey,
      specKey: row.specKey,
      category: "hardware" as unknown as PriceListItem["category"],
      materialCode: row.materialCode || row.materialKey,
      name: row.name || row.materialKey,
      specification: row.specification || row.specKey,
      unit: row.unit || "piece",
      pricingMethod: row.pricingMethod || "fixed",
      retailPriceMinor: Math.round((row.retailUnitPrice ?? 0) * 100),
      previousRetailPriceMinor: null,
      rule: null,
      remark: row.note || "",
      source: "manual",
      usesFallbackPrice: false,
      updatedAt: new Date().toISOString()
    });
  });
  return merged;
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
  const indexes = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, header.findIndex((cell) => aliases.includes(cell))])) as Record<keyof PriceImportRow, number>;
  const source = indexes.materialKey >= 0 || indexes.specKey >= 0 ? rows.slice(1) : rows;
  return source.map((row) => ({
    materialKey: cell(row, indexes.materialKey),
    specKey: cell(row, indexes.specKey),
    materialCode: cell(row, indexes.materialCode) || undefined,
    name: cell(row, indexes.name) || undefined,
    specification: cell(row, indexes.specification) || undefined,
    color: cell(row, indexes.color) || undefined,
    unit: cell(row, indexes.unit) || undefined,
    pricingMethod: normalizePricingMethod(cell(row, indexes.pricingMethod)),
    retailUnitPrice: parseNumber(cell(row, indexes.retailUnitPrice)),
    note: cell(row, indexes.note) || undefined
  }));
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
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "A1";
      const index = columnIndex(ref.replace(/\d+$/, ""));
      const type = cell.getAttribute("t");
      const value = type === "inlineStr" ? cell.getElementsByTagName("t")[0]?.textContent ?? "" : cell.getElementsByTagName("v")[0]?.textContent ?? "";
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

function normalizeHeader(value: string) { return value.trim().toLocaleLowerCase().replace(/[\s_-]/g, ""); }
function normalizePricingMethod(value: string): PriceListItem["pricingMethod"] | undefined {
  const methods: PriceListItem["pricingMethod"][] = ["fixed", "area", "length", "formula", "included", "composite"];
  return methods.includes(value as PriceListItem["pricingMethod"]) ? value as PriceListItem["pricingMethod"] : undefined;
}
function cell(row: string[], index: number) { return index >= 0 ? String(row[index] ?? "").trim() : ""; }
function parseNumber(value: string) { return value === "" ? undefined : Number(value.replace(/[,\s]/g, "")); }
function identity(materialKey: string, specKey: string) { return `${materialKey.trim()}|${specKey.trim()}`.toLocaleLowerCase(); }
function samePrice(item: PriceListItem, row: PriceImportRow) { return item.retailPriceMinor === Math.round((row.retailUnitPrice ?? 0) * 100); }
function columnIndex(value: string) { return value.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1; }
function textBytes(value: string) { return new TextEncoder().encode(value); }
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sheetXml(rows: string[][]) { return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => `<c r="${columnName(ci)}${ri + 1}" t="inlineStr"><is><t>${xml(String(value))}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`; }
function columnName(index: number) { let value = ""; let current = index + 1; while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); } return value; }
function contentTypesXml() { return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`; }
function rootRelsXml() { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`; }
function workbookXml() { return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PriceItems" sheetId="1" r:id="rId1"/><sheet name="Metadata" sheetId="2" r:id="rId2"/></sheets></workbook>`; }
function workbookRelsXml() { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`; }
