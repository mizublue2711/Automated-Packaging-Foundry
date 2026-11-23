/**
 * FILE 2: src/engines/BoxKinematicsSolver.ts
 * THE ASSEMBLY & FOLDING CONTROLLER — PURE MATHEMATICAL KINEMATICS ENGINE.
 * Zero JSX, zero DOM, zero Canvas, and zero Three.js dependencies.
 *
 * Input:
 *   - topology: PackagingTopology
 *   - dimensions: { L: number; W: number; H: number }
 *   - foldProgress: number (0.0 to 1.0)
 *
 * Calculates sequential 4×4 homogeneous folding transformation matrices and
 * XYZ intrinsic Euler angles across the 4 keyframe phases:
 *   - Phase 1 (0.00 -> 0.40): 4 sleeve walls fold 90° inward into a rectangular tube; 15mm Glue Tab folds 90° inward.
 *   - Phase 2 (0.40 -> 0.65): All 4 Dust Flaps (top & bottom ears) fold 90° inward into the box cavity.
 *   - Phase 3 (0.65 -> 0.90): Top Lid (hinged to Back wall) and Bottom Lid (hinged to Front wall) fold 90° inward to cover openings.
 *   - Phase 4 (0.85 -> 1.00): Top and Bottom Tuck Flaps fold 90° inward relative to the lids, sliding flush down the interior face of the opposite walls.
 *
 * Output:
 *   Record<string, PanelKinematicPose> containing world `position: [number, number, number]`
 *   (panel center in 3D space), `rotation: [number, number, number]` (XYZ Euler radians),
 *   and evaluated physical dimensions `size: [widthX, heightY, thicknessZ]`.
 */

import {
  DimensionToken,
  PackagingTopology,
  TopologyPanelDefinition,
} from '../config/topologies/fefco0215_tuck_end';

export interface BoxDimensionsInput {
  L: number;
  W: number;
  H: number;
}

export interface PanelKinematicPose {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  localAngleRad: number;
  phaseProgress: number;
}

export type BoxKinematicsMap = Record<string, PanelKinematicPose>;

// ============================================================================
// PURE 4×4 HOMOGENEOUS MATRIX MATH (Column-Major 16-Element Float64Array)
// ============================================================================
type Mat4 = Float64Array;

