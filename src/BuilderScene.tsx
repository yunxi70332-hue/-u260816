import { Canvas, useThree } from "@react-three/fiber";
import { Billboard, ContactShadows, OrbitControls } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CabinetConfig, CellConfig, CellFittingKind, CellFrontAccessoryKind, CellInteriorAccessory, CellKind, GlassDoorHandleSide, Selection, StructureFrameKey, StructurePanelKey, StructurePanelMaterial, StructureVertexKey, WorkSurfaceConfig, WorkSurfaceKind } from "./model";
import {
  getDepthSegments,
  getDimensions,
  getEffectiveCellColor,
  getEffectiveStructureFrameVisible,
  getEffectiveStructurePanelMaterial,
  getEffectiveStructureVertexVisible,
  getPlanCellConfig,
  getPlanCells,
  RIMMED_DRAWER_RIM_HEIGHT_MM
} from "./model";

interface SceneApi {
  capturePng: () => string;
}

interface BuilderSceneProps {
  config: CabinetConfig;
  selection: Selection | null;
  selectedAccessory: SelectedAccessory;
  onSelect: (selection: Selection | null) => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
  onDrawerPull: DrawerPullHandler;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onReady: (api: SceneApi) => void;
}

export type SelectedAccessory = { cell: Selection; accessoryId: string } | null;

type DrawerPullHandler = (selection: Selection, value: number, remember?: boolean, interiorAccessoryId?: string) => void;

interface LayoutCell {
  row: number;
  column: number;
  depthIndex: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

interface LayoutWorkSurface {
  id: string;
  kind: WorkSurfaceKind;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  thickness: number;
  color?: string;
}

interface Segment {
  key: string;
  length: number;
  position: [number, number, number];
}

type DimensionOrientation = "horizontal" | "vertical";

interface DimensionGuide {
  key: string;
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  orientation?: DimensionOrientation;
  labelOffset?: [number, number, number];
  extensionStart?: [number, number, number];
  extensionEnd?: [number, number, number];
}

const SCALE = 0.004;
const TUBE_RADIUS = 9.5 * SCALE;
const BALL_RADIUS = 11.697973 * SCALE;
const PANEL_THICKNESS = 0.035;
// Derived from the official DWG blech blocks: edges sit ~7.8 mm in from
// the frame centerlines and the sheet crosses the tube center plane.
const STEEL_PANEL_THICKNESS = 14.5 * SCALE;
const STEEL_PANEL_EDGE_INSET = 7.8 * SCALE;
const DESK_TOP_CLEARANCE = BALL_RADIUS + 0.02;
// Official DWG glass blocks use 6 mm glass with 10.5 mm edge clearance.
const GLASS_THICKNESS = 6 * SCALE;
const GLASS_EDGE_GAP = 10.5 * SCALE;
const GLASS_CLIP_EDGE_INSET = 7 * SCALE;
const EXPAND_HINT_FACE_OFFSET = 0.18;
const EXPAND_HINT_FRONT_OFFSET = 0.68;
const MOBILE_TRAY_SCREEN_HIT_MARGIN = 28;
const FRAME_TUBE_350_ASSET_URL = "/assets/frame/tube-350.glb";
const FRAME_TUBE_750_ASSET_URL = "/assets/frame/tube-750.glb";
const FRAME_BALL_ASSET_URL = "/assets/frame/ball.glb";
const FRAME_TUBE_350_TEMPLATE_LENGTH = 350 * SCALE;
const FRAME_TUBE_750_TEMPLATE_LENGTH = 750 * SCALE;
const OFFICIAL_CHROME_COLOR = "#bebebe";
const OFFICIAL_CHROME_METALNESS = 0.28;
const OFFICIAL_CHROME_ROUGHNESS = 0.36;
const OFFICIAL_ZINC_COLOR = "#6f6f6f";
const OFFICIAL_BLACK_PLASTIC_COLOR = "#282828";
const DROP_DOOR_HINGE_METAL_COLOR = "#747b7f";
const DROP_DOOR_HINGE_DARK_COLOR = "#383d40";
const DROP_DOOR_ASSET_URL = "/assets/drop-door/drop-door-assembly.glb";
const DROP_DOOR_HINGE_ASSET_URL = "/assets/drop-door/drop-door-hinges.glb";
const FLIP_UP_DOOR_PANEL_ASSET_URL = "/assets/flip-up-door/panel.glb";
const FLIP_UP_DOOR_LOCK_ASSET_URL = "/assets/flip-up-door/lock.glb";
const COMBO_MOBILE_TRAY_ASSET_URL = "/assets/door-interior-combo/mobile-tray-single.glb";
const COMBO_MOBILE_TRAY_RAILS_ASSET_URL = "/assets/door-interior-combo/mobile-tray-rails-single.glb";
const DROP_DOOR_ASSET_TEMPLATE_WIDTH = 2.9;
const DROP_DOOR_ASSET_TEMPLATE_HEIGHT = 1.3;
const FLIP_UP_DOOR_ASSET_TEMPLATE_WIDTH = 2.9;
const FLIP_UP_DOOR_ASSET_TEMPLATE_HEIGHT = 1.3;
const DIMENSION_LINE_COLOR = "#5f676c";
const DIMENSION_EXTENSION_COLOR = "#b9c1c7";
const DIMENSION_LABEL_COLOR = "#3f474d";
const DIMENSION_SIDE_OFFSET = 0.34;
const DIMENSION_TICK = 0.045;
const DIMENSION_LINE_RADIUS = 0.0048;
const DIMENSION_EXTENSION_RADIUS = 0.0032;
interface FrameAssets {
  tube350: THREE.Group;
  tube750: THREE.Group;
  ball: THREE.Group;
}
interface DoorAssetParts {
  panel: THREE.Group;
  lock: THREE.Group;
}
interface DoorInteriorComboAssets {
  mobileTray: THREE.Group;
  mobileTrayRails: THREE.Group;
}

let frameAssetsPromise: Promise<FrameAssets | null> | null = null;
let dropDoorAssetPromise: Promise<THREE.Group | null> | null = null;
let dropDoorHingeAssetPromise: Promise<THREE.Group | null> | null = null;
let flipUpDoorAssetPartsPromise: Promise<DoorAssetParts | null> | null = null;
let doorInteriorComboAssetsPromise: Promise<DoorInteriorComboAssets | null> | null = null;
const mobileTrayHitboxesByCanvas = new WeakMap<HTMLCanvasElement, Set<THREE.Mesh>>();

type ScreenBounds = { minX: number; maxX: number; minY: number; maxY: number };
type MobileTrayHitboxUserData = {
  getScreenBounds?: (rect: DOMRect) => ScreenBounds | null;
  isInteractionDisabled?: () => boolean;
};
type MobileTrayHitCandidate = {
  object: THREE.Mesh;
  rayHit: THREE.Intersection<THREE.Object3D> | null;
  screenDistance: number;
  distance: number;
};

function sameSelection(a: Selection, b: Selection) {
  return a.row === b.row && a.column === b.column && (a.depthIndex ?? 0) === (b.depthIndex ?? 0);
}

export function BuilderScene({ config, selection, selectedAccessory, onSelect, onSelectAccessory, onExpand, onDrawerPull, onDoorOpen, onReady }: BuilderSceneProps) {
  const metrics = getSceneMetrics(config);
  const [drawerDragging, setDrawerDragging] = useState(false);

  return (
    <Canvas
      className="scene-canvas"
      data-selected-accessory={selectedAccessory?.accessoryId ?? ""}
      data-selected-accessory-cell={selectedAccessory ? `${selectedAccessory.cell.row}:${selectedAccessory.cell.depthIndex ?? 0}:${selectedAccessory.cell.column}` : ""}
      shadows
      camera={{ position: [3.8, 2.6, 4.3], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#edf1f3"]} />
      <fog attach="fog" args={["#edf1f3", 24, 64]} />
      <Suspense fallback={null}>
        <SceneReady onReady={onReady} />
        <CameraRig metrics={metrics} />
        <ambientLight intensity={0.86} />
        <directionalLight
          position={[3, 6, 5]}
          intensity={1.35}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.00035}
          shadow-normalBias={0.035}
        />
        <directionalLight position={[-4, 3, -2]} intensity={0.58} />
        <directionalLight position={[0, 2.8, -5]} intensity={0.42} />
        <CabinetModel
          config={config}
          selection={selection}
          selectedAccessory={selectedAccessory}
          onSelect={onSelect}
          onSelectAccessory={onSelectAccessory}
          onExpand={onExpand}
          onDrawerPull={onDrawerPull}
          onDoorOpen={onDoorOpen}
          onDrawerDragActive={setDrawerDragging}
        />
        <Ground />
        <ContactShadows opacity={0.28} scale={10} blur={2.6} far={4.8} resolution={512} color="#5b6670" />
        <OrbitControls
          makeDefault
          enabled={!drawerDragging}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.3}
          maxDistance={60}
          target={[metrics.centerX, metrics.centerY, metrics.centerZ]}
        />
      </Suspense>
    </Canvas>
  );
}

function SceneReady({ onReady }: { onReady: (api: SceneApi) => void }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    onReady({
      capturePng: () => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      }
    });
  }, [camera, gl, onReady, scene]);

  return null;
}

function CameraRig({ metrics }: { metrics: ReturnType<typeof getSceneMetrics> }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = Math.max(0.42, size.width / Math.max(1, size.height));
    const target = new THREE.Vector3(metrics.centerX, metrics.centerY, metrics.centerZ);
    const narrow = size.width < 560;
    const wideCabinet = metrics.totalWidth > 4.2;
    const distance = Math.max(4.4, (metrics.totalWidth * (wideCabinet ? 2.35 : 1.38)) / aspect, metrics.totalHeight * 2.2, metrics.depth * 4);
    const direction = new THREE.Vector3(wideCabinet ? 0.34 : narrow ? 0.38 : 0.64, 0.42, wideCabinet || narrow ? 0.82 : 0.72).normalize();
    camera.position.copy(target.clone().add(direction.multiplyScalar(distance)));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, metrics.centerX, metrics.centerY, metrics.centerZ, metrics.depth, metrics.totalHeight, metrics.totalWidth, size.height, size.width]);

  return null;
}

function CabinetModel({
  config,
  selection,
  selectedAccessory,
  onSelect,
  onSelectAccessory,
  onExpand,
  onDrawerPull,
  onDoorOpen,
  onDrawerDragActive
}: {
  config: CabinetConfig;
  selection: Selection | null;
  selectedAccessory: SelectedAccessory;
  onSelect: (selection: Selection | null) => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
  onDrawerPull: DrawerPullHandler;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDrawerDragActive: (active: boolean) => void;
}) {
  const layout = useMemo(() => createLayout(config), [config]);
  const frameColor = config.frameFinish === "chrome" ? OFFICIAL_CHROME_COLOR : "#2b2f32";
  const metalness = config.frameFinish === "chrome" ? OFFICIAL_CHROME_METALNESS : 0.65;
  const roughness = config.frameFinish === "chrome" ? OFFICIAL_CHROME_ROUGHNESS : 0.34;

  return (
    <group position={[0, 0.05, 0]}>
      {layout.points.map((point) => (
        <FrameBall key={point.key} position={point.position} color={frameColor} metalness={metalness} roughness={roughness} />
      ))}

      {layout.xSegments.map((segment) => (
        <Tube key={`x-${segment.key}`} axis="x" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
      ))}
      {layout.ySegments.map((segment) => (
        <Tube key={`y-${segment.key}`} axis="y" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
      ))}
      {layout.zSegments.map((segment) => (
        <Tube key={`z-${segment.key}`} axis="z" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
      ))}

      {layout.cells.map((cell) => {
        const cellConfig = getPlanCellConfig(config, cell.row, cell.depthIndex, cell.column);
        if (!cellConfig) return null;
        const rawKind = cellConfig.kind;
        const kind = config.structureMode === "noPanels" || config.structureMode === "frameOnly" ? "open" : rawKind;
        const cellSelection = { row: cell.row, column: cell.column, depthIndex: cell.depthIndex };
        const selectedAccessoryId = selectedAccessory && sameSelection(selectedAccessory.cell, cellSelection)
          ? selectedAccessory.accessoryId
          : undefined;
        return (
          <CellContent
            key={`cell-${cell.row}-${cell.depthIndex}-${cell.column}`}
            cell={cell}
            cellConfig={cellConfig}
            kind={kind}
            doorOpen={cellConfig.doorOpen ?? 0.48}
            fitting={cellConfig.fitting ?? "none"}
            drawerPull={cellConfig.drawerPull ?? 1}
            color={getEffectiveCellColor(config, cell.row, cell.column, cell.depthIndex)}
            structureMode={config.structureMode}
            selected={selection?.row === cell.row && selection.column === cell.column && (selection.depthIndex ?? 0) === cell.depthIndex}
            selectedAccessoryId={selectedAccessoryId}
            onSelect={() => onSelect({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex })}
            onSelectAccessory={onSelectAccessory}
            onExpand={onExpand}
            onDrawerPull={onDrawerPull}
            onDoorOpen={onDoorOpen}
            onDrawerDragActive={onDrawerDragActive}
          />
        );
      })}

      {config.structureMode !== "frameOnly" ? (
        layout.workSurfaces.map((surface) => (
          <WorkSurface
            key={surface.id}
            surface={surface}
            fallbackColor={config.panelColor}
            frameColor={frameColor}
            metalness={metalness}
            roughness={roughness}
            supportBottomY={layout.minY}
          />
        ))
      ) : null}

      <Feet layout={layout} feet={config.feet} />
      {config.showDimensions ? <DimensionLabels layout={layout} config={config} /> : null}
    </group>
  );
}

function CellContent({
  cell,
  cellConfig,
  kind,
  doorOpen,
  fitting,
  drawerPull,
  color,
  structureMode,
  selected,
  selectedAccessoryId,
  onSelect,
  onSelectAccessory,
  onExpand,
  onDrawerPull,
  onDoorOpen,
  onDrawerDragActive
}: {
  cell: LayoutCell;
  cellConfig: CellConfig;
  kind: CellKind;
  doorOpen: number;
  fitting: CellFittingKind;
  drawerPull: number;
  color: string;
  structureMode: CabinetConfig["structureMode"];
  selected: boolean;
  selectedAccessoryId?: string;
  onSelect: () => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
  onDrawerPull: DrawerPullHandler;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDrawerDragActive: (active: boolean) => void;
}) {
  const frontZ = cell.z + cell.depth / 2;
  const backZ = cell.z - cell.depth / 2;
  const innerDepth = officialPanelSpan(cell.depth);
  const hideFront = structureMode === "noFront";
  const faceSide = cellConfig.faceSide ?? "front";
  const frontAccessory = cellConfig.frontAccessory ?? "none";
  const hasInteractiveFront = frontAccessory === "dropDoor"
    || frontAccessory === "flipUpDoor"
    || frontAccessory === "glassDropDoor"
    || kind === "dropDoor"
    || kind === "flipUpDoor"
    || kind === "pullOutShelf"
    || (cellConfig.interiorAccessories ?? []).some((item) => item.kind === "mobileTray")
    || fitting === "rimmedDrawer";
  const localCell = faceSide === "back" ? { ...cell, x: 0, y: 0, z: 0 } : cell;
  const accessoryGeometry = (
    <AccessoryGeometry
      kind={kind}
      doorOpen={doorOpen}
      frontAccessory={frontAccessory}
      glassDoorHandleSide={cellConfig.glassDoorHandleSide ?? "right"}
      interiorAccessories={structureMode === "noPanels" ? [] : cellConfig.interiorAccessories ?? []}
      fitting={structureMode === "noPanels" ? "none" : fitting}
      drawerPull={drawerPull}
      cell={localCell}
      color={color}
      frontZ={faceSide === "back" ? cell.depth / 2 : frontZ}
      backZ={faceSide === "back" ? -cell.depth / 2 : backZ}
      innerDepth={innerDepth}
      hideFront={hideFront}
      selectedAccessoryId={selectedAccessoryId}
      onSelect={onSelect}
      onSelectAccessory={onSelectAccessory}
      onDrawerPull={onDrawerPull}
      onDoorOpen={onDoorOpen}
      onDrawerDragActive={onDrawerDragActive}
    />
  );

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {structureMode !== "frameOnly" ? (
        <>
          <CellShell cell={cell} cellConfig={cellConfig} kind={kind} color={color} hideFront={hideFront} />
          {faceSide === "back" ? (
            <group position={[cell.x, cell.y, cell.z]} rotation={[0, Math.PI, 0]}>
              {accessoryGeometry}
            </group>
          ) : accessoryGeometry}
        </>
      ) : null}

      <CellHitTarget cell={cell} onSelect={onSelect} />

      {selected ? (
        <>
          {!hasInteractiveFront ? <SelectedCellScreenHitArea cell={cell} onSelect={onSelect} /> : null}
          <SelectionFrame cell={cell} />
          {cellConfig.frontAccessory === "glassDropDoor" ? null : <ExpandHints cell={cell} onExpand={onExpand} />}
        </>
      ) : null}
    </group>
  );
}

