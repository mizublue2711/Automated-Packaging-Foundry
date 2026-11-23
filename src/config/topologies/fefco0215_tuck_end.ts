/**
 * FILE 1: src/config/topologies/fefco0215_tuck_end.ts
 * THE PURE DESIGN CONTRACT — STRUCTURAL BLUEPRINT ONLY.
 * Zero Three.js, React, or DOM dependencies.
 *
 * Defines the 13 physical panel nodes of an industrial Reverse Tuck-End Carton (FEFCO 0215):
 * - Horizontal Sleeve (5 nodes):
 *   glue_tab (15mm bevelled) <- panel_left (W) <- panel_front (L, Root) -> panel_right (W) -> panel_back (L)
 * - Top Closures (4 nodes):
 *   top_dust_flap_left, top_dust_flap_right, top_lid (hinged to top of panel_back), top_tuck_flap
 * - Bottom Closures (4 nodes):
 *   bottom_dust_flap_left, bottom_dust_flap_right, bottom_lid (hinged to bottom of panel_front), bottom_tuck_flap
 */

export type PanelId =
  | 'panel_front'
  | 'panel_left'
  | 'glue_tab'
  | 'panel_right'
  | 'panel_back'
  | 'top_dust_flap_left'
  | 'top_dust_flap_right'
  | 'top_lid'
  | 'top_tuck_flap'
  | 'bottom_dust_flap_left'
  | 'bottom_dust_flap_right'
  | 'bottom_lid'
  | 'bottom_tuck_flap';

export type AttachEdge = 'ROOT' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';

export type HingeAxis = 'X' | 'Y';

export type FoldingPhaseId =
  | 'STATIC_ROOT'
  | 'PHASE_1_SLEEVE_TUBE'
  | 'PHASE_2_DUST_FLAPS'
  | 'PHASE_3_CLOSURE_LIDS'
  | 'PHASE_4_TUCK_FLAPS';

export type DimensionToken =
  | 'L'
  | 'W'
  | 'H'
  | 'L_LID'
  | 'W_LID'
  | 'L_TUCK'
  | 'W_DUST'
  | 'H_DUST'
  | 'H_TUCK'
  | 'GLUE_TAB_15MM'
  | 'H_GLUE';

export type TextureSlotId =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'topLid'
  | 'base'
  | 'flap';

export interface TopologyPanelDefinition {
  id: PanelId;
  label: string;
  parentId: PanelId | null;
  attachEdge: AttachEdge;
  hingeAxis: HingeAxis;
  /**
   * Signed local hinge angle in degrees when folded 100% into the internal box cavity (-Z in root panel_front space).
   * - LEFT edge (hingeAxis 'Y'): +90° rotates (-X, 0, 0) into (0, 0, -Z)
   * - RIGHT edge (hingeAxis 'Y'): -90° rotates (+X, 0, 0) into (0, 0, -Z)
   * - TOP edge (hingeAxis 'X'): +90° rotates (0, +Y, 0) into (0, 0, -Z)
   * - BOTTOM edge (hingeAxis 'X'): -90° rotates (0, -Y, 0) into (0, 0, -Z)
   */
  targetAngleDeg: number;
  widthToken: DimensionToken;
  heightToken: DimensionToken;
  phase: FoldingPhaseId;
  foldRange: [number, number];
  /**
   * Micro-clearance multiplier (in board thicknesses) shifting the hinge along the local inward normal (-Z)
   * so internal flaps (glue tab, dust flaps, tuck flaps) nest cleanly behind outer walls with zero Z-fighting.
   */
  inwardClearanceLayers: number;
  bevelCutMm?: number;
  textureSlot: TextureSlotId;
}

export interface PackagingTopology {
  topologyId: string;
  standardCode: string;
  name: string;
  description: string;
  interiorSubstrateHex: string;
  glueTabWidthMm: number;
  boardThicknessMm: number;
  cameraLimitsMm: {
    minDistanceMm: number;
    maxDistanceMm: number;
    defaultDistanceMm: number;
  };
  panels: TopologyPanelDefinition[];
}

