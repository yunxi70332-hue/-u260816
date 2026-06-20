import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { X } from "lucide-react";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

export interface HingeModelProps {
  open: number;
  detailed?: boolean;
  side?: -1 | 1;
  scale?: number;
}

const METAL = "#9ca2a2";
const DARK_METAL = "#4a4f50";
const BLACK_PLASTIC = "#151719";
const SPRING_METAL = "#c2c7c7";

export function HingeModel({ open, detailed = true, side = 1, scale = 1 }: HingeModelProps) {
  const clampedOpen = Math.max(0, Math.min(1, open));
  const angle = clampedOpen * Math.PI * 0.52;
  const activeArmAngle = -angle * side;
  const linkAngle = (-0.42 - clampedOpen * 0.78) * side;
  const springStretch = 1 + clampedOpen * 0.34;
  const detailScale = detailed ? 1 : 0.78;

  return (
    <group scale={[scale * side, scale, scale]} rotation={[0, 0, 0]}>
      <group scale={detailScale}>
        <FixedBackPlate detailed={detailed} />
        <DamperBlock open={clampedOpen} />
        <ActiveLongArm angle={activeArmAngle} />
        <LinkagePair angle={linkAngle} open={clampedOpen} />
        <SpringAssembly stretch={springStretch} open={clampedOpen} />
        <PivotCluster />
        {detailed ? <ScrewSet /> : null}
      </group>
    </group>
  );
}