function SelectedCellScreenHitArea({ cell, onSelect }: { cell: LayoutCell; onSelect: () => void }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const scratch = new THREE.Vector3();

    function projectPoint(rect: DOMRect, point: THREE.Vector3) {
      scratch.copy(point).project(camera);
      return {
        x: rect.left + ((scratch.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - scratch.y) / 2) * rect.height
      };
    }

    function getSelectedFaceBounds(rect: DOMRect) {
      const x0 = cell.x - cell.width / 2;
      const x1 = cell.x + cell.width / 2;
      const y0 = cell.y - cell.height / 2;
      const y1 = cell.y + cell.height / 2;
      const z = cell.z + cell.depth / 2 + 0.006;
      const corners = [
        projectPoint(rect, new THREE.Vector3(x0, y0, z)),
        projectPoint(rect, new THREE.Vector3(x0, y1, z)),
        projectPoint(rect, new THREE.Vector3(x1, y0, z)),
        projectPoint(rect, new THREE.Vector3(x1, y1, z))
      ];
      const margin = 10;
      return {
        minX: Math.min(...corners.map((point) => point.x)) - margin,
        maxX: Math.max(...corners.map((point) => point.x)) + margin,
        minY: Math.min(...corners.map((point) => point.y)) - margin,
        maxY: Math.max(...corners.map((point) => point.y)) + margin
      };
    }

    function isNearExpandHint(rect: DOMRect, clientX: number, clientY: number) {
      const z = cell.z + cell.depth / 2 + EXPAND_HINT_FACE_OFFSET;
      const positions = [
        new THREE.Vector3(cell.x - cell.width / 2 - 0.16, cell.y, z),
        new THREE.Vector3(cell.x + cell.width / 2 + 0.16, cell.y, z),
        new THREE.Vector3(cell.x, cell.y + cell.height / 2 + 0.16, z),
        new THREE.Vector3(cell.x, cell.y, cell.z + cell.depth / 2 + EXPAND_HINT_FRONT_OFFSET)
      ];
      const radius = 14;
      return positions.some((position) => {
        const projected = projectPoint(rect, position);
        const dx = clientX - projected.x;
        const dy = clientY - projected.y;
        return dx * dx + dy * dy <= radius * radius;
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      if (isNearExpandHint(rect, event.clientX, event.clientY)) return;
      const bounds = getSelectedFaceBounds(rect);
      if (
        event.clientX < bounds.minX
        || event.clientX > bounds.maxX
        || event.clientY < bounds.minY
        || event.clientY > bounds.maxY
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelect();
    }

    canvas.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [camera, cell.depth, cell.height, cell.width, cell.x, cell.y, cell.z, gl, onSelect]);

  return null;
}

function CellHitTarget({ cell, onSelect }: { cell: LayoutCell; onSelect: () => void }) {
  const handlePointerDown = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect();
  };
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <>
      <mesh
        position={[cell.x, cell.y, cell.z + cell.depth / 2 + 0.006]}
        renderOrder={7}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <planeGeometry args={[cell.width, cell.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        position={[cell.x, cell.y, cell.z]}
        renderOrder={5}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <boxGeometry args={[cell.width, cell.height, cell.depth]} />
        <meshBasicMaterial transparent opacity={0} color="#ffe500" depthWrite={false} />
      </mesh>
    </>
  );
}

function CellShell({
  cell,
  cellConfig,
  kind,
  color,
  hideFront
}: {
  cell: LayoutCell;
  cellConfig: CellConfig;
  kind: CellKind;
  color: string;
  hideFront: boolean;
}) {
  const panels: Array<{ key: StructurePanelKey; orientation: "back" | "horizontal" | "side"; metalPosition: [number, number, number]; metalArgs: [number, number, number]; glassPosition: [number, number, number]; glassArgs: [number, number, number] }> = [
    {
      key: "front",
      orientation: "back",
      metalPosition: [cell.x, cell.y, cell.z + cell.depth / 2],
      metalArgs: [officialPanelSpan(cell.width), officialPanelSpan(cell.height), STEEL_PANEL_THICKNESS],
      glassPosition: [cell.x, cell.y, cell.z + cell.depth / 2 + GLASS_THICKNESS / 2],
      glassArgs: [cell.width - GLASS_EDGE_GAP * 2, cell.height - GLASS_EDGE_GAP * 2, GLASS_THICKNESS]
    },
    {
      key: "back",
      orientation: "back",
      metalPosition: [cell.x, cell.y, cell.z - cell.depth / 2],
      metalArgs: [officialPanelSpan(cell.width), officialPanelSpan(cell.height), STEEL_PANEL_THICKNESS],
      glassPosition: [cell.x, cell.y, cell.z - cell.depth / 2 - GLASS_THICKNESS / 2],
      glassArgs: [cell.width - GLASS_EDGE_GAP * 2, cell.height - GLASS_EDGE_GAP * 2, GLASS_THICKNESS]
    },
    {
      key: "left",
      orientation: "side",
      metalPosition: [cell.x - cell.width / 2, cell.y, cell.z],
      metalArgs: [STEEL_PANEL_THICKNESS, officialPanelSpan(cell.height), officialPanelSpan(cell.depth)],
      glassPosition: [cell.x - cell.width / 2 + GLASS_THICKNESS / 2, cell.y, cell.z],
      glassArgs: [GLASS_THICKNESS, cell.height - GLASS_EDGE_GAP * 2, cell.depth - GLASS_EDGE_GAP * 2]
    },
    {
      key: "right",
      orientation: "side",
      metalPosition: [cell.x + cell.width / 2, cell.y, cell.z],
      metalArgs: [STEEL_PANEL_THICKNESS, officialPanelSpan(cell.height), officialPanelSpan(cell.depth)],
      glassPosition: [cell.x + cell.width / 2 - GLASS_THICKNESS / 2, cell.y, cell.z],
      glassArgs: [GLASS_THICKNESS, cell.height - GLASS_EDGE_GAP * 2, cell.depth - GLASS_EDGE_GAP * 2]
    },
    {
      key: "top",
      orientation: "horizontal",
      metalPosition: [cell.x, cell.y + cell.height / 2, cell.z],
      metalArgs: [officialPanelSpan(cell.width), STEEL_PANEL_THICKNESS, officialPanelSpan(cell.depth)],
      glassPosition: [cell.x, cell.y + cell.height / 2 - GLASS_THICKNESS / 2, cell.z],
      glassArgs: [cell.width - GLASS_EDGE_GAP * 2, GLASS_THICKNESS, cell.depth - GLASS_EDGE_GAP * 2]
    },
    {
      key: "bottom",
      orientation: "horizontal",
      metalPosition: [cell.x, cell.y - cell.height / 2, cell.z],
      metalArgs: [officialPanelSpan(cell.width), STEEL_PANEL_THICKNESS, officialPanelSpan(cell.depth)],
      glassPosition: [cell.x, cell.y - cell.height / 2 + GLASS_THICKNESS / 2, cell.z],
      glassArgs: [cell.width - GLASS_EDGE_GAP * 2, GLASS_THICKNESS, cell.depth - GLASS_EDGE_GAP * 2]
    }
  ];
  const metalMaterial = <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} side={THREE.DoubleSide} />;

  return (
    <group>
      {panels.map((panel) => {
        if (panel.key === "front" && hideFront) return null;
        const material = getEffectiveStructurePanelMaterial(cellConfig, kind, panel.key);
        if (material === "none") return null;
        if (material === "glass") {
          return (
            <GlassPanel
              key={panel.key}
              orientation={panel.orientation}
              position={panel.glassPosition}
              args={normalizePanelArgs(panel.glassArgs)}
            />
          );
        }
        return (
          <PanelBox key={panel.key} position={panel.metalPosition} args={normalizePanelArgs(panel.metalArgs)}>
            {metalMaterial}
          </PanelBox>
        );
      })}
    </group>
  );
}

function officialPanelSpan(length: number): number {
  return Math.max(0.05, length - STEEL_PANEL_EDGE_INSET * 2);
}

function normalizePanelArgs(args: [number, number, number]): [number, number, number] {
  return [
    Math.max(0.01, args[0]),
    Math.max(0.01, args[1]),
    Math.max(0.01, args[2])
  ];
}

function getScreenAxisForLocalVector(object: THREE.Object3D, camera: THREE.Camera, rect: DOMRect, localVector: THREE.Vector3) {
  object.updateWorldMatrix(true, false);
  const start = object.localToWorld(new THREE.Vector3(0, 0, 0));
  const end = object.localToWorld(localVector.clone());
  return getScreenAxisForWorldPoints(camera, rect, start, end);
}

function getScreenAxisForWorldPoints(camera: THREE.Camera, rect: DOMRect, startPoint: THREE.Vector3, endPoint: THREE.Vector3) {
  const start = startPoint.clone().project(camera);
  const end = endPoint.clone().project(camera);
  const startX = rect.left + ((start.x + 1) / 2) * rect.width;
  const startY = rect.top + ((1 - start.y) / 2) * rect.height;
  const endX = rect.left + ((end.x + 1) / 2) * rect.width;
  const endY = rect.top + ((1 - end.y) / 2) * rect.height;
  const axisX = endX - startX;
  const axisY = endY - startY;
  const axisLengthSq = axisX * axisX + axisY * axisY;
  return axisLengthSq > 4 ? { axisX, axisY, axisLengthSq } : null;
}

function getMobileTrayHitboxes(canvas: HTMLCanvasElement) {
  let hitboxes = mobileTrayHitboxesByCanvas.get(canvas);
  if (!hitboxes) {
    hitboxes = new Set<THREE.Mesh>();
    mobileTrayHitboxesByCanvas.set(canvas, hitboxes);
  }
  return hitboxes;
}

function isInsideScreenBounds(bounds: ScreenBounds | null, clientX: number, clientY: number) {
  return !!bounds
    && clientX >= bounds.minX
    && clientX <= bounds.maxX
    && clientY >= bounds.minY
    && clientY <= bounds.maxY;
}

function getObjectScreenBounds(object: THREE.Object3D, camera: THREE.Camera, rect: DOMRect, margin: number): ScreenBounds | null {
  object.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z)
  ].map((point) => {
    const projected = point.project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height
    };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!corners.length) return null;
  return {
    minX: Math.min(...corners.map((point) => point.x)) - margin,
    maxX: Math.max(...corners.map((point) => point.x)) + margin,
    minY: Math.min(...corners.map((point) => point.y)) - margin,
    maxY: Math.max(...corners.map((point) => point.y)) + margin
  };
}

function getClosestMobileTrayHitbox(
  hitboxes: Set<THREE.Mesh>,
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  rect: DOMRect,
  clientX: number,
  clientY: number
): MobileTrayHitCandidate | null {
  const rayHits = new Map<THREE.Mesh, THREE.Intersection<THREE.Object3D>>();
  const hitboxItems = Array.from(hitboxes);
  raycaster.intersectObjects(hitboxItems, false).forEach((hit) => {
    if (hit.object instanceof THREE.Mesh && !rayHits.has(hit.object)) {
      rayHits.set(hit.object, hit);
    }
  });

  let closest: MobileTrayHitCandidate | null = null;

  for (const hitbox of hitboxItems) {
    const userData = hitbox.userData as MobileTrayHitboxUserData;
    if (userData.isInteractionDisabled?.()) continue;
    const getScreenBounds = userData.getScreenBounds;
    const bounds = getScreenBounds?.(rect) ?? null;
    const inBounds = isInsideScreenBounds(bounds, clientX, clientY);
    if (!inBounds) continue;

    const x = bounds ? (bounds.minX + bounds.maxX) / 2 : clientX;
    const y = bounds ? (bounds.minY + bounds.maxY) / 2 : clientY;
    const screenDistance = (x - clientX) ** 2 + (y - clientY) ** 2;
    const rayHit = rayHits.get(hitbox) ?? null;
    const candidate = {
      object: hitbox,
      rayHit,
      screenDistance,
      distance: rayHit?.distance ?? Number.POSITIVE_INFINITY
    };
    const shouldPrefer = !closest
      || (!!candidate.rayHit && !closest.rayHit)
      || (
        !!candidate.rayHit === !!closest.rayHit
        && (
          candidate.screenDistance < closest.screenDistance
          || (candidate.screenDistance === closest.screenDistance && candidate.distance < closest.distance)
        )
      );
    if (shouldPrefer) {
      closest = candidate;
    }
  }

  return closest;
}

function getWorldDirectionForLocalVector(object: THREE.Object3D, localVector: THREE.Vector3) {
  object.updateWorldMatrix(true, false);
  const start = object.localToWorld(new THREE.Vector3(0, 0, 0));
  const end = object.localToWorld(localVector.clone());
  return end.sub(start).normalize();
}

function AccessoryGeometry({
  kind,
  doorOpen,
  frontAccessory,
  glassDoorHandleSide,
  interiorAccessories,
  fitting,
  drawerPull,
  cell,
  color,
  frontZ,
  backZ,
  innerDepth,
  hideFront,
  selectedAccessoryId,
  onSelect,
  onSelectAccessory,
  onDrawerPull,
  onDoorOpen,
  onDrawerDragActive
}: {
  kind: CellKind;
  doorOpen: number;
  frontAccessory: CellFrontAccessoryKind;
  glassDoorHandleSide: GlassDoorHandleSide;
  interiorAccessories: CellInteriorAccessory[];
  fitting: CellFittingKind;
  drawerPull: number;
  cell: LayoutCell;
  color: string;
  frontZ: number;
  backZ: number;
  innerDepth: number;
  hideFront: boolean;
  selectedAccessoryId?: string;
  onSelect: () => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onDrawerPull: DrawerPullHandler;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDrawerDragActive: (active: boolean) => void;
}) {
  const glass = <meshPhysicalMaterial color="#cfeefa" metalness={0.02} roughness={0.04} transmission={0.4} opacity={0.38} transparent />;
  const effectiveFront = frontAccessory !== "none" ? frontAccessory : kind === "dropDoor" || kind === "flipUpDoor" ? kind : "none";
  const frontGeometry = (
    <>
      {effectiveFront === "dropDoor" ? (
        <DropDoor
          cell={cell}
          frontZ={frontZ}
          backZ={backZ}
          innerDepth={innerDepth}
          color={color}
          doorOpen={doorOpen}
          hideDoor={hideFront}
          onSelect={onSelect}
          onDoorOpen={onDoorOpen}
          onDoorDragActive={onDrawerDragActive}
        />
      ) : null}
      {effectiveFront === "flipUpDoor" ? (
        <FlipUpDoor
          cell={cell}
          frontZ={frontZ}
          backZ={backZ}
          innerDepth={innerDepth}
          color={color}
          doorOpen={doorOpen}
          hideDoor={hideFront}
          onSelect={onSelect}
          onDoorOpen={onDoorOpen}
          onDoorDragActive={onDrawerDragActive}
        />
      ) : null}
      {!hideFront && effectiveFront === "glassDropDoor" ? (
        <GlassDoor
          cell={cell}
          frontZ={frontZ}
          handleSide={glassDoorHandleSide}
          doorOpen={doorOpen}
          onSelect={onSelect}
          onDoorOpen={onDoorOpen}
          onDoorDragActive={onDrawerDragActive}
        />
      ) : null}
    </>
  );

  return (
    <group>
      {kind === "softPanelLow" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.9} heightRatio={0.36} yBias={-0.18} /> : null}
      {kind === "softPanelWide" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.88} heightRatio={0.48} yBias={0} /> : null}
      {kind === "softPanelTall" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.42} heightRatio={0.86} yBias={0} /> : null}

      {kind === "shelf" ? <Shelf cell={cell} innerDepth={innerDepth} color={color} /> : null}
      {kind === "pullOutShelf" || fitting === "mobileTray" ? (
        <PullOutShelf
          cell={cell}
          frontZ={frontZ}
          innerDepth={innerDepth}
          color={color}
          drawerPull={drawerPull}
          selected={false}
          onSelect={onSelect}
          onSelectAccessory={onSelectAccessory}
          onDrawerPull={onDrawerPull}
          onDrawerDragActive={onDrawerDragActive}
        />
      ) : null}
      {kind === "boxDrawer" ? <BoxDrawer cell={cell} frontZ={frontZ} innerDepth={innerDepth} color={color} /> : null}
      {kind === "displayTray" ? <DisplayTray cell={cell} innerDepth={innerDepth} color={color} /> : null}
      {kind === "glassShelf" ? <GlassShelf cell={cell} innerDepth={innerDepth} material={glass} /> : null}

      {interiorAccessories.map((accessory) => {
        const mountedCell = mountInteriorCell(cell, accessory.mountHeightMm);
        if (accessory.kind === "mobileTray") {
          return (
            <PullOutShelf
              key={accessory.id}
              cell={mountedCell}
              frontZ={frontZ}
              innerDepth={innerDepth}
              color={color}
              drawerPull={accessory.pull ?? 1}
              accessoryId={accessory.id}
              selected={selectedAccessoryId === accessory.id}
              interactionDisabled={effectiveFront !== "none" && doorOpen < 0.08}
              onSelect={onSelect}
              onSelectAccessory={onSelectAccessory}
              onDrawerPull={onDrawerPull}
              onDrawerDragActive={onDrawerDragActive}
            />
          );
        }
        if (accessory.kind === "shelf") return <Shelf key={accessory.id} cell={mountedCell} innerDepth={innerDepth} color={color} />;
        if (accessory.kind === "displayTray") return <DisplayTray key={accessory.id} cell={mountedCell} innerDepth={innerDepth} color={color} />;
        return <GlassShelf key={accessory.id} cell={mountedCell} innerDepth={innerDepth} material={glass} />;
      })}

      {fitting === "rimmedDrawer" ? (
        <RimmedDrawer
          cell={cell}
          frontZ={frontZ}
          innerDepth={innerDepth}
          color={color}
          hideFront={hideFront}
          drawerPull={drawerPull}
          onSelect={onSelect}
          onDrawerPull={onDrawerPull}
          onDrawerDragActive={onDrawerDragActive}
        />
      ) : null}
      {frontGeometry}
    </group>
  );
}

function mountInteriorCell(cell: LayoutCell, mountHeightMm: number): LayoutCell {
  const bottomY = cell.y - cell.height / 2;
  const minY = bottomY;
  const maxY = cell.y + cell.height / 2;
  const y = Math.max(minY, Math.min(maxY, bottomY + mountHeightMm * SCALE));
  return { ...cell, y };
}

function OpenBase({ cell, innerDepth, subtle = false }: { cell: LayoutCell; innerDepth: number; subtle?: boolean }) {
  return (
    <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>
      <meshStandardMaterial color="#f7f7f2" roughness={0.6} metalness={0.02} opacity={subtle ? 0.42 : 0.72} transparent />
    </PanelBox>
  );
}

function MetalBox({ cell, backZ, innerDepth, color, includeBack }: { cell: LayoutCell; backZ: number; innerDepth: number; color: string; includeBack: boolean }) {
  const material = <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} />;
  return (
    <group>
      {includeBack ? <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.08, cell.height - 0.08, PANEL_THICKNESS]}>{material}</PanelBox> : null}
      <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{material}</PanelBox>
      <PanelBox position={[cell.x, cell.y + cell.height / 2 - PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{material}</PanelBox>
      <PanelBox position={[cell.x - cell.width / 2 + PANEL_THICKNESS / 2, cell.y, cell.z]} args={[PANEL_THICKNESS, cell.height - 0.12, innerDepth]}>{material}</PanelBox>
      <PanelBox position={[cell.x + cell.width / 2 - PANEL_THICKNESS / 2, cell.y, cell.z]} args={[PANEL_THICKNESS, cell.height - 0.12, innerDepth]}>{material}</PanelBox>
    </group>
  );
}

