#!/usr/bin/env python3
"""Reconstruct IM Front Cover for SCB-6119 with genuine multi-layer PSD export."""

from __future__ import annotations

import json
import math
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
import pytoshop
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from pytoshop.enums import ColorMode, Compression
from pytoshop.user import nested_layers

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = REPO_ROOT / "src/config/im_cover_reconstruction_contract.json"
OUT_PNG = REPO_ROOT / "local_assets/output/SCB-6119/Bia_IM_SCB-6119_adapted.png"
OUT_JPG = REPO_ROOT / "local_assets/output/SCB-6119/Bia_IM_SCB-6119_preview.jpg"
OUT_PSD = REPO_ROOT / "local_assets/output/SCB-6119/Bia_IM_SCB-6119_adapted.psd"
OUT_SVG = REPO_ROOT / "local_assets/output/SCB-6119/im_signature_frame.svg"

FONT_MAP = {
    "SVN-GilroyBold": Path("/Users/macbookpro/Library/Fonts/SVN-Gilroy Bold.otf"),
    "SVN-GilroyRegular": Path("/Users/macbookpro/Library/Fonts/SVN-Gilroy Regular.otf"),
    "Inter_Medium": Path("/Users/macbookpro/Library/Fonts/Inter_18pt-Medium.ttf"),
    "Inter_Regular": Path("/Users/macbookpro/Library/Fonts/Inter-roman.ttf"),
}


def pt_to_px(pt: float, dpi: int = 300) -> float:
    return pt * (dpi / 72.0)


def generate_and_render_signature_svg(svg_path: Path, w_px: int, h_px: int, frame_cfg: dict, dpi: int) -> Image.Image:
    """Generate crisp vector SVG for the signature frame and render it via PyMuPDF."""
    w_pt = w_px * 72.0 / dpi
    h_pt = h_px * 72.0 / dpi
    m = float(frame_cfg["marginPt"])
    r_tl = float(frame_cfg["topLeftRadiusPt"])
    r_bl = float(frame_cfg["bottomLeftRadiusPt"])
    r_br = float(frame_cfg["bottomRightRadiusPt"])
    cx = float(frame_cfg["topRightChamferCut"]["xOffsetPt"])
    cy = float(frame_cfg["topRightChamferCut"]["yOffsetPt"])
    stroke_w = float(frame_cfg["strokeWidthPt"])
    stroke_c = frame_cfg["strokeColor"]

    x0, y0 = m, m
    x1, y1 = w_pt - m, h_pt - m

    d = (
        f"M {x0:.2f},{y0 + r_tl:.2f} "
        f"A {r_tl:.2f},{r_tl:.2f} 0 0 1 {x0 + r_tl:.2f},{y0:.2f} "
        f"L {x1 - cx:.2f},{y0:.2f} "
        f"L {x1:.2f},{y0 + cy:.2f} "
        f"L {x1:.2f},{y1 - r_br:.2f} "
        f"A {r_br:.2f},{r_br:.2f} 0 0 1 {x1 - r_br:.2f},{y1:.2f} "
        f"L {x0 + r_bl:.2f},{y1:.2f} "
        f"A {r_bl:.2f},{r_bl:.2f} 0 0 1 {x0:.2f},{y1 - r_bl:.2f} "
        f"Z"
    )

    svg_content = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w_pt:.2f}pt" height="{h_pt:.2f}pt" '
        f'viewBox="0 0 {w_pt:.2f} {h_pt:.2f}">\n'
        f'  <path d="{d}" fill="none" stroke="{stroke_c}" stroke-width="{stroke_w:.2f}" '
        f'stroke-linejoin="round" stroke-linecap="round" />\n'
        f'</svg>\n'
    )
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path.write_text(svg_content, encoding="utf-8")

    doc = fitz.open(svg_path)
    page = doc[0]
    scale_x = w_px / page.rect.width
    scale_y = h_px / page.rect.height
    pix = page.get_pixmap(matrix=fitz.Matrix(scale_x, scale_y), alpha=True)
    img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def render_ai_logo(ai_path: Path, target_width_px: int) -> Image.Image:
    """Render .ai vector logo to transparent RGBA Image."""
    doc = fitz.open(ai_path)
    page = doc[0]
    scale = target_width_px / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def load_font(family: str, weight: str | None, size_pt: float, dpi: int) -> ImageFont.FreeTypeFont:
    if family in FONT_MAP:
        key = family
    elif weight == "Medium":
        key = "Inter_Medium"
    else:
        key = "Inter_Regular"
    return ImageFont.truetype(str(FONT_MAP[key]), round(pt_to_px(size_pt, dpi)))


def rgba_to_pytoshop_layer(name: str, img: Image.Image) -> nested_layers.Image:
    """Convert an RGBA PIL Image to a pytoshop nested_layers.Image."""
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    # Channel order for pytoshop RGB: 0=R, 1=G, 2=B, -1=Alpha
    channels = {
        0: arr[:, :, 0],
        1: arr[:, :, 1],
        2: arr[:, :, 2],
        -1: arr[:, :, 3],
    }
    return nested_layers.Image(name=name, channels=channels, top=0, left=0, bottom=arr.shape[0], right=arr.shape[1])


