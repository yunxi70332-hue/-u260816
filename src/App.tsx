import {
  Archive,
  ArrowLeft,
  Box,
  ChevronsLeftRight,
  Camera,
  Check,
  CircleDot,
  ClipboardList,
  Columns3,
  CornerUpLeft,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Focus,
  Grid3X3,
  Layers3,
  Minus,
  MoveHorizontal,
  PanelBottomOpen,
  PaintBucket,
  Plus,
  RotateCcw,
  Settings2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACCESSORY_CATEGORIES, ACCESSORY_REQUIREMENTS } from "./accessoryCatalog";
import { DesignerErpPanel } from "./erp/DesignerErpPanel";
import { ErpApiError, erpRequest, getErpAppUrl, getErpLoginUrl, unwrapItem } from "./erp/api";
import {
  ERP_FEATURES,
  businessGateway,
  createBusinessRequestId,
  type BusinessContext,
  type BusinessResult,
  type InventoryAvailability,
  type ProductionOrderResult
} from "./business";
import { BuilderScene, type SceneSelection, type SelectedAccessory } from "./BuilderScene";
import { calculateConfigurationPrice, type PricingState, type ServerPriceLine } from "./pricingApi";
import {
  CELL_OPTIONS,
  CELL_FITTING_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_CONFIG,
  DEPTH_OPTIONS,
  FEET_OPTIONS,
  FRONT_ACCESSORY_OPTIONS,
  ACCESSORY_MOUNT_SIDE_OPTIONS,
  HEIGHT_OPTIONS,
  type ExpandDirection,
  INTERIOR_ACCESSORY_OPTIONS,
  MAX_CUSTOM_SIZE,
  MIN_CUSTOM_SIZE,
  WIDTH_OPTIONS,
  ACCESSORY_STATUS_META,
  buildBom,
  buildFrameTopology,
  evaluateFramePartRemoval,
  getFramePart,
  getFramePartConnections,
  applyFramePartRemoval,
  createKitchenIslandPreset,
  createPreset,
  createSquareCoffeeTablePreset,
  createSteppedPreset,
  deleteCell,
  evaluateCellFitting,
  evaluateCellFrontAccessory,
  evaluateCellKind,
  evaluateCellInteriorAccessory,
  expandCell,
  findNearestEnabled,
  fittingCompatible,
  formatRmb,
  getCellConfig,
  getPhysicalAccessoryMountSide,
  getEffectiveAccessoryColor,
  getEffectiveModuleColor,
  getEffectivePanelColor,
  getCellDepth,
  getDepthSegments,
  getDimensions,
  getEffectiveStructurePanelMaterial,
  getAvailableMovingAccessoryGroups,
  getMovingAccessorySummary,
  getSelectionDepthIndex,
  isCellEnabled,
  isDoorCellKind,
  normalizeConfig,
  resizeColumns,
  resizeDepthSegments,
  resizeRows,
  addCellInteriorAccessory,
  removeCellInteriorAccessory,
  clearColorOverride,
  cloneColumn,
  MAX_GRID_COUNT,
  setCellFitting,
  setCellFrontAccessory,
  setCellInteriorAccessoryPull,
  setCellKind,
  setGlassDoorHandleSide,
  setMetalShellFaceSide,
  setMovingAccessoryGroupOpen,
  setWholeCabinetColor,
  setPhysicalStructurePanel,
  setDrawerDoorSide,
  setDrawerPull,
  setDoorOpen,
  setDepth,
  setColorByScope,
  setSelectedCellDepth,
  setSelectedColumnWidth,
  setSelectedRowHeight,
  updateCellInteriorAccessory,
  type BomItem,
  type CabinetConfig,
  type AccessoryMountSide,
  type CellConfig,
  type CellFaceSide,
  type CellInteriorAccessoryKind,
  type CellKind,
  type CellFrontAccessoryKind,
  type FramePartKind,
  type GlassDoorHandleSide,
  type MovingAccessoryGroup,
  type Selection,
  type AccessoryEvaluation,
  type AccessoryStatus,
  type StructureImpact,
  type StructurePanelKey,
  type StructurePanelMaterial,
  type TabKey
} from "./model";

const STORAGE_KEY = "usm-local-builder-config";

interface SceneApi {
  capturePng: () => string;
  captureSnapshot: () => string;
  fitView: () => void;
}

const tabs: Array<{ id: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "structure", label: "\u7ed3\u6784", icon: Grid3X3 },
  { id: "frame", label: "\u6846\u67b6", icon: CircleDot },
  { id: "fittings", label: "\u914d\u4ef6", icon: Settings2 },
  { id: "colors", label: "\u989c\u8272", icon: PaintBucket },
  { id: "bom", label: "BOM", icon: ClipboardList }
];

const DROP_DOOR_MOUNT_SIDE_OPTIONS = ACCESSORY_MOUNT_SIDE_OPTIONS.filter(
  (option) => option.id === "front" || option.id === "back"
);
const HIDDEN_STRUCTURE_CELL_OPTION_IDS = new Set<CellKind>([
  "softPanelLow",
  "softPanelWide",
  "softPanelTall"
]);
const VISIBLE_CELL_OPTIONS = CELL_OPTIONS.filter((option) => !HIDDEN_STRUCTURE_CELL_OPTION_IDS.has(option.id));
const VISIBLE_INTERIOR_ACCESSORY_OPTIONS = INTERIOR_ACCESSORY_OPTIONS.filter((option) => option.id !== "displayTray");

const FRAME_PART_KIND_LABELS: Record<FramePartKind, string> = {
  vertex: "球节点",
  tube: "钢管",
  panel: "面板",
  support: "底部支撑"
};

const FRAME_PANEL_MATERIAL_OPTIONS: Array<{ id: Exclude<StructurePanelMaterial, "none">; label: string }> = [
  { id: "metal", label: "普通钣金" },
  { id: "perforated", label: "洞洞板" },
  { id: "glass", label: "玻璃" }
];

const GLASS_DOOR_HANDLE_OPTIONS: Array<{ id: GlassDoorHandleSide; label: string }> = [
  { id: "left", label: "左把手" },
  { id: "right", label: "右把手" }
];

interface FrameHistoryEntry { config: CabinetConfig; label: string; }

interface ReadonlyOrderSnapshot {
  orderId: string;
  orderNo: string;
  version: string;
}

type ReadonlyOrderState =
  | { status: "idle" }
  | { status: "loading"; orderId: string }
  | { status: "ready"; snapshot: ReadonlyOrderSnapshot }
  | { status: "error"; orderId: string; message: string };