function NoSidePanelModule({ cell, innerDepth, color }: { cell: LayoutCell; innerDepth: number; color: string }) {
  const material = <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} side={THREE.DoubleSide} />;
  return (
    <group>
      <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{material}</PanelBox>
      <PanelBox position={[cell.x, cell.y + cell.height / 2 - PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{material}</PanelBox>
    </group>
  );
}

function GlassBox({ cell }: { cell: LayoutCell }) {
  const glassWidth = Math.max(0.08, cell.width - GLASS_EDGE_GAP * 2);
  const glassHeight = Math.max(0.08, cell.height - GLASS_EDGE_GAP * 2);
  const glassDepth = Math.max(0.08, cell.depth - GLASS_EDGE_GAP * 2);
  const backZ = -cell.depth / 2;
  const bottomY = -cell.height / 2;
  const topY = cell.height / 2;
  const leftX = -cell.width / 2;
  const rightX = cell.width / 2;
  const clipX = glassClipOffset(glassWidth);
  const clipY = glassClipOffset(glassHeight);
  const clipZ = glassClipOffset(glassDepth);

  return (
    <group position={[cell.x, cell.y, cell.z]}>
      <GlassPanel orientation="back" position={[0, 0, backZ]} args={[glassWidth, glassHeight, GLASS_THICKNESS]} />
      <GlassPanel orientation="horizontal" position={[0, bottomY, 0]} args={[glassWidth, GLASS_THICKNESS, glassDepth]} />
      <GlassPanel orientation="horizontal" position={[0, topY, 0]} args={[glassWidth, GLASS_THICKNESS, glassDepth]} />
      <GlassPanel orientation="side" position={[leftX, 0, 0]} args={[GLASS_THICKNESS, glassHeight, glassDepth]} />
      <GlassPanel orientation="side" position={[rightX, 0, 0]} args={[GLASS_THICKNESS, glassHeight, glassDepth]} />

      {[
        [-clipX, -clipY, backZ + GLASS_THICKNESS / 2 + 0.01],
        [clipX, -clipY, backZ + GLASS_THICKNESS / 2 + 0.01],
        [-clipX, clipY, backZ + GLASS_THICKNESS / 2 + 0.01],
        [clipX, clipY, backZ + GLASS_THICKNESS / 2 + 0.01]
      ].map((position, index) => (
        <GlassClip key={`back-${index}`} axis="z" position={position as [number, number, number]} />
      ))}

      {[
        [leftX + GLASS_THICKNESS / 2 + 0.01, -clipY, -clipZ],
        [leftX + GLASS_THICKNESS / 2 + 0.01, -clipY, clipZ],
        [leftX + GLASS_THICKNESS / 2 + 0.01, clipY, -clipZ],
        [leftX + GLASS_THICKNESS / 2 + 0.01, clipY, clipZ],
        [rightX - GLASS_THICKNESS / 2 - 0.01, -clipY, -clipZ],
        [rightX - GLASS_THICKNESS / 2 - 0.01, -clipY, clipZ],
        [rightX - GLASS_THICKNESS / 2 - 0.01, clipY, -clipZ],
        [rightX - GLASS_THICKNESS / 2 - 0.01, clipY, clipZ]
      ].map((position, index) => (
        <GlassClip key={`side-${index}`} axis="x" position={position as [number, number, number]} />
      ))}

      {[
        [-clipX, bottomY + GLASS_THICKNESS / 2 + 0.01, -clipZ],
        [clipX, bottomY + GLASS_THICKNESS / 2 + 0.01, -clipZ],
        [-clipX, bottomY + GLASS_THICKNESS / 2 + 0.01, clipZ],
        [clipX, bottomY + GLASS_THICKNESS / 2 + 0.01, clipZ],
        [-clipX, topY - GLASS_THICKNESS / 2 - 0.01, -clipZ],
        [clipX, topY - GLASS_THICKNESS / 2 - 0.01, -clipZ],
        [-clipX, topY - GLASS_THICKNESS / 2 - 0.01, clipZ],
        [clipX, topY - GLASS_THICKNESS / 2 - 0.01, clipZ]
      ].map((position, index) => (
        <GlassClip key={`horizontal-${index}`} axis="y" position={position as [number, number, number]} />
      ))}
    </group>
  );
}

function glassClipOffset(length: number) {
  return Math.max(0.035, length / 2 - GLASS_CLIP_EDGE_INSET);
}

function GlassPanel({ orientation, position, args }: { orientation: "back" | "horizontal" | "side"; position: [number, number, number]; args: [number, number, number] }) {
  return (
    <group>
      <PanelBox position={position} args={args}>
        <meshPhysicalMaterial
          color="#dce7e7"
          metalness={0.02}
          roughness={0.04}
          transmission={0.42}
          opacity={0.36}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </PanelBox>
      <GlassPanelEdges orientation={orientation} position={position} args={args} />
    </group>
  );
}

function GlassPanelEdges({ orientation, position, args }: { orientation: "back" | "horizontal" | "side"; position: [number, number, number]; args: [number, number, number] }) {
  const [x, y, z] = position;
  const [width, height, depth] = args;
  const edge = 0.012;
  const edgeMaterial = <meshStandardMaterial color="#9fb0b2" roughness={0.24} metalness={0.36} transparent opacity={0.72} />;

  if (orientation === "back") {
    const edgeZ = z + depth / 2 + edge / 2;
    return (
      <group>
        <PanelBox position={[x, y + height / 2, edgeZ]} args={[width, edge, edge]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x, y - height / 2, edgeZ]} args={[width, edge, edge]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x - width / 2, y, edgeZ]} args={[edge, height, edge]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x + width / 2, y, edgeZ]} args={[edge, height, edge]}>{edgeMaterial}</PanelBox>
      </group>
    );
  }

  if (orientation === "horizontal") {
    const edgeY = y + Math.sign(y || 1) * (height / 2 + edge / 2);
    return (
      <group>
        <PanelBox position={[x, edgeY, z - depth / 2]} args={[width, edge, edge]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x, edgeY, z + depth / 2]} args={[width, edge, edge]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x - width / 2, edgeY, z]} args={[edge, edge, depth]}>{edgeMaterial}</PanelBox>
        <PanelBox position={[x + width / 2, edgeY, z]} args={[edge, edge, depth]}>{edgeMaterial}</PanelBox>
      </group>
    );
  }

  const edgeX = x + Math.sign(x || 1) * (width / 2 + edge / 2);
  return (
    <group>
      <PanelBox position={[edgeX, y + height / 2, z]} args={[edge, edge, depth]}>{edgeMaterial}</PanelBox>
      <PanelBox position={[edgeX, y - height / 2, z]} args={[edge, edge, depth]}>{edgeMaterial}</PanelBox>
      <PanelBox position={[edgeX, y, z - depth / 2]} args={[edge, height, edge]}>{edgeMaterial}</PanelBox>
      <PanelBox position={[edgeX, y, z + depth / 2]} args={[edge, height, edge]}>{edgeMaterial}</PanelBox>
    </group>
  );
}

function GlassClip({ axis, position }: { axis: "x" | "y" | "z"; position: [number, number, number] }) {
  const rotation: [number, number, number] = axis === "z" ? [Math.PI / 2, 0, 0] : axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  return (
    <group position={position}>
      <mesh rotation={rotation} castShadow receiveShadow>
        <cylinderGeometry args={[0.026, 0.026, 0.016, 28]} />
        <meshPhysicalMaterial color="#edf1f1" metalness={0.78} roughness={0.16} clearcoat={0.72} />
      </mesh>
      <mesh rotation={rotation}>
        <cylinderGeometry args={[0.012, 0.012, 0.018, 20]} />
        <meshStandardMaterial color="#303638" roughness={0.34} metalness={0.28} />
      </mesh>
    </group>
  );
}

function OpenBackPanel({ cell, backZ, innerDepth, color }: { cell: LayoutCell; backZ: number; innerDepth: number; color: string }) {
  return (
    <group>
      <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.08, cell.height - 0.08, PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} />
      </PanelBox>
      <OpenBase cell={cell} innerDepth={innerDepth} />
    </group>
  );
}

function SidePanel({ cell, innerDepth, color }: { cell: LayoutCell; innerDepth: number; color: string }) {
  return (
    <group>
      <PanelBox position={[cell.x - cell.width / 2 + PANEL_THICKNESS / 2, cell.y, cell.z]} args={[PANEL_THICKNESS, cell.height - 0.12, innerDepth]}>
        <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} />
      </PanelBox>
      <OpenBase cell={cell} innerDepth={innerDepth} />
    </group>
  );
}

function useDoorDrag({
  hitboxRef,
  selection,
  doorOpen,
  maxAngle,
  direction,
  axisLength,
  disabled,
  onSelect,
  onDoorOpen,
  onDoorDragActive
}: {
  hitboxRef: RefObject<THREE.Mesh | null>;
  selection: Selection;
  doorOpen: number;
  maxAngle: number;
  direction: 1 | -1;
  axisLength: number;
  disabled: boolean;
  onSelect: () => void;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDoorDragActive: (active: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const doorOpenRef = useRef(doorOpen);
  const disabledRef = useRef(disabled);
  const selectionRef = useRef(selection);
  const onSelectRef = useRef(onSelect);
  const onDoorOpenRef = useRef(onDoorOpen);
  const onDoorDragActiveRef = useRef(onDoorDragActive);
  const dragRef = useRef<{
    startOpen: number;
    currentOpen: number;
    startX: number;
    startY: number;
    axisX: number;
    axisY: number;
    axisLengthSq: number;
  } | null>(null);
  const clampOpen = (value: number) => Math.max(0, Math.min(1, value));

  useEffect(() => {
    doorOpenRef.current = doorOpen;
  }, [doorOpen]);

  useEffect(() => {
    disabledRef.current = disabled;
    selectionRef.current = selection;
    onSelectRef.current = onSelect;
    onDoorOpenRef.current = onDoorOpen;
    onDoorDragActiveRef.current = onDoorDragActive;
  }, [disabled, onDoorDragActive, onDoorOpen, onSelect, selection]);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function getScreenAxis(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (!hitbox) return null;
      return getScreenAxisForLocalVector(
        hitbox,
        camera,
        rect,
        new THREE.Vector3(0, direction * axisLength * (1 - Math.cos(maxAngle)), axisLength * Math.sin(maxAngle))
      );
    }

    function getHitboxBounds(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (!hitbox) return null;
      hitbox.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(hitbox);
      if (box.isEmpty()) return null;
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ].map((point) => {
        const projected = point.project(camera);
        return {
          x: rect.left + ((projected.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projected.y) / 2) * rect.height,
        };
      });
      const margin = 44;
      return {
        minX: Math.min(...corners.map((point) => point.x)) - margin,
        maxX: Math.max(...corners.map((point) => point.x)) + margin,
        minY: Math.min(...corners.map((point) => point.y)) - margin,
        maxY: Math.max(...corners.map((point) => point.y)) + margin,
      };
    }

    function handleMouseDown(event: MouseEvent) {
      const hitbox = hitboxRef.current;
      if (disabledRef.current || dragRef.current || !hitbox) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(hitbox, false)[0];
      const bounds = getHitboxBounds(rect);
      const axis = getScreenAxis(rect);
      const inBounds = bounds && event.clientX >= bounds.minX && event.clientX <= bounds.maxX && event.clientY >= bounds.minY && event.clientY <= bounds.maxY;
      if ((!hit && !inBounds) || !axis) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelectRef.current();
      onDoorDragActiveRef.current(true);
      dragRef.current = {
        startOpen: doorOpenRef.current,
        currentOpen: doorOpenRef.current,
        startX: event.clientX,
        startY: event.clientY,
        ...axis
      };
    }

    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const projected = (dx * drag.axisX + dy * drag.axisY) / drag.axisLengthSq;
      const nextOpen = clampOpen(drag.startOpen + projected);
      drag.currentOpen = nextOpen;
      onDoorOpenRef.current(selectionRef.current, nextOpen, false);
    }

    function finishDrag(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onDoorOpenRef.current(selectionRef.current, drag.currentOpen, true);
      onDoorDragActiveRef.current(false);
      dragRef.current = null;
    }

    canvas.addEventListener("mousedown", handleMouseDown, true);
    canvas.addEventListener("pointerdown", handleMouseDown, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("pointermove", handleMouseMove, true);
    window.addEventListener("mouseup", finishDrag, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", finishDrag, true);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("pointerdown", handleMouseDown, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("pointermove", handleMouseMove, true);
      window.removeEventListener("mouseup", finishDrag, true);
      window.removeEventListener("pointerup", finishDrag, true);
      window.removeEventListener("pointercancel", finishDrag, true);
      if (dragRef.current) {
        onDoorDragActiveRef.current(false);
        dragRef.current = null;
      }
    };
  }, [axisLength, camera, direction, gl, hitboxRef, maxAngle]);
}

function DropDoor({
  cell,
  frontZ,
  backZ,
  innerDepth,
  color,
  doorOpen,
  hideDoor,
  onSelect,
  onDoorOpen,
  onDoorDragActive
}: {
  cell: LayoutCell;
  frontZ: number;
  backZ: number;
  innerDepth: number;
  color: string;
  doorOpen: number;
  hideDoor: boolean;
  onSelect: () => void;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDoorDragActive: (active: boolean) => void;
}) {
  const maxAngle = Math.PI / 2;
  const open = Math.max(0, Math.min(1, doorOpen));
  const angle = open * maxAngle;
  const hitboxRef = useRef<THREE.Mesh>(null);
  const panelW = Math.max(0.16, officialPanelSpan(cell.width));
  const panelH = Math.max(0.12, officialPanelSpan(cell.height));
  const pivotY = cell.y - cell.height / 2;
  const pivotZ = frontZ;
  const hingeXL = -panelW / 2 + 0.07;
  const hingeXR = panelW / 2 - 0.07;
  const darkMetal = OFFICIAL_BLACK_PLASTIC_COLOR;
  const lightMetal = "#aeb3b4";
  const hingeMetal = DROP_DOOR_HINGE_METAL_COLOR;
  const hingeDark = DROP_DOOR_HINGE_DARK_COLOR;
  const showHardware = hideDoor || open > 0.03;
  const selection = useMemo(() => ({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex }), [cell.column, cell.depthIndex, cell.row]);

  useDoorDrag({
    hitboxRef,
    selection,
    doorOpen: open,
    maxAngle,
    direction: -1,
    axisLength: panelH * 0.82,
    disabled: hideDoor,
    onSelect,
    onDoorOpen,
    onDoorDragActive
  });

  return (
    <group>
      {!hideDoor ? (
        <>
          <group position={[cell.x, pivotY, pivotZ]} rotation={[angle, 0, 0]}>
            <DropDoorFrontAsset panelW={panelW} panelH={panelH} color={color} lightMetal={lightMetal} darkMetal={darkMetal} hingeXL={hingeXL} hingeXR={hingeXR} />
            <mesh ref={hitboxRef} position={[0, panelH / 2, PANEL_THICKNESS / 2 + 0.075]} renderOrder={40}>
              <boxGeometry args={[panelW, panelH, 0.3]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        </>
      ) : null}
      {showHardware ? (
        <DropDoorSupportHardware
          cell={cell}
          panelW={panelW}
          panelH={panelH}
          frontZ={frontZ}
          pivotY={pivotY}
          pivotZ={pivotZ}
          angle={angle}
          hingeXL={hingeXL}
          hingeXR={hingeXR}
          lightMetal={hingeMetal}
          darkMetal={hingeDark}
        />
      ) : null}
    </group>
  );
}

function DropDoorSupportHardware({
  cell,
  panelW,
  panelH,
  frontZ,
  pivotY,
  pivotZ,
  angle,
  hingeXL,
  hingeXR,
  lightMetal,
  darkMetal
}: {
  cell: LayoutCell;
  panelW: number;
  panelH: number;
  frontZ: number;
  pivotY: number;
  pivotZ: number;
  angle: number;
  hingeXL: number;
  hingeXR: number;
  lightMetal: string;
  darkMetal: string;
}) {
  const sideInset = Math.max(
    0.07,
    Math.min(panelW / 2 - 0.07, cell.width / 2 - STEEL_PANEL_EDGE_INSET - STEEL_PANEL_THICKNESS * 0.42)
  );

  return (
    <group name="drop-door-official-hinge-hardware">
      <group position={[cell.x, pivotY, pivotZ]}>
        <DropDoorOfficialHinges
          panelW={panelW}
          panelH={panelH}
          hingeXL={hingeXL}
          hingeXR={hingeXR}
          lightMetal={lightMetal}
          darkMetal={darkMetal}
        />
      </group>

      {([-1, 1] as const).map((side) => (
        <DropDoorOfficialStyleSideHinge
          key={`drop-door-official-style-hinge-${side}`}
          side={side}
          x={cell.x + side * sideInset}
          panelH={panelH}
          frontZ={frontZ}
          pivotY={pivotY}
          pivotZ={pivotZ}
          angle={angle}
          lightMetal={lightMetal}
          darkMetal={darkMetal}
        />
      ))}
    </group>
  );
}

function DropDoorOfficialHinges({
  panelW,
  panelH,
  hingeXL,
  hingeXR,
  lightMetal,
  darkMetal
}: {
  panelW: number;
  panelH: number;
  hingeXL: number;
  hingeXR: number;
  lightMetal: string;
  darkMetal: string;
}) {
  const asset = useDropDoorHingeAsset();
  const scaledAsset = useMemo(() => {
    if (!asset) return null;
    const group = cloneAssetWithMaterial(asset, () => new THREE.MeshPhysicalMaterial({
      color: lightMetal,
      metalness: 0.62,
      roughness: 0.34,
      clearcoat: 0.18,
      side: THREE.DoubleSide
    }));
    group.scale.set(panelW / DROP_DOOR_ASSET_TEMPLATE_WIDTH, panelH / DROP_DOOR_ASSET_TEMPLATE_HEIGHT, 1);
    return group;
  }, [asset, lightMetal, panelH, panelW]);

  useEffect(() => {
    return () => {
      disposeClonedAsset(scaledAsset);
    };
  }, [scaledAsset]);

  if (asset && scaledAsset) return <primitive object={scaledAsset} />;

  return <DropDoorProceduralPivotHinges panelW={panelW} hingeXL={hingeXL} hingeXR={hingeXR} lightMetal={lightMetal} darkMetal={darkMetal} />;
}

function DropDoorProceduralPivotHinges({
  panelW,
  hingeXL,
  hingeXR,
  lightMetal,
  darkMetal
}: {
  panelW: number;
  hingeXL: number;
  hingeXR: number;
  lightMetal: string;
  darkMetal: string;
}) {
  return (
    <group>
      <PanelBox position={[0, 0.028, -PANEL_THICKNESS / 2 - 0.045]} args={[Math.max(0.12, panelW - 0.16), 0.026, 0.022]}>
        <meshStandardMaterial color={lightMetal} metalness={0.64} roughness={0.34} />
      </PanelBox>
      {[hingeXL, hingeXR].map((x) => (
        <group key={`drop-door-pivot-hinge-${x}`}>
          <DropDoorHinge x={x} darkMetal={darkMetal} />
          <mesh position={[x, 0.032, -PANEL_THICKNESS / 2 - 0.055]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.07, 24]} />
            <meshStandardMaterial color={lightMetal} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DropDoorOfficialStyleSideHinge({
  side,
  x,
  panelH,
  frontZ,
  pivotY,
  pivotZ,
  angle,
  lightMetal,
  darkMetal
}: {
  side: -1 | 1;
  x: number;
  panelH: number;
  frontZ: number;
  pivotY: number;
  pivotZ: number;
  angle: number;
  lightMetal: string;
  darkMetal: string;
}) {
  const bracketMetal = "#555b5e";
  const barrelLength = 0.095;
  const barrelRadius = 0.024;
  const baseZ = frontZ - 0.034;
  const activeLeafY = panelH * 0.055;
  const activeLeafZ = -PANEL_THICKNESS / 2 - 0.058;

  return (
    <group name={`drop-door-${side < 0 ? "left" : "right"}-official-hinge`}>
      <PanelBox position={[x, pivotY + 0.064, baseZ - 0.014]} args={[0.088, 0.075, 0.028]}>
        <meshStandardMaterial color={bracketMetal} metalness={0.42} roughness={0.5} />
      </PanelBox>
      <PanelBox position={[x, pivotY + 0.024, baseZ - 0.036]} args={[0.074, 0.024, 0.07]}>
        <meshStandardMaterial color={bracketMetal} metalness={0.38} roughness={0.54} />
      </PanelBox>
      <mesh position={[x, pivotY + 0.018, baseZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[barrelRadius, barrelRadius, barrelLength, 32]} />
        <meshPhysicalMaterial color={lightMetal} metalness={0.58} roughness={0.34} clearcoat={0.12} />
      </mesh>
      <mesh position={[x, pivotY + 0.018, baseZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[barrelRadius * 0.45, barrelRadius * 0.45, barrelLength + 0.018, 24]} />
        <meshStandardMaterial color={darkMetal} metalness={0.5} roughness={0.44} />
      </mesh>
      {[-0.026, 0.026].map((offsetX) => (
        <mesh key={`drop-door-hinge-screw-${side}-${offsetX}`} position={[x + offsetX, pivotY + 0.064, baseZ + 0.002]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.006, 20]} />
          <meshStandardMaterial color={lightMetal} metalness={0.64} roughness={0.36} />
        </mesh>
      ))}
      <group position={[x, pivotY, pivotZ]} rotation={[angle, 0, 0]}>
        <PanelBox position={[0, activeLeafY, activeLeafZ]} args={[0.09, 0.052, 0.015]}>
          <meshStandardMaterial color={bracketMetal} metalness={0.36} roughness={0.52} />
        </PanelBox>
        <PanelBox position={[0, activeLeafY - 0.032, activeLeafZ - 0.018]} args={[0.066, 0.018, 0.042]}>
          <meshStandardMaterial color={bracketMetal} metalness={0.34} roughness={0.54} />
        </PanelBox>
        <mesh position={[0, activeLeafY - 0.006, activeLeafZ - 0.034]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.017, 0.017, 0.074, 28]} />
          <meshPhysicalMaterial color={lightMetal} metalness={0.58} roughness={0.36} clearcoat={0.1} />
        </mesh>
      </group>
    </group>
  );
}

function DropDoorFrontAsset({
  panelW,
  panelH,
  color,
  lightMetal,
  darkMetal,
  hingeXL,
  hingeXR
}: {
  panelW: number;
  panelH: number;
  color: string;
  lightMetal: string;
  darkMetal: string;
  hingeXL: number;
  hingeXR: number;
}) {
  const asset = useDropDoorAsset();
  const scaledAsset = useMemo(() => {
    if (!asset) return null;
    const group = cloneDoorAsset(asset, color, lightMetal, darkMetal, { omitGalvanizedHardware: true });
    group.scale.set(panelW / DROP_DOOR_ASSET_TEMPLATE_WIDTH, panelH / DROP_DOOR_ASSET_TEMPLATE_HEIGHT, 1);
    return group;
  }, [asset, color, darkMetal, lightMetal, panelH, panelW]);

  useEffect(() => {
    return () => {
      disposeClonedAsset(scaledAsset);
    };
  }, [scaledAsset]);

  if (asset && scaledAsset) {
    return (
      <>
        <primitive object={scaledAsset} />
        <DropDoorChromeLockCore y={panelH * 0.879} z={0.058} radius={0.086} slotColor={darkMetal} />
      </>
    );
  }

  return <DropDoorProceduralFront panelW={panelW} panelH={panelH} color={color} lightMetal={lightMetal} darkMetal={darkMetal} hingeXL={hingeXL} hingeXR={hingeXR} />;
}

function cloneDoorAsset(
  asset: THREE.Group,
  color: string,
  lightMetal: string,
  darkMetal: string,
  options: { omitGalvanizedHardware?: boolean } = {}
) {
  const clone = asset.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const source = Array.isArray(object.material) ? object.material[0] : object.material;
    const name = source?.name?.toLowerCase() ?? "";
    if (options.omitGalvanizedHardware && name.includes("galvanized")) {
      object.material = new THREE.MeshBasicMaterial({ visible: false });
      object.visible = false;
      return;
    }
    if (name.includes("panel")) {
      object.material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide });
    } else if (name.includes("black")) {
      object.material = new THREE.MeshStandardMaterial({ color: darkMetal, roughness: 0.24, metalness: 0.72, side: THREE.DoubleSide });
    } else {
      object.material = new THREE.MeshPhysicalMaterial({ color: lightMetal, roughness: 0.18, metalness: 0.82, clearcoat: 0.55, side: THREE.DoubleSide });
    }
  });
  return clone;
}

function cloneOfficialMobileTrayAsset(asset: THREE.Group, color: string, metal: string, darkMetal: string) {
  const clone = asset.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const source = Array.isArray(object.material) ? object.material[0] : object.material;
    const name = source?.name?.toLowerCase() ?? "";
    if (!name || name === "default" || name.includes("panel")) {
      object.material = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.06, side: THREE.DoubleSide });
    } else if (name.includes("black")) {
      object.material = new THREE.MeshStandardMaterial({ color: darkMetal, roughness: 0.32, metalness: 0.42, side: THREE.DoubleSide });
    } else {
      object.material = new THREE.MeshPhysicalMaterial({ color: metal, roughness: 0.2, metalness: 0.78, clearcoat: 0.32, side: THREE.DoubleSide });
    }
  });
  return clone;
}

