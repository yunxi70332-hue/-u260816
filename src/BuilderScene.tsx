import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { AccessoryModelKind } from "./accessoryCatalog";
import type { CabinetConfig, CellKind, DoorOpenState, Selection } from "./model";
import { getDimensions, getEffectiveCellColor } from "./model";

interface SceneApi {
  capturePng: () => string;
}

interface BuilderSceneProps {
  config: CabinetConfig;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
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

interface Segment {
  key: string;
  length: number;
  position: [number, number, number];
}

const SCALE = 0.004;
const TUBE_RADIUS = 0.025;
const BALL_RADIUS = 0.062;
const PANEL_THICKNESS = 0.035;

export function BuilderScene({ config, selection, onSelect, onExpand, onReady }: BuilderSceneProps) {
  const metrics = getSceneMetrics(config);

  return (
    <Canvas
      className="scene-canvas"
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
        <ambientLight intensity={0.76} />
        <directionalLight position={[3, 6, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <directionalLight position={[-4, 3, -2]} intensity={0.36} />
        <CabinetModel config={config} selection={selection} onSelect={onSelect} onExpand={onExpand} />
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
    const distance = Math.max(4.4, (metrics.totalWidth * (wideCabinet ? 2.35 : 1.38)) / aspect, metrics.totalHeight * 2.2, metrics.depth * 4);
    const direction = new THREE.Vector3(wideCabinet ? 0.34 : narrow ? 0.38 : 0.64, 0.42, wideCabinet || narrow ? 0.82 : 0.72).normalize();
    camera.position.copy(target.clone().add(direction.multiplyScalar(distance)));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, metrics.depth, metrics.totalHeight, metrics.totalWidth, size.height, size.width]);

  return null;
}

function CabinetModel({
  config,
  selection,
  onSelect,
  onExpand
}: {
  config: CabinetConfig;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
}) {
  const layout = useMemo(() => createLayout(config), [config]);
  const frameColor = config.frameFinish === "chrome" ? "#d7dce2" : "#2b2f32";
  const metalness = config.frameFinish === "chrome" ? 1 : 0.65;
  const roughness = config.frameFinish === "chrome" ? 0.18 : 0.34;

  return (
    <group position={[0, 0.05, 0]}>
      {layout.points.map((point) => (
        <mesh key={point.key} position={point.position} castShadow receiveShadow>
          <sphereGeometry args={[BALL_RADIUS, 32, 20]} />
          <meshPhysicalMaterial color={frameColor} metalness={metalness} roughness={roughness} clearcoat={0.6} />
        </mesh>
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
        const rawKind = config.cells[cell.row][cell.column].kind;
        const kind = config.structureMode === "noPanels" || config.structureMode === "frameOnly" ? "open" : rawKind;
        return (
          <CellContent
            key={`cell-${cell.row}-${cell.column}`}
            cell={cell}
            kind={kind}
            doorState={config.cells[cell.row][cell.column].doorState ?? "half"}
            color={getEffectiveCellColor(config, cell.row, cell.column)}
            structureMode={config.structureMode}
            selected={selection?.row === cell.row && selection.column === cell.column}
            onSelect={() => onSelect({ row: cell.row, column: cell.column })}
            onExpand={onExpand}
          />
        );
      })}

      <Feet layout={layout} feet={config.feet} />
      {config.showDimensions ? <DimensionLabels layout={layout} config={config} /> : null}
    </group>
  );
}

function CellContent({
  cell,
  kind,
  doorState,
  color,
  structureMode,
  selected,
  onSelect,
  onExpand
}: {
  cell: LayoutCell;
  kind: CellKind;
  doorState: DoorOpenState;
  color: string;
  structureMode: CabinetConfig["structureMode"];
  selected: boolean;
  onSelect: () => void;
  onExpand: (direction: "left" | "right" | "top" | "front") => void;
}) {
  const frontZ = cell.z + cell.depth / 2 + PANEL_THICKNESS / 2;
  const backZ = cell.z - cell.depth / 2 - PANEL_THICKNESS / 2;
  const innerDepth = Math.max(0.05, cell.depth - 0.16);

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {structureMode !== "frameOnly" ? (
        <AccessoryGeometry kind={kind} doorState={doorState} cell={cell} color={color} frontZ={frontZ} backZ={backZ} innerDepth={innerDepth} hideFront={structureMode === "noFront"} />
      ) : null}

      <mesh position={[cell.x, cell.y, cell.z]} renderOrder={5}>
        <boxGeometry args={[cell.width, cell.height, cell.depth]} />
        <meshBasicMaterial transparent opacity={0.01} color="#ffe500" depthWrite={false} />
      </mesh>

      {selected ? (
        <>
          <SelectionFrame cell={cell} />
          <ExpandHints cell={cell} onExpand={onExpand} />
        </>
      ) : null}
    </group>
  );
}

function AccessoryGeometry({
  kind,
  doorState,
  cell,
  color,
  frontZ,
  backZ,
  innerDepth,
  hideFront
}: {
  kind: CellKind;
  doorState: DoorOpenState;
  cell: LayoutCell;
  color: string;
  frontZ: number;
  backZ: number;
  innerDepth: number;
  hideFront: boolean;
}) {
  const panel = <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} side={THREE.DoubleSide} />;
  const glass = <meshPhysicalMaterial color="#cfeefa" metalness={0.02} roughness={0.04} transmission={0.4} opacity={0.38} transparent />;
  const isDoor = ["dropDoor", "flipUpDoor", "sideOpenDoor", "glassDropDoor"].includes(kind);

