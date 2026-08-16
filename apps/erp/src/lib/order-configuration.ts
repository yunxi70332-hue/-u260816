import type {
  OrderConfiguration,
  OrderConfigurationColor,
  OrderConfigurationInteriorAccessory,
  OrderConfigurationModule,
  OrderConfigurationWorkSurface
} from "../types";
import {
  accessoryMountSideLabel,
  getDimensions,
  getPhysicalAccessoryMountSide,
  getPlanCellConfig,
  normalizeConfig,
  type CabinetConfig,
  type CellConfig
} from "../../../../src/model";

type Raw = Record<string, unknown>;

const USM_COLOR_CATALOG: Record<string, { name: string; code: string }> = {
  "#0c0c0c": { name: "黑色", code: "A类" },
  "#fffef0": { name: "白色", code: "A类" },
  "#b8a68e": { name: "奶咖色", code: "A类" },
  "#1a2845": { name: "钢蓝色", code: "B类" },
  "#586840": { name: "橄榄绿", code: "B类" },
  "#2255a8": { name: "宝石蓝", code: "C类" },
  "#fafad2": { name: "鹅黄色", code: "C类" },
  "#e8602a": { name: "橙色", code: "C类" },
  "#f5b8c8": { name: "粉红", code: "C类" },
  "#8ed0f0": { name: "西子蓝", code: "C类" },
  "#2da845": { name: "绿色", code: "C类" },
  "#7a1830": { name: "红色", code: "C类" },
  "#e8aa10": { name: "黄色", code: "C类" },
  "#bcc0b8": { name: "银色", code: "C类" },
  "#5a5a68": { name: "深灰色", code: "C类" },
  "#5c3820": { name: "棕色", code: "C类" }
};

const LEGACY_COLOR_VALUES: Record<string, string> = {
  "#121314": "#0c0c0c",
  "#0a0a0a": "#0c0c0c",
  "#f4f2eb": "#fffef0",
  "#fcf9f2": "#fffef0",
  "#d9dedf": "#bcc0b8",
  "#b5bbb7": "#bcc0b8",
  "#506a78": "#1a2845",
  "#001e42": "#1a2845",
  "#59644c": "#586840",
  "#50523b": "#586840",
  "#244e7a": "#2255a8",
  "#004a87": "#2255a8",
  "#f1d86a": "#e8aa10",
  "#f0ac01": "#e8aa10",
  "#e76f3c": "#e8602a",
  "#cc641b": "#e8602a",
  "#d9829d": "#7a1830",
  "#9a0000": "#7a1830",
  "#4c426b": "#5a5a68",
  "#3c4250": "#5a5a68",
  "#2f7a55": "#2da845",
  "#0f9929": "#2da845",
  "#a4262c": "#7a1830",
  "#f2d13b": "#e8aa10",
  "#b8c0c5": "#bcc0b8",
  "#4a4f53": "#5a5a68",
  "#6b4d3a": "#5c3820",
  "#322512": "#5c3820",
  "#9b8c6d": "#b8a68e"
};

const MODULE_LABELS: Record<string, string> = {
  open: "开放格",
  metalBackModule: "含金属背板模块",
  noBackModule: "无背板模块",
  glassPanelModule: "玻璃板模块",
  sideOpenDoor: "无侧板模块",
  dropDoor: "下翻门模块",
  flipUpDoor: "上翻门模块",
  glassDropDoor: "玻璃门模块",
  perforatedPanel: "洞洞板模块",
  openBackPanel: "金属背板模块",
  sidePanel: "侧板模块",
  softPanelLow: "低软包板模块",
  softPanelWide: "宽软包板模块",
  softPanelTall: "高软包板模块",
  shelf: "层板模块",
  pullOutShelf: "抽拉层板模块",
  boxDrawer: "抽屉模块",
  displayTray: "展示托盘模块",
  glassShelf: "玻璃层板模块"
};

const FRONT_ACCESSORY_LABELS: Record<string, string> = {
  dropDoor: "下翻门",
  flipUpDoor: "上翻门",
  glassDropDoor: "玻璃门"
};

const FITTING_LABELS: Record<string, string> = {
  none: "无",
  mobileTray: "移动托盘",
  rimmedDrawer: "有边抽屉",
  rimlessDrawer: "无边抽屉"
};

