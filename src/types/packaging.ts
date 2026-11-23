export type Language = 'EN' | 'VI';

export type ArtworkType = 'GIFT_BOX' | 'CARTON_BOX' | 'ON_PRODUCT' | 'MANUAL';

export type CadLayerId = 'diecut' | 'crease' | 'bleed' | 'artwork' | 'dimensions';

export type CadLayerVisibility = Record<CadLayerId, boolean>;

export type CameraPresetId =
  | 'ISO_FRONT'
  | 'ISO_BACK'
  | 'TOP_DOWN_FLAT'
  | 'TOP_FLAP'
  | 'WIREFRAME_XRAY';

export type SubstratePresetId =
  | 'CCNB_EFLUTE_MATTE'
  | 'DUPLEX_KRAFT_CORRUGATED'
  | 'IVORY_GLOSS_COATED'
  | 'METALLIC_FOIL_SPOT_UV'
  | 'AGENT_AN_CUSTOM_PBR';

export type PreflightRuleId =
  | 'cmykColorSpace'
  | 'diecutOverprint'
  | 'barcodeVerified'
  | 'bleedPass'
  | 'fontOutlined';

export type PreflightState = Record<PreflightRuleId, boolean>;

export type ChoreographyStatus = 'SEQUENCE_IDLE' | 'CHOREOGRAPHY_ACTIVE';

export type ChoreographyPhaseId =
  | 'IDLE'
  | 'PHASE_1_INSPECTION'
  | 'PHASE_2_KINEMATICS'
  | 'PHASE_3_TURNTABLE';

export interface ChoreographyConfig {
  totalDurationSec: number;
  phase1EndSec: number;
  phase2EndSec: number;
  captureFps: number;
  videoBitrateBitsPerSec: number;
  foldTicks: number[];
}

export interface ProductDimensions {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  bleed_mm: number;
}

export interface ProductCore {
  model: string;
  category: string;
  brand: string;
  artworkType: ArtworkType;
  dimensions: ProductDimensions;
}

export interface TechnicalSpec {
  id: string;
  label: string;
  value: string;
  required: boolean;
  maxChars?: number;
}

export interface DynamicSpec {
  id: string;
  label: string;
  value: string;
  maxChars?: number;
}

export type KspStatus = 'READY' | 'PENDING_AGENT_DRAW';

export interface KeySellingPoint {
  id: string;
  title: string;
  description: string;
  status: KspStatus;
  iconSvg: string | null;
}

export interface IngestionMetadata {
  agentId: string;
  batchId: string;
  ingestedAt: string;
  overrideCount: number;
}

export interface PackagingContract {
  product: ProductCore;
  technicalSpecs: TechnicalSpec[];
  dynamicSpecs: DynamicSpec[];
  keySellingPoints: KeySellingPoint[];
  preflight: PreflightState;
}

export interface AgentAnPbrTexturePack {
  packName: string;
  albedoMap: string | null;
  normalMap: string | null;
  roughnessMap: string | null;
  roughness: number;
  metalness: number;
  normalScale: number;
  gsm: number;
}

export interface CadLayerConfigItem {
  id: CadLayerId;
  label: Record<Language, string>;
  strokeColor: string;
  lineStyle: 'SOLID' | 'DASHED' | 'DOTTED' | 'FILL';
  tag: string;
  defaultVisible: boolean;
}

export interface CameraPresetConfigItem {
  id: CameraPresetId;
  label: Record<Language, string>;
  azimuthDeg: number;
  polarDeg: number;
  targetFoldPercent?: number;
  toggleWireframe?: boolean;
}

export interface SubstrateMaterialConfigItem {
  id: SubstratePresetId;
  label: Record<Language, string>;
  shortCode: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  gsm: number;
  surfaceTint2D: string;
  surfaceTint3D: string;
  interiorBoardColor: string;
  borderAccent: string;
  patternType: 'MATTE_EFLUTE' | 'KRAFT_FIBER' | 'GLOSS_IVORY' | 'FOIL_SPOT_UV' | 'CUSTOM_PBR';
  isCustomAgentSlot?: boolean;
}

export interface PreflightRuleConfigItem {
  id: PreflightRuleId;
  code: string;
  label: Record<Language, string>;
  detailPass: Record<Language, string>;
  detailFail: Record<Language, string>;
}

export interface OverflowThresholdsConfig {
  modelMaxChars: number;
  brandMaxChars: number;
  categoryMaxChars: number;
  specLabelMaxChars: number;
  specValueMaxChars: number;
  kspTitleMaxChars: number;
  kspDescriptionMaxChars: number;
}

export interface ProductionJobTicket {
  jobId: string;
  timestamp: string;
  surfaceAreaM2: string;
  weightGrams: number;
  substrateCode: string;
}
