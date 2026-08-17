import { unzipSync, zipSync } from "fflate";
import type { InventoryMaterial, Warehouse } from "../types";

export interface InventoryMaterialImportRow {
  materialCode: string;
  materialKey: string;
  specKey: string;
  category?: string;
  name: string;
  specification?: string;
  color?: string;
  finish?: string;
  unit?: string;
  weightKg?: number;
  referenceCost?: number;
  active?: boolean;
  note?: string;
  source?: string;
}

export interface OpeningInventoryImportRow {
  warehouseCode: string;
  materialCode: string;
  materialKey?: string;
  specKey?: string;
  specification?: string;
  color?: string;
  finish?: string;
  openingQty: number;
  location?: string;
  batchNo?: string;
  note?: string;
}

export interface InventoryImportWorkbook {
  materialRows: InventoryMaterialImportRow[];
  openingRows: OpeningInventoryImportRow[];
  warnings: string[];
}

const MATERIAL_SHEET_NAME = "物料主数据";
const OPENING_SHEET_NAME = "期初库存";

const MATERIAL_HEADERS = [
  "物料编码",
  "materialKey",
  "specKey",
  "分类",
  "名称",
  "规格",
  "颜色/表面处理",
  "单位",
  "单重kg",
  "参考采购成本",
  "启用状态",
  "备注",
  "来源"
] as const;

const OPENING_HEADERS = ["仓库编码", "物料编码", "期初数量", "库位", "批次号", "备注"] as const;

type MaterialColumn =
  | "materialCode"
  | "materialKey"
  | "specKey"
  | "category"
  | "name"
  | "specification"
  | "colorFinish"
  | "color"
  | "finish"
  | "unit"
  | "weightKg"
  | "referenceCost"
  | "active"
  | "note"
  | "source";

type OpeningColumn =
  | "warehouseCode"
  | "materialCode"
  | "materialKey"
  | "specKey"
  | "specification"
  | "colorFinish"
  | "color"
  | "finish"
  | "openingQty"
  | "location"
  | "batchNo"
  | "note";

const MATERIAL_HEADER_ALIASES: Record<MaterialColumn, string[]> = {
  materialCode: ["物料编码", "materialcode", "material_code", "sku", "code", "officialsku", "official_sku", "完整sku", "完整物料编码"],
  materialKey: ["materialkey", "material_key", "物料key", "物料键"],
  specKey: ["speckey", "spec_key", "规格key", "规格键"],
  category: ["分类", "category", "materialcategory"],
  name: ["名称", "物料名称", "name", "materialname"],
  specification: ["规格", "规格描述", "specification", "spec"],
  colorFinish: ["颜色/表面处理", "颜色／表面处理", "颜色表面处理", "color/finish", "colorfinish", "color_finish", "variant", "variantlabel", "颜色", "表面处理"],
  color: ["color", "panelcolor"],
  finish: ["finish", "surfacefinish"],
  unit: ["单位", "unit", "uom"],
  weightKg: ["单重kg", "单重", "weightkg", "weight_kg", "unitweightkg"],
  referenceCost: ["参考采购成本", "参考成本", "referencecost", "reference_cost", "purchasecost", "cost"],
  active: ["启用状态", "状态", "active", "enabled", "status"],
  note: ["备注", "note", "remark", "remarks"],
  source: ["来源", "source"]
};

const OPENING_HEADER_ALIASES: Record<OpeningColumn, string[]> = {
  warehouseCode: ["仓库编码", "warehousecode", "warehouse_code", "warehouse"],
  materialCode: ["物料编码", "materialcode", "material_code", "sku", "code"],
  materialKey: ["materialkey", "material_key", "物料key", "物料键"],
  specKey: ["speckey", "spec_key", "规格key", "规格键"],
  specification: ["specification", "spec", "规格", "规格描述"],
  colorFinish: ["colorfinish", "color_finish", "color/finish", "颜色/表面处理", "变体", "变体标签"],
  color: ["color", "panelcolor", "颜色", "色号"],
  finish: ["finish", "surfacefinish", "surface_finish", "表面处理"],
  openingQty: ["期初数量", "期初库存", "openingqty", "opening_qty", "quantity", "qty"],
  location: ["库位", "location", "bin", "binlocation"],
  batchNo: ["批次号", "批号", "batchno", "batch_no", "batch"],
  note: ["备注", "note", "remark", "remarks"]
};