  return (
    <group>
      {kind !== "open" && kind !== "dropDoor" && kind !== "noBackModule" && kind !== "glassPanelModule" && !["softPanelLow", "softPanelWide", "softPanelTall"].includes(kind) ? (
        <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.08, cell.height - 0.08, PANEL_THICKNESS]}>{panel}</PanelBox>
      ) : null}

      {kind === "open" ? <OpenBase cell={cell} innerDepth={innerDepth} /> : null}
      {kind === "metalBackModule" ? <MetalBox cell={cell} backZ={backZ} innerDepth={innerDepth} color={color} includeBack /> : null}
      {kind === "noBackModule" ? <MetalBox cell={cell} backZ={backZ} innerDepth={innerDepth} color={color} includeBack={false} /> : null}
      {kind === "glassPanelModule" ? <GlassBox cell={cell} backZ={backZ} innerDepth={innerDepth} /> : null}
      {kind === "openBackPanel" ? <OpenBackPanel cell={cell} backZ={backZ} innerDepth={innerDepth} color={color} /> : null}
      {kind === "sidePanel" ? <SidePanel cell={cell} innerDepth={innerDepth} color={color} /> : null}

      {kind === "dropDoor" ? <DropDoor cell={cell} frontZ={frontZ} backZ={backZ} innerDepth={innerDepth} color={color} doorState={doorState} hideDoor={hideFront} /> : null}
      {!hideFront && kind === "flipUpDoor" ? <FlipUpDoor cell={cell} frontZ={frontZ} color={color} /> : null}
      {!hideFront && kind === "sideOpenDoor" ? <SideOpenDoor cell={cell} frontZ={frontZ} color={color} /> : null}
      {!hideFront && kind === "glassDropDoor" ? <GlassDoor cell={cell} frontZ={frontZ} /> : null}

      {kind === "softPanelLow" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.9} heightRatio={0.36} yBias={-0.18} /> : null}
      {kind === "softPanelWide" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.88} heightRatio={0.48} yBias={0} /> : null}
      {kind === "softPanelTall" ? <SoftPanel cell={cell} backZ={backZ} widthRatio={0.42} heightRatio={0.86} yBias={0} /> : null}

      {kind === "shelf" ? <Shelf cell={cell} innerDepth={innerDepth} color={color} /> : null}
      {kind === "pullOutShelf" ? <PullOutShelf cell={cell} frontZ={frontZ} innerDepth={innerDepth} color={color} /> : null}
      {kind === "boxDrawer" ? <BoxDrawer cell={cell} frontZ={frontZ} innerDepth={innerDepth} color={color} /> : null}
      {kind === "displayTray" ? <DisplayTray cell={cell} innerDepth={innerDepth} color={color} /> : null}
      {kind === "glassShelf" ? <GlassShelf cell={cell} innerDepth={innerDepth} material={glass} /> : null}

      {isDoor && kind !== "dropDoor" ? <OpenBase cell={cell} innerDepth={innerDepth} subtle /> : null}
    </group>
  );
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