export const FEFCO_0215_TOPOLOGY: PackagingTopology = {
  topologyId: 'FEFCO_0215_REVERSE_TUCK_END',
  standardCode: 'FEFCO 0215',
  name: 'Reverse Tuck-End Folding Carton (13-Node Full Sleeve & Double Tuck)',
  description:
    'Horizontal sleeve (glue_tab -> panel_left -> panel_front -> panel_right -> panel_back) with 4 inward dust ears, top lid hinged to panel_back, bottom lid hinged to panel_front, and dual die-lock tuck flaps.',
  interiorSubstrateHex: '#D1C7BD',
  glueTabWidthMm: 15,
  boardThicknessMm: 1.8,
  cameraLimitsMm: {
    minDistanceMm: 250,
    maxDistanceMm: 3600,
    defaultDistanceMm: 860,
  },
  panels: [
    // ========================================================================
    // 1. HORIZONTAL SLEEVE (Root: panel_front, folding 0.00 -> 0.40)
    // ========================================================================
    {
      id: 'panel_front',
      label: 'Front Primary Hero Panel (L × H)',
      parentId: null,
      attachEdge: 'ROOT',
      hingeAxis: 'Y',
      targetAngleDeg: 0,
      widthToken: 'L',
      heightToken: 'H',
      phase: 'STATIC_ROOT',
      foldRange: [0.0, 0.0],
      inwardClearanceLayers: 0,
      textureSlot: 'front',
    },
    {
      id: 'panel_left',
      label: 'Left Side KSP Panel (W × H)',
      parentId: 'panel_front',
      attachEdge: 'LEFT',
      hingeAxis: 'Y',
      targetAngleDeg: -90,
      widthToken: 'W',
      heightToken: 'H',
      phase: 'PHASE_1_SLEEVE_TUBE',
      foldRange: [0.0, 0.40],
      inwardClearanceLayers: 0,
      textureSlot: 'left',
    },
    {
      id: 'glue_tab',
      label: 'Lateral Seam Glue Tab (15mm Bevelled)',
      parentId: 'panel_left',
      attachEdge: 'LEFT',
      hingeAxis: 'Y',
      targetAngleDeg: -90,
      widthToken: 'GLUE_TAB_15MM',
      heightToken: 'H_GLUE',
      phase: 'PHASE_1_SLEEVE_TUBE',
      foldRange: [0.0, 0.36],
      inwardClearanceLayers: 1.5,
      bevelCutMm: 12,
      textureSlot: 'flap',
    },
    {
      id: 'panel_right',
      label: 'Right Side Technical Specs Panel (W × H)',
      parentId: 'panel_front',
      attachEdge: 'RIGHT',
      hingeAxis: 'Y',
      targetAngleDeg: 90,
      widthToken: 'W',
      heightToken: 'H',
      phase: 'PHASE_1_SLEEVE_TUBE',
      foldRange: [0.0, 0.40],
      inwardClearanceLayers: 0,
      textureSlot: 'right',
    },
    {
      id: 'panel_back',
      label: 'Rear Regulatory & Barcode Panel (L × H)',
      parentId: 'panel_right',
      attachEdge: 'RIGHT',
      hingeAxis: 'Y',
      targetAngleDeg: 90,
      widthToken: 'L',
      heightToken: 'H',
      phase: 'PHASE_1_SLEEVE_TUBE',
      foldRange: [0.0, 0.40],
      inwardClearanceLayers: 0.25,
      textureSlot: 'back',
    },

    // ========================================================================
    // 2. TOP & BOTTOM DUST FLAPS (Phase 2: 0.40 -> 0.65)
    // ========================================================================
    {
      id: 'top_dust_flap_left',
      label: 'Top-Left Inward Dust Ear',
      parentId: 'panel_left',
      attachEdge: 'TOP',
      hingeAxis: 'X',
      targetAngleDeg: -90,
      widthToken: 'W_DUST',
      heightToken: 'H_DUST',
      phase: 'PHASE_2_DUST_FLAPS',
      foldRange: [0.40, 0.65],
      inwardClearanceLayers: 1.6,
      textureSlot: 'flap',
    },
    {
      id: 'top_dust_flap_right',
      label: 'Top-Right Inward Dust Ear',
      parentId: 'panel_right',
      attachEdge: 'TOP',
      hingeAxis: 'X',
      targetAngleDeg: -90,
      widthToken: 'W_DUST',
      heightToken: 'H_DUST',
      phase: 'PHASE_2_DUST_FLAPS',
      foldRange: [0.40, 0.65],
      inwardClearanceLayers: 1.6,
      textureSlot: 'flap',
    },
    {
      id: 'bottom_dust_flap_left',
      label: 'Bottom-Left Inward Dust Ear',
      parentId: 'panel_left',
      attachEdge: 'BOTTOM',
      hingeAxis: 'X',
      targetAngleDeg: 90,
      widthToken: 'W_DUST',
      heightToken: 'H_DUST',
      phase: 'PHASE_2_DUST_FLAPS',
      foldRange: [0.40, 0.65],
      inwardClearanceLayers: 1.6,
      textureSlot: 'flap',
    },
    {
      id: 'bottom_dust_flap_right',
      label: 'Bottom-Right Inward Dust Ear',
      parentId: 'panel_right',
      attachEdge: 'BOTTOM',
      hingeAxis: 'X',
      targetAngleDeg: 90,
      widthToken: 'W_DUST',
      heightToken: 'H_DUST',
      phase: 'PHASE_2_DUST_FLAPS',
      foldRange: [0.40, 0.65],
      inwardClearanceLayers: 1.6,
      textureSlot: 'flap',
    },

    // ========================================================================
    // 3. TOP & BOTTOM CLOSURE LIDS (Phase 3: 0.65 -> 1.00)
    // ========================================================================
    {
      id: 'top_lid',
      label: 'Top Closure Lid (Hinged to Top of Back Panel)',
      parentId: 'panel_back',
      attachEdge: 'TOP',
      hingeAxis: 'X',
      targetAngleDeg: -90,
      widthToken: 'L_LID',
      heightToken: 'W_LID',
      phase: 'PHASE_3_CLOSURE_LIDS',
      foldRange: [0.65, 1.00],
      inwardClearanceLayers: 0.35,
      textureSlot: 'topLid',
    },
    {
      id: 'bottom_lid',
      label: 'Bottom Closure Lid (Hinged to Bottom of Front Panel)',
      parentId: 'panel_front',
      attachEdge: 'BOTTOM',
      hingeAxis: 'X',
      targetAngleDeg: 90,
      widthToken: 'L_LID',
      heightToken: 'W_LID',
      phase: 'PHASE_3_CLOSURE_LIDS',
      foldRange: [0.65, 1.00],
      inwardClearanceLayers: 0.35,
      textureSlot: 'base',
    },

    // ========================================================================
    // 4. TOP & BOTTOM DIE-LOCK TUCK FLAPS (Phase 4: Pre-fold 0.70 -> 0.90, Vertical Insertion 0.90 -> 1.00)
    // ========================================================================
    {
      id: 'top_tuck_flap',
      label: 'Top Die-Lock Tuck Flap (Tucks Inside Front Wall)',
      parentId: 'top_lid',
      attachEdge: 'TOP',
      hingeAxis: 'X',
      targetAngleDeg: -90,
      widthToken: 'L_TUCK',
      heightToken: 'H_TUCK',
      phase: 'PHASE_4_TUCK_FLAPS',
      foldRange: [0.70, 0.90],
      inwardClearanceLayers: 1.5,
      textureSlot: 'flap',
    },
    {
      id: 'bottom_tuck_flap',
      label: 'Bottom Die-Lock Tuck Flap (Tucks Inside Back Wall)',
      parentId: 'bottom_lid',
      attachEdge: 'BOTTOM',
      hingeAxis: 'X',
      targetAngleDeg: 90,
      widthToken: 'L_TUCK',
      heightToken: 'H_TUCK',
      phase: 'PHASE_4_TUCK_FLAPS',
      foldRange: [0.70, 0.90],
      inwardClearanceLayers: 1.5,
      textureSlot: 'flap',
    },
  ],
};
