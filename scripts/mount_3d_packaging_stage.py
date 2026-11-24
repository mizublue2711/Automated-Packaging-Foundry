#!/usr/bin/env python3
"""
Bake 3D packaging textures from 2D vector dielines (PDF/SVG) for SCB-6119
and configure PBR materials for the interactive 3D WebApp stage.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT_DIR = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT_DIR / "local_assets" / "output" / "SCB-6119"
OUTPUT_TEX_DIR = ROOT_DIR / "public" / "textures" / "packaging" / "SCB-6119"
CONFIG_PATH = ROOT_DIR / "src" / "config" / "packaging_3d_materials.json"

TARGET_SIZE = (4096, 4096)


def rasterize_pdf_to_png(pdf_path: Path, out_png: Path, kraft_tint: bool = False) -> None:
    """Rasterize a PDF using macOS sips, then resize to 4096x4096 Web-sRGB PNG."""
    if not pdf_path.exists():
        raise FileNotFoundError(f"Source PDF not found: {pdf_path}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_png = Path(tmpdir) / f"{pdf_path.stem}_raw.png"
        # Use sips to render PDF at high resolution
        subprocess.run(
            ["sips", "-s", "format", "png", "-Z", "4096", str(pdf_path), "--out", str(tmp_png)],
            check=True,
            capture_output=True,
        )

        with Image.open(tmp_png) as img:
            # Convert CMYK / RGBA / P to Web-sRGB
            if img.mode == "CMYK":
                img = img.convert("RGB")
            elif img.mode != "RGB":
                bg = Image.new("RGB", img.size, (210, 180, 140) if kraft_tint else (255, 255, 255))
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    rgba = img.convert("RGBA")
                    bg.paste(rgba, mask=rgba.split()[3])
                    img = bg
                else:
                    img = img.convert("RGB")

            if kraft_tint:
                # Subtle warm kraft base tone & contrast boost for WebGL albedo
                kraft_overlay = Image.new("RGB", img.size, (206, 174, 134))
                img = Image.blend(img, kraft_overlay, alpha=0.08)
                img = ImageEnhance.Contrast(img).enhance(1.04)

            # Fit into 4096x4096 canvas preserving aspect ratio
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


def write_pbr_config() -> None:
    """Write PBR material configuration for SCB-6119."""
    config = {
        "modelId": "SCB-6119",
        "materials": {
            "carton": {
                "map": "public/textures/packaging/SCB-6119/carton_scb6119_albedo.png",
                "publicUrl": "/textures/packaging/SCB-6119/carton_scb6119_albedo.png",
                "roughness": 0.82,
                "metalness": 0.02,
                "bumpScale": 0.005,
            },
            "giftBox": {
                "map": "public/textures/packaging/SCB-6119/giftbox_scb6119_albedo.png",
                "publicUrl": "/textures/packaging/SCB-6119/giftbox_scb6119_albedo.png",
                "roughness": 0.28,
                "clearcoat": 0.55,
                "clearcoatRoughness": 0.1,
            },
        },
    }
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    carton_pdf = INPUT_DIR / "Carton_box_SCB-6119_adapted.pdf"
    giftbox_pdf = INPUT_DIR / "Gift_box_SCB-6119_adapted.pdf"

    carton_out = OUTPUT_TEX_DIR / "carton_scb6119_albedo.png"
    giftbox_out = OUTPUT_TEX_DIR / "giftbox_scb6119_albedo.png"

    print(f"[1/3] Baking Carton Box texture -> {carton_out}")
    rasterize_pdf_to_png(carton_pdf, carton_out, kraft_tint=True)

    print(f"[2/3] Baking Gift Box texture -> {giftbox_out}")
    rasterize_pdf_to_png(giftbox_pdf, giftbox_out, kraft_tint=False)

    print(f"[3/3] Writing PBR material config -> {CONFIG_PATH}")
    write_pbr_config()

    print("Done! SCB-6119 textures baked (4096x4096) and PBR config generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
