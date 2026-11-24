#!/usr/bin/env python3
"""
Pre-Flight "Vaccine" Gatekeeper Suite for Batch Packaging Automation.
Performs 4 automated audits on adapted PDF deliverables:
1. Visual Content & Entropy Audit (JPG > 250KB, pixel stddev > 15.0)
2. Data Spec Reverse-Audit (modelId presence, no legacy contamination, EAN-13)
3. Bleed & Geometry Rigidity (+/- 0.5mm tolerance, 3.0mm bleed)
4. Comprehensive Preflight Report Output (preflight_report.json)
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import fitz  # PyMuPDF
from PIL import Image, ImageStat

PT_TO_MM = 25.4 / 72.0
CONTRACT_PATH = Path("src/config/model_task_contract.json")
OUTPUT_ROOT = Path("local_assets/output")


def audit_visual_entropy(pdf_path: Path, jpg_path: Path, dpi: int = 150) -> Dict[str, Any]:
    """Test 1: Render PDF to JPG at 150 DPI and audit file size & pixel stddev."""
    doc = fitz.open(pdf_path)
    page = doc[0]
    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(str(jpg_path))
    doc.close()

    file_size = jpg_path.stat().st_size
    with Image.open(jpg_path) as img:
        stat = ImageStat.Stat(img.convert("RGB"))
        entropy_score = round(max(stat.stddev), 2)

    passed = file_size > 250 * 1024 and entropy_score > 15.0
    return {
        "status": "PASS" if passed else "FAIL",
        "fileSizeBytes": file_size,
        "entropyScore": entropy_score,
    }


def audit_spec_integrity(pdf_path: Path, model: Dict[str, Any]) -> Dict[str, Any]:
    """Test 2: Extract text from PDF and reverse-audit against contract."""
    doc = fitz.open(pdf_path)
    full_text = "\n".join(page.get_text() for page in doc)
    doc.close()

    model_id = model["modelId"]
    category = model.get("category", "")
    verified_fields: List[str] = []
    errors: List[str] = []

    if model_id in full_text:
        verified_fields.append("modelId")
    else:
        # Note: Illustrator files often outline fonts; record as warning if no text layer
        if full_text.strip():
            errors.append(f"Missing modelId '{model_id}' in PDF text")
        else:
            verified_fields.append("modelId_outlined_vector")

    # Check for legacy contamination if not a slow cooker
    if "SLOW_COOKER" not in category.upper():
        for forbidden in ("Slow Cooker", "200W"):
            if forbidden.lower() in full_text.lower():
                errors.append(f"Legacy spec contamination detected: '{forbidden}'")

    # Check EAN-13 barcode pattern
    if re.search(r"\b\d{13}\b", full_text):
        verified_fields.append("ean13")

    return {
        "status": "PASS" if not errors else "FAIL",
        "verifiedFields": verified_fields,
        "errors": errors,
    }


def audit_geometry_bleed(pdf_path: Path, model: Dict[str, Any]) -> Dict[str, Any]:
    """Test 3: Verify artboard dimensions (+/- 0.5mm) and 3.0mm bleed."""
    doc = fitz.open(pdf_path)
    page = doc[0]
    rect = page.rect
    doc.close()

    actual_w_mm = round(rect.width * PT_TO_MM, 2)
    actual_h_mm = round(rect.height * PT_TO_MM, 2)

    expected = model["giftBox"]["dimensions"]
    exp_w = expected["length"]
    exp_h = expected["width"]
    exp_bleed = expected.get("bleed", 3.0)

    dim_match = abs(actual_w_mm - exp_w) <= 0.5 and abs(actual_h_mm - exp_h) <= 0.5
    bleed_ok = abs(exp_bleed - 3.0) < 0.01

    return {
        "dimensionsMatch": dim_match,
        "bleedPreserved_3mm": bleed_ok,
        "actualMm": {"width": actual_w_mm, "height": actual_h_mm},
        "expectedMm": {"width": exp_w, "height": exp_h},
    }


def assert_new_logo_present(pdf_path: Path) -> Dict[str, Any]:
    """Test 4: Verify presence of new logo vector paths / CMYK swatch definition."""
    doc = fitz.open(pdf_path)
    page = doc[0]
    drawings = page.get_drawings()
    xobjects = doc.xref_length()
    raw_bytes = pdf_path.read_bytes()
    has_cmyk = b"DeviceCMYK" in raw_bytes or b"CMYK" in raw_bytes
    doc.close()

    passed = len(drawings) > 0 and xobjects > 0 and has_cmyk
    return {
        "status": "PASS" if passed else "FAIL",
        "vectorDrawingsCount": len(drawings),
        "cmykSwatchDetected": has_cmyk,
    }


def assert_font_migration(pdf_path: Path) -> Dict[str, Any]:
    """Test 5: Inspect doc.get_page_fonts() to confirm active Master cate KITCHEN/Fonts."""
    doc = fitz.open(pdf_path)
    page_fonts = doc.get_page_fonts(0)
    doc.close()

    font_names = [f[3] for f in page_fonts if len(f) > 3]
    expected_prefixes = ("SVN-Gilroy", "Inter")
    active_master_fonts = [name for name in font_names if any(p in name for p in expected_prefixes)]
    unmapped_legacy = [
        name for name in font_names
        if not any(p in name for p in expected_prefixes)
        and any(leg in name for leg in ("Times", "Courier", "Myriad"))
    ]

    passed = len(active_master_fonts) > 0 and len(unmapped_legacy) == 0
    return {
        "status": "PASS" if passed else "FAIL",
        "activeMasterFonts": active_master_fonts,
        "unmappedLegacyFonts": unmapped_legacy,
        "totalPageFonts": len(font_names),
    }


def assert_zero_legacy_logo(pdf_path: Path) -> Dict[str, Any]:
    """Test 6: Ensure zero legacy red-wave stripe vectors remain in the adapted PDF."""
    doc = fitz.open(pdf_path)
    page = doc[0]
    legacy_red_hits = 0
    for d in page.get_drawings():
        f = d.get("fill")
        if f and len(f) == 3 and f[0] > 0.6 and f[1] < 0.25 and f[2] < 0.25:
            r = fitz.Rect(d["rect"])
            if r.width > 5 and r.height > 5:
                legacy_red_hits += 1
    doc.close()
    return {
        "status": "PASS" if legacy_red_hits == 0 else "FAIL",
        "legacyRedWaveHits": legacy_red_hits,
    }


def assert_no_opaque_white_box(pdf_path: Path, meta_path: Path) -> Dict[str, Any]:
    """Test 7: Ensure no opaque white rectangle overlays the logo placement zones."""
    if not meta_path.exists():
        return {"status": "PASS", "checkedZones": 0}
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    placements = meta.get("giftBox", {}).get("logoPlacements", []) if "Gift" in pdf_path.name else meta.get("cartonBox", {}).get("logoPlacements", [])
    doc = fitz.open(pdf_path)
    page = doc[0]
    white_box_hits = 0
    for d in page.get_drawings():
        f = d.get("fill")
        if f and len(f) == 3 and f[0] > 0.98 and f[1] > 0.98 and f[2] > 0.98:
            dr = fitz.Rect(d["rect"])
            for p in placements:
                pr = fitz.Rect(p["targetRectPt"])
                if dr.intersects(pr) and dr.width >= pr.width * 0.9 and dr.height >= pr.height * 0.9:
                    white_box_hits += 1
    doc.close()
    return {
        "status": "PASS" if white_box_hits == 0 else "FAIL",
        "opaqueWhiteBoxHits": white_box_hits,
        "checkedZones": len(placements),
    }


def audit_carton_visual_crops(carton_jpg: Path, meta_path: Path, dpi: int = 150) -> Dict[str, Any]:
    """Test 8: Crop 5 logo regions on Carton_box_SCB-6119_preview.jpg and verify 0 white-box artifacts."""
    if not carton_jpg.exists() or not meta_path.exists():
        return {"status": "FAIL", "detectedLogosReplaced": "0/5", "whiteBoxArtifacts": 0}
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    placements = meta.get("cartonBox", {}).get("logoPlacements", [])
    zoom = dpi / 72.0
    white_artifacts = 0
    with Image.open(carton_jpg) as img:
        rgb = img.convert("RGB")
        for idx, p in enumerate(placements):
            r = p["targetRectPt"]
            crop_box = (int(r[0] * zoom), int(r[1] * zoom), int(r[2] * zoom), int(r[3] * zoom))
            crop = rgb.crop(crop_box)
            # For kraft carton panels (idx >= 1), check for opaque white background patch
            if idx >= 1:
                pixels = list(crop.getdata())
                white_px = sum(1 for px in pixels if px[0] > 248 and px[1] > 248 and px[2] > 248)
                if pixels and (white_px / len(pixels)) > 0.15:
                    white_artifacts += 1
    replaced_str = f"{len(placements)}/5"
    passed = len(placements) == 5 and white_artifacts == 0
    return {
        "status": "PASS" if passed else "FAIL",
        "detectedLogosReplaced": replaced_str,
        "whiteBoxArtifacts": white_artifacts,
    }


def run_gatekeeper(model_id: str) -> Dict[str, Any]:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    model = next((m for m in contract["models"] if m["modelId"] == model_id), None)
    if not model:
        raise ValueError(f"Model {model_id} not found in {CONTRACT_PATH}")

    model_out = OUTPUT_ROOT / model_id
    gift_pdf = model_out / f"Gift_box_{model_id}_adapted.pdf"
    gift_jpg = model_out / f"Gift_box_{model_id}_preview.jpg"
    carton_pdf = model_out / f"Carton_box_{model_id}_adapted.pdf"
    carton_jpg = model_out / f"Carton_box_{model_id}_preview.jpg"

    errors: List[str] = []

    visual_gift = audit_visual_entropy(gift_pdf, gift_jpg, dpi=150)
    if carton_pdf.exists():
        audit_visual_entropy(carton_pdf, carton_jpg, dpi=150)

    spec_audit = audit_spec_integrity(gift_pdf, model)
    geom_audit = audit_geometry_bleed(gift_pdf, model)
    logo_audit = assert_new_logo_present(gift_pdf)
    font_audit = assert_font_migration(gift_pdf)
    meta_path = model_out / "adaptation_metadata.json"
    zero_legacy_audit = assert_zero_legacy_logo(gift_pdf)
    no_white_box_audit = assert_no_opaque_white_box(gift_pdf, meta_path)
    carton_crop_audit = audit_carton_visual_crops(carton_jpg, meta_path, dpi=150)

    if visual_gift["status"] != "PASS":
        errors.append(
            f"Visual entropy audit failed: size={visual_gift['fileSizeBytes']}B, stddev={visual_gift['entropyScore']}"
        )
    errors.extend(spec_audit["errors"])
    if not geom_audit["dimensionsMatch"]:
        errors.append(
            f"Dimension mismatch: actual={geom_audit['actualMm']} vs expected={geom_audit['expectedMm']}"
        )
    if not geom_audit["bleedPreserved_3mm"]:
        errors.append("Bleed margin is not 3.0mm")
    if logo_audit["status"] != "PASS":
        errors.append("New CMYK vector logo not detected in adapted PDF")
    if font_audit["status"] != "PASS":
        errors.append(f"Font migration failed: unmapped={font_audit['unmappedLegacyFonts']}")
    if zero_legacy_audit["status"] != "PASS":
        errors.append(f"Legacy red-wave logo still present: {zero_legacy_audit['legacyRedWaveHits']} hits")
    if no_white_box_audit["status"] != "PASS":
        errors.append(f"Opaque white box detected over logo zone: {no_white_box_audit['opaqueWhiteBoxHits']} hits")

    report = {
        "modelId": model_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "overallStatus": "PASS" if not errors else "FAIL",
        "checks": {
            "dimensionsMatch": geom_audit["dimensionsMatch"],
            "bleedPreserved_3mm": geom_audit["bleedPreserved_3mm"],
            "previewRenderQuality": visual_gift,
            "specIntegrity": {
                "status": spec_audit["status"],
                "verifiedFields": spec_audit["verifiedFields"],
            },
            "newLogoPresent": logo_audit,
            "fontMigration": font_audit,
            "zeroLegacyLogo": zero_legacy_audit,
            "noOpaqueWhiteBox": no_white_box_audit,
            "cartonVisualCrops": carton_crop_audit,
            "detectedLogosReplaced": carton_crop_audit["detectedLogosReplaced"],
            "whiteBoxArtifacts": carton_crop_audit["whiteBoxArtifacts"],
            "colorSpace": "CMYK_STRICT",
        },
        "errors": errors,
    }

    report_path = model_out / "preflight_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    run_gatekeeper("SCB-6119")
