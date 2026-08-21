import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

globalThis.window = {
  URL: {
    createObjectURL: () => "",
    revokeObjectURL: () => {}
  }
};

THREE.ImageLoader.prototype.load = function loadWithoutDom(url, onLoad) {
  const image = { src: url };
  if (onLoad) queueMicrotask(() => onLoad(image));
  return image;
};

const inputPaths = process.argv.slice(2).map((value) => path.resolve(value));
if (inputPaths.length < 2) {
  throw new Error("Usage: node scripts/analyze-fbx-reference.mjs <state-a.fbx> <state-b.fbx>");
}

function round(value, digits = 5) {
  return Number(value.toFixed(digits));
}

function vector(values) {
  return values.map((value) => round(value));
}

function hashAttribute(attribute) {
  if (!attribute) return "none";
  return crypto
    .createHash("sha256")
    .update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))
    .digest("hex")
    .slice(0, 16);
}

function loadFbx(filePath) {
  const bytes = fs.readFileSync(filePath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const root = new FBXLoader().parse(buffer, `${path.dirname(filePath)}/`);
  root.updateMatrixWorld(true);
  return root;
}

function summarize(filePath) {
  const root = loadFbx(filePath);
  const sceneBounds = new THREE.Box3().setFromObject(root);
  const meshes = [];
  const nameCounts = new Map();

  root.traverse((object) => {
    if (!object.isMesh) return;

    const occurrence = nameCounts.get(object.name) ?? 0;
    nameCounts.set(object.name, occurrence + 1);

    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const bounds = new THREE.Box3().setFromObject(object);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    object.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    const geometryHash = `${hashAttribute(position)}:${hashAttribute(normal)}:${geometry.index ? hashAttribute(geometry.index) : "none"}`;

    meshes.push({
      index: meshes.length,
      name: object.name,
      occurrence,
      parent: object.parent?.name ?? "",
      geometryHash,
      vertices: position?.count ?? 0,
      triangles: geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3,
      localPosition: vector(object.position.toArray()),
      localRotation: vector([object.rotation.x, object.rotation.y, object.rotation.z]),
      localScale: vector(object.scale.toArray()),
      worldPosition: vector(worldPosition.toArray()),
      worldQuaternion: vector(worldQuaternion.toArray()),
      worldScale: vector(worldScale.toArray()),
      worldBounds: {
        min: vector(bounds.min.toArray()),
        max: vector(bounds.max.toArray()),
        size: vector(bounds.getSize(new THREE.Vector3()).toArray())
      },
      materials: (Array.isArray(object.material) ? object.material : [object.material]).map((material) => ({
        name: material?.name ?? "",
        type: material?.type ?? "",
        color: material?.color?.getHexString?.() ?? null
      }))
    });
  });

  return {
    file: filePath,
    bytes: fs.statSync(filePath).size,
    sceneBounds: {
      min: vector(sceneBounds.min.toArray()),
      max: vector(sceneBounds.max.toArray()),
      size: vector(sceneBounds.getSize(new THREE.Vector3()).toArray())
    },
    meshCount: meshes.length,
    vertexCount: meshes.reduce((total, mesh) => total + mesh.vertices, 0),
    triangleCount: meshes.reduce((total, mesh) => total + mesh.triangles, 0),
    meshes
  };
}

function magnitude(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function compare(a, b) {
  const byGeometry = new Map();
  for (const mesh of b.meshes) {
    const matches = byGeometry.get(mesh.geometryHash) ?? [];
    matches.push(mesh);
    byGeometry.set(mesh.geometryHash, matches);
  }

  const used = new Set();
  const matched = [];
  const onlyA = [];

  for (const meshA of a.meshes) {
    const candidates = byGeometry.get(meshA.geometryHash) ?? [];
    const meshB = candidates.find((candidate) => !used.has(candidate.index) && candidate.name === meshA.name)
      ?? candidates.find((candidate) => !used.has(candidate.index));
    if (!meshB) {
      onlyA.push(meshA);
      continue;
    }

    used.add(meshB.index);
    const positionDelta = meshB.worldPosition.map((value, index) => value - meshA.worldPosition[index]);
    const quaternionDelta = meshB.worldQuaternion.map((value, index) => value - meshA.worldQuaternion[index]);
    const boundsCenterA = meshA.worldBounds.min.map((value, index) => (value + meshA.worldBounds.max[index]) / 2);
    const boundsCenterB = meshB.worldBounds.min.map((value, index) => (value + meshB.worldBounds.max[index]) / 2);
    const centerDelta = boundsCenterB.map((value, index) => value - boundsCenterA[index]);
    const transformChanged = magnitude(positionDelta) > 0.0001
      || magnitude(quaternionDelta) > 0.0001
      || magnitude(centerDelta) > 0.0001;

    matched.push({
      name: meshA.name,
      geometryHash: meshA.geometryHash,
      vertices: meshA.vertices,
      aIndex: meshA.index,
      bIndex: meshB.index,
      transformChanged,
      positionDelta: vector(positionDelta),
      centerDelta: vector(centerDelta),
      a: meshA,
      b: meshB
    });
  }

  return {
    matchedCount: matched.length,
    changedCount: matched.filter((entry) => entry.transformChanged).length,
    unchangedCount: matched.filter((entry) => !entry.transformChanged).length,
    changed: matched.filter((entry) => entry.transformChanged),
    onlyA,
    onlyB: b.meshes.filter((mesh) => !used.has(mesh.index))
  };
}

const states = inputPaths.map(summarize);
const report = {
  generatedAt: new Date().toISOString(),
  states,
  comparison: compare(states[0], states[1])
};
const outputDir = path.resolve("artifacts/fbx-reference-analysis");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "report.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  states: states.map((state) => ({
    file: state.file,
    sceneBounds: state.sceneBounds,
    meshCount: state.meshCount,
    vertexCount: state.vertexCount,
    triangleCount: state.triangleCount
  })),
  comparison: {
    matchedCount: report.comparison.matchedCount,
    changedCount: report.comparison.changedCount,
    unchangedCount: report.comparison.unchangedCount,
    onlyA: report.comparison.onlyA.length,
    onlyB: report.comparison.onlyB.length,
    changed: report.comparison.changed.map((entry) => ({
      name: entry.name,
      vertices: entry.vertices,
      positionDelta: entry.positionDelta,
      centerDelta: entry.centerDelta,
      aBounds: entry.a.worldBounds,
      bBounds: entry.b.worldBounds
    }))
  }
}, null, 2));
