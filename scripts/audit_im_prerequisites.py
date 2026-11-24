#!/usr/bin/env python3
"""Read-only technical audit of Instruction Manual (IM) prerequisites for SCB-6119."""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from PIL import Image, ImageCms

REPO_ROOT = Path(__file__).resolve().parent.parent
IM_DIR = REPO_ROOT / "local_assets/Brief_Packaging_Adaptation_BlueStone/SCB-6119/layout/IM SCB-6119"
PSD_PATH = IM_DIR / "Bia IM_SCB-6119.psd"
MASTER_PDF_PATH = REPO_ROOT / "local_assets/Brief_Packaging_Adaptation_BlueStone/Master cate KITCHEN/IM Master.pdf"
REPORT_PATH = REPO_ROOT / "src/config/im_audit_report.json"
DESIGNCRAFT_CLI = Path.home() / ".local/bin/designcraft-cli"


def audit_directory_inventory(target_dir: Path) -> dict[str, Any]:
    """Scan target_dir recursively and list all files, extensions, sizes, and timestamps."""
    if not target_dir.exists():
        return {"exists": False, "path": str(target_dir), "files": [], "extensions": {}}

    files = []
    extensions: dict[str, int] = {}
    for root, _, filenames in os.walk(target_dir):
        for name in sorted(filenames):
            p = Path(root) / name
            stat = p.stat()
            ext = p.suffix.lower() or "(no_ext)"
            extensions[ext] = extensions.get(ext, 0) + 1
            files.append({
                "relative_path": str(p.relative_to(target_dir)),
                "extension": ext,
                "size_bytes": stat.st_size,
                "modified_iso": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })

    return {
        "exists": True,
        "path": str(target_dir),
        "total_files": len(files),
        "extensions": extensions,
        "files": files,
    }


def audit_psd_cover(psd_path: Path) -> dict[str, Any]:
    """Inspect Bia IM_SCB-6119.psd for dimensions, DPI, color mode, print size, and layers."""
    if not psd_path.exists():
        return {"exists": False, "path": str(psd_path)}

    info: dict[str, Any] = {"exists": True, "path": str(psd_path)}

    with Image.open(psd_path) as img:
        w_px, h_px = img.size
        dpi_raw = img.info.get("dpi")
        if isinstance(dpi_raw, tuple) and len(dpi_raw) == 2:
            dpi_x, dpi_y = float(dpi_raw[0]), float(dpi_raw[1])
        else:
            dpi_x = dpi_y = 72.0

        width_mm = (w_px / dpi_x) * 25.4 if dpi_x else None
        height_mm = (h_px / dpi_y) * 25.4 if dpi_y else None
        aspect_ratio = round(w_px / h_px, 4) if h_px else None

        # Single A5/portrait cover ~ 1 / 1.414 = 0.707; full wrap-around spread ~ 2 / 1.414 = 1.414
        if aspect_ratio is not None:
            if aspect_ratio >= 1.15:
                layout_type = "Full wrap-around spread (front + spine + back)"
            else:
                layout_type = "Single cover"
        else:
            layout_type = "Unknown"

        icc_profile = None
        if "icc_profile" in img.info:
            try:
                prof = ImageCms.ImageCmsProfile(img.info["icc_profile"])
                icc_profile = ImageCms.getProfileDescription(prof).strip()
            except Exception:
                icc_profile = "Present (unparsed)"

        n_frames = getattr(img, "n_frames", 1)
        info.update({
            "format": img.format,
            "width_px": w_px,
            "height_px": h_px,
            "dpi_x": round(dpi_x, 2),
            "dpi_y": round(dpi_y, 2),
            "color_mode": img.mode,
            "icc_profile": icc_profile,
            "width_mm": round(width_mm, 2) if width_mm is not None else None,
            "height_mm": round(height_mm, 2) if height_mm is not None else None,
            "aspect_ratio_w_h": aspect_ratio,
            "layout_type": layout_type,
            "pil_n_frames": n_frames,
            "is_layered_via_pil": n_frames > 1,
        })

    # Also check psd-tools if installed
    try:
        from psd_tools import PSDImage  # type: ignore

        psd = PSDImage.open(psd_path)
        layer_names = [layer.name for layer in psd]
        info["psd_tools_available"] = True
        info["layer_count"] = len(layer_names)
        info["layer_names"] = layer_names
        info["is_layered"] = len(layer_names) > 1
    except ImportError:
        info["psd_tools_available"] = False
        info["layer_note"] = "psd-tools not installed; checked via PIL only"
    except Exception as exc:
        info["psd_tools_available"] = True
        info["psd_tools_error"] = str(exc)

    return info