function cloneAssetWithMaterial(asset: THREE.Group, createMaterial: () => THREE.Material) {
  const clone = asset.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = createMaterial();
  });
  return clone;
}

function createPanelMaterial(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide });
}

function disposeClonedAsset(asset: THREE.Group | null) {
  asset?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function DropDoorProceduralFront({
  panelW,
  panelH,
  color,
  lightMetal,
  darkMetal,
  hingeXL,
  hingeXR
}: {
  panelW: number;
  panelH: number;
  color: string;
  lightMetal: string;
  darkMetal: string;
  hingeXL: number;
  hingeXR: number;
}) {
  return (
    <>
      <mesh position={[0, panelH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelW, panelH, PANEL_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </mesh>

      <DropDoorChromeLockCore y={panelH * 0.879} slotColor={darkMetal} />

      <DropDoorHinge x={hingeXL} darkMetal={darkMetal} />
      <DropDoorHinge x={hingeXR} darkMetal={darkMetal} />
    </>
  );
}

function DropDoorChromeLockCore({
  y,
  z = PANEL_THICKNESS / 2 + 0.006,
  radius = 0.038,
  chrome = "#d0d3d4",
  slotColor
}: {
  y: number;
  z?: number;
  radius?: number;
  chrome?: string;
  slotColor: string;
}) {
  return (
    <group position={[0, y, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.007, 64]} />
        <meshPhysicalMaterial color={chrome} metalness={0.38} roughness={0.18} clearcoat={0.75} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.005]} castShadow>
        <boxGeometry args={[radius * 0.64, 0.006, 0.004]} />
        <meshStandardMaterial color={slotColor} metalness={0.45} roughness={0.32} />
      </mesh>
    </group>
  );
}

function useDropDoorAsset() {
  const [asset, setAsset] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDropDoorAsset()
      .then((group) => {
        if (!alive) return;
        if (group) setAsset(group);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return failed ? null : asset;
}

function useDropDoorHingeAsset() {
  const [asset, setAsset] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDropDoorHingeAsset()
      .then((group) => {
        if (!alive) return;
        if (group) setAsset(group);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return failed ? null : asset;
}

function loadGltfScene(url: string) {
  return new Promise<THREE.Group | null>((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf: GLTF) => resolve(hasRenderableMesh(gltf.scene) ? gltf.scene : null),
      undefined,
      () => resolve(null)
    );
  });
}

function loadDropDoorAsset() {
  if (!dropDoorAssetPromise) {
    dropDoorAssetPromise = loadGltfScene(DROP_DOOR_ASSET_URL);
  }
  return dropDoorAssetPromise;
}

function loadDropDoorHingeAsset() {
  if (!dropDoorHingeAssetPromise) {
    dropDoorHingeAssetPromise = loadGltfScene(DROP_DOOR_HINGE_ASSET_URL);
  }
  return dropDoorHingeAssetPromise;
}

function useDoorInteriorComboAssets() {
  const [asset, setAsset] = useState<DoorInteriorComboAssets | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDoorInteriorComboAssets()
      .then((parts) => {
        if (!alive) return;
        if (parts) setAsset(parts);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return failed ? null : asset;
}

function loadDoorInteriorComboAssets() {
  if (!doorInteriorComboAssetsPromise) {
    doorInteriorComboAssetsPromise = Promise.all([
      loadGltfScene(COMBO_MOBILE_TRAY_ASSET_URL),
      loadGltfScene(COMBO_MOBILE_TRAY_RAILS_ASSET_URL)
    ]).then(([mobileTray, mobileTrayRails]) => {
      if (!mobileTray || !mobileTrayRails) return null;
      return { mobileTray, mobileTrayRails };
    });
  }
  return doorInteriorComboAssetsPromise;
}

function hasRenderableMesh(group: THREE.Group) {
  let hasMesh = false;
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) hasMesh = true;
  });
  return hasMesh;
}

function DropDoorHinge({ x, darkMetal }: { x: number; darkMetal: string }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.014, 0);
    s.lineTo(0.014, 0);
    s.lineTo(0.014, 0.058);
    s.lineTo(0.026, 0.058);
    s.lineTo(0.026, 0.092);
    s.lineTo(-0.026, 0.092);
    s.lineTo(-0.026, 0.058);
    s.lineTo(-0.014, 0.058);
    s.closePath();

    const hole = new THREE.Path();
    hole.absarc(0, 0.078, 0.01, 0, Math.PI * 2, false);
    s.holes.push(hole);
    return s;
  }, []);

  return (
    <group position={[x, 0, -PANEL_THICKNESS / 2 - 0.003]}>
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.005, bevelEnabled: false }]} />
        <meshStandardMaterial color={darkMetal} metalness={0.88} roughness={0.18} />
      </mesh>
    </group>
  );
}

function FlipUpDoorFrontAsset({
  panelW,
  panelH,
  color,
  lightMetal,
  darkMetal,
  hingeX
}: {
  panelW: number;
  panelH: number;
  color: string;
  lightMetal: string;
  darkMetal: string;
  hingeX: number;
}) {
  const assets = useFlipUpDoorAssetParts();
  const scaledAsset = useMemo(() => {
    if (!assets) return null;
    const group = new THREE.Group();
    const panel = cloneAssetWithMaterial(assets.panel, () => createPanelMaterial(color));
    const lock = cloneDoorAsset(assets.lock, color, lightMetal, darkMetal);
    group.add(panel, lock);
    group.scale.set(panelW / FLIP_UP_DOOR_ASSET_TEMPLATE_WIDTH, panelH / FLIP_UP_DOOR_ASSET_TEMPLATE_HEIGHT, 1);
    group.position.set(0, -panelH, 0);
    return group;
  }, [assets, color, darkMetal, lightMetal, panelH, panelW]);

  useEffect(() => {
    return () => {
      disposeClonedAsset(scaledAsset);
    };
  }, [scaledAsset]);

  if (assets && scaledAsset) {
    return <primitive object={scaledAsset} />;
  }

  return <FlipUpDoorProceduralFront panelW={panelW} panelH={panelH} color={color} lightMetal={lightMetal} darkMetal={darkMetal} hingeX={hingeX} />;
}

function FlipUpDoorProceduralFront({
  panelW,
  panelH,
  color,
  lightMetal,
  darkMetal,
  hingeX
}: {
  panelW: number;
  panelH: number;
  color: string;
  lightMetal: string;
  darkMetal: string;
  hingeX: number;
}) {
  return (
    <>
      <FlipUpHingeBar width={panelW - 0.04} color={darkMetal} />
      <PanelBox position={[0, -0.032, -PANEL_THICKNESS / 2 - 0.004]} args={[0.12, 0.026, 0.014]}>
        <meshStandardMaterial color={lightMetal} roughness={0.26} metalness={0.76} />
      </PanelBox>

      <group position={[0, -panelH / 2, 0]}>
        <PanelBox position={[0, 0, 0]} args={[panelW, panelH, PANEL_THICKNESS]}>
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
        </PanelBox>
        <FrameRect width={panelW} height={panelH} z={PANEL_THICKNESS / 2 + 0.014} />
        <DrawerLock y={-panelH * 0.28} />
      </group>
    </>
  );
}

function useFlipUpDoorAssetParts() {
  const [asset, setAsset] = useState<DoorAssetParts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadFlipUpDoorAssetParts()
      .then((parts) => {
        if (!alive) return;
        if (parts) setAsset(parts);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return failed ? null : asset;
}

function loadFlipUpDoorAssetParts() {
  if (!flipUpDoorAssetPartsPromise) {
    flipUpDoorAssetPartsPromise = Promise.all([
      loadGltfScene(FLIP_UP_DOOR_PANEL_ASSET_URL),
      loadGltfScene(FLIP_UP_DOOR_LOCK_ASSET_URL)
    ]).then(([panel, lock]) => {
      if (!panel || !lock) return null;
      return { panel, lock };
    });
  }
  return flipUpDoorAssetPartsPromise;
}

function RodBetween({ start, end, radius, color }: { start: [number, number, number]; end: [number, number, number]; radius: number; color: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const length = Math.max(0.001, direction.length());
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion,
      length
    };
  }, [end, start]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 14]} />
      <meshStandardMaterial color={color} metalness={0.76} roughness={0.24} />
    </mesh>
  );
}

function FlipUpDoor({
  cell,
  frontZ,
  backZ,
  innerDepth,
  color,
  doorOpen,
  hideDoor,
  onSelect,
  onDoorOpen,
  onDoorDragActive
}: {
  cell: LayoutCell;
  frontZ: number;
  backZ: number;
  innerDepth: number;
  color: string;
  doorOpen: number;
  hideDoor: boolean;
  onSelect: () => void;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDoorDragActive: (active: boolean) => void;
}) {
  const maxAngle = Math.PI * 0.48;
  const open = Math.max(0, Math.min(1, doorOpen));
  const angle = -open * maxAngle;
  const hitboxRef = useRef<THREE.Mesh>(null);
  const panelW = Math.max(0.16, officialPanelSpan(cell.width));
  const panelH = Math.max(0.12, officialPanelSpan(cell.height));
  const pivotY = cell.y + cell.height / 2 - 0.055;
  const pivotZ = frontZ;
  const hingeX = panelW / 2 - 0.08;
  const sideMountX = cell.width / 2 - STEEL_PANEL_EDGE_INSET - STEEL_PANEL_THICKNESS * 1.35;
  const fixedHingeY = pivotY - 0.14;
  const fixedHingeZ = frontZ - innerDepth * 0.28;
  const darkMetal = OFFICIAL_BLACK_PLASTIC_COLOR;
  const lightMetal = "#8a9098";
  const openAmount = Math.abs(angle);
  const showHardware = hideDoor || open > 0.03;
  const selection = useMemo(() => ({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex }), [cell.column, cell.depthIndex, cell.row]);

  useDoorDrag({
    hitboxRef,
    selection,
    doorOpen: open,
    maxAngle,
    direction: 1,
    axisLength: panelH * 0.78,
    disabled: hideDoor,
    onSelect,
    onDoorOpen,
    onDoorDragActive
  });

  return (
    <group>
      {showHardware ? (
        <>
          <PanelBox position={[cell.x, pivotY - 0.028, frontZ - 0.018]} args={[panelW - 0.08, 0.026, 0.024]}>
            <meshStandardMaterial color={lightMetal} roughness={0.24} metalness={0.78} />
          </PanelBox>
          {([-1, 1] as const).map((side) => (
            <FlipUpFixedHinge
              key={`flip-fixed-hinge-${side}`}
              x={cell.x + side * sideMountX}
              y={fixedHingeY}
              z={fixedHingeZ}
              side={side}
              darkMetal={darkMetal}
              lightMetal={lightMetal}
            />
          ))}
        </>
      ) : null}

      {!hideDoor ? (
        <>
          <group position={[cell.x, pivotY, pivotZ]} rotation={[angle, 0, 0]}>
            <FlipUpDoorFrontAsset panelW={panelW} panelH={panelH} color={color} lightMetal={lightMetal} darkMetal={darkMetal} hingeX={hingeX} />
            <mesh ref={hitboxRef} position={[0, -panelH / 2, PANEL_THICKNESS / 2 + 0.075]} renderOrder={40}>
              <boxGeometry args={[panelW, panelH, 0.3]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>

          {showHardware ? (
            <>
              {([-1, 1] as const).map((side) => {
                const cabinetPt: [number, number, number] = [
                  cell.x + side * sideMountX,
                  fixedHingeY - 0.1,
                  fixedHingeZ + 0.18
                ];
                const doorPt: [number, number, number] = [
                  cell.x + side * hingeX,
                  pivotY - panelH * 0.56 * Math.cos(openAmount),
                  pivotZ + panelH * 0.56 * Math.sin(openAmount)
                ];

                return (
                  <group key={`flip-stay-${side}`}>
                    <RodBetween start={cabinetPt} end={doorPt} radius={0.009} color={lightMetal} />
                    <mesh position={cabinetPt} castShadow>
                      <sphereGeometry args={[0.021, 16, 10]} />
                      <meshStandardMaterial color={darkMetal} metalness={0.8} roughness={0.22} />
                    </mesh>
                    <mesh position={doorPt} castShadow>
                      <sphereGeometry args={[0.018, 16, 10]} />
                      <meshStandardMaterial color={darkMetal} metalness={0.8} roughness={0.22} />
                    </mesh>
                  </group>
                );
              })}
            </>
          ) : null}
        </>
      ) : null}
    </group>
  );
}

function FlipUpFixedHinge({
  x,
  y,
  z,
  side,
  darkMetal,
  lightMetal
}: {
  x: number;
  y: number;
  z: number;
  side: -1 | 1;
  darkMetal: string;
  lightMetal: string;
}) {
  return (
    <group position={[x, y, z]}>
      <PanelBox position={[0, 0.1, 0]} args={[0.052, 0.045, 0.56]}>
        <meshStandardMaterial color={darkMetal} roughness={0.24} metalness={0.74} />
      </PanelBox>
      <PanelBox position={[0, -0.05, 0.19]} args={[0.052, 0.28, 0.052]}>
        <meshStandardMaterial color={darkMetal} roughness={0.24} metalness={0.74} />
      </PanelBox>
      <PanelBox position={[0, -0.19, 0.19]} args={[0.074, 0.045, 0.06]}>
        <meshStandardMaterial color={lightMetal} roughness={0.22} metalness={0.82} />
      </PanelBox>
      {[-0.17, 0, 0.17].map((offsetZ) => (
        <PanelBox key={`flip-fixed-hinge-slot-${offsetZ}`} position={[-side * 0.028, 0.103, offsetZ]} args={[0.006, 0.018, 0.08]}>
          <meshStandardMaterial color={lightMetal} roughness={0.26} metalness={0.78} />
        </PanelBox>
      ))}
      {[0.03, -0.13].map((offsetY) => (
        <mesh key={`flip-fixed-hinge-screw-${offsetY}`} position={[-side * 0.031, offsetY, 0.19]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.006, 24]} />
          <meshStandardMaterial color={lightMetal} roughness={0.22} metalness={0.86} />
        </mesh>
      ))}
    </group>
  );
}

function FlipUpHingeBar({ width, color }: { width: number; color: string }) {
  return (
    <mesh position={[0, 0, -PANEL_THICKNESS / 2 - 0.01]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[0.018, 0.018, width, 28]} />
      <meshStandardMaterial color={color} metalness={0.86} roughness={0.2} />
    </mesh>
  );
}

function useGlassDoorHandleDrag({
  hitboxRef,
  selection,
  doorOpen,
  closedPoint,
  openPoint,
  onSelect,
  onDoorOpen,
  onDoorDragActive
}: {
  hitboxRef: RefObject<THREE.Mesh | null>;
  selection: Selection;
  doorOpen: number;
  closedPoint: [number, number, number];
  openPoint: [number, number, number];
  onSelect: () => void;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDoorDragActive: (active: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const doorOpenRef = useRef(doorOpen);
  const selectionRef = useRef(selection);
  const closedPointRef = useRef(closedPoint);
  const openPointRef = useRef(openPoint);
  const onSelectRef = useRef(onSelect);
  const onDoorOpenRef = useRef(onDoorOpen);
  const onDoorDragActiveRef = useRef(onDoorDragActive);
  const dragRef = useRef<{
    startOpen: number;
    currentOpen: number;
    startX: number;
    startY: number;
    axisX: number;
    axisY: number;
    axisLengthSq: number;
  } | null>(null);
  const clampOpen = (value: number) => Math.max(0, Math.min(1, value));

  useEffect(() => {
    doorOpenRef.current = doorOpen;
    selectionRef.current = selection;
    closedPointRef.current = closedPoint;
    openPointRef.current = openPoint;
    onSelectRef.current = onSelect;
    onDoorOpenRef.current = onDoorOpen;
    onDoorDragActiveRef.current = onDoorDragActive;
  }, [closedPoint, doorOpen, onDoorDragActive, onDoorOpen, onSelect, openPoint, selection]);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function projectToScreen(point: [number, number, number], rect: DOMRect) {
      const projected = new THREE.Vector3(...point).project(camera);
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - projected.y) / 2) * rect.height
      };
    }

    function getScreenAxis(rect: DOMRect) {
      const closed = projectToScreen(closedPointRef.current, rect);
      const opened = projectToScreen(openPointRef.current, rect);
      const axisX = opened.x - closed.x;
      const axisY = opened.y - closed.y;
      const axisLengthSq = axisX * axisX + axisY * axisY;
      return axisLengthSq > 16 ? { axisX, axisY, axisLengthSq } : null;
    }

    function getHitboxBounds(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (!hitbox) return null;
      hitbox.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(hitbox);
      if (box.isEmpty()) return null;
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
      ].map((point) => {
        const projected = point.project(camera);
        return {
          x: rect.left + ((projected.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projected.y) / 2) * rect.height
        };
      });
      const margin = 40;
      return {
        minX: Math.min(...corners.map((point) => point.x)) - margin,
        maxX: Math.max(...corners.map((point) => point.x)) + margin,
        minY: Math.min(...corners.map((point) => point.y)) - margin,
        maxY: Math.max(...corners.map((point) => point.y)) + margin
      };
    }

    function handleMouseDown(event: MouseEvent) {
      const hitbox = hitboxRef.current;
      if (dragRef.current || !hitbox) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(hitbox, false)[0];
      const bounds = getHitboxBounds(rect);
      const axis = getScreenAxis(rect);
      const inBounds = bounds && event.clientX >= bounds.minX && event.clientX <= bounds.maxX && event.clientY >= bounds.minY && event.clientY <= bounds.maxY;
      if ((!hit && !inBounds) || !axis) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelectRef.current();
      onDoorDragActiveRef.current(true);
      dragRef.current = {
        startOpen: doorOpenRef.current,
        currentOpen: doorOpenRef.current,
        startX: event.clientX,
        startY: event.clientY,
        ...axis
      };
    }

    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const projected = (dx * drag.axisX + dy * drag.axisY) / drag.axisLengthSq;
      const nextOpen = clampOpen(drag.startOpen + projected);
      drag.currentOpen = nextOpen;
      onDoorOpenRef.current(selectionRef.current, nextOpen, false);
    }

    function finishDrag(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onDoorOpenRef.current(selectionRef.current, drag.currentOpen, true);
      onDoorDragActiveRef.current(false);
      dragRef.current = null;
    }

    canvas.addEventListener("mousedown", handleMouseDown, true);
    canvas.addEventListener("pointerdown", handleMouseDown, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("pointermove", handleMouseMove, true);
    window.addEventListener("mouseup", finishDrag, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", finishDrag, true);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("pointerdown", handleMouseDown, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("pointermove", handleMouseMove, true);
      window.removeEventListener("mouseup", finishDrag, true);
      window.removeEventListener("pointerup", finishDrag, true);
      window.removeEventListener("pointercancel", finishDrag, true);
      if (dragRef.current) {
        onDoorDragActiveRef.current(false);
        dragRef.current = null;
      }
    };
  }, [camera, gl, hitboxRef]);
}

