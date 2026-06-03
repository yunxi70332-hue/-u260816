import {
  Box,
  Camera,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Columns3,
  Download,
  FileDown,
  FileUp,
  Grid3X3,
  Layers3,
  Minus,
  PaintBucket,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  Settings2,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuilderScene } from "./BuilderScene";
import {
  CELL_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_CONFIG,
  DEPTH_OPTIONS,
  FEET_OPTIONS,
  HEIGHT_OPTIONS,
  MIN_CUSTOM_SIZE,
  MAX_CUSTOM_SIZE,
  STRUCTURE_MODE_OPTIONS,
  WIDTH_OPTIONS,
  applyStructureMode,
  buildBom,
  createPreset,
  estimatePrice,
  formatRmb,
  getCellColor,
  getDimensions,
  insertColumn,
  insertRow,
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
  type ColorScope,
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
  const [selection, setSelection] = useState<Selection>({ row: 0, column: 0 });
  const [tab, setTab] = useState<TabKey>("structure");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const bom = useMemo(() => buildBom(config), [config]);
  const price = useMemo(() => estimatePrice(config), [config]);
  const dimensions = useMemo(() => getDimensions(config), [config]);
  const selectedCell = config.cells[selection.row]?.[selection.column] ?? config.cells[0][0];

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateConfig = useCallback((next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => {
    setConfig((current) => normalizeConfig(typeof next === "function" ? next(current) : next));
  }, []);

  const selectCell = useCallback((next: Selection) => {
    setSelection({
      row: Math.max(0, Math.min(next.row, config.rowHeights.length - 1)),
      column: Math.max(0, Math.min(next.column, config.columnWidths.length - 1))
    });
  }, [config.columnWidths.length, config.rowHeights.length]);

  function handleRows(delta: number) {
    updateConfig((current) => {
      const next = resizeRows(current, current.rowHeights.length + delta);
      setSelection((active) => ({ ...active, row: Math.min(active.row, next.rowHeights.length - 1) }));
      return next;
    });
  }

  function handleColumns(delta: number) {
    updateConfig((current) => {
      const next = resizeColumns(current, current.columnWidths.length + delta);
      setSelection((active) => ({ ...active, column: Math.min(active.column, next.columnWidths.length - 1) }));
      return next;
    });
  }

  function expandSelected(direction: "left" | "right" | "top" | "front") {
    updateConfig((current) => {
      if (direction === "left") {
        const next = insertColumn(current, selection.column);
        setSelection((active) => ({ ...active, column: Math.min(active.column + 1, next.columnWidths.length - 1) }));
        return next;
      }

      if (direction === "right") {
        return insertColumn(current, selection.column + 1);
      }

      if (direction === "top") {
        return insertRow(current, selection.row + 1);
      }

      return setDepth(current, current.depth + 100);
    });
  }

  function applyPreset(columns: number, rows: number, kind: CellKind = "drop") {
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
      ...bom.map((item) => [
        item.name,
        item.spec,
        String(item.qty),
        item.unit,
        String(item.unitPrice),
        String(item.qty * item.unitPrice)
      ])
    ];
    downloadFile("usm-bom.csv", lines.map((line) => line.join(",")).join("\n"), "text/csv;charset=utf-8");
    setToast("BOM 已导出");
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
        updateConfig(normalizeConfig(JSON.parse(String(reader.result))));
        setSelection({ row: 0, column: 0 });
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
                <button
                  key={item.id}
                  className={tab === item.id ? "tab active" : "tab"}
                  onClick={() => setTab(item.id)}
                  type="button"
                >
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
                selection={selection}
                selectedKind={selectedCell.kind}
                onDepth={(depth) => updateConfig((current) => setDepth(current, depth))}
                onWidth={(width) => updateConfig((current) => setSelectedColumnWidth(current, selection, width))}
                onHeight={(height) => updateConfig((current) => setSelectedRowHeight(current, selection, height))}
                onRows={handleRows}
                onColumns={handleColumns}
                onCellKind={(kind) => updateConfig((current) => setCellKind(current, selection, kind))}
                onStructureMode={(mode) => updateConfig((current) => applyStructureMode(current, mode))}
                onPreset={applyPreset}
              />
            ) : null}

            {tab === "fittings" ? (
              <FittingsTab config={config} onChange={updateConfig} />
            ) : null}

            {tab === "colors" ? (
              <ColorsTab config={config} selection={selection} onChange={updateConfig} />
            ) : null}

            {tab === "bom" ? (
              <BomTab bom={bom} price={price} onExport={exportBom} />
            ) : null}
          </div>

          <footer className="panel-footer">
            <div>
              <span>选中单元</span>
              <strong>{selection.column + 1} 列 / {selection.row + 1} 层</strong>
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
            selection={selection}
            onSelect={selectCell}
            onReady={(api) => {
              sceneApiRef.current = api;
            }}
          />
          <div className="floating-toolbar">
            <button type="button" className="ghost-button" onClick={() => handleColumns(1)}>
              <Plus size={16} /> 列
            </button>
            <button type="button" className="ghost-button" onClick={() => handleRows(1)}>
              <Plus size={16} /> 层
            </button>
            <button type="button" className="ghost-button" onClick={() => expandSelected("left")}>
              <Plus size={16} /> 左
            </button>
            <button type="button" className="ghost-button" onClick={() => expandSelected("right")}>
              <Plus size={16} /> 右
            </button>
            <button type="button" className="ghost-button" onClick={() => expandSelected("top")}>
              <Plus size={16} /> 上
            </button>
            <button type="button" className="ghost-button" onClick={() => expandSelected("front")}>
              <Plus size={16} /> 深
            </button>
            <button type="button" className="ghost-button" onClick={() => setConfig((current) => ({ ...current, showDimensions: !current.showDimensions }))}>
              <ChevronDown size={16} /> 尺寸
            </button>
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
  selection: Selection;
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
  return (
    <div className="tab-stack">
      <OptionGroup label="深度 mm">
        <SizePicker values={DEPTH_OPTIONS} active={config.depth} onChange={onDepth} />
      </OptionGroup>

      <OptionGroup label={`第 ${selection.column + 1} 列宽度 mm`}>
        <SizePicker values={WIDTH_OPTIONS} active={config.columnWidths[selection.column]} onChange={onWidth} />
      </OptionGroup>

      <OptionGroup label={`第 ${selection.row + 1} 层高度 mm`}>
        <SizePicker values={HEIGHT_OPTIONS} active={config.rowHeights[selection.row]} onChange={onHeight} compact />
      </OptionGroup>

      <div className="stepper-grid">
        <Stepper label="列数" value={config.columnWidths.length} onMinus={() => onColumns(-1)} onPlus={() => onColumns(1)} />
        <Stepper label="层数" value={config.rowHeights.length} onMinus={() => onRows(-1)} onPlus={() => onRows(1)} />
      </div>

      <OptionGroup label="结构元素">
        <div className="cell-kind-grid">
          {CELL_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={selectedKind === option.id ? "kind-button active" : "kind-button"}
              type="button"
              onClick={() => onCellKind(option.id)}
            >
              <span>{option.short}</span>
              {option.label}
            </button>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="快速结构">
        <div className="preset-grid">
          <button type="button" onClick={() => onPreset(1, 1, "drop")}><Box size={16} /> 750 单格</button>
          <button type="button" onClick={() => onPreset(2, 1, "drop")}><Columns3 size={16} /> 双列矮柜</button>
          <button type="button" onClick={() => onPreset(2, 2, "back")}><Grid3X3 size={16} /> 四格柜</button>
          <button type="button" onClick={() => onPreset(3, 2, "open")}><Layers3 size={16} /> 展示柜</button>
        </div>
      </OptionGroup>

      <OptionGroup label="批量结构预设">
        <div className="structure-mode-grid">
          {STRUCTURE_MODE_OPTIONS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={config.structureMode === mode.id ? "mode-button active" : "mode-button"}
              onClick={() => onStructureMode(mode.id)}
            >
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
            <ToggleButton
              key={option.id}
              active={config.feet === option.id}
              onClick={() => onChange((current) => ({ ...current, feet: option.id }))}
              label={option.label}
            />
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
          <input
            type="checkbox"
            checked={config.showDimensions}
            onChange={(event) => onChange((current) => ({ ...current, showDimensions: event.target.checked }))}
          />
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
  selection: Selection;
  onChange: (next: CabinetConfig | ((current: CabinetConfig) => CabinetConfig)) => void;
}) {
  const activeColor = config.colorScope === "single" ? getCellColor(config, selection) : config.panelColor;

  return (
    <div className="tab-stack">
      <OptionGroup label="作用范围">
        <div className="choice-row">
          <ToggleButton
            active={config.colorScope === "all"}
            onClick={() => onChange((current) => ({ ...current, colorScope: "all" }))}
            label="全部"
          />
          <ToggleButton
            active={config.colorScope === "single"}
            onClick={() => onChange((current) => ({ ...current, colorScope: "single" }))}
            label="单体"
          />
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
                current.colorScope === "single"
                  ? setCellColor(current, selection, color.value)
                  : setPanelColor(current, color.value)
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
  compact = false
}: {
  values: readonly number[];
  active: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"}>
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className={active === value ? "active" : ""}
          onClick={() => onChange(value)}
        >
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
  compact = false
}: {
  values: readonly number[];
  active: number;
  onChange: (value: number) => void;
  compact?: boolean;
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
      <Segmented values={values} active={active} onChange={onChange} compact={compact} />
      <label className="custom-size">
        <span>自定义</span>
        <input
          type="number"
          min={MIN_CUSTOM_SIZE}
          max={MAX_CUSTOM_SIZE}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
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
