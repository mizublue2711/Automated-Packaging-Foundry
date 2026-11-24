#!/usr/bin/env python3
"""
Metadata harvesting script for BlueStone Packaging Adaptation.
Scans ./local_master_sources/ (or ./local_assets/Brief_Packaging_Adaptation_BlueStone/)
for .ai, .indd/.idml, and .psd files, extracts dimensions, swatches, DPI, and
populates src/config/model_task_contract.json.
"""

import json
import os
import re
import struct
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional

PT_TO_MM = 25.4 / 72.0

CONTRACT_PATH = Path("src/config/model_task_contract.json")
SEARCH_DIRS = [
    Path("local_master_sources"),
    Path("local_assets/Brief_Packaging_Adaptation_BlueStone"),
]


def find_source_root() -> Optional[Path]:
    for d in SEARCH_DIRS:
        if d.exists() and d.is_dir():
            return d
    return None


def parse_ai_file(path: Path) -> Dict[str, Any]:
    """Parse PDF-compatible .ai file for artboard boxes, bleed, and spot colors."""
    result: Dict[str, Any] = {
        "file": str(path),
        "width_mm": 0.0,
        "height_mm": 0.0,
        "bleed_mm": 3.0,
        "spot_colors": [],
        "process_colors": ["Cyan", "Magenta", "Yellow", "Black"],
        "bounding_boxes": {
            "modelId": {"x": 0, "y": 0, "w": 0, "h": 0},
            "barcode": {"x": 0, "y": 0, "w": 0, "h": 0},
            "specsTable": {"x": 0, "y": 0, "w": 0, "h": 0},
        },
    }
    try:
        raw = path.read_bytes()
        # Look for MediaBox / TrimBox / BleedBox in PDF header/trailer
        trim_match = re.search(
            rb"/TrimBox\s*\[\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s*\]",
            raw,
        )
        media_match = re.search(
            rb"/MediaBox\s*\[\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s*\]",
            raw,
        )
        bleed_match = re.search(
            rb"/BleedBox\s*\[\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s*\]",
            raw,
        )

        box = trim_match or media_match
        if box:
            x1, y1, x2, y2 = (float(box.group(i)) for i in range(1, 5))
            result["width_mm"] = round(abs(x2 - x1) * PT_TO_MM, 2)
            result["height_mm"] = round(abs(y2 - y1) * PT_TO_MM, 2)

            if bleed_match and trim_match:
                bx1 = float(bleed_match.group(1))
                tx1 = float(trim_match.group(1))
                bleed_pt = abs(tx1 - bx1)
                if bleed_pt > 0:
                    result["bleed_mm"] = round(bleed_pt * PT_TO_MM, 2)

        # Extract Spot Colors (/Separation /Name)
        spots = set()
        for m in re.finditer(rb"/Separation\s*/([^\s/\[\]<>()]+)", raw):
            name = m.group(1).decode("latin1", errors="ignore").replace("#20", " ")
            if name not in ("All", "None"):
                spots.add(name)
        result["spot_colors"] = sorted(spots)
    except Exception as exc:
        result["error"] = str(exc)
    return result


def parse_indd_or_idml(path: Path) -> Dict[str, Any]:
    """Parse .idml (XML zip) or .indd (XMP/binary) for page count & cover frame."""
    result: Dict[str, Any] = {
        "file": str(path),
        "pageCount": 0,
        "spreadDimensions": {"width_mm": 0.0, "height_mm": 0.0},
        "coverFrameId": "",
    }
    try:
        if path.suffix.lower() == ".idml" and zipfile.is_zipfile(path):
            with zipfile.ZipFile(path, "r") as zf:
                spread_files = [n for n in zf.namelist() if n.startswith("Spreads/Spread_")]
                result["pageCount"] = len(spread_files) * 2
                if spread_files:
                    root = ET.fromstring(zf.read(spread_files[0]))
                    tf = root.find(".//TextFrame")
                    if tf is not None:
                        result["coverFrameId"] = tf.attrib.get("Self", "")
        else:
            raw = path.read_bytes()
            # Try reading XMP PageCount if embedded in .indd
            m = re.search(rb"<xmpTPg:NPages>(\d+)</xmpTPg:NPages>", raw)
            if m:
                result["pageCount"] = int(m.group(1))
            # Check for InDesign object/frame IDs in XMP or text
            result["coverFrameId"] = f"cover_{path.stem}"
    except Exception as exc:
        result["error"] = str(exc)
    return result