function GlassDoor({
  cell,
  frontZ,
  handleSide,
  doorOpen,
  onSelect,
  onDoorOpen,
  onDoorDragActive
}: {
  cell: LayoutCell;
  frontZ: number;
  handleSide: GlassDoorHandleSide;
  doorOpen: number;
  onSelect: () => void;
  onDoorOpen: (selection: Selection, value: number, remember?: boolean) => void;
  onDoorDragActive: (active: boolean) => void;
}) {
  const panelW = officialPanelSpan(cell.width);
  const panelH = officialPanelSpan(cell.height);
  const handleX = handleSide === "left" ? -panelW / 2 + Math.min(0.18, panelW * 0.14) : panelW / 2 - Math.min(0.18, panelW * 0.14);
  const pivotX = handleSide === "left" ? panelW / 2 - 0.035 : -panelW / 2 + 0.035;
  const open = Math.max(0, Math.min(1, doorOpen));
  const maxAngle = Math.PI * 0.52;
  const signedMaxAngle = (handleSide === "left" ? 1 : -1) * maxAngle;
  const angle = open * signedMaxAngle;
  const frontOffset = PANEL_THICKNESS / 2 + 0.036;
  const handleHitboxRef = useRef<THREE.Mesh>(null);
  const selection = useMemo(() => ({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex }), [cell.column, cell.depthIndex, cell.row]);
  const handleLocalPoint = useMemo<[number, number, number]>(() => [handleX - pivotX, 0, frontOffset + 0.086], [frontOffset, handleX, pivotX]);
  const closedPoint = useMemo<[number, number, number]>(() => [
    cell.x + pivotX + handleLocalPoint[0],
    cell.y + handleLocalPoint[1],
    frontZ + handleLocalPoint[2]
  ], [cell.x, cell.y, frontZ, handleLocalPoint, pivotX]);
  const openPoint = useMemo<[number, number, number]>(() => {
    const cos = Math.cos(signedMaxAngle);
    const sin = Math.sin(signedMaxAngle);
    const rotatedX = handleLocalPoint[0] * cos + handleLocalPoint[2] * sin;
    const rotatedZ = -handleLocalPoint[0] * sin + handleLocalPoint[2] * cos;
    return [cell.x + pivotX + rotatedX, cell.y + handleLocalPoint[1], frontZ + rotatedZ];
  }, [cell.x, cell.y, frontZ, handleLocalPoint, pivotX, signedMaxAngle]);

  useGlassDoorHandleDrag({
    hitboxRef: handleHitboxRef,
    selection,
    doorOpen: open,
    closedPoint,
    openPoint,
    onSelect,
    onDoorOpen,
    onDoorDragActive
  });

  return (
    <group>
      <group position={[cell.x + pivotX, cell.y, frontZ]}>
        <GlassDoorHinges panelH={panelH} />
        <group rotation={[0, angle, 0]}>
          <PanelBox position={[-pivotX, 0, 0]} args={[panelW, panelH, PANEL_THICKNESS]}>
            <meshPhysicalMaterial color="#d6f4ff" metalness={0.02} roughness={0.03} transmission={0.48} opacity={0.36} transparent />
          </PanelBox>
          <group position={[-pivotX, 0, 0]}>
            <FrameRect width={panelW} height={panelH} z={PANEL_THICKNESS / 2 + 0.015} />
          </group>
          <GlassDoorChromeHandle x={handleX - pivotX} side={handleSide} z={frontOffset} />
          <mesh ref={handleHitboxRef} position={handleLocalPoint} renderOrder={40}>
            <boxGeometry args={[0.34, 0.3, 0.34]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function GlassDoorChromeHandle({ x, side, z }: { x: number; side: GlassDoorHandleSide; z: number }) {
  const sideSign = side === "left" ? -1 : 1;
  const knobX = sideSign * 0.056;
  return (
    <group position={[x, 0, z]}>
      <PanelBox position={[-sideSign * 0.018, 0, 0.028]} args={[0.128, 0.088, 0.048]}>
        <meshStandardMaterial color="#15181a" roughness={0.48} metalness={0.18} />
      </PanelBox>
      <PanelBox position={[-sideSign * 0.056, 0, 0.056]} args={[0.048, 0.092, 0.014]}>
        <meshStandardMaterial color="#202326" roughness={0.54} metalness={0.12} />
      </PanelBox>
      <mesh position={[knobX, 0, 0.057]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.049, 0.049, 0.014, 40]} />
        <meshStandardMaterial color="#101214" roughness={0.5} metalness={0.16} />
      </mesh>
      <mesh position={[knobX, 0, 0.088]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.042, 0.042, 0.062, 48]} />
        <meshPhysicalMaterial color="#cfd4d5" metalness={0.92} roughness={0.18} clearcoat={0.66} />
      </mesh>
      <mesh position={[knobX, 0, 0.123]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.039, 0.041, 0.014, 48]} />
        <meshPhysicalMaterial color="#e2e5e5" metalness={0.94} roughness={0.14} clearcoat={0.8} />
      </mesh>
      <mesh position={[knobX, 0, 0.132]} renderOrder={35}>
        <circleGeometry args={[0.039, 48]} />
        <meshBasicMaterial color="#d8d2c8" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[knobX - sideSign * 0.014, 0.016, 0.131]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.011, 16, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.42} />
      </mesh>
    </group>
  );
}

function GlassDoorHinges({ panelH }: { panelH: number }) {
  const yPositions = [panelH * 0.34, -panelH * 0.34];
  const zPositions = [0.028, -0.028];
  return (
    <group>
      {yPositions.flatMap((y) => zPositions.map((z) => (
        <GlassDoorHinge key={`${y}-${z}`} y={y} z={z} />
      )))}
    </group>
  );
}

function GlassDoorHinge({ y, z }: { y: number; z: number }) {
  return (
    <group position={[0, y, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.027, 0.027, 0.05, 28]} />
        <meshPhysicalMaterial color="#edf1f1" metalness={0.78} roughness={0.16} clearcoat={0.72} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.054, 20]} />
        <meshStandardMaterial color="#303638" roughness={0.34} metalness={0.28} />
      </mesh>
    </group>
  );
}

function SoftPanel({ cell, backZ, widthRatio, heightRatio, yBias }: { cell: LayoutCell; backZ: number; widthRatio: number; heightRatio: number; yBias: number }) {
  return (
    <group>
      <PanelBox position={[cell.x, cell.y + cell.height * yBias, backZ + 0.04]} args={[cell.width * widthRatio, cell.height * heightRatio, 0.045]}>
        <meshStandardMaterial color="#22272c" roughness={0.86} metalness={0.02} />
      </PanelBox>
      <PanelBox position={[cell.x, cell.y + cell.height * yBias, backZ + 0.065]} args={[cell.width * widthRatio - 0.05, 0.014, 0.012]}>
        <meshStandardMaterial color="#4a4f55" roughness={0.72} />
      </PanelBox>
    </group>
  );
}

function Shelf({ cell, innerDepth, color }: { cell: LayoutCell; innerDepth: number; color: string }) {
  return (
    <PanelBox position={[cell.x, cell.y, cell.z]} args={[officialPanelSpan(cell.width), STEEL_PANEL_THICKNESS, innerDepth]}>
      <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} />
    </PanelBox>
  );
}

function OfficialMobileTrayAsset({
  assets,
  part,
  position,
  args,
  color,
  metal,
  darkMetal
}: {
  assets: DoorInteriorComboAssets | null;
  part: "tray" | "rails";
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  metal: string;
  darkMetal: string;
}) {
  const scaledAsset = useMemo(() => {
    if (!assets) return null;
    const source = part === "tray" ? assets.mobileTray : assets.mobileTrayRails;
    const clone = cloneOfficialMobileTrayAsset(source, color, metal, darkMetal);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    clone.position.set(-center.x, -center.y, -center.z);
    group.scale.set(
      args[0] / Math.max(size.x, 0.001),
      args[1] / Math.max(size.y, 0.001),
      args[2] / Math.max(size.z, 0.001)
    );
    group.add(clone);
    group.position.set(...position);
    return group;
  }, [args[0], args[1], args[2], assets, color, darkMetal, metal, part, position[0], position[1], position[2]]);

  useEffect(() => () => disposeClonedAsset(scaledAsset), [scaledAsset]);

  return scaledAsset ? <primitive object={scaledAsset} /> : null;
}