// Keep the historical Chinese headers above while accepting canonical
// identifiers used by catalog and eight-colour SKU exports.
MATERIAL_HEADER_ALIASES.materialCode.push("officialsku", "official_sku", "officialskucode", "official_sku_code", "officialcode", "official_code", "fullsku", "full_sku", "8colorssku", "8colors_sku", "货号", "完整sku", "完整物料编码");
MATERIAL_HEADER_ALIASES.colorFinish.push("variant", "variantlabel", "variant_label");
MATERIAL_HEADER_ALIASES.color.push("color", "panelcolor", "颜色", "色号");
MATERIAL_HEADER_ALIASES.finish.push("finish", "surfacefinish", "surface_finish", "表面处理");
OPENING_HEADER_ALIASES.materialCode.push("officialsku", "official_sku", "officialskucode", "official_sku_code", "officialcode", "official_code", "fullsku", "full_sku", "8colorssku", "8colors_sku", "货号", "完整sku", "完整物料编码");
OPENING_HEADER_ALIASES.materialKey.push("materialkey", "material_key", "物料key", "物料键");
OPENING_HEADER_ALIASES.specKey.push("speckey", "spec_key", "规格key", "规格键");
OPENING_HEADER_ALIASES.specification.push("specification", "spec", "规格", "规格描述");
OPENING_HEADER_ALIASES.colorFinish.push("variant", "variantlabel", "variant_label", "colorfinish", "color_finish");
OPENING_HEADER_ALIASES.color.push("color", "panelcolor", "颜色", "色号");
OPENING_HEADER_ALIASES.finish.push("finish", "surfacefinish", "surface_finish", "表面处理");

export async function parseInventoryImportWorkbook(file: File): Promise<InventoryImportWorkbook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(bytes);
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return parseDelimited(await file.text(), file.name);
  throw new Error("仅支持 .xlsx、.csv 或 .tsv 文件");
}

export function downloadInventoryImportTemplate(materials: InventoryMaterial[], warehouses: Warehouse[]) {
  const archive = buildInventoryImportTemplate(materials, warehouses);
  const bytes = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "USM库存首次导入模板.xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildInventoryImportTemplate(materials: InventoryMaterial[], warehouses: Warehouse[]): Uint8Array {
  const usedCodes = new Set<string>();
  const materialRows: string[][] = [Array.from(MATERIAL_HEADERS)];

  for (const material of uniqueMaterials(materials)) {
    const requestedCode = material.materialCode?.trim();
    const materialCode = requestedCode || suggestMaterialCode(material.materialKey, material.specKey, usedCodes);
    usedCodes.add(materialCode.toLocaleUpperCase());
    materialRows.push([
      materialCode,
      material.materialKey,
      material.specKey,
      material.category ?? "",
      material.name,
      material.specification,
      combineColorFinish(material.color, material.finish),
      material.unit,
      "",
      "",
      "启用",
      "",
      requestedCode ? "现有物料" : "BOM/价格表建议"
    ]);
  }

  const defaultWarehouse = warehouses.find((warehouse) => warehouse.status !== "inactive") ?? warehouses[0];
  const openingRows: string[][] = [Array.from(OPENING_HEADERS)];
  for (const row of materialRows.slice(1)) {
    openingRows.push([defaultWarehouse?.code ?? "MAIN", row[0], "", "", "", ""]);
  }

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": textBytes(contentTypesXml()),
    "_rels/.rels": textBytes(rootRelsXml()),
    "xl/workbook.xml": textBytes(workbookXml()),
    "xl/_rels/workbook.xml.rels": textBytes(workbookRelsXml()),
    "xl/styles.xml": textBytes(stylesXml()),
    "xl/worksheets/sheet1.xml": textBytes(sheetXml(materialRows, MATERIAL_HEADERS.length)),
    "xl/worksheets/sheet2.xml": textBytes(sheetXml(openingRows, OPENING_HEADERS.length))
  };
  return zipSync(files, { level: 6 });
}

