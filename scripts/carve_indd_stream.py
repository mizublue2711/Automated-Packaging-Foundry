#!/usr/bin/env python3
"""Carve embedded PDF streams from IM SCB-6119.indd and inspect them with PyMuPDF."""

import os
import re

import fitz  # PyMuPDF

indd_path = "local_assets/Brief_Packaging_Adaptation_BlueStone/SCB-6119/layout/IM SCB-6119/IM SCB-6119.indd"
out_dir = "local_assets/output/SCB-6119"
os.makedirs(out_dir, exist_ok=True)

print(f"Scanning binary stream of {indd_path} ({os.path.getsize(indd_path):,} bytes)...")

with open(indd_path, "rb") as f:
    data = f.read()

# Search for PDF header magic bytes %PDF-
pdf_starts = [m.start() for m in re.finditer(b"%PDF-", data)]
print(f"Found {len(pdf_starts)} potential embedded PDF stream headers.")

valid_pdfs = []
for idx, start_pos in enumerate(pdf_starts):
    # Find matching %%EOF
    end_pos = data.find(b"%%EOF", start_pos)
    if end_pos != -1:
        pdf_bytes = data[start_pos : end_pos + 5]
        # Only consider streams larger than 100KB (likely complete document or page previews)
        if len(pdf_bytes) > 100 * 1024:
            out_file = os.path.join(out_dir, f"im_extracted_stream_{idx+1}.pdf")
            with open(out_file, "wb") as out:
                out.write(pdf_bytes)
            print(f"  -> Extracted candidate PDF {idx+1}: {len(pdf_bytes):,} bytes -> {out_file}")
            valid_pdfs.append(out_file)

if not valid_pdfs:
    print("❌ No standalone embedded PDF stream detected in INDD binary.")
else:
    print(f"✅ Successfully extracted {len(valid_pdfs)} candidate PDF stream(s).")
    pt_to_mm = 25.4 / 72.0
    for pdf_file in valid_pdfs:
        print(f"\n--- Inspecting {pdf_file} ---")
        try:
            doc = fitz.open(pdf_file)
            print(f"Page count: {len(doc)}")
            for pno in range(len(doc)):
                page = doc[pno]
                r = page.rect
                w_mm = round((r.x1 - r.x0) * pt_to_mm, 2)
                h_mm = round((r.y1 - r.y0) * pt_to_mm, 2)
                text = page.get_text("text").strip()
                drawings = page.get_drawings()
                images = page.get_images(full=True)
                print(
                    f"  Page {pno+1}: {r.width:.2f}x{r.height:.2f} pts ({w_mm}x{h_mm} mm) | "
                    f"text_chars={len(text)} | vector_paths={len(drawings)} | images={len(images)}"
                )
                if text:
                    preview = " / ".join(line.strip() for line in text.splitlines()[:4] if line.strip())
                    print(f"    Text preview: {preview[:120]}")
            doc.close()
        except Exception as exc:
            print(f"  Failed to open with fitz: {exc}")