export default function App() {
  const portalMode = window.location.pathname.startsWith("/portal/");
  const portalSlug = portalMode ? window.location.pathname.split("/")[2] || "" : "";
  const publicLanding = !portalMode && window.location.pathname === "/";
  const publicPortalSlug = new URLSearchParams(window.location.search).get("portal") || "portal-tenant-demo";
  const readonlyOrderId = getReadonlyOrderId();
  const resumeDraftId = getResumeDraftId();
  const isReadonlyOrder = Boolean(readonlyOrderId);
  const [config, setConfig] = useState<CabinetConfig>(() => publicLanding ? DEFAULT_CONFIG : loadConfig());
  const [selection, setSelection] = useState<Selection | null>(() => findNearestEnabled(publicLanding ? DEFAULT_CONFIG : loadConfig()));
  const [highlightColumn, setHighlightColumn] = useState<number | null>(null);
  const [selectedAccessory, setSelectedAccessory] = useState<SelectedAccessory>(null);
  const [selectedColorPanel, setSelectedColorPanel] = useState<{ cell: Selection; panel: StructurePanelKey } | null>(null);
  const [history, setHistory] = useState<FrameHistoryEntry[]>([]);
  const [selectedFramePartId, setSelectedFramePartId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("structure");
  const framePickEnabled = !isReadonlyOrder && tab === "frame";
  const panelPickEnabled = !isReadonlyOrder && tab === "colors" && config.colorScope === "panel";
  const sceneShowDimensions = (tab === "structure" || tab === "frame") && config.showDimensions;
  const [toast, setToast] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [frameDeleteConfirm, setFrameDeleteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [portalGateOpen, setPortalGateOpen] = useState(false);
  const [portalGateMode, setPortalGateMode] = useState<"signup" | "login">("signup");
  const [portalGateEmail, setPortalGateEmail] = useState("");
  const [portalGatePassword, setPortalGatePassword] = useState("");
  const [portalGateCode, setPortalGateCode] = useState("");
  const [publicPortalAuthenticated, setPublicPortalAuthenticated] = useState(false);
  const [publicPortalEnabled, setPublicPortalEnabled] = useState(false);
  const [publicPortalLoading, setPublicPortalLoading] = useState(publicLanding);
  const [portalGateError, setPortalGateError] = useState<string | null>(null);
  const publicPreviewMode = publicLanding && (publicPortalLoading || publicPortalEnabled);
  const [pricingState, setPricingState] = useState<PricingState>({ status: "loading" });
  const [salesMultiplierBasisPoints, setSalesMultiplierBasisPoints] = useState(15000);
  const [salesMultiplierSource, setSalesMultiplierSource] = useState<"user_default" | "system_default">("system_default");
  const handleSalesMultiplierChange = useCallback((value: number, source: "user_default" | "system_default" = "user_default") => {
    setSalesMultiplierBasisPoints(value);
    setSalesMultiplierSource(source);
  }, []);
  const [businessContext, setBusinessContext] = useState<BusinessContext>(() => businessGateway.getContext());
  const [inventoryState, setInventoryState] = useState<BusinessResult<InventoryAvailability[]>>({ status: "idle", source: businessGateway.getSource() });
  const [productionOrderState, setProductionOrderState] = useState<BusinessResult<ProductionOrderResult>>({ status: "idle", source: businessGateway.getSource() });
  const [readonlyOrder, setReadonlyOrder] = useState<ReadonlyOrderState>(() => readonlyOrderId
    ? { status: "loading", orderId: readonlyOrderId }
    : { status: "idle" });
  const businessExtensionsEnabled = Object.values(ERP_FEATURES).some(Boolean);
  const [portalModules, setPortalModules] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);
  const fitSceneView = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => sceneApiRef.current?.fitView());
    });
  }, []);

  const bom = useMemo(() => buildBom(config), [config]);
  const dimensions = useMemo(() => getDimensions(config), [config]);
  const activeSelection = useMemo(() => (selection ? findNearestEnabled(config, selection) : null), [config, selection]);
  const selectedFramePart = selectedFramePartId ? getFramePart(config, selectedFramePartId) : undefined;
  const selectedFrameImpact = selectedFramePartId ? evaluateFramePartRemoval(config, selectedFramePartId) : null;
  const selectedFramePanelMaterial = selectedFramePart?.kind === "panel" ? selectedFramePart.material : null;

  useEffect(() => {
    if (!portalMode) return;
    void fetch(`/api/portal/${encodeURIComponent(portalSlug)}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        setPortalModules(Array.isArray(payload?.portal?.visibleModules) ? payload.portal.visibleModules : []);
      });
  }, [portalMode, portalSlug]);

  useEffect(() => {
    if (!publicLanding) return;
    setPublicPortalLoading(true);
    void fetch(`/api/portal/${encodeURIComponent(publicPortalSlug)}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        setPublicPortalEnabled(Boolean(payload?.portal?.enabled));
        setPublicPortalAuthenticated(Boolean(payload?.authenticated));
      })
      .catch(() => {
        setPublicPortalEnabled(false);
        setPublicPortalAuthenticated(false);
      })
      .finally(() => setPublicPortalLoading(false));
  }, [publicLanding, publicPortalSlug]);

  useEffect(() => {
    if (selectedFramePartId && !getFramePart(config, selectedFramePartId)) setSelectedFramePartId(null);
  }, [config, selectedFramePartId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPresenting((active) => {
        setToast(active ? "已恢复选中框" : "已隐藏选中框，再按 Esc 恢复");
        return !active;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const framePanelReplacementOptions = selectedFramePanelMaterial
    ? FRAME_PANEL_MATERIAL_OPTIONS.filter((option) => option.id !== selectedFramePanelMaterial)
    : [];
  const selectedPanelForScene = panelPickEnabled
    ? selectedColorPanel
    : framePickEnabled && selectedFramePart?.kind === "panel"
      ? { cell: selectedFramePart.cell, panel: selectedFramePart.panel }
      : null;
  const selectedCell = getCellConfig(config, activeSelection) ?? config.cells[0]?.[0];
  const motionSummaries = useMemo(() => ({
    all: getMovingAccessorySummary(config, "all"),
    dropDoor: getMovingAccessorySummary(config, "dropDoor"),
    flipUpDoor: getMovingAccessorySummary(config, "flipUpDoor"),
    glassDoor: getMovingAccessorySummary(config, "glassDoor"),
    drawer: getMovingAccessorySummary(config, "drawer"),
    mobileTray: getMovingAccessorySummary(config, "mobileTray")
  }), [config]);
  const availableMotionGroups = useMemo(() => getAvailableMovingAccessoryGroups(config), [config]);

  const selectedAccessoryForScene = selectedAccessory;

  useEffect(() => {
    if (isReadonlyOrder) return;
    // iOS 私密浏览/存储配额满时 setItem 会抛异常，未捕获会导致整页崩溃
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* 存储不可用时仅跳过本地持久化 */
    }
    if (portalMode) {
      const timer = window.setTimeout(() => {
        const body = JSON.stringify({ id: `portal-${portalSlug}`, name: "C端模型", configSnapshot: config });
        void fetch(`/api/portal/${encodeURIComponent(portalSlug)}/drafts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body });
        void fetch(`/api/portal/${encodeURIComponent(portalSlug)}/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: `portal-${portalSlug}`, milestone: "config_changed", configSnapshot: config }) });
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [config, isReadonlyOrder, portalMode, portalSlug]);

  useEffect(() => {
    if (!portalMode) return;
    void fetch(`/api/portal/${encodeURIComponent(portalSlug)}/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: `portal-${portalSlug}`, milestone: "first_generated", configSnapshot: config }) });
  }, [portalMode, portalSlug]);

  useEffect(() => {
    if (!readonlyOrderId) return;
    let cancelled = false;
    setReadonlyOrder({ status: "loading", orderId: readonlyOrderId });
    void erpRequest<unknown>(`/api/orders/${encodeURIComponent(readonlyOrderId)}`)
      .then((payload) => {
        if (cancelled) return;
        const order = asRecord(unwrapItem<unknown>(payload));
        const orderSnapshot = asRecord(order.snapshot);
        const quote = asRecord(orderSnapshot.quote);
        const quoteSnapshot = asRecord(quote.snapshot);
        const designVersion = asRecord(quoteSnapshot.designVersion);
        const configSnapshot = asRecord(designVersion.configSnapshot);
        if (!Object.keys(configSnapshot).length) throw new Error("该订单没有可读取的冻结配置快照。");
        const nextConfig = normalizeConfig(configSnapshot as Partial<CabinetConfig>);
        setConfig(nextConfig);
        setSelection(findNearestEnabled(nextConfig));
        setHistory([]);
        setSelectedAccessory(null);
        setSelectedColorPanel(null);
        setSelectedFramePartId(null);
        setReadonlyOrder({
          status: "ready",
          snapshot: {
            orderId: readonlyOrderId,
            orderNo: stringValue(order.code) ?? stringValue(order.orderNo) ?? readonlyOrderId,
            version: String(designVersion.version ?? orderSnapshot.schemaVersion ?? "-")
          }
        });
        fitSceneView();
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ErpApiError && error.status === 401) {
          window.location.assign(getErpLoginUrl(window.location.href));
          return;
        }
        setReadonlyOrder({
          status: "error",
          orderId: readonlyOrderId,
          message: error instanceof Error ? error.message : "订单配置加载失败。"
        });
      });
    return () => { cancelled = true; };
  }, [fitSceneView, readonlyOrderId]);

  useEffect(() => {
    if (isReadonlyOrder && readonlyOrder.status !== "ready") return;
    if (portalMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPricingState({ status: "loading" });
      void calculateConfigurationPrice(config, isReadonlyOrder ? undefined : salesMultiplierBasisPoints, controller.signal)
        .then((calculation) => {
          if (controller.signal.aborted) return;
          if (calculation.status === "priced") setPricingState({ status: "priced", data: calculation });
          else setPricingState({
            status: "pending",
            data: calculation,
            message: calculation.unmatched.length
              ? `还有 ${calculation.unmatched.length} 项零件未定价`
              : "当前没有可用的已发布价格表"
          });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setPricingState({
            status: "error",
            message: error instanceof Error ? error.message : "价格服务暂时不可用"
          });
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [config, isReadonlyOrder, portalMode, readonlyOrder.status, salesMultiplierBasisPoints]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (selectedAccessory && !selectedAccessoryForScene) setSelectedAccessory(null);
  }, [selectedAccessory, selectedAccessoryForScene]);

  useEffect(() => {
    if (!panelPickEnabled) setSelectedColorPanel(null);
  }, [panelPickEnabled]);

  const updateConfig = useCallback((next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig), remember = true) => {
    if (isReadonlyOrder) return;
    if (publicPreviewMode && !publicPortalAuthenticated) {
      setPortalGateError(null);
      setPortalGateOpen(true);
      return;
    }
    setHighlightColumn(null);
    setConfig((current) => {
      const resolved = normalizeConfig(typeof next === "function" ? next(current) : next);
      if (remember && JSON.stringify(resolved) !== JSON.stringify(current)) {
        setHistory((items) => [...items.slice(-24), { config: current, label: "config change" }]);
      }
      return resolved;
    });
  }, [isReadonlyOrder, publicPreviewMode, publicPortalAuthenticated]);

  const handleDrawerPull = useCallback((target: Selection, value: number, remember = true, interiorAccessoryId?: string) => {
    updateConfig((current) => (
      interiorAccessoryId
        ? setCellInteriorAccessoryPull(current, target, interiorAccessoryId, value)
        : setDrawerPull(current, target, value)
    ), remember);
    if (interiorAccessoryId) {
      const bounded = {
        row: Math.max(0, Math.min(target.row, config.rowHeights.length - 1)),
        column: Math.max(0, Math.min(target.column, config.columnWidths.length - 1)),
        depthIndex: Math.max(0, Math.min(target.depthIndex ?? 0, getDepthSegments(config).length - 1))
      };
      window.setTimeout(() => {
        const active = findNearestEnabled(config, bounded);
        setSelection(active);
        setSelectedAccessory({ cell: active, accessoryId: interiorAccessoryId });
      }, 120);
    }
  }, [config, updateConfig]);

  const handleDoorOpen = useCallback((target: Selection, value: number, remember = true) => {
    updateConfig((current) => setDoorOpen(current, target, value), remember);
  }, [updateConfig]);

  const selectCell = useCallback((next: Selection | null) => {
    setSelectedAccessory(null);
    setHighlightColumn(null);
    if (!next) {
      if (tab === "structure") setSelection(null);
      return;
    }
    setPresenting(false);
    const bounded = {
      row: Math.max(0, Math.min(next.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(next.column, config.columnWidths.length - 1)),
      depthIndex: Math.max(0, Math.min(next.depthIndex ?? 0, getDepthSegments(config).length - 1))
    };
    setSelection(findNearestEnabled(config, bounded));
  }, [config, tab]);

  const selectAccessory = useCallback((target: Selection, accessoryId: string) => {
    const bounded = {
      row: Math.max(0, Math.min(target.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(target.column, config.columnWidths.length - 1)),
      depthIndex: Math.max(0, Math.min(target.depthIndex ?? 0, getDepthSegments(config).length - 1))
    };
    const active = findNearestEnabled(config, bounded);
    setSelection(active);
    setSelectedAccessory({ cell: active, accessoryId });
  }, [config]);

  const selectColorPanel = useCallback((target: Selection, panel: StructurePanelKey) => {
    const bounded = {
      row: Math.max(0, Math.min(target.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(target.column, config.columnWidths.length - 1)),
      depthIndex: Math.max(0, Math.min(target.depthIndex ?? 0, getDepthSegments(config).length - 1))
    };
    const active = findNearestEnabled(config, bounded);
    setSelection(active);
    setSelectedAccessory(null);
    setSelectedColorPanel({ cell: active, panel });
  }, [config]);

  const changeColorScope = useCallback((scope: CabinetConfig["colorScope"]) => {
    updateConfig((current) => scope === "all"
      ? { ...setWholeCabinetColor(current, current.panelColor), colorScope: "all" }
      : { ...current, colorScope: scope });
    if (scope !== "panel") setSelectedColorPanel(null);
    if (scope !== "accessory") setSelectedAccessory(null);
  }, [updateConfig]);

  function handleRows(delta: number) {
    updateConfig((current) => {
      const next = resizeRows(current, current.rowHeights.length + delta);
      setSelection((active) => (active ? findNearestEnabled(next, active) : null));
      return next;
    });
  }

  function handleColumns(delta: number) {
    updateConfig((current) => {
      const next = resizeColumns(current, current.columnWidths.length + delta);
      setSelection((active) => (active ? findNearestEnabled(next, active) : null));
      return next;
    });
  }

  function expandSelected(direction: ExpandDirection) {
    if (!activeSelection) return;
    updateConfig((current) => {
      const next = expandCell(current, activeSelection, direction);
      setSelection(next.selection);
      return next.config;
    });
  }

  function cloneSelectedColumn(side: "left" | "right" = "right") {
    if (!activeSelection) return;
    updateConfig((current) => {
      const insertAt = side === "left" ? activeSelection.column : activeSelection.column + 1;
      const next = cloneColumn(current, activeSelection.column, insertAt);
      setSelection({ row: activeSelection.row, column: next.column, depthIndex: activeSelection.depthIndex });
      setHighlightColumn(next.column);
      return next.config;
    });
  }

  function deleteSelected() {
    if (!activeSelection) {
      setToast("请先选中模块");
      return;
    }
    updateConfig((current) => {
      const next = deleteCell(current, activeSelection);
      setSelection(findNearestEnabled(next, activeSelection));
      return next;
    });
    setToast("模块已删除");
  }

  function undoLast() {
    setHistory((items) => {
      const previous = items[items.length - 1];
      if (!previous) {
        setToast("没有可撤销操作");
        return items;
      }
      setConfig(previous.config);
      setSelection(findNearestEnabled(previous.config, selection ?? { row: 0, column: 0 }));
      setHighlightColumn(null);
      setToast("已撤销");
      return items.slice(0, -1);
    });
  }

  function selectFramePart(partId: string) {
    setSelectedAccessory(null);
    const part = getFramePart(config, partId);
    if (!part) {
      setSelectedFramePartId(null);
      return;
    }
    setSelectedFramePartId(partId);
    if (part?.kind === "panel") setSelection(part.cell);
  }

  function deleteSelectedFramePart() {
    if (!selectedFramePartId || !selectedFrameImpact) {
      setToast("请先选择框架零件");
      return;
    }
    const part = selectedFramePart;
    const message = `确定删除“${part?.label ?? "当前零件"}”吗？同时会移除 ${selectedFrameImpact.removedTubes.length} 根钢管、${selectedFrameImpact.removedVertices.length} 个球节点、${selectedFrameImpact.removedPanels.length} 块面板和 ${selectedFrameImpact.removedSupports.length} 个底部支撑。柜体外尺寸保持不变。`;
    // iOS Safari（含主屏幕独立窗口）会拦截/抑制原生 confirm，必须用应用内弹窗
    setFrameDeleteConfirm({
      message,
      onConfirm: () => {
        updateConfig((current) => applyFramePartRemoval(current, selectedFrameImpact));
        setSelectedFramePartId(null);
        setToast("已完成框架级联删除");
      }
    });
  }

  function replaceSelectedFramePanelMaterial(material: Exclude<StructurePanelMaterial, "none">) {
    if (selectedFramePart?.kind !== "panel") {
      setToast("请先在 3D 中选择一块面板");
      return;
    }
    updateConfig((current) => setPhysicalStructurePanel(current, selectedFramePart.cell, selectedFramePart.panel, material));
    const label = FRAME_PANEL_MATERIAL_OPTIONS.find((option) => option.id === material)?.label ?? "面板";
    setToast(`已更换为${label}`);
  }

  function toggleMovingAccessoryGroup(group: MovingAccessoryGroup) {
    const summary = motionSummaries[group];
    if (!summary.total) return;
    const shouldOpen = summary.open !== summary.total;
    updateConfig((current) => setMovingAccessoryGroupOpen(current, group, shouldOpen));
    setToast(shouldOpen ? "已批量打开" : "已批量关闭");
  }

  function applyPreset(columns: number, rows: number, kind: CellKind = "metalBackModule") {
    applyConfigPreset(createPreset(columns, rows, kind));
  }

  function applyConfigPreset(next: CabinetConfig) {
    updateConfig(next);
    setSelection(findNearestEnabled(next));
    setSelectedAccessory(null);
    setSelectedColorPanel(null);
    setSelectedFramePartId(null);
    fitSceneView();
  }

  function exportJson() {
    if (portalMode) void fetch(`/api/portal/${encodeURIComponent(portalSlug)}/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: `portal-${portalSlug}`, milestone: "exported", configSnapshot: config }) });
    downloadFile("usm-config.json", JSON.stringify(config, null, 2), "application/json");
    setToast("配置已导出");
  }

  function exportBom() {
    if (portalMode) { setToast("C端不提供企业BOM与价格导出"); return; }
    const serverLines = pricingState.status === "priced" ? pricingState.data.lines : [];
    const exportMultiplier = pricingState.status === "priced" && !pricingState.data.dealer
      ? pricingState.data.salesMultiplierBasisPoints ?? 15000
      : null;
    const byKey = new Map(serverLines.map((line) => [pricingLineKey(line.materialKey, line.specKey), line]));
    const lines = [
      ["分类", "物料编码", "规格编码", "名称", "规格", "数量", "单位", "1.0 基准单价（不含运费、包装）", "1.0 基准小计", "定价状态"],
      ...bom.map((item) => {
        const priced = byKey.get(pricingLineKey(item.materialKey, item.specKey));
        return [
        bomCategoryLabel(item.category),
        item.materialKey,
        item.specKey,
        item.name,
        item.spec,
        String(item.qty),
        item.unit,
        priced ? String((exportMultiplier ? multipliedMinor(priced.unitPriceMinor, exportMultiplier) : priced.unitPriceMinor) / 100) : "",
        priced ? String((exportMultiplier ? multipliedMinor(priced.lineTotalMinor, exportMultiplier) : priced.lineTotalMinor) / 100) : "",
        priced ? pricingStatusLabel(priced.pricingStatus) : "价格待确认"
      ]; })
    ];
    downloadFile("usm-bom.csv", lines.map((line) => line.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
    setToast("BOM 已导出");
  }

  function exportAccessoryRequirements() {
    if (portalMode) { setToast("C端不提供企业内部配件清单"); return; }
    const payload = {
      generatedAt: new Date().toISOString(),
      purpose: "USM 4.0 本地化搭建配件需求清单",
      categories: ACCESSORY_CATEGORIES,
      accessories: ACCESSORY_REQUIREMENTS
    };
    downloadFile("usm-accessory-requirements.json", JSON.stringify(payload, null, 2), "application/json");
    setToast("配件需求清单已导出");
  }

  async function refreshInventory() {
    setInventoryState({ status: "loading", source: businessGateway.getSource() });
    setInventoryState(await businessGateway.resolveInventory(bom, businessContext));
  }

  async function createProductionOrder() {
    setProductionOrderState({ status: "loading", source: businessGateway.getSource() });
    const materials = await businessGateway.resolveMaterials(bom);
    if (!materials.data) {
      setProductionOrderState({
        status: materials.status,
        source: materials.source,
        message: materials.message,
        updatedAt: materials.updatedAt
      });
      return;
    }
    const result = await businessGateway.createProductionOrder({
      clientRequestId: createBusinessRequestId("production"),
      warehouseId: businessContext.warehouseId,
      configVersion: "4.22.0",
      configSnapshot: config,
      bomSnapshot: bom,
      requirements: materials.data
    }, businessContext);
    setProductionOrderState(result);
  }

  function changeBusinessWarehouse(warehouseId: string) {
    const nextContext = businessGateway.setWarehouse(warehouseId);
    setBusinessContext(nextContext);
    setInventoryState({ status: "idle", source: businessGateway.getSource() });
  }

  function exportImage() {
    const api = sceneApiRef.current;
    if (!api) return;
    if (portalMode) void fetch(`/api/portal/${encodeURIComponent(portalSlug)}/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: `portal-${portalSlug}`, milestone: "exported", configSnapshot: config }) });
    const wasPresenting = presenting;
    setPresenting(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          const data = api.capturePng();
          if (!data) return;
          const link = document.createElement("a");
          link.download = "usm-3d-preview.png";
          link.href = data;
          link.click();
          setToast("图片已导出");
        } finally {
          setPresenting(wasPresenting);
        }
      }, 90);
    }));
  }

  function togglePresenting() {
    setPresenting((active) => {
      setToast(active ? "已恢复选中框" : "已隐藏选中框，点击模块恢复");
      return !active;
    });
  }

  function importJson(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = normalizeConfig(JSON.parse(String(reader.result)));
        updateConfig(next);
        setSelection(findNearestEnabled(next));
        fitSceneView();
        setToast("配置已导入");
      } catch {
        setToast("导入失败");
      }
    };
    reader.readAsText(file);
  }

  function resetConfig() {
    updateConfig(DEFAULT_CONFIG);
    setSelection({ row: 0, column: 0, depthIndex: 0 });
    fitSceneView();
    setToast("已重置");
  }

  async function submitPortalGate(event: React.FormEvent) {
    event.preventDefault();
    setPortalGateError(null);
    const mode = portalGateMode;
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(publicPortalSlug)}/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup"
          ? { email: portalGateEmail, password: portalGatePassword, supportCode: portalGateCode }
          : { email: portalGateEmail, password: portalGatePassword })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "认证失败");
      setPublicPortalAuthenticated(true);
      setPortalGateOpen(false);
      setToast("账号已验证，已解锁模块操作");
    } catch (reason) {
      setPortalGateError(reason instanceof Error ? reason.message : "认证失败");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <CircleDot size={20} />
          </div>
          <div>
            <h1>{isReadonlyOrder ? "USM 订单配置查看器" : "USM 产品设计器"}</h1>
            <p>{readonlyOrder.status === "ready"
              ? `${readonlyOrder.snapshot.orderNo} · 配置 v${readonlyOrder.snapshot.version}`
              : isReadonlyOrder
                ? "订单冻结配置"
                : `${dimensions.outerWidth} x ${dimensions.outerHeight} x ${dimensions.outerDepth} mm`}</p>
          </div>
        </div>

        <div className="top-actions">
          {isReadonlyOrder ? <>
            <span className="readonly-badge"><Eye size={15} />只读</span>
            <a className="readonly-return" href={getErpAppUrl(`/orders/${readonlyOrderId}/configuration`)}><ArrowLeft size={15} />返回订单</a>
            {readonlyOrder.status === "ready" ? <>
              <IconButton label="导出图片" onClick={exportImage} icon={Camera} />
              <IconButton label="视角回位" onClick={fitSceneView} icon={Focus} />
              <IconButton label={presenting ? "显示选中框" : "隐藏选中框（截图用）"} onClick={togglePresenting} icon={presenting ? Eye : EyeOff} />
            </> : null}
          </> : <>
          {!portalMode && !publicPreviewMode && <PriceBadge state={pricingState} />}
          {!portalMode && !publicPreviewMode && <DesignerErpPanel
            config={config}
            bom={bom}
            pricingSnapshot={{
              authority: "server",
              status: pricingState.status,
              priceList: pricingState.status === "priced" ? pricingState.data.priceList : null,
              retailTotalMinor: pricingState.status === "priced" ? pricingState.data.retailTotalMinor : null,
              salesMultiplierBasisPoints: pricingState.status === "priced" ? pricingState.data.salesMultiplierBasisPoints : salesMultiplierBasisPoints,
              multiplierQuoteTotalMinor: pricingState.status === "priced" ? pricingState.data.multiplierQuoteTotalMinor : null,
              dealer: pricingState.status === "priced" ? pricingState.data.dealer : null,
              lines: pricingState.status === "priced" ? pricingState.data.lines : [],
              unmatched: pricingState.status === "pending" ? pricingState.data.unmatched : []
            }}
            dimensions={dimensions}
            salesMultiplierBasisPoints={salesMultiplierBasisPoints}
            salesMultiplierSource={salesMultiplierSource}
            onSalesMultiplierChange={handleSalesMultiplierChange}
            getPreviewDataUrl={() => sceneApiRef.current?.captureSnapshot()}
            onApplyConfig={applyConfigPreset}
            onNotice={setToast}
            resumeDraftId={resumeDraftId}
          />}
          <IconButton label="导出图片" onClick={exportImage} icon={Camera} />
          <IconButton label="视角回位" onClick={fitSceneView} icon={Focus} />
          <IconButton label={presenting ? "显示选中框" : "隐藏选中框（截图用）"} onClick={togglePresenting} icon={presenting ? Eye : EyeOff} />
          <IconButton label="重置" onClick={resetConfig} icon={RotateCcw} />
          </>}
        </div>
      </header>

      {readonlyOrder.status === "loading" ? <div className="readonly-status"><Eye size={20} /><strong>正在读取订单冻结配置</strong><span>请稍候</span></div> : null}
      {readonlyOrder.status === "error" ? <div className="readonly-status error"><strong>订单配置无法打开</strong><span>{readonlyOrder.message}</span><a href={getErpAppUrl(`/orders/${readonlyOrder.orderId}/configuration`)}>返回 ERP 订单</a></div> : null}

      {!isReadonlyOrder || readonlyOrder.status === "ready" ? <main className={`workspace ${isReadonlyOrder ? "readonly-workspace" : ""}`}>
        {isReadonlyOrder ? null : <>
        <aside className="control-panel">
          <nav className="tabs" aria-label="配置分类">
            {tabs.filter((item) => !(portalMode || publicPreviewMode) || item.id !== "bom").map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={tab === item.id ? "tab active" : "tab"} onClick={() => {
                  if (publicPreviewMode && !publicPortalAuthenticated && item.id !== "structure") {
                    setPortalGateError(null);
                    setPortalGateOpen(true);
                    return;
                  }
                  setTab(item.id);
                }} type="button">
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="panel-content">
            {tab === "structure" ? (
              <StructureTab
                config={config}
                selection={activeSelection}
                selectedKind={selectedCell?.kind ?? "open"}
                selectedFaceSide={selectedCell?.faceSide ?? "front"}
                onDepth={(depth) => updateConfig((current) => setDepth(current, depth))}
                onDepthSegments={(count) => updateConfig((current) => resizeDepthSegments(current, count))}
                onCellDepth={(depth) => activeSelection ? updateConfig((current) => setSelectedCellDepth(current, activeSelection, depth)) : undefined}
                onWidth={(width) => activeSelection ? updateConfig((current) => setSelectedColumnWidth(current, activeSelection, width)) : undefined}
                onHeight={(height) => activeSelection ? updateConfig((current) => setSelectedRowHeight(current, activeSelection, height)) : undefined}
                onRows={handleRows}
                onColumns={handleColumns}
                onCellKind={(kind) => activeSelection ? updateConfig((current) => setCellKind(current, activeSelection, kind)) : undefined}
                onMetalShellFaceSide={(faceSide) => activeSelection ? updateConfig((current) => setMetalShellFaceSide(current, activeSelection, faceSide)) : undefined}
                onStructureMode={() => undefined}
                onPreset={applyPreset}
                onConfigPreset={applyConfigPreset}
                onShowDimensions={(showDimensions) => updateConfig((current) => ({ ...current, showDimensions }))}
              />
            ) : null}


            {tab === "frame" ? (
              <div className="tab-stack frame-tab">
                <OptionGroup label="当前零件">
                  <div className="frame-summary-grid">
                    <div><span>当前选择</span><strong>{selectedFramePart?.label ?? "未选中"}</strong></div>
                    <div><span>零件类型</span><strong>{selectedFramePart ? FRAME_PART_KIND_LABELS[selectedFramePart.kind] : "-"}</strong></div>
                    <div><span>关联零件</span><strong>{selectedFramePartId ? getFramePartConnections(config, selectedFramePartId).length : 0}</strong></div>
                    <div><span>已删除总数</span><strong>{Object.values(config.framePartOverrides ?? {}).filter((item) => item.deleted).length}</strong></div>
                  </div>
                    <p className="helper-text">在 3D 中直接点击球节点、钢管、面板或脚垫。</p>
                </OptionGroup>
                {selectedFrameImpact ? (
                  <OptionGroup label="删除影响">
                    <div className="frame-impact-summary">
                      <span>钢管： {selectedFrameImpact.removedTubes.length}</span>
                      <span>球节点： {selectedFrameImpact.removedVertices.length}</span>
                      <span>面板： {selectedFrameImpact.removedPanels.length}</span>
                      <span>底座： {selectedFrameImpact.removedSupports.length}</span>
                    </div>
                    <p className="helper-text">预计减少 {formatRmb(selectedFrameImpact.priceDelta)}。柜体外尺寸和木箱尺寸保持不变。</p>
                  </OptionGroup>
                ) : null}
                <button type="button" className="ghost-button danger" onClick={deleteSelectedFramePart} disabled={!selectedFramePartId}><Eraser size={16} /> 删除当前零件</button>
                {selectedFramePart?.kind === "panel" ? (
                  <OptionGroup label="更换材质">
                    <p className="helper-text">当前材质：{FRAME_PANEL_MATERIAL_OPTIONS.find((option) => option.id === selectedFramePanelMaterial)?.label ?? "面板"}</p>
                    <div className="choice-row two frame-panel-material-options">
                      {framePanelReplacementOptions.map((option) => (
                        <ToggleButton
                          key={option.id}
                          active={false}
                          onClick={() => replaceSelectedFramePanelMaterial(option.id)}
                          label={option.label}
                        />
                      ))}
                    </div>
                  </OptionGroup>
                ) : null}
              </div>
            ) : null}

            {tab === "fittings" ? <FittingsTab config={config} selection={activeSelection} selectedCell={selectedCell} onChange={updateConfig} /> : null}
            {tab === "colors" ? (
              <ColorsTab
                config={config}
                selection={activeSelection}
                selectedAccessory={selectedAccessory}
                selectedPanel={selectedColorPanel}
                onScopeChange={changeColorScope}
                onSelectAccessory={selectAccessory}
                onChange={updateConfig}
              />
            ) : null}
            {tab === "bom" ? (
              <BomTab
                bom={bom}
                pricingState={pricingState}
                onExport={exportBom}
                businessExtension={businessExtensionsEnabled ? (
                  <ErpBomExtension
                    context={businessContext}
                    inventoryState={inventoryState}
                    productionOrderState={productionOrderState}
                    onWarehouseChange={changeBusinessWarehouse}
                    onRefreshInventory={refreshInventory}
                    onCreateProductionOrder={createProductionOrder}
                  />
                ) : null}
              />
            ) : null}
          </div>

          <footer className="panel-footer">
            <div>
              <span>选中单元</span>
              <strong>{activeSelection ? `${activeSelection.column + 1} 列 / ${getSelectionDepthIndex(config, activeSelection) + 1} 深度 / ${activeSelection.row + 1} 层` : "未选中"}</strong>
            </div>
            <div>
              <span>内部尺寸</span>
              <strong>{dimensions.innerWidth} x {dimensions.innerHeight} x {dimensions.innerDepth} mm</strong>
            </div>
          </footer>
        </aside>
        </>}

        <section className="scene-wrap" aria-label="3D 预览">
          <BuilderScene
            config={config}
            showDimensions={sceneShowDimensions}
            structureEditEnabled={!isReadonlyOrder && tab === "structure"}
            selection={presenting ? null : activeSelection}
            selectedPanel={selectedPanelForScene}
            panelPickEnabled={panelPickEnabled}
            framePickEnabled={framePickEnabled}
            selectedFramePartId={selectedFramePartId}
            highlightColumn={highlightColumn}
            canCloneColumn={config.columnWidths.length < MAX_GRID_COUNT}
            onSelectPanel={(target, panel) => {
              if (panelPickEnabled) selectColorPanel(target, panel);
              else if (framePickEnabled) selectFramePart(`panel:${target.row}:${target.depthIndex ?? 0}:${target.column}:${panel}`);
            }}
            onSelectFramePart={selectFramePart}
            selectedAccessory={selectedAccessoryForScene}
            onSelect={selectCell}
            onSelectAccessory={selectAccessory}
            onExpand={expandSelected}
            onCloneColumn={cloneSelectedColumn}
            onDrawerPull={isReadonlyOrder ? () => undefined : handleDrawerPull}
            onDoorOpen={isReadonlyOrder ? () => undefined : handleDoorOpen}
            onReady={(api) => {
              sceneApiRef.current = api;
            }}
          />
          {!isReadonlyOrder && activeSelection && !presenting ? (
            <div className="context-toolbar">
              <button type="button" className="ghost-button" onClick={undoLast}>
                <CornerUpLeft size={16} /> 撤销
              </button>
              <button type="button" className="ghost-button danger" onClick={deleteSelected}>
                <Eraser size={16} /> 删除
              </button>
            </div>
          ) : null}
          {!isReadonlyOrder ? <div className="motion-toolbar" aria-label="活动件批量控制">
            <MotionToggleButton primary summary={motionSummaries.all} label="全部活动件" openLabel="全部打开" closeLabel="全部关闭" icon={ChevronsLeftRight} onClick={() => toggleMovingAccessoryGroup("all")} />
            {availableMotionGroups.includes("dropDoor") ? (
              <MotionToggleButton summary={motionSummaries.dropDoor} label="下翻门" openLabel="打开下翻门" closeLabel="关闭下翻门" icon={PanelBottomOpen} onClick={() => toggleMovingAccessoryGroup("dropDoor")} />
            ) : null}
            {availableMotionGroups.includes("flipUpDoor") ? (
              <MotionToggleButton summary={motionSummaries.flipUpDoor} label="上翻门" openLabel="打开上翻门" closeLabel="关闭上翻门" icon={PanelBottomOpen} onClick={() => toggleMovingAccessoryGroup("flipUpDoor")} />
            ) : null}
            {availableMotionGroups.includes("glassDoor") ? (
              <MotionToggleButton summary={motionSummaries.glassDoor} label="玻璃门" openLabel="打开玻璃门" closeLabel="关闭玻璃门" icon={PanelBottomOpen} onClick={() => toggleMovingAccessoryGroup("glassDoor")} />
            ) : null}
            {availableMotionGroups.includes("drawer") ? (
              <MotionToggleButton summary={motionSummaries.drawer} label="抽屉" openLabel="打开抽屉" closeLabel="关闭抽屉" icon={Archive} onClick={() => toggleMovingAccessoryGroup("drawer")} />
            ) : null}
            {availableMotionGroups.includes("mobileTray") ? (
              <MotionToggleButton summary={motionSummaries.mobileTray} label="移动托盘" openLabel="拖出托盘" closeLabel="收回托盘" icon={MoveHorizontal} onClick={() => toggleMovingAccessoryGroup("mobileTray")} />
            ) : null}
          </div> : null}
          {isReadonlyOrder && readonlyOrder.status === "ready" ? <div className="readonly-scene-note"><Eye size={15} /><span>订单冻结配置 · 可旋转、缩放查看</span></div> : null}
          {!isReadonlyOrder ? <div className="bottom-toolbar">
            <IconButton label="设置" onClick={() => setTab("fittings")} icon={Settings2} />
            <IconButton label={presenting ? "显示选中框" : "隐藏选中框（截图用）"} onClick={togglePresenting} icon={presenting ? Eye : EyeOff} />
            <IconButton label="载图" onClick={exportImage} icon={Camera} />
            <IconButton label="撤销" onClick={undoLast} icon={CornerUpLeft} />
            <IconButton label="删除" onClick={deleteSelected} icon={Eraser} />
            <IconButton label="重置" onClick={resetConfig} icon={RotateCcw} />
          </div> : null}
        </section>
      </main> : null}

      {publicPreviewMode ? (
        <div className="public-preview-banner">
          <span><strong>基础一格预览</strong> · 先看真实 3D 效果，新增模块和其它功能需注册</span>
          <button type="button" onClick={() => { setPortalGateError(null); setPortalGateOpen(true); }}>注册解锁</button>
        </div>
      ) : null}
      {portalGateOpen ? (
        <div className="portal-gate-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPortalGateOpen(false); }}>
          <form className="portal-gate-modal" onSubmit={submitPortalGate}>
            <button type="button" className="portal-gate-close" aria-label="关闭" onClick={() => setPortalGateOpen(false)}>×</button>
            <p className="portal-gate-eyebrow">企业模块化配置</p>
            <h2>{portalGateMode === "signup" ? "注册后继续搭建" : "登录后继续搭建"}</h2>
            <p className="portal-gate-copy">基础一格可以直接预览。注册后可新增层板、抽屉、门板和玻璃模块，并保存模型。</p>
            <input value={portalGateEmail} onChange={(event) => setPortalGateEmail(event.target.value)} type="email" placeholder="邮箱" required />
            <input value={portalGatePassword} onChange={(event) => setPortalGatePassword(event.target.value)} type="password" placeholder="密码（至少6位）" minLength={6} required />
            {portalGateMode === "signup" ? <input value={portalGateCode} onChange={(event) => setPortalGateCode(event.target.value)} placeholder="企业客服验证码" required /> : null}
            {portalGateError ? <div className="portal-gate-error">{portalGateError}</div> : null}
            <button className="portal-gate-submit" type="submit">{portalGateMode === "signup" ? "注册并开始" : "登录并继续"}</button>
            <button className="portal-gate-switch" type="button" onClick={() => { setPortalGateError(null); setPortalGateMode(portalGateMode === "signup" ? "login" : "signup"); }}>{portalGateMode === "signup" ? "已有账号，去登录" : "没有账号，去注册"}</button>
          </form>
        </div>
      ) : null}
      {frameDeleteConfirm ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setFrameDeleteConfirm(null); }}>
          <div className="app-confirm-modal" role="alertdialog" aria-modal="true" aria-label="删除确认">
            <p className="app-confirm-title">删除确认</p>
            <p className="app-confirm-message">{frameDeleteConfirm.message}</p>
            <div className="app-confirm-actions">
              <button type="button" onClick={() => setFrameDeleteConfirm(null)}>取消</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const onConfirm = frameDeleteConfirm.onConfirm;
                  setFrameDeleteConfirm(null);
                  onConfirm();
                }}
              >确认删除</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function MotionToggleButton({
  primary = false,
  summary,
  label,
  openLabel,
  closeLabel,
  icon: Icon,
  onClick
}: {
  primary?: boolean;
  summary: { total: number; open: number };
  label: string;
  openLabel: string;
  closeLabel: string;
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
}) {
  const allOpen = summary.total > 0 && summary.open === summary.total;
  const actionLabel = allOpen ? closeLabel : openLabel;
  return (
    <button
      type="button"
      className={["motion-toggle-button", primary ? "is-primary" : "", summary.total ? "" : "is-disabled"].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={!summary.total}
      aria-pressed={allOpen}
      title={summary.total ? label + " · " + summary.total + " " + (allOpen ? "个待关闭" : "个待打开") : "当前没有可批量开合配件"}
    >
      <Icon size={16} />
      <span>{actionLabel}</span>
    </button>
  );
}

function StructureTab({
  config,
  selection,
  selectedKind,
  selectedFaceSide,
  onDepth,
  onDepthSegments,
  onCellDepth,
  onWidth,
  onHeight,
  onRows,
  onColumns,
  onCellKind,
  onMetalShellFaceSide,
  onStructureMode,
  onPreset,
  onConfigPreset,
  onShowDimensions
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedKind: CellKind;
  selectedFaceSide: CellFaceSide;
  onDepth: (depth: number) => void;
  onDepthSegments: (count: number) => void;
  onCellDepth: (depth: number) => void;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onRows: (delta: number) => void;
  onColumns: (delta: number) => void;
  onCellKind: (kind: CellKind) => void;
  onMetalShellFaceSide: (faceSide: CellFaceSide) => void;
  onStructureMode: (mode: CabinetConfig["structureMode"]) => void;
  onPreset: (columns: number, rows: number, kind?: CellKind) => void;
  onConfigPreset: (config: CabinetConfig) => void;
  onShowDimensions: (showDimensions: boolean) => void;
}) {
  const selectedColumn = selection?.column ?? 0;
  const selectedRow = selection?.row ?? 0;
  const depthSegments = getDepthSegments(config);
  const selectedDepthIndex = selection ? getSelectionDepthIndex(config, selection) : 0;
  const selectedDepth = selection ? getCellDepth(config, selection.row, selection.column, selectedDepthIndex) : depthSegments[0] ?? config.depth;
  const selectedKindInStructureOptions = CELL_OPTIONS.some((option) => option.id === selectedKind);
  const selectedEvaluation = evaluateCellKind(config, selection, selectedKindInStructureOptions ? selectedKind : "open");
  const displayedSelectedEvaluation = selectedKind === "metalBackModule" && selectedFaceSide === "back"
    ? { ...selectedEvaluation, label: "含金属前板模块" }
    : selectedEvaluation;
  return (
    <div className="tab-stack">
      <OptionGroup label="全柜默认深度 mm">
        <SizePicker values={DEPTH_OPTIONS} active={config.depth} onChange={onDepth} />
      </OptionGroup>

      <div className="stepper-grid">
        <Stepper label="深度段数" value={depthSegments.length} onMinus={() => onDepthSegments(depthSegments.length - 1)} onPlus={() => onDepthSegments(depthSegments.length + 1)} />
      </div>

      <OptionGroup label={selection ? `选中格深度 mm${selectedDepth === config.depth ? "（继承默认）" : ""}` : "选中格深度 mm"}>
        <SizePicker values={DEPTH_OPTIONS} active={selectedDepth} onChange={onCellDepth} disabled={!selection} />
      </OptionGroup>

      <OptionGroup label={selection ? `第 ${selectedColumn + 1} 列宽度 mm` : "列宽度 mm"}>
        <SizePicker values={WIDTH_OPTIONS} active={config.columnWidths[selectedColumn]} onChange={onWidth} disabled={!selection} />
      </OptionGroup>

      <OptionGroup label={selection ? `第 ${selectedRow + 1} 层高度 mm` : "层高度 mm"}>
        <SizePicker values={HEIGHT_OPTIONS} active={config.rowHeights[selectedRow]} onChange={onHeight} compact disabled={!selection} />
      </OptionGroup>

      <div className="stepper-grid">
        <Stepper label="列数" value={config.columnWidths.length} onMinus={() => onColumns(-1)} onPlus={() => onColumns(1)} />
        <Stepper label="层数" value={config.rowHeights.length} onMinus={() => onRows(-1)} onPlus={() => onRows(1)} />
      </div>



      <OptionGroup label="模块类型">
        <div className="cell-kind-grid icon-mode">
          {VISIBLE_CELL_OPTIONS.map((option) => {
            const evaluation = evaluateCellKind(config, selection, option.id);
            const blocked = evaluation.status === "blocked";
            const active = selectedKind === option.id && (option.id !== "metalBackModule" || selectedFaceSide !== "back");
            return (
              <button
                key={option.id}
                className={["kind-button", active ? "active" : "", statusClass(evaluation.status)].filter(Boolean).join(" ")}
                type="button"
                title={evaluationTitle(evaluation)}
                disabled={!selection || blocked}
                onClick={() => option.id === "metalBackModule" ? onMetalShellFaceSide("front") : onCellKind(option.id)}
              >
                <span className="kind-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 48" focusable="false">
                    <use href={`/accessory-icons/usm-accessory-icons.svg#${option.id}`} />
                  </svg>
                </span>
                <small>{option.label}</small>
                <AccessoryStatusBadge status={evaluation.status} />
              </button>
            );
          })}
          {(() => {
            const evaluation = evaluateCellKind(config, selection, "metalBackModule");
            const blocked = evaluation.status === "blocked";
            return (
              <button
                key="metalFrontModule"
                className={["kind-button", selectedKind === "metalBackModule" && selectedFaceSide === "back" ? "active" : "", statusClass(evaluation.status)].filter(Boolean).join(" ")}
                type="button"
                title="背面开放，物理正面保留金属板"
                disabled={!selection || blocked}
                onClick={() => onMetalShellFaceSide("back")}
              >
                <span className="kind-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 48" focusable="false">
                    <use href="/accessory-icons/usm-accessory-icons.svg#metalBackModule" />
                  </svg>
                </span>
                <small>含金属前板模块</small>
                <AccessoryStatusBadge status={evaluation.status} />
              </button>
            );
          })()}
        </div>
        <AccessoryEvaluationPanel evaluation={displayedSelectedEvaluation} />
        {selection && !selectedKindInStructureOptions ? (
          <p className="helper-text">当前格的前脸配件请到配件页调整。</p>
        ) : null}
      </OptionGroup>

      {selection && (selectedKind === "dropDoor" || selectedKind === "flipUpDoor") ? (
        <OptionGroup label="门板开合">
          <p className="helper-text">拖动 3D 门板锁头/把手开合。</p>
        </OptionGroup>
      ) : null}

      <OptionGroup label="视图标注">
        <label className="switch-line">
          <span>尺寸标注</span>
          <input type="checkbox" checked={config.showDimensions} onChange={(event) => onShowDimensions(event.target.checked)} />
        </label>
      </OptionGroup>

      <OptionGroup label="快速结构">
        <div className="preset-grid">
          <button type="button" onClick={() => onPreset(1, 1, "metalBackModule")}><Box size={16} /> 750 单格</button>
          <button type="button" onClick={() => onPreset(2, 1, "metalBackModule")}><Columns3 size={16} /> 双列矮柜</button>
          <button type="button" onClick={() => onPreset(2, 2, "metalBackModule")}><Grid3X3 size={16} /> 四格柜</button>
          <button type="button" onClick={() => onPreset(3, 2, "open")}><Layers3 size={16} /> 3列框架</button>
          <button type="button" onClick={() => onConfigPreset(createSteppedPreset())}><Layers3 size={16} /> 阶梯异形</button>
          <button type="button" onClick={() => onConfigPreset(createKitchenIslandPreset())}><Columns3 size={16} /> 双面岛台</button>
          <button type="button" onClick={() => onConfigPreset(createSquareCoffeeTablePreset())}><Grid3X3 size={16} /> 四宫格茶几</button>
        </div>
      </OptionGroup>

    </div>
  );
}

