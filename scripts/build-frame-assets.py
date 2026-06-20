from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, Sequence

import ezdxf
from ezdxf import bbox


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DWG_TOOL = ROOT.parent
FRAME_SOURCE_DWG_NAME = "392e2df6-537d-41a9-8317-095ae1d9ace7.dwg"
DEFAULT_SOURCE_DWG = Path.home() / "Desktop" / "dwg\u6587\u4ef6\u5408\u96c6" / FRAME_SOURCE_DWG_NAME
DEFAULT_OUTPUT_DIR = ROOT / "public" / "assets" / "frame"
REFERENCE_2D_DWG_NAME = "2D_USM_export.dwg"
VALIDATION_DWG_NAMES = ("sec.dwg", "xiafan1.dwg", "xiafan2.dwg", "xiafan3.dwg", "gudin4.dwg", "gudin5.dwg")
VALIDATION_BLOCK_PREFIXES = ("rohr350", "rohr750", "kugel_std")

SCALE = 0.004
DWG_UNIT_TO_SCENE = 10 * SCALE
TUBE_RADIUS = 0.95 * DWG_UNIT_TO_SCENE
BALL_RADIUS = 116.97973 * 0.01 * DWG_UNIT_TO_SCENE
TUBE_350_TEMPLATE_LENGTH = 350 * SCALE
TUBE_750_TEMPLATE_LENGTH = 750 * SCALE

MATERIAL_BY_LAYER = {
    "chrom": "chrome",
    "0": "chrome",
}

OFFICIAL_LAYER_APPEARANCE = {
    "chrom": {"aci": 9, "trueColor": "#BEBEBE", "role": "chrome plated frame hardware"},
    "Metall verzinkt": {"aci": 8, "trueColor": "#6F6F6F", "role": "galvanized metal hardware"},
    "plastik schwarz": {"aci": 250, "trueColor": "#282828", "role": "black plastic feet/caps"},
    "reinweiss": {"aci": 254, "trueColor": "#DDDDDD", "role": "white painted panels"},
}

