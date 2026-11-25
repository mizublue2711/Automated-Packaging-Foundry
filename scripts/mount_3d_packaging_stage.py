#!/usr/bin/env python3
"""
Bake 3D packaging textures from 2D vector dielines (PDF/SVG) for SCB-6119
and configure PBR materials + exact FEFCO 0215 panel UV regions for the
interactive 3D WebApp stage.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageEnhance

ROOT_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT_DIR / "local_assets" / "output" / "SCB-6119"
OUTPUT_TEX_DIR = ROOT_DIR / "public" / "textures" / "packaging" / "SCB-6119"
CONFIG_PATH = ROOT_DIR / "src" / "config" / "packaging_3d_materials.json"

TARGET_SIZE = (4096, 4096)
SCB6119_DIMENSIONS_MM = {
    "length": 485,
    "width": 485,
    "height": 365,
    "unit": "mm",
}


def _group_line_indices(indices: np.ndarray, max_gap: int = 3) -> List[Tuple[int, int]]:
    if len(indices) == 0:
        return []
    groups: List[List[int]] = [[int(indices[0])]]
    for idx in indices[1:]:
        val = int(idx)
        if val - groups[-1][-1] <= max_gap:
            groups[-1].append(val)
        else:
            groups.append([val])
    return [(g[0], g[-1]) for g in groups]


def _detect_carton_dieline_grid(rgb_img: Image.Image) -> Tuple[List[float], List[float]]:
    """
    Detect the exact 5 vertical lines (4 equal panels) and 4 horizontal lines
    (top flaps / main panels / bottom flaps) of the SCB-6119 carton dieline,
    excluding the top metadata table, outer border, dimension arrows, and
    bottom-right Pantone/isometric callout box.
    """
    w, h = rgb_img.size
    arr = np.array(rgb_img)
    gray = arr.mean(axis=2)
    dark = gray < 120

    # Vertical crease/cut lines within the main panel band (y in 30%..55%)
    y_band_0, y_band_1 = int(h * 0.30), int(h * 0.55)
    v_counts = dark[y_band_0:y_band_1, :].sum(axis=0)
    v_groups = _group_line_indices(np.where(v_counts > (y_band_1 - y_band_0) * 0.70)[0])
    # Filter out outer sheet frame (<5% or >96% width) and left dimension arrow (<7% width)
    v_centers = [0.5 * (a + b) for a, b in v_groups if 0.07 * w <= a <= 0.955 * w]

    # Horizontal crease/cut lines spanning the dieline width (x in 10%..90%)
    x_band_0, x_band_1 = int(w * 0.10), int(w * 0.90)
    h_counts = dark[:, x_band_0:x_band_1].sum(axis=1)
    h_groups = _group_line_indices(np.where(h_counts > (x_band_1 - x_band_0) * 0.70)[0])
    # Filter out outer sheet frame & top metadata table (<12% or >75% height)
    h_centers = [0.5 * (a + b) for a, b in h_groups if 0.12 * h <= a <= 0.75 * h]

    if len(v_centers) == 5 and len(h_centers) == 4:
        return v_centers, h_centers

    # Deterministic fallback ratios verified on Carton_box_SCB-6119_adapted.pdf (4096x2896)
    fallback_v = [r * w for r in (311.5 / 4096, 1195.5 / 4096, 2079.0 / 4096, 2962.5 / 4096, 3846.5 / 4096)]
    fallback_h = [r * h for r in (451.5 / 2896, 895.0 / 2896, 1561.5 / 2896, 2004.0 / 2896)]
    return fallback_v, fallback_h


def _to_rgb(img: Image.Image, fill_rgb: Tuple[int, int, int]) -> Image.Image:
    if img.mode == "CMYK":
        return img.convert("RGB")
    if img.mode == "RGB":
        return img
    bg = Image.new("RGB", img.size, fill_rgb)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[3])
        return bg
    return img.convert("RGB")


def bake_carton_dieline_texture(pdf_path: Path, out_png: Path) -> Dict[str, Dict[str, float]]:
    """
    Rasterize Carton_box_SCB-6119_adapted.pdf, crop tightly to the 4-panel + flaps
    dieline boundary (excluding metadata table, rulers, dimension callouts, and
    Pantone/isometric swatch), bake to a 4096x4096 Web-sRGB PNG, and return exact
    Three.js normalized UV regions (flipY=true, V=0 bottom, V=1 top) per panel slot.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"Source PDF not found: {pdf_path}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_png = Path(tmpdir) / f"{pdf_path.stem}_raw.png"
        # Render PDF at 5120px width so the cropped dieline (~4418px) downsamples cleanly to 4096px
        subprocess.run(
            ["sips", "-s", "format", "png", "-Z", "5120", str(pdf_path), "--out", str(tmp_png)],
            check=True,
            capture_output=True,
        )

        with Image.open(tmp_png) as raw_img:
            rgb = _to_rgb(raw_img, (255, 255, 255))
            v_lines, h_lines = _detect_carton_dieline_grid(rgb)

            # Tight crop inside outer cut hairline (+2px inset to remove border strokes)
            inset = 2
            crop_x0 = int(round(v_lines[0])) + inset
            crop_y0 = int(round(h_lines[0])) + inset
            crop_x1 = int(round(v_lines[-1])) - inset
            crop_y1 = int(round(h_lines[-1])) - inset

            cropped = rgb.crop((crop_x0, crop_y0, crop_x1, crop_y1))
            cw, ch = cropped.size

            # Sample exact unprinted kraft substrate color from bottom flap of Panel 1
            sample_x = int(cw * 0.375)
            sample_y = int(ch * 0.86)
            kraft_rgb = tuple(int(c) for c in cropped.getpixel((sample_x, sample_y)))

            # Subtle warm kraft tone & contrast polish for WebGL albedo
            kraft_overlay = Image.new("RGB", cropped.size, kraft_rgb)
            cropped = Image.blend(cropped, kraft_overlay, alpha=0.04)
            cropped = ImageEnhance.Contrast(cropped).enhance(1.03)

            # Re-sample polished kraft color for seamless 4096x4096 canvas padding
            canvas_kraft_rgb = tuple(int(c) for c in cropped.getpixel((sample_x, sample_y)))

            # Scale to fit 4096x4096 preserving exact dieline aspect ratio
            scale = min(TARGET_SIZE[0] / cw, TARGET_SIZE[1] / ch)
            scaled_w = int(round(cw * scale))
            scaled_h = int(round(ch * scale))
            resized = cropped.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

            offset_x = (TARGET_SIZE[0] - scaled_w) // 2
            offset_y = (TARGET_SIZE[1] - scaled_h) // 2

            canvas = Image.new("RGB", TARGET_SIZE, canvas_kraft_rgb)
            canvas.paste(resized, (offset_x, offset_y))

            out_png.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(out_png, format="PNG", optimize=True)

            # Compute exact normalized Three.js UV bounds (u: left->right, v: bottom->top)
            # Inset each panel region by 6px inside crease lines so dark hairline strokes never appear on box seams
            uv_pad_px = 6.0

            def map_x_to_u(raw_x: float) -> float:
                canvas_x = offset_x + (raw_x - crop_x0) * scale
                return round(max(0.0, min(1.0, canvas_x / TARGET_SIZE[0])), 6)

            def map_y_to_v(raw_y: float) -> float:
                canvas_y = offset_y + (raw_y - crop_y0) * scale
                # Three.js flipY=true: image top (y=0) is V=1, image bottom (y=H) is V=0
                return round(max(0.0, min(1.0, 1.0 - (canvas_y / TARGET_SIZE[1]))), 6)

            def panel_uv(col_idx: int, row_idx: int, extra_pad_px: float = 0.0) -> Dict[str, float]:
                pad_raw = (uv_pad_px + extra_pad_px) / scale
                rx0 = v_lines[col_idx] + pad_raw
                rx1 = v_lines[col_idx + 1] - pad_raw
                ry0 = h_lines[row_idx] + pad_raw
                ry1 = h_lines[row_idx + 1] - pad_raw
                u_min = map_x_to_u(rx0)
                u_max = map_x_to_u(rx1)
                v_min = map_y_to_v(ry1)
                v_max = map_y_to_v(ry0)
                return {
                    "offsetU": u_min,
                    "offsetV": v_min,
                    "repeatU": round(u_max - u_min, 6),
                    "repeatV": round(v_max - v_min, 6),
                }

            # Dieline columns (0..3):
            #   Col 0: Front (BlueStone logo + Slow Cooker graphic)
            #   Col 1: Side  (Shipping Marks & Spec table)
            #   Col 2: Back  (BlueStone logo + Slow Cooker graphic)
            #   Col 3: Side  (Shipping Marks & Spec table)
            # Clean kraft flap region: Col 1, Row 2 (bottom flap — 100% clean unprinted kraft)
            clean_kraft_uv = panel_uv(col_idx=1, row_idx=2, extra_pad_px=24.0)

            return {
                "front": panel_uv(col_idx=0, row_idx=1),
                "right": panel_uv(col_idx=1, row_idx=1),
                "back": panel_uv(col_idx=2, row_idx=1),
                "left": panel_uv(col_idx=3, row_idx=1),
                "topLid": clean_kraft_uv,
                "base": clean_kraft_uv,
                "flap": clean_kraft_uv,
            }