function mat4Identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4 + 0];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];

    out[col * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4Translate(tx: number, ty: number, tz: number): Mat4 {
  const m = mat4Identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

function mat4RotateX(rad: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function mat4RotateY(rad: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/**
 * Extracts XYZ intrinsic Euler angles [rx, ry, rz] (matching Three.js default 'XYZ' Euler order)
 * from a pure 4×4 rotation/transformation matrix.
 */
function mat4ToEulerXYZ(m: Mat4): [number, number, number] {
  const m11 = m[0];
  const m12 = m[4];
  const m13 = m[8];
  const m21 = m[1];
  const m22 = m[5];
  const m23 = m[9];
  const m32 = m[6];
  const m33 = m[10];

  const clampedM13 = Math.max(-1, Math.min(1, m13));
  const ry = Math.asin(clampedM13);

  let rx = 0;
  let rz = 0;

  if (Math.abs(m13) < 0.999999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    rx = Math.atan2(m32, m22);
    rz = 0;
  }

  return [rx, ry, rz];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(v: number, edge0: number, edge1: number): number {
  if (edge1 <= edge0) return v >= edge1 ? 1 : 0;
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Resolves a DimensionToken from `fefco0215_tuck_end.ts` into physical units.
 */
export function resolvePanelDimension(
  token: DimensionToken,
  dims: BoxDimensionsInput,
  glueTabMm: number,
  boardThickness: number
): number {
  const { L, W, H } = dims;
  switch (token) {
    case 'L':
      return L;
    case 'W':
      return W;
    case 'H':
      return H;
    case 'L_LID':
      return Math.max(10, L - boardThickness * 1.6);
    case 'W_LID':
      // Shorten lid depth by 3.2 * boardThickness (~5.8mm) so the tuck hinge line sits strictly INSIDE the interior face of FrontPanel!
      return Math.max(10, W - boardThickness * 3.2);
    case 'L_TUCK':
      return Math.max(10, L - boardThickness * 4.2);
    case 'W_DUST':
      return Math.max(10, W - boardThickness * 3.8);
    case 'H_DUST':
      return Math.min(L * 0.38, W * 0.46);
    case 'H_TUCK':
      return Math.min(H * 0.26, W * 0.32);
    case 'GLUE_TAB_15MM':
      return Math.max(glueTabMm, Math.min(W * 0.25, glueTabMm * 1.25));
    case 'H_GLUE':
      return Math.max(10, H - boardThickness * 3.0);
    default:
      return L;
  }
}

/**
 * Calculates the 3D position, XYZ Euler rotation, and physical dimensions for every panel
 * in `topology` at a given `foldProgress` (0.0 = flat dieline sheet, 1.0 = closed carton).
 *
 * Global Coordinate System:
 * - At 0% (flat sheet), the dieline lies in the vertical XY plane with outer printed faces pointing toward +Z.
 * - Root `panel_front` (L × H) has its center anchored so that as the carton folds from 0.0 -> 1.0,
 *   the assembled 3D carton remains centered over the studio pedestal origin (0, H/2, 0).
 */
export function calculateBoxKinematics(
  topology: PackagingTopology,
  dimensions: BoxDimensionsInput,
  foldProgress: number
): BoxKinematicsMap {
  const p = clamp01(foldProgress);
  const { L, W, H } = dimensions;
  const t = topology.boardThicknessMm;
  const glueMm = topology.glueTabWidthMm;

  // Evaluate dimensions for all panels first
  const panelSizeMap = new Map<string, [number, number, number]>();
  for (const panel of topology.panels) {
    const w = resolvePanelDimension(panel.widthToken, dimensions, glueMm, t);
    const h = resolvePanelDimension(panel.heightToken, dimensions, glueMm, t);
    panelSizeMap.set(panel.id, [w, h, t]);
  }

  // Build parent -> children adjacency list
  const childrenByParent = new Map<string | null, TopologyPanelDefinition[]>();
  for (const panel of topology.panels) {
    const list = childrenByParent.get(panel.parentId) || [];
    list.push(panel);
    childrenByParent.set(panel.parentId, list);
  }

  // Root transform:
  // Shift the root `panel_front` along +Z by (W/2 * sleeveProgress) and +Y by H/2
  // so that at 100% fold the 3D box is centered symmetrically around (0, H/2, 0).
  const sleeveProgress = smoothstep(p, 0.0, 0.40);
  const rootCenterZ = (W * 0.5) * sleeveProgress;
  const rootCenterY = H * 0.5;
  const rootWorldMatrix = mat4Translate(0, rootCenterY, rootCenterZ);

  const output: BoxKinematicsMap = {};

  /**
   * Recursive kinematic chain solver:
   * Given a panel and its parent's Center Frame matrix (`parentCenterMatrix`),
   * computes the panel's Hinge Pivot translation, applies its local hinge rotation,
   * translates to the panel's geometric center, and extracts world `position` and `rotation`.
   */
  const solveNode = (
    panel: TopologyPanelDefinition,
    parentCenterMatrix: Mat4,
    parentSize: [number, number, number]
  ) => {
    const size = panelSizeMap.get(panel.id) || [L, H, t];
    const [nodeW, nodeH] = size;
    const [parentW, parentH] = parentSize;

    const [rangeStart, rangeEnd] = panel.foldRange;
    let phaseProgress =
      panel.attachEdge === 'ROOT' ? 1 : smoothstep(p, rangeStart, rangeEnd);

    const isLid = panel.id === 'top_lid' || panel.id === 'bottom_lid';
    const isDustFlap =
      panel.id === 'top_dust_flap_left' ||
      panel.id === 'top_dust_flap_right' ||
      panel.id === 'bottom_dust_flap_left' ||
      panel.id === 'bottom_dust_flap_right';
    const isTuckFlap =
      panel.id === 'top_tuck_flap' || panel.id === 'bottom_tuck_flap';
    const isGlueTab = panel.id === 'glue_tab';

    // 1. Lids (top_lid / bottom_lid) articulate smoothly from 0° -> 90° over [0.65 .. 0.96]
    if (isLid) {
      phaseProgress = smoothstep(p, 0.65, 0.96);
    }

    // 2. Tuck Flaps (top_tuck_flap / bottom_tuck_flap):
    //    - Pre-fold early during [0.64 .. 0.84] to an inward over-tuck angle of 100° (1.11 * 90°)
    //      so while the lid is descending (at 75%..95%), the leading edge tilts strictly INWARD toward the box cavity.
    //    - Once the lid closes completely during [0.94 .. 1.00], relax smoothly from 100° back to 90.5°
    //      so at 100% the tuck flap rests completely parallel against the interior wall of FrontPanel.
    let angleMultiplier = 1.0;
    if (isTuckFlap) {
      phaseProgress = smoothstep(p, 0.64, 0.84);
      const settleToParallel = smoothstep(p, 0.94, 1.00);
      angleMultiplier = 1.11 - 0.105 * settleToParallel;
    }

    const localAngleRad =
      panel.attachEdge === 'ROOT'
        ? 0
        : (panel.targetAngleDeg * angleMultiplier * Math.PI * phaseProgress) /
          180;

    // ========================================================================
    // PHYSICAL HIERARCHICAL LAYER OFFSETS (CALIPER CREEP STACKING)
    // Eliminates mathematical coplanarity & WebGL Z-fighting between:
    //   - Top/Bottom Closure Lids (+0.8mm above/outside the box rim)
    //   - Internal Dust Flaps (-1.5mm below/inside the box rim -> 2.3mm physical air gap!)
    //   - Tuck Flaps (-2.5mm deep inside the box cavity behind FrontPanel/BackPanel)
    //   - Lateral Glue Tab (-2.2mm deep inside the box cavity behind BackPanel)
    // ========================================================================
    let hingeInwardZ = 0;
    let postRotateNormalZ = 0;

    if (isGlueTab) {
      hingeInwardZ = -2.2 * phaseProgress;
    } else if (isDustFlap) {
      // Shift hinge inward along parent wall (-Z) and lower the folded dust flap by -1.5mm into the cavity (-Z after 90° fold)
      hingeInwardZ = -1.6 * phaseProgress;
      postRotateNormalZ = -1.5 * phaseProgress;
    } else if (isLid) {
      // Raise top_lid by +0.8mm above the top rim (+Z after 90° fold) so it rests cleanly above the wall top edges and dust flaps
      hingeInwardZ = 0;
      postRotateNormalZ = +0.8 * phaseProgress;
    } else if (isTuckFlap) {
      // Push tuck flap -2.5mm deep into the box cavity along its local normal (-Z after 90° fold)
      hingeInwardZ = -0.8 * phaseProgress;
      postRotateNormalZ = -2.5 * phaseProgress;
    }

    let currentCenterMatrix: Mat4;

    if (panel.attachEdge === 'ROOT') {
      currentCenterMatrix = parentCenterMatrix;
    } else {
      // 1. Offset from parent center to the attachment hinge line on the parent's perimeter
      let hingeOffsetX = 0;
      let hingeOffsetY = 0;
      // 2. Offset from the hinge line to this child panel's geometric center
      let childCenterOffsetX = 0;
      let childCenterOffsetY = 0;

      // Vertical rim clearance adjustments along parent Y BEFORE hinge rotation:
      // - Dust flaps: drop hinge line -1.5mm below the wall's top rim (or +1.5mm above bottom rim)
      // - Lids: lift hinge line +0.8mm above the back wall's top rim (or -0.8mm below front wall's bottom rim)
      // - Tuck flaps: inset hinge line by 2.4mm inward along the lid so the flap clears the front wall rim
      let rimVerticalAdjust = 0;
      if (isDustFlap) {
        rimVerticalAdjust = -1.5 * phaseProgress;
      } else if (isLid) {
        rimVerticalAdjust = +0.8 * phaseProgress;
      } else if (isTuckFlap) {
        rimVerticalAdjust = -Math.max(2.4, t * 1.7) * smoothstep(p, 0.64, 0.86);
      }

      if (panel.attachEdge === 'LEFT') {
        hingeOffsetX = -parentW * 0.5;
        childCenterOffsetX = -nodeW * 0.5;
      } else if (panel.attachEdge === 'RIGHT') {
        hingeOffsetX = parentW * 0.5;
        childCenterOffsetX = nodeW * 0.5;
      } else if (panel.attachEdge === 'TOP') {
        hingeOffsetY = parentH * 0.5 + rimVerticalAdjust;
        childCenterOffsetY = nodeH * 0.5;
      } else if (panel.attachEdge === 'BOTTOM') {
        hingeOffsetY = -parentH * 0.5 - rimVerticalAdjust;
        childCenterOffsetY = -nodeH * 0.5;
      }

      const toHingeMat = mat4Translate(
        hingeOffsetX,
        hingeOffsetY,
        hingeInwardZ
      );
      const rotMat =
        panel.hingeAxis === 'X'
          ? mat4RotateX(localAngleRad)
          : mat4RotateY(localAngleRad);
      const toChildCenterMat = mat4Translate(
        childCenterOffsetX,
        childCenterOffsetY,
        postRotateNormalZ
      );

      // M_child_center = M_parent_center * T_to_hinge * R_hinge * T_to_child_center
      const hingeWorldMat = mat4Multiply(parentCenterMatrix, toHingeMat);
      const rotatedHingeMat = mat4Multiply(hingeWorldMat, rotMat);
      currentCenterMatrix = mat4Multiply(rotatedHingeMat, toChildCenterMat);
    }

    const worldPos: [number, number, number] = [
      currentCenterMatrix[12],
      currentCenterMatrix[13],
      currentCenterMatrix[14],
    ];
    const worldRot = mat4ToEulerXYZ(currentCenterMatrix);

    output[panel.id] = {
      position: worldPos,
      rotation: worldRot,
      size,
      localAngleRad,
      phaseProgress,
    };

    const children = childrenByParent.get(panel.id) || [];
    for (const child of children) {
      solveNode(child, currentCenterMatrix, size);
    }
  };

  const rootPanels = childrenByParent.get(null) || [];
  for (const rootPanel of rootPanels) {
    const rootSize = panelSizeMap.get(rootPanel.id) || [L, H, t];
    solveNode(rootPanel, rootWorldMatrix, rootSize);
  }

  return output;
}
