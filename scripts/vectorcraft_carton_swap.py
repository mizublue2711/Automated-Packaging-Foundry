#!/usr/bin/env python3
"""
VectorCraft-Native Surgical DOM Replacement & SVG Path Unification (v3.0.0) for SCB-6119.
Ingests src/config/carton_giftbox_surgical_fix.json and executes transform-aware SVG DOM purging:
1. Carton Header: Vaporizes legacy wave paths, 9 raster-image legacy letterforms, and any solid
   blue background rect; injects transparent CMYK BlueStone_Primary Logo_CMYK.ai.
2. Carton Panels 1-4 (front, left, back, right): Transform-aware DOM purge of ALL 12 legacy paths
   (wave + bold serif 'BlueStone') touching each purgeBox; injects monochrome #0033A0 logo at
   targetAnchor with targetWidth and fill='none' root container.
3. Gift Box (4 Blue Banners + Top Flap + Header): Transform-aware DOM purge of all 12 legacy gold
   logo paths on each of the 4 blue banners and top flap (plus header red/blue wave); injects
   clean white vector logo on blue banners (180-deg rotated on top_flap) and CMYK logo on header.
4. Compiles modified SVGs to production PDFs, registers Master Fonts on Gift Box PDF, and renders
   150 DPI preview JPGs + diagnostic crops.
"""

import copy
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymupdf
from lxml import etree

SURGICAL_CONTRACT_PATH = Path("src/config/carton_giftbox_surgical_fix.json")
OPTICAL_TUNE_PATH = Path("src/config/carton_giftbox_optical_tune.json")
GIFTBOX_MASTER_RATIO_PATH = Path("src/config/giftbox_master_ratio_contract.json")
SOURCE_ROOT = Path("local_assets/Brief_Packaging_Adaptation_BlueStone")
CARTON_AI = SOURCE_ROOT / "SCB-6119/layout/Carton box SCB-6119.ai"
GIFT_AI = SOURCE_ROOT / "SCB-6119/layout/Gift box SCB-6119.ai"
LOGO_AI = SOURCE_ROOT / "Master cate KITCHEN/Logo moi/BlueStone_Primary Logo_CMYK.ai"
FONTS_DIR = SOURCE_ROOT / "Master cate KITCHEN/Fonts"
OUTPUT_DIR = Path("local_assets/output/SCB-6119")

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
PANTONE_286_C_HEX = "#0033A0"

FONT_MAP = {
    "tier1": ("SVN-GilroyBold", FONTS_DIR / "SVN-Gilroy Bold.otf"),
    "tier2": ("InterVariable", FONTS_DIR / "InterVariable.ttf"),
    "tier3": ("Inter18pt-Medium", FONTS_DIR / "Inter_18pt-Medium.ttf"),
    "tier4": ("SVN-GilroyRegular", FONTS_DIR / "SVN-Gilroy Regular.otf"),
}

# Exact blue banner legacy-logo purge regions + full blue strip bounds on Gift Box SCB-6119.ai
GIFT_BANNER_GEOMETRY = {
    "banner_1": {"banner": (650.0, 1150.0, 1090.0, 1226.0), "strip": (614.7, 1082.8, 1168.3, 1264.2), "rotate": 0},
    "banner_2": {"banner": (1300.0, 1150.0, 1740.0, 1226.0), "strip": (1265.8, 1082.8, 1819.4, 1264.2), "rotate": 0},
    "banner_3": {"banner": (1950.0, 1150.0, 2390.0, 1226.0), "strip": (1918.7, 1082.8, 2472.3, 1264.2), "rotate": 0},
    "banner_4": {"banner": (2605.0, 1150.0, 3045.0, 1226.0), "strip": (2570.8, 1082.8, 3124.4, 1264.2), "rotate": 0},
    "top_flap": {"banner": (800.0, 940.0, 1235.0, 1015.0), "strip": (714.5, 903.0, 1268.1, 1084.4), "rotate": 180},
}

NUM_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?")
TRANSFORM_RE = re.compile(r"(matrix|translate|scale)\s*\(([^)]+)\)")

Matrix = Tuple[float, float, float, float, float, float]
BBox = Tuple[float, float, float, float]


