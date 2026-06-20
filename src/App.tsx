import {
  Box,
  Camera,
  Check,
  CircleDot,
  ClipboardList,
  Columns3,
  CornerUpLeft,
  Download,
  Eraser,
  FileDown,
  FileUp,
  Grid3X3,
  Layers3,
  Minus,
  PaintBucket,
  Plus,
  RotateCcw,
  Settings2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACCESSORY_CATEGORIES, ACCESSORY_REQUIREMENTS } from "./accessoryCatalog";
import { BuilderScene, type SelectedAccessory } from "./BuilderScene";
import {
  DEFAULT_DEALER_PRICE_SOURCE,
  estimatePricedBom,
  priceBomItems,
  normalizeDealerPriceSource,
  summarizePriceMatches,
  type DealerPriceSource,
  type PricedBomItem
} from "./pricing";
import {
  CELL_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_CONFIG,
  DEPTH_OPTIONS,
  EIGHTCOLORS_CATALOG_PRESETS,
  FEET_OPTIONS,
  FRONT_ACCESSORY_OPTIONS,
  HEIGHT_OPTIONS,
  INTERIOR_ACCESSORY_OPTIONS,
  MAX_CUSTOM_SIZE,
  MIN_CUSTOM_SIZE,
  STRUCTURE_MODE_OPTIONS,
  STRUCTURE_FRAME_OPTIONS,
  STRUCTURE_PANEL_MATERIAL_OPTIONS,
  STRUCTURE_PANEL_OPTIONS,
  STRUCTURE_VERTEX_OPTIONS,
  WIDTH_OPTIONS,
  ACCESSORY_STATUS_META,
  applyStructureMode,
  buildBom,
  createDeskPreset,
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
  getCellColor,
  getCellDepth,
  getDepthSegments,
  getDimensions,
  getEffectiveStructureFrameVisible,
  getEffectiveStructurePanelMaterial,
  getEffectiveStructureVertexVisible,
  getSelectionDepthIndex,
  isCellEnabled,
  isDoorCellKind,
  normalizeConfig,
  resetCellStructure,
  resizeColumns,
  resizeDepthSegments,
  resizeRows,
  addCellInteriorAccessory,
  removeCellInteriorAccessory,
  setCellColor,
  setCellFitting,
  setCellFrontAccessory,
  setCellInteriorAccessoryPull,
  setCellKind,
  setGlassDoorHandleSide,
  setCellStructureFrameVisible,
  setCellStructurePanel,
  setCellStructureVertexVisible,
  setDrawerPull,
  setDoorOpen,
  setDepth,
  setPanelColor,
  setSelectedCellDepth,
  setSelectedDepthSegmentSize,
  setSelectedColumnWidth,
  setSelectedRowHeight,
  updateCellInteriorAccessory,
  type CabinetConfig,
  type CellConfig,
  type CellInteriorAccessoryKind,
  type CellKind,
  type CellFrontAccessoryKind,
  type GlassDoorHandleSide,
  type Selection,
  type AccessoryEvaluation,
  type AccessoryStatus,
  type StructureFrameKey,
  type StructurePanelKey,
  type StructurePanelMaterial,
  type StructureVertexKey,
  type TabKey
} from "./model";

const STORAGE_KEY = "usm-local-builder-config";
const PRICE_SOURCE_STORAGE_KEY = "usm-local-builder-price-source";

interface SceneApi {
  capturePng: () => string;
}

const tabs: Array<{ id: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "structure", label: "结构", icon: Grid3X3 },
  { id: "fittings", label: "配件", icon: Settings2 },
  { id: "colors", label: "颜色", icon: PaintBucket },
  { id: "bom", label: "BOM", icon: ClipboardList }
];

const GLASS_DOOR_HANDLE_OPTIONS: Array<{ id: GlassDoorHandleSide; label: string }> = [
  { id: "left", label: "左把手" },
  { id: "right", label: "右把手" }
];

