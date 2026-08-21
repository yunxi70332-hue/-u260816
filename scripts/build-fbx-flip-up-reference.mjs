import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

globalThis.window = {
  URL: {
    createObjectURL: () => "",
    revokeObjectURL: () => {}
  }
};

globalThis.FileReader = class FileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    }).catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    }).catch((error) => this.onerror?.(error));
  }
};

THREE.ImageLoader.prototype.load = function loadWithoutDom(url, onLoad) {
  const image = { src: url };
  if (onLoad) queueMicrotask(() => onLoad(image));
  return image;
};

const [closedArg, openArg, outputArg = "public/assets/flip-up-door-fbx-reference"] = process.argv.slice(2);
if (!closedArg || !openArg) {
  throw new Error("Usage: node scripts/build-fbx-flip-up-reference.mjs <closed.fbx> <open.fbx> [output-dir]");
}

const closedPath = path.resolve(closedArg);
const openPath = path.resolve(openArg);
const outputDir = path.resolve(outputArg);
const outputGlb = path.join(outputDir, "flip-up-door-reference.glb");

const pivotMm = new THREE.Vector3(-270.17122, 380, 175);
const sceneScale = 0.004;
const movingIndices = new Set([0, 1, 2, 3, 10, 13, 41]);
const fixedHardwareIndices = new Set([8, 9, 11, 12]);
const selectedIndices = new Set([...movingIndices, ...fixedHardwareIndices]);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashAttribute(attribute) {
  if (!attribute) return "none";
  return crypto
    .createHash("sha256")
    .update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))
    .digest("hex")
    .slice(0, 16);
}

function geometryHash(object) {
  const geometry = object.geometry;
  return [
    hashAttribute(geometry.getAttribute("position")),
    hashAttribute(geometry.getAttribute("normal")),
    geometry.index ? hashAttribute(geometry.index) : "none"
  ].join(":");
}

function loadFbx(filePath) {
  const bytes = fs.readFileSync(filePath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const root = new FBXLoader().parse(buffer, `${path.dirname(filePath)}/`);
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  return meshes;
}

function buildPairs(closedMeshes, openMeshes) {
  const byHash = new Map();
  for (const mesh of openMeshes) {
    const hash = geometryHash(mesh);
    const candidates = byHash.get(hash) ?? [];
    candidates.push(mesh);
    byHash.set(hash, candidates);
  }

  const used = new Set();
  return closedMeshes.map((closed, index) => {
    const candidates = byHash.get(geometryHash(closed)) ?? [];
    const open = candidates.find((candidate) => !used.has(candidate) && candidate.name === closed.name)
      ?? candidates.find((candidate) => !used.has(candidate));
    if (!open) throw new Error(`Unable to match FBX mesh ${index}`);
    used.add(open);
    return { index, closed, open };
  });
}

function relativeTransform(object) {
  const matrix = new THREE.Matrix4()
    .makeTranslation(-pivotMm.x, -pivotMm.y, -pivotMm.z)
    .multiply(object.matrixWorld);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function roleFor(index) {
  if (index === 41) return "panel";
  if (index <= 3) return index === 3 ? "lock-dark" : "lock-chrome";
  if (fixedHardwareIndices.has(index)) return "fixed-chrome";
  return "moving-chrome";
}

function materialFor(role) {
  if (role === "panel") {
    return new THREE.MeshStandardMaterial({ name: "flip-reference-panel", color: "#f4f2eb", roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide });
  }
  if (role === "lock-dark") {
    return new THREE.MeshStandardMaterial({ name: "flip-reference-lock-dark", color: "#282828", roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide });
  }
  return new THREE.MeshPhysicalMaterial({ name: `flip-reference-${role}`, color: "#aeb3b4", roughness: 0.2, metalness: 0.82, clearcoat: 0.34, side: THREE.DoubleSide });
}

function array(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(7)));
}

const closedMeshes = loadFbx(closedPath);
const openMeshes = loadFbx(openPath);
const pairs = buildPairs(closedMeshes, openMeshes);
const root = new THREE.Group();
root.name = "flip-up-door-fbx-reference";
root.scale.setScalar(sceneScale);

for (const pair of pairs) {
  if (!selectedIndices.has(pair.index)) continue;

  const role = roleFor(pair.index);
  const closed = relativeTransform(pair.closed);
  const open = movingIndices.has(pair.index) ? relativeTransform(pair.open) : closed;
  const mesh = new THREE.Mesh(pair.closed.geometry.clone(), materialFor(role));
  mesh.name = `${role}-${pair.index}`;
  mesh.position.copy(closed.position);
  mesh.quaternion.copy(closed.quaternion);
  mesh.scale.copy(closed.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    role,
    sourceIndex: pair.index,
    closedPosition: array(closed.position),
    openPosition: array(open.position),
    closedQuaternion: array(closed.quaternion),
    openQuaternion: array(open.quaternion),
    closedScale: array(closed.scale),
    openScale: array(open.scale)
  };
  root.add(mesh);
}

const exported = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(root, resolve, reject, {
    binary: true,
    onlyVisible: false,
    trs: true
  });
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputGlb, Buffer.from(exported));

const manifest = {
  id: "usm-flip-up-door-fbx-reference",
  description: "Flip-up door panel, lock and two-sided hinge mechanism extracted from closed and open FBX exports.",
  sourceFiles: {
    closed: { state: "closed", sha256: sha256(closedPath) },
    open: { state: "open", sha256: sha256(openPath) }
  },
  output: path.basename(outputGlb),
  sceneScale,
  pivotMm: pivotMm.toArray(),
  templateSceneSize: {
    panelWidth: 727 * sceneScale,
    panelHeight: 327 * sceneScale,
    panelThickness: 8 * sceneScale
  },
  selectedSourceIndices: [...selectedIndices].sort((a, b) => a - b),
  roles: Object.fromEntries(root.children.map((child) => [child.name, child.userData.role])),
  animation: {
    type: "two-state transform interpolation",
    closed: 0,
    open: 1
  }
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  outputGlb,
  bytes: fs.statSync(outputGlb).size,
  meshCount: root.children.length,
  movingMeshCount: root.children.filter((child) => child.userData.role === "panel" || child.userData.role.startsWith("lock-") || child.userData.role === "moving-chrome").length,
  fixedMeshCount: root.children.filter((child) => child.userData.role.startsWith("fixed-")).length
}, null, 2));
