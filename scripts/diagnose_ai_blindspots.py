#!/usr/bin/env python3
"""
Deep-Layer Blindspot Diagnostic & Nested-Group Logo Harvesting.
Detects both:
  - Condition 1 (Multi-color Header): Red wave (M > 0.7, Y > 0.7 / RGB r > 0.6, g < 0.25, b < 0.25)
  - Condition 2 (1-color Carton Blue): Blue wave (C > 0.8, Y < 0.2 / RGB b > 0.45, r < 0.25)
    with curved paths in the logo wave size range.
Outputs src/config/carton_logo_blindspots.json.
"""

import json
from pathlib import Path
import pymupdf


def is_red_wave_color(col) -> bool:
    if not col:
        return False
    if len(col) == 4:
        c, m, y, k = col
        return m > 0.7 and y > 0.7 and c < 0.2
    if len(col) == 3:
        r, g, b = col
        return r > 0.6 and g < 0.25 and b < 0.25
    return False


def is_blue_wave_color(col) -> bool:
    if not col:
        return False
    if len(col) == 4:
        c, m, y, k = col
        return c > 0.8 and y < 0.2
    if len(col) == 3:
        r, g, b = col
        return b > 0.45 and r < 0.25
    return False


def diagnose_file(pdf_path: str, output_json_path: str) -> None:
    doc = pymupdf.open(pdf_path)
    page = doc[0]
    drawings = page.get_drawings()

    print(f"==> Total vector drawing paths detected: {len(drawings)}")

    potential_logos = []
    for i, draw in enumerate(drawings):
        rect = draw.get("rect")
        fill = draw.get("fill")
        color = draw.get("color")
        items = draw.get("items", [])

        is_red = is_red_wave_color(fill) or is_red_wave_color(color)
        is_blue_wave = (
            (is_blue_wave_color(fill) or is_blue_wave_color(color))
            and len(items) >= 3
            and 40 <= rect.width <= 180
            and 15 <= rect.height <= 90
            and 1400 <= rect.y0 <= 1520  # Top logo band of the 4 main carton panels
        )

        if is_red or is_blue_wave:
            logo_bbox = [rect.x0 - 20, rect.y0 - 10, rect.x1 + 80, rect.y1 + 90]
            potential_logos.append({
                "wave_index": i,
                "variant": "header_2color" if is_red else "carton_1color_blue",
                "wave_rect": [rect.x0, rect.y0, rect.x1, rect.y1],
                "estimated_logo_bbox": logo_bbox,
            })

    clustered_logos = []
    for item in potential_logos:
        r = item["wave_rect"]
        found = False
        for c in clustered_logos:
            if abs(r[0] - c["x0"]) < 120 and abs(r[1] - c["y0"]) < 120:
                c["x0"] = min(c["x0"], r[0])
                c["y0"] = min(c["y0"], r[1])
                c["x1"] = max(c["x1"], r[2])
                c["y1"] = max(c["y1"], r[3])
                found = True
                break
        if not found:
            clustered_logos.append({
                "variant": item["variant"],
                "x0": r[0] - 15,
                "y0": r[1] - 5,
                "x1": r[2] + 90,
                "y1": r[3] + 85,
            })

    report = {
        "source_file": pdf_path,
        "page_rect": [page.rect.x0, page.rect.y0, page.rect.x1, page.rect.y1],
        "detected_logo_instances_count": len(clustered_logos),
        "logo_instances": clustered_logos,
    }

    Path(output_json_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"✅ Phát hiện {len(clustered_logos)}/5 vị trí logo cũ trong file Carton box SCB-6119.ai.")
    for idx, l in enumerate(clustered_logos):
        print(
            f"   - Logo {idx+1} ({l['variant']}): BBox [{l['x0']:.1f}, {l['y0']:.1f}, {l['x1']:.1f}, {l['y1']:.1f}], "
            f"Size: {(l['x1']-l['x0']):.1f} x {(l['y1']-l['y0']):.1f} pt"
        )
    doc.close()


if __name__ == "__main__":
    diagnose_file(
        "local_assets/Brief_Packaging_Adaptation_BlueStone/SCB-6119/layout/Carton box SCB-6119.ai",
        "src/config/carton_logo_blindspots.json",
    )