function GlassBox({ cell, backZ, innerDepth }: { cell: LayoutCell; backZ: number; innerDepth: number }) {
  const glass = <meshPhysicalMaterial color="#d6f4ff" metalness={0.02} roughness={0.02} transmission={0.45} opacity={0.32} transparent side={THREE.DoubleSide} />;
  return (
    <group>
      <PanelBox position={[cell.x, cell.y, backZ]} args={[cell.width - 0.08, cell.height - 0.08, PANEL_THICKNESS]}>{glass}</PanelBox>
      <PanelBox position={[cell.x, cell.y - cell.height / 2 + PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{glass}</PanelBox>
      <PanelBox position={[cell.x, cell.y + cell.height / 2 - PANEL_THICKNESS / 2, cell.z]} args={[cell.width - 0.12, PANEL_THICKNESS, innerDepth]}>{glass}</PanelBox>
      <PanelBox position={[cell.x - cell.width / 2 + PANEL_THICKNESS / 2, cell.y, cell.z]} args={[PANEL_THICKNESS, cell.height - 0.12, innerDepth]}>{glass}</PanelBox>
      <PanelBox position={[cell.x + cell.width / 2 - PANEL_THICKNESS / 2, cell.y, cell.z]} args={[PANEL_THICKNESS, cell.height - 0.12, innerDepth]}>{glass}</PanelBox>
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

function DropDoor({
  cell,
  frontZ,
  backZ,
  innerDepth,
  color,
  doorState,
  hideDoor
}: {
  cell: LayoutCell;
  frontZ: number;
  backZ: number;
  innerDepth: number;
  color: string;
  doorState: DoorOpenState;
  hideDoor: boolean;
}) {
  const angle = doorState === "closed" ? 0 : doorState === "open" ? Math.PI / 2 : Math.PI * 0.24;
  const panelW = Math.max(0.16, cell.width - 0.1);
  const panelH = Math.max(0.12, cell.height - 0.1);
  const pivotY = cell.y - cell.height / 2;
  const pivotZ = frontZ;
  const hingeXL = -panelW / 2 + 0.07;
  const hingeXR = panelW / 2 - 0.07;
  const darkMetal = "#4a5058";
  const lightMetal = "#8a9098";

  return (
    <group>
      {doorState !== "closed" && !hideDoor ? (
        <MetalBox cell={cell} backZ={backZ} innerDepth={innerDepth} color={color} includeBack />
      ) : null}

      {!hideDoor ? (
        <>
          <group position={[cell.x, pivotY, pivotZ]} rotation={[angle, 0, 0]}>
            <mesh position={[0, panelH / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[panelW, panelH, PANEL_THICKNESS]} />
              <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
            </mesh>

            <group position={[0, panelH / 2, PANEL_THICKNESS / 2 + 0.003]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.034, 0.034, 0.006, 32]} />
                <meshStandardMaterial color={lightMetal} metalness={0.65} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.019, 0.019, 0.008, 32]} />
                <meshStandardMaterial color={darkMetal} metalness={0.85} roughness={0.18} />
              </mesh>
            </group>

            <DropDoorHinge x={hingeXL} darkMetal={darkMetal} />
            <DropDoorHinge x={hingeXR} darkMetal={darkMetal} />
          </group>

          {doorState !== "closed" ? (
            <>
              {[hingeXL, hingeXR].map((x) => {
                const cabinetPt: [number, number, number] = [
                  cell.x + x,
                  cell.y - cell.height * 0.1,
                  frontZ - innerDepth * 0.38
                ];
                const doorPt: [number, number, number] = [
                  cell.x + x,
                  pivotY + panelH * 0.38 * Math.cos(angle),
                  pivotZ + panelH * 0.38 * Math.sin(angle)
                ];
                return (
                  <group key={`stay-${x}`}>
                    <RodBetween start={cabinetPt} end={doorPt} radius={0.01} color={lightMetal} />
                    <mesh position={cabinetPt} castShadow>
                      <sphereGeometry args={[0.022, 16, 10]} />
                      <meshStandardMaterial color={darkMetal} metalness={0.8} roughness={0.22} />
                    </mesh>
                    <mesh position={doorPt} castShadow>
                      <sphereGeometry args={[0.019, 16, 10]} />
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

function FlipUpDoor({ cell, frontZ, color }: { cell: LayoutCell; frontZ: number; color: string }) {
  return (
    <group position={[cell.x, cell.y + cell.height / 2 - 0.04, frontZ]} rotation={[0.72, 0, 0]}>
      <PanelBox position={[0, -cell.height / 2 + 0.04, 0]} args={[cell.width - 0.09, cell.height - 0.09, PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </PanelBox>
      <Handle width={cell.width - 0.18} y={-0.1} />
    </group>
  );
}

function SideOpenDoor({ cell, frontZ, color }: { cell: LayoutCell; frontZ: number; color: string }) {
  return (
    <group position={[cell.x - cell.width / 2 + 0.04, cell.y, frontZ]} rotation={[0, -0.86, 0]}>
      <PanelBox position={[cell.width / 2 - 0.04, 0, 0]} args={[cell.width - 0.09, cell.height - 0.09, PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </PanelBox>
      <PanelBox position={[0.03, 0, 0.018]} args={[0.018, cell.height - 0.18, 0.018]}>
        <meshStandardMaterial color="#5b6064" roughness={0.28} metalness={0.75} />
      </PanelBox>
    </group>
  );
}

function GlassDoor({ cell, frontZ }: { cell: LayoutCell; frontZ: number }) {
  return (
    <group position={[cell.x, cell.y, frontZ]}>
      <PanelBox position={[0, 0, 0]} args={[cell.width - 0.09, cell.height - 0.09, PANEL_THICKNESS]}>
        <meshPhysicalMaterial color="#d6f4ff" metalness={0.02} roughness={0.03} transmission={0.48} opacity={0.36} transparent />
      </PanelBox>
      <FrameRect width={cell.width - 0.09} height={cell.height - 0.09} z={PANEL_THICKNESS / 2 + 0.015} />
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
    <PanelBox position={[cell.x, cell.y, cell.z]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}>
      <meshStandardMaterial color={color} roughness={0.46} metalness={0.06} />
    </PanelBox>
  );
}

function PullOutShelf({ cell, frontZ, innerDepth, color }: { cell: LayoutCell; frontZ: number; innerDepth: number; color: string }) {
  const extension = Math.min(0.48, innerDepth * 0.34);
  return (
    <group>
      <PanelBox position={[cell.x, cell.y - cell.height * 0.08, cell.z + extension / 2]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}><meshStandardMaterial color={color} roughness={0.46} metalness={0.06} /></PanelBox>
      <PanelBox position={[cell.x - cell.width * 0.42, cell.y - cell.height * 0.12, frontZ - 0.12]} args={[0.035, 0.03, extension + 0.16]}><meshStandardMaterial color="#6d7378" metalness={0.7} roughness={0.28} /></PanelBox>
      <PanelBox position={[cell.x + cell.width * 0.42, cell.y - cell.height * 0.12, frontZ - 0.12]} args={[0.035, 0.03, extension + 0.16]}><meshStandardMaterial color="#6d7378" metalness={0.7} roughness={0.28} /></PanelBox>
    </group>
  );
}

function BoxDrawer({ cell, frontZ, innerDepth, color }: { cell: LayoutCell; frontZ: number; innerDepth: number; color: string }) {
  const drawerDepth = innerDepth * 0.72;
  return (
    <group position={[cell.x, cell.y - cell.height * 0.08, cell.z + innerDepth * 0.12]}>
      <PanelBox position={[0, 0, 0]} args={[cell.width - 0.16, cell.height * 0.56, drawerDepth]}>
        <meshStandardMaterial color="#d7dcdf" roughness={0.5} metalness={0.04} />
      </PanelBox>
      <PanelBox position={[0, 0, frontZ - cell.z - innerDepth * 0.12 + 0.01]} args={[cell.width - 0.12, cell.height * 0.62, PANEL_THICKNESS]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </PanelBox>
      <Handle width={(cell.width - 0.18) * 0.46} y={cell.height * 0.12} />
    </group>
  );
}

function DisplayTray({ cell, innerDepth, color }: { cell: LayoutCell; innerDepth: number; color: string }) {
  const y = cell.y - cell.height * 0.18;
  const rim = 0.07;
  return (
    <group>
      <PanelBox position={[cell.x, y, cell.z]} args={[cell.width - 0.13, PANEL_THICKNESS, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x - cell.width / 2 + 0.11, y + rim / 2, cell.z]} args={[0.035, rim, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x + cell.width / 2 - 0.11, y + rim / 2, cell.z]} args={[0.035, rim, innerDepth]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
      <PanelBox position={[cell.x, y + rim / 2, cell.z - innerDepth / 2 + 0.02]} args={[cell.width - 0.13, rim, 0.035]}><meshStandardMaterial color={color} roughness={0.48} metalness={0.05} /></PanelBox>
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
  const z = cell.z + cell.depth / 2 + 0.12;
  const buttons: Array<{ direction: "left" | "right" | "top" | "front"; position: [number, number, number] }> = [
    { direction: "left", position: [cell.x - cell.width / 2 - 0.16, cell.y, z] },
    { direction: "right", position: [cell.x + cell.width / 2 + 0.16, cell.y, z] },
    { direction: "top", position: [cell.x, cell.y + cell.height / 2 + 0.16, z] },
    { direction: "front", position: [cell.x, cell.y, cell.z + cell.depth / 2 + 0.32] }
  ];

  return (
    <group>
      {buttons.map((button) => (
        <group
          key={button.direction}
          position={button.position}
          onClick={(event) => {
            event.stopPropagation();
            onExpand(button.direction);
          }}
        >
          <mesh renderOrder={20}>
            <circleGeometry args={[0.11, 32]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.08} depthTest={false} />
          </mesh>
          <mesh renderOrder={21}>
            <ringGeometry args={[0.082, 0.105, 32]} />
            <meshBasicMaterial color="#111111" transparent opacity={0.88} depthTest={false} />
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
      <PanelBox position={[0, 0, 0]} args={[0.12, 0.014, 0.01]}><meshBasicMaterial color="#111111" depthTest={false} /></PanelBox>
      <PanelBox position={[0, 0, 0]} args={[0.014, 0.12, 0.01]}><meshBasicMaterial color="#111111" depthTest={false} /></PanelBox>
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
                <meshStandardMaterial color="#1f2224" roughness={0.38} metalness={0.2} />
              </mesh>
              <PanelBox position={[0, 0.045, 0]} args={[0.11, bracketHeight, 0.035]}><meshStandardMaterial color="#303438" roughness={0.36} metalness={0.5} /></PanelBox>
            </>
          ) : (
            <mesh castShadow>
              <cylinderGeometry args={[0.08, 0.095, 0.05, 28]} />
              <meshStandardMaterial color="#1f2224" roughness={0.42} metalness={0.25} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function DimensionLabels({ layout, config }: { layout: ReturnType<typeof createLayout>; config: CabinetConfig }) {
  const dims = getDimensions(config);
  const topY = layout.maxY + 0.2;
  const frontZ = layout.frontZ + 0.18;
  const rightX = layout.maxX + 0.18;
  const bottomY = layout.minY - 0.02;

  return (
    <group>
      <DimensionLine start={[layout.minX, topY, frontZ]} end={[layout.maxX, topY, frontZ]} label={`${dims.innerWidth} mm`} />
      <DimensionLine start={[rightX, bottomY, frontZ]} end={[rightX, layout.maxY, frontZ]} label={`${dims.innerHeight} mm`} vertical />
      <DimensionLine start={[layout.minX - 0.16, bottomY, layout.backZ]} end={[layout.minX - 0.16, bottomY, layout.frontZ]} label={`${dims.innerDepth} mm`} />
      <LabelSprite position={[0, -0.24, frontZ + 0.24]} label={`外部尺寸 ${dims.outerWidth} x ${dims.outerHeight} x ${dims.outerDepth} mm`} />
    </group>
  );
}

function DimensionLine({ start, end, label, vertical = false }: { start: [number, number, number]; end: [number, number, number]; label: string; vertical?: boolean }) {
  const points = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [end, start]);
  const center: [number, number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
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

function LabelSprite({ position, label, vertical = false }: { position: [number, number, number]; label: string; vertical?: boolean }) {
  const texture = useMemo(() => createLabelTexture(label, vertical), [label, vertical]);
  useEffect(() => () => texture.dispose(), [texture]);
  const scale: [number, number, number] = vertical ? [0.18, Math.max(0.52, label.length * 0.09), 1] : [Math.max(0.48, label.length * 0.085), 0.18, 1];
  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function Tube({ axis, length, position, color, metalness, roughness }: { axis: "x" | "y" | "z"; length: number; position: [number, number, number]; color: string; metalness: number; roughness: number }) {
  const rotation: [number, number, number] = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[TUBE_RADIUS, TUBE_RADIUS, length, 28]} />
      <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} clearcoat={0.5} />
    </mesh>
  );
}

function PanelBox({ position, args, children }: { position: [number, number, number]; args: [number, number, number]; children: ReactNode }) {
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
  const points = new Map<string, { key: string; position: [number, number, number] }>();
  const feet = new Map<string, { key: string; x: number; z: number }>();
  const xSegments = new Map<string, Segment>();
  const ySegments = new Map<string, Segment>();
  const zSegments = new Map<string, Segment>();

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  config.cells.forEach((row, rowIndex) => {
    row.forEach((cfg, columnIndex) => {
      if (!cfg.enabled) return;
      const x0 = xBounds[columnIndex];
      const x1 = xBounds[columnIndex + 1];
      const y0 = yBounds[rowIndex];
      const y1 = yBounds[rowIndex + 1];
      const width = x1 - x0;
      const height = y1 - y0;
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y1);

      cells.push({ row: rowIndex, column: columnIndex, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0, width, height, depth });

      [columnIndex, columnIndex + 1].forEach((xIndex) => {
        [rowIndex, rowIndex + 1].forEach((yIndex) => {
          [0, 1].forEach((zIndex) => {
            const key = `${xIndex}:${yIndex}:${zIndex}`;
            points.set(key, { key, position: [xBounds[xIndex], yBounds[yIndex], zBounds[zIndex]] });
          });
          const zKey = `${xIndex}:${yIndex}`;
          zSegments.set(zKey, { key: zKey, length: depth, position: [xBounds[xIndex], yBounds[yIndex], 0] });
        });
      });

      [rowIndex, rowIndex + 1].forEach((yIndex) => {
        [0, 1].forEach((zIndex) => {
          const key = `${columnIndex}:${yIndex}:${zIndex}`;
          xSegments.set(key, { key, length: width, position: [(x0 + x1) / 2, yBounds[yIndex], zBounds[zIndex]] });
        });
      });

      [columnIndex, columnIndex + 1].forEach((xIndex) => {
        [0, 1].forEach((zIndex) => {
          const key = `${xIndex}:${rowIndex}:${zIndex}`;
          ySegments.set(key, { key, length: height, position: [xBounds[xIndex], (y0 + y1) / 2, zBounds[zIndex]] });
        });
      });

      if (rowIndex === 0) {
        [columnIndex, columnIndex + 1].forEach((xIndex) => [0, 1].forEach((zIndex) => {
          const key = `${xIndex}:${zIndex}`;
          feet.set(key, { key, x: xBounds[xIndex], z: zBounds[zIndex] });
        }));
      }
    });
  });

  if (!Number.isFinite(minX)) {
    minX = xBounds[0];
    maxX = xBounds[xBounds.length - 1];
    minY = yBounds[0];
    maxY = yBounds[yBounds.length - 1];
  }

  return {
    cells,
    points: [...points.values()],
    feet: [...feet.values()],
    xSegments: [...xSegments.values()],
    ySegments: [...ySegments.values()],
    zSegments: [...zSegments.values()],
    minX,
    maxX,
    minY,
    maxY,
    backZ: zBounds[0],
    frontZ: zBounds[1],
    totalWidth: Math.max(0.1, maxX - minX),
    totalHeight: Math.max(0.1, maxY - minY),
    depth
  };
}

function getSceneMetrics(config: CabinetConfig) {
  const layout = createLayout(config);
  return { totalWidth: layout.totalWidth, totalHeight: layout.totalHeight, depth: layout.depth };
}

function createLabelTexture(label: string, vertical: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 160 : 640;
  canvas.height = vertical ? 640 : 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

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