export function HingeDetailViewer({
  open,
  onOpenChange,
  onClose
}: {
  open: number;
  onOpenChange: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="hinge-viewer-backdrop" role="dialog" aria-modal="true" aria-label="铰链细节查看器">
      <div className="hinge-viewer">
        <div className="hinge-viewer-header">
          <div>
            <h2>下翻门铰链</h2>
            <span>实物参考建模 · 外观预览</span>
          </div>
          <button type="button" className="hinge-close" aria-label="关闭铰链细节" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="hinge-viewer-body">
          <div className="hinge-canvas-panel">
            <Canvas
              className="hinge-detail-canvas"
              shadows
              camera={{ position: [0.35, 0.28, 2.35], fov: 32, near: 0.01, far: 20 }}
              gl={{ antialias: true, preserveDrawingBuffer: true }}
            >
              <color attach="background" args={["#eef2f4"]} />
              <Suspense fallback={null}>
                <ambientLight intensity={0.82} />
                <directionalLight position={[2.4, 3.5, 2.5]} intensity={1.45} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
                <directionalLight position={[-2.2, 1.4, -2.2]} intensity={0.55} />
                <group rotation={[-0.02, -0.08, -0.03]} position={[-0.05, -0.02, 0]}>
                  <HingeModel open={open} detailed scale={1.14} />
                </group>
                <mesh position={[0.08, -0.31, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                  <planeGeometry args={[2.15, 1.18]} />
                  <shadowMaterial opacity={0.12} />
                </mesh>
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.75} maxDistance={4} target={[0.1, 0.02, 0]} />
              </Suspense>
            </Canvas>
          </div>
          <div className="hinge-info-panel">
            <img src="/assets/hinge/hinge-product-render.png" alt="铰链真实外观渲染图" />
            <label className="hinge-range">
              <span>开合角度</span>
              <input type="range" min={0} max={1} step={0.01} value={open} onChange={(event) => onOpenChange(Number(event.target.value))} />
              <strong>{Math.round(open * 94)}°</strong>
            </label>
            <div className="hinge-state-buttons">
              <button type="button" onClick={() => onOpenChange(0)}>关闭</button>
              <button type="button" onClick={() => onOpenChange(0.52)}>半开</button>
              <button type="button" onClick={() => onOpenChange(1)}>全开</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HingeProductRenderPage() {
  return (
    <div className="hinge-product-render-page" data-hinge-product-render="ready">
      <Canvas
        className="hinge-product-render-canvas"
        shadows
        camera={{ position: [0.14, 0.04, 3.55], fov: 23, near: 0.01, far: 20 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
      >
        <color attach="background" args={["#f2f4f5"]} />
        <Suspense fallback={null}>
          <ambientLight intensity={0.86} />
          <directionalLight position={[2.8, 4.2, 2.6]} intensity={1.55} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <directionalLight position={[-2.4, 1.8, -2.2]} intensity={0.64} />
          <directionalLight position={[0, 1.2, 3.6]} intensity={0.34} />
          <group position={[-0.03, -0.01, 0]} rotation={[0, 0, -0.03]}>
            <HingeModel open={0.58} detailed scale={1.02} />
          </group>
          <mesh position={[0.08, -0.27, -0.04]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[2.4, 1.2]} />
            <shadowMaterial opacity={0.14} />
          </mesh>
        </Suspense>
      </Canvas>
    </div>
  );
}

function FixedBackPlate({ detailed }: { detailed: boolean }) {
  const cutout = useMemo(() => createLongArmShape(0.88, 0.18, 0.07, true), []);

  return (
    <group>
      <mesh position={[0.18, 0, 0]} rotation={[0, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[cutout, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.004, bevelSegments: 2 }]} />
        <meshPhysicalMaterial color={METAL} metalness={0.72} roughness={0.3} clearcoat={0.18} side={THREE.DoubleSide} />
      </mesh>
      <PanelBox position={[-0.24, 0.055, -0.036]} args={[0.18, 0.24, 0.035]} color={METAL} metalness={0.66} roughness={0.32} />
      <PanelBox position={[-0.33, -0.02, -0.056]} args={[0.05, 0.38, 0.04]} color={DARK_METAL} metalness={0.5} roughness={0.42} />
      {detailed ? (
        <mesh position={[0.53, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <torusGeometry args={[0.088, 0.016, 18, 48]} />
          <meshPhysicalMaterial color={BLACK_PLASTIC} metalness={0.2} roughness={0.34} clearcoat={0.22} />
        </mesh>
      ) : null}
    </group>
  );
}

function DamperBlock({ open }: { open: number }) {
  return (
    <group position={[-0.02 + open * 0.04, 0.07, 0.07]}>
      <PanelBox position={[0, 0, 0]} args={[0.46, 0.13, 0.13]} color={BLACK_PLASTIC} metalness={0.08} roughness={0.42} />
      <PanelBox position={[-0.16, -0.085, -0.008]} args={[0.08, 0.12, 0.105]} color={BLACK_PLASTIC} metalness={0.08} roughness={0.45} />
      {[-0.12, 0.12].map((x) => (
        <PanelBox key={x} position={[x, 0.073, 0.006]} args={[0.018, 0.022, 0.145]} color="#24282a" metalness={0.08} roughness={0.52} />
      ))}
    </group>
  );
}

function ActiveLongArm({ angle }: { angle: number }) {
  const shape = useMemo(() => createLongArmShape(0.78, 0.13, 0.052, false), []);

  return (
    <group position={[-0.33, -0.075, 0.015]} rotation={[0, 0, angle]}>
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2 }]} />
        <meshPhysicalMaterial color={METAL} metalness={0.78} roughness={0.28} clearcoat={0.16} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.33, 0, 0.034]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.054, 0.012, 16, 36]} />
        <meshPhysicalMaterial color={DARK_METAL} metalness={0.64} roughness={0.32} />
      </mesh>
    </group>
  );
}

function LinkagePair({ angle, open }: { angle: number; open: number }) {
  const linkShape = useMemo(() => createRoundedBarShape(0.36, 0.045), []);

  return (
    <group>
      {[0.024, -0.024].map((z, index) => (
        <group key={z} position={[-0.18, -0.04 + index * 0.018, z]} rotation={[0, 0, angle]}>
          <mesh castShadow receiveShadow>
            <extrudeGeometry args={[linkShape, { depth: 0.013, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 1 }]} />
            <meshPhysicalMaterial color={index === 0 ? "#b4b9b9" : METAL} metalness={0.76} roughness={0.29} clearcoat={0.12} />
          </mesh>
        </group>
      ))}
      <Pin position={[-0.18, -0.04, 0.055]} />
      <Pin position={[0.08 + open * 0.08, -0.13 - open * 0.06, 0.055]} />
    </group>
  );
}

function SpringAssembly({ stretch, open }: { stretch: number; open: number }) {
  const spring = useMemo(() => createSpringCurve(0.36), []);

  return (
    <group position={[0.1, -0.035, 0.09]} rotation={[0, 0, -0.08 - open * 0.18]} scale={[stretch, 1, 1]}>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[spring, 90, 0.008, 10, false]} />
        <meshPhysicalMaterial color={SPRING_METAL} metalness={0.88} roughness={0.2} clearcoat={0.18} />
      </mesh>
      <PanelBox position={[-0.22, 0, 0]} args={[0.12, 0.01, 0.01]} color={SPRING_METAL} metalness={0.82} roughness={0.22} />
      <PanelBox position={[0.22, 0, 0]} args={[0.12, 0.01, 0.01]} color={SPRING_METAL} metalness={0.82} roughness={0.22} />
    </group>
  );
}