def rasterize_pdf_to_png(pdf_path: Path, out_png: Path, kraft_tint: bool = False) -> None:
    """Rasterize a PDF using macOS sips, then resize to 4096x4096 Web-sRGB PNG."""
    if not pdf_path.exists():
        raise FileNotFoundError(f"Source PDF not found: {pdf_path}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_png = Path(tmpdir) / f"{pdf_path.stem}_raw.png"
        subprocess.run(
            ["sips", "-s", "format", "png", "-Z", "4096", str(pdf_path), "--out", str(tmp_png)],
            check=True,
            capture_output=True,
        )

        with Image.open(tmp_png) as img:
            img = _to_rgb(img, (210, 180, 140) if kraft_tint else (255, 255, 255))

            if kraft_tint:
                kraft_overlay = Image.new("RGB", img.size, (206, 174, 134))
                img = Image.blend(img, kraft_overlay, alpha=0.08)
                img = ImageEnhance.Contrast(img).enhance(1.04)

            img.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)
            canvas = Image.new(
                "RGB",
                TARGET_SIZE,
                (206, 174, 134) if kraft_tint else (255, 255, 255),
            )
            offset = (
                (TARGET_SIZE[0] - img.width) // 2,
                (TARGET_SIZE[1] - img.height) // 2,
            )
            canvas.paste(img, offset)
            out_png.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(out_png, format="PNG", optimize=True)