const INTERIOR_ACCESSORY_LABELS: Record<string, string> = {
  mobileTray: "移动托盘",
  shelf: "层板",
  displayTray: "展示托盘",
  glassShelf: "玻璃层板"
};

const WORK_SURFACE_LABELS: Record<string, string> = {
  deskTop: "跨格桌面",
  bridgeTop: "桥接台面"
};

const FRAME_FINISH_LABELS: Record<string, string> = {
  chrome: "镀铬",
  graphite: "石墨黑"
};

const FEET_LABELS: Record<string, string> = {
  glides: "脚垫",
  "caster-low": "低脚轮",
  "caster-high": "高脚轮"
};

const STRUCTURE_MODE_LABELS: Record<string, string> = {
  complete: "完整结构",
  noFront: "无前板",
  noPanels: "无面板",
  frameOnly: "仅框架"
};

interface FrozenOrderConfigurationSource {
  configSnapshot: Raw | null;
  bomSnapshot: unknown[];
  snapshotVersion: string;
  previewDataUrl: string | null;
}

interface MutableColor extends OrderConfigurationColor {
  categorySet: Set<string>;
  positionSet: Set<string>;
}

interface OuterDimensions {
  width: number;
  height: number;
  depth: number;
}

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function positiveNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const numbers = value.map(positiveNumber);
  return numbers.every((item): item is number => item !== null) ? numbers : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function imageDataUrl(value: unknown): string | null {
  const raw = stringValue(value);
  const match = raw?.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || match[2].length % 4 !== 0) return null;
  try {
    const header = atob(match[2].slice(0, 32));
    const mime = match[1].toLowerCase();
    const valid = mime === "png"
      ? header.startsWith("\x89PNG\r\n\x1a\n")
      : mime === "jpeg"
        ? header.startsWith("\xff\xd8\xff")
        : header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
    return valid ? raw! : null;
  } catch {
    return null;
  }
}

function scalarValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function colorValue(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  return LEGACY_COLOR_VALUES[normalized] ?? normalized;
}

function colorMeta(value: string): { name: string; code: string } {
  return USM_COLOR_CATALOG[value] ?? { name: "自定义色", code: "-" };
}

function labelFor(map: Record<string, string>, value: unknown, fallback: string): string {
  const raw = stringValue(value);
  return raw ? map[raw] ?? raw : fallback;
}

function moduleLabel(kind: string, faceSide: unknown): string {
  return kind === "metalBackModule" && stringValue(faceSide) === "back"
    ? "含金属前板模块"
    : labelFor(MODULE_LABELS, kind, kind);
}

function directionalLabel(label: string, cell: CellConfig | undefined): string {
  if (!cell) return label;
  return `${label} · ${accessoryMountSideLabel(getPhysicalAccessoryMountSide(cell))}向`;
}

function normalizedFrozenConfig(config: Raw): CabinetConfig | null {
  try {
    return normalizeConfig(config as unknown as Partial<CabinetConfig>);
  } catch {
    return null;
  }
}

function positionLabel(row: number, column: number, depthIndex: number): string {
  return `第${row + 1}层 · 第${column + 1}列 · 深度${depthIndex + 1}`;
}

function panelLabel(panel: string): string {
  const labels: Record<string, string> = {
    front: "前板",
    back: "背板",
    left: "左侧板",
    right: "右侧板",
    top: "顶板",
    bottom: "底板"
  };
  return labels[panel] ?? panel;
}

function normalisePlanCells(config: Raw, rows: number, columns: number, depthCount: number): unknown[][][] {
  const rawPlan = asArray(config.planCells);
  if (rawPlan.length) {
    return rawPlan.slice(0, rows).map((rawRow) => asArray(rawRow).slice(0, depthCount).map((rawDepth) => asArray(rawDepth).slice(0, columns)));
  }
  const legacyCells = asArray(config.cells);
  return legacyCells.slice(0, rows).map((rawRow) => [asArray(rawRow).slice(0, columns)]);
}

function readFrozenOuterDimensions(config: Raw): OuterDimensions | null {
  const frozen = asRecord(config.frozenOuterDimensions);
  const width = positiveNumber(frozen.width ?? frozen.outerWidth);
  const height = positiveNumber(frozen.height ?? frozen.outerHeight);
  const depth = positiveNumber(frozen.depth ?? frozen.outerDepth);
  return width && height && depth ? { width, height, depth } : null;
}