function FittingsTab({
  config,
  selection,
  selectedCell,
  onChange
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedCell: CellConfig | undefined;
  onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void;
}) {
  const selectedFront = selectedCell?.frontAccessory ?? "none";
  const selectedMountSide = getPhysicalAccessoryMountSide(selectedCell);
  const selectedFitting = selectedCell?.fitting ?? "none";
  const [activeDoorType, setActiveDoorType] = useState<Exclude<CellFrontAccessoryKind, "none">>(
    selectedFront === "none" ? "dropDoor" : selectedFront
  );
  const selectedFrontEvaluation = evaluateCellFrontAccessory(
    config,
    selection,
    activeDoorType,
    activeDoorType === "dropDoor" ? selectedMountSide : "front"
  );
  const drawerEvaluation = evaluateCellFitting(config, selection, "rimmedDrawer");
  const drawerBlocked = drawerEvaluation.status === "blocked";
  const rimlessDrawerEvaluation = evaluateCellFitting(config, selection, "rimlessDrawer");
  const rimlessDrawerBlocked = rimlessDrawerEvaluation.status === "blocked";
  const drawerSelected = selectedFitting === "rimmedDrawer" || selectedFitting === "rimlessDrawer";
  const [glassDoorExpanded, setGlassDoorExpanded] = useState(selectedFront === "glassDropDoor");
  const glassDoorSelected = selectedFront === "glassDropDoor";
  const glassDoorHandleSide = glassDoorSelected ? selectedCell?.glassDoorHandleSide ?? "right" : "right";
  const showGlassDoorHandles = glassDoorExpanded || glassDoorSelected || activeDoorType === "glassDropDoor";
  const rowHeight = selection ? config.rowHeights[selection.row] ?? 350 : 350;
  const interiorAccessories = selectedCell?.interiorAccessories ?? [];

  useEffect(() => {
    setGlassDoorExpanded(glassDoorSelected);
    if (selectedFront !== "none") setActiveDoorType(selectedFront);
  }, [selection?.row, selection?.column, selection?.depthIndex, glassDoorSelected, selectedFront]);

  return (
    <div className="tab-stack">
      <OptionGroup label="底部支撑">
        <div className="choice-row three">
          {FEET_OPTIONS.map((option) => (
            <ToggleButton key={option.id} active={config.feet === option.id} onClick={() => onChange((current) => ({ ...current, feet: option.id }))} label={option.label} />
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="门板元素">
        <div className="choice-row three">
          {FRONT_ACCESSORY_OPTIONS.filter((option) => option.id !== "none").map((option) => {
            const doorType = option.id as Exclude<CellFrontAccessoryKind, "none">;
            const selected = selectedFront === doorType;
            const evaluations = doorType === "dropDoor"
              ? DROP_DOOR_MOUNT_SIDE_OPTIONS.map((side) => evaluateCellFrontAccessory(config, selection, doorType, side.id))
              : [evaluateCellFrontAccessory(config, selection, doorType, "front")];
            const blocked = evaluations.every((evaluation) => evaluation.status === "blocked");
            return (
              <ToggleButton
                key={option.id}
                active={selected}
                disabled={!selection || (blocked && !selected)}
                status={blocked ? "blocked" : undefined}
                title={selected
                  ? `移除${option.label}`
                  : blocked
                    ? evaluationTitle(evaluations[0])
                    : doorType === "dropDoor"
                      ? `安装${option.label}，可选择前后位置`
                      : `安装前向${option.label}`}
                onClick={() => {
                  if (!selection || (blocked && !selected)) return;
                  setActiveDoorType(doorType);
                  setGlassDoorExpanded(!selected && doorType === "glassDropDoor");
                  if (selected) {
                    onChange((current) => setCellFrontAccessory(current, selection, "none"));
                    return;
                  }
                  const dropDoorSide = selectedFront === "dropDoor" && (selectedMountSide === "front" || selectedMountSide === "back")
                    ? selectedMountSide
                    : "front";
                  onChange((current) => setCellFrontAccessory(current, selection, doorType, doorType === "dropDoor" ? dropDoorSide : "front"));
                }}
                label={option.label}
              />
            );
          })}
        </div>

        {activeDoorType === "dropDoor" ? (
          <>
          <div className="accessory-direction-heading">下翻门位置</div>
          <div className="door-direction-row">
            {DROP_DOOR_MOUNT_SIDE_OPTIONS.map((side) => {
              const evaluation = evaluateCellFrontAccessory(config, selection, "dropDoor", side.id);
              const active = selectedFront === "dropDoor" && selectedMountSide === side.id;
              const blocked = evaluation.status === "blocked" && !active;
              return (
                <ToggleButton
                  key={side.id}
                  active={active}
                  disabled={!selection || blocked}
                  status={evaluation.status}
                  title={evaluationTitle(evaluation)}
                  onClick={() => {
                    if (!selection || blocked) return;
                    onChange((current) => setCellFrontAccessory(current, selection, "dropDoor", side.id));
                  }}
                  label={side.label}
                />
              );
            })}
          </div>
          <p className="accessory-direction-status">
            {selectedFront === "dropDoor"
              ? `已安装：${DROP_DOOR_MOUNT_SIDE_OPTIONS.find((item) => item.id === selectedMountSide)?.label ?? "前"}向下翻门`
              : "当前模块未安装下翻门"}
          </p>
            </>
        ) : null}
        {showGlassDoorHandles ? (
          <div className="choice-row glass-door-handle-row">
            {GLASS_DOOR_HANDLE_OPTIONS.map((option) => (
              <ToggleButton
                key={option.id}
                active={glassDoorSelected && glassDoorHandleSide === option.id}
                disabled={!selection || !glassDoorSelected}
                onClick={() => {
                  if (!selection || !glassDoorSelected) return;
                  onChange((current) => setGlassDoorHandleSide(current, selection, option.id));
                }}
                label={option.label}
              />
            ))}
          </div>
        ) : null}
        <AccessoryEvaluationPanel evaluation={selectedFrontEvaluation} />
      </OptionGroup>

      <OptionGroup label="内部配件">
        <div className="choice-row">
          {VISIBLE_INTERIOR_ACCESSORY_OPTIONS.map((option) => {
            const evaluation = evaluateCellInteriorAccessory(config, selection, option.id);
            const blocked = evaluation.status === "blocked";
            return (
              <ToggleButton
                key={option.id}
                active={false}
                disabled={!selection || blocked || drawerSelected}
                status={evaluation.status}
                title={evaluationTitle(evaluation)}
                onClick={() => {
                  if (!selection || blocked) return;
                  onChange((current) => addCellInteriorAccessory(current, selection, option.id));
                }}
                label={`添加${option.label}`}
              />
            );
          })}
        </div>
        {interiorAccessories.length ? (
          <div className="interior-list">
            {interiorAccessories.map((accessory) => (
              <InteriorAccessoryRow
                key={accessory.id}
                config={config}
                selection={selection}
                accessory={accessory}
                rowHeight={rowHeight}
                disabled={!selection}
                onChange={onChange}
              />
            ))}
          </div>
        ) : (
          <p className="helper-text">该格暂无普通内部配件。</p>
        )}
      </OptionGroup>

      <OptionGroup label="抽屉独占件">
        <div className="choice-row">
          <ToggleButton
            active={selectedFitting === "rimmedDrawer"}
            disabled={!selection || drawerBlocked}
            status={drawerEvaluation.status}
            title={evaluationTitle(drawerEvaluation)}
            onClick={() => {
              if (!selection || drawerBlocked) return;
              onChange((current) => setCellFitting(current, selection, selectedFitting === "rimmedDrawer" ? "none" : "rimmedDrawer"));
            }}
            label="带围边抽屉"
          />
          <ToggleButton
            active={selectedFitting === "rimlessDrawer"}
            disabled={!selection || rimlessDrawerBlocked}
            status={rimlessDrawerEvaluation.status}
            title={evaluationTitle(rimlessDrawerEvaluation)}
            onClick={() => {
              if (!selection || rimlessDrawerBlocked) return;
              onChange((current) => setCellFitting(current, selection, selectedFitting === "rimlessDrawer" ? "none" : "rimlessDrawer"));
            }}
            label="一字拉手"
          />
        </div>
        <AccessoryEvaluationPanel evaluation={selectedFitting === "rimlessDrawer" ? rimlessDrawerEvaluation : drawerEvaluation} />
        {selection && selectedFitting === "rimlessDrawer" ? (
          <>
            <div className="accessory-direction-heading">抽屉门方向</div>
            <div className="door-direction-row">
              {ACCESSORY_MOUNT_SIDE_OPTIONS.map((side) => (
                <ToggleButton
                  key={side.id}
                  active={selectedMountSide === side.id}
                  onClick={() => onChange((current) => setDrawerDoorSide(current, selection, side.id))}
                  label={side.label}
                />
              ))}
            </div>
          </>
        ) : null}
        {selection && selectedCell && !fittingCompatible(selectedCell.kind) && selectedFitting !== "rimmedDrawer" ? (
          <p className="helper-text">选择带围边抽屉会自动切换为含金属背板模块，并清除门类前脸和普通内部配件。</p>
        ) : null}
        {selection && selectedFitting === "rimmedDrawer" ? (
          <p className="helper-text">拖动抽屉前板可拉进/拉出。</p>
        ) : null}
        {selection && selectedFitting === "rimlessDrawer" ? (
          <p className="helper-text">100 mm 高度可用；前板、浅盒体和导轨会沿所选方向整体拉出。</p>
        ) : null}
      </OptionGroup>

      <OptionGroup label="钢管表面">
        <div className="choice-row">
          <ToggleButton active={config.frameFinish === "chrome"} onClick={() => onChange((current) => ({ ...current, frameFinish: "chrome" }))} label="镀铬" />
          <ToggleButton active={config.frameFinish === "graphite"} onClick={() => onChange((current) => ({ ...current, frameFinish: "graphite" }))} label="石墨" />
        </div>
      </OptionGroup>

    </div>
  );
}

function InteriorAccessoryRow({
  config,
  selection,
  accessory,
  rowHeight,
  disabled,
  onChange
}: {
  config: CabinetConfig;
  selection: Selection | null;
  accessory: NonNullable<CellConfig["interiorAccessories"]>[number];
  rowHeight: number;
  disabled: boolean;
  onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void;
}) {
  const evaluation = evaluateCellInteriorAccessory(config, selection, accessory.kind, accessory);
  const blocked = evaluation.status === "blocked";
  const maxHeight = Math.max(0, rowHeight);

  return (
    <div className={`interior-row ${statusClass(evaluation.status)}`}>
      <div className="interior-row-header">
        <select
          value={accessory.kind}
          disabled={disabled}
          title={evaluationTitle(evaluation)}
          onChange={(event) => {
            if (!selection) return;
            const kind = event.currentTarget.value as CellInteriorAccessoryKind;
            onChange((current) => updateCellInteriorAccessory(current, selection, accessory.id, { kind }));
          }}
        >
          {INTERIOR_ACCESSORY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <AccessoryStatusBadge status={evaluation.status} />
        <button
          type="button"
          className="ghost-button interior-delete"
          disabled={disabled}
          title="删除"
          onClick={() => {
            if (!selection) return;
            onChange((current) => removeCellInteriorAccessory(current, selection, accessory.id));
          }}
        >
          <Eraser size={14} />
        </button>
      </div>
      <label className="range-line">
        <span>安装高</span>
        <input
          type="range"
          min={0}
          max={maxHeight}
          step={1}
          value={accessory.mountHeightMm}
          disabled={disabled || blocked}
          onChange={(event) => {
            if (!selection) return;
            const mountHeightMm = Number(event.currentTarget.value);
            onChange((current) => updateCellInteriorAccessory(current, selection, accessory.id, { mountHeightMm }));
          }}
        />
        <input
          type="number"
          min={0}
          max={maxHeight}
          step={1}
          value={accessory.mountHeightMm}
          disabled={disabled || blocked}
          onChange={(event) => {
            if (!selection) return;
            const mountHeightMm = Number(event.currentTarget.value);
            onChange((current) => updateCellInteriorAccessory(current, selection, accessory.id, { mountHeightMm }));
          }}
        />
      </label>
      {accessory.kind === "mobileTray" ? (
        <label className="range-line">
          <span>拉出</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={accessory.pull ?? 1}
            disabled={disabled || blocked}
            onChange={(event) => {
              if (!selection) return;
              const pull = Number(event.currentTarget.value);
              onChange((current) => setCellInteriorAccessoryPull(current, selection, accessory.id, pull));
            }}
          />
          <button
            type="button"
            className="ghost-button snap-button"
            disabled={disabled || blocked}
            onClick={() => {
              if (!selection) return;
              onChange((current) => setCellInteriorAccessoryPull(current, selection, accessory.id, (accessory.pull ?? 1) < 0.5 ? 1 : 0));
            }}
          >
            {(accessory.pull ?? 1) < 0.5 ? "拉出" : "收回"}
          </button>
        </label>
      ) : null}
      <AccessoryEvaluationPanel evaluation={evaluation} />
    </div>
  );
}

type ColorAccessoryTarget = { id: string; label: string };

const COLOR_PANEL_TARGETS: Array<{ id: StructurePanelKey; label: string }> = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "left", label: "左面" },
  { id: "right", label: "右面" },
  { id: "top", label: "顶面" },
  { id: "bottom", label: "底面" }
];

function getColorableAccessoryTargets(cell: CellConfig | undefined): ColorAccessoryTarget[] {
  if (!cell?.enabled) return [];
  const targets: ColorAccessoryTarget[] = [];
  const frontKind = cell.frontAccessory && cell.frontAccessory !== "none"
    ? cell.frontAccessory
    : isDoorCellKind(cell.kind) ? cell.kind : "none";
  if (frontKind !== "none") {
    targets.push({
      id: "front",
      label: FRONT_ACCESSORY_OPTIONS.find((item) => item.id === frontKind)?.label ?? "门板"
    });
  }
  if (cell.fitting && cell.fitting !== "none") {
    targets.push({
      id: "fitting",
      label: CELL_FITTING_OPTIONS.find((item) => item.id === cell.fitting)?.label ?? "抽屉"
    });
  }
  (cell.interiorAccessories ?? []).forEach((accessory) => {
    targets.push({
      id: accessory.id,
      label: INTERIOR_ACCESSORY_OPTIONS.find((item) => item.id === accessory.kind)?.label ?? "内部配件"
    });
  });
  return targets;
}

function sameColorSelection(left: Selection, right: Selection) {
  return left.row === right.row
    && left.column === right.column
    && (left.depthIndex ?? 0) === (right.depthIndex ?? 0);
}

function ColorsTab({
  config,
  selection,
  selectedAccessory,
  selectedPanel,
  onScopeChange,
  onSelectAccessory,
  onChange
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedAccessory: SelectedAccessory;
  selectedPanel: { cell: Selection; panel: StructurePanelKey } | null;
  onScopeChange: (scope: CabinetConfig["colorScope"]) => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void;
}) {
  const selectedCell = selection ? getCellConfig(config, selection) : undefined;
  const accessoryTargets = getColorableAccessoryTargets(selectedCell);
  const activeAccessory = selectedAccessory && selection && sameColorSelection(selectedAccessory.cell, selection)
    ? accessoryTargets.find((target) => target.id === selectedAccessory.accessoryId) ?? null
    : null;
  const panelSelection = selectedPanel && selection && sameColorSelection(selectedPanel.cell, selection)
    ? selectedPanel
    : null;
  const activeTargetSelection = config.colorScope === "panel" ? panelSelection?.cell ?? null : selection;
  const activeColor = config.colorScope === "all"
    ? config.panelColor
    : config.colorScope === "module" && selection
      ? getEffectiveModuleColor(config, selection)
      : config.colorScope === "accessory" && activeAccessory && selection
        ? getEffectiveAccessoryColor(config, selection, activeAccessory.id)
        : config.colorScope === "panel" && panelSelection
          ? getEffectivePanelColor(config, panelSelection.cell, panelSelection.panel)
          : null;
  const targetReady = config.colorScope === "all"
    || (config.colorScope === "module" && Boolean(selection))
    || (config.colorScope === "accessory" && Boolean(activeAccessory && selection))
    || (config.colorScope === "panel" && Boolean(panelSelection));

  const inheritance = (() => {
    if (config.colorScope === "all") return "全柜颜色已锁定";
    if (!selection) return "请先在 3D 中选择模块";
    if (config.colorScope === "module") return selectedCell?.color ? "模块局部覆盖" : "继承自全柜";
    if (config.colorScope === "accessory" && activeAccessory) {
      const interior = selectedCell?.interiorAccessories?.find((item) => item.id === activeAccessory.id);
      const ownColor = interior?.color ?? selectedCell?.accessoryColors?.[activeAccessory.id];
      return ownColor ? "配件局部覆盖" : selectedCell?.color ? "继承自模块" : "继承自全柜";
    }
    if (config.colorScope === "panel" && panelSelection) {
      return selectedCell?.panelColors?.[panelSelection.panel]
        ? "面板局部覆盖"
        : selectedCell?.color ? "继承自模块" : "继承自全柜";
    }
    return "未选中目标";
  })();

  function applyColor(color: string) {
    if (!targetReady) return;
    onChange((current) => setColorByScope(
      current,
      activeTargetSelection,
      current.colorScope,
      color,
      { accessoryId: activeAccessory?.id, panel: panelSelection?.panel }
    ));
  }

  function restoreInheritance() {
    if (!selection || config.colorScope === "all") return;
    if (config.colorScope === "module") {
      onChange((current) => clearColorOverride(current, selection, { kind: "cell" }));
    } else if (config.colorScope === "accessory" && activeAccessory) {
      onChange((current) => clearColorOverride(current, selection, { kind: "accessory", accessoryId: activeAccessory.id }));
    } else if (config.colorScope === "panel" && panelSelection) {
      onChange((current) => clearColorOverride(current, panelSelection.cell, { kind: "panel", panel: panelSelection.panel }));
    }
  }

  return (
    <div className="tab-stack color-tab">
      <OptionGroup label="颜色范围">
        <div className="choice-row">
          <ToggleButton active={config.colorScope === "all"} onClick={() => onScopeChange("all")} label="全部" />
          <ToggleButton active={config.colorScope === "module"} onClick={() => onScopeChange("module")} label="模块" />
          <ToggleButton active={config.colorScope === "accessory"} onClick={() => onScopeChange("accessory")} label="配件" />
          <ToggleButton active={config.colorScope === "panel"} onClick={() => onScopeChange("panel")} label="面板" />
        </div>
      </OptionGroup>

      {config.colorScope === "accessory" ? (
        <OptionGroup label="配件目标">
          {accessoryTargets.length ? (
            <div className="color-target-list">
              {accessoryTargets.map((target) => (
                <button key={target.id} type="button" className={activeAccessory?.id === target.id ? "color-target active" : "color-target"} onClick={() => selection && onSelectAccessory(selection, target.id)}>
                  <span>{target.label}</span>
                  <small>{activeAccessory?.id === target.id ? "当前配件" : "选择"}</small>
                </button>
              ))}
            </div>
          ) : <p className="helper-text">当前模块没有可独立改色的配件。先在配件页安装门板、抽屉、托盘或层板。</p>}
        </OptionGroup>
      ) : null}

      {config.colorScope === "panel" ? (
        <OptionGroup label="当前面板">
          <div className="color-target-status">
            {panelSelection ? <>当前面板：{COLOR_PANEL_TARGETS.find((target) => target.id === panelSelection.panel)?.label ?? panelSelection.panel}</> : "当前面板：未选中面板"}
          </div>
          <p className="helper-text">直接点击 3D 模型上的钣金即可切换当前面板。</p>
        </OptionGroup>
      ) : null}

      <OptionGroup label={config.colorScope === "accessory" ? "配件颜色" : config.colorScope === "panel" ? "面板颜色" : "板件颜色"}>
        <div className="color-inheritance">
          <span>{inheritance}</span>
          {config.colorScope !== "all" ? <button type="button" className="text-button" disabled={!targetReady} onClick={restoreInheritance}>恢复继承</button> : null}
        </div>
        <div className="swatch-grid">
          {COLOR_OPTIONS.map((color) => (
            <button key={color.id} className={activeColor === color.value ? "swatch active" : "swatch"} type="button" disabled={!targetReady} style={{ backgroundColor: color.value, color: color.text }} onClick={() => applyColor(color.value)}>
              {activeColor === color.value ? <Check size={16} /> : null}
              <span>{color.label}</span>
            </button>
          ))}
        </div>
      </OptionGroup>
    </div>
  );
}
function ErpBomExtension({
  context,
  inventoryState,
  productionOrderState,
  onWarehouseChange,
  onRefreshInventory,
  onCreateProductionOrder
}: {
  context: BusinessContext;
  inventoryState: BusinessResult<InventoryAvailability[]>;
  productionOrderState: BusinessResult<ProductionOrderResult>;
  onWarehouseChange: (warehouseId: string) => void;
  onRefreshInventory: () => void;
  onCreateProductionOrder: () => void;
}) {
  const availability = inventoryState.data ?? [];
  const known = availability.filter((item) => item.status !== "unknown");
  const shortage = availability.filter((item) => item.status === "partial" || item.status === "shortage");
  return (
    <section className="erp-bom-extension" aria-label="仓储 ERP 扩展">
      {ERP_FEATURES.warehouseContext ? (
        <div className="erp-extension-row">
          <label htmlFor="erp-warehouse">当前仓库</label>
          <input
            id="erp-warehouse"
            value={context.warehouseId}
            onChange={(event) => onWarehouseChange(event.target.value)}
          />
        </div>
      ) : null}
      {ERP_FEATURES.inventorySummary ? (
        <div className="erp-extension-row">
          <div>
            <strong>库存</strong>
            <span>{inventoryState.status === "unavailable" ? "未知" : "已查询 " + known.length + " 项 · 缺料 " + shortage.length + " 项"}</span>
          </div>
          <button type="button" disabled={inventoryState.status === "loading"} onClick={onRefreshInventory}>
            {inventoryState.status === "loading" ? "查询中" : "查询库存"}
          </button>
        </div>
      ) : null}
      {ERP_FEATURES.productionOrder ? (
        <div className="erp-extension-row">
          <div>
            <strong>生产需求单</strong>
            <span>{productionOrderState.data?.status === "queued" ? "已进入本地待同步队列" : "尚未创建"}</span>
          </div>
          <button type="button" disabled={productionOrderState.status === "loading"} onClick={onCreateProductionOrder}>
            {productionOrderState.status === "loading" ? "创建中" : "创建生产需求单"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function BomTab({
  bom,
  pricingState,
  onExport,
  businessExtension
}: {
  bom: BomItem[];
  pricingState: PricingState;
  onExport: () => void;
  businessExtension?: React.ReactNode;
}) {
  const lines = pricingState.status === "priced" ? pricingState.data.lines : [];
  const enterpriseMultiplierBasisPoints = pricingState.status === "priced"
    ? pricingState.data.salesMultiplierBasisPoints ?? 15000
    : 15000;
  const isEnterprise = pricingState.status === "priced" && !pricingState.data.dealer;
  const pricedByKey = new Map(lines.map((line) => [pricingLineKey(line.materialKey, line.specKey), line]));
  const grouped = groupBomByCategory(bom);
  return (
    <div className="tab-stack">
      <div className="bom-header">
        <div>
          <span>{pricingState.status === "priced" ? (isEnterprise ? "对客参考价" : "1.0 基准价") : pricingState.status === "loading" ? "价格计算中" : pricingState.status === "error" ? "价格计算失败" : "价格待确认"}</span>
          <strong>{pricingState.status === "priced"
            ? formatMinorRmb(isEnterprise
              ? pricingState.data.multiplierQuoteTotalMinor ?? Math.round(pricingState.data.retailTotalMinor * enterpriseMultiplierBasisPoints / 10000)
              : pricingState.data.retailTotalMinor)
            : "--"}</strong>
          <em>{pricingState.status === "priced"
            ? `不含运费、包装 · 价格表 ${pricingState.data.priceList?.version ?? "已发布版本"}`
            : pricingState.status === "pending" || pricingState.status === "error" ? pricingState.message : "正在读取已发布价格"}</em>
        </div>
        <button type="button" onClick={onExport}>
          <Download size={16} /> CSV
        </button>
      </div>
      {pricingState.status === "priced" && pricingState.data.dealer ? (
        <div className="dealer-price-summary">
          <span><small>1.0 基准价</small><strong>{formatMinorRmb(pricingState.data.retailTotalMinor)}</strong></span>
          <span><small>结算比例</small><strong>{pricingState.data.dealer.settlementRatePercent}%</strong></span>
          <span><small>经销商采购价</small><strong>{formatMinorRmb(pricingState.data.dealer.purchaseTotalMinor)}</strong></span>
        </div>
      ) : null}
      {pricingState.status === "priced" && !pricingState.data.dealer ? (
        <div className="enterprise-price-summary">
          <span><small>销售倍率</small><strong>{(enterpriseMultiplierBasisPoints / 10000).toFixed(2)}</strong></span>
          <span><small>倍率参考价</small><strong>{formatMinorRmb(pricingState.data.multiplierQuoteTotalMinor ?? Math.round(pricingState.data.retailTotalMinor * enterpriseMultiplierBasisPoints / 10000))}</strong></span>
        </div>
      ) : null}
      {pricingState.status === "pending" && pricingState.data.unmatched.length ? (
        <div className="pricing-pending-detail">
          <strong>以下零件尚未完成定价</strong>
          <span>{pricingState.data.unmatched.slice(0, 4).join("、")}{pricingState.data.unmatched.length > 4 ? ` 等 ${pricingState.data.unmatched.length} 项` : ""}</span>
        </div>
      ) : null}
      {businessExtension}
      <div className="bom-table">
        {grouped.map(([category, items]) => {
          const subtotal = items.reduce((sum, item) => {
            const line = pricedByKey.get(pricingLineKey(item.materialKey, item.specKey));
            return sum + (line ? (isEnterprise ? multipliedMinor(line.lineTotalMinor, enterpriseMultiplierBasisPoints) : line.lineTotalMinor) : 0);
          }, 0);
          return <section className="bom-category" key={category}>
            <header><strong>{bomCategoryLabel(category)}</strong><span>{items.length} 项{subtotal > 0 ? ` · ${formatMinorRmb(subtotal)}` : ""}</span></header>
            {items.map((item) => {
              const priced = pricedByKey.get(pricingLineKey(item.materialKey, item.specKey));
              return <div className={`bom-row price-${priced?.pricingStatus ?? "pending"}`} key={`${item.materialKey}-${item.specKey}-${item.name}-${item.color ?? ""}`}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.spec}</span>
                  <small>{item.materialKey} · {priced ? pricingStatusLabel(priced.pricingStatus) : "价格待确认"}</small>
                </div>
                <b>
                  {item.qty}{item.unit}
                  <span>{priced ? formatMinorRmb(isEnterprise ? multipliedMinor(priced.unitPriceMinor, enterpriseMultiplierBasisPoints) : priced.unitPriceMinor) : "--"}</span>
                </b>
              </div>;
            })}
          </section>;
        })}
      </div>
    </div>
  );
}

function PriceBadge({ state }: { state: PricingState }) {
  if (state.status === "loading") return <span className="price pending">价格计算中</span>;
  if (state.status === "error") return <span className="price pending">价格计算失败</span>;
  if (state.status === "pending") return <span className="price pending">价格待确认</span>;
  if (state.data.dealer) {
    return <span className="price-stack">
      <small>建议 {formatMinorRmb(state.data.retailTotalMinor)}</small>
      <strong>{formatMinorRmb(state.data.dealer.purchaseTotalMinor)}</strong>
    </span>;
  }
  const multiplierBasisPoints = state.data.salesMultiplierBasisPoints ?? 15000;
  const multiplierTotalMinor = state.data.multiplierQuoteTotalMinor
    ?? multipliedMinor(state.data.retailTotalMinor, multiplierBasisPoints);
  return <span className="price-stack">
    <small>{(multiplierBasisPoints / 10000).toFixed(2)} 倍</small>
    <strong>{formatMinorRmb(multiplierTotalMinor)}</strong>
  </span>;
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="option-group">
      <h2>{label}</h2>
      {children}
    </section>
  );
}

function Segmented({
  values,
  active,
  onChange,
  compact = false,
  disabled = false
}: {
  values: readonly number[];
  active: number;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"}>
      {values.map((value) => (
        <button key={value} type="button" className={active === value ? "active" : ""} disabled={disabled} onClick={() => onChange(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}

function SizePicker({
  values,
  active,
  onChange,
  compact = false,
  disabled = false
}: {
  values: readonly number[];
  active: number;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(active));

  useEffect(() => {
    setDraft(String(active));
  }, [active]);

  function submitDraft() {
    const value = Number(draft);
    if (Number.isFinite(value)) {
      onChange(value);
    } else {
      setDraft(String(active));
    }
  }

  return (
    <div className="size-picker">
      <Segmented values={values} active={active} onChange={onChange} compact={compact} disabled={disabled} />
      <label className="custom-size">
        <span>自定义</span>
        <input
          type="number"
          min={MIN_CUSTOM_SIZE}
          max={MAX_CUSTOM_SIZE}
          step={1}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button type="button" onClick={onMinus}><Minus size={15} /></button>
        <strong>{value}</strong>
        <button type="button" onClick={onPlus}><Plus size={15} /></button>
      </div>
    </div>
  );
}

function AccessoryStatusBadge({ status }: { status: AccessoryStatus }) {
  return <b className={`accessory-status-badge ${statusClass(status)}`}>{ACCESSORY_STATUS_META[status].shortLabel}</b>;
}

function AccessoryEvaluationPanel({ evaluation }: { evaluation: AccessoryEvaluation }) {
  const meta = ACCESSORY_STATUS_META[evaluation.status];
  const messages = [...evaluation.reasons, ...evaluation.warnings].filter(Boolean);
  return (
    <div className={`accessory-evaluation ${statusClass(evaluation.status)}`}>
      <div>
        <strong>{evaluation.label}</strong>
        <AccessoryStatusBadge status={evaluation.status} />
      </div>
      <p>{evaluation.officialSpec ? `${meta.description} ${evaluation.officialSpec}` : meta.description}</p>
      {messages.length ? <p>{messages.join(" ")}</p> : null}
    </div>
  );
}

function statusClass(status: AccessoryStatus): string {
  return `status-${status}`;
}

function evaluationTitle(evaluation: AccessoryEvaluation): string {
  const meta = ACCESSORY_STATUS_META[evaluation.status];
  return [evaluation.label, meta.label, evaluation.officialSpec, ...evaluation.reasons, ...evaluation.warnings].filter(Boolean).join("\n");
}

function ToggleButton({
  active,
  label,
  onClick,
  disabled = false,
  status,
  title
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  status?: AccessoryStatus;
  title?: string;
}) {
  return (
    <button
      className={["toggle", active ? "active" : "", status ? statusClass(status) : ""].filter(Boolean).join(" ")}
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {active ? <Check size={16} /> : null}
      <span>{label}</span>
      {status ? <AccessoryStatusBadge status={status} /> : null}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      <Icon size={18} />
    </button>
  );
}

function getReadonlyOrderId(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("readonly") === "1" ? params.get("orderId")?.trim() || null : null;
}

function getResumeDraftId(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("draft") === "1" ? params.get("designId")?.trim() || null : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function loadConfig(): CabinetConfig {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalizeConfig(stored ? JSON.parse(stored) : DEFAULT_CONFIG);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  // iOS Safari 的下载是异步开始的，同步 revoke 会中断下载
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function pricingStatusLabel(status: ServerPriceLine["pricingStatus"]): string {
  const labels: Record<ServerPriceLine["pricingStatus"], string> = {
    priced: "已定价",
    included: "已包含",
    unmatched: "价格待确认"
  };
  return labels[status];
}

function formatMinorRmb(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(value / 100);
}

function multipliedMinor(value: number, basisPoints: number): number {
  return Math.round(value * basisPoints / 10000);
}

function pricingLineKey(materialKey: string, specKey: string): string {
  return `${materialKey}|${specKey}`;
}

function groupBomByCategory(bom: BomItem[]): Array<[BomItem["category"], BomItem[]]> {
  const order: BomItem["category"][] = ["frame", "panel", "door", "interior", "glass", "hardware"];
  return order
    .map((category) => [category, bom.filter((item) => item.category === category)] as [BomItem["category"], BomItem[]])
    .filter((entry) => entry[1].length > 0);
}

function bomCategoryLabel(category: BomItem["category"]): string {
  return ({
    frame: "框架管件",
    panel: "板件",
    door: "门类",
    interior: "内部配件",
    glass: "玻璃",
    hardware: "五金与支撑"
  } as const)[category];
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