def bake_giftbox_dieline_texture(preview_jpg: Path, fallback_pdf: Path, out_png: Path) -> Dict[str, List[float]]:
    """
    Bake the authentic SCB-6119 Gift Box dieline from Gift_box_SCB-6119_preview.jpg
    (or fallback PDF), cropping out the sheet title block, white margins, and
    dimension callout lines, saving a clean 4096x4096 Web-sRGB PNG, and returning
    exact normalized Three.js uvBounds [uMin, vMin, uMax, vMax] per panel.
    """
    if preview_jpg.exists():
        raw_img = Image.open(preview_jpg).convert("RGB")
    elif fallback_pdf.exists():
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_png = Path(tmpdir) / f"{fallback_pdf.stem}_raw.png"
            subprocess.run(
                ["sips", "-s", "format", "png", "-Z", "5120", str(fallback_pdf), "--out", str(tmp_png)],
                check=True,
                capture_output=True,
            )
            raw_img = _to_rgb(Image.open(tmp_png), (255, 255, 255))
    else:
        raise FileNotFoundError(f"Gift box source not found: {preview_jpg} / {fallback_pdf}")

    with raw_img:
        w, h = raw_img.size
        arr = np.array(raw_img)

        # Detect tan kraft artwork rectangle inside the white technical sheet
        # (match warm tan kraft pixels only, strictly excluding black dimension callouts "330"/"230")
        sub_y0, sub_y1 = int(h * 0.11), int(h * 0.94)
        sub_x0, sub_x1 = int(w * 0.12), int(w * 0.94)
        sub = arr[sub_y0:sub_y1, sub_x0:sub_x1]
        is_kraft = (sub[:, :, 0] > 165) & (sub[:, :, 1] > 140) & (sub[:, :, 2] < 155)
        ys, xs = np.where(is_kraft)

        if len(xs) > 1000:
            crop_x0 = sub_x0 + int(xs.min()) + 4
            crop_x1 = sub_x0 + int(xs.max()) - 4
            crop_y0 = sub_y0 + int(ys.min()) + 4
            crop_y1 = sub_y0 + int(ys.max()) - 4
        else:
            crop_x0, crop_y0 = int(w * (1232 / 8117)), int(h * (780 / 5740))
            crop_x1, crop_y1 = int(w * (7082 / 8117)), int(h * (5085 / 5740))

        cropped = raw_img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
        cw, ch = cropped.size

        # Sample clean background kraft/duplex color near right margin of cropped artwork
        sample_rgb = tuple(int(c) for c in cropped.getpixel((int(cw * 0.96), int(ch * 0.50))))

        # Scale into 4096x4096 preserving exact aspect ratio
        scale = min(TARGET_SIZE[0] / cw, TARGET_SIZE[1] / ch)
        scaled_w = int(round(cw * scale))
        scaled_h = int(round(ch * scale))
        resized = cropped.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

        offset_x = (TARGET_SIZE[0] - scaled_w) // 2
        offset_y = (TARGET_SIZE[1] - scaled_h) // 2

        canvas = Image.new("RGB", TARGET_SIZE, sample_rgb)
        canvas.paste(resized, (offset_x, offset_y))

        out_png.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out_png, format="PNG", optimize=True)

        # Verified panel crease coordinates scaled to source dimensions (from 8117x5740 master)
        sx = w / 8117.0
        sy = h / 5740.0
        v_cols = [x * sx for x in (1280.5, 2639.5, 3997.5, 5355.5, 6713.5)]
        y_top_flap_0 = 943.0 * sy
        y_body_top = 2255.0 * sy
        y_body_bot = 4204.0 * sy
        y_bot_flap_1 = 5060.0 * sy

        uv_pad_px = 5.0

        def map_x_to_u(raw_x: float) -> float:
            cx = offset_x + (raw_x - crop_x0) * scale
            return round(max(0.0, min(1.0, cx / TARGET_SIZE[0])), 6)

        def map_y_to_v(raw_y: float) -> float:
            cy = offset_y + (raw_y - crop_y0) * scale
            return round(max(0.0, min(1.0, 1.0 - (cy / TARGET_SIZE[1]))), 6)

        def rect_uv(rx0: float, ry0: float, rx1: float, ry1: float) -> List[float]:
            pad_raw = uv_pad_px / scale
            return [
                map_x_to_u(rx0 + pad_raw),
                map_y_to_v(ry1 - pad_raw),
                map_x_to_u(rx1 - pad_raw),
                map_y_to_v(ry0 + pad_raw),
            ]

        return {
            "panel_front": rect_uv(v_cols[0], y_body_top, v_cols[1], y_body_bot),
            "panel_right": rect_uv(v_cols[1], y_body_top, v_cols[2], y_body_bot),
            "panel_back": rect_uv(v_cols[2], y_body_top, v_cols[3], y_body_bot),
            "panel_left": rect_uv(v_cols[3], y_body_top, v_cols[4], y_body_bot),
            "top_gable_front": rect_uv(v_cols[0], y_top_flap_0, v_cols[1], y_body_top),
            "top_handle_right": rect_uv(v_cols[1], y_top_flap_0, v_cols[2], y_body_top),
            "top_gable_back": rect_uv(v_cols[2], y_top_flap_0, v_cols[3], y_body_top),
            "top_handle_left": rect_uv(v_cols[3], y_top_flap_0, v_cols[4], y_body_top),
            "bottom_snap_front": rect_uv(v_cols[0], y_body_bot, v_cols[1], y_bot_flap_1),
            "bottom_snap_right": rect_uv(v_cols[1], y_body_bot, v_cols[2], y_bot_flap_1),
            "bottom_snap_back": rect_uv(v_cols[2], y_body_bot, v_cols[3], y_bot_flap_1),
            "bottom_snap_left": rect_uv(v_cols[3], y_body_bot, v_cols[4], y_bot_flap_1),
        }