function calculateLegacyOuterDimensions(config: Raw): OuterDimensions | null {
  try {
    const dimensions = getDimensions(normalizeConfig(config as unknown as Partial<CabinetConfig>));
    const { outerWidth: width, outerHeight: height, outerDepth: depth } = dimensions;
    return Number.isFinite(width) && Number.isFinite(height) && Number.isFinite(depth) && width > 0 && height > 0 && depth > 0
      ? { width, height, depth }
      : null;
  } catch {
    return null;
  }
}

function findFrozenOrderConfiguration(order: unknown): FrozenOrderConfigurationSource {
  const raw = asRecord(order);
  const orderSnapshot = asRecord(raw.snapshot ?? raw.orderSnapshot);
  const quote = asRecord(orderSnapshot.quote);
  const quoteSnapshot = asRecord(quote.snapshot);
  const designVersion = asRecord(quoteSnapshot.designVersion);
  const configSnapshot = asRecord(designVersion.configSnapshot);
  return {
    configSnapshot: Object.keys(configSnapshot).length ? configSnapshot : null,
    bomSnapshot: asArray(designVersion.bomSnapshot),
    snapshotVersion: scalarValue(designVersion.version) ?? scalarValue(quote.revision) ?? "-",
    previewDataUrl: imageDataUrl(quoteSnapshot.previewDataUrl)
      ?? imageDataUrl(designVersion.previewDataUrl)
      ?? imageDataUrl(configSnapshot.previewDataUrl)
  };
}

export function unavailableOrderConfiguration(reason = "订单没有可用配置快照。", snapshotVersion = "-"): OrderConfiguration {
  return {
    previewDataUrl: null,
    dimensions: "-",
    frameColor: "-",
    panelColor: "-",
    modules: 0,
    snapshotVersion,
    available: false,
    unavailableReason: reason,
    rows: 0,
    columns: 0,
    depthSegments: [],
    columnWidths: [],
    rowHeights: [],
    frameFinish: "-",
    feet: "-",
    structureMode: "-",
    moduleItems: [],
    workSurfaces: [],
    colors: []
  };
}