function PullOutShelf({
  cell,
  frontZ,
  innerDepth,
  color,
  drawerPull,
  accessoryId,
  selected,
  interactionDisabled = false,
  onSelect,
  onSelectAccessory,
  onDrawerPull,
  onDrawerDragActive
}: {
  cell: LayoutCell;
  frontZ: number;
  innerDepth: number;
  color: string;
  drawerPull: number;
  accessoryId?: string;
  selected: boolean;
  interactionDisabled?: boolean;
  onSelect: () => void;
  onSelectAccessory: (selection: Selection, accessoryId: string) => void;
  onDrawerPull: DrawerPullHandler;
  onDrawerDragActive: (active: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const dragRef = useRef<{
    startPull: number;
    currentPull: number;
    startX: number;
    startY: number;
    axisX: number;
    axisY: number;
    axisLengthSq: number;
  } | null>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const trayWidth = Math.max(0.16, cell.width - 0.22);
  const trayDepth = Math.max(0.18, innerDepth * 0.78);
  const sidePanelHeight = Math.min(0.16, Math.max(0.08, cell.height * 0.24));
  const sidePanelThickness = 0.028;
  const trayY = cell.y - cell.height * 0.16;
  const railY = trayY + sidePanelHeight * 0.34;
  const railZ = cell.z - innerDepth * 0.05;
  const railDepth = Math.max(0.2, innerDepth * 0.78);
  const maxExtension = Math.min(0.72, innerDepth * 0.72);
  const extension = maxExtension * Math.max(0, Math.min(1, drawerPull));
  const sideX = trayWidth / 2 + sidePanelThickness / 2;
  const fixedSideX = cell.width / 2 - 0.095;
  const trayColor = "#f0ede8";
  const sideColor = "#d8d6cf";
  const metal = "#6d7378";
  const darkMetal = "#4a5058";
  const selection = useMemo(() => ({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex }), [cell.column, cell.depthIndex, cell.row]);
  const clampPull = (value: number) => Math.max(0, Math.min(1, value));
  const snapPull = (value: number) => (value < 0.5 ? 0 : 1);
  const drawerPullRef = useRef(drawerPull);
  const interactionDisabledRef = useRef(interactionDisabled);
  const selectionRef = useRef(selection);
  const accessoryIdRef = useRef(accessoryId);
  const onSelectRef = useRef(onSelect);
  const onSelectAccessoryRef = useRef(onSelectAccessory);
  const onDrawerPullRef = useRef(onDrawerPull);
  const onDrawerDragActiveRef = useRef(onDrawerDragActive);
  const officialAssets = useDoorInteriorComboAssets();
  const registeredHitboxRef = useRef<THREE.Mesh | null>(null);
  const suppressNextClickRef = useRef(false);
  const getTrayScreenBounds = useCallback((rect: DOMRect): ScreenBounds | null => {
    const hitbox = hitboxRef.current;
    if (!hitbox) return null;
    return getObjectScreenBounds(hitbox, camera, rect, MOBILE_TRAY_SCREEN_HIT_MARGIN);
  }, [camera]);
  const registerHitbox = useCallback((node: THREE.Mesh | null) => {
    const canvas = gl.domElement;
    const hitboxes = getMobileTrayHitboxes(canvas);
    const current = registeredHitboxRef.current;
    if (current && current !== node) {
      hitboxes.delete(current);
      delete (current.userData as MobileTrayHitboxUserData).getScreenBounds;
      delete (current.userData as MobileTrayHitboxUserData).isInteractionDisabled;
    }

    hitboxRef.current = node;
    registeredHitboxRef.current = node;
    if (node) {
      const userData = node.userData as MobileTrayHitboxUserData;
      userData.getScreenBounds = getTrayScreenBounds;
      userData.isInteractionDisabled = () => interactionDisabledRef.current;
      hitboxes.add(node);
    }
  }, [getTrayScreenBounds, gl]);

  useEffect(() => {
    drawerPullRef.current = drawerPull;
    interactionDisabledRef.current = interactionDisabled;
    selectionRef.current = selection;
    accessoryIdRef.current = accessoryId;
    onSelectRef.current = onSelect;
    onSelectAccessoryRef.current = onSelectAccessory;
    onDrawerPullRef.current = onDrawerPull;
    onDrawerDragActiveRef.current = onDrawerDragActive;
  }, [accessoryId, drawerPull, interactionDisabled, onDrawerDragActive, onDrawerPull, onSelect, onSelectAccessory, selection]);

  useEffect(() => {
    const hitbox = hitboxRef.current;
    if (hitbox) {
      const userData = hitbox.userData as MobileTrayHitboxUserData;
      userData.getScreenBounds = getTrayScreenBounds;
      userData.isInteractionDisabled = () => interactionDisabledRef.current;
    }
  }, [getTrayScreenBounds]);

  useEffect(() => () => {
    const hitbox = registeredHitboxRef.current;
    if (!hitbox) return;
    getMobileTrayHitboxes(gl.domElement).delete(hitbox);
    delete (hitbox.userData as MobileTrayHitboxUserData).getScreenBounds;
    delete (hitbox.userData as MobileTrayHitboxUserData).isInteractionDisabled;
    registeredHitboxRef.current = null;
    hitboxRef.current = null;
  }, [gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function getScreenAxis(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (!hitbox) return null;
      return getScreenAxisForLocalVector(hitbox, camera, rect, new THREE.Vector3(0, 0, maxExtension));
    }

    function handleMouseDown(event: MouseEvent) {
      const hitbox = hitboxRef.current;
      if (interactionDisabledRef.current || dragRef.current || !hitbox) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const closestHit = getClosestMobileTrayHitbox(getMobileTrayHitboxes(canvas), raycaster, camera, rect, event.clientX, event.clientY);
      const inOwnBounds = isInsideScreenBounds(getTrayScreenBounds(rect), event.clientX, event.clientY);
      const axis = getScreenAxis(rect);
      if (closestHit?.object !== hitbox || !inOwnBounds || !axis) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      suppressNextClickRef.current = true;
      if (accessoryIdRef.current) {
        onSelectAccessoryRef.current(selectionRef.current, accessoryIdRef.current);
      } else {
        onSelectRef.current();
      }
      onDrawerDragActiveRef.current(true);
      dragRef.current = {
        startPull: drawerPullRef.current,
        currentPull: drawerPullRef.current,
        startX: event.clientX,
        startY: event.clientY,
        ...axis
      };
    }

    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const projected = (dx * drag.axisX + dy * drag.axisY) / drag.axisLengthSq;
      const nextPull = clampPull(drag.startPull + projected);
      drag.currentPull = nextPull;
      onDrawerPullRef.current(selectionRef.current, nextPull, false, accessoryIdRef.current);
    }

    function finishDrag(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const finishedAccessoryId = accessoryIdRef.current;
      const finishedSelection = selectionRef.current;
      onDrawerPullRef.current(selectionRef.current, snapPull(drag.currentPull), true, accessoryIdRef.current);
      if (finishedAccessoryId) {
        window.setTimeout(() => {
          onSelectAccessoryRef.current(finishedSelection, finishedAccessoryId);
        }, 120);
      }
      onDrawerDragActiveRef.current(false);
      dragRef.current = null;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 80);
    }

    function handleClick(event: MouseEvent) {
      if (!suppressNextClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      suppressNextClickRef.current = false;
    }

    canvas.addEventListener("mousedown", handleMouseDown, true);
    canvas.addEventListener("pointerdown", handleMouseDown, true);
    canvas.addEventListener("click", handleClick, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("pointermove", handleMouseMove, true);
    window.addEventListener("mouseup", finishDrag, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", finishDrag, true);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("pointerdown", handleMouseDown, true);
      canvas.removeEventListener("click", handleClick, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("pointermove", handleMouseMove, true);
      window.removeEventListener("mouseup", finishDrag, true);
      window.removeEventListener("pointerup", finishDrag, true);
      window.removeEventListener("pointercancel", finishDrag, true);
      if (dragRef.current) {
        onDrawerDragActiveRef.current(false);
        dragRef.current = null;
      }
      suppressNextClickRef.current = false;
    };
  }, [camera, getTrayScreenBounds, gl, maxExtension]);

  return (
    <group>
      <PanelBox position={[cell.x - fixedSideX, railY, railZ]} args={[sidePanelThickness, sidePanelHeight, railDepth]}>
        <meshStandardMaterial color={sideColor} roughness={0.5} metalness={0.04} />
      </PanelBox>
      <PanelBox position={[cell.x + fixedSideX, railY, railZ]} args={[sidePanelThickness, sidePanelHeight, railDepth]}>
        <meshStandardMaterial color={sideColor} roughness={0.5} metalness={0.04} />
      </PanelBox>
      <PanelBox position={[cell.x - fixedSideX + 0.014, railY, railZ + extension / 2]} args={[0.018, 0.026, railDepth + extension]}>
        <meshStandardMaterial color={metal} metalness={0.72} roughness={0.26} />
      </PanelBox>
      <PanelBox position={[cell.x + fixedSideX - 0.014, railY, railZ + extension / 2]} args={[0.018, 0.026, railDepth + extension]}>
        <meshStandardMaterial color={metal} metalness={0.72} roughness={0.26} />
      </PanelBox>
      <PanelBox position={[cell.x - fixedSideX + 0.034, railY + 0.018, railZ + extension]} args={[0.014, 0.018, railDepth * 0.62]}>
        <meshStandardMaterial color={darkMetal} metalness={0.68} roughness={0.28} />
      </PanelBox>
      <PanelBox position={[cell.x + fixedSideX - 0.034, railY + 0.018, railZ + extension]} args={[0.014, 0.018, railDepth * 0.62]}>
        <meshStandardMaterial color={darkMetal} metalness={0.68} roughness={0.28} />
      </PanelBox>
      <OfficialMobileTrayAsset
        assets={officialAssets}
        part="rails"
        position={[cell.x, railY, railZ]}
        args={[Math.max(0.16, cell.width - 0.16), sidePanelHeight + 0.05, railDepth]}
        color={trayColor}
        metal={metal}
        darkMetal={darkMetal}
      />

      <group position={[0, 0, extension]}>
        <PanelBox position={[cell.x, trayY, cell.z]} args={[trayWidth, PANEL_THICKNESS, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.46} metalness={0.06} />
        </PanelBox>
        <PanelBox position={[cell.x - sideX, trayY + sidePanelHeight / 2, cell.z]} args={[sidePanelThickness, sidePanelHeight, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.46} metalness={0.06} />
        </PanelBox>
        <PanelBox position={[cell.x + sideX, trayY + sidePanelHeight / 2, cell.z]} args={[sidePanelThickness, sidePanelHeight, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.46} metalness={0.06} />
        </PanelBox>
        <PanelBox position={[cell.x, trayY + sidePanelHeight / 2, cell.z - trayDepth / 2 + sidePanelThickness / 2]} args={[trayWidth, sidePanelHeight, sidePanelThickness]}>
          <meshStandardMaterial color={trayColor} roughness={0.46} metalness={0.06} />
        </PanelBox>
        <PanelBox position={[cell.x, trayY + sidePanelHeight + 0.005, frontZ - cell.depth * 0.08]} args={[trayWidth * 0.42, 0.018, 0.018]}>
          <meshStandardMaterial color={metal} metalness={0.7} roughness={0.28} />
        </PanelBox>
        <OfficialMobileTrayAsset
          assets={officialAssets}
          part="tray"
          position={[cell.x, trayY + sidePanelHeight / 2, cell.z]}
          args={[trayWidth, sidePanelHeight + 0.05, trayDepth]}
          color={trayColor}
          metal={metal}
          darkMetal={darkMetal}
        />
        {selected ? (
          <MobileTraySelectionFrame
            accessoryId={accessoryId}
            cell={cell}
            trayWidth={trayWidth}
            trayDepth={trayDepth}
            trayY={trayY}
            sidePanelHeight={sidePanelHeight}
          />
        ) : null}
        <mesh
          ref={registerHitbox}
          position={[cell.x, trayY + sidePanelHeight / 2, cell.z]}
          renderOrder={40}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <boxGeometry args={[
            Math.max(trayWidth + 0.34, cell.width + 0.04),
            sidePanelHeight + 0.32,
            trayDepth + maxExtension + 0.26
          ]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function MobileTraySelectionFrame({
  accessoryId,
  cell,
  trayWidth,
  trayDepth,
  trayY,
  sidePanelHeight
}: {
  accessoryId?: string;
  cell: LayoutCell;
  trayWidth: number;
  trayDepth: number;
  trayY: number;
  sidePanelHeight: number;
}) {
  const color = "#ffd400";
  const thickness = 0.018;
  const y = trayY + sidePanelHeight + 0.03;
  const xPad = 0.055;
  const zPad = 0.045;
  const width = trayWidth + xPad * 2;
  const depth = trayDepth + zPad * 2;

  return (
    <group name={`selected-mobile-tray-${accessoryId ?? "legacy"}`} userData={{ selectedMobileTrayId: accessoryId ?? "" }}>
      <PanelBox position={[cell.x, y, cell.z + depth / 2]} args={[width, thickness, thickness]}><meshBasicMaterial color={color} toneMapped={false} /></PanelBox>
      <PanelBox position={[cell.x, y, cell.z - depth / 2]} args={[width, thickness, thickness]}><meshBasicMaterial color={color} toneMapped={false} /></PanelBox>
      <PanelBox position={[cell.x - width / 2, y, cell.z]} args={[thickness, thickness, depth]}><meshBasicMaterial color={color} toneMapped={false} /></PanelBox>
      <PanelBox position={[cell.x + width / 2, y, cell.z]} args={[thickness, thickness, depth]}><meshBasicMaterial color={color} toneMapped={false} /></PanelBox>
      <PanelBox position={[cell.x, y + 0.045, cell.z + depth / 2]} args={[width * 0.42, thickness, thickness]}><meshBasicMaterial color={color} toneMapped={false} /></PanelBox>
    </group>
  );
}

function BoxDrawer({ cell, frontZ, innerDepth, color }: { cell: LayoutCell; frontZ: number; innerDepth: number; color: string }) {
  const drawerDepth = innerDepth * 0.72;
  const panelWidth = officialPanelSpan(cell.width);
  return (
    <group position={[cell.x, cell.y - cell.height * 0.08, cell.z + innerDepth * 0.12]}>
      <PanelBox position={[0, 0, 0]} args={[cell.width - 0.16, cell.height * 0.56, drawerDepth]}>
        <meshStandardMaterial color="#d7dcdf" roughness={0.5} metalness={0.04} />
      </PanelBox>
      <PanelBox position={[0, 0, frontZ - cell.z - innerDepth * 0.12 + STEEL_PANEL_THICKNESS / 2]} args={[panelWidth, Math.max(0.12, cell.height * 0.62), STEEL_PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </PanelBox>
      <Handle width={(cell.width - 0.18) * 0.46} y={cell.height * 0.12} />
    </group>
  );
}

function RimmedDrawer({
  cell,
  frontZ,
  innerDepth,
  color,
  hideFront,
  drawerPull,
  onSelect,
  onDrawerPull,
  onDrawerDragActive
}: {
  cell: LayoutCell;
  frontZ: number;
  innerDepth: number;
  color: string;
  hideFront: boolean;
  drawerPull: number;
  onSelect: () => void;
  onDrawerPull: (selection: Selection, value: number, remember?: boolean) => void;
  onDrawerDragActive: (active: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const dragRef = useRef<{
    startPull: number;
    currentPull: number;
    pointerId: number;
    startPoint?: THREE.Vector3;
    axisWorld?: THREE.Vector3;
    startX?: number;
    startY?: number;
    axisX?: number;
    axisY?: number;
    axisLengthSq?: number;
  } | null>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const panelWidth = Math.max(0.16, officialPanelSpan(cell.width));
  const panelHeight = Math.max(0.12, officialPanelSpan(cell.height));
  const rimHeight = Math.min(Math.max(0.08, RIMMED_DRAWER_RIM_HEIGHT_MM * SCALE), Math.max(0.08, cell.height - 0.14));
  const maxExtension = Math.min(0.58, innerDepth * 0.42);
  const extension = maxExtension * drawerPull;
  const trayDepth = Math.max(0.12, innerDepth * 0.86);
  const trayWidth = Math.max(0.12, cell.width - 0.22);
  const frontFrameZ = cell.z + cell.depth / 2;
  const frontPanelZ = frontZ;
  const trayY = cell.y - cell.height / 2 + PANEL_THICKNESS / 2 + 0.03;
  const trayZ = frontFrameZ - trayDepth / 2 - 0.02;
  const rimY = trayY + PANEL_THICKNESS / 2 + rimHeight / 2;
  const railY = trayY + 0.075;
  const railDepth = Math.max(0.14, innerDepth * 0.82);
  const railZ = frontFrameZ - railDepth / 2 - 0.045;
  const sideX = trayWidth / 2 - 0.028;
  const metal = "#6c7379";
  const darkMetal = "#4a5058";
  const trayColor = "#f0ede8";
  const selection = useMemo(() => ({ row: cell.row, column: cell.column, depthIndex: cell.depthIndex }), [cell.column, cell.depthIndex, cell.row]);

  const clampPull = (value: number) => Math.max(0, Math.min(1, value));
  const snapPull = (value: number) => [0, 0.5, 1].reduce((best, next) => (
    Math.abs(next - value) < Math.abs(best - value) ? next : best
  ));
  const drawerPullRef = useRef(drawerPull);
  const selectionRef = useRef(selection);
  const onSelectRef = useRef(onSelect);
  const onDrawerPullRef = useRef(onDrawerPull);
  const onDrawerDragActiveRef = useRef(onDrawerDragActive);

  useEffect(() => {
    drawerPullRef.current = drawerPull;
    selectionRef.current = selection;
    onSelectRef.current = onSelect;
    onDrawerPullRef.current = onDrawerPull;
    onDrawerDragActiveRef.current = onDrawerDragActive;
  }, [drawerPull, onDrawerDragActive, onDrawerPull, onSelect, selection]);

  useEffect(() => {
    const canvas = gl.domElement;
    const scratch = new THREE.Vector3();

    function projectPoint(rect: DOMRect, point: THREE.Vector3) {
      scratch.copy(point).project(camera);
      return {
        x: rect.left + ((scratch.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - scratch.y) / 2) * rect.height
      };
    }

    function boundsFromPoints(rect: DOMRect, points: THREE.Vector3[], margin: number) {
      const corners = points.map((point) => projectPoint(rect, point));
      return {
        minX: Math.min(...corners.map((point) => point.x)) - margin,
        maxX: Math.max(...corners.map((point) => point.x)) + margin,
        minY: Math.min(...corners.map((point) => point.y)) - margin,
        maxY: Math.max(...corners.map((point) => point.y)) + margin
      };
    }

    function getScreenAxis(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (hitbox) {
        const axis = getScreenAxisForLocalVector(hitbox, camera, rect, new THREE.Vector3(0, 0, maxExtension));
        if (axis) return axis;
      }

      const currentFrontZ = frontPanelZ + maxExtension * drawerPullRef.current + STEEL_PANEL_THICKNESS / 2 + 0.05;
      return getScreenAxisForWorldPoints(
        camera,
        rect,
        new THREE.Vector3(cell.x, cell.y, currentFrontZ),
        new THREE.Vector3(cell.x, cell.y, currentFrontZ + maxExtension)
      );
    }

    function getHitboxBounds(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      if (!hitbox) return null;
      hitbox.updateWorldMatrix(true, false);
      const halfWidth = panelWidth / 2;
      const halfHeight = panelHeight / 2;
      const corners = [
        new THREE.Vector3(-halfWidth, -halfHeight, 0),
        new THREE.Vector3(halfWidth, -halfHeight, 0),
        new THREE.Vector3(halfWidth, halfHeight, 0),
        new THREE.Vector3(-halfWidth, halfHeight, 0)
      ].map((point) => hitbox.localToWorld(point));
      return boundsFromPoints(rect, corners, 48);
    }

    function getFrontFaceBounds(rect: DOMRect) {
      const hitbox = hitboxRef.current;
      const halfWidth = panelWidth / 2;
      const halfHeight = panelHeight / 2;
      const localCorners = [
        new THREE.Vector3(-halfWidth, -halfHeight, 0),
        new THREE.Vector3(halfWidth, -halfHeight, 0),
        new THREE.Vector3(halfWidth, halfHeight, 0),
        new THREE.Vector3(-halfWidth, halfHeight, 0)
      ];

      if (hitbox) {
        hitbox.updateWorldMatrix(true, false);
        return boundsFromPoints(rect, localCorners.map((point) => hitbox.localToWorld(point)), 64);
      }

      const currentFrontZ = frontPanelZ + maxExtension * drawerPullRef.current + STEEL_PANEL_THICKNESS / 2 + 0.05;
      const worldCorners = localCorners.map((point) => new THREE.Vector3(cell.x + point.x, cell.y + point.y, currentFrontZ));
      return boundsFromPoints(rect, worldCorners, 64);
    }

    function isInsideBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number } | null, event: MouseEvent) {
      return !!bounds
        && event.clientX >= bounds.minX
        && event.clientX <= bounds.maxX
        && event.clientY >= bounds.minY
        && event.clientY <= bounds.maxY;
    }

    function handleMouseDown(event: MouseEvent) {
      if (dragRef.current || hideFront) return;
      const rect = canvas.getBoundingClientRect();
      const bounds = getHitboxBounds(rect);
      const frontFaceBounds = getFrontFaceBounds(rect);
      const hitboxHit = isInsideBounds(bounds, event);
      const frontFaceHit = isInsideBounds(frontFaceBounds, event);
      if (!hitboxHit && !frontFaceHit) return;
      const axis = getScreenAxis(rect);
      if (!axis) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelectRef.current();
      onDrawerDragActiveRef.current(true);
      dragRef.current = {
        startPull: drawerPullRef.current,
        currentPull: drawerPullRef.current,
        pointerId: -1,
        startX: event.clientX,
        startY: event.clientY,
        ...axis
      };
    }

    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== -1 || drag.startX === undefined || drag.startY === undefined || !drag.axisLengthSq) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const projected = (dx * (drag.axisX ?? 0) + dy * (drag.axisY ?? 0)) / drag.axisLengthSq;
      const nextPull = clampPull(drag.startPull + projected);
      drag.currentPull = nextPull;
      onDrawerPullRef.current(selectionRef.current, nextPull, false);
    }

    function handleMouseUp(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== -1) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onDrawerPullRef.current(selectionRef.current, snapPull(drag.currentPull), true);
      onDrawerDragActiveRef.current(false);
      dragRef.current = null;
    }

    canvas.addEventListener("mousedown", handleMouseDown, true);
    canvas.addEventListener("pointerdown", handleMouseDown, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("pointermove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("pointerup", handleMouseUp, true);
    window.addEventListener("pointercancel", handleMouseUp, true);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("pointerdown", handleMouseDown, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("pointermove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("pointerup", handleMouseUp, true);
      window.removeEventListener("pointercancel", handleMouseUp, true);
      if (dragRef.current) {
        onDrawerDragActiveRef.current(false);
        dragRef.current = null;
      }
    };
  }, [camera, cell.x, cell.y, frontPanelZ, gl, hideFront, maxExtension, panelHeight, panelWidth]);

  return (
    <group>
      <PanelBox position={[cell.x - cell.width / 2 + 0.1, railY, railZ]} args={[0.035, 0.035, railDepth]}>
        <meshStandardMaterial color={metal} roughness={0.26} metalness={0.72} />
      </PanelBox>
      <PanelBox position={[cell.x + cell.width / 2 - 0.1, railY, railZ]} args={[0.035, 0.035, railDepth]}>
        <meshStandardMaterial color={metal} roughness={0.26} metalness={0.72} />
      </PanelBox>
      <PanelBox position={[cell.x - cell.width / 2 + 0.1, railY - 0.034, cell.z - innerDepth * 0.12]} args={[0.042, 0.018, innerDepth * 0.7]}>
        <meshStandardMaterial color={darkMetal} roughness={0.32} metalness={0.62} />
      </PanelBox>
      <PanelBox position={[cell.x + cell.width / 2 - 0.1, railY - 0.034, cell.z - innerDepth * 0.12]} args={[0.042, 0.018, innerDepth * 0.7]}>
        <meshStandardMaterial color={darkMetal} roughness={0.32} metalness={0.62} />
      </PanelBox>

      <group position={[0, 0, extension]}>
        {!hideFront ? (
          <group
            position={[cell.x, cell.y, frontPanelZ]}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
              const axisWorld = hitboxRef.current
                ? getWorldDirectionForLocalVector(hitboxRef.current, new THREE.Vector3(0, 0, 1))
                : new THREE.Vector3(0, 0, 1);
              onDrawerDragActive(true);
              dragRef.current = {
                startPull: drawerPull,
                currentPull: drawerPull,
                pointerId: event.pointerId,
                startPoint: event.point.clone(),
                axisWorld
              };
              (event.target as Element).setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragRef.current?.startPoint || !dragRef.current.axisWorld) return;
              event.stopPropagation();
              const distance = event.point.clone().sub(dragRef.current.startPoint).dot(dragRef.current.axisWorld);
              const nextPull = clampPull(dragRef.current.startPull + distance / maxExtension);
              dragRef.current.currentPull = nextPull;
              onDrawerPull(selection, nextPull, false);
            }}
            onPointerUp={(event) => {
              if (!dragRef.current) return;
              event.stopPropagation();
              const snapped = snapPull(dragRef.current.currentPull);
              onDrawerPull(selection, snapped, true);
              onDrawerDragActive(false);
              (event.target as Element).releasePointerCapture?.(dragRef.current.pointerId);
              dragRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (!dragRef.current) return;
              event.stopPropagation();
              onDrawerPull(selection, snapPull(dragRef.current.currentPull), true);
              onDrawerDragActive(false);
              dragRef.current = null;
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <PanelBox position={[0, 0, 0]} args={[panelWidth, panelHeight, STEEL_PANEL_THICKNESS]}>
              <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
            </PanelBox>
            <FrameRect width={panelWidth} height={panelHeight} z={STEEL_PANEL_THICKNESS / 2 + 0.014} />
            <DrawerLock y={panelHeight * 0.28} />
            <mesh
              ref={hitboxRef}
              position={[0, 0, STEEL_PANEL_THICKNESS / 2 + 0.05]}
              renderOrder={40}
            >
              <boxGeometry args={[panelWidth, panelHeight, 0.1]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        ) : null}

        <PanelBox position={[cell.x, trayY, trayZ]} args={[trayWidth, PANEL_THICKNESS, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.5} metalness={0.04} />
        </PanelBox>
        <PanelBox position={[cell.x, rimY, trayZ + trayDepth / 2 - 0.035]} args={[trayWidth, rimHeight, 0.032]}>
          <meshStandardMaterial color={trayColor} roughness={0.48} metalness={0.05} />
        </PanelBox>
        <PanelBox position={[cell.x - sideX, rimY, trayZ]} args={[0.036, rimHeight, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.48} metalness={0.05} />
        </PanelBox>
        <PanelBox position={[cell.x + sideX, rimY, trayZ]} args={[0.036, rimHeight, trayDepth]}>
          <meshStandardMaterial color={trayColor} roughness={0.48} metalness={0.05} />
        </PanelBox>
        <PanelBox position={[cell.x, rimY, trayZ - trayDepth / 2 + 0.018]} args={[trayWidth - 0.06, rimHeight, 0.036]}>
          <meshStandardMaterial color={trayColor} roughness={0.48} metalness={0.05} />
        </PanelBox>
        <PanelBox position={[cell.x - sideX, railY, trayZ + trayDepth * 0.04]} args={[0.018, 0.026, trayDepth * 0.82]}>
          <meshStandardMaterial color={metal} roughness={0.3} metalness={0.66} />
        </PanelBox>
        <PanelBox position={[cell.x + sideX, railY, trayZ + trayDepth * 0.04]} args={[0.018, 0.026, trayDepth * 0.82]}>
          <meshStandardMaterial color={metal} roughness={0.3} metalness={0.66} />
        </PanelBox>
      </group>
    </group>
  );
}

function DrawerLock({ y }: { y: number }) {
  const ridgeCount = 28;
  const ridges = useMemo(() => Array.from({ length: ridgeCount }, (_, index) => ({
    key: index,
    rotation: (index / ridgeCount) * Math.PI * 2
  })), []);

  return (
    <group>
      <mesh position={[0, y, PANEL_THICKNESS / 2 + 0.028]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.064, 0.064, 0.02, 48]} />
        <meshStandardMaterial color="#8d9294" roughness={0.22} metalness={0.84} />
      </mesh>
      <mesh position={[0, y, PANEL_THICKNESS / 2 + 0.041]}>
        <torusGeometry args={[0.042, 0.0035, 8, 48]} />
        <meshStandardMaterial color="#606568" roughness={0.28} metalness={0.78} />
      </mesh>
      {ridges.map((ridge) => (
        <group key={ridge.key} position={[0, y, PANEL_THICKNESS / 2 + 0.045]} rotation={[0, 0, ridge.rotation]}>
          <PanelBox position={[0, 0.066, 0]} args={[0.004, 0.018, 0.006]}>
            <meshStandardMaterial color="#d2d5d6" roughness={0.34} metalness={0.72} />
          </PanelBox>
        </group>
      ))}
      <PanelBox position={[0, y, PANEL_THICKNESS / 2 + 0.052]} args={[0.06, 0.014, 0.007]}>
        <meshStandardMaterial color="#111111" roughness={0.36} metalness={0.18} />
      </PanelBox>
    </group>
  );
}

function DisplayTray({ cell, innerDepth, color }: { cell: LayoutCell; innerDepth: number; color: string }) {
  const y = cell.y - cell.height * 0.18;
  const rim = 0.07;
  const trayWidth = officialPanelSpan(cell.width);
  const sideX = cell.width / 2 - STEEL_PANEL_EDGE_INSET - STEEL_PANEL_THICKNESS / 2;
  return (
    <group>
      <PanelBox position={[cell.x, y, cell.z]} args={[trayWidth, STEEL_PANEL_THICKNESS, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x - sideX, y + rim / 2, cell.z]} args={[STEEL_PANEL_THICKNESS, rim, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x + sideX, y + rim / 2, cell.z]} args={[STEEL_PANEL_THICKNESS, rim, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x, y + rim / 2, cell.z - innerDepth / 2 + STEEL_PANEL_THICKNESS / 2]} args={[trayWidth, rim, STEEL_PANEL_THICKNESS]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
    </group>
  );
}

function GlassShelf({ cell, innerDepth, material }: { cell: LayoutCell; innerDepth: number; material: ReactNode }) {
  return <PanelBox position={[cell.x, cell.y, cell.z]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}>{material}</PanelBox>;
}

function Handle({ width, y }: { width: number; y: number }) {
  return (
    <PanelBox position={[0, y, PANEL_THICKNESS / 2 + 0.012]} args={[width, 0.016, 0.012]}>
      <meshStandardMaterial color="#6d7175" roughness={0.35} metalness={0.7} />
    </PanelBox>
  );
}

function FrameRect({ width, height, z }: { width: number; height: number; z: number }) {
  const color = "#8f9ba4";
  return (
    <group>
      <PanelBox position={[0, height / 2, z]} args={[width, 0.026, 0.016]}><meshStandardMaterial color={color} metalness={0.75} roughness={0.24} /></PanelBox>
      <PanelBox position={[0, -height / 2, z]} args={[width, 0.026, 0.016]}><meshStandardMaterial color={color} metalness={0.75} roughness={0.24} /></PanelBox>
      <PanelBox position={[-width / 2, 0, z]} args={[0.026, height, 0.016]}><meshStandardMaterial color={color} metalness={0.75} roughness={0.24} /></PanelBox>
      <PanelBox position={[width / 2, 0, z]} args={[0.026, height, 0.016]}><meshStandardMaterial color={color} metalness={0.75} roughness={0.24} /></PanelBox>
    </group>
  );
}

function SelectionFrame({ cell }: { cell: LayoutCell }) {
  const z = cell.z + cell.depth / 2 + 0.055;
  const thickness = 0.022;
  const color = "#ffe100";
  return (
    <group>
      <PanelBox position={[cell.x, cell.y + cell.height / 2, z]} args={[cell.width + 0.04, thickness, thickness]}><meshBasicMaterial color={color} /></PanelBox>
      <PanelBox position={[cell.x, cell.y - cell.height / 2, z]} args={[cell.width + 0.04, thickness, thickness]}><meshBasicMaterial color={color} /></PanelBox>
      <PanelBox position={[cell.x - cell.width / 2, cell.y, z]} args={[thickness, cell.height + 0.04, thickness]}><meshBasicMaterial color={color} /></PanelBox>
      <PanelBox position={[cell.x + cell.width / 2, cell.y, z]} args={[thickness, cell.height + 0.04, thickness]}><meshBasicMaterial color={color} /></PanelBox>
    </group>
  );
}

function ExpandHints({ cell, onExpand }: { cell: LayoutCell; onExpand: (direction: "left" | "right" | "top" | "front") => void }) {
  const { camera, gl } = useThree();
  const z = cell.z + cell.depth / 2 + EXPAND_HINT_FACE_OFFSET;
  const buttons = useMemo<Array<{ direction: "left" | "right" | "top" | "front"; position: [number, number, number] }>>(() => [
    { direction: "left", position: [cell.x - cell.width / 2 - 0.16, cell.y, z] },
    { direction: "right", position: [cell.x + cell.width / 2 + 0.16, cell.y, z] },
    { direction: "top", position: [cell.x, cell.y + cell.height / 2 + 0.16, z] },
    { direction: "front", position: [cell.x, cell.y, cell.z + cell.depth / 2 + EXPAND_HINT_FRONT_OFFSET] }
  ], [cell.depth, cell.height, cell.width, cell.x, cell.y, cell.z, z]);
  const buttonRefs = useRef<Record<string, THREE.Object3D | null>>({});
  const lastRaycastExpandAt = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function handlePointerDown(event: MouseEvent | PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      let hit: "left" | "right" | "top" | "front" | null = null;
      let hitDistance = Number.POSITIVE_INFINITY;
      for (const button of buttons) {
        const node = buttonRefs.current[button.direction];
        if (!node) continue;
        const nextHit = raycaster.intersectObject(node, false)[0];
        if (nextHit && nextHit.distance < hitDistance) {
          hit = button.direction;
          hitDistance = nextHit.distance;
        }
      }

      if (!hit) return;
      const now = performance.now();
      if (now - lastRaycastExpandAt.current < 160) return;
      lastRaycastExpandAt.current = now;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onExpand(hit);
    }

    canvas.addEventListener("mousedown", handlePointerDown, true);
    canvas.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      canvas.removeEventListener("mousedown", handlePointerDown, true);
      canvas.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [buttons, camera, gl, onExpand]);

  return (
    <group>
      {buttons.map((button) => (
        <Billboard
          key={button.direction}
          position={button.position}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <mesh
            ref={(node) => {
              buttonRefs.current[button.direction] = node;
            }}
            renderOrder={22}
            onPointerDown={(event) => {
              event.stopPropagation();
              onExpand(button.direction);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.001} depthTest={false} depthWrite={false} />
          </mesh>
          <mesh renderOrder={20} raycast={() => undefined}>
            <circleGeometry args={[0.11, 32]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.08} depthTest={false} />
          </mesh>
          <mesh renderOrder={21} raycast={() => undefined}>
            <ringGeometry args={[0.082, 0.105, 32]} />
            <meshBasicMaterial color="#111111" transparent opacity={0.88} depthTest={false} />
          </mesh>
          <PlusMark />
        </Billboard>
      ))}
    </group>
  );
}

function PlusMark() {
  return (
    <group position={[0, 0, 0.012]}>
      <PanelBox position={[0, 0, 0]} args={[0.12, 0.014, 0.01]}><meshBasicMaterial color="#111111" depthTest={false} /></PanelBox>
      <PanelBox position={[0, 0, 0]} args={[0.014, 0.12, 0.01]}><meshBasicMaterial color="#111111" depthTest={false} /></PanelBox>
    </group>
  );
}

function WorkSurface({
  surface,
  fallbackColor,
  frameColor,
  metalness,
  roughness,
  supportBottomY
}: {
  surface: LayoutWorkSurface;
  fallbackColor: string;
  frameColor: string;
  metalness: number;
  roughness: number;
  supportBottomY: number;
}) {
  const color = surface.color ?? fallbackColor;
  const edgeColor = "#757c82";
  const edge = Math.min(0.03, surface.thickness * 0.42);

  return (
    <group position={[surface.x, surface.y, surface.z]}>
      <PanelBox position={[0, 0, 0]} args={[surface.width, surface.thickness, surface.depth]}>
        <meshStandardMaterial color={color} roughness={0.52} metalness={0.04} />
      </PanelBox>
      <PanelBox position={[0, surface.thickness / 2 + 0.003, surface.depth / 2 + 0.002]} args={[surface.width, edge, edge]}>
        <meshStandardMaterial color={edgeColor} roughness={0.36} metalness={0.42} />
      </PanelBox>
      <PanelBox position={[0, surface.thickness / 2 + 0.003, -surface.depth / 2 - 0.002]} args={[surface.width, edge, edge]}>
        <meshStandardMaterial color={edgeColor} roughness={0.36} metalness={0.42} />
      </PanelBox>
      <PanelBox position={[-surface.width / 2 - 0.002, surface.thickness / 2 + 0.003, 0]} args={[edge, edge, surface.depth]}>
        <meshStandardMaterial color={edgeColor} roughness={0.36} metalness={0.42} />
      </PanelBox>
      <PanelBox position={[surface.width / 2 + 0.002, surface.thickness / 2 + 0.003, 0]} args={[edge, edge, surface.depth]}>
        <meshStandardMaterial color={edgeColor} roughness={0.36} metalness={0.42} />
      </PanelBox>
      {surface.kind === "deskTop" ? (
        <DeskSurfaceFrame
          surface={surface}
          frameColor={frameColor}
          metalness={metalness}
          roughness={roughness}
          supportBottomY={supportBottomY}
        />
      ) : null}
    </group>
  );
}

function DeskSurfaceFrame({
  surface,
  frameColor,
  metalness,
  roughness,
  supportBottomY
}: {
  surface: LayoutWorkSurface;
  frameColor: string;
  metalness: number;
  roughness: number;
  supportBottomY: number;
}) {
  const ballRadius = BALL_RADIUS * 0.68;
  const inset = Math.min(0.2, Math.max(0.1, Math.min(surface.width, surface.depth) * 0.07));
  const x0 = -surface.width / 2 + inset;
  const x1 = surface.width / 2 - inset;
  const z0 = -surface.depth / 2 + inset;
  const z1 = surface.depth / 2 - inset;
  const frameY = -surface.thickness / 2 - ballRadius - 0.014;
  const bottomY = supportBottomY - surface.y + 0.02;
  const legLength = Math.max(0.08, frameY - bottomY);
  const legCenterY = bottomY + legLength / 2;
  const tubeMaterial = { color: frameColor, metalness, roughness };
  const corners: Array<[number, number]> = [[x0, z0], [x0, z1], [x1, z0], [x1, z1]];

  return (
    <group>
      <Tube axis="x" length={Math.max(0.05, x1 - x0)} position={[(x0 + x1) / 2, frameY, z0]} {...tubeMaterial} />
      <Tube axis="x" length={Math.max(0.05, x1 - x0)} position={[(x0 + x1) / 2, frameY, z1]} {...tubeMaterial} />
      <Tube axis="z" length={Math.max(0.05, z1 - z0)} position={[x0, frameY, (z0 + z1) / 2]} {...tubeMaterial} />
      <Tube axis="z" length={Math.max(0.05, z1 - z0)} position={[x1, frameY, (z0 + z1) / 2]} {...tubeMaterial} />

      {corners.map(([x, z]) => (
        <group key={`${x}:${z}`}>
          <Tube axis="y" length={legLength} position={[x, legCenterY, z]} {...tubeMaterial} />
          <FrameBall position={[x, frameY, z]} color={frameColor} metalness={metalness} roughness={roughness} scale={ballRadius / BALL_RADIUS} />
          <mesh position={[x, bottomY - 0.028, z]} castShadow>
            <cylinderGeometry args={[0.075, 0.09, 0.04, 28]} />
            <meshStandardMaterial color={OFFICIAL_BLACK_PLASTIC_COLOR} roughness={0.38} metalness={0.08} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Feet({ layout, feet }: { layout: ReturnType<typeof createLayout>; feet: CabinetConfig["feet"] }) {
  const bottomY = layout.minY - 0.075;
  const isCaster = feet !== "glides";
  const wheelRadius = feet === "caster-high" ? 0.095 : 0.075;
  const bracketHeight = feet === "caster-high" ? 0.08 : 0.055;

  return (
    <group>
      {layout.feet.map((foot) => (
        <group key={foot.key} position={[foot.x, bottomY, foot.z]}>
          {isCaster ? (
            <>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[wheelRadius, wheelRadius, 0.035, 24]} />
                <meshStandardMaterial color={OFFICIAL_BLACK_PLASTIC_COLOR} roughness={0.38} metalness={0.08} />
              </mesh>
              <PanelBox position={[0, 0.045, 0]} args={[0.11, bracketHeight, 0.035]}><meshStandardMaterial color={OFFICIAL_ZINC_COLOR} roughness={0.28} metalness={0.72} /></PanelBox>
            </>
          ) : (
            <mesh castShadow>
              <cylinderGeometry args={[0.08, 0.095, 0.05, 28]} />
              <meshStandardMaterial color={OFFICIAL_BLACK_PLASTIC_COLOR} roughness={0.38} metalness={0.08} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function DimensionLabels({ layout, config }: { layout: ReturnType<typeof createLayout>; config: CabinetConfig }) {
  const dims = getDimensions(config);
  const guides = useMemo(() => buildDimensionGuides(layout, config, dims), [config, dims, layout]);

  return (
    <group renderOrder={30}>
      {guides.map((guide) => (
        <DimensionGuideLine key={guide.key} guide={guide} />
      ))}
    </group>
  );
}

function LabelSprite({ position, label, vertical = false }: { position: [number, number, number]; label: string; vertical?: boolean }) {
  const texture = useMemo(() => createLabelTexture(label, vertical), [label, vertical]);
  useEffect(() => () => texture.dispose(), [texture]);
  const scale: [number, number, number] = vertical ? [0.15, Math.max(0.48, label.length * 0.068), 1] : [Math.max(0.44, label.length * 0.058), 0.15, 1];
  return (
    <sprite position={position} scale={scale} renderOrder={31}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function DimensionGuideLine({ guide }: { guide: DimensionGuide }) {
  const start = useMemo(() => new THREE.Vector3(...guide.start), [guide.start]);
  const end = useMemo(() => new THREE.Vector3(...guide.end), [guide.end]);
  const center = midpoint(guide.start, guide.end, guide.labelOffset);
  const direction = useMemo(() => end.clone().sub(start).normalize(), [end, start]);
  const tickA = useMemo(() => createDimensionTick(guide.start, direction, guide.orientation), [direction, guide.orientation, guide.start]);
  const tickB = useMemo(() => createDimensionTick(guide.end, direction, guide.orientation), [direction, guide.orientation, guide.end]);

  return (
    <group>
      {guide.extensionStart ? <ThinLine start={guide.extensionStart} end={guide.start} color={DIMENSION_EXTENSION_COLOR} opacity={0.5} thin /> : null}
      {guide.extensionEnd ? <ThinLine start={guide.extensionEnd} end={guide.end} color={DIMENSION_EXTENSION_COLOR} opacity={0.5} thin /> : null}
      <ThinLine start={guide.start} end={guide.end} color={DIMENSION_LINE_COLOR} opacity={0.9} />
      <ThinLine start={tickA[0]} end={tickA[1]} color={DIMENSION_LINE_COLOR} opacity={0.92} />
      <ThinLine start={tickB[0]} end={tickB[1]} color={DIMENSION_LINE_COLOR} opacity={0.92} />
      <LabelSprite position={center} label={guide.label} vertical={guide.orientation === "vertical"} />
    </group>
  );
}

function ThinLine({
  start,
  end,
  color,
  opacity = 1,
  thin = false
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  opacity?: number;
  thin?: boolean;
}) {
  const transform = useMemo(() => createLineCylinderTransform(start, end, thin), [end, start, thin]);
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} renderOrder={30}>
      <cylinderGeometry args={[transform.radius, transform.radius, transform.length, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function createLineCylinderTransform(start: [number, number, number], end: [number, number, number], thin = false) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const delta = endVector.clone().sub(startVector);
  const length = Math.max(0.0001, delta.length());
  const direction = delta.normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const position = startVector.add(endVector).multiplyScalar(0.5).toArray() as [number, number, number];
  const radius = thin ? DIMENSION_EXTENSION_RADIUS : DIMENSION_LINE_RADIUS;
  return { position, quaternion, length, radius };
}

function buildDimensionGuides(layout: ReturnType<typeof createLayout>, config: CabinetConfig, dims: ReturnType<typeof getDimensions>): DimensionGuide[] {
  const guides: DimensionGuide[] = [];
  if (!layout.cells.length) return guides;

  const frontZ = layout.frontZ;
  const backZ = layout.backZ;
  const topY = layout.maxY;
  const bottomY = layout.minY;
  const outerWidthHalf = Math.max(layout.maxX - layout.minX, dims.outerWidth * SCALE) / 2;
  const outerDepthHalf = Math.max(frontZ - backZ, dims.outerDepth * SCALE) / 2;
  const outerCenterX = (layout.minX + layout.maxX) / 2;
  const outerCenterZ = (frontZ + backZ) / 2;
  const outerMinX = outerCenterX - outerWidthHalf;
  const outerMaxX = outerCenterX + outerWidthHalf;
  const outerFrontZ = outerCenterZ + outerDepthHalf;
  const outerBackZ = outerCenterZ - outerDepthHalf;
  const feetBottomY = layout.minY - Math.max(0.075, (dims.outerHeight - dims.innerHeight) * SCALE * 0.72);
  const widthLineY = topY + DIMENSION_SIDE_OFFSET;
  const widthLineZ = frontZ + DIMENSION_SIDE_OFFSET * 0.7;
  const heightLineX = layout.minX - DIMENSION_SIDE_OFFSET;
  const heightLineZ = frontZ + DIMENSION_SIDE_OFFSET * 0.58;
  const depthLineX = layout.maxX + DIMENSION_SIDE_OFFSET * 0.88;
  const depthLineY = bottomY - DIMENSION_SIDE_OFFSET * 0.34;
  const outerLineY = bottomY - DIMENSION_SIDE_OFFSET * 0.58;
  const outerLineZ = frontZ + DIMENSION_SIDE_OFFSET * 0.85;
  const outerHeightLineX = outerMinX - DIMENSION_SIDE_OFFSET * 1.2;
  const outerDepthLineX = outerMaxX + DIMENSION_SIDE_OFFSET * 1.18;

  getActiveColumnRanges(config, layout).forEach((range, index) => {
    guides.push({
      key: `column-${index}`,
      start: [range.minX, widthLineY, widthLineZ],
      end: [range.maxX, widthLineY, widthLineZ],
      label: `${range.widthMm} mm`,
      labelOffset: [0, 0.045, 0],
      extensionStart: [range.minX, topY, frontZ],
      extensionEnd: [range.maxX, topY, frontZ]
    });
  });

  getActiveRowRanges(config, layout).forEach((range, index) => {
    guides.push({
      key: `row-${index}`,
      start: [heightLineX, range.minY, heightLineZ],
      end: [heightLineX, range.maxY, heightLineZ],
      label: `${range.heightMm} mm`,
      orientation: "vertical",
      labelOffset: [-0.045, 0, 0],
      extensionStart: [layout.minX, range.minY, frontZ],
      extensionEnd: [layout.minX, range.maxY, frontZ]
    });
  });

  getActiveDepthRanges(config, layout).forEach((range, index) => {
    guides.push({
      key: `depth-${index}`,
      start: [depthLineX, depthLineY, range.frontZ],
      end: [depthLineX, depthLineY, range.backZ],
      label: `${range.depthMm} mm`,
      labelOffset: [0.035, 0, 0],
      extensionStart: [layout.maxX, bottomY, range.frontZ],
      extensionEnd: [layout.maxX, bottomY, range.backZ]
    });
  });

  guides.push(
    {
      key: "outer-width",
      start: [outerMinX, outerLineY, outerLineZ],
      end: [outerMaxX, outerLineY, outerLineZ],
      label: `外部尺寸 ${dims.outerWidth} mm`,
      labelOffset: [0, -0.04, 0],
      extensionStart: [outerMinX, bottomY, frontZ],
      extensionEnd: [outerMaxX, bottomY, frontZ]
    },
    {
      key: "outer-height",
      start: [outerHeightLineX, feetBottomY, heightLineZ],
      end: [outerHeightLineX, topY, heightLineZ],
      label: `外部尺寸 ${dims.outerHeight} mm`,
      orientation: "vertical",
      labelOffset: [-0.04, 0, 0],
      extensionStart: [layout.minX, feetBottomY, frontZ],
      extensionEnd: [layout.minX, topY, frontZ]
    },
    {
      key: "outer-depth",
      start: [outerDepthLineX, depthLineY - 0.11, outerFrontZ],
      end: [outerDepthLineX, depthLineY - 0.11, outerBackZ],
      label: `外部尺寸 ${dims.outerDepth} mm`,
      labelOffset: [0.04, 0, 0],
      extensionStart: [layout.maxX, bottomY, outerFrontZ],
      extensionEnd: [layout.maxX, bottomY, outerBackZ]
    }
  );

  return guides;
}

function getActiveColumnRanges(config: CabinetConfig, layout: ReturnType<typeof createLayout>) {
  const activeColumns = new Set(layout.cells.map((cell) => cell.column));
  const ranges: Array<{ minX: number; maxX: number; widthMm: number }> = [];
  config.columnWidths.forEach((widthMm, column) => {
    if (!activeColumns.has(column)) return;
    const columnCells = layout.cells.filter((cell) => cell.column === column);
    ranges.push({
      minX: Math.min(...columnCells.map((cell) => cell.x - cell.width / 2)),
      maxX: Math.max(...columnCells.map((cell) => cell.x + cell.width / 2)),
      widthMm
    });
  });
  return ranges;
}

function getActiveRowRanges(config: CabinetConfig, layout: ReturnType<typeof createLayout>) {
  const activeRows = new Set(layout.cells.map((cell) => cell.row));
  const ranges: Array<{ minY: number; maxY: number; heightMm: number }> = [];
  config.rowHeights.forEach((heightMm, row) => {
    if (!activeRows.has(row)) return;
    const rowCells = layout.cells.filter((cell) => cell.row === row);
    ranges.push({
      minY: Math.min(...rowCells.map((cell) => cell.y - cell.height / 2)),
      maxY: Math.max(...rowCells.map((cell) => cell.y + cell.height / 2)),
      heightMm
    });
  });
  return ranges;
}

function getActiveDepthRanges(config: CabinetConfig, layout: ReturnType<typeof createLayout>) {
  const activeDepths = new Set(layout.cells.map((cell) => cell.depthIndex));
  const depthSegments = getDepthSegments(config);
  const ranges: Array<{ frontZ: number; backZ: number; depthMm: number }> = [];
  depthSegments.forEach((depthMm, depthIndex) => {
    if (!activeDepths.has(depthIndex)) return;
    const depthCells = layout.cells.filter((cell) => cell.depthIndex === depthIndex);
    ranges.push({
      frontZ: Math.max(...depthCells.map((cell) => cell.z + cell.depth / 2)),
      backZ: Math.min(...depthCells.map((cell) => cell.z - cell.depth / 2)),
      depthMm
    });
  });
  return ranges;
}

function midpoint(start: [number, number, number], end: [number, number, number], offset: [number, number, number] = [0, 0, 0]): [number, number, number] {
  return [
    (start[0] + end[0]) / 2 + offset[0],
    (start[1] + end[1]) / 2 + offset[1],
    (start[2] + end[2]) / 2 + offset[2]
  ];
}

function createDimensionTick(
  position: [number, number, number],
  direction: THREE.Vector3,
  orientation: DimensionOrientation = "horizontal"
): [[number, number, number], [number, number, number]] {
  const up = orientation === "vertical" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const perpendicular = up.cross(direction).normalize().multiplyScalar(DIMENSION_TICK);
  if (perpendicular.lengthSq() === 0) perpendicular.set(DIMENSION_TICK, 0, 0);
  const center = new THREE.Vector3(...position);
  const a = center.clone().sub(perpendicular);
  const b = center.clone().add(perpendicular);
  return [a.toArray() as [number, number, number], b.toArray() as [number, number, number]];
}

function FrameBall({ position, color, metalness, roughness, scale = 1 }: { position: [number, number, number]; color: string; metalness: number; roughness: number; scale?: number }) {
  const assets = useFrameAssets();
  const scaledAsset = useMemo(() => {
    if (!assets) return null;
    const clone = cloneFrameAsset(assets.ball, color, metalness, roughness);
    clone.position.set(...position);
    clone.scale.setScalar(scale);
    return clone;
  }, [assets, color, metalness, position[0], position[1], position[2], roughness, scale]);

  useEffect(() => () => disposeClonedAsset(scaledAsset), [scaledAsset]);

  if (scaledAsset) {
    return <primitive object={scaledAsset} />;
  }

  return (
    <mesh position={position} castShadow receiveShadow>
      <sphereGeometry args={[BALL_RADIUS * scale, 32, 20]} />
      <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} clearcoat={0.85} reflectivity={0.82} />
    </mesh>
  );
}

function Tube({ axis, length, position, color, metalness, roughness }: { axis: "x" | "y" | "z"; length: number; position: [number, number, number]; color: string; metalness: number; roughness: number }) {
  const rotation: [number, number, number] = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  const assets = useFrameAssets();
  const scaledAsset = useMemo(() => {
    if (!assets) return null;
    const useLongTube = length > (FRAME_TUBE_350_TEMPLATE_LENGTH + FRAME_TUBE_750_TEMPLATE_LENGTH) / 2;
    const template = useLongTube ? assets.tube750 : assets.tube350;
    const templateLength = useLongTube ? FRAME_TUBE_750_TEMPLATE_LENGTH : FRAME_TUBE_350_TEMPLATE_LENGTH;
    const clone = cloneFrameAsset(template, color, metalness, roughness);
    clone.position.set(...position);
    clone.rotation.set(...rotation);
    clone.scale.set(1, length / templateLength, 1);
    return clone;
  }, [assets, color, length, metalness, position[0], position[1], position[2], roughness, rotation[0], rotation[1], rotation[2]]);

  useEffect(() => () => disposeClonedAsset(scaledAsset), [scaledAsset]);

  if (scaledAsset) {
    return <primitive object={scaledAsset} />;
  }

  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[TUBE_RADIUS, TUBE_RADIUS, length, 28]} />
      <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} clearcoat={0.85} reflectivity={0.82} />
    </mesh>
  );
}

function useFrameAssets() {
  const [asset, setAsset] = useState<FrameAssets | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadFrameAssets()
      .then((group) => {
        if (!alive) return;
        if (group) setAsset(group);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return failed ? null : asset;
}

function loadFrameAssets() {
  if (!frameAssetsPromise) {
    frameAssetsPromise = new Promise((resolve) => {
      const loader = new GLTFLoader();
      const loadOne = (url: string) =>
        new Promise<THREE.Group | null>((itemResolve) => {
          loader.load(
            url,
            (gltf: GLTF) => itemResolve(gltf.scene),
            undefined,
            () => itemResolve(null)
          );
        });

      Promise.all([loadOne(FRAME_TUBE_350_ASSET_URL), loadOne(FRAME_TUBE_750_ASSET_URL), loadOne(FRAME_BALL_ASSET_URL)])
        .then(([tube350, tube750, ball]) => {
          if (!tube350 || !tube750 || !ball) {
            resolve(null);
            return;
          }
          resolve({ tube350, tube750, ball });
        })
        .catch(() => resolve(null));
    });
  }
  return frameAssetsPromise;
}

function cloneFrameAsset(asset: THREE.Group, color: string, metalness: number, roughness: number) {
  const clone = asset.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = new THREE.MeshPhysicalMaterial({
      color,
      metalness,
      roughness,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      reflectivity: 0.82,
      side: THREE.DoubleSide
    });
  });
  return clone;
}

function PanelBox({
  position,
  args,
  children,
  receiveShadow = false
}: {
  position: [number, number, number];
  args: [number, number, number];
  children: ReactNode;
  receiveShadow?: boolean;
}) {
  return (
    <mesh position={position} castShadow receiveShadow={receiveShadow}>
      <boxGeometry args={args} />
      {children}
    </mesh>
  );
}

function Ground() {
  return (
    <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[12, 12]} />
      <meshStandardMaterial color="#dde4e8" roughness={0.74} metalness={0.02} />
    </mesh>
  );
}

function getHorizontalFrameKey(rowIndex: number, yIndex: number, zIndex: number): StructureFrameKey {
  const top = yIndex === rowIndex + 1;
  const front = zIndex === 1;
  if (top && front) return "topFrontBeam";
  if (top) return "topBackBeam";
  if (front) return "bottomFrontBeam";
  return "bottomBackBeam";
}

function getDepthFrameKey(columnIndex: number, rowIndex: number, xIndex: number, yIndex: number): StructureFrameKey {
  const top = yIndex === rowIndex + 1;
  const right = xIndex === columnIndex + 1;
  if (top && right) return "topRightBeam";
  if (top) return "topLeftBeam";
  if (right) return "bottomRightBeam";
  return "bottomLeftBeam";
}

function getVerticalFrameKey(columnIndex: number, xIndex: number, zIndex: number): StructureFrameKey {
  const right = xIndex === columnIndex + 1;
  const front = zIndex === 1;
  if (front && right) return "frontRightPost";
  if (front) return "frontLeftPost";
  if (right) return "backRightPost";
  return "backLeftPost";
}

function getStructureVertexKey(columnIndex: number, rowIndex: number, xIndex: number, yIndex: number, zIndex: number): StructureVertexKey {
  const right = xIndex === columnIndex + 1;
  const top = yIndex === rowIndex + 1;
  const front = zIndex === 1;

  if (top && front && right) return "rightFrontTop";
  if (top && front) return "leftFrontTop";
  if (top && right) return "rightBackTop";
  if (top) return "leftBackTop";
  if (front && right) return "rightFrontBottom";
  if (front) return "leftFrontBottom";
  if (right) return "rightBackBottom";
  return "leftBackBottom";
}

function createLayout(config: CabinetConfig) {
  const scaledWidths = config.columnWidths.map((width) => width * SCALE);
  const scaledHeights = config.rowHeights.map((height) => height * SCALE);
  const scaledDepths = getDepthSegments(config).map((depth) => depth * SCALE);
  const totalWidth = scaledWidths.reduce((total, width) => total + width, 0);
  const totalHeight = scaledHeights.reduce((total, height) => total + height, 0);
  const totalDepth = scaledDepths.reduce((total, depth) => total + depth, 0);
  const xBounds = [-totalWidth / 2];
  const yBounds = [0];
  const zBounds = [totalDepth / 2];

  scaledWidths.forEach((width) => xBounds.push(xBounds[xBounds.length - 1] + width));
  scaledHeights.forEach((height) => yBounds.push(yBounds[yBounds.length - 1] + height));
  scaledDepths.forEach((depth) => zBounds.push(zBounds[zBounds.length - 1] - depth));

  const cells: LayoutCell[] = [];
  const points = new Map<string, { key: string; position: [number, number, number] }>();
  const feet = new Map<string, { key: string; x: number; z: number }>();
  const xSegments = new Map<string, Segment>();
  const ySegments = new Map<string, Segment>();
  const zSegments = new Map<string, Segment>();

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let cellBackZ = Number.POSITIVE_INFINITY;
  let cellFrontZ = Number.NEGATIVE_INFINITY;

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow, depthIndex) => {
      depthRow.forEach((cfg, columnIndex) => {
        if (!cfg.enabled) return;
        const x0 = xBounds[columnIndex];
        const x1 = xBounds[columnIndex + 1];
        const y0 = yBounds[rowIndex];
        const y1 = yBounds[rowIndex + 1];
        const frontZ = zBounds[depthIndex] ?? totalDepth / 2;
        const backZ = zBounds[depthIndex + 1] ?? -totalDepth / 2;
        const width = x1 - x0;
        const height = y1 - y0;
        const depth = Math.max(0.04, frontZ - backZ);
        const z = (frontZ + backZ) / 2;
        const frontGrid = depthIndex;
        const backGrid = depthIndex + 1;
        minX = Math.min(minX, x0);
        maxX = Math.max(maxX, x1);
        minY = Math.min(minY, y0);
        maxY = Math.max(maxY, y1);
        cellBackZ = Math.min(cellBackZ, backZ);
        cellFrontZ = Math.max(cellFrontZ, frontZ);

        cells.push({ row: rowIndex, column: columnIndex, depthIndex, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, width, height, depth });

        [columnIndex, columnIndex + 1].forEach((xIndex) => {
          [rowIndex, rowIndex + 1].forEach((yIndex) => {
            [[0, backGrid, backZ], [1, frontGrid, frontZ]].forEach(([localZ, zIndex, zValue]) => {
              const vertexKey = getStructureVertexKey(columnIndex, rowIndex, xIndex, yIndex, localZ);
              if (getEffectiveStructureVertexVisible(cfg, vertexKey)) {
                const key = `${xIndex}:${yIndex}:${zIndex}`;
                points.set(key, { key, position: [xBounds[xIndex], yBounds[yIndex], zValue] });
              }
            });
            const frameKey = getDepthFrameKey(columnIndex, rowIndex, xIndex, yIndex);
            if (getEffectiveStructureFrameVisible(cfg, frameKey)) {
              const zKey = `${xIndex}:${yIndex}:${depthIndex}`;
              zSegments.set(zKey, { key: zKey, length: depth, position: [xBounds[xIndex], yBounds[yIndex], z] });
            }
          });
        });

        [rowIndex, rowIndex + 1].forEach((yIndex) => {
          [[0, backGrid, backZ], [1, frontGrid, frontZ]].forEach(([localZ, zIndex, zValue]) => {
            const frameKey = getHorizontalFrameKey(rowIndex, yIndex, localZ);
            if (getEffectiveStructureFrameVisible(cfg, frameKey)) {
              const key = `${columnIndex}:${yIndex}:${zIndex}`;
              xSegments.set(key, { key, length: width, position: [(x0 + x1) / 2, yBounds[yIndex], zValue] });
            }
          });
        });

        [columnIndex, columnIndex + 1].forEach((xIndex) => {
          [[0, backGrid, backZ], [1, frontGrid, frontZ]].forEach(([localZ, zIndex, zValue]) => {
            const frameKey = getVerticalFrameKey(columnIndex, xIndex, localZ);
            if (getEffectiveStructureFrameVisible(cfg, frameKey)) {
              const key = `${xIndex}:${rowIndex}:${zIndex}`;
              ySegments.set(key, { key, length: height, position: [xBounds[xIndex], (y0 + y1) / 2, zValue] });
            }
          });
        });

        if (rowIndex === 0) {
          [columnIndex, columnIndex + 1].forEach((xIndex) => [[backGrid, backZ], [frontGrid, frontZ]].forEach(([zIndex, zValue]) => {
            const key = `${xIndex}:${zIndex}`;
            feet.set(key, { key, x: xBounds[xIndex], z: zValue });
          }));
        }
      });
    });
  });

  if (!Number.isFinite(minX)) {
    minX = xBounds[0];
    maxX = xBounds[xBounds.length - 1];
    minY = yBounds[0];
    maxY = yBounds[yBounds.length - 1];
    const defaultDepth = Math.max(totalDepth, config.depth * SCALE);
    cellBackZ = -defaultDepth / 2;
    cellFrontZ = defaultDepth / 2;
  }

  const workSurfaces: LayoutWorkSurface[] = [];
  let visualMinX = minX;
  let visualMaxX = maxX;
  let visualMinY = minY;
  let visualMaxY = maxY;
  let visualBackZ = cellBackZ;
  let visualFrontZ = cellFrontZ;

  config.workSurfaces.forEach((surface) => {
    if (!surface.enabled) return;
    const x0 = (xBounds[surface.fromColumn] ?? xBounds[0]) - surface.overhangLeft * SCALE;
    const x1 = (xBounds[surface.toColumn + 1] ?? xBounds[xBounds.length - 1]) + surface.overhangRight * SCALE;
    const surfaceDepth = surface.depth * SCALE;
    const backZ = -surfaceDepth / 2 - surface.overhangBack * SCALE;
    const frontZ = surfaceDepth / 2 + surface.overhangFront * SCALE;
    const nominalY = yBounds[surface.row + 1] ?? yBounds[yBounds.length - 1];
    const coveredTopY = surface.kind === "deskTop" ? getCoveredSurfaceTopY(config, surface, yBounds) : nominalY;
    const y0 = Math.max(nominalY, coveredTopY) + (surface.kind === "deskTop" ? DESK_TOP_CLEARANCE : 0);
    const thickness = surface.thickness * SCALE;
    const y1 = y0 + thickness;

    workSurfaces.push({
      id: surface.id,
      kind: surface.kind,
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      z: (backZ + frontZ) / 2,
      width: Math.max(0.04, x1 - x0),
      depth: Math.max(0.04, frontZ - backZ),
      thickness: Math.max(0.01, thickness),
      color: surface.color
    });

    visualMinX = Math.min(visualMinX, x0);
    visualMaxX = Math.max(visualMaxX, x1);
    visualMinY = Math.min(visualMinY, y0);
    visualMaxY = Math.max(visualMaxY, y1);
    visualBackZ = Math.min(visualBackZ, backZ);
    visualFrontZ = Math.max(visualFrontZ, frontZ);
  });

  return {
    cells,
    workSurfaces,
    points: [...points.values()],
    feet: [...feet.values()],
    xSegments: [...xSegments.values()],
    ySegments: [...ySegments.values()],
    zSegments: [...zSegments.values()],
    minX,
    maxX,
    minY,
    maxY,
    backZ: cellBackZ,
    frontZ: cellFrontZ,
    visualMinX,
    visualMaxX,
    visualMinY,
    visualMaxY,
    visualBackZ,
    visualFrontZ,
    totalWidth: Math.max(0.1, visualMaxX - visualMinX),
    totalHeight: Math.max(0.1, visualMaxY - visualMinY),
    depth: Math.max(0.1, visualFrontZ - visualBackZ),
    centerX: (visualMinX + visualMaxX) / 2,
    centerY: (visualMinY + visualMaxY) / 2,
    centerZ: (visualBackZ + visualFrontZ) / 2
  };
}

function getCoveredSurfaceTopY(config: CabinetConfig, surface: WorkSurfaceConfig, yBounds: number[]) {
  let topY = yBounds[surface.row + 1] ?? yBounds[yBounds.length - 1];

  getPlanCells(config).forEach((row, rowIndex) => {
    row.forEach((depthRow) => {
      depthRow.forEach((cell, columnIndex) => {
        if (!cell.enabled || columnIndex < surface.fromColumn || columnIndex > surface.toColumn) return;
        topY = Math.max(topY, yBounds[rowIndex + 1] ?? topY);
      });
    });
  });

  return topY;
}

function getSceneMetrics(config: CabinetConfig) {
  const layout = createLayout(config);
  const dimensionPadding = config.showDimensions ? DIMENSION_SIDE_OFFSET * 2.7 : 0;
  const dimensionHeightPadding = config.showDimensions ? DIMENSION_SIDE_OFFSET * 1.7 : 0;
  return {
    totalWidth: layout.totalWidth + dimensionPadding,
    totalHeight: layout.totalHeight + dimensionHeightPadding,
    depth: layout.depth + dimensionPadding,
    centerX: layout.centerX,
    centerY: layout.centerY,
    centerZ: layout.centerZ
  };
}

function createLabelTexture(label: string, vertical: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 160 : 640;
  canvas.height = vertical ? 640 : 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = DIMENSION_LABEL_COLOR;
  ctx.font = "600 48px Arial, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (vertical) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0, canvas.height - 36);
  } else {
    ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 36);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