function parseXlsx(bytes: Uint8Array): InventoryImportWorkbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Excel 文件损坏或不是有效的 .xlsx 文件");
  }

  const warnings: string[] = [];
  const sharedStrings = files["xl/sharedStrings.xml"] ? parseSharedStrings(files["xl/sharedStrings.xml"]) : [];
  const sheets = resolveWorkbookSheets(files);
  const materialSheet = findSheet(sheets, MATERIAL_SHEET_NAME, ["materials", "materialmaster", "materialdata"]);
  const openingSheet = findSheet(sheets, OPENING_SHEET_NAME, ["openinginventory", "openingstock", "initialinventory"]);

  if (!materialSheet) warnings.push(`未找到“${MATERIAL_SHEET_NAME}”工作表`);
  if (!openingSheet) warnings.push(`未找到“${OPENING_SHEET_NAME}”工作表`);

  const materialTable = materialSheet ? parseSheet(files[materialSheet.path], sharedStrings) : [];
  const openingTable = openingSheet ? parseSheet(files[openingSheet.path], sharedStrings) : [];
  const materialWarnings: string[] = [];
  const openingWarnings: string[] = [];
  const materialRows = rowsToMaterialRows(materialTable, materialWarnings);
  const openingRows = rowsToOpeningRows(openingTable, openingWarnings, materialRows);

  return { materialRows, openingRows, warnings: [...warnings, ...materialWarnings, ...openingWarnings] };
}

function parseDelimited(text: string, fileName: string): InventoryImportWorkbook {
  const table = parseDelimitedRows(text.replace(/^\ufeff/, ""));
  const normalizedHeaders = (table[0] ?? []).map(normalizeHeader);
  const looksLikeOpening = normalizedHeaders.some((header) => normalizedAliases(OPENING_HEADER_ALIASES.openingQty).includes(header));
  const warnings: string[] = [];
  if (looksLikeOpening) {
    return { materialRows: [], openingRows: rowsToOpeningRows(table, warnings), warnings: [`${fileName} 仅包含期初库存；提交前仍需确保物料主数据已存在`, ...warnings] };
  }
  return { materialRows: rowsToMaterialRows(table, warnings), openingRows: [], warnings: [`${fileName} 仅包含物料主数据；CSV/TSV 不支持多个工作表`, ...warnings] };
}

function rowsToMaterialRows(rows: string[][], warnings: string[]): InventoryMaterialImportRow[] {
  if (!rows.length) return [];
  const indexes = headerIndexes<MaterialColumn>(rows[0], MATERIAL_HEADER_ALIASES);
  if (indexes.materialCode < 0 || indexes.materialKey < 0 || indexes.specKey < 0 || indexes.name < 0) {
    warnings.push("物料主数据缺少必填表头：物料编码、materialKey、specKey 或名称");
  }

  return rows.slice(1).flatMap((row, index) => {
    if (!row.some((value) => String(value ?? "").trim())) return [];
    const rowNumber = index + 2;
    const colorFinish = valueAt(row, indexes.colorFinish);
    const [combinedColor, combinedFinish] = splitColorFinish(colorFinish);
    const color = valueAt(row, indexes.color) || combinedColor;
    const finish = valueAt(row, indexes.finish) || combinedFinish;
    const weightKg = parseOptionalNumber(valueAt(row, indexes.weightKg));
    const referenceCost = parseOptionalNumber(valueAt(row, indexes.referenceCost));
    const materialCode = valueAt(row, indexes.materialCode);
    const materialKey = valueAt(row, indexes.materialKey);
    const specKey = valueAt(row, indexes.specKey) || valueAt(row, indexes.specification);
    const name = valueAt(row, indexes.name);

    if (!materialCode || !materialKey || !specKey || !name) {
      warnings.push(`物料主数据第 ${rowNumber} 行缺少必填值`);
    }
    if (Number.isNaN(weightKg)) warnings.push(`物料主数据第 ${rowNumber} 行“单重kg”不是有效数字`);
    if (Number.isNaN(referenceCost)) warnings.push(`物料主数据第 ${rowNumber} 行“参考采购成本”不是有效数字`);

    return [{
      materialCode,
      materialKey,
      specKey,
      category: optionalValue(row, indexes.category),
      name,
      specification: optionalValue(row, indexes.specification),
      color: color || undefined,
      finish: finish || undefined,
      unit: optionalValue(row, indexes.unit),
      weightKg,
      referenceCost,
      active: parseOptionalBoolean(valueAt(row, indexes.active), warnings, `物料主数据第 ${rowNumber} 行`),
      note: optionalValue(row, indexes.note),
      source: optionalValue(row, indexes.source)
    }];
  });
}

