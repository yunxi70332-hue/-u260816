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
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import ezdxf
from ezdxf import bbox


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DWG_TOOL = ROOT.parent

TEMPLATE_PANEL_WIDTH = 2.9
TEMPLATE_PANEL_HEIGHT = 1.3
TEMPLATE_PANEL_THICKNESS = 0.035

MATERIAL_BY_LAYER = {
    "reinweiss": "panel",
    "chrom": "chrome",
    "Metall verzinkt": "galvanized",
    "plastik schwarz": "black",
    "Part with no material": "default",
}

MATERIALS = {
    "panel": {
        "baseColorFactor": [0.96, 0.95, 0.9, 1],
        "metallicFactor": 0.08,
        "roughnessFactor": 0.42,
    },
    "chrome": {
        "baseColorFactor": [0.78, 0.82, 0.86, 1],
        "metallicFactor": 1,
        "roughnessFactor": 0.16,
    },
    "galvanized": {
        "baseColorFactor": [0.55, 0.58, 0.6, 1],
        "metallicFactor": 0.88,
        "roughnessFactor": 0.26,
    },
    "black": {
        "baseColorFactor": [0.025, 0.028, 0.032, 1],
        "metallicFactor": 0.28,
        "roughnessFactor": 0.35,
    },
    "default": {
        "baseColorFactor": [0.74, 0.76, 0.78, 1],
        "metallicFactor": 0.65,
        "roughnessFactor": 0.28,
    },
}


@dataclass(frozen=True)
class DoorSpec:
    id: str
    source_label: str
    output_dir: Path
    front_dwg_name: str
    flat_dwg_name: str
    front_dxf_name: str
    flat_dxf_name: str
    panel_prefixes: tuple[str, ...]
    lock_prefixes: tuple[str, ...]
    hardware_prefixes: tuple[str, ...]
    generated_files: dict[str, str]
    door_angles: dict[str, float]


DOOR_SPECS = {
    "drop": DoorSpec(
        id="drop",
        source_label="usm-drop-door-dwg-front",
        output_dir=ROOT / "public" / "assets" / "drop-door",
        front_dwg_name="下翻门前脸.dwg",
        flat_dwg_name="下翻门2D前脸.dwg",
        front_dxf_name="drop-door-front.dxf",
        flat_dxf_name="drop-door-2d-front.dxf",
        panel_prefixes=("tuerelement750_350",),
        lock_prefixes=("griff_normal",),
        hardware_prefixes=("stdklemmhalter",),
        generated_files={
            "assembly": "drop-door-assembly.glb",
            "panel": "drop-door-panel.glb",
            "lock": "drop-door-lock.glb",
            "hinges": "drop-door-hinges.glb",
        },
        door_angles={
            "closed": 0,
            "legacyHalf": math.pi * 0.24,
            "open": math.pi / 2,
        },
    ),
    "flip-up": DoorSpec(
        id="flip-up",
        source_label="usm-flip-up-door-dwg-front",
        output_dir=ROOT / "public" / "assets" / "flip-up-door",
        front_dwg_name="上翻门3D.dwg",
        flat_dwg_name="上翻门2D.dwg",
        front_dxf_name="flip-up-door-3d.dxf",
        flat_dxf_name="flip-up-door-2d.dxf",
        panel_prefixes=("einschubtuer350",),
        lock_prefixes=("griff_normal",),
        hardware_prefixes=("stdklemmhalter", "einschubtuergelenk", "einschubtuerhalter"),
        generated_files={
            "assembly": "flip-up-door-assembly.glb",
            "panel": "panel.glb",
            "lock": "lock.glb",
            "hinges": "hinges.glb",
        },
        door_angles={
            "closed": 0,
            "open": -math.pi * 0.48,
        },
    ),
}