def main() -> None:
    cfg = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    dim = cfg["canvasDimensions"]
    dpi = int(dim["targetDpi"])
    w, h = int(dim["canvasWidthPx"]), int(dim["canvasHeightPx"])
    ds = cfg["masterDesignSystem"]
    left = ds["leftContentHierarchy"]
    anchor_x = round(pt_to_px(left["anchorXPt"], dpi))
    text_color = "#4D4D4F"

    # Layer 1: Background
    layer_bg = Image.new("RGBA", (w, h), ds["background"])

    # Layer 2: Signature Frame (Vector SVG)
    layer_frame = generate_and_render_signature_svg(OUT_SVG, w, h, ds["signatureOuterFrame"], dpi)

    # Layer 3: Product
    layer_product = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cutout_path = REPO_ROOT / "local_assets/Brief_Packaging_Adaptation_BlueStone/SCB-6119/layout/POP/SCB-6119 copy.png"
    with Image.open(cutout_path) as cutout_src:
        cutout = cutout_src.convert("RGBA")
    target_prod_w = 520
    scale = target_prod_w / cutout.width
    cutout_resized = cutout.resize((target_prod_w, round(cutout.height * scale)), Image.Resampling.LANCZOS)
    prod_x = 880 - cutout_resized.width // 2
    prod_y = 860 - cutout_resized.height // 2
    layer_product.alpha_composite(cutout_resized, (prod_x, prod_y))

    # Layer 4: BlueStone Logo (Independent Vector Layer)
    layer_logo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo_cfg = left["logo"]
    logo_img = render_ai_logo(REPO_ROOT / logo_cfg["asset"], round(pt_to_px(logo_cfg["widthPt"], dpi)))
    layer_logo.alpha_composite(logo_img, (anchor_x, round(pt_to_px(logo_cfg["topYPt"], dpi))))

    # Layer 4: Typography
    layer_type = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_type = ImageDraw.Draw(layer_type)
    title_y = round(pt_to_px(left["productTitle"]["topYPt"], dpi))
    draw_type.text((anchor_x, title_y), "NỒI", font=load_font("SVN-GilroyRegular", None, 21.0, dpi), fill=text_color)
    draw_type.text(
        (anchor_x, title_y + round(pt_to_px(29.0, dpi))),
        "NẤU CHẬM",
        font=load_font("SVN-GilroyBold", None, 21.0, dpi),
        fill=text_color,
    )

    sub_cfg = left["subtitle"]
    draw_type.text(
        (anchor_x, round(pt_to_px(sub_cfg["topYPt"], dpi))),
        sub_cfg["text"],
        font=load_font(sub_cfg["fontFamily"], sub_cfg.get("fontWeight"), sub_cfg["fontSizePt"], dpi),
        fill=text_color,
    )

    mod_cfg = left["modelSpec"]
    draw_type.text(
        (anchor_x, round(pt_to_px(mod_cfg["topYPt"], dpi))),
        mod_cfg["text"],
        font=load_font(mod_cfg["fontFamily"], mod_cfg.get("fontWeight"), mod_cfg["fontSizePt"], dpi),
        fill=text_color,
    )

    foot_cfg = left["bottomSafetyNotice"]
    draw_type.multiline_text(
        (anchor_x, round(pt_to_px(foot_cfg["bottomYPt"] - 18.0, dpi))),
        foot_cfg["text"],
        font=load_font(foot_cfg["fontFamily"], foot_cfg.get("fontWeight"), foot_cfg["fontSizePt"], dpi),
        fill=text_color,
        spacing=6,
    )

    # Export multi-layer PSD (bottom-to-top in pytoshop)
    OUT_PSD.parent.mkdir(parents=True, exist_ok=True)
    psd_layers = [
        rgba_to_pytoshop_layer("Typography", layer_type),
        rgba_to_pytoshop_layer("BlueStone Logo", layer_logo),
        rgba_to_pytoshop_layer("Product", layer_product),
        rgba_to_pytoshop_layer("Signature Frame", layer_frame),
        rgba_to_pytoshop_layer("Background", layer_bg),
    ]
    psd_doc = nested_layers.nested_layers_to_psd(psd_layers, color_mode=ColorMode.rgb, size=(w, h), compression=Compression.raw)
    with open(OUT_PSD, "wb") as f:
        psd_doc.write(f)

    # Composite flat PNG & preview JPG
    composite = Image.alpha_composite(layer_bg, layer_frame)
    composite = Image.alpha_composite(composite, layer_product)
    composite = Image.alpha_composite(composite, layer_logo)
    composite = Image.alpha_composite(composite, layer_type)
    rgb = composite.convert("RGB")
    rgb.save(OUT_PNG, format="PNG", dpi=(dpi, dpi))
    rgb.save(OUT_JPG, format="JPEG", quality=92, dpi=(150, 150))

    # Gatekeeper verification with psd-tools
    psd = PSDImage.open(OUT_PSD)
    layer_names = [layer.name.rstrip("\x00") for layer in psd]
    print("Confirmed Layers:", layer_names)
    assert "BlueStone Logo" in layer_names and "Signature Frame" in layer_names, "Missing required layers!"
    assert len(psd) >= 5, "Must contain 5 individual layers!"
    print(f"✅ Vector SVG saved: {OUT_SVG}")
    print(f"✅ 5-layer PSD saved: {OUT_PSD}")
    print(f"✅ 300 DPI PNG saved: {OUT_PNG}")
    print(f"✅ 150 DPI preview JPG saved: {OUT_JPG}")


if __name__ == "__main__":
    main()
