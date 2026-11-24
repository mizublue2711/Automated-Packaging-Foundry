#!/usr/bin/env python3
"""
Step 1: Reverse-Engineer Font Hierarchy from Master Templates.
Inspects Giftbox Master.ai and Carton box Master.ai using PyMuPDF,
extracts typographic attributes across 4 tiers:
  1. Product Headline & Model ID
  2. Key Selling Points (KSP)
  3. Technical Spec Table
  4. Legal & EAN-13 Barcode labels
Outputs discovered typographic metrics to src/config/font_hierarchy_rules.json.
"""

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List

import pymupdf

MASTER_DIR = Path("local_assets/Brief_Packaging_Adaptation_BlueStone/Master cate KITCHEN")
GIFTBOX_MASTER = MASTER_DIR / "Giftbox Master.ai"
CARTON_MASTER = MASTER_DIR / "Carton box Master.ai"
FONTS_DIR = MASTER_DIR / "Fonts"
OUTPUT_JSON = Path("src/config/font_hierarchy_rules.json")


def clean_font_name(raw_name: str) -> str:
    """Strip PDF subset prefix like 'VOYIPH+'."""
    return raw_name.split("+", 1)[-1] if "+" in raw_name else raw_name


def extract_spans(pdf_path: Path) -> List[Dict[str, Any]]:
    """Extract all text spans with font, size, bbox, and line leading."""
    doc = pymupdf.open(pdf_path)
    spans: List[Dict[str, Any]] = []
    for page_idx, page in enumerate(doc):
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            lines = block.get("lines", [])
            for line_idx, line in enumerate(lines):
                line_bbox = line.get("bbox", [0, 0, 0, 0])
                leading = None
                if line_idx + 1 < len(lines):
                    next_bbox = lines[line_idx + 1].get("bbox", [0, 0, 0, 0])
                    leading = round(next_bbox[1] - line_bbox[1], 2)
                for span in line.get("spans", []):
                    txt = span.get("text", "").strip()
                    if not txt:
                        continue
                    spans.append({
                        "page": page_idx,
                        "text": txt,
                        "font": clean_font_name(span.get("font", "")),
                        "size": round(span.get("size", 0.0), 2),
                        "flags": span.get("flags", 0),
                        "bbox": [round(v, 2) for v in span.get("bbox", [0, 0, 0, 0])],
                        "leading": leading,
                    })
    doc.close()
    return spans


def classify_tiers(spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Group extracted spans into the 4 typographic tiers."""
    tier1_headline: List[Dict[str, Any]] = []
    tier2_ksp: List[Dict[str, Any]] = []
    tier3_specs: List[Dict[str, Any]] = []
    tier4_legal_ean: List[Dict[str, Any]] = []

    for s in spans:
        sz = s["size"]
        txt = s["text"]
        if re.search(r"\b\d{13}\b", txt) or sz <= 8.5 or any(
            kw in txt.lower() for kw in ("made in", "bluestone", "warning", "caution", "ean", "voltage", "220-240")
        ) and sz <= 10.5:
            tier4_legal_ean.append(s)
        elif sz >= 18.0:
            tier1_headline.append(s)
        elif 11.0 <= sz < 18.0:
            tier2_ksp.append(s)
        else:
            tier3_specs.append(s)

    def summarize(items: List[Dict[str, Any]], default_font: str, default_size: float) -> Dict[str, Any]:
        if not items:
            return {
                "fontFamily": default_font,
                "pointSize": default_size,
                "leading": round(default_size * 1.2, 2),
                "sampleCount": 0,
            }
        fonts = Counter(i["font"] for i in items)
        sizes = [i["size"] for i in items]
        leadings = [i["leading"] for i in items if i["leading"] and i["leading"] > 0]
        top_font = fonts.most_common(1)[0][0]
        avg_size = round(sum(sizes) / len(sizes), 2)
        avg_leading = round(sum(leadings) / len(leadings), 2) if leadings else round(avg_size * 1.2, 2)
        return {
            "fontFamily": top_font,
            "allFontsObserved": dict(fonts),
            "pointSize": avg_size,
            "minPointSize": min(sizes),
            "maxPointSize": max(sizes),
            "leading": avg_leading,
            "sampleCount": len(items),
            "samples": [i["text"][:60] for i in items[:5]],
        }

    t1 = summarize(tier1_headline, "SVN-GilroyBold", 24.0)
    t1["outlineRequiredForPrint"] = True

    t2 = summarize(tier2_ksp, "InterVariable", 14.0)
    t2["fontWeight"] = "SemiBold / Bold"
    t2["tracking"] = 0
    t2["caseStyling"] = "Title Case / Uppercase Callouts"

    t3 = summarize(tier3_specs, "Inter", 9.5)
    t3["columnAlignment"] = "Left-aligned label / Right-aligned value"

    t4 = summarize(tier4_legal_ean, "Inter", 7.5)
    t4["safetyClearanceMm"] = 5.0

    return {
        "tier1_productHeadlineAndModelId": t1,
        "tier2_keySellingPoints": t2,
        "tier3_technicalSpecTable": t3,
        "tier4_legalAndEan13": t4,
    }


def main() -> None:
    gift_spans = extract_spans(GIFTBOX_MASTER)
    carton_spans = extract_spans(CARTON_MASTER)
    all_spans = gift_spans + carton_spans

    available_fonts = sorted(
        [f.name for f in FONTS_DIR.iterdir() if f.is_file() and f.suffix.lower() in (".ttf", ".otf")]
    )

    rules = {
        "schemaVersion": "1.0.0",
        "sources": {
            "giftboxMaster": str(GIFTBOX_MASTER),
            "cartonMaster": str(CARTON_MASTER),
            "fontsDirectory": str(FONTS_DIR),
        },
        "availableFontFiles": available_fonts,
        "safeZoneClamping": {
            "trackingAdjustmentRange": [-15, -10],
            "fontSizeStepDownPt": 0.5,
            "minSafeMarginFromCreaseMm": 5.0,
        },
        "tiers": classify_tiers(all_spans),
        "templateStats": {
            "giftboxMasterSpanCount": len(gift_spans),
            "cartonMasterSpanCount": len(carton_spans),
        },
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(rules, indent=2), encoding="utf-8")
    print(f"✅ Extracted master font rules to {OUTPUT_JSON}")
    print(json.dumps(rules["templateStats"], indent=2))


if __name__ == "__main__":
    main()
