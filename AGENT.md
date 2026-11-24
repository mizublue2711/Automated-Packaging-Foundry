# AGENT.md — Automated Packaging Foundry & Pre-Press Automation Protocol
*Autonomous Agent & Engineering Operational Guidelines for the BlueStone Packaging Adaptation Project.*
*All autonomous coding agents (including Agent An) and contributing engineers operating within `Automated-Packaging-Foundry` must strictly adhere to these protocols. Zero deviation is permitted.*

---

## 1. PROJECT SCOPE & ARCHITECTURAL FOUNDATION

### 1.1 Mission & Scope
The system automates the adaptation, validation, and pre-press delivery of **13 complete BlueStone Packaging Sets** based on provided master templates and dielines. Each complete packaging set encompasses up to 4 core deliverables:
1. **Gift Box (Primary Retail Packaging)**: Full-color CMYK + Spot Pantone packaging on CCNB/Duplex/Ivory board.
2. **Carton Box (Master Shipper)**: 1–2 color flexo/offset on corrugated Kraft board with shipping marks.
3. **Instruction Manual (IM)**: Multi-page user guide (front/back cover brand adaptation; inner text preserved).
4. **Point-of-Purchase (POP / POSM)**: Retail shelf displays and counter collateral.

### 1.2 System Architecture: The Decoupled Triad
The repository operates on a three-tier decoupled architecture:
1. **Headless Mechanical Rigging (`public/models/fefco0215_tuck_end.json`)**:
   - Pure geometric topology defining panel coordinates, hinge axes, and parent-child kinematic trees for standard folding cartons (e.g., FEFCO 0215, 13 panels). Zero UI or framework dependencies.
2. **3D WebGL Kinematic Viewport (`src/components/canvas/`)**:
   - Vite + React + Three.js rendering engine providing interactive 0%–100% folding simulation, material PBR switching, camera presets, and real-time 60fps WebM video recording.
3. **Pre-Press Automation & Gatekeeper Engine (`scripts/`)**:
   - Python + VectorCraft toolchain for asset extraction, SVG/PDF manipulation, EAN-13 verification, and multi-tier pre-flight validation.

---

## 2. GOLDEN PRE-PRESS RULES & PACKAGING FIDELITY

### 2.1 Absolute Dieline & Geometry Immutability
* **ZERO DIELINE ALTERATION**: Under no circumstances may an agent modify, scale, re-crease, shift, or delete existing cutting dies (`Diecut_Cut`), crease lines (`Diecut_Crease`), perforation rules, or glue flaps.
* **Bleed Line Mandate**: Maintain a strict **3.0 mm bleed margin** across all exterior print edges.
* **Safe Zone Compliance**: Keep all critical text, logos, and compliance symbols at least **5.0 mm inside the cut/crease lines**.

### 2.2 Technical Specification & Data Integrity
* **ZERO SPEC DRIFT**: All product specifications (Model ID, Rated Power `W`, Rated Voltage `V`, Capacity `L`, Dimensions, and Barcodes) are immutable truths extracted from official source assets.
* **Barcode Rigidity**: EAN-13 barcodes must preserve exact line widths, quiet zones (minimum 3.63 mm margins on left and right), and checksum validation. Never stretch or distort barcodes non-proportionally.
* **Typographic Accuracy**: Vietnamese diacritics and brand typography (SVN-Futura / BlueStone brand fonts) must remain intact without character dropping or tofu glyphs.

### 2.3 Color Separation & Substrate Hygiene
* **Strict CMYK & Spot Palette**: Production output must be strictly separated into Process CMYK and approved Spot colors (e.g., `PANTONE 286 C` / Primary BlueStone Blue).
* **Zero RGB in Final Plates**: Every embedded vector fill, stroke, and linked raster graphic must resolve to CMYK. Any RGB asset triggers an immediate pre-flight rejection.
* **Knockout / Overprint Rules**: Black body text (`K = 100%`) must overprint underlying backgrounds. Diecut technical lines must be designated as technical spot colors with Overprint enabled.

---

## 3. MULTI-TIER PRE-FLIGHT "VACCINE" GATEKEEPER

Every automated pipeline run must execute `scripts/robust_preflight_gatekeeper.py`. A deliverable is declared valid **only** when all 4 gatekeeper tests pass:

```
[RAW DELIVERABLES] ──▶ [TEST 1: Visual Entropy] ──▶ [TEST 2: Reverse Spec] ──▶ [TEST 3: Geometry] ──▶ [TEST 4: Plate CMYK] ──▶ [PASS / REJECT]
```

1. **TEST 1: Visual Content & Entropy Gate (Anti-Blank Preview Vaccine)**:
   - Render the PDF output to a 150 DPI JPG.
   - Measure file size and pixel standard deviation (entropy):
     * `fileSizeBytes > 250,000 bytes` (> 250 KB).
     * `entropyScore > 15.0`.
   - *Rationale*: Guarantees that preview files are rich rasterizations of real artwork rather than blank 84KB boundary wireframes.
2. **TEST 2: Data Spec Reverse-Audit**:
   - Extract raw text streams from generated PDFs using `pymupdf` (fitz).
   - Cross-check against `src/config/model_task_contract.json`:
     * Target `modelId` must be strictly present.
     * Legacy model strings or mismatched specs (e.g., Slow Cooker specs in an Air Fryer file) immediately trigger `FAIL_SPEC_MISMATCH`.
3. **TEST 3: Dieline & Bleed Boundary Rigidity**:
   - Validate PDF `MediaBox`, `TrimBox`, and `BleedBox`. Dimensions must match the contract within `±0.5 mm` tolerance with `3.0 mm` bleed preserved on all outer edges.
4. **TEST 4: Missing Linked Assets & Resolution Audit**:
   - All linked raster textures (e.g., product hero photos, background plates) must resolve locally with effective resolution `≥ 300 DPI`. Zero missing link warnings permitted.

---

## 4. 3D WEBGL KINEMATICS & SHADER TOLERANCES

When modifying or maintaining the Three.js 3D Viewport (`src/components/canvas/`):

### 4.1 Caliper Creep & Layer Stacking Offsets
Physical paperboard possesses mechanical caliper thickness (0.5 mm – 1.2 mm). Mathematical coplanarity (two planes at identical coordinates) causes catastrophic Z-fighting flickering:
* **Base Walls (Front, Back, Left, Right)**: Base reference `Y = H`, `offset = 0.0 mm`.
* **Dust Flaps (Internal Ear Tabs)**: Positioned lower than the rim when folded: `yOffset = -1.5 mm`.
* **Top Closure Lid**: Positioned above the rim when folded: `yOffset = +0.8 mm`.
* **Top Tuck Flap**: Slides inside the front wall cavity with inward negative clearance: `zOffset = -2.0 mm` into cavity, folded at `95°–100°` inward angle to eliminate exterior mesh piercing.

### 4.2 Material Depth Bias
Exterior printed surfaces must declare WebGL rasterizer priority over interior substrate tabs:
```typescript
material.polygonOffset = true;
material.polygonOffsetFactor = -1.0;
material.polygonOffsetUnits = -4.0;
material.depthWrite = true;
material.depthTest = true;
```

---

## 5. REPOSITORY HYGIENE & TOOLCHAIN CONVENTIONS

### 5.1 Zero Large Binaries in Git
* Git tracks code, contracts, lightweight SVGs, and automated scripts.
* Heavy master sources (`.ai`, `.psd`, `.indd`, `.zip`, `.tif`) must remain strictly inside local ignored folders (e.g., `local_assets/`, `local_master_sources/`).
* Verify `.gitignore` contains:
  ```gitignore
  local_assets/
  local_master_sources/
  *.psd
  *.indd
  *.ai
  *.tif
  *.zip
  !src/assets/**/*.svg
  ```

### 5.2 Toolchain Specialization
* **VectorCraft (`vectorcraft` CLI)**: Dedicated tool for SVG path drawing, KSP icon redrawing, swatch palette mapping, and vector asset generation.
* **PyMuPDF (`fitz`) & Python Imaging (`PIL`)**: Headless pre-press inspection, text stream auditing, and high-fidelity PDF-to-raster generation.
* **psd-tools**: Headless inspection of background layer structures and DPI metadata.
* **DesignCraft / IDML XML Engine**: Headless modification of Instruction Manual cover spreads without desktop InDesign dependencies.

### 5.3 Contract-Driven Execution
All automated tasks must read from and write to the centralized contract file:
`src/config/model_task_contract.json`

Never hardcode model parameters or dimensions directly inside automation scripts. Every script must accept `--model-id <ID>` and resolve dimensions, swatches, and asset paths dynamically from the contract.