function PivotCluster() {
  return (
    <group>
      <Pin position={[-0.33, -0.075, 0.055]} radius={0.024} />
      <Pin position={[-0.04, -0.01, 0.07]} radius={0.019} />
      <Pin position={[0.2, -0.08, 0.07]} radius={0.018} />
    </group>
  );
}

function ScrewSet() {
  return (
    <group>
      {[
        [-0.26, 0.13, 0.058],
        [-0.25, -0.09, 0.058],
        [0.1, -0.08, 0.058],
        [0.43, -0.06, 0.058]
      ].map(([x, y, z]) => (
        <Screw key={`${x}-${y}`} position={[x, y, z]} />
      ))}
    </group>
  );
}

function Screw({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.026, 0.026, 0.012, 32]} />
        <meshPhysicalMaterial color="#d5d7d7" metalness={0.86} roughness={0.22} clearcoat={0.2} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0.007, 0]} castShadow>
        <boxGeometry args={[0.04, 0.004, 0.006]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.38} />
      </mesh>
    </group>
  );
}

function Pin({ position, radius = 0.016 }: { position: [number, number, number]; radius?: number }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, 0.045, 28]} />
      <meshPhysicalMaterial color="#c8cccc" metalness={0.82} roughness={0.24} clearcoat={0.2} />
    </mesh>
  );
}

function PanelBox({
  position,
  args,
  color,
  metalness,
  roughness
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} clearcoat={0.12} />
    </mesh>
  );
}

function createLongArmShape(width: number, height: number, radius: number, withCutout: boolean) {
  const shape = new THREE.Shape();
  const halfH = height / 2;
  const left = -width / 2;
  const right = width / 2;
  shape.moveTo(left + radius, -halfH);
  shape.lineTo(right - radius, -halfH);
  shape.quadraticCurveTo(right, -halfH, right, -halfH + radius);
  shape.lineTo(right, halfH - radius);
  shape.quadraticCurveTo(right, halfH, right - radius, halfH);
  shape.lineTo(left + radius, halfH);
  shape.quadraticCurveTo(left, halfH, left, halfH - radius);
  shape.lineTo(left, -halfH + radius);
  shape.quadraticCurveTo(left, -halfH, left + radius, -halfH);

  const endHole = new THREE.Path();
  endHole.absarc(right - radius * 1.2, 0, radius * 0.62, 0, Math.PI * 2, false);
  shape.holes.push(endHole);

  if (withCutout) {
    const centerHole = new THREE.Path();
    centerHole.moveTo(left + 0.26, -halfH * 0.45);
    centerHole.lineTo(right - 0.22, -halfH * 0.45);
    centerHole.lineTo(right - 0.28, halfH * 0.45);
    centerHole.lineTo(left + 0.22, halfH * 0.45);
    centerHole.closePath();
    shape.holes.push(centerHole);
  }

  return shape;
}

function createRoundedBarShape(width: number, height: number) {
  const shape = new THREE.Shape();
  const radius = height / 2;
  shape.moveTo(-width / 2 + radius, -height / 2);
  shape.lineTo(width / 2 - radius, -height / 2);
  shape.absarc(width / 2 - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-width / 2 + radius, height / 2);
  shape.absarc(-width / 2 + radius, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  return shape;
}

function createSpringCurve(length: number) {
  const points: THREE.Vector3[] = [];
  const turns = 18;
  const steps = 120;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI * 2 * turns;
    points.push(new THREE.Vector3(
      -length / 2 + t * length,
      Math.sin(angle) * 0.023,
      Math.cos(angle) * 0.023
    ));
  }
  return new THREE.CatmullRomCurve3(points);
}