def write_pbr_config(
    carton_uv_regions: Dict[str, Dict[str, float]],
    giftbox_uv_bounds: Dict[str, List[float]],
) -> None:
    """Write PBR material, geometry dimensions, and FEFCO UV mapping config for SCB-6119."""
    config = {
        "modelId": "SCB-6119",
        "topology": "FEFCO 0201 / FEFCO 0215",
        "dimensions": SCB6119_DIMENSIONS_MM,
        "giftBoxDimensions": {
            "length": 230,
            "width": 230,
            "height": 330,
            "caliperMm": 1.8,
            "unit": "mm",
        },
        "panelAssignment": {
            "front": "BlueStone logo + Slow Cooker graphic (Panel 0)",
            "back": "BlueStone logo + Slow Cooker graphic (Panel 2)",
            "left": "Shipping Marks & Spec table (Panel 3)",
            "right": "Shipping Marks & Spec table (Panel 1)",
            "topLid": "Clean kraft substrate (Bottom Flap sample)",
            "base": "Clean kraft substrate (Bottom Flap sample)",
            "flap": "Clean kraft substrate (Bottom Flap sample)",
        },
        "materials": {
            "carton": {
                "map": "public/textures/packaging/SCB-6119/carton_scb6119_albedo.png",
                "publicUrl": "/textures/packaging/SCB-6119/carton_scb6119_albedo.png",
                "roughness": 0.82,
                "metalness": 0.02,
                "bumpScale": 0.005,
                "panelUvRegions": carton_uv_regions,
            },
            "giftBox": {
                "map": "public/textures/packaging/SCB-6119/giftbox_scb6119_albedo.png",
                "publicUrl": "/textures/packaging/SCB-6119/giftbox_scb6119_albedo.png",
                "roughness": 0.28,
                "clearcoat": 0.55,
                "clearcoatRoughness": 0.1,
                "panelUvBounds": giftbox_uv_bounds,
            },
        },
    }
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    carton_pdf = INPUT_DIR / "Carton_box_SCB-6119_adapted.pdf"
    giftbox_jpg = INPUT_DIR / "Gift_box_SCB-6119_preview.jpg"
    giftbox_pdf = INPUT_DIR / "Gift_box_SCB-6119_adapted.pdf"

    carton_out = OUTPUT_TEX_DIR / "carton_scb6119_albedo.png"
    giftbox_out = OUTPUT_TEX_DIR / "giftbox_scb6119_albedo.png"

    print(f"[1/3] Cropping & baking Carton Box dieline texture -> {carton_out}")
    carton_uv_regions = bake_carton_dieline_texture(carton_pdf, carton_out)

    print(f"[2/3] Cropping & baking Gift Box dieline texture -> {giftbox_out}")
    giftbox_uv_bounds = bake_giftbox_dieline_texture(giftbox_jpg, giftbox_pdf, giftbox_out)

    print(f"[3/3] Writing PBR material & geometry config -> {CONFIG_PATH}")
    write_pbr_config(carton_uv_regions, giftbox_uv_bounds)

    print("Done! SCB-6119 Carton & Gift Box 4K textures baked and config updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
