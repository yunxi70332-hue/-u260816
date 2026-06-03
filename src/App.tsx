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
import { BuilderScene } from "./BuilderScene";
import {
  CELL_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_CONFIG,
  DEPTH_OPTIONS,
  FEET_OPTIONS,
  HEIGHT_OPTIONS,
  MAX_CUSTOM_SIZE,
  MIN_CUSTOM_SIZE,
  STRUCTURE_MODE_OPTIONS,
  WIDTH_OPTIONS,
  applyStructureMode,
  buildBom,
  createPreset,
  deleteCell,
  estimatePrice,
  expandCell,
  findNearestEnabled,
  formatRmb,
  getCellColor,
  getDimensions,
  isCellEnabled,
  normalizeConfig,
  resizeColumns,
  resizeRows,
  setCellColor,
  setCellKind,
  setDepth,
  setPanelColor,
  setSelectedColumnWidth,
  setSelectedRowHeight,
  type CabinetConfig,
  type CellKind,
  type Selection,
  type TabKey
} from "./model";

const STORAGE_KEY = "usm-local-builder-config";

interface SceneApi {
  capturePng: () => string;
}

const tabs: Array<{ id: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "structure", label: "结构", icon: Grid3X3 },
  { id: "fittings", label: "配件", icon: Settings2 },
  { id: "colors", label: "颜色", icon: PaintBucket },
  { id: "bom", label: "BOM", icon: ClipboardList }
];

export default function App() {
  const [config, setConfig] = useState<CabinetConfig>(() => loadConfig());
  const [selection, setSelection] = useState<Selection>(() => findNearestEnabled(loadConfig()));
  const [history, setHistory] = useState<CabinetConfig[]>([]);
  const [tab, setTab] = useState<TabKey>("structure");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const bom = useMemo(() => buildBom(config), [config]);
  const price = useMemo(() => estimatePrice(config), [config]);
  const dimensions = useMemo(() => getDimensions(config), [config]);
  const activeSelection = useMemo(() => findNearestEnabled(config, selection), [config, selection]);
  const selectedCell = config.cells[activeSelection.row]?.[activeSelection.column] ?? config.cells[0][0];

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateConfig = useCallback((next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig), remember = true) => {
    setConfig((current) => {
      const resolved = normalizeConfig(typeof next === "function" ? next(current) : next);
      if (remember && JSON.stringify(resolved) !== JSON.stringify(current)) {
        setHistory((items) => [...items.slice(-24), current]);
      }
      return resolved;
    });
  }, []);

  const selectCell = useCallback((next: Selection | null) => {
    if (!next) {
      setSelection(findNearestEnabled(config));
      return;
    }
    const bounded = {
      row: Math.max(0, Math.min(next.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(next.column, config.columnWidths.length - 1))
    };
    setSelection(findNearestEnabled(config, bounded));
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
    updateConfig(createPreset(columns, rows, kind));
    setSelection({ row: 0, column: 0 });
  }

  function exportJson() {
    downloadFile("usm-config.json", JSON.stringify(config, null, 2), "application/json");
    setToast("配置已导出");
  }

  function exportBom() {
    const lines = [
      ["名称", "规格", "数量", "单位", "单价", "小计"],
      ...bom.map((item) => [item.name, item.spec, String(item.qty), item.unit, String(item.unitPrice), String(item.qty * item.unitPrice)])
    ];
    downloadFile("usm-bom.csv", lines.map((line) => line.join(",")).join("\n"), "text/csv;charset=utf-8");
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
    setSelection({ row: 0, column: 0 });
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
                onWidth={(width) => activeSelection ? updateConfig((current) => setSelectedColumnWidth(current, activeSelection, width)) : undefined}
                onHeight={(height) => activeSelection ? updateConfig((current) => setSelectedRowHeight(current, activeSelection, height)) : undefined}
                onRows={handleRows}
                onColumns={handleColumns}
                onCellKind={(kind) => activeSelection ? updateConfig((current) => setCellKind(current, activeSelection, kind)) : undefined}
                onStructureMode={(mode) => updateConfig((current) => applyStructureMode(current, mode))}
                onPreset={applyPreset}
              />
            ) : null}

            {tab === "fittings" ? <FittingsTab config={config} onChange={updateConfig} /> : null}
            {tab === "colors" ? <ColorsTab config={config} selection={activeSelection} onChange={updateConfig} /> : null}
            {tab === "bom" ? <BomTab bom={bom} price={price} onExport={exportBom} /> : null}
          </div>

          <footer className="panel-footer">
            <div>
              <span>选中单元</span>
              <strong>{activeSelection ? `${activeSelection.column + 1} 列 / ${activeSelection.row + 1} 层` : "未选中"}</strong>
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
            onSelect={selectCell}
            onExpand={expandSelected}
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
  onWidth,
  onHeight,
  onRows,
  onColumns,
  onCellKind,
  onStructureMode,
  onPreset
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedKind: CellKind;
  onDepth: (depth: number) => void;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onRows: (delta: number) => void;
  onColumns: (delta: number) => void;
  onCellKind: (kind: CellKind) => void;
  onStructureMode: (mode: CabinetConfig["structureMode"]) => void;
  onPreset: (columns: number, rows: number, kind?: CellKind) => void;
}) {
  const selectedColumn = selection?.column ?? 0;
  const selectedRow = selection?.row ?? 0;

  return (
    <div className="tab-stack">
      <OptionGroup label="深度 mm">
        <SizePicker values={DEPTH_OPTIONS} active={config.depth} onChange={onDepth} />
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

      <OptionGroup label="结构元素">
        <div className="cell-kind-grid icon-mode">
          {CELL_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={selectedKind === option.id ? "kind-button active" : "kind-button"}
              type="button"
              title={option.label}
              disabled={!selection}
              onClick={() => onCellKind(option.id)}
            >
              <span>{option.short}</span>
              <small>{option.label}</small>
            </button>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="快速结构">
        <div className="preset-grid">
          <button type="button" onClick={() => onPreset(1, 1, "metalBackModule")}><Box size={16} /> 750 单格</button>
          <button type="button" onClick={() => onPreset(2, 1, "metalBackModule")}><Columns3 size={16} /> 双列矮柜</button>
          <button type="button" onClick={() => onPreset(2, 2, "openBackPanel")}><Grid3X3 size={16} /> 四格柜</button>
          <button type="button" onClick={() => onPreset(3, 2, "open")}><Layers3 size={16} /> 展示柜</button>
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

function FittingsTab({ config, onChange }: { config: CabinetConfig; onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void }) {
  return (
    <div className="tab-stack">
      <OptionGroup label="底部支撑">
        <div className="choice-row three">
          {FEET_OPTIONS.map((option) => (
            <ToggleButton key={option.id} active={config.feet === option.id} onClick={() => onChange((current) => ({ ...current, feet: option.id }))} label={option.label} />
          ))}
        </div>
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

function BomTab({ bom, price, onExport }: { bom: ReturnType<typeof buildBom>; price: number; onExport: () => void }) {
  return (
    <div className="tab-stack">
      <div className="bom-header">
        <div>
          <span>估算价</span>
          <strong>{formatRmb(price)}</strong>
        </div>
        <button type="button" onClick={onExport}>
          <Download size={16} /> CSV
        </button>
      </div>
      <div className="bom-table">
        {bom.map((item) => (
          <div className="bom-row" key={`${item.name}-${item.spec}`}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.spec}</span>
            </div>
            <b>{item.qty}{item.unit}</b>
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

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "toggle active" : "toggle"} type="button" onClick={onClick}>
      {active ? <Check size={16} /> : null}
      {label}
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

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