function rowsToOpeningRows(
  rows: string[][],
  warnings: string[],
  materialRows: InventoryMaterialImportRow[] = []
): OpeningInventoryImportRow[] {
  if (!rows.length) return [];
  const indexes = headerIndexes<OpeningColumn>(rows[0], OPENING_HEADER_ALIASES);
  if (indexes.warehouseCode < 0 || indexes.openingQty < 0) {
    warnings.push("Opening inventory is missing required headers: warehouseCode or openingQty");
  }

  return rows.slice(1).flatMap((row, index) => {
    if (!row.some((value) => String(value ?? "").trim())) return [];
    const rowNumber = index + 2;
    const warehouseCode = valueAt(row, indexes.warehouseCode);
    const explicitMaterialCode = valueAt(row, indexes.materialCode);
    const materialKey = valueAt(row, indexes.materialKey);
    const specKey = valueAt(row, indexes.specKey) || valueAt(row, indexes.specification);
    const [combinedColor, combinedFinish] = splitColorFinish(valueAt(row, indexes.colorFinish));
    const color = valueAt(row, indexes.color) || combinedColor;
    const finish = valueAt(row, indexes.finish) || combinedFinish;
    const resolution = explicitMaterialCode
      ? { materialCode: explicitMaterialCode, reason: undefined as string | undefined }
      : resolveOpeningMaterialCode(materialRows, { materialKey, specKey, color, finish });
    const materialCode = resolution.materialCode;
    const openingQty = parseRequiredNumber(valueAt(row, indexes.openingQty));
    if (!warehouseCode || Number.isNaN(openingQty)) {
      warnings.push(`Opening inventory row ${rowNumber} is missing a warehouse or valid quantity`);
    }
    if (!explicitMaterialCode && resolution.reason) {
      warnings.push(`Opening inventory row ${rowNumber}: ${resolution.reason}`);
    } else if (!materialCode) {
      warnings.push(`Opening inventory row ${rowNumber} is missing a material code`);
    }
    return [{
      warehouseCode,
      materialCode,
      materialKey: materialKey || undefined,
      specKey: specKey || undefined,
      specification: valueAt(row, indexes.specification) || undefined,
      color: color || undefined,
      finish: finish || undefined,
      openingQty,
      location: optionalValue(row, indexes.location),
      batchNo: optionalValue(row, indexes.batchNo),
      note: optionalValue(row, indexes.note)
    }];
  });
}

function resolveOpeningMaterialCode(
  materialRows: InventoryMaterialImportRow[],
  input: { materialKey: string; specKey: string; color: string; finish: string }
): { materialCode: string; reason?: string } {
  if (!input.materialKey || !input.specKey) {
    return { materialCode: "", reason: "materialCode is blank and materialKey/specKey are incomplete" };
  }
  const normalizedMaterialKey = normalizeIdentityPart(input.materialKey);
  const normalizedSpecKey = normalizeIdentityPart(input.specKey);
  const normalizedColor = normalizeIdentityPart(input.color);
  const normalizedFinish = normalizeIdentityPart(input.finish);
  const candidates = materialRows.filter((row) => {
    if (normalizeIdentityPart(row.materialKey) !== normalizedMaterialKey) return false;
    const rowSpecKey = normalizeIdentityPart(row.specKey);
    const rowSpecification = normalizeIdentityPart(row.specification);
    if (rowSpecKey !== normalizedSpecKey && rowSpecification !== normalizedSpecKey) return false;
    if (normalizedColor && normalizeIdentityPart(row.color) !== normalizedColor) return false;
    if (normalizedFinish && normalizeIdentityPart(row.finish) !== normalizedFinish) return false;
    return Boolean(row.materialCode);
  });
  if (candidates.length === 1) return { materialCode: candidates[0].materialCode };
  if (!candidates.length) return { materialCode: "", reason: "no material master row matches materialKey/specKey/variant" };
  return { materialCode: "", reason: `materialKey/specKey/variant matches ${candidates.length} material master rows; enter the complete materialCode` };
}