export function projectOrderConfiguration(order: unknown): OrderConfiguration {
  const source = findFrozenOrderConfiguration(order);
  const config = source.configSnapshot;
  if (!config) return unavailableOrderConfiguration("订单没有可用配置快照。", source.snapshotVersion);

  const rowHeights = numberArray(config.rowHeights);
  const columnWidths = numberArray(config.columnWidths);
  const configuredDepthSegments = numberArray(config.depthSegments);
  const fallbackDepth = positiveNumber(config.depth);
  const depthSegments = configuredDepthSegments.length ? configuredDepthSegments : fallbackDepth ? [fallbackDepth] : [];
  if (!rowHeights.length || !columnWidths.length || !depthSegments.length) {
    return unavailableOrderConfiguration("冻结配置快照缺少有效尺寸。", source.snapshotVersion);
  }

  const planCells = normalisePlanCells(config, rowHeights.length, columnWidths.length, depthSegments.length);
  if (!planCells.length) return unavailableOrderConfiguration("冻结配置快照缺少模块布局。", source.snapshotVersion);
  const normalizedConfig = normalizedFrozenConfig(config);

  const panelColor = colorValue(config.panelColor) ?? "#fffef0";
  const colorScope = stringValue(config.colorScope) ?? "all";
  const colors = new Map<string, MutableColor>();
  const addColor = (rawColor: unknown, category: string, position: string) => {
    const value = colorValue(rawColor);
    if (!value) return;
    const existing = colors.get(value);
    if (existing) {
      existing.references += 1;
      existing.categorySet.add(category);
      existing.positionSet.add(position);
      return;
    }
    const meta = colorMeta(value);
    colors.set(value, {
      value,
      name: meta.name,
      code: meta.code,
      categories: [],
      references: 1,
      positions: [],
      categorySet: new Set([category]),
      positionSet: new Set([position])
    });
  };

  addColor(panelColor, "全局面板", "全柜");
  const moduleItems: OrderConfigurationModule[] = [];
  planCells.forEach((rawRow, row) => {
    rawRow.forEach((rawDepthRow, depthIndex) => {
      rawDepthRow.forEach((rawCell, column) => {
        const cell = asRecord(rawCell);
        if (!Object.keys(cell).length) return;
        const normalizedCell = normalizedConfig ? getPlanCellConfig(normalizedConfig, row, depthIndex, column) : undefined;
        const position = positionLabel(row, column, depthIndex);
        const kind = stringValue(cell.kind) ?? "open";
        const enabled = cell.enabled !== false;
        const ownColor = colorValue(cell.color);
        const effectiveColor = colorScope === "all" ? panelColor : ownColor ?? panelColor;
        const rawPanelColors = asRecord(cell.panelColors);
        const panelColors = colorScope === "all" ? [] : Object.entries(rawPanelColors)
          .map(([panel, color]) => ({ panel, color: colorValue(color) }))
          .filter((item): item is { panel: string; color: string } => !!item.color);
        const frontAccessory = stringValue(cell.frontAccessory) ?? (FRONT_ACCESSORY_LABELS[kind] ? kind : undefined);
        const rawAccessoryColors = asRecord(cell.accessoryColors);
        const interiorAccessories = asArray(cell.interiorAccessories).map((rawAccessory, index): OrderConfigurationInteriorAccessory | null => {
          const accessory = asRecord(rawAccessory);
          const accessoryKind = stringValue(accessory.kind);
          if (!accessoryKind) return null;
          return {
            id: stringValue(accessory.id) ?? `${accessoryKind}-${index + 1}`,
            kind: accessoryKind,
            kindLabel: labelFor(INTERIOR_ACCESSORY_LABELS, accessoryKind, accessoryKind),
            color: colorValue(accessory.color)
          };
        }).filter((item): item is OrderConfigurationInteriorAccessory => !!item);
        const fittingValue = stringValue(cell.fitting);
        const fitting = fittingValue === "none" ? undefined : fittingValue;
        const legacyBackMountedDropDoor = frontAccessory === "dropDoor"
          && !stringValue(cell.faceSide)
          && normalizedCell?.frontAccessory === "dropDoor"
          && normalizedCell.faceSide === "back";
        const kindLabel = legacyBackMountedDropDoor
          ? moduleLabel(normalizedCell.kind, normalizedCell.faceSide)
          : moduleLabel(kind, cell.faceSide);
        const frontAccessoryLabel = frontAccessory
          ? frontAccessory === "dropDoor"
            ? directionalLabel(labelFor(FRONT_ACCESSORY_LABELS, frontAccessory, frontAccessory), normalizedCell)
            : labelFor(FRONT_ACCESSORY_LABELS, frontAccessory, frontAccessory)
          : undefined;
        const fittingLabel = fitting
          ? fitting === "rimlessDrawer"
            ? directionalLabel(labelFor(FITTING_LABELS, fitting, fitting), normalizedCell)
            : labelFor(FITTING_LABELS, fitting, fitting)
          : undefined;

        moduleItems.push({
          id: stringValue(cell.id) ?? `module-${row + 1}-${depthIndex + 1}-${column + 1}`,
          row,
          column,
          depthIndex,
          position,
          kind,
          kindLabel,
          enabled,
          width: columnWidths[column] ?? 0,
          height: rowHeights[row] ?? 0,
          depth: positiveNumber(cell.depth) ?? depthSegments[depthIndex] ?? 0,
          color: effectiveColor,
          panelColors,
          frontAccessory,
          frontAccessoryLabel,
          fitting,
          fittingLabel,
          interiorAccessories
        });

        addColor(effectiveColor, "模块颜色", position);
        panelColors.forEach((item) => addColor(item.color, "面板覆盖", `${position} · ${panelLabel(item.panel)}`));
        if (frontAccessory) {
          const frontColor = colorScope === "all" ? panelColor : colorValue(rawAccessoryColors.front) ?? ownColor ?? panelColor;
          addColor(frontColor, "前脸配件", position);
        }
        interiorAccessories.forEach((accessory) => {
          const accessoryColor = colorScope === "all" ? panelColor : accessory.color ?? colorValue(rawAccessoryColors[accessory.id]) ?? ownColor ?? panelColor;
          addColor(accessoryColor, "内部配件", `${position} · ${accessory.kindLabel}`);
        });
        Object.entries(rawAccessoryColors).forEach(([accessoryId, accessoryColor]) => {
          if (accessoryId === "front" || interiorAccessories.some((item) => item.id === accessoryId)) return;
          if (colorScope !== "all") addColor(accessoryColor, "配件颜色", `${position} · ${accessoryId}`);
        });
      });
    });
  });

  const workSurfaces: OrderConfigurationWorkSurface[] = asArray(config.workSurfaces).map((rawSurface, index) => {
    const surface = asRecord(rawSurface);
    const fromColumn = Math.max(0, Math.min(columnWidths.length - 1, Math.trunc(Number(surface.fromColumn) || 0)));
    const toColumn = Math.max(fromColumn, Math.min(columnWidths.length - 1, Math.trunc(Number(surface.toColumn) || fromColumn)));
    const row = Math.max(0, Math.min(rowHeights.length - 1, Math.trunc(Number(surface.row) || 0)));
    const surfaceColor = colorValue(surface.color);
    const result: OrderConfigurationWorkSurface = {
      id: stringValue(surface.id) ?? `surface-${index + 1}`,
      kind: stringValue(surface.kind) ?? "deskTop",
      kindLabel: labelFor(WORK_SURFACE_LABELS, surface.kind, "台面"),
      enabled: surface.enabled !== false,
      row,
      fromColumn,
      toColumn,
      width: columnWidths.slice(fromColumn, toColumn + 1).reduce((total, value) => total + value, 0) + Math.max(0, Number(surface.overhangLeft) || 0) + Math.max(0, Number(surface.overhangRight) || 0),
      depth: (positiveNumber(surface.depth) ?? depthSegments.reduce((total, value) => total + value, 0)) + Math.max(0, Number(surface.overhangFront) || 0) + Math.max(0, Number(surface.overhangBack) || 0),
      thickness: positiveNumber(surface.thickness) ?? 0,
      color: surfaceColor
    };
    if (surfaceColor) addColor(surfaceColor, "工作台面", `第${row + 1}层 · 第${fromColumn + 1}-${toColumn + 1}列`);
    return result;
  });

  const bomQuantityByColor = new Map<string, number>();
  source.bomSnapshot.forEach((rawLine) => {
    const line = asRecord(rawLine);
    const bomColor = colorValue(line.color);
    const quantity = Number(line.qty ?? line.quantity ?? 0);
    if (!bomColor || !Number.isFinite(quantity) || quantity <= 0) return;
    bomQuantityByColor.set(bomColor, (bomQuantityByColor.get(bomColor) ?? 0) + quantity);
  });
  bomQuantityByColor.forEach((quantity, value) => {
    if (!colors.has(value)) addColor(value, "BOM物料", "BOM");
    const color = colors.get(value);
    if (color) color.bomQuantity = quantity;
  });

  const outerDimensions = readFrozenOuterDimensions(config) ?? calculateLegacyOuterDimensions(config);
  if (!outerDimensions) {
    return unavailableOrderConfiguration("冻结配置快照缺少可还原的外形尺寸。", source.snapshotVersion);
  }
  return {
    previewDataUrl: source.previewDataUrl,
    dimensions: `${outerDimensions.width} × ${outerDimensions.height} × ${outerDimensions.depth} mm`,
    frameColor: labelFor(FRAME_FINISH_LABELS, config.frameFinish, "镀铬"),
    panelColor: `${colorMeta(panelColor).name} ${colorMeta(panelColor).code}`.trim(),
    modules: moduleItems.filter((item) => item.enabled).length,
    snapshotVersion: source.snapshotVersion,
    available: true,
    rows: rowHeights.length,
    columns: columnWidths.length,
    depthSegments,
    columnWidths,
    rowHeights,
    frameFinish: labelFor(FRAME_FINISH_LABELS, config.frameFinish, "镀铬"),
    feet: labelFor(FEET_LABELS, config.feet, "脚垫"),
    structureMode: labelFor(STRUCTURE_MODE_LABELS, config.structureMode, "完整结构"),
    moduleItems,
    workSurfaces,
    colors: [...colors.values()].map(({ categorySet, positionSet, ...color }) => ({
      ...color,
      categories: [...categorySet],
      positions: [...positionSet]
    })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
  };
}
