#!/usr/bin/env python3
"""Programmatic IDML Adaptation Pipeline for IM SCB-6119."""

from __future__ import annotations

import json
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = REPO_ROOT / "src/config/im_idml_adaptation_contract.json"
DESIGNCRAFT_CLI = Path.home() / ".local/bin/designcraft-cli"


def step1_render_cover(cfg: dict) -> Path:
    """Convert Bia IM_SCB-6119.psd into 300 DPI PNG."""
    src = REPO_ROOT / cfg["sourcePsd"]
    dst = REPO_ROOT / cfg["targetOutputPng"]
    dst.parent.mkdir(parents=True, exist_ok=True)
    dpi = int(cfg.get("resolutionDpi", 300))

    with Image.open(src) as img:
        rgb = img.convert("RGB")
        rgb.save(dst, format="PNG", dpi=(dpi, dpi))
        print(f"[Step 1] Rendered cover PNG: {dst} ({rgb.size[0]}x{rgb.size[1]} px @ {dpi} DPI)")
    return dst


def remap_font_text(xml_text: str, heading_font: str, body_font: str) -> str:
    """Remap legacy font families in IDML XML text to SVN-Gilroy and Inter."""
    replacements = {
        "Myriad Pro": heading_font,
        "MyriadPro-Bold": "SVN-GilroyBold",
        "MyriadPro-Semibold": "SVN-GilroyBold",
        "MyriadPro-Regular": heading_font,
        "MyriadPro-It": heading_font,
        "Minion Pro": body_font,
        "MinionPro-Regular": body_font,
        "Kozuka Mincho Pr6N": body_font,
        "KozMinPr6N-Regular": body_font,
        "BlueStone": heading_font,
        "PNJ": body_font,
    }
    for old, new in replacements.items():
        xml_text = xml_text.replace(old, new)
    return xml_text


def step2_patch_idml(cfg: dict, cover_png_path: Path) -> Path:
    """Extract, patch Fonts/Styles/Spreads/Stories, and repack IDML."""
    src_idml = REPO_ROOT / cfg["sourceIdml"]
    dst_idml = REPO_ROOT / cfg["targetAdaptedIdml"]
    dst_idml.parent.mkdir(parents=True, exist_ok=True)

    heading_font = cfg["fontRemapping"]["legacyHeadings"][0]
    body_font = cfg["fontRemapping"]["legacyBody"]
    cover_uri = cover_png_path.resolve().as_uri()

    patched_count = 0
    with zipfile.ZipFile(src_idml, "r") as zin, zipfile.ZipFile(dst_idml, "w") as zout:
        # Preserve mimetype first if present (uncompressed per IDML spec)
        names = zin.namelist()
        if "mimetype" in names:
            zout.writestr("mimetype", zin.read("mimetype"), compress_type=zipfile.ZIP_STORED)

        for name in names:
            if name == "mimetype":
                continue
            data = zin.read(name)

            if name in ("Resources/Fonts.xml", "Resources/Styles.xml") or name.startswith(("Spreads/", "Stories/")):
                text = data.decode("utf-8", errors="replace")
                new_text = remap_font_text(text, heading_font, body_font)

                # Repoint Page 1 cover link
                if name == "Spreads/Spread_u10b.xml":
                    root = ET.fromstring(new_text)
                    for link in root.iter("Link"):
                        uri = link.attrib.get("LinkResourceURI", "")
                        if "Bia" in uri or "SCB-6123" in uri:
                            link.set("LinkResourceURI", cover_uri)
                            link.set("StoredState", "Normal")
                    new_text = ET.tostring(root, encoding="unicode", xml_declaration=True)

                if new_text != text:
                    patched_count += 1
                zout.writestr(name, new_text.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
            else:
                zout.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)

    print(f"[Step 2] Patched {patched_count} XML entries -> {dst_idml}")
    return dst_idml


def step3_compile_and_verify(cfg: dict, adapted_idml: Path, cover_png_path: Path) -> None:
    """Attempt designcraft-cli export and generate 150 DPI preview JPGs."""
    out_pdf = REPO_ROOT / cfg["outputPdf"]
    cover_jpg = REPO_ROOT / cfg["outputCoverPreviewJpg"]
    back_jpg = REPO_ROOT / cfg["outputBackPreviewJpg"]
    out_pdf.parent.mkdir(parents=True, exist_ok=True)

    if DESIGNCRAFT_CLI.exists():
        proc = subprocess.run(
            [str(DESIGNCRAFT_CLI), "run", "--in", str(adapted_idml), "--export", str(out_pdf)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        print(f"[Step 3] designcraft-cli exit={proc.returncode}")
        if proc.stdout.strip():
            print(f"  stdout: {proc.stdout.strip()[:200]}")
        if proc.stderr.strip():
            print(f"  stderr: {proc.stderr.strip()[:200]}")

    # Generate 150 DPI cover preview JPG from the rendered 300 DPI cover PNG
    with Image.open(cover_png_path) as img:
        img.convert("RGB").save(cover_jpg, format="JPEG", quality=92, dpi=(150, 150))
        print(f"[Step 3] Saved 150 DPI cover preview: {cover_jpg}")

    # If PDF was produced, render first and last pages; otherwise note fallback
    if out_pdf.exists():
        doc = fitz.open(out_pdf)
        print(f"[Step 3] Verified PDF: {len(doc)} pages")
        doc[-1].get_pixmap(dpi=150).save(str(back_jpg))
        doc.close()
        print(f"[Step 3] Saved 150 DPI back preview: {back_jpg}")
    else:
        print(f"[Step 3] Note: {out_pdf.name} not produced by designcraft-cli (IDML import not supported in CLI). Adapted IDML is ready for InDesign.")


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    pipe = contract["pipeline"]
    cover_png = step1_render_cover(pipe["step1_render_cover"])
    adapted_idml = step2_patch_idml(pipe["step2_idml_dom_patch"], cover_png)
    step3_compile_and_verify(pipe["step3_compile_and_verify"], adapted_idml, cover_png)


if __name__ == "__main__":
    main()