function normalizeIdentityPart(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase().normalize("NFKC");
}

function legacyRowsToOpeningRows(
  rows: string[][],
  warnings: string[],
  materialRows: InventoryMaterialImportRow[] = []
): OpeningInventoryImportRow[] {
  if (!rows.length) return [];
  const indexes = headerIndexes<OpeningColumn>(rows[0], OPENING_HEADER_ALIASES);
  if (indexes.warehouseCode < 0 || indexes.materialCode < 0 || indexes.openingQty < 0) {
    warnings.push("期初库存缺少必填表头：仓库编码、物料编码或期初数量");
  }

  return rows.slice(1).flatMap((row, index) => {
    if (!row.some((value) => String(value ?? "").trim())) return [];
    const rowNumber = index + 2;
    const warehouseCode = valueAt(row, indexes.warehouseCode);
    const materialCode = valueAt(row, indexes.materialCode);
    const openingQty = parseRequiredNumber(valueAt(row, indexes.openingQty));
    if (!warehouseCode || !materialCode || Number.isNaN(openingQty)) {
      warnings.push(`期初库存第 ${rowNumber} 行缺少必填值或数量非法`);
    }
    return [{
      warehouseCode,
      materialCode,
      openingQty,
      location: optionalValue(row, indexes.location),
      batchNo: optionalValue(row, indexes.batchNo),
      note: optionalValue(row, indexes.note)
    }];
  });
}