COMBO_OUTPUT_DIR = ROOT / "public" / "assets" / "door-interior-combo"
COMBO_3D_DWG_NAME = "红色配件下翻门存在时候可以新加移动托盘配件3D.dwg"
COMBO_2D_DWG_NAME = "红色配件下翻门存在时候可以新加移动托盘配件2D.dwg"
COMBO_BLOCK_GROUPS = {
    "dropDoorPanel": ("tuerelement750_350",),
    "dropDoorLock": ("griff_normal",),
    "dropDoorHardware": ("stdklemmhalter",),
    "mobileTray": ("ausziehtablar750_350",),
    "mobileTraySideAngles": ("tablarseitenwinkel350_l", "tablarseitenwinkel350_r"),
    "mobileTrayLockRod": ("sperrstange_90",),
}
COMBO_GENERATED_FILES = {
    'mobileTraySingle': 'mobile-tray-single.glb',
    'mobileTrayRailsSingle': 'mobile-tray-rails-single.glb',
    "assembly": "drop-door-mobile-tray-assembly.glb",
    "dropDoor": "drop-door.glb",
    "mobileTray": "mobile-tray.glb",
    "mobileTrayRails": "mobile-tray-rails.glb",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_desktop_file(filename: str) -> Path:
    desktop = Path.home() / "Desktop"
    direct = desktop / filename
    if direct.exists():
        return direct
    matches = sorted(desktop.glob(f"*{Path(filename).suffix}"))
    for match in matches:
        if match.name == filename:
            return match
    raise FileNotFoundError(direct)


def run_tool(command: Path, *args: Path | str, cwd: Path | None = None) -> str:
    result = subprocess.run(
        [str(command), *[str(arg) for arg in args]],
        cwd=str(cwd or ROOT),
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
    layers: dict[str, dict] = {}
    block_names: set[str] = set()
    text_samples: list[str] = []

    def visit(value):
        if isinstance(value, dict):
            subclass = value.get("_subclass")
            if isinstance(subclass, str):
                subclass_counts[subclass] += 1
                name = value.get("name")
                if subclass == "AcDbLayerTableRecord" and isinstance(name, str):
                    layers[name] = {
                        "name": name,
                        "color": value.get("color"),
                        "linetype": value.get("linetype"),
                    }
                if subclass in {"AcDbBlockBegin", "AcDbBlockTableRecord"} and isinstance(name, str):
                    block_names.add(name)
                if subclass in {"AcDbText", "AcDbMText"}:
                    for key in ("text", "text_value", "value", "contents"):
                        text = value.get(key)
                        if isinstance(text, str) and text and len(text_samples) < 20:
                            text_samples.append(text)
                            break
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(raw)
    return {
        "source": str(source),
        "format": "dwgread-json-compact",
        "version": raw.get("FILEHEADER", {}).get("version"),
        "layerCount": len(layers),
        "layers": sorted(layers.values(), key=lambda layer: layer["name"]),
        "subclassCounts": dict(sorted(subclass_counts.items())),
        "blockDefinitionCountReturned": len(block_names),
        "blockDefinitionNames": sorted(block_names)[:240],
        "textCountReturned": len(text_samples),
        "texts": text_samples,
    }


def read_dwg_summary(tool_dir: Path, dwg_path: Path) -> dict:
    legacy_reader = tool_dir / "read-dwg.cmd"
    local_reader = tool_dir / "dwgread.cmd"
    if legacy_reader.exists():
        output = run_tool(legacy_reader, dwg_path)
        return json.loads(output)
    if local_reader.exists():
        output_path = Path(tempfile.mkdtemp(prefix="usm-dwgread-json-")) / "summary.json"
        run_tool(local_reader, "-O", "JSON", "-o", output_path, dwg_path)
        return compact_dwg_json_summary(json.loads(output_path.read_text(encoding="utf-8")), dwg_path)
    raise FileNotFoundError(f"No DWG reader was found in {tool_dir}")


def convert_dwg_to_dxf(tool_dir: Path, dwg_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    converter = tool_dir / "dwg2dxf.cmd"
    if not converter.exists():
        raise FileNotFoundError(converter)
    legacy_reader = tool_dir / "read-dwg.cmd"
    if legacy_reader.exists():
        run_tool(converter, dwg_path, out_dir)
    else:
        # LibreDWG's dwg2dxf writes the DXF beside the current process rather
        # than honoring an output filename, so run it from the desired folder.
        run_tool(converter, dwg_path, cwd=out_dir)
    matches = sorted(out_dir.glob("*.dxf"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not matches:
        raise FileNotFoundError(f"No DXF file was generated in {out_dir}")
    return matches[0]


def rounded_vector(vector) -> list[float]:
    return [round(float(vector.x), 6), round(float(vector.y), 6), round(float(vector.z), 6)]


def block_matches(name: str, prefixes: Iterable[str]) -> bool:
    return any(name.startswith(prefix) for prefix in prefixes)


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


def collect_virtual_entities(doc, prefixes: Iterable[str]):
    entities = []
    inserts = []
    for entity in doc.modelspace():
        if entity.dxftype() != "INSERT":
            continue
        name = entity.dxf.name
        if block_matches(name, prefixes):
            inserts.append(entity)
            entities.extend(list(virtual_entities_recursive(entity)))
    return inserts, entities


def collect_virtual_entity_groups(doc, prefixes: Iterable[str]):
    groups = []
    for entity in doc.modelspace():
        if entity.dxftype() != 'INSERT':
            continue
        name = entity.dxf.name
        if block_matches(name, prefixes):
            groups.append((entity, list(virtual_entities_recursive(entity))))
    return groups


def get_block_bbox(entities: Sequence) -> dict | None:
    if not entities:
        return None
    box = bbox.extents(entities)
    return {
        "min": rounded_vector(box.extmin),
        "max": rounded_vector(box.extmax),
        "size": rounded_vector(box.size),
    }


def bbox_center(bounds: dict | None) -> tuple[float, float, float]:
    if not bounds:
        return (0.0, 0.0, 0.0)
    return tuple((bounds['min'][index] + bounds['max'][index]) / 2 for index in range(3))


def entity_group_center(group) -> tuple[float, float, float]:
    return bbox_center(get_block_bbox(group[1]))


def nearest_entity_groups(center: tuple[float, float, float], groups, count: int):
    def distance_sq(group) -> float:
        group_center = entity_group_center(group)
        return sum((group_center[index] - center[index]) ** 2 for index in range(3))

    return sorted(groups, key=distance_sq)[:count]


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
        return (0.0, 0.0, 1.0)
    return (normal[0] / length, normal[1] / length, normal[2] / length)


def same_point(a, b) -> bool:
    return abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9 and abs(a[2] - b[2]) < 1e-9


def transform_vertex(vertex, panel_bounds: dict) -> tuple[float, float, float]:
    panel_size = panel_bounds["size"]
    panel_center_x = (panel_bounds["min"][0] + panel_bounds["max"][0]) / 2
    panel_center_depth = (panel_bounds["min"][1] + panel_bounds["max"][1]) / 2
    scale_x = TEMPLATE_PANEL_WIDTH / panel_size[0] if abs(panel_size[0]) > 1e-9 else 1
    scale_y = TEMPLATE_PANEL_HEIGHT / panel_size[2] if abs(panel_size[2]) > 1e-9 else 1
    scale_z = TEMPLATE_PANEL_THICKNESS / panel_size[1] if abs(panel_size[1]) > 1e-9 else 1
    return (
        (float(vertex.x) - panel_center_x) * scale_x,
        (float(vertex.z) - panel_bounds["min"][2]) * scale_y,
        -(float(vertex.y) - panel_center_depth) * scale_z,
    )


def material_name_for_layer(layer: str) -> str:
    return MATERIAL_BY_LAYER.get(layer, "default")


def collect_triangles(entities: Sequence, panel_bounds: dict):
    by_material: dict[str, list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]] = defaultdict(list)
    for entity in entities:
        if entity.dxftype() != "3DFACE":
            continue
        vertices = [
            transform_vertex(entity.dxf.vtx0, panel_bounds),
            transform_vertex(entity.dxf.vtx1, panel_bounds),
            transform_vertex(entity.dxf.vtx2, panel_bounds),
            transform_vertex(entity.dxf.vtx3, panel_bounds),
        ]
        material = material_name_for_layer(entity.dxf.layer)
        if not same_point(vertices[0], vertices[1]) and not same_point(vertices[1], vertices[2]) and not same_point(vertices[2], vertices[0]):
            by_material[material].append((vertices[0], vertices[1], vertices[2]))
        if not same_point(vertices[2], vertices[3]) and not same_point(vertices[3], vertices[0]) and not same_point(vertices[0], vertices[2]):
            by_material[material].append((vertices[0], vertices[2], vertices[3]))
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
            normal = triangle_normal(*tri)
            for point in tri:
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

    bin_chunk = pad4(bytes(buffer))
    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "scripts/build-drop-door-assets.py",
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


def block_summary(prefixes: tuple[str, ...], inserts: Sequence, entities: Sequence) -> dict:
    return {
        "prefixes": list(prefixes),
        "insertNames": sorted(Counter(insert.dxf.name for insert in inserts).items()),
        "insertCount": len(inserts),
        "entityCounts": entity_counts(entities),
        "bbox": get_block_bbox(entities),
    }


def build_one(spec: DoorSpec, tool_dir: Path, front_dwg: Path | None = None, flat_dwg: Path | None = None, out_dir: Path | None = None) -> dict:
    target_dir = out_dir or spec.output_dir
    source_front = front_dwg or resolve_desktop_file(spec.front_dwg_name)
    source_flat = flat_dwg or resolve_desktop_file(spec.flat_dwg_name)
    target_dir.mkdir(parents=True, exist_ok=True)

    if not ((tool_dir / "read-dwg.cmd").exists() or (tool_dir / "dwgread.cmd").exists()) or not (tool_dir / "dwg2dxf.cmd").exists():
        raise FileNotFoundError(f"DWG tools were not found in {tool_dir}")
    for source in (source_front, source_flat):
        if not source.exists():
            raise FileNotFoundError(source)

    work_dir = Path(tempfile.mkdtemp(prefix=f"usm-{spec.id}-door-assets-"))
    dxf_dir = target_dir / "dxf"
    dxf_dir.mkdir(parents=True, exist_ok=True)

    front_summary = read_dwg_summary(tool_dir, source_front)
    flat_summary = read_dwg_summary(tool_dir, source_flat)
    front_dxf = convert_dwg_to_dxf(tool_dir, source_front, work_dir / "front")
    flat_dxf = convert_dwg_to_dxf(tool_dir, source_flat, work_dir / "flat")

    front_dxf_out = dxf_dir / spec.front_dxf_name
    flat_dxf_out = dxf_dir / spec.flat_dxf_name
    shutil.copy2(front_dxf, front_dxf_out)
    shutil.copy2(flat_dxf, flat_dxf_out)

    doc = ezdxf.readfile(front_dxf_out)
    flat_doc = ezdxf.readfile(flat_dxf_out)
    panel_inserts, panel_entities = collect_virtual_entities(doc, spec.panel_prefixes)
    lock_inserts, lock_entities = collect_virtual_entities(doc, spec.lock_prefixes)
    hardware_inserts, hardware_entities = collect_virtual_entities(doc, spec.hardware_prefixes)
    panel_bounds = get_block_bbox(panel_entities)
    if not panel_bounds:
        raise RuntimeError(f"No panel block matching {spec.panel_prefixes!r} was found")

    subsets = {
        spec.generated_files["assembly"]: panel_entities + lock_entities + hardware_entities,
        spec.generated_files["panel"]: panel_entities,
        spec.generated_files["lock"]: lock_entities,
        spec.generated_files["hinges"]: hardware_entities,
    }

    summaries = {
        "panel": block_summary(spec.panel_prefixes, panel_inserts, panel_entities),
        "lock": block_summary(spec.lock_prefixes, lock_inserts, lock_entities),
        "hinges": block_summary(spec.hardware_prefixes, hardware_inserts, hardware_entities),
    }

    asset_files = []
    for filename, entities in subsets.items():
        triangles = collect_triangles(entities, panel_bounds)
        output = target_dir / filename
        write_glb(
            output,
            triangles,
            {
                "source": source_front.name,
                "panelBounds": panel_bounds,
                "part": filename.removesuffix(".glb"),
            },
            spec.source_label,
        )
        asset_files.append(filename)

    manifest = {
        "id": spec.source_label,
        "sourceFiles": {
            "front3d": {
                "path": str(source_front),
                "sha256": sha256(source_front),
            },
            "front2d": {
                "path": str(source_flat),
                "sha256": sha256(source_flat),
            },
        },
        "generatedFiles": {
            **spec.generated_files,
            "frontDxf": f"dxf/{spec.front_dxf_name}",
            "front2dDxf": f"dxf/{spec.flat_dxf_name}",
        },
        "templateSceneSize": {
            "panelWidth": TEMPLATE_PANEL_WIDTH,
            "panelHeight": TEMPLATE_PANEL_HEIGHT,
            "panelThickness": TEMPLATE_PANEL_THICKNESS,
        },
        "doorAngles": spec.door_angles,
        "coordinateMapping": {
            "dwgX": "sceneX",
            "dwgZ": "sceneY from door pivot reference",
            "dwgY": "sceneZ, flipped so front face is positive",
        },
        "blocks": summaries,
    }

    conversion_summary = {
        "frontDwgRead": front_summary,
        "front2dDwgRead": flat_summary,
        "frontDxfEntityCounts": dxf_entity_counts(doc),
        "front2dDxfEntityCounts": dxf_entity_counts(flat_doc),
        "frontDxfLayers": [layer.dxf.name for layer in doc.layers],
        "front2dDxfLayers": [layer.dxf.name for layer in flat_doc.layers],
        "assetFiles": asset_files,
        "recursiveInsertExpansion": True,
    }

    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target_dir / "conversion-summary.json").write_text(json.dumps(conversion_summary, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "door": spec.id,
        "outDir": str(target_dir),
        "assets": asset_files,
        "panelBounds": panel_bounds,
        "blocks": summaries,
    }


def build_combo(args: argparse.Namespace) -> dict:
    tool_dir = Path(args.tool_dir)
    target_dir = Path(args.out_dir) if args.out_dir else COMBO_OUTPUT_DIR
    source_3d = Path(args.combo_3d_dwg) if args.combo_3d_dwg else resolve_desktop_file(COMBO_3D_DWG_NAME)
    source_2d = Path(args.combo_2d_dwg) if args.combo_2d_dwg else resolve_desktop_file(COMBO_2D_DWG_NAME)
    target_dir.mkdir(parents=True, exist_ok=True)

    if not ((tool_dir / "read-dwg.cmd").exists() or (tool_dir / "dwgread.cmd").exists()) or not (tool_dir / "dwg2dxf.cmd").exists():
        raise FileNotFoundError(f"DWG tools were not found in {tool_dir}")
    for source in (source_3d, source_2d):
        if not source.exists():
            raise FileNotFoundError(source)

    work_dir = Path(tempfile.mkdtemp(prefix="usm-door-interior-combo-assets-"))
    dxf_dir = target_dir / "dxf"
    dxf_dir.mkdir(parents=True, exist_ok=True)

    summary_3d = read_dwg_summary(tool_dir, source_3d)
    summary_2d = read_dwg_summary(tool_dir, source_2d)
    combo_dxf = convert_dwg_to_dxf(tool_dir, source_3d, work_dir / "combo3d")
    combo_2d_dxf = convert_dwg_to_dxf(tool_dir, source_2d, work_dir / "combo2d")
    combo_dxf_out = dxf_dir / "door-interior-combo-3d.dxf"
    combo_2d_dxf_out = dxf_dir / "door-interior-combo-2d.dxf"
    shutil.copy2(combo_dxf, combo_dxf_out)
    shutil.copy2(combo_2d_dxf, combo_2d_dxf_out)

    doc = ezdxf.readfile(combo_dxf_out)
    flat_doc = ezdxf.readfile(combo_2d_dxf_out)
    collected = {}
    summaries = {}
    for key, prefixes in COMBO_BLOCK_GROUPS.items():
      inserts, entities = collect_virtual_entities(doc, prefixes)
      collected[key] = entities
      summaries[key] = block_summary(prefixes, inserts, entities)

    mobile_tray_groups = collect_virtual_entity_groups(doc, COMBO_BLOCK_GROUPS['mobileTray'])
    side_angle_groups = collect_virtual_entity_groups(doc, COMBO_BLOCK_GROUPS['mobileTraySideAngles'])
    lock_rod_groups = collect_virtual_entity_groups(doc, COMBO_BLOCK_GROUPS['mobileTrayLockRod'])
    single_mobile_tray = mobile_tray_groups[0][1] if mobile_tray_groups else []
    single_tray_center = entity_group_center(mobile_tray_groups[0]) if mobile_tray_groups else (0.0, 0.0, 0.0)
    single_side_angles = [entity for _, group in nearest_entity_groups(single_tray_center, side_angle_groups, 2) for entity in group]
    single_lock_rods = [entity for _, group in nearest_entity_groups(single_tray_center, lock_rod_groups, 1) for entity in group]

    panel_bounds = get_block_bbox(collected["dropDoorPanel"] or collected["mobileTray"])
    if not panel_bounds:
        raise RuntimeError("No usable combo block bounds were found")

    subsets = {
        COMBO_GENERATED_FILES['mobileTraySingle']: single_mobile_tray,
        COMBO_GENERATED_FILES['mobileTrayRailsSingle']: single_side_angles + single_lock_rods,
        COMBO_GENERATED_FILES["assembly"]: collected["dropDoorPanel"] + collected["dropDoorLock"] + collected["dropDoorHardware"] + collected["mobileTray"] + collected["mobileTraySideAngles"] + collected["mobileTrayLockRod"],
        COMBO_GENERATED_FILES["dropDoor"]: collected["dropDoorPanel"] + collected["dropDoorLock"] + collected["dropDoorHardware"],
        COMBO_GENERATED_FILES["mobileTray"]: collected["mobileTray"],
        COMBO_GENERATED_FILES["mobileTrayRails"]: collected["mobileTraySideAngles"] + collected["mobileTrayLockRod"],
    }

    asset_files = []
    for filename, entities in subsets.items():
        triangles = collect_triangles(entities, panel_bounds)
        output = target_dir / filename
        write_glb(
            output,
            triangles,
            {
                "source": source_3d.name,
                "panelBounds": panel_bounds,
                "part": filename.removesuffix(".glb"),
                "officialCombo": True,
            },
            "usm-door-interior-combo-dwg",
        )
        asset_files.append(filename)

    manifest = {
        "id": "usm-door-interior-combo-dwg",
        "description": "Official DWG baseline for one drop-door front coexisting with mobile tray interior accessories.",
        "sourceFiles": {
            "combo3d": {"path": str(source_3d), "sha256": sha256(source_3d)},
            "combo2d": {"path": str(source_2d), "sha256": sha256(source_2d)},
        },
        "generatedFiles": {
            **COMBO_GENERATED_FILES,
            "combo3dDxf": "dxf/door-interior-combo-3d.dxf",
            "combo2dDxf": "dxf/door-interior-combo-2d.dxf",
        },
        "blocks": summaries,
        "coexistenceRule": {
            "frontAccessoryMax": 1,
            "frontAccessories": ["dropDoor", "flipUpDoor", "glassDropDoor"],
            "interiorAccessories": ["mobileTray", "shelf", "displayTray", "glassShelf"],
            "ordinaryInteriorMultiple": True,
            "rimmedDrawerExclusive": True,
        },
        "coordinateMapping": {
            "dwgX": "sceneX",
            "dwgZ": "sceneY from selected template bounds",
            "dwgY": "sceneZ, flipped so front face is positive",
        },
    }
    conversion_summary = {
        "combo3dDwgRead": summary_3d,
        "combo2dDwgRead": summary_2d,
        "combo3dDxfEntityCounts": dxf_entity_counts(doc),
        "combo2dDxfEntityCounts": dxf_entity_counts(flat_doc),
        "assetFiles": asset_files,
        "recursiveInsertExpansion": True,
    }
    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target_dir / "conversion-summary.json").write_text(json.dumps(conversion_summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"combo": "door-interior", "outDir": str(target_dir), "assets": asset_files, "blocks": summaries}


def build_assets(args: argparse.Namespace):
    if args.combo:
        print(json.dumps([build_combo(args)], ensure_ascii=False, indent=2))
        return
    tool_dir = Path(args.tool_dir)
    results = []
    doors = list(DOOR_SPECS) if args.door == "all" else [args.door]
    for door_id in doors:
        spec = DOOR_SPECS[door_id]
        results.append(
            build_one(
                spec,
                tool_dir,
                front_dwg=Path(args.front_dwg) if args.front_dwg and door_id == args.door else None,
                flat_dwg=Path(args.flat_dwg) if args.flat_dwg and door_id == args.door else None,
                out_dir=Path(args.out_dir) if args.out_dir and door_id == args.door else None,
            )
        )
    print(json.dumps(results, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local GLB assets for USM flip doors from DWG references.")
    parser.add_argument("--tool-dir", default=str(DEFAULT_DWG_TOOL), help="Directory containing read-dwg.cmd and dwg2dxf.cmd.")
    parser.add_argument("--door", choices=["all", *DOOR_SPECS.keys()], default="all", help="Door asset set to build.")
    parser.add_argument("--front-dwg", help="Override 3D/front DWG for a single --door build.")
    parser.add_argument("--flat-dwg", help="Override 2D/front DWG for a single --door build.")
    parser.add_argument("--combo", choices=["door-interior"], help="Build official door-front + interior accessory combo assets.")
    parser.add_argument("--combo-3d-dwg", help="Override official combo 3D DWG path.")
    parser.add_argument("--combo-2d-dwg", help="Override official combo 2D DWG path.")
    parser.add_argument("--out-dir", help="Override output directory for a single --door build.")
    return parser.parse_args()


if __name__ == "__main__":
    build_assets(parse_args())