def audit_master_pdf(pdf_path: Path) -> dict[str, Any]:
    """Inspect IM Master.pdf using PyMuPDF (fitz)."""
    if not pdf_path.exists():
        return {"exists": False, "path": str(pdf_path)}

    doc = fitz.open(pdf_path)
    pt_to_mm = 25.4 / 72.0

    p1_rect = doc[0].rect
    rect_pts = [round(p1_rect.x0, 2), round(p1_rect.y0, 2), round(p1_rect.x1, 2), round(p1_rect.y1, 2)]
    rect_mm = [round(v * pt_to_mm, 2) for v in rect_pts]

    fonts_seen: set[str] = set()
    for pno in range(len(doc)):
        for font in doc.get_page_fonts(pno):
            # font tuple: (xref, ext, type, basefont, name, encoding, ...)
            if len(font) >= 4 and font[3]:
                fonts_seen.add(str(font[3]))

    def inspect_cover_page(page_index: int) -> dict[str, Any]:
        page = doc[page_index]
        text_sample = page.get_text("text").strip().splitlines()[:10]
        images = page.get_images(full=True)
        image_rects = []
        for img in images:
            xref = img[0]
            for r in page.get_image_rects(xref):
                image_rects.append({
                    "xref": xref,
                    "rect_pts": [round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)],
                    "rect_mm": [round(v * pt_to_mm, 2) for v in (r.x0, r.y0, r.x1, r.y1)],
                })
        return {
            "page_number": page_index + 1,
            "image_count": len(images),
            "image_rects": image_rects,
            "text_preview": text_sample,
        }

    result = {
        "exists": True,
        "path": str(pdf_path),
        "page_count": len(doc),
        "page_1_rect_pts": rect_pts,
        "page_1_rect_mm": rect_mm,
        "trim_width_mm": round((p1_rect.x1 - p1_rect.x0) * pt_to_mm, 2),
        "trim_height_mm": round((p1_rect.y1 - p1_rect.y0) * pt_to_mm, 2),
        "embedded_fonts": sorted(fonts_seen),
        "front_cover_page_1": inspect_cover_page(0),
        "back_cover_last_page": inspect_cover_page(len(doc) - 1),
    }
    doc.close()
    return result


def audit_designcraft_cli(cli_path: Path) -> dict[str, Any]:
    """Run designcraft-cli --help and subcommands to identify supported formats."""
    if not cli_path.exists():
        return {"exists": False, "path": str(cli_path)}

    def run_help(args: list[str]) -> str:
        proc = subprocess.run(
            [str(cli_path), *args],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return (proc.stdout or proc.stderr or "").strip()

    main_help = run_help(["--help"])
    subcommands = {}
    for sub in ("run", "commands", "mcp", "validate-pdf", "thumbnail"):
        subcommands[sub] = run_help([sub, "--help"])

    return {
        "exists": True,
        "path": str(cli_path),
        "version": run_help(["--version"]),
        "main_help": main_help,
        "subcommands": subcommands,
    }


def main() -> None:
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "directory_inventory": audit_directory_inventory(IM_DIR),
        "psd_cover_audit": audit_psd_cover(PSD_PATH),
        "master_pdf_audit": audit_master_pdf(MASTER_PDF_PATH),
        "designcraft_cli_audit": audit_designcraft_cli(DESIGNCRAFT_CLI),
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved audit report to {REPORT_PATH}")

    inv = report["directory_inventory"]
    psd = report["psd_cover_audit"]
    pdf = report["master_pdf_audit"]
    print("\n=== IM PREREQUISITES AUDIT SUMMARY ===")
    print(f"IM Directory: {inv.get('total_files', 0)} files | Extensions: {inv.get('extensions', {})}")
    if psd.get("exists"):
        print(
            f"PSD Cover: {psd.get('width_px')}x{psd.get('height_px')} px @ {psd.get('dpi_x')} DPI | "
            f"{psd.get('width_mm')}x{psd.get('height_mm')} mm | Mode: {psd.get('color_mode')} | "
            f"Layout: {psd.get('layout_type')}"
        )
    if pdf.get("exists"):
        print(
            f"IM Master PDF: {pdf.get('page_count')} pages | "
            f"Trim: {pdf.get('trim_width_mm')}x{pdf.get('trim_height_mm')} mm | "
            f"Fonts: {len(pdf.get('embedded_fonts', []))}"
        )


if __name__ == "__main__":
    main()
