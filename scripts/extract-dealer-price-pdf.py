from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber


DEFAULT_OUTPUT = Path("src/data/simple-home-price-source.json")

ROW_TERMS: dict[int, dict[str, str]] = {
    **{row: {"name": "扣板", "canonicalName": "panel"} for row in range(1, 62)},
    **{row: {"name": "门板", "canonicalName": "doorPanel"} for row in range(62, 94)},
    **{row: {"name": "SU201", "canonicalName": "tube201"} for row in range(94, 103)},
    **{row: {"name": "SU304", "canonicalName": "tube304"} for row in range(103, 112)},
    112: {"name": "SU201/304", "canonicalName": "spliceOvalTube"},
    113: {"name": "黄铜球", "canonicalName": "brassBall"},
    114: {"name": "膨胀套件", "canonicalName": "expansionSet"},
    115: {"name": "脚轮", "canonicalName": "caster"},
    116: {"name": "脚垫", "canonicalName": "glide"},
    117: {"name": "下翻门铰链", "canonicalName": "dropDoorHinge"},
    118: {"name": "阻尼器", "canonicalName": "damper"},
    119: {"name": "一元锁+锁盒", "canonicalName": "coinLockBox"},
    120: {"name": "钥匙锁+锁盒", "canonicalName": "keyLockBox"},
    121: {"name": "层板", "canonicalName": "shelfPanel"},
    122: {"name": "托盘", "canonicalName": "tray"},
    123: {"name": "抽屉", "canonicalName": "drawer"},
    124: {"name": "T型件", "canonicalName": "tFitting"},
    125: {"name": "不锈钢拉手", "canonicalName": "stainlessHandle"},
    126: {"name": "玻璃", "canonicalName": "glass"},
    127: {"name": "玻璃拉手", "canonicalName": "glassHandle"},
    128: {"name": "玻璃夹", "canonicalName": "glassClip"},
    129: {"name": "玻璃门转", "canonicalName": "glassDoorPivotSet"},
    130: {"name": "扣板门转", "canonicalName": "panelDoorPivotSet"},
    131: {"name": "国内标准木箱", "canonicalName": "domesticWoodCrate"},
    132: {"name": "海外标准木箱", "canonicalName": "exportWoodCrate"},
}

FOUR_ROW_HOLE_ROWS = {17, 19, 21, 24, 26, 30, 32, 35, 37, 39, 41, 44, 46, 48, 51, 55}
CAVE_PANEL_ROWS = {42}

MANUAL_SPECS: dict[int, str] = {
    112: "拼接-椭圆管",
    117: "常用",
    123: "低/高",
    125: "门用",
    129: "一只门要用一套（4只）",
    130: "一只门要用一套（4只）",
}

MANUAL_NOTES: dict[int, str] = {
    112: "对应尺寸基础加收1元/条",
    117: "1只已含弹簧+五金件；1个门板需用2只",
    121: "含五金固定件*8",
    122: "滑轨*2，边板*2，五金配件",
    123: "滑轨*2，围板*4，含T型件*2，边板*2，五金配件",
}

MANUAL_UNITS: dict[int, str] = {
    113: "颗",
    114: "套",
    115: "个",
    116: "个",
    117: "只",
    118: "个",
    119: "套",
    120: "套",
    121: "块",
    122: "套",
    123: "套",
    124: "个",
    125: "个",
    126: "方",
    127: "个",
    128: "个",
    129: "套",
    130: "套",
    131: "方",
    132: "方",
}


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/extract-dealer-price-pdf.py <price.pdf> [output.json]")

    pdf_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    rows = extract_rows(pdf_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "schemaVersion": 1,
        "id": "simple-home-20250924183213",
        "dealerName": "Simple Home 简居家具",
        "title": "配件报价表",
        "currency": "CNY",
        "source": {
            "type": "pdf",
            "name": pdf_path.name,
            "note": "PDF 内嵌字体导致中文文字层乱码；中文材料术语按渲染图人工校准，规格和价格来自表格抽取。"
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "laborRules": [
            {"id": "hardwareInstall", "label": "人工安装费", "rate": 0.05, "scope": "hardware"},
            {"id": "glassInstall", "label": "玻璃安装费", "rate": 0.10, "scope": "glass"}
        ],
        "items": rows,
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} price items to {output_path}")


def extract_rows(pdf_path: Path) -> list[dict[str, object]]:
    extracted: list[dict[str, object]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages, 1):
            for table in page.extract_tables():
                for raw_row in table:
                    item = normalize_row(raw_row, page_index)
                    if item:
                        extracted.append(item)

    by_row: dict[int, dict[str, object]] = {}
    for item in extracted:
        by_row[int(item["sourceRow"])] = item

    missing = sorted(set(ROW_TERMS) - set(by_row))
    if missing:
        raise RuntimeError(f"Missing source rows: {missing}")

    return [by_row[row] for row in sorted(by_row)]


def normalize_row(raw_row: list[str | None], page_index: int) -> dict[str, object] | None:
    if not raw_row or not raw_row[0] or not str(raw_row[0]).strip().isdigit():
        return None

    source_row = int(str(raw_row[0]).strip())
    if source_row not in ROW_TERMS:
        return None

    term = ROW_TERMS[source_row]
    raw_spec = clean_text(raw_row[2] or "")
    raw_unit = clean_text(raw_row[3] or "")
    raw_price = clean_text(raw_row[4] or "")
    raw_note = clean_text(raw_row[5] or "")

    spec = MANUAL_SPECS.get(source_row, extract_spec(raw_spec))
    unit = MANUAL_UNITS.get(source_row, decode_unit(raw_unit))
    note = MANUAL_NOTES.get(source_row, decode_note(raw_note))
    price = parse_price(raw_price)
    pricing_rule = None

    if source_row in FOUR_ROW_HOLE_ROWS:
        spec = f"{spec}（四排孔）"
    if source_row in CAVE_PANEL_ROWS:
        spec = f"{spec}（洞洞板）"
    if source_row == 112:
        pricing_rule = "baseMatchedTubePrice + 1"

    return {
        "sourceRow": source_row,
        "page": page_index,
        "name": term["name"],
        "canonicalName": term["canonicalName"],
        "spec": spec,
        "unit": unit,
        "unitPrice": price,
        "pricingRule": pricing_rule,
        "note": note,
        "raw": {
            "productName": clean_text(raw_row[1] or ""),
            "spec": raw_spec,
            "unit": raw_unit,
            "price": raw_price,
            "note": raw_note,
        },
    }


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value).replace("\n", " ")).strip()


def extract_spec(value: str) -> str:
    match = re.search(r"\d+\s*[*xX]\s*\d+", value)
    if match:
        return match.group(0).replace(" ", "").replace("x", "*").replace("X", "*")
    return clean_text(value)


def parse_price(value: str) -> float | str:
    if "X+1" in value:
        return "X+1"
    matches = re.findall(r"\d+(?:\.\d+)?", value)
    if not matches:
        return 0
    price = float(matches[-1])
    return int(price) if price.is_integer() else price


def decode_unit(value: str) -> str:
    if value == "��":
        return "块"
    return value or "件"


def decode_note(value: str) -> str:
    return "" if not value or "�" in value else value


if __name__ == "__main__":
    main()