MATERIALS = {
    "chrome": {
        "baseColorFactor": [0.86, 0.86, 0.84, 1],
        "metallicFactor": 0.08,
        "roughnessFactor": 0.54,
    },
    "default": {
        "baseColorFactor": [0.74, 0.76, 0.78, 1],
        "metallicFactor": 0.65,
        "roughnessFactor": 0.28,
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_tool(command: Path, *args: Path | str) -> str:
    result = subprocess.run(
        [str(command), *[str(arg) for arg in args]],
        cwd=str(ROOT),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{command.name} failed with exit code {result.returncode}\n{result.stderr.strip()}")
    return result.stdout.strip()


def compact_dwg_json_summary(raw: dict, source: Path) -> dict:
    subclass_counts: Counter[str] = Counter()
    block_names: set[str] = set()
    insert_names: Counter[str] = Counter()
    target_block_names: list[str] = []

    def visit(value):
        if isinstance(value, dict):
            subclass = value.get("_subclass")
            if isinstance(subclass, str):
                subclass_counts[subclass] += 1
                name = value.get("name")
                if isinstance(name, str):
                    if subclass in {"AcDbBlockBegin", "AcDbBlockTableRecord"}:
                        block_names.add(name)
                    if subclass == "AcDbBlockReference":
                        insert_names[name] += 1
                    if any(name.startswith(prefix) for prefix in VALIDATION_BLOCK_PREFIXES):
                        target_block_names.append(name)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(raw)
    return {
        "source": str(source),
        "format": "dwgread-json-compact",
        "createdBy": raw.get("created_by"),
        "version": raw.get("FILEHEADER", {}).get("version"),
        "objectCount": len(raw.get("OBJECTS", [])),
        "subclassCounts": dict(sorted(subclass_counts.items())),
        "blockDefinitionCountReturned": len(block_names),
        "targetBlockNames": sorted(set(target_block_names)),
        "targetInsertNames": dict(sorted((name, count) for name, count in insert_names.items() if any(name.startswith(prefix) for prefix in VALIDATION_BLOCK_PREFIXES))),
    }


def read_dwg_summary(tool_dir: Path, dwg_path: Path) -> dict:
    output_path = Path(tempfile.mkdtemp(prefix="usm-frame-dwgread-json-")) / "frame-source.json"
    run_tool(tool_dir / "dwgread.cmd", "-O", "JSON", "-o", output_path, dwg_path)
    return compact_dwg_json_summary(json.loads(output_path.read_text(encoding="utf-8")), dwg_path)


def read_dwg_layers(tool_dir: Path, dwg_path: Path) -> list[str]:
    return [line.strip() for line in run_tool(tool_dir / "dwglayers.cmd", dwg_path).splitlines() if line.strip()]


def convert_dwg_to_dxf(tool_dir: Path, dwg_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "frame-source.dxf"
    run_tool(tool_dir / "dwg2dxf.cmd", "-y", "-o", out_path, dwg_path)
    if not out_path.exists():
        raise FileNotFoundError(out_path)
    return out_path


def resolve_source_dwg(path: Path) -> Path:
    if path.exists():
        return path
    desktop = Path.home() / "Desktop"
    matches = sorted(desktop.glob(f"**/{path.name}"))
    if matches:
        return matches[0]
    return path


def block_matches(name: str, names: Iterable[str]) -> bool:
    return name in set(names)


def virtual_entities_recursive(entity, depth: int = 0):
    if depth > 12:
        return
    if entity.dxftype() != "INSERT":
        yield entity
        return
    for virtual in entity.virtual_entities():
        if virtual.dxftype() == "INSERT":
            yield from virtual_entities_recursive(virtual, depth + 1)
        else:
            yield virtual


def collect_virtual_entities(doc, block_names: Iterable[str]):
    entities = []
    inserts = []
    for block_name in block_names:
        block = doc.blocks.get(block_name)
        if block is None:
            continue
        for entity in block:
            if entity.dxftype() == "INSERT":
                inserts.append(entity)
            entities.extend(list(virtual_entities_recursive(entity)))
    return inserts, entities


def rounded_vector(vector) -> list[float]:
    return [round(float(vector.x), 6), round(float(vector.y), 6), round(float(vector.z), 6)]


def get_block_bbox(entities: Sequence) -> dict | None:
    if not entities:
        return None
    box = bbox.extents(entities)
    return {
        "min": rounded_vector(box.extmin),
        "max": rounded_vector(box.extmax),
        "size": rounded_vector(box.size),
    }


def triangle_normal(a: tuple[float, float, float], b: tuple[float, float, float], c: tuple[float, float, float]) -> tuple[float, float, float]:
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    normal = (
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    )
    length = math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
    if length < 1e-9:
        return (0.0, 1.0, 0.0)
    return (normal[0] / length, normal[1] / length, normal[2] / length)


def normalize_vector(vector: tuple[float, float, float], fallback: tuple[float, float, float] = (0.0, 1.0, 0.0)) -> tuple[float, float, float]:
    length = math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2)
    if length < 1e-9:
        return fallback
    return (vector[0] / length, vector[1] / length, vector[2] / length)


def dot_vector(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def same_point(a, b) -> bool:
    return abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9 and abs(a[2] - b[2]) < 1e-9


def material_name_for_layer(layer: str) -> str:
    return MATERIAL_BY_LAYER.get(layer, "default")


def transform_tube_vertex(vertex, bounds: dict, template_length: float) -> tuple[float, float, float]:
    center_x = (bounds["min"][0] + bounds["max"][0]) / 2
    center_y = (bounds["min"][1] + bounds["max"][1]) / 2
    center_z = (bounds["min"][2] + bounds["max"][2]) / 2
    size = bounds["size"]
    radius_scale = TUBE_RADIUS / max(size[0] / 2, size[2] / 2)
    length_scale = template_length / size[1] if abs(size[1]) > 1e-9 else 1
    return (
        (float(vertex.x) - center_x) * radius_scale,
        (float(vertex.y) - center_y) * length_scale,
        (float(vertex.z) - center_z) * radius_scale,
    )


def transform_ball_vertex(vertex, bounds: dict) -> tuple[float, float, float]:
    center_x = (bounds["min"][0] + bounds["max"][0]) / 2
    center_y = (bounds["min"][1] + bounds["max"][1]) / 2
    center_z = (bounds["min"][2] + bounds["max"][2]) / 2
    radius_scale = BALL_RADIUS / max(bounds["size"][0] / 2, bounds["size"][1] / 2, bounds["size"][2] / 2)
    return (
        (float(vertex.x) - center_x) * radius_scale,
        (float(vertex.z) - center_z) * radius_scale,
        (float(vertex.y) - center_y) * radius_scale,
    )


def tube_normal(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return normalize_vector((point[0], 0.0, point[2]))


def ball_normal(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return normalize_vector(point)


def collect_triangles(entities: Sequence, transform, smooth_normal):
    by_material: dict[str, list[tuple[tuple[tuple[float, float, float], tuple[float, float, float]], ...]]] = defaultdict(list)

    def append_triangle(material: str, a: tuple[float, float, float], b: tuple[float, float, float], c: tuple[float, float, float]):
        if smooth_normal:
            normals = (smooth_normal(a), smooth_normal(b), smooth_normal(c))
            face_normal = triangle_normal(a, b, c)
            average_normal = normalize_vector((
                normals[0][0] + normals[1][0] + normals[2][0],
                normals[0][1] + normals[1][1] + normals[2][1],
                normals[0][2] + normals[1][2] + normals[2][2],
            ), normals[0])
            if dot_vector(face_normal, average_normal) < 0:
                b, c = c, b
                normals = (normals[0], normals[2], normals[1])
        else:
            face_normal = triangle_normal(a, b, c)
            normals = (face_normal, face_normal, face_normal)
        by_material[material].append(((a, normals[0]), (b, normals[1]), (c, normals[2])))

    for entity in entities:
        if entity.dxftype() != "3DFACE":
            continue
        vertices = [
            transform(entity.dxf.vtx0),
            transform(entity.dxf.vtx1),
            transform(entity.dxf.vtx2),
            transform(entity.dxf.vtx3),
        ]
        material = material_name_for_layer(entity.dxf.layer)
        if not same_point(vertices[0], vertices[1]) and not same_point(vertices[1], vertices[2]) and not same_point(vertices[2], vertices[0]):
            append_triangle(material, vertices[0], vertices[1], vertices[2])
        if not same_point(vertices[2], vertices[3]) and not same_point(vertices[3], vertices[0]) and not same_point(vertices[0], vertices[2]):
            append_triangle(material, vertices[0], vertices[2], vertices[3])
    return by_material


def pad4(data: bytes, pad: bytes = b"\x00") -> bytes:
    return data + (pad * ((4 - len(data) % 4) % 4))


def append_floats(buffer: bytearray, values: list[float]) -> tuple[int, int]:
    offset = len(buffer)
    buffer.extend(struct.pack("<" + "f" * len(values), *values))
    return offset, len(values) * 4


def write_glb(path: Path, triangles_by_material: dict[str, list[tuple]], extras: dict, node_name: str):
    buffer = bytearray()
    buffer_views = []
    accessors = []
    primitives = []
    material_names = list(MATERIALS.keys())

    for material_name, triangles in triangles_by_material.items():
        if not triangles:
            continue
        positions: list[float] = []
        normals: list[float] = []
        min_position = [float("inf"), float("inf"), float("inf")]
        max_position = [float("-inf"), float("-inf"), float("-inf")]

        for tri in triangles:
            for point, normal in tri:
                positions.extend(point)
                normals.extend(normal)
                for index in range(3):
                    min_position[index] = min(min_position[index], point[index])
                    max_position[index] = max(max_position[index], point[index])

        pos_offset, pos_length = append_floats(buffer, positions)
        buffer_views.append({"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_length, "target": 34962})
        accessors.append({
            "bufferView": len(buffer_views) - 1,
            "componentType": 5126,
            "count": len(positions) // 3,
            "type": "VEC3",
            "min": min_position,
            "max": max_position,
        })
        position_accessor = len(accessors) - 1

        normal_offset, normal_length = append_floats(buffer, normals)
        buffer_views.append({"buffer": 0, "byteOffset": normal_offset, "byteLength": normal_length, "target": 34962})
        accessors.append({
            "bufferView": len(buffer_views) - 1,
            "componentType": 5126,
            "count": len(normals) // 3,
            "type": "VEC3",
        })
        normal_accessor = len(accessors) - 1

        primitives.append({
            "attributes": {
                "POSITION": position_accessor,
                "NORMAL": normal_accessor,
            },
            "material": material_names.index(material_name),
            "mode": 4,
        })

    if not primitives:
        raise RuntimeError(f"No triangles were collected for {node_name}")

    bin_chunk = pad4(bytes(buffer))
    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "scripts/build-frame-assets.py",
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": node_name}],
        "meshes": [{"name": node_name, "primitives": primitives}],
        "materials": [
            {
                "name": name,
                "pbrMetallicRoughness": values,
                "doubleSided": True,
            }
            for name, values in MATERIALS.items()
        ],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "extras": extras,
    }

    json_chunk = pad4(json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), b" ")
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    with path.open("wb") as stream:
        stream.write(struct.pack("<III", 0x46546C67, 2, total_length))
        stream.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
        stream.write(json_chunk)
        stream.write(struct.pack("<I4s", len(bin_chunk), b"BIN\x00"))
        stream.write(bin_chunk)


def dxf_entity_counts(doc) -> dict[str, int]:
    return dict(Counter(entity.dxftype() for entity in doc.modelspace()))


def entity_counts(entities: Sequence) -> dict[str, int]:
    return dict(Counter(entity.dxftype() for entity in entities))


def block_summary(block_names: tuple[str, ...], inserts: Sequence, entities: Sequence) -> dict:
    return {
        "blockNames": list(block_names),
        "insertNames": sorted(Counter(insert.dxf.name for insert in inserts).items()),
        "insertCount": len(inserts),
        "entityCounts": entity_counts(entities),
        "bbox": get_block_bbox(entities),
    }


def validation_block_summary(doc, prefix: str) -> dict | None:
    block_names = sorted(block.name for block in doc.blocks if block.name.startswith(prefix))
    if not block_names:
        return None
    inserts, entities = collect_virtual_entities(doc, block_names)
    bounds = get_block_bbox(entities)
    if not bounds:
        return None
    return {
        "blockCount": len(block_names),
        "sampleBlocks": block_names[:8],
        "insertNames": sorted(Counter(insert.dxf.name for insert in inserts).items()),
        "entityCounts": entity_counts(entities),
        "bboxSize": bounds["size"],
    }


def build_validation_sources(tool_dir: Path, source_dwg: Path, work_dir: Path) -> list[dict]:
    summaries = []
    source_dir = source_dwg.parent
    for name in VALIDATION_DWG_NAMES:
        path = source_dir / name
        if not path.exists():
            continue
        dxf_path = convert_dwg_to_dxf(tool_dir, path, work_dir / f"validation-{path.stem}")
        doc = ezdxf.readfile(dxf_path)
        summaries.append({
            "path": str(path),
            "sha256": sha256(path),
            "layers": read_dwg_layers(tool_dir, path),
            "blocks": {
                prefix: summary
                for prefix in VALIDATION_BLOCK_PREFIXES
                if (summary := validation_block_summary(doc, prefix)) is not None
            },
        })
    return summaries


def build_reference_2d_summary(tool_dir: Path, source_dwg: Path) -> dict | None:
    path = source_dwg.parent / REFERENCE_2D_DWG_NAME
    if not path.exists():
        return None
    return {
        "path": str(path),
        "sha256": sha256(path),
        "layers": read_dwg_layers(tool_dir, path),
        "usage": "2D layer and structure reference only; not used for generated 3D frame geometry.",
    }


def build_assets(args: argparse.Namespace):
    tool_dir = Path(args.tool_dir)
    source_dwg = resolve_source_dwg(Path(args.source_dwg))
    target_dir = Path(args.out_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    if not (tool_dir / "dwgread.cmd").exists() or not (tool_dir / "dwglayers.cmd").exists() or not (tool_dir / "dwg2dxf.cmd").exists():
        raise FileNotFoundError(f"DWG tools were not found in {tool_dir}")
    if not source_dwg.exists():
        raise FileNotFoundError(source_dwg)

    work_dir = Path(tempfile.mkdtemp(prefix="usm-frame-assets-"))
    dxf_dir = target_dir / "dxf"
    dxf_dir.mkdir(parents=True, exist_ok=True)

    dwg_summary = read_dwg_summary(tool_dir, source_dwg)
    dwg_layers = read_dwg_layers(tool_dir, source_dwg)
    source_dxf = convert_dwg_to_dxf(tool_dir, source_dwg, work_dir / "frame")
    frame_dxf = dxf_dir / "frame-source.dxf"
    shutil.copy2(source_dxf, frame_dxf)

    doc = ezdxf.readfile(frame_dxf)
    tube_350_inserts, tube_350_entities = collect_virtual_entities(doc, ("rohr350_15KC3LS",))
    tube_750_inserts, tube_750_entities = collect_virtual_entities(doc, ("rohr750_15KC3LS",))
    ball_inserts, ball_entities = collect_virtual_entities(doc, ("kugel_std_15KC3LS",))

    tube_350_bounds = get_block_bbox(tube_350_entities)
    tube_750_bounds = get_block_bbox(tube_750_entities)
    ball_bounds = get_block_bbox(ball_entities)
    if not tube_350_bounds or not tube_750_bounds or not ball_bounds:
        raise RuntimeError("Expected frame blocks were not found in the source DXF.")
    validation_sources = build_validation_sources(tool_dir, source_dwg, work_dir)
    reference_2d = build_reference_2d_summary(tool_dir, source_dwg)

    write_glb(
        target_dir / "tube-350.glb",
        collect_triangles(tube_350_entities, lambda vertex: transform_tube_vertex(vertex, tube_350_bounds, TUBE_350_TEMPLATE_LENGTH), tube_normal),
        {"source": source_dwg.name, "block": "rohr350_15KC3LS", "sourceGeometryBlock": "GeometrySelector_15KC3LS12", "bounds": tube_350_bounds, "templateLength": TUBE_350_TEMPLATE_LENGTH},
        "usm-frame-tube-350",
    )
    write_glb(
        target_dir / "tube-750.glb",
        collect_triangles(tube_750_entities, lambda vertex: transform_tube_vertex(vertex, tube_750_bounds, TUBE_750_TEMPLATE_LENGTH), tube_normal),
        {"source": source_dwg.name, "block": "rohr750_15KC3LS", "sourceGeometryBlock": "GeometrySelector_15KC3LS13", "bounds": tube_750_bounds, "templateLength": TUBE_750_TEMPLATE_LENGTH},
        "usm-frame-tube-750",
    )
    write_glb(
        target_dir / "ball.glb",
        collect_triangles(ball_entities, lambda vertex: transform_ball_vertex(vertex, ball_bounds), ball_normal),
        {"source": source_dwg.name, "block": "kugel_std_15KC3LS", "sourceGeometryBlock": "GeometrySelector_15KC3LS14", "bounds": ball_bounds, "radius": BALL_RADIUS},
        "usm-frame-ball",
    )

    manifest = {
        "id": "usm-frame-official-dwg-assets",
        "sourceFiles": {
            "frame3d": {
                "path": str(source_dwg),
                "sha256": sha256(source_dwg),
            },
        },
        "dwgReadSummary": dwg_summary,
        "dwgLayers": dwg_layers,
        "validationSources": validation_sources,
        "reference2d": reference_2d,
        "generatedFiles": {
            "tube350": "tube-350.glb",
            "tube750": "tube-750.glb",
            "ball": "ball.glb",
            "sourceDxf": "dxf/frame-source.dxf",
        },
        "templateSceneSize": {
            "scale": SCALE,
            "dwgUnitToScene": DWG_UNIT_TO_SCENE,
            "tubeRadius": TUBE_RADIUS,
            "ballRadius": BALL_RADIUS,
            "tube350Length": TUBE_350_TEMPLATE_LENGTH,
            "tube750Length": TUBE_750_TEMPLATE_LENGTH,
        },
        "officialLayerAppearance": OFFICIAL_LAYER_APPEARANCE,
        "coordinateMapping": {
            "dwgX": "radial X around local tube Y axis",
            "dwgZ": "local tube Y axis / scene vertical for ball normalization",
            "dwgY": "radial Z around local tube Y axis",
        },
        "blocks": {
            "tube350": block_summary(("rohr350_15KC3LS",), tube_350_inserts, tube_350_entities),
            "tube750": block_summary(("rohr750_15KC3LS",), tube_750_inserts, tube_750_entities),
            "ball": block_summary(("kugel_std_15KC3LS",), ball_inserts, ball_entities),
        },
    }

    conversion_summary = {
        "frameDwgRead": dwg_summary,
        "frameDwgLayers": dwg_layers,
        "frameDxfEntityCounts": dxf_entity_counts(doc),
        "frameDxfLayers": [layer.dxf.name for layer in doc.layers],
        "validationSources": validation_sources,
        "reference2d": reference_2d,
        "assetFiles": ["tube-350.glb", "tube-750.glb", "ball.glb"],
        "recursiveInsertExpansion": True,
    }

    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target_dir / "conversion-summary.json").write_text(json.dumps(conversion_summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "outDir": str(target_dir),
        "assets": conversion_summary["assetFiles"],
        "templateSceneSize": manifest["templateSceneSize"],
        "blocks": manifest["blocks"],
    }, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local GLB assets for USM frame tubes and balls from official DWG references.")
    parser.add_argument("--tool-dir", default=str(DEFAULT_DWG_TOOL), help="Directory containing dwgread.cmd, dwglayers.cmd, and dwg2dxf.cmd.")
    parser.add_argument("--source-dwg", default=str(DEFAULT_SOURCE_DWG), help="Official frame/cabinet DWG containing rohr and kugel blocks.")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory for generated frame assets.")
    return parser.parse_args()


if __name__ == "__main__":
    build_assets(parse_args())