function resolveWorkbookSheets(files: Record<string, Uint8Array>): Array<{ name: string; path: string }> {
  const workbookBytes = files["xl/workbook.xml"];
  const relsBytes = files["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !relsBytes) return [];

  const workbook = parseXml(workbookBytes);
  const rels = parseXml(relsBytes);
  const targets = new Map(
    Array.from(rels.getElementsByTagName("Relationship")).map((relationship) => [
      relationship.getAttribute("Id") ?? "",
      normalizeWorksheetPath(relationship.getAttribute("Target") ?? "")
    ])
  );

  return Array.from(workbook.getElementsByTagName("sheet")).flatMap((sheet) => {
    const name = sheet.getAttribute("name") ?? "";
    const relationshipId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const path = targets.get(relationshipId);
    return path ? [{ name, path }] : [];
  });
}

function findSheet(sheets: Array<{ name: string; path: string }>, expectedName: string, aliases: string[]) {
  const normalizedExpected = normalizeHeader(expectedName);
  const normalizedAliasSet = new Set(aliases.map(normalizeHeader));
  return sheets.find((sheet) => normalizeHeader(sheet.name) === normalizedExpected)
    ?? sheets.find((sheet) => normalizedAliasSet.has(normalizeHeader(sheet.name)));
}

function parseSheet(bytes: Uint8Array | undefined, sharedStrings: string[]): string[][] {
  if (!bytes) return [];
  const document = parseXml(bytes);
  return Array.from(document.getElementsByTagName("row")).map((row) => {
    const values: string[] = [];
    for (const spreadsheetCell of Array.from(row.getElementsByTagName("c"))) {
      const reference = spreadsheetCell.getAttribute("r") ?? "A1";
      const index = columnIndex(reference.replace(/\d+$/, ""));
      const type = spreadsheetCell.getAttribute("t");
      const rawValue = type === "inlineStr"
        ? Array.from(spreadsheetCell.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("")
        : spreadsheetCell.getElementsByTagName("v")[0]?.textContent ?? "";
      values[index] = type === "s" ? sharedStrings[Number(rawValue)] ?? "" : rawValue;
    }
    return values.map((value) => value ?? "");
  });
}

function parseSharedStrings(bytes: Uint8Array): string[] {
  const document = parseXml(bytes);
  return Array.from(document.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("")
  );
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && character === delimiter) { row.push(field.trim()); field = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += character;
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): "\t" | "," {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
}

function uniqueMaterials(materials: InventoryMaterial[]) {
  const seen = new Set<string>();
  return materials.filter((material) => {
    const key = [material.materialKey, material.specKey, material.color ?? "", material.finish ?? ""].join("|").toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestMaterialCode(materialKey: string, specKey: string, usedCodes: Set<string>) {
  const source = `${materialKey}-${specKey}`;
  const readable = source
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleUpperCase()
    .slice(0, 64);
  const base = `MAT-${readable || stableHash(source)}`;
  let candidate = base;
  let suffix = 2;
  while (usedCodes.has(candidate.toLocaleUpperCase())) {
    candidate = `${base.slice(0, 94)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toLocaleUpperCase();
}

function combineColorFinish(color?: string | null, finish?: string | null) {
  return [color?.trim(), finish?.trim()].filter(Boolean).join(" / ");
}

function splitColorFinish(value: string): [string, string] {
  if (!value) return ["", ""];
  const parts = value.split(/\s*(?:\/|,|，|\||;|；)\s*/, 2);
  return parts.length > 1 ? [parts[0].trim(), parts[1].trim()] : [value.trim(), ""];
}

function splitColorFinishLegacy(value: string): [string, string] {
  if (!value) return ["", ""];
  const parts = value.split(/\s*(?:\/|／|\||;)\s*/, 2);
  return parts.length > 1 ? [parts[0].trim(), parts[1].trim()] : [value.trim(), ""];
}

function headerIndexes<Key extends string>(row: string[], aliases: Record<Key, string[]>): Record<Key, number> {
  const headers = row.map(normalizeHeader);
  return Object.fromEntries(
    Object.entries<string[]>(aliases).map(([key, candidates]) => [
      key,
      headers.findIndex((header) => normalizedAliases(candidates).includes(header))
    ])
  ) as Record<Key, number>;
}

function normalizedAliases(aliases: string[]) {
  return aliases.map(normalizeHeader);
}

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[\s_\-\/\\|:：()（）\[\]【】]/g, "");
}

function normalizeHeaderLegacy(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_\-\/／()（）]/g, "");
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function optionalValue(row: string[], index: number) {
  return valueAt(row, index) || undefined;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value) return undefined;
  return Number(value.replace(/[,，\s]/g, ""));
}

function parseOptionalNumberLegacy(value: string): number | undefined {
  if (!value) return undefined;
  return Number(value.replace(/[,，\s￥¥]/g, ""));
}

function parseRequiredNumber(value: string) {
  return value ? Number(value.replace(/[,，\s]/g, "")) : Number.NaN;
}

function parseRequiredNumberLegacy(value: string) {
  return value ? Number(value.replace(/[,，\s]/g, "")) : Number.NaN;
}

function parseOptionalBoolean(value: string, warnings: string[], context: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = normalizeHeader(value);
  if (["启用", "是", "active", "enabled", "true", "yes", "1"].includes(normalized)) return true;
  if (["停用", "禁用", "否", "inactive", "disabled", "false", "no", "0"].includes(normalized)) return false;
  warnings.push(`${context}“启用状态”无法识别`);
  return undefined;
}

function parseXml(bytes: Uint8Array) {
  const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("Excel 内部 XML 无法解析");
  return document;
}

function normalizeWorksheetPath(target: string) {
  const normalized = target.replace(/\\/g, "/").replace(/^\/?xl\//, "").replace(/^\/+/, "");
  return `xl/${normalized}`;
}

function columnIndex(value: string) {
  return value.split("").reduce((total, character) => total * 26 + character.toLocaleUpperCase().charCodeAt(0) - 64, 0) - 1;
}

function columnName(index: number) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function sheetXml(rows: string[][], columnCount: number) {
  const lastColumn = columnName(Math.max(0, columnCount - 1));
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndexValue) => {
      const reference = `${columnName(columnIndexValue)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({ length: columnCount }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 1 || index === 2 ? 22 : 16}" customWidth="1"/>`).join("")}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, rows.length)}"/></worksheet>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${MATERIAL_SHEET_NAME}" sheetId="1" r:id="rId1"/><sheet name="${OPENING_SHEET_NAME}" sheetId="2" r:id="rId2"/></sheets></workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F6F5F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
}