export default function App() {
  const [config, setConfig] = useState<CabinetConfig>(() => loadConfig());
  const [selection, setSelection] = useState<Selection>(() => findNearestEnabled(loadConfig()));
  const [selectedAccessory, setSelectedAccessory] = useState<SelectedAccessory>(null);
  const [history, setHistory] = useState<CabinetConfig[]>([]);
  const [tab, setTab] = useState<TabKey>("structure");
  const [toast, setToast] = useState("");
  const [priceSource, setPriceSource] = useState<DealerPriceSource>(() => loadPriceSource());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceSourceInputRef = useRef<HTMLInputElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const bom = useMemo(() => buildBom(config), [config]);
  const pricedBom = useMemo(() => priceBomItems(bom, priceSource), [bom, priceSource]);
  const price = useMemo(() => estimatePricedBom(pricedBom), [pricedBom]);
  const priceSummary = useMemo(() => summarizePriceMatches(pricedBom), [pricedBom]);
  const dimensions = useMemo(() => getDimensions(config), [config]);
  const activeSelection = useMemo(() => findNearestEnabled(config, selection), [config, selection]);
  const selectedCell = getCellConfig(config, activeSelection) ?? config.cells[0]?.[0];
  const selectedAccessoryForScene = selectedAccessory;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    window.localStorage.setItem(PRICE_SOURCE_STORAGE_KEY, JSON.stringify(priceSource));
  }, [priceSource]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (selectedAccessory && !selectedAccessoryForScene) setSelectedAccessory(null);
  }, [selectedAccessory, selectedAccessoryForScene]);

  const updateConfig = useCallback((next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig), remember = true) => {
    setConfig((current) => {
      const resolved = normalizeConfig(typeof next === "function" ? next(current) : next);
      if (remember && JSON.stringify(resolved) !== JSON.stringify(current)) {
        setHistory((items) => [...items.slice(-24), current]);
      }
      return resolved;
    });
  }, []);

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
    if (!next) {
      setSelection(findNearestEnabled(config));
      return;
    }
    const bounded = {
      row: Math.max(0, Math.min(next.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(next.column, config.columnWidths.length - 1)),
      depthIndex: Math.max(0, Math.min(next.depthIndex ?? 0, getDepthSegments(config).length - 1))
    };
    setSelection(findNearestEnabled(config, bounded));
  }, [config]);

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

  function handleRows(delta: number) {
    updateConfig((current) => {
      const next = resizeRows(current, current.rowHeights.length + delta);
      setSelection((active) => findNearestEnabled(next, active));
      return next;
    });
  }

  function handleColumns(delta: number) {
    updateConfig((current) => {
      const next = resizeColumns(current, current.columnWidths.length + delta);
      setSelection((active) => findNearestEnabled(next, active));
      return next;
    });
  }

  function expandSelected(direction: "left" | "right" | "top" | "front") {
    if (!activeSelection) return;
    updateConfig((current) => {
      const next = expandCell(current, activeSelection, direction);
      setSelection(next.selection);
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
      setConfig(previous);
      setSelection(findNearestEnabled(previous, selection ?? { row: 0, column: 0 }));
      setToast("已撤销");
      return items.slice(0, -1);
    });
  }

  function applyPreset(columns: number, rows: number, kind: CellKind = "metalBackModule") {
    applyConfigPreset(createPreset(columns, rows, kind));
  }

  function applyConfigPreset(next: CabinetConfig) {
    updateConfig(next);
    setSelection(findNearestEnabled(next));
  }

  function exportJson() {
    downloadFile("usm-config.json", JSON.stringify(config, null, 2), "application/json");
    setToast("配置已导出");
  }

  function exportBom() {
    const lines = [
      ["名称", "规格", "数量", "单位", "单价", "小计", "价格来源", "来源行", "价格备注"],
      ...pricedBom.map((item) => [
        item.name,
        item.spec,
        String(item.qty),
        item.unit,
        String(item.unitPrice),
        String(item.qty * item.unitPrice),
        priceStatusLabel(item.priceStatus),
        item.priceSourceRows.join("+"),
        item.priceNote
      ])
    ];
    downloadFile("usm-bom.csv", lines.map((line) => line.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
    setToast("BOM 已导出");
  }

  function exportAccessoryRequirements() {
    const payload = {
      generatedAt: new Date().toISOString(),
      purpose: "USM 4.0 本地化搭建配件需求清单",
      categories: ACCESSORY_CATEGORIES,
      accessories: ACCESSORY_REQUIREMENTS
    };
    downloadFile("usm-accessory-requirements.json", JSON.stringify(payload, null, 2), "application/json");
    setToast("配件需求清单已导出");
  }

  function exportPriceSource() {
    downloadFile(`${priceSource.id || "dealer-price-source"}.json`, JSON.stringify(priceSource, null, 2), "application/json");
    setToast("报价源已导出");
  }

  function importPriceSource(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = normalizeDealerPriceSource(JSON.parse(String(reader.result)));
        setPriceSource(next);
        setToast("报价源已导入");
      } catch {
        setToast("报价源导入失败");
      }
    };
    reader.readAsText(file);
  }

  function resetPriceSource() {
    setPriceSource(DEFAULT_DEALER_PRICE_SOURCE);
    setToast("已恢复默认报价源");
  }

  function exportImage() {
    const data = sceneApiRef.current?.capturePng();
    if (!data) return;
    const link = document.createElement("a");
    link.download = "usm-3d-preview.png";
    link.href = data;
    link.click();
    setToast("图片已导出");
  }

  function importJson(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = normalizeConfig(JSON.parse(String(reader.result)));
        updateConfig(next);
        setSelection(findNearestEnabled(next));
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
    setToast("已重置");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <CircleDot size={20} />
          </div>
          <div>
            <h1>USM 本地模块搭建</h1>
            <p>{dimensions.outerWidth} x {dimensions.outerHeight} x {dimensions.outerDepth} mm</p>
          </div>
        </div>

        <div className="top-actions">
          <strong className="price">{formatRmb(price)}</strong>
          <IconButton label="保存配置" onClick={exportJson} icon={FileDown} />
          <IconButton label="导入配置" onClick={() => fileInputRef.current?.click()} icon={FileUp} />
          <IconButton label="导出图片" onClick={exportImage} icon={Camera} />
          <IconButton label="导出配件需求清单" onClick={exportAccessoryRequirements} icon={Download} />
          <IconButton label="重置" onClick={resetConfig} icon={RotateCcw} />
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              importJson(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <nav className="tabs" aria-label="配置分类">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={tab === item.id ? "tab active" : "tab"} onClick={() => setTab(item.id)} type="button">
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
                onDepth={(depth) => updateConfig((current) => setDepth(current, depth))}
                onDepthSegments={(count) => updateConfig((current) => resizeDepthSegments(current, count))}
                onDepthSegmentSize={(depth) => activeSelection ? updateConfig((current) => setSelectedDepthSegmentSize(current, activeSelection, depth)) : undefined}
                onCellDepth={(depth) => activeSelection ? updateConfig((current) => setSelectedCellDepth(current, activeSelection, depth)) : undefined}
                onWidth={(width) => activeSelection ? updateConfig((current) => setSelectedColumnWidth(current, activeSelection, width)) : undefined}
                onHeight={(height) => activeSelection ? updateConfig((current) => setSelectedRowHeight(current, activeSelection, height)) : undefined}
                onRows={handleRows}
                onColumns={handleColumns}
                onCellKind={(kind) => activeSelection ? updateConfig((current) => setCellKind(current, activeSelection, kind)) : undefined}
                onStructurePanel={(panel, material) => activeSelection ? updateConfig((current) => setCellStructurePanel(current, activeSelection, panel, material)) : undefined}
                onStructureFrame={(frame, visible) => activeSelection ? updateConfig((current) => setCellStructureFrameVisible(current, activeSelection, frame, visible)) : undefined}
                onStructureVertex={(vertex, visible) => activeSelection ? updateConfig((current) => setCellStructureVertexVisible(current, activeSelection, vertex, visible)) : undefined}
                onResetCellStructure={() => activeSelection ? updateConfig((current) => resetCellStructure(current, activeSelection)) : undefined}
                onStructureMode={(mode) => updateConfig((current) => applyStructureMode(current, mode))}
                onPreset={applyPreset}
                onConfigPreset={applyConfigPreset}
              />
            ) : null}

            {tab === "fittings" ? <FittingsTab config={config} selection={activeSelection} selectedCell={selectedCell} onChange={updateConfig} /> : null}
            {tab === "colors" ? <ColorsTab config={config} selection={activeSelection} onChange={updateConfig} /> : null}
            {tab === "bom" ? (
              <BomTab
                bom={pricedBom}
                price={price}
                priceSource={priceSource}
                priceSummary={priceSummary}
                onExport={exportBom}
                onExportPriceSource={exportPriceSource}
                onImportPriceSource={() => priceSourceInputRef.current?.click()}
                onResetPriceSource={resetPriceSource}
              />
            ) : null}
            {tab === "bom" ? (
              <input
                ref={priceSourceInputRef}
                className="hidden-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  importPriceSource(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
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

        <section className="scene-wrap" aria-label="3D 预览">
          <BuilderScene
            config={config}
            selection={activeSelection}
            selectedAccessory={selectedAccessoryForScene}
            onSelect={selectCell}
            onSelectAccessory={selectAccessory}
            onExpand={expandSelected}
            onDrawerPull={handleDrawerPull}
            onDoorOpen={handleDoorOpen}
            onReady={(api) => {
              sceneApiRef.current = api;
            }}
          />
          {activeSelection ? (
            <div className="context-toolbar">
              <button type="button" className="ghost-button" onClick={undoLast}>
                <CornerUpLeft size={16} /> 撤销
              </button>
              <button type="button" className="ghost-button danger" onClick={deleteSelected}>
                <Eraser size={16} /> 删除
              </button>
            </div>
          ) : null}
          <div className="bottom-toolbar">
            <IconButton label="设置" onClick={() => setTab("fittings")} icon={Settings2} />
            <IconButton label="载图" onClick={exportImage} icon={Camera} />
            <IconButton label="撤销" onClick={undoLast} icon={CornerUpLeft} />
            <IconButton label="删除" onClick={deleteSelected} icon={Eraser} />
            <IconButton label="重置" onClick={resetConfig} icon={RotateCcw} />
          </div>
        </section>
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function StructureTab({
  config,
  selection,
  selectedKind,
  onDepth,
  onDepthSegments,
  onDepthSegmentSize,
  onCellDepth,
  onWidth,
  onHeight,
  onRows,
  onColumns,
  onCellKind,
  onStructurePanel,
  onStructureFrame,
  onStructureVertex,
  onResetCellStructure,
  onStructureMode,
  onPreset,
  onConfigPreset
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedKind: CellKind;
  onDepth: (depth: number) => void;
  onDepthSegments: (count: number) => void;
  onDepthSegmentSize: (depth: number) => void;
  onCellDepth: (depth: number) => void;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onRows: (delta: number) => void;
  onColumns: (delta: number) => void;
  onCellKind: (kind: CellKind) => void;
  onStructurePanel: (panel: StructurePanelKey, material: StructurePanelMaterial) => void;
  onStructureFrame: (frame: StructureFrameKey, visible: boolean) => void;
  onStructureVertex: (vertex: StructureVertexKey, visible: boolean) => void;
  onResetCellStructure: () => void;
  onStructureMode: (mode: CabinetConfig["structureMode"]) => void;
  onPreset: (columns: number, rows: number, kind?: CellKind) => void;
  onConfigPreset: (config: CabinetConfig) => void;
}) {
  const selectedColumn = selection?.column ?? 0;
  const selectedRow = selection?.row ?? 0;
  const depthSegments = getDepthSegments(config);
  const selectedDepthIndex = selection ? getSelectionDepthIndex(config, selection) : 0;
  const selectedDepth = selection ? getCellDepth(config, selection.row, selection.column, selectedDepthIndex) : depthSegments[0] ?? config.depth;
  const selectedDepthSegment = depthSegments[selectedDepthIndex] ?? config.depth;
  const selectedKindInStructureOptions = CELL_OPTIONS.some((option) => option.id === selectedKind);
  const selectedEvaluation = evaluateCellKind(config, selection, selectedKindInStructureOptions ? selectedKind : "open");
  const selectedCell = getCellConfig(config, selection);

  return (
    <div className="tab-stack">
      <OptionGroup label="全柜默认深度 mm">
        <SizePicker values={DEPTH_OPTIONS} active={config.depth} onChange={onDepth} />
      </OptionGroup>

      <div className="stepper-grid">
        <Stepper label="深度段数" value={depthSegments.length} onMinus={() => onDepthSegments(depthSegments.length - 1)} onPlus={() => onDepthSegments(depthSegments.length + 1)} />
      </div>

      <OptionGroup label={selection ? `第 ${selectedDepthIndex + 1} 深度段 mm` : "深度段尺寸 mm"}>
        <SizePicker values={DEPTH_OPTIONS} active={selectedDepthSegment} onChange={onDepthSegmentSize} disabled={!selection} />
      </OptionGroup>

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

      <OptionGroup label="结构选择">
        <StructurePartsEditor
          cell={selectedCell}
          kind={selectedKind}
          disabled={!selection}
          onPanel={onStructurePanel}
          onFrame={onStructureFrame}
          onVertex={onStructureVertex}
          onReset={onResetCellStructure}
        />
      </OptionGroup>

      <OptionGroup label="模块类型">
        <div className="cell-kind-grid icon-mode">
          {CELL_OPTIONS.map((option) => {
            const evaluation = evaluateCellKind(config, selection, option.id);
            const blocked = evaluation.status === "blocked";
            return (
              <button
                key={option.id}
                className={["kind-button", selectedKind === option.id ? "active" : "", statusClass(evaluation.status)].filter(Boolean).join(" ")}
                type="button"
                title={evaluationTitle(evaluation)}
                disabled={!selection || blocked}
                onClick={() => onCellKind(option.id)}
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
        </div>
        <AccessoryEvaluationPanel evaluation={selectedEvaluation} />
        {selection && !selectedKindInStructureOptions ? (
          <p className="helper-text">当前格的前脸配件请到配件页调整。</p>
        ) : null}
      </OptionGroup>

      {selection && (selectedKind === "dropDoor" || selectedKind === "flipUpDoor") ? (
        <OptionGroup label="门板开合">
          <p className="helper-text">拖动 3D 门板锁头/把手开合。</p>
        </OptionGroup>
      ) : null}

      <OptionGroup label="快速结构">
        <div className="preset-grid">
          <button type="button" onClick={() => onPreset(1, 1, "metalBackModule")}><Box size={16} /> 750 单格</button>
          <button type="button" onClick={() => onPreset(2, 1, "metalBackModule")}><Columns3 size={16} /> 双列矮柜</button>
          <button type="button" onClick={() => onPreset(2, 2, "openBackPanel")}><Grid3X3 size={16} /> 四格柜</button>
          <button type="button" onClick={() => onPreset(3, 2, "open")}><Layers3 size={16} /> 展示柜</button>
          <button type="button" onClick={() => onConfigPreset(createSteppedPreset())}><Layers3 size={16} /> 阶梯异形</button>
          <button type="button" onClick={() => onConfigPreset(createDeskPreset())}><Columns3 size={16} /> 书桌单元</button>
          <button type="button" onClick={() => onConfigPreset(createKitchenIslandPreset())}><Columns3 size={16} /> 双面岛台</button>
          <button type="button" onClick={() => onConfigPreset(createSquareCoffeeTablePreset())}><Grid3X3 size={16} /> 四宫格茶几</button>
        </div>
      </OptionGroup>

      <OptionGroup label="图册基础款">
        <div className="preset-grid catalog-preset-grid">
          {EIGHTCOLORS_CATALOG_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.reference}
              onClick={() => onConfigPreset(preset.createConfig())}
            >
              <Grid3X3 size={16} />
              {preset.label}
            </button>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="批量结构预设">
        <div className="structure-mode-grid">
          {STRUCTURE_MODE_OPTIONS.map((mode) => (
            <button key={mode.id} type="button" className={config.structureMode === mode.id ? "mode-button active" : "mode-button"} onClick={() => onStructureMode(mode.id)}>
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
      </OptionGroup>
    </div>
  );
}

function StructurePartsEditor({
  cell,
  kind,
  disabled,
  onPanel,
  onFrame,
  onVertex,
  onReset
}: {
  cell: CellConfig | undefined;
  kind: CellKind;
  disabled: boolean;
  onPanel: (panel: StructurePanelKey, material: StructurePanelMaterial) => void;
  onFrame: (frame: StructureFrameKey, visible: boolean) => void;
  onVertex: (vertex: StructureVertexKey, visible: boolean) => void;
  onReset: () => void;
}) {
  return (
    <div className="structure-parts">
      <div className="structure-part-block">
        <span className="structure-block-title">面板</span>
        {STRUCTURE_PANEL_OPTIONS.map((option) => {
          const value = cell ? getEffectiveStructurePanelMaterial(cell, kind, option.id) : "none";
          return (
            <div className="structure-material-row" key={option.id}>
              <span>{option.label}</span>
              <div className="structure-material-options">
                {STRUCTURE_PANEL_MATERIAL_OPTIONS.map((material) => (
                  <button
                    key={material.id}
                    type="button"
                    className={value === material.id ? "active" : ""}
                    disabled={disabled}
                    onClick={() => onPanel(option.id, material.id)}
                  >
                    {material.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="structure-part-block">
        <span className="structure-block-title">钢管</span>
        <div className="structure-check-grid">
          {STRUCTURE_FRAME_OPTIONS.map((option) => (
            <label className="structure-check" key={option.id}>
              <input
                type="checkbox"
                checked={cell ? getEffectiveStructureFrameVisible(cell, option.id) : false}
                disabled={disabled}
                onChange={(event) => onFrame(option.id, event.currentTarget.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="structure-part-block">
        <span className="structure-block-title">顶点</span>
        <div className="structure-check-grid">
          {STRUCTURE_VERTEX_OPTIONS.map((option) => (
            <label className="structure-check" key={option.id}>
              <input
                type="checkbox"
                checked={cell ? getEffectiveStructureVertexVisible(cell, option.id) : false}
                disabled={disabled}
                onChange={(event) => onVertex(option.id, event.currentTarget.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button type="button" className="ghost-button structure-reset" disabled={disabled || !cell?.structure} onClick={onReset}>
        <RotateCcw size={15} /> 恢复默认
      </button>
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
  const selectedFitting = selectedCell?.fitting ?? "none";
  const selectedFrontEvaluation = evaluateCellFrontAccessory(config, selection, selectedFront);
  const drawerEvaluation = evaluateCellFitting(config, selection, "rimmedDrawer");
  const drawerBlocked = drawerEvaluation.status === "blocked";
  const [glassDoorExpanded, setGlassDoorExpanded] = useState(selectedFront === "glassDropDoor");
  const glassDoorSelected = selectedFront === "glassDropDoor";
  const glassDoorHandleSide = glassDoorSelected ? selectedCell?.glassDoorHandleSide ?? "right" : "right";
  const showGlassDoorHandles = glassDoorExpanded || glassDoorSelected;
  const rowHeight = selection ? config.rowHeights[selection.row] ?? 350 : 350;
  const interiorAccessories = selectedCell?.interiorAccessories ?? [];

  useEffect(() => {
    setGlassDoorExpanded(glassDoorSelected);
  }, [selection?.row, selection?.column, selection?.depthIndex, glassDoorSelected]);

  return (
    <div className="tab-stack">
      <OptionGroup label="底部支撑">
        <div className="choice-row three">
          {FEET_OPTIONS.map((option) => (
            <ToggleButton key={option.id} active={config.feet === option.id} onClick={() => onChange((current) => ({ ...current, feet: option.id }))} label={option.label} />
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="门板/前脸配件">
        <div className="choice-row">
          {FRONT_ACCESSORY_OPTIONS.map((option) => {
            const evaluation = evaluateCellFrontAccessory(config, selection, option.id);
            const blocked = evaluation.status === "blocked";
            return (
              <ToggleButton
                key={option.id}
                active={selectedFront === option.id || (option.id === "none" && selectedFront === "none")}
                disabled={!selection || blocked}
                status={evaluation.status}
                title={evaluationTitle(evaluation)}
                onClick={() => {
                  if (!selection || blocked) return;
                  if (option.id === "glassDropDoor") setGlassDoorExpanded(true);
                  onChange((current) => setCellFrontAccessory(current, selection, option.id));
                }}
                label={option.label}
              />
            );
          })}
        </div>
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
          {INTERIOR_ACCESSORY_OPTIONS.map((option) => {
            const evaluation = evaluateCellInteriorAccessory(config, selection, option.id);
            const blocked = evaluation.status === "blocked";
            return (
              <ToggleButton
                key={option.id}
                active={false}
                disabled={!selection || blocked || selectedFitting === "rimmedDrawer"}
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
        </div>
        <AccessoryEvaluationPanel evaluation={drawerEvaluation} />
        {selection && selectedCell && !fittingCompatible(selectedCell.kind) && selectedFitting !== "rimmedDrawer" ? (
          <p className="helper-text">选择带围边抽屉会自动切换为含金属背板模块，并清除门类前脸和普通内部配件。</p>
        ) : null}
        {selection && selectedFitting === "rimmedDrawer" ? (
          <p className="helper-text">拖动抽屉前板可拉进/拉出。</p>
        ) : null}
      </OptionGroup>

      <OptionGroup label="钢管表面">
        <div className="choice-row">
          <ToggleButton active={config.frameFinish === "chrome"} onClick={() => onChange((current) => ({ ...current, frameFinish: "chrome" }))} label="镀铬" />
          <ToggleButton active={config.frameFinish === "graphite"} onClick={() => onChange((current) => ({ ...current, frameFinish: "graphite" }))} label="石墨" />
        </div>
      </OptionGroup>

      <OptionGroup label="视图标注">
        <label className="switch-line">
          <span>尺寸标注</span>
          <input type="checkbox" checked={config.showDimensions} onChange={(event) => onChange((current) => ({ ...current, showDimensions: event.target.checked }))} />
        </label>
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

function ColorsTab({
  config,
  selection,
  onChange
}: {
  config: CabinetConfig;
  selection: Selection | null;
  onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void;
}) {
  const activeColor = config.colorScope === "single" && selection ? getCellColor(config, selection) : config.panelColor;

  return (
    <div className="tab-stack">
      <OptionGroup label="作用范围">
        <div className="choice-row">
          <ToggleButton active={config.colorScope === "all"} onClick={() => onChange((current) => ({ ...current, colorScope: "all" }))} label="全部" />
          <ToggleButton active={config.colorScope === "single"} onClick={() => onChange((current) => ({ ...current, colorScope: "single" }))} label="单体" />
        </div>
      </OptionGroup>

      <OptionGroup label="板件颜色">
        <div className="swatch-grid">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color.id}
              className={activeColor === color.value ? "swatch active" : "swatch"}
              type="button"
              style={{ backgroundColor: color.value, color: color.text }}
              onClick={() => onChange((current) => (
                current.colorScope === "single" && selection ? setCellColor(current, selection, color.value) : setPanelColor(current, color.value)
              ))}
            >
              {activeColor === color.value ? <Check size={16} /> : null}
              <span>{color.label}</span>
            </button>
          ))}
        </div>
      </OptionGroup>
    </div>
  );
}

function BomTab({
  bom,
  price,
  priceSource,
  priceSummary,
  onExport,
  onExportPriceSource,
  onImportPriceSource,
  onResetPriceSource
}: {
  bom: PricedBomItem[];
  price: number;
  priceSource: DealerPriceSource;
  priceSummary: ReturnType<typeof summarizePriceMatches>;
  onExport: () => void;
  onExportPriceSource: () => void;
  onImportPriceSource: () => void;
  onResetPriceSource: () => void;
}) {
  return (
    <div className="tab-stack">
      <div className="bom-header">
        <div>
          <span>估算价</span>
          <strong>{formatRmb(price)}</strong>
          <em>{priceSource.dealerName} · {priceSource.title}</em>
        </div>
        <button type="button" onClick={onExport}>
          <Download size={16} /> CSV
        </button>
      </div>
      <div className="price-source-actions">
        <button type="button" onClick={onImportPriceSource}><FileUp size={15} /> 导入报价源</button>
        <button type="button" onClick={onExportPriceSource}><FileDown size={15} /> 导出报价源</button>
        <button type="button" onClick={onResetPriceSource}><RotateCcw size={15} /> 默认报价</button>
      </div>
      <div className="price-source-summary">
        <span>命中 {priceSummary.sourceExact}</span>
        <span>组合 {priceSummary.sourceComposite}</span>
        <span>公式 {priceSummary.sourceFormula}</span>
        <span>含入 {priceSummary.sourceIncluded}</span>
        <span>回退 {priceSummary.fallback}</span>
      </div>
      <div className="bom-table">
        {bom.map((item) => (
          <div className={`bom-row price-${item.priceStatus}`} key={`${item.name}-${item.spec}-${item.priceStatus}`}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.spec}</span>
              <small>{priceStatusLabel(item.priceStatus)}{item.priceSourceRows.length ? ` · 行 ${item.priceSourceRows.join("+")}` : ""}</small>
            </div>
            <b>
              {item.qty}{item.unit}
              <span>{formatRmb(item.unitPrice)}</span>
            </b>
          </div>
        ))}
      </div>
    </div>
  );
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

function loadConfig(): CabinetConfig {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalizeConfig(stored ? JSON.parse(stored) : DEFAULT_CONFIG);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadPriceSource(): DealerPriceSource {
  try {
    const stored = window.localStorage.getItem(PRICE_SOURCE_STORAGE_KEY);
    return normalizeDealerPriceSource(stored ? JSON.parse(stored) : DEFAULT_DEALER_PRICE_SOURCE);
  } catch {
    return DEFAULT_DEALER_PRICE_SOURCE;
  }
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function priceStatusLabel(status: PricedBomItem["priceStatus"]): string {
  const labels: Record<PricedBomItem["priceStatus"], string> = {
    sourceExact: "报价表命中",
    sourceComposite: "组合计价",
    sourceFormula: "公式计价",
    sourceIncluded: "已含计价",
    fallback: "默认回退"
  };
  return labels[status];
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