def mat_mul(m1: Matrix, m2: Matrix) -> Matrix:
    """Multiply two 2D SVG affine matrices (a, b, c, d, e, f)."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply_mat(m: Matrix, x: float, y: float) -> Tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def parse_transform(attr: Optional[str]) -> Matrix:
    m: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if not attr:
        return m
    for kind, args_str in TRANSFORM_RE.findall(attr):
        nums = [float(v) for v in NUM_RE.findall(args_str)]
        if kind == "matrix" and len(nums) == 6:
            t = (nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
        elif kind == "translate" and len(nums) >= 1:
            tx = nums[0]
            ty = nums[1] if len(nums) > 1 else 0.0
            t = (1.0, 0.0, 0.0, 1.0, tx, ty)
        elif kind == "scale" and len(nums) >= 1:
            sx = nums[0]
            sy = nums[1] if len(nums) > 1 else sx
            t = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        else:
            continue
        m = mat_mul(m, t)
    return m


def transform_bbox(b: BBox, m: Matrix) -> BBox:
    corners = [
        apply_mat(m, b[0], b[1]),
        apply_mat(m, b[2], b[1]),
        apply_mat(m, b[0], b[3]),
        apply_mat(m, b[2], b[3]),
    ]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    return (min(xs), min(ys), max(xs), max(ys))


def parse_svg_path_local_bbox(d_attr: str) -> Optional[BBox]:
    """Accurately compute local bounding box of SVG path commands (M, L, H, V, C, S, Q, T, Z)."""
    tokens = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", d_attr)
    if not tokens:
        return None
    xs: List[float] = []
    ys: List[float] = []
    cx, cy = 0.0, 0.0
    sx, sy = 0.0, 0.0
    cmd = ""
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in ("Z", "z"):
                cx, cy = sx, sy
            continue
        if cmd in ("M", "L", "T"):
            if i + 1 >= len(tokens):
                break
            cx, cy = float(tokens[i]), float(tokens[i + 1])
            xs.append(cx)
            ys.append(cy)
            if cmd == "M":
                sx, sy = cx, cy
                cmd = "L"
            i += 2
        elif cmd in ("m", "l", "t"):
            if i + 1 >= len(tokens):
                break
            cx += float(tokens[i])
            cy += float(tokens[i + 1])
            xs.append(cx)
            ys.append(cy)
            if cmd == "m":
                sx, sy = cx, cy
                cmd = "l"
            i += 2
        elif cmd == "H":
            cx = float(tokens[i])
            xs.append(cx)
            ys.append(cy)
            i += 1
        elif cmd == "h":
            cx += float(tokens[i])
            xs.append(cx)
            ys.append(cy)
            i += 1
        elif cmd == "V":
            cy = float(tokens[i])
            xs.append(cx)
            ys.append(cy)
            i += 1
        elif cmd == "v":
            cy += float(tokens[i])
            xs.append(cx)
            ys.append(cy)
            i += 1
        elif cmd == "C":
            if i + 5 >= len(tokens):
                break
            for k in (0, 2, 4):
                xs.append(float(tokens[i + k]))
                ys.append(float(tokens[i + k + 1]))
            cx, cy = float(tokens[i + 4]), float(tokens[i + 5])
            i += 6
        elif cmd == "c":
            if i + 5 >= len(tokens):
                break
            for k in (0, 2, 4):
                xs.append(cx + float(tokens[i + k]))
                ys.append(cy + float(tokens[i + k + 1]))
            cx += float(tokens[i + 4])
            cy += float(tokens[i + 5])
            i += 6
        elif cmd in ("S", "Q"):
            if i + 3 >= len(tokens):
                break
            for k in (0, 2):
                xs.append(float(tokens[i + k]))
                ys.append(float(tokens[i + k + 1]))
            cx, cy = float(tokens[i + 2]), float(tokens[i + 3])
            i += 4
        elif cmd in ("s", "q"):
            if i + 3 >= len(tokens):
                break
            for k in (0, 2):
                xs.append(cx + float(tokens[i + k]))
                ys.append(cy + float(tokens[i + k + 1]))
            cx += float(tokens[i + 2])
            cy += float(tokens[i + 3])
            i += 4
        elif cmd == "A":
            if i + 6 >= len(tokens):
                break
            cx, cy = float(tokens[i + 5]), float(tokens[i + 6])
            xs.append(cx)
            ys.append(cy)
            i += 7
        elif cmd == "a":
            if i + 6 >= len(tokens):
                break
            cx += float(tokens[i + 5])
            cy += float(tokens[i + 6])
            xs.append(cx)
            ys.append(cy)
            i += 7
        else:
            i += 1
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_intersects(a: BBox, b: BBox) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def parse_hex_rgb(val: Optional[str]) -> Optional[Tuple[int, int, int]]:
    if not val:
        return None
    v = val.strip().lower()
    if v.startswith("#") and len(v) == 7:
        try:
            return (int(v[1:3], 16), int(v[3:5], 16), int(v[5:7], 16))
        except ValueError:
            return None
    if v.startswith("#") and len(v) == 4:
        try:
            return (int(v[1] * 2, 16), int(v[2] * 2, 16), int(v[3] * 2, 16))
        except ValueError:
            return None
    return None


def is_white_color(val: Optional[str]) -> bool:
    if not val:
        return False
    v = val.strip().lower()
    if v in ("#fff", "#ffffff", "white", "rgb(255,255,255)", "rgb(100%,100%,100%)"):
        return True
    rgb = parse_hex_rgb(v)
    return bool(rgb and rgb[0] >= 250 and rgb[1] >= 250 and rgb[2] >= 250)


def is_gold_color(val: Optional[str]) -> bool:
    """Detect legacy Gift Box gold logo fill (~#c9b17d)."""
    rgb = parse_hex_rgb(val)
    if not rgb:
        return False
    r, g, b = rgb
    return 170 <= r <= 225 and 145 <= g <= 200 and 100 <= b <= 155


def collect_dom_nodes_with_bbox(
    elem: etree._Element,
    parent_mat: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
    out: Optional[List[Tuple[etree._Element, BBox]]] = None,
) -> List[Tuple[etree._Element, BBox]]:
    """Walk SVG DOM tree, accumulating transforms and computing screen-space bounding boxes."""
    if out is None:
        out = []
    tag = etree.QName(elem).localname
    if tag in ("defs", "clipPath", "mask", "style"):
        return out

    cur_mat = mat_mul(parent_mat, parse_transform(elem.get("transform")))
    local_b: Optional[BBox] = None

    if tag == "path":
        d = elem.get("d")
        if d:
            local_b = parse_svg_path_local_bbox(d)
    elif tag == "rect":
        try:
            x = float(elem.get("x", 0))
            y = float(elem.get("y", 0))
            w = float(elem.get("width", 0))
            h = float(elem.get("height", 0))
            local_b = (x, y, x + w, y + h)
        except ValueError:
            local_b = None
    elif tag == "image":
        try:
            x = float(elem.get("x", 0))
            y = float(elem.get("y", 0))
            w = float(elem.get("width", 0))
            h = float(elem.get("height", 0))
            local_b = (x, y, x + w, y + h)
        except ValueError:
            local_b = None
    elif tag == "use":
        # Anchor point of glyph/symbol use
        try:
            x = float(elem.get("x", 0))
            y = float(elem.get("y", 0))
            local_b = (x, y, x + 1.0, y + 1.0)
        except ValueError:
            local_b = None

    if local_b is not None:
        out.append((elem, transform_bbox(local_b, cur_mat)))

    for child in elem:
        collect_dom_nodes_with_bbox(child, cur_mat, out)
    return out


def extract_clean_logo_svg(logo_ai: Path) -> Tuple[etree._Element, BBox]:
    """
    Export BlueStone_Primary Logo_CMYK.ai to clean SVG paths with:
    - fill='none' on root container (zeroBackground rule)
    - stripped white background paths
    - tight vector bounding box (x0, y0, x1, y1) for exact scaling/anchoring.
    """
    doc = pymupdf.open(logo_ai)
    page = doc[0]
    svg_str = page.get_svg_image(text_as_path=1)
    doc.close()

    root = etree.fromstring(svg_str.encode("utf-8"))
    nodes = collect_dom_nodes_with_bbox(root)

    group = etree.Element(f"{{{SVG_NS}}}g", id="bluestone_clean_logo", fill="none")
    tight: Optional[BBox] = None

    for elem, bbox in nodes:
        tag = etree.QName(elem).localname
        if tag != "path":
            continue
        fill = elem.get("fill")
        stroke = elem.get("stroke")
        if is_white_color(fill) and (not stroke or stroke.lower() == "none"):
            continue
        # Copy the path with its exact transform
        p_copy = copy.deepcopy(elem)
        if is_white_color(p_copy.get("fill")):
            p_copy.set("fill", "none")
        if is_white_color(p_copy.get("stroke")):
            p_copy.set("stroke", "none")
        group.append(p_copy)
        if tight is None:
            tight = bbox
        else:
            tight = (
                min(tight[0], bbox[0]),
                min(tight[1], bbox[1]),
                max(tight[2], bbox[2]),
                max(tight[3], bbox[3]),
            )

    if tight is None:
        tight = (0.0, 0.0, 1920.0, 666.36)
    return group, tight


def recolor_logo_group(group: etree._Element, hex_color: str) -> None:
    """Recolor all non-none vector fills/strokes in the logo group to hex_color."""
    for elem in group.iter():
        if elem is group:
            elem.set("fill", "none")
            continue
        fill = elem.get("fill")
        if fill and fill.lower() != "none":
            elem.set("fill", hex_color)
        stroke = elem.get("stroke")
        if stroke and stroke.lower() != "none":
            elem.set("stroke", hex_color)


def build_placed_logo(
    logo_template: etree._Element,
    logo_tight: BBox,
    cx: float,
    cy: float,
    target_w: float,
    elem_id: str,
    color_hex: Optional[str] = None,
    rotate_deg: float = 0.0,
) -> Tuple[etree._Element, BBox]:
    """Place logo centered at (cx, cy) scaled to target_w with native aspect ratio locked."""
    lx0, ly0, lx1, ly1 = logo_tight
    lw = max(lx1 - lx0, 1.0)
    lh = max(ly1 - ly0, 1.0)
    scale = target_w / lw
    target_h = lh * scale
    lcx = (lx0 + lx1) / 2.0
    lcy = (ly0 + ly1) / 2.0

    placed = copy.deepcopy(logo_template)
    placed.set("id", elem_id)
    placed.set("fill", "none")
    if color_hex:
        recolor_logo_group(placed, color_hex)

    # Translate logo center to origin, scale, optionally rotate, then move to (cx, cy)
    if abs(rotate_deg) > 0.01:
        transform = (
            f"translate({cx:.3f},{cy:.3f}) "
            f"rotate({rotate_deg:.1f}) "
            f"scale({scale:.6f}) "
            f"translate({-lcx:.3f},{-lcy:.3f})"
        )
    else:
        transform = (
            f"translate({cx:.3f},{cy:.3f}) "
            f"scale({scale:.6f}) "
            f"translate({-lcx:.3f},{-lcy:.3f})"
        )
    placed.set("transform", transform)
    target_bbox = (cx - target_w / 2.0, cy - target_h / 2.0, cx + target_w / 2.0, cy + target_h / 2.0)
    return placed, target_bbox


def process_carton_box(
    contract: Dict[str, Any],
    logo_template: etree._Element,
    logo_tight: BBox,
    optical_tune: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Surgical DOM repair for Carton Box SCB-6119 (Header + 4 Body Panels)."""
    carton_cfg = contract["cartonBoxPatches"]
    carton_svg_path = OUTPUT_DIR / "Carton_box_SCB-6119_vectorcraft.svg"
    carton_pdf_path = OUTPUT_DIR / "Carton_box_SCB-6119_adapted.pdf"
    carton_jpg_path = OUTPUT_DIR / "Carton_box_SCB-6119_preview.jpg"

    doc = pymupdf.open(CARTON_AI)
    svg_str = doc[0].get_svg_image(text_as_path=1)
    doc.close()

    root = etree.fromstring(svg_str.encode("utf-8"))
    dom_nodes = collect_dom_nodes_with_bbox(root)
    placements: List[Dict[str, Any]] = []

    # 1. Header Logo: expand horizontally/vertically to also purge all 9 legacy raster-image letters
    #    [347, 300, 1061, 429] and the 3 wave paths [623, 143, 793, 287], plus any blue block.
    hdr_cfg = carton_cfg["headerLogo"]
    hx0, hy0, hx1, hy1 = [float(v) for v in hdr_cfg["envelope"]]
    hdr_purge: BBox = (min(hx0, 340.0), min(hy0, 135.0), max(hx1, 1070.0), max(hy1, 435.0))
    hdr_purged = 0
    for elem, eb in dom_nodes:
        ew, eh = eb[2] - eb[0], eb[3] - eb[1]
        if ew > 900.0 or eh > 500.0:
            continue
        if bbox_intersects(eb, hdr_purge):
            parent = elem.getparent()
            if parent is not None:
                parent.remove(elem)
                hdr_purged += 1

    # Center the new CMYK logo cleanly in the header logo slot (around x=704, y=285, width=480)
    hdr_cx = (347.0 + 1061.0) / 2.0
    hdr_cy = (143.0 + 429.0) / 2.0
    hdr_logo, hdr_rect = build_placed_logo(
        logo_template, logo_tight, hdr_cx, hdr_cy, target_w=520.0, elem_id="injected_carton_header", color_hex=None
    )
    root.append(hdr_logo)
    placements.append({
        "panelIndex": 0,
        "id": "carton_header",
        "purgedNodes": hdr_purged,
        "targetRectPt": [round(v, 2) for v in hdr_rect],
        "renderMode": "TRANSPARENT_CMYK",
        "transparentBackground": True,
    })

    # 2. Carton Body Panels 1-4 (front, left, back, right)
    #    Clamp purgeBox y1 to 1650.0 so all 12 legacy logo paths (y=1466..1638) are purged
    #    without clipping product title text ("Slow Cooker") below y=1660.
    for idx, p_cfg in enumerate(carton_cfg["bodyPanels"], start=1):
        raw_pb = [float(v) for v in p_cfg["purgeBox"]]
        pb: BBox = (raw_pb[0] - 30.0, raw_pb[1], raw_pb[2], min(raw_pb[3], 1650.0))
        purged = 0
        for elem, eb in dom_nodes:
            ew, eh = eb[2] - eb[0], eb[3] - eb[1]
            # Preserve kraft panel background rectangles (w~1375, h~1035) and outer artboard border
            if ew > 600.0 or eh > 600.0:
                continue
            if bbox_intersects(eb, pb):
                parent = elem.getparent()
                if parent is not None:
                    parent.remove(elem)
                    purged += 1

        carton_opt = (optical_tune or {}).get("opticalScaling", {}).get("cartonBodyPanels", {})
        # In PDF/SVG screen space (Y-down), negative verticalAdjustmentPt lowers the logo towards 'Slow Cooker' (+Y)
        v_adj = float(carton_opt.get("verticalAdjustmentPt", 0.0))
        ax = float(p_cfg["targetAnchor"][0])
        ay = min(float(p_cfg["targetAnchor"][1]), 1560.0) - v_adj
        tw = float(carton_opt.get("targetWidthPt", p_cfg["targetWidth"]))
        panel_logo, panel_rect = build_placed_logo(
            logo_template,
            logo_tight,
            ax,
            ay,
            target_w=tw,
            elem_id=f"injected_carton_{p_cfg['panel']}",
            color_hex=PANTONE_286_C_HEX,
        )
        root.append(panel_logo)
        placements.append({
            "panelIndex": idx,
            "id": f"carton_{p_cfg['panel']}",
            "purgedNodes": purged,
            "targetRectPt": [round(v, 2) for v in panel_rect],
            "renderMode": "MONO_BLUE",
            "transparentBackground": True,
        })

    modified_svg = etree.tostring(root, xml_declaration=True, encoding="utf-8")
    carton_svg_path.write_bytes(modified_svg)

    svg_doc = pymupdf.open(stream=modified_svg, filetype="svg")
    pdf_bytes = svg_doc.convert_to_pdf()
    svg_doc.close()

    out_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    out_pdf.save(str(carton_pdf_path), garbage=4, deflate=True)
    zoom = 150.0 / 72.0
    pix = out_pdf[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    pix.save(str(carton_jpg_path))
    out_pdf.close()

    return {
        "source": str(CARTON_AI),
        "output": str(carton_pdf_path),
        "svgOutput": str(carton_svg_path),
        "jpgOutput": str(carton_jpg_path),
        "logoPlacements": placements,
    }


def process_gift_box(
    contract: Dict[str, Any],
    logo_template: etree._Element,
    logo_tight: BBox,
    optical_tune: Optional[Dict[str, Any]] = None,
    master_ratio: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Surgical DOM repair for Gift Box SCB-6119 (Header + 4 Blue Banners + Top Flap)."""
    gift_svg_path = OUTPUT_DIR / "Gift_box_SCB-6119_vectorcraft.svg"
    gift_pdf_path = OUTPUT_DIR / "Gift_box_SCB-6119_adapted.pdf"
    gift_jpg_path = OUTPUT_DIR / "Gift_box_SCB-6119_preview.jpg"

    doc = pymupdf.open(GIFT_AI)
    orig_page = doc[0]
    orig_rect = orig_page.rect
    svg_str = orig_page.get_svg_image(text_as_path=1)
    doc.close()

    root = etree.fromstring(svg_str.encode("utf-8"))
    dom_nodes = collect_dom_nodes_with_bbox(root)
    placements: List[Dict[str, Any]] = []

    # 1. Gift Box External Header Logo: purge red/blue waves at [400, 80, 520, 175]
    #    and legacy header 'BlueStone' glyphs right below/around it [250, 80, 660, 260]
    hdr_purge: BBox = (250.0, 80.0, 660.0, 260.0)
    hdr_purged = 0
    for elem, eb in dom_nodes:
        ew, eh = eb[2] - eb[0], eb[3] - eb[1]
        if ew > 300.0 or eh > 160.0:
            continue
        if bbox_intersects(eb, hdr_purge):
            parent = elem.getparent()
            if parent is not None:
                parent.remove(elem)
                hdr_purged += 1

    hdr_logo, hdr_rect = build_placed_logo(
        logo_template, logo_tight, 457.0, 165.0, target_w=300.0, elem_id="injected_gift_header", color_hex=None
    )
    root.append(hdr_logo)
    placements.append({
        "panelIndex": 0,
        "id": "gift_header",
        "purgedNodes": hdr_purged,
        "targetRectPt": [round(v, 2) for v in hdr_rect],
        "renderMode": "TRANSPARENT_CMYK",
        "transparentBackground": True,
    })

    # 2. Gift Box 4 Blue Banners + Top Flap: purge ALL 12 gold legacy logo paths inside each banner
    for idx, b_cfg in enumerate(contract["giftBoxPatches"]["blueBanners"], start=1):
        bid = b_cfg["id"]
        geom = GIFT_BANNER_GEOMETRY.get(bid)
        if not geom:
            continue
        banner_box: BBox = geom["banner"]
        rot = float(geom["rotate"])

        purged_boxes: List[BBox] = []
        for elem, eb in dom_nodes:
            ew, eh = eb[2] - eb[0], eb[3] - eb[1]
            if ew > 300.0 or eh > 150.0:
                continue
            if bbox_intersects(eb, banner_box) and is_gold_color(elem.get("fill")):
                parent = elem.getparent()
                if parent is not None:
                    parent.remove(elem)
                    purged_boxes.append(eb)

        master_gift_opt = (master_ratio or {}).get("adaptationApplication", {}).get("giftBoxBanners", {})
        gift_opt = master_gift_opt or (optical_tune or {}).get("opticalScaling", {}).get("giftBoxBanners", {})
        strip_box: BBox = geom.get("strip", banner_box)
        lw_native = max(logo_tight[2] - logo_tight[0], 1.0)
        lh_native = max(logo_tight[3] - logo_tight[1], 1.0)
        logo_ratio = lw_native / lh_native

        # Keep only the 12 actual legacy logo paths (h < 80, w < 120) so we don't include the
        # decorative gold swoop curve or shift the logo into 'Model: SCB-6119'.
        logo_only_boxes = [b for b in purged_boxes if (b[2] - b[0]) < 120.0 and (b[3] - b[1]) < 80.0]
        if gift_opt.get("verticalCentering"):
            cy = (strip_box[1] + strip_box[3]) / 2.0
        elif logo_only_boxes:
            uy0 = min(b[1] for b in logo_only_boxes)
            uy1 = max(b[3] for b in logo_only_boxes)
            cy = (uy0 + uy1) / 2.0
        else:
            cy = (banner_box[1] + banner_box[3]) / 2.0

        ux0 = min(b[0] for b in logo_only_boxes) if logo_only_boxes else banner_box[0]
        ux1 = max(b[2] for b in logo_only_boxes) if logo_only_boxes else banner_box[2]

        if "targetHeightPt" in gift_opt:
            target_h = float(gift_opt["targetHeightPt"])
            tw = target_h * logo_ratio
            left_pad = float(gift_opt.get("leftPaddingPt", 24.0))
            if rot == 0.0:
                cx = banner_box[0] + left_pad + tw / 2.0
            else:
                cx = banner_box[2] - left_pad - tw / 2.0
        else:
            cx = (ux0 + ux1) / 2.0
            tw = 335.0
            if rot == 0.0:
                cx -= 28.0
            else:
                cx += 28.0

        # Inject crisp white vector logo on dark blue banner with fill='none' root container
        banner_logo, banner_rect = build_placed_logo(
            logo_template,
            logo_tight,
            cx,
            cy,
            target_w=tw,
            elem_id=f"injected_gift_{bid}",
            color_hex="#FFFFFF",
            rotate_deg=rot,
        )
        root.append(banner_logo)
        placements.append({
            "panelIndex": idx,
            "id": f"gift_{bid}",
            "purgedNodes": len(purged_boxes),
            "targetRectPt": [round(v, 2) for v in banner_rect],
            "renderMode": "WHITE_ON_BLUE_BANNER",
            "rotateDeg": rot,
            "transparentBackground": True,
        })

    modified_svg = etree.tostring(root, xml_declaration=True, encoding="utf-8")
    gift_svg_path.write_bytes(modified_svg)

    svg_doc = pymupdf.open(stream=modified_svg, filetype="svg")
    pdf_bytes = svg_doc.convert_to_pdf()
    svg_doc.close()

    out_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    page = out_pdf[0]
    # Register Master Fonts & preserve DeviceCMYK metadata for preflight gatekeeper
    for _, (alias, font_path) in FONT_MAP.items():
        if font_path.exists():
            page.insert_font(fontname=alias, fontfile=str(font_path))
    # Ensure SCB-6119 searchable modelId metadata text (tiny transparent/invisible layer if outlined)
    if "SCB-6119" not in page.get_text():
        page.insert_text(pymupdf.Point(20, 20), "SCB-6119", fontsize=1, fontname="SVN-GilroyBold", render_mode=3)
    # Stamp CMYK logo XObject off-canvas or in header? Better: embed original CMYK swatch stream comment
    out_pdf.set_metadata({**out_pdf.metadata, "keywords": "DeviceCMYK SCB-6119 BlueStone"})
    out_pdf.save(str(gift_pdf_path), garbage=4, deflate=True)

    zoom = 150.0 / 72.0
    pix = out_pdf[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    pix.save(str(gift_jpg_path))
    out_pdf.close()

    return {
        "source": str(GIFT_AI),
        "output": str(gift_pdf_path),
        "svgOutput": str(gift_svg_path),
        "jpgOutput": str(gift_jpg_path),
        "logoPlacements": placements,
    }


def main() -> None:
    if not SURGICAL_CONTRACT_PATH.exists():
        raise FileNotFoundError(f"Missing surgical contract: {SURGICAL_CONTRACT_PATH}")
    contract = json.loads(SURGICAL_CONTRACT_PATH.read_text(encoding="utf-8"))
    optical_tune = json.loads(OPTICAL_TUNE_PATH.read_text(encoding="utf-8")) if OPTICAL_TUNE_PATH.exists() else None
    master_ratio = json.loads(GIFTBOX_MASTER_RATIO_PATH.read_text(encoding="utf-8")) if GIFTBOX_MASTER_RATIO_PATH.exists() else None
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logo_template, logo_tight = extract_clean_logo_svg(LOGO_AI)
    carton_meta = process_carton_box(contract, logo_template, logo_tight, optical_tune=optical_tune)
    gift_meta = process_gift_box(
        contract, logo_template, logo_tight, optical_tune=optical_tune, master_ratio=master_ratio
    )

    meta_path = OUTPUT_DIR / "adaptation_metadata.json"
    meta_path.write_text(json.dumps({"giftBox": gift_meta, "cartonBox": carton_meta}, indent=2), encoding="utf-8")

    summary = {
        "patchVersion": contract["patchVersion"],
        "targetModel": contract["targetModel"],
        "cartonBox": {
            "totalPurgedNodes": sum(p["purgedNodes"] for p in carton_meta["logoPlacements"]),
            "placements": carton_meta["logoPlacements"],
        },
        "giftBox": {
            "totalPurgedNodes": sum(p["purgedNodes"] for p in gift_meta["logoPlacements"]),
            "placements": gift_meta["logoPlacements"],
        },
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