def parse_psd_file(path: Path) -> Dict[str, Any]:
    """Parse PSD binary header (8BPS) and 8BIM resolution resource (1005)."""
    result: Dict[str, Any] = {
        "file": str(path),
        "width_px": 0,
        "height_px": 0,
        "dpi": 300.0,
    }
    try:
        with path.open("rb") as f:
            header = f.read(26)
            if len(header) >= 26 and header[:4] == b"8BPS":
                height, width = struct.unpack(">II", header[14:22])
                result["width_px"] = width
                result["height_px"] = height

                # Skip Color Mode Data
                color_mode_len = struct.unpack(">I", f.read(4))[0]
                f.seek(color_mode_len, os.SEEK_CUR)

                # Read Image Resources section
                res_len = struct.unpack(">I", f.read(4))[0]
                res_data = f.read(min(res_len, 65536))
                idx = res_data.find(b"8BIM\x03\xed")
                if idx != -1 and idx + 14 < len(res_data):
                    # 4 bytes 8BIM + 2 bytes 0x03ED + 2 bytes pascal name + 4 bytes size
                    name_len = res_data[idx + 6]
                    padded_name = name_len + 1 + ((name_len + 1) % 2)
                    data_start = idx + 6 + padded_name + 4
                    if data_start + 4 <= len(res_data):
                        h_res_fixed = struct.unpack(">I", res_data[data_start : data_start + 4])[0]
                        result["dpi"] = round(h_res_fixed / 65536.0, 2)
    except Exception as exc:
        result["error"] = str(exc)
    return result


def main() -> None:
    root = find_source_root()
    if root is None:
        print("No local master source directory found.")
        return

    print(f"Scanning master sources in: {root}")

    ai_files = sorted(root.rglob("*.ai"))
    indd_files = sorted(list(root.rglob("*.indd")) + list(root.rglob("*.idml")))
    psd_files = sorted(root.rglob("*.psd"))

    print(f"Found: {len(ai_files)} .ai, {len(indd_files)} .indd/.idml, {len(psd_files)} .psd")

    ai_meta = [parse_ai_file(p) for p in ai_files]
    indd_meta = [parse_indd_or_idml(p) for p in indd_files]
    psd_meta = [parse_psd_file(p) for p in psd_files]

    # Build primary SCB-6119 model entry from harvested metadata
    gift_ai = next((m for m in ai_meta if "Gift box SCB-6119" in m["file"]), None)
    carton_ai = next((m for m in ai_meta if "Carton box SCB-6119" in m["file"]), None)
    im_indd = next((m for m in indd_meta if "IM SCB-6119" in m["file"]), None)

    models: List[Dict[str, Any]] = [
        {
            "modelId": "SCB-6119",
            "category": "KITCHEN_SLOW_COOKER",
            "giftBox": {
                "dimensions": {
                    "length": gift_ai["width_mm"] if gift_ai else 0,
                    "width": gift_ai["height_mm"] if gift_ai else 0,
                    "height": 0,
                    "bleed": gift_ai["bleed_mm"] if gift_ai else 3.0,
                },
                "swatches": {
                    "spot": gift_ai["spot_colors"] if gift_ai else [],
                    "process": gift_ai["process_colors"] if gift_ai else [],
                },
                "kspIcons": [],
                "specsTableBoundingBox": (
                    gift_ai["bounding_boxes"]["specsTable"]
                    if gift_ai
                    else {"x": 0, "y": 0, "w": 0, "h": 0}
                ),
            },
            "cartonBox": {
                "dimensions": {
                    "length": carton_ai["width_mm"] if carton_ai else 0,
                    "width": carton_ai["height_mm"] if carton_ai else 0,
                    "height": 0,
                }
            },
            "instructionManual": {
                "pageCount": im_indd["pageCount"] if im_indd else 0,
                "coverFrameId": im_indd["coverFrameId"] if im_indd else "",
            },
        }
    ]

    contract = {
        "projectId": "BLUESTONE_ADAPTATION",
        "totalModels": 13,
        "models": models,
        "harvestSummary": {
            "sourceRoot": str(root),
            "aiFiles": ai_meta,
            "inddFiles": indd_meta,
            "psdFiles": psd_meta,
        },
    }

    CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTRACT_PATH.write_text(json.dumps(contract, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote contract to {CONTRACT_PATH}")


if __name__ == "__main__":
    main()
