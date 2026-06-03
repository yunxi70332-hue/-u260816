import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { CabinetConfig, Selection } from "./model";
import { getDimensions, getEffectiveCellColor } from "./model";

interface SceneApi {
  capturePng: () => string;
}

interface BuilderSceneProps {
  config: CabinetConfig;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onReady: (api: SceneApi) => void;
}

interface LayoutCell {
  row: number;
  column: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

const SCALE = 0.004;
const TUBE_RADIUS = 0.025;
const BALL_RADIUS = 0.062;
const PANEL_THICKNESS = 0.035;

export function BuilderScene({ config, selection, onSelect, onReady }: BuilderSceneProps) {
  const metrics = getSceneMetrics(config);

  return (
    <Canvas
      className="scene-canvas"
      shadows
      camera={{ position: [3.8, 2.6, 4.3], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#edf1f3"]} />
      <fog attach="fog" args={["#edf1f3", 24, 64]} />
      <Suspense fallback={null}>
        <SceneReady onReady={onReady} />
        <CameraRig metrics={metrics} />
        <ambientLight intensity={0.78} />
        <directionalLight position={[3, 6, 5]} intensity={1.15} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <directionalLight position={[-4, 3, -2]} intensity={0.38} />
        <CabinetModel config={config} selection={selection} onSelect={onSelect} />
        <Ground />
        <ContactShadows opacity={0.28} scale={10} blur={2.6} far={4.8} resolution={512} color="#5b6670" />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={2.3}
          maxDistance={60}
          target={[0, metrics.totalHeight * 0.52, 0]}
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
    const target = new THREE.Vector3(0, metrics.totalHeight * 0.52, 0);
    const narrow = size.width < 560;
    const wideCabinet = metrics.totalWidth > 4.2;
    const widthFactor = narrow ? (wideCabinet ? 2.2 : 1.75) : wideCabinet ? 2.35 : 1.38;
    const distance = Math.max(
      4.4,
      (metrics.totalWidth * widthFactor) / aspect,
      metrics.totalHeight * 2.2,
      metrics.depth * 4
    );
    const direction = new THREE.Vector3(
      wideCabinet ? 0.34 : narrow ? 0.38 : 0.64,
      0.42,
      wideCabinet || narrow ? 0.82 : 0.72
    ).normalize();
    camera.position.copy(target.clone().add(direction.multiplyScalar(distance)));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, metrics.depth, metrics.totalHeight, metrics.totalWidth, size.height, size.width]);

  return null;
}

function CabinetModel({
  config,
  selection,
  onSelect
}: {
  config: CabinetConfig;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const layout = useMemo(() => createLayout(config), [config]);
  const frameColor = config.frameFinish === "chrome" ? "#d7dce2" : "#2b2f32";
  const metalness = config.frameFinish === "chrome" ? 1 : 0.65;
  const roughness = config.frameFinish === "chrome" ? 0.18 : 0.34;

  return (
    <group position={[0, 0.05, 0]}>
      <group>
        {layout.xBounds.map((x, xIndex) =>
          layout.yBounds.map((y, yIndex) =>
            layout.zBounds.map((z, zIndex) => (
              <mesh key={`ball-${xIndex}-${yIndex}-${zIndex}`} position={[x, y, z]} castShadow receiveShadow>
                <sphereGeometry args={[BALL_RADIUS, 32, 20]} />
                <meshPhysicalMaterial color={frameColor} metalness={metalness} roughness={roughness} clearcoat={0.6} />
              </mesh>
            ))
          )
        )}

        {layout.xSegments.map((segment) => (
          <Tube key={`x-${segment.key}`} axis="x" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
        ))}
        {layout.ySegments.map((segment) => (
          <Tube key={`y-${segment.key}`} axis="y" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
        ))}
        {layout.zSegments.map((segment) => (
          <Tube key={`z-${segment.key}`} axis="z" length={segment.length} position={segment.position} color={frameColor} metalness={metalness} roughness={roughness} />
        ))}
      </group>

      {layout.cells.map((cell) => (
        <CellContent
          key={`cell-${cell.row}-${cell.column}`}
          cell={cell}
          kind={config.structureMode === "noPanels" || config.structureMode === "frameOnly" ? "open" : config.cells[cell.row][cell.column].kind}
          color={getEffectiveCellColor(config, cell.row, cell.column)}
          structureMode={config.structureMode}
          selected={selection.row === cell.row && selection.column === cell.column}
          onSelect={() => onSelect({ row: cell.row, column: cell.column })}
        />
      ))}

      <Feet layout={layout} feet={config.feet} />
      {config.showDimensions ? <DimensionLabels layout={layout} config={config} /> : null}
    </group>
  );
}

function CellContent({
  cell,
  kind,
  color,
  structureMode,
  selected,
  onSelect
}: {
  cell: LayoutCell;
  kind: string;
  color: string;
  structureMode: CabinetConfig["structureMode"];
  selected: boolean;
  onSelect: () => void;
}) {
  const frontZ = cell.z + cell.depth / 2 + PANEL_THICKNESS / 2;
  const backZ = cell.z - cell.depth / 2 - PANEL_THICKNESS / 2;
  const innerDepth = Math.max(0.05, cell.depth - 0.16);
  const panelMaterial = (
    <meshStandardMaterial color={color} roughness={0.44} metalness={0.06} side={THREE.DoubleSide} />
  );

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {structureMode !== "frameOnly" && structureMode !== "noPanels" && kind !== "open" && kind !== "glass" ? (
        <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.08, cell.height - 0.08, PANEL_THICKNESS]}>
          {panelMaterial}
        </PanelBox>
      ) : null}

      {structureMode !== "frameOnly" && kind === "open" ? (
        <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>
          <meshStandardMaterial color="#f7f7f2" roughness={0.6} metalness={0.02} opacity={0.68} transparent />
        </PanelBox>
      ) : null}

      {structureMode !== "frameOnly" && kind === "back" ? (
        <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>
          {panelMaterial}
        </PanelBox>
      ) : null}

      {structureMode !== "frameOnly" && structureMode !== "noFront" && kind === "drop" ? (
        <Door position={[cell.x, cell.y, frontZ]} width={cell.width - 0.09} height={cell.height - 0.09} color={color} />
      ) : null}

      {structureMode !== "frameOnly" && structureMode !== "noFront" && kind === "drawer" ? (
        <Drawers position={[cell.x, cell.y, frontZ]} width={cell.width - 0.09} height={cell.height - 0.09} color={color} />
      ) : null}

      {structureMode !== "frameOnly" && structureMode !== "noFront" && kind === "glass" ? (
        <>
          <PanelBox position={[cell.x, cell.y, frontZ]} args={[cell.width - 0.09, cell.height - 0.09, PANEL_THICKNESS]}>
            <meshPhysicalMaterial color="#d9eef6" metalness={0.02} roughness={0.04} transmission={0.55} opacity={0.34} transparent />
          </PanelBox>
          <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.1, cell.height - 0.1, PANEL_THICKNESS]}>
            <meshPhysicalMaterial color="#eef8fb" metalness={0} roughness={0.1} opacity={0.22} transparent />
          </PanelBox>
        </>
      ) : null}

      {structureMode !== "frameOnly" && kind === "tray" ? (
        <>
          <PanelBox position={[cell.x, cell.y - cell.height * 0.15, cell.z]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}>
            {panelMaterial}
          </PanelBox>
          <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}>
            {panelMaterial}
          </PanelBox>
        </>
      ) : null}

      <mesh position={[cell.x, cell.y, cell.z]} renderOrder={5}>
        <boxGeometry args={[cell.width, cell.height, cell.depth]} />
        <meshBasicMaterial transparent opacity={0.01} color="#ffe500" depthWrite={false} />
      </mesh>
      {selected ? (
        <>
          <SelectionFrame cell={cell} />
          <ExpandHints cell={cell} />
        </>
      ) : null}
    </group>
  );
}

function Door({ position, width, height, color }: { position: [number, number, number]; width: number; height: number; color: string }) {
  return (
    <group position={position}>
      <PanelBox position={[0, 0, 0]} args={[width, height, PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </PanelBox>
      <PanelBox position={[0, height / 2 - 0.05, PANEL_THICKNESS / 2 + 0.012]} args={[width - 0.16, 0.016, 0.012]}>
        <meshStandardMaterial color="#6d7175" roughness={0.35} metalness={0.7} />
      </PanelBox>
      <PanelBox position={[width / 2 - 0.1, -height / 2 + 0.1, PANEL_THICKNESS / 2 + 0.015]} args={[0.06, 0.06, 0.014]}>
        <meshStandardMaterial color="#ffdf1f" roughness={0.28} metalness={0.12} />
      </PanelBox>
    </group>
  );
}

function Drawers({ position, width, height, color }: { position: [number, number, number]; width: number; height: number; color: string }) {
  const drawerHeight = height / 3;
  return (
    <group position={position}>
      {[0, 1, 2].map((index) => (
        <group key={index} position={[0, height / 2 - drawerHeight * (index + 0.5), 0]}>
          <PanelBox position={[0, 0, 0]} args={[width, drawerHeight - 0.025, PANEL_THICKNESS]}>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
          </PanelBox>
          <PanelBox position={[0, drawerHeight * 0.23, PANEL_THICKNESS / 2 + 0.012]} args={[width * 0.45, 0.014, 0.012]}>
            <meshStandardMaterial color="#5a5f63" roughness={0.32} metalness={0.75} />
          </PanelBox>
        </group>
      ))}
    </group>
  );
}

function SelectionFrame({ cell }: { cell: LayoutCell }) {
  const z = cell.z + cell.depth / 2 + 0.055;
  const thickness = 0.022;
  const color = "#ffe100";
  return (
    <group>
      <PanelBox position={[cell.x, cell.y + cell.height / 2, z]} args={[cell.width + 0.04, thickness, thickness]}>
        <meshBasicMaterial color={color} />
      </PanelBox>
      <PanelBox position={[cell.x, cell.y - cell.height / 2, z]} args={[cell.width + 0.04, thickness, thickness]}>
        <meshBasicMaterial color={color} />
      </PanelBox>
      <PanelBox position={[cell.x - cell.width / 2, cell.y, z]} args={[thickness, cell.height + 0.04, thickness]}>
        <meshBasicMaterial color={color} />
      </PanelBox>
      <PanelBox position={[cell.x + cell.width / 2, cell.y, z]} args={[thickness, cell.height + 0.04, thickness]}>
        <meshBasicMaterial color={color} />
      </PanelBox>
    </group>
  );
}

function ExpandHints({ cell }: { cell: LayoutCell }) {
  const z = cell.z + cell.depth / 2 + 0.12;
  const positions: Array<[number, number, number]> = [
    [cell.x - cell.width / 2 - 0.16, cell.y, z],
    [cell.x + cell.width / 2 + 0.16, cell.y, z],
    [cell.x, cell.y + cell.height / 2 + 0.16, z],
    [cell.x, cell.y, cell.z + cell.depth / 2 + 0.32]
  ];

  return (
    <group>
      {positions.map((position, index) => (
        <group key={index} position={position}>
          <mesh>
            <circleGeometry args={[0.09, 28]} />
            <meshBasicMaterial color="#111111" transparent opacity={0.82} depthTest={false} />
          </mesh>
          <PlusMark />
        </group>
      ))}
    </group>
  );
}

function PlusMark() {
  return (
    <group position={[0, 0, 0.012]}>
      <PanelBox position={[0, 0, 0]} args={[0.1, 0.014, 0.01]}>
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </PanelBox>
      <PanelBox position={[0, 0, 0]} args={[0.014, 0.1, 0.01]}>
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </PanelBox>
    </group>
  );
}

function Feet({ layout, feet }: { layout: ReturnType<typeof createLayout>; feet: CabinetConfig["feet"] }) {
  const bottomY = layout.yBounds[0] - 0.075;
  const isCaster = feet !== "glides";
  const wheelRadius = feet === "caster-high" ? 0.095 : 0.075;
  const bracketHeight = feet === "caster-high" ? 0.08 : 0.055;
  return (
    <group>
      {layout.xBounds.map((x, xIndex) =>
        layout.zBounds.map((z, zIndex) => (
          <group key={`foot-${xIndex}-${zIndex}`} position={[x, bottomY, z]}>
            {isCaster ? (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[wheelRadius, wheelRadius, 0.035, 24]} />
                  <meshStandardMaterial color="#1f2224" roughness={0.38} metalness={0.2} />
                </mesh>
                <PanelBox position={[0, 0.045, 0]} args={[0.11, bracketHeight, 0.035]}>
                  <meshStandardMaterial color="#303438" roughness={0.36} metalness={0.5} />
                </PanelBox>
              </>
            ) : (
              <mesh castShadow>
                <cylinderGeometry args={[0.08, 0.095, 0.05, 28]} />
                <meshStandardMaterial color="#1f2224" roughness={0.42} metalness={0.25} />
              </mesh>
            )}
          </group>
        ))
      )}
    </group>
  );
}

function DimensionLabels({ layout, config }: { layout: ReturnType<typeof createLayout>; config: CabinetConfig }) {
  const dims = getDimensions(config);
  const topY = layout.yBounds[layout.yBounds.length - 1] + 0.2;
  const frontZ = layout.zBounds[1] + 0.18;
  const rightX = layout.xBounds[layout.xBounds.length - 1] + 0.18;
  const bottomY = layout.yBounds[0] - 0.02;

  return (
    <group>
      <DimensionLine start={[layout.xBounds[0], topY, frontZ]} end={[layout.xBounds[layout.xBounds.length - 1], topY, frontZ]} label={`${dims.innerWidth} mm`} />
      <DimensionLine start={[rightX, bottomY, frontZ]} end={[rightX, layout.yBounds[layout.yBounds.length - 1], frontZ]} label={`${dims.innerHeight} mm`} vertical />
      <DimensionLine start={[layout.xBounds[0] - 0.16, bottomY, layout.zBounds[0]]} end={[layout.xBounds[0] - 0.16, bottomY, layout.zBounds[1]]} label={`${dims.innerDepth} mm`} />
      <LabelSprite position={[0, -0.24, frontZ + 0.24]} label={`外部尺寸 ${dims.outerWidth} x ${dims.outerHeight} x ${dims.outerDepth} mm`} />
    </group>
  );
}

function DimensionLine({
  start,
  end,
  label,
  vertical = false
}: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  vertical?: boolean;
}) {
  const points = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [end, start]);
  const center: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2
  ];
  return (
    <group>
      <line>
        <bufferGeometry setFromPoints={points} />
        <lineBasicMaterial color="#65717b" />
      </line>
      <LabelSprite position={center} label={label} vertical={vertical} />
    </group>
  );
}

function LabelSprite({
  position,
  label,
  vertical = false
}: {
  position: [number, number, number];
  label: string;
  vertical?: boolean;
}) {
  const texture = useMemo(() => createLabelTexture(label, vertical), [label, vertical]);

  useEffect(() => {
    return () => texture.dispose();
  }, [texture]);

  const scale: [number, number, number] = vertical
    ? [0.18, Math.max(0.52, label.length * 0.09), 1]
    : [Math.max(0.48, label.length * 0.085), 0.18, 1];

  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function Tube({
  axis,
  length,
  position,
  color,
  metalness,
  roughness
}: {
  axis: "x" | "y" | "z";
  length: number;
  position: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
}) {
  const rotation: [number, number, number] =
    axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];

  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[TUBE_RADIUS, TUBE_RADIUS, length, 28]} />
      <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} clearcoat={0.5} />
    </mesh>
  );
}

function PanelBox({
  position,
  args,
  children
}: {
  position: [number, number, number];
  args: [number, number, number];
  children: React.ReactNode;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
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

function createLabelTexture(label: string, vertical: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 160 : 640;
  canvas.height = vertical ? 640 : 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(237, 241, 243, 0.78)";
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 18);
  ctx.fill();
  ctx.fillStyle = "#3f4850";
  ctx.font = "700 48px Arial, Microsoft YaHei, sans-serif";
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

function createLayout(config: CabinetConfig) {
  const scaledWidths = config.columnWidths.map((width) => width * SCALE);
  const scaledHeights = config.rowHeights.map((height) => height * SCALE);
  const depth = config.depth * SCALE;
  const totalWidth = scaledWidths.reduce((total, width) => total + width, 0);
  const totalHeight = scaledHeights.reduce((total, height) => total + height, 0);
  const xBounds = [-totalWidth / 2];
  const yBounds = [0];
  const zBounds = [-depth / 2, depth / 2];

  scaledWidths.forEach((width) => xBounds.push(xBounds[xBounds.length - 1] + width));
  scaledHeights.forEach((height) => yBounds.push(yBounds[yBounds.length - 1] + height));

  const cells: LayoutCell[] = [];
  for (let row = 0; row < scaledHeights.length; row += 1) {
    for (let column = 0; column < scaledWidths.length; column += 1) {
      const x0 = xBounds[column];
      const x1 = xBounds[column + 1];
      const y0 = yBounds[row];
      const y1 = yBounds[row + 1];
      cells.push({
        row,
        column,
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        z: 0,
        width: x1 - x0,
        height: y1 - y0,
        depth
      });
    }
  }

  const xSegments = [];
  const ySegments = [];
  const zSegments = [];

  for (let rowBoundary = 0; rowBoundary < yBounds.length; rowBoundary += 1) {
    for (let zIndex = 0; zIndex < zBounds.length; zIndex += 1) {
      for (let column = 0; column < scaledWidths.length; column += 1) {
        xSegments.push({
          key: `${rowBoundary}-${zIndex}-${column}`,
          length: scaledWidths[column],
          position: [(xBounds[column] + xBounds[column + 1]) / 2, yBounds[rowBoundary], zBounds[zIndex]] as [number, number, number]
        });
      }
    }
  }

  for (let columnBoundary = 0; columnBoundary < xBounds.length; columnBoundary += 1) {
    for (let zIndex = 0; zIndex < zBounds.length; zIndex += 1) {
      for (let row = 0; row < scaledHeights.length; row += 1) {
        ySegments.push({
          key: `${columnBoundary}-${zIndex}-${row}`,
          length: scaledHeights[row],
          position: [xBounds[columnBoundary], (yBounds[row] + yBounds[row + 1]) / 2, zBounds[zIndex]] as [number, number, number]
        });
      }
    }
  }

  for (let columnBoundary = 0; columnBoundary < xBounds.length; columnBoundary += 1) {
    for (let rowBoundary = 0; rowBoundary < yBounds.length; rowBoundary += 1) {
      zSegments.push({
        key: `${columnBoundary}-${rowBoundary}`,
        length: depth,
        position: [xBounds[columnBoundary], yBounds[rowBoundary], 0] as [number, number, number]
      });
    }
  }

  return { xBounds, yBounds, zBounds, cells, xSegments, ySegments, zSegments, totalWidth, totalHeight, depth };
}

function getSceneMetrics(config: CabinetConfig) {
  return {
    totalWidth: config.columnWidths.reduce((total, width) => total + width * SCALE, 0),
    totalHeight: config.rowHeights.reduce((total, height) => total + height * SCALE, 0),
    depth: config.depth * SCALE
  };
}
