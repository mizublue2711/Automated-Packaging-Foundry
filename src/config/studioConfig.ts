import {
  AgentAnPbrTexturePack,
  ArtworkType,
  CadLayerConfigItem,
  CadLayerVisibility,
  CameraPresetConfigItem,
  ChoreographyConfig,
  Language,
  OverflowThresholdsConfig,
  PackagingContract,
  PreflightRuleConfigItem,
  SubstrateMaterialConfigItem,
  SubstratePresetId,
} from '../types/packaging';

/**
 * ============================================================================
 * STUDIO CONFIG: SINGLE SOURCE OF TRUTH
 * Modify menus, CAD layers, 3D cameras, PBR materials, kinematic choreography,
 * WebM capture parameters, overflow gates, pre-flight rules, or translations here.
 * ============================================================================
 */

export const CHOREOGRAPHY_CONFIG: ChoreographyConfig = {
  totalDurationSec: 9.0,
  phase1EndSec: 1.4, // Phase 1: Top-down flat dieline inspection (0% fold)
  phase2EndSec: 5.2, // Phase 2: Camera glides to 45° isometric while folding 0% -> 100%
  captureFps: 60,
  videoBitrateBitsPerSec: 8_000_000,
  foldTicks: [0, 25, 50, 75, 100],
};

export const ARTWORK_MODE_OPTIONS: Array<{
  id: ArtworkType;
  label: Record<Language, string>;
  defaultSubstrate: SubstratePresetId;
}> = [
  {
    id: 'GIFT_BOX',
    label: { EN: '[ GIFT_BOX ]', VI: '[ HỘP QUÀ TẶNG ]' },
    defaultSubstrate: 'CCNB_EFLUTE_MATTE',
  },
  {
    id: 'CARTON_BOX',
    label: { EN: '[ CARTON_BOX ]', VI: '[ THÙNG CARTON ]' },
    defaultSubstrate: 'DUPLEX_KRAFT_CORRUGATED',
  },
  {
    id: 'ON_PRODUCT',
    label: { EN: '[ ON_PRODUCT ]', VI: '[ THÂN MÁY ]' },
    defaultSubstrate: 'METALLIC_FOIL_SPOT_UV',
  },
  {
    id: 'MANUAL',
    label: { EN: '[ MANUAL ]', VI: '[ SÁCH HDSD ]' },
    defaultSubstrate: 'IVORY_GLOSS_COATED',
  },
];

export const CAD_LAYER_CONFIG: CadLayerConfigItem[] = [
  {
    id: 'diecut',
    label: { EN: 'Cut Line (Diecut)', VI: 'Đường dao bế (Cut)' },
    strokeColor: '#EF4444',
    lineStyle: 'SOLID',
    tag: '#EF4444',
    defaultVisible: true,
  },
  {
    id: 'crease',
    label: { EN: 'Crease Fold', VI: 'Nếp gân cấn (Crease)' },
    strokeColor: '#00E5FF',
    lineStyle: 'DASHED',
    tag: '#00E5FF',
    defaultVisible: true,
  },
  {
    id: 'bleed',
    label: { EN: 'Bleed Perimeter', VI: 'Ranh bù xén (Bleed)' },
    strokeColor: '#6B7280',
    lineStyle: 'DOTTED',
    tag: '+3.0MM',
    defaultVisible: true,
  },
  {
    id: 'artwork',
    label: { EN: 'Artwork CMYK', VI: 'Lớp đồ họa CMYK' },
    strokeColor: '#10B981',
    lineStyle: 'FILL',
    tag: 'CMYK',
    defaultVisible: true,
  },
  {
    id: 'dimensions',
    label: { EN: 'Dimensions (MM)', VI: 'Đường kích thước (MM)' },
    strokeColor: '#00E5FF',
    lineStyle: 'SOLID',
    tag: 'DIM',
    defaultVisible: true,
  },
];

export const DEFAULT_CAD_LAYERS: CadLayerVisibility = CAD_LAYER_CONFIG.reduce(
  (acc, item) => ({ ...acc, [item.id]: item.defaultVisible }),
  {} as CadLayerVisibility
);

export const CAMERA_PRESET_CONFIG: CameraPresetConfigItem[] = [
  {
    id: 'ISO_FRONT',
    label: { EN: '[ ISO_FRONT // 100% ]', VI: '[ ISO_FRONT // MẶT TRƯỚC ]' },
    azimuthDeg: 36,
    polarDeg: 56,
    targetFoldPercent: 100,
  },
  {
    id: 'ISO_BACK',
    label: { EN: '[ ISO_BACK // SPECS ]', VI: '[ ISO_BACK // MẶT SAU ]' },
    azimuthDeg: 216,
    polarDeg: 58,
    targetFoldPercent: 100,
  },
  {
    id: 'TOP_DOWN_FLAT',
    label: { EN: '[ TOP_DOWN // 0% FLAT ]', VI: '[ TOP_DOWN // TRẢI PHẲNG 0% ]' },
    azimuthDeg: 0,
    polarDeg: 8,
    targetFoldPercent: 0,
  },
  {
    id: 'TOP_FLAP',
    label: { EN: '[ TOP_FLAP // 65% FOLD ]', VI: '[ TOP_FLAP // ĐANG GẬP 65% ]' },
    azimuthDeg: 42,
    polarDeg: 46,
    targetFoldPercent: 65,
  },
  {
    id: 'WIREFRAME_XRAY',
    label: { EN: '[ WIREFRAME_XRAY ]', VI: '[ WIREFRAME_XRAY // KHUNG DÂY ]' },
    azimuthDeg: 36,
    polarDeg: 56,
    toggleWireframe: true,
  },
];

export const SUBSTRATE_MATERIAL_CONFIG: Record<SubstratePresetId, SubstrateMaterialConfigItem> = {
  CCNB_EFLUTE_MATTE: {
    id: 'CCNB_EFLUTE_MATTE',
    label: {
      EN: '[ 350GSM CCNB + E-FLUTE (MATTE) ]',
      VI: '[ 350GSM CCNB + SÓNG E (CÁN MỜ) ]',
    },
    shortCode: '350GSM CCNB + E-FLUTE',
    roughness: 0.65,
    metalness: 0.0,
    clearcoat: 0.1,
    gsm: 580,
    surfaceTint2D: '#0A0C14',
    surfaceTint3D: '#101524',
    interiorBoardColor: '#2A2723',
    borderAccent: '#00E5FF',
    patternType: 'MATTE_EFLUTE',
  },
  DUPLEX_KRAFT_CORRUGATED: {
    id: 'DUPLEX_KRAFT_CORRUGATED',
    label: {
      EN: '[ 400GSM DUPLEX / KRAFT CORRUGATED ]',
      VI: '[ 400GSM DUPLEX / CARTON KRAFT MỘC ]',
    },
    shortCode: '400GSM DUPLEX / KRAFT',
    roughness: 0.85,
    metalness: 0.0,
    clearcoat: 0.0,
    gsm: 680,
    surfaceTint2D: '#1A1510',
    surfaceTint3D: '#2B2118',
    interiorBoardColor: '#4A3728',
    borderAccent: '#D97706',
    patternType: 'KRAFT_FIBER',
  },
  IVORY_GLOSS_COATED: {
    id: 'IVORY_GLOSS_COATED',
    label: {
      EN: '[ 300GSM IVORY BOARD (GLOSS) ]',
      VI: '[ 300GSM GIẤY IVORY (CÁN BÓNG) ]',
    },
    shortCode: '300GSM IVORY GLOSS',
    roughness: 0.2,
    metalness: 0.05,
    clearcoat: 0.85,
    gsm: 450,
    surfaceTint2D: '#0D1322',
    surfaceTint3D: '#141E36',
    interiorBoardColor: '#333846',
    borderAccent: '#00E5FF',
    patternType: 'GLOSS_IVORY',
  },
  METALLIC_FOIL_SPOT_UV: {
    id: 'METALLIC_FOIL_SPOT_UV',
    label: {
      EN: '[ METALLIC FOIL ACCENT + SPOT UV ]',
      VI: '[ ÉP KIM METALLIC + PHỦ UV ĐỊNH HÌNH ]',
    },
    shortCode: 'METALLIC FOIL + SPOT UV',
    roughness: 0.08,
    metalness: 0.85,
    clearcoat: 1.0,
    gsm: 520,
    surfaceTint2D: '#0F0D1E',
    surfaceTint3D: '#1A1538',
    interiorBoardColor: '#252238',
    borderAccent: '#5322FF',
    patternType: 'FOIL_SPOT_UV',
  },
  AGENT_AN_CUSTOM_PBR: {
    id: 'AGENT_AN_CUSTOM_PBR',
    label: {
      EN: '[ ⚡ LOAD AGENT AN CUSTOM PBR ASSET PACK ]',
      VI: '[ ⚡ NẠP GÓI VẬT LIỆU PBR TỪ AGENT AN ]',
    },
    shortCode: 'AGENT_AN CUSTOM PBR',
    roughness: 0.24,
    metalness: 0.72,
    clearcoat: 0.65,
    gsm: 610,
    surfaceTint2D: '#09131C',
    surfaceTint3D: '#102232',
    interiorBoardColor: '#1E2D3B',
    borderAccent: '#10B981',
    patternType: 'CUSTOM_PBR',
    isCustomAgentSlot: true,
  },
};

export const PREFLIGHT_RULE_CONFIG: PreflightRuleConfigItem[] = [
  {
    id: 'cmykColorSpace',
    code: 'COLOR',
    label: {
      EN: 'CMYK + PANTONE SPOT',
      VI: 'HỆ MÀU CMYK + PANTONE SPOT',
    },
    detailPass: {
      EN: 'ISO Coated v2 300% + PMS 2935C Locked',
      VI: 'Chuẩn ISO Coated v2 300% + PMS 2935C',
    },
    detailFail: {
      EN: 'RGB Profile Detected — Convert to CMYK',
      VI: 'Phát hiện hệ màu RGB — Cần chuyển CMYK',
    },
  },
  {
    id: 'diecutOverprint',
    code: 'DIECUT',
    label: {
      EN: 'OVERPRINT LOCKED',
      VI: 'DAO BẾ ĐÃ KHÓA IN ĐÈ',
    },
    detailPass: {
      EN: '0.5pt Spot Cut #EF4444 Overprint=ON',
      VI: 'Dao bế Spot #EF4444 đã bật Overprint',
    },
    detailFail: {
      EN: 'Diecut Layer Hidden or Knockout Active',
      VI: 'Lớp dao bế đang ẩn hoặc chưa bật in đè',
    },
  },
  {
    id: 'barcodeVerified',
    code: 'BARCODE',
    label: {
      EN: 'EAN-13 VERIFIED',
      VI: 'MÃ VẠCH ĐẠT CHUẨN QUÉT',
    },
    detailPass: {
      EN: 'GS1-13 Checksum & Quiet Zone Verified',
      VI: 'Mã vạch GS1 EAN-13 hợp lệ (Đạt chuẩn quét)',
    },
    detailFail: {
      EN: 'EAN-13 Check Digit Mismatch in Dock 01',
      VI: 'Sai số kiểm tra cuối mã vạch EAN-13 ở Cột 01',
    },
  },
  {
    id: 'bleedPass',
    code: 'BLEED',
    label: {
      EN: '3.0MM UNIFORM',
      VI: 'TRÀN LỀ BÙ XÉN 3.0MM',
    },
    detailPass: {
      EN: 'Perimeter Offset >= 2.0mm ISO 12647',
      VI: 'Ranh bù xén đạt chuẩn tối thiểu >= 2.0mm',
    },
    detailFail: {
      EN: 'Bleed Below 2.0mm Minimum Threshold',
      VI: 'Bù xén nhỏ hơn ngưỡng an toàn 2.0mm',
    },
  },
  {
    id: 'fontOutlined',
    code: 'TYPE',
    label: {
      EN: '100% OUTLINED',
      VI: 'CHỮ ĐÃ BIẾN THÀNH VECTOR',
    },
    detailPass: {
      EN: '0 Live Fonts // All KSP Icons & Text Within Box',
      VI: '100% Vector hóa // Không tràn khung chữ',
    },
    detailFail: {
      EN: 'Pending KSP Vector or Bounding Box Overflow',
      VI: 'Còn icon chờ Agent An hoặc chữ tràn khung bế',
    },
  },
];

export const OVERFLOW_THRESHOLDS: OverflowThresholdsConfig = {
  modelMaxChars: 14,
  brandMaxChars: 16,
  categoryMaxChars: 34,
  specLabelMaxChars: 22,
  specValueMaxChars: 20,
  kspTitleMaxChars: 22,
  kspDescriptionMaxChars: 34,
};

export const INK_SEPARATION_PLATES = [
  { code: 'C', density: '64%', border: '#00E5FF', text: '#00E5FF' },
  { code: 'M', density: '42%', border: '#EC4899', text: '#EC4899' },
  { code: 'Y', density: '18%', border: '#EAB308', text: '#EAB308' },
  { code: 'K', density: '88%', border: '#8A8FA3', text: '#FFFFFF' },
  { code: 'PMS', density: 'SPOT', border: '#5322FF', text: '#00E5FF' },
  { code: 'DIE', density: 'CUT', border: '#EF4444', text: '#EF4444' },
];

export const DEFAULT_AGENT_AN_PBR_PACK: AgentAnPbrTexturePack = {
  packName: 'AN_PBR_BRUSHED_TITANIUM_UV_v2',
  albedoMap:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' fill='%230b1320'/><path d='M0 20h120M0 40h120M0 60h120M0 80h120M0 100h120' stroke='%2300e5ff' stroke-opacity='0.14' stroke-width='1'/><path d='M20 0v120M40 0v120M60 0v120M80 0v120M100 0v120' stroke='%235322ff' stroke-opacity='0.14' stroke-width='1'/></svg>",
  normalMap:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%238080ff'/><circle cx='16' cy='16' r='6' fill='none' stroke='%239999ff' stroke-width='1.5'/><circle cx='48' cy='48' r='6' fill='none' stroke='%236666ff' stroke-width='1.5'/><path d='M0 32h64M32 0v64' stroke='%237070ff' stroke-width='1'/></svg>",
  roughnessMap:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%23383838'/><rect x='8' y='8' width='20' height='20' fill='%23181818'/><rect x='36' y='36' width='20' height='20' fill='%23181818'/></svg>",
  roughness: 0.24,
  metalness: 0.72,
  normalScale: 1.0,
  gsm: 610,
};

export const AGENT_AN_PROCEDURAL_PBR_PACKS: AgentAnPbrTexturePack[] = [
  DEFAULT_AGENT_AN_PBR_PACK,
  {
    packName: 'AN_PBR_HEX_CARBON_SPOT_FOIL',
    roughness: 0.14,
    metalness: 0.88,
    normalScale: 1.2,
    gsm: 640,
    albedoMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%23090d16'/><polygon points='40,6 72,24 72,56 40,74 8,56 8,24' fill='none' stroke='%2300e5ff' stroke-opacity='0.24' stroke-width='1.5'/><circle cx='40' cy='40' r='10' fill='none' stroke='%2310b981' stroke-opacity='0.22' stroke-width='1'/></svg>",
    normalMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%237878ff'/><polygon points='32,8 56,20 56,44 32,56 8,44 8,20' fill='none' stroke='%23a0a0ff' stroke-width='2'/></svg>",
    roughnessMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%23202020'/><circle cx='32' cy='32' r='16' fill='%230a0a0a'/></svg>",
  },
  {
    packName: 'AN_PBR_ECO_KRAFT_FLUTE_NORMAL',
    roughness: 0.78,
    metalness: 0.05,
    normalScale: 0.9,
    gsm: 720,
    albedoMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231e1710'/><path d='M0 10L100 25M0 40L100 55M0 70L100 85M20 0L35 100M65 0L80 100' stroke='%23d97706' stroke-opacity='0.2' stroke-width='1.2'/></svg>",
    normalMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%238080ff'/><line x1='0' y1='0' x2='64' y2='64' stroke='%236868ee' stroke-width='2'/></svg>",
    roughnessMap:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%23c0c0c0'/></svg>",
  },
];

export const INITIAL_AGENT_CONTRACT: PackagingContract = {
  product: {
    model: 'AFB-5888',
    category: 'Nồi chiên không dầu điện tử',
    brand: 'BlueStone',
    artworkType: 'GIFT_BOX',
    dimensions: {
      length_mm: 380,
      width_mm: 320,
      height_mm: 395,
      bleed_mm: 3.0,
    },
  },
  technicalSpecs: [
    { id: 'voltage', label: 'Điện áp', value: '220V - 50Hz', required: true },
    { id: 'power', label: 'Công suất', value: '1800W', required: true },
    { id: 'capacity', label: 'Dung tích', value: '6.5 Lít', required: true },
    { id: 'barcode', label: 'Mã vạch EAN-13', value: '8935219412345', required: true },
  ],
  dynamicSpecs: [
    { id: 'temp_range', label: 'Dải nhiệt độ', value: '40°C - 200°C' },
    { id: 'timer', label: 'Hẹn giờ', value: '60 Phút' },
  ],
  keySellingPoints: [
    {
      id: 'ksp-1',
      title: 'Rapid Air 360°',
      description: 'Giảm 80% dầu mỡ thừa',
      status: 'READY',
      iconSvg:
        "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><circle cx='24' cy='24' r='20'/><path d='M16 24c4-8 12-8 16 0-4 8-12 8-16 0z'/></svg>",
    },
    {
      id: 'ksp-2',
      title: 'Chống dính Greblon',
      description: 'Chuẩn Đức, bền bỉ',
      status: 'PENDING_AGENT_DRAW',
      iconSvg: null,
    },
  ],
  preflight: {
    cmykColorSpace: true,
    diecutOverprint: true,
    barcodeVerified: true,
    bleedPass: true,
    fontOutlined: true,
  },
};

export const AGENT_AN_SAMPLE_CONTRACTS: Array<{
  id: string;
  label: string;
  contract: PackagingContract;
}> = [
  {
    id: 'AFB-5888',
    label: 'AFB-5888 // 6.5L Digital Air Fryer (Default)',
    contract: INITIAL_AGENT_CONTRACT,
  },
  {
    id: 'ICB-6619',
    label: 'ICB-6619 // 2000W Induction Cooker Gift Box',
    contract: {
      product: {
        model: 'ICB-6619',
        category: 'Bếp từ đơn cảm ứng mặt kính Schott',
        brand: 'BlueStone',
        artworkType: 'GIFT_BOX',
        dimensions: {
          length_mm: 350,
          width_mm: 115,
          height_mm: 410,
          bleed_mm: 3.0,
        },
      },
      technicalSpecs: [
        { id: 'voltage', label: 'Điện áp', value: '220V - 50Hz', required: true },
        { id: 'power', label: 'Công suất', value: '2000W', required: true },
        { id: 'capacity', label: 'Mặt kính', value: 'Ceramic A+', required: true },
        { id: 'barcode', label: 'Mã vạch EAN-13', value: '8935219466195', required: true },
      ],
      dynamicSpecs: [
        { id: 'coil', label: 'Mâm từ', value: 'Đồng nguyên chất 2 lớp' },
        { id: 'levels', label: 'Mức nhiệt', value: '9 Mức công suất' },
      ],
      keySellingPoints: [
        {
          id: 'ksp-1',
          title: 'Kính Ceramic A+',
          description: 'Chịu nhiệt 750°C, chống trầy',
          status: 'READY',
          iconSvg:
            "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><polygon points='24,4 42,14 42,34 24,44 6,34 6,14'/><path d='M18 24l4 4 8-8'/></svg>",
        },
        {
          id: 'ksp-2',
          title: 'Cảm ứng trượt Slide',
          description: 'Điều khiển 9 mức nhiệt nhạy',
          status: 'READY',
          iconSvg:
            "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='6' y='8' width='36' height='32'/><line x1='6' y1='18' x2='42' y2='18'/><circle cx='16' cy='29' r='4'/><circle cx='32' cy='29' r='4'/></svg>",
        },
      ],
      preflight: {
        cmykColorSpace: true,
        diecutOverprint: true,
        barcodeVerified: true,
        bleedPass: true,
        fontOutlined: true,
      },
    },
  },
];

export const VECTORCRAFT_ICON_TEMPLATES: Record<string, string> = {
  greblon:
    "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><polygon points='24,4 42,14 42,34 24,44 6,34 6,14'/><polygon points='24,11 35,17 35,31 24,37 13,31 13,17' stroke-dasharray='2 2'/><path d='M18 24l4 4 8-8'/><line x1='24' y1='4' x2='24' y2='11'/><line x1='24' y1='37' x2='24' y2='44'/></svg>",
  rapidAir:
    "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><circle cx='24' cy='24' r='20'/><path d='M16 24c4-8 12-8 16 0-4 8-12 8-16 0z'/><path d='M24 8c6 4 6 12 0 16-6-4-6-12 0-16z' opacity='0.65'/><circle cx='24' cy='24' r='3'/></svg>",
  digitalTouch:
    "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='6' y='8' width='36' height='32'/><line x1='6' y1='18' x2='42' y2='18'/><circle cx='16' cy='29' r='4'/><circle cx='32' cy='29' r='4'/><line x1='22' y1='13' x2='26' y2='13'/></svg>",
  thermalShield:
    "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><path d='M24 5L40 11v13c0 10.5-6.8 16.8-16 20-9.2-3.2-16-9.5-16-20V11L24 5z'/><path d='M24 14v14'/><circle cx='24' cy='32' r='2.5'/></svg>",
  precisionGrid:
    "<svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='7' y='7' width='34' height='34'/><line x1='7' y1='18' x2='41' y2='18'/><line x1='7' y1='30' x2='41' y2='30'/><line x1='18' y1='7' x2='18' y2='41'/><line x1='30' y1='7' x2='30' y2='41'/><circle cx='24' cy='24' r='5'/></svg>",
};

export function selectVectorCraftSvg(title: string, index: number): string {
  const normalized = title.toLowerCase();
  if (normalized.includes('greblon') || normalized.includes('dính') || normalized.includes('đức')) {
    return VECTORCRAFT_ICON_TEMPLATES.greblon;
  }
  if (normalized.includes('rapid') || normalized.includes('air') || normalized.includes('360')) {
    return VECTORCRAFT_ICON_TEMPLATES.rapidAir;
  }
  if (normalized.includes('cảm ứng') || normalized.includes('led') || normalized.includes('touch')) {
    return VECTORCRAFT_ICON_TEMPLATES.digitalTouch;
  }
  if (normalized.includes('nhiệt') || normalized.includes('an toàn') || normalized.includes('tự ngắt')) {
    return VECTORCRAFT_ICON_TEMPLATES.thermalShield;
  }
  const keys = Object.keys(VECTORCRAFT_ICON_TEMPLATES);
  return VECTORCRAFT_ICON_TEMPLATES[keys[index % keys.length]];
}

export function evaluateEan13(raw: string): {
  cleaned: string;
  isValidLength: boolean;
  expectedCheckDigit: number | null;
  actualCheckDigit: number | null;
  isChecksumMatch: boolean;
} {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 13) {
    return {
      cleaned: digits,
      isValidLength: false,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      isChecksumMatch: false,
    };
  }

  const first12 = digits.slice(0, 12).split('').map(Number);
  const sum = first12.reduce((acc, d, idx) => acc + d * (idx % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;
  const actual = digits.length === 13 ? Number(digits[12]) : expected;

  return {
    cleaned: digits.padEnd(13, String(expected)),
    isValidLength: digits.length === 13,
    expectedCheckDigit: expected,
    actualCheckDigit: actual,
    isChecksumMatch: digits.length === 13 && actual === expected,
  };
}

const L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G_CODES = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R_CODES = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY_MAP = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function encodeEan13Bits(rawCode: string): string {
  const digits = rawCode.replace(/\D/g, '').padEnd(13, '0').slice(0, 13);
  const firstDigit = Number(digits[0]) || 0;
  const leftDigits = digits.slice(1, 7).split('').map(Number);
  const rightDigits = digits.slice(7, 13).split('').map(Number);
  const parityPattern = PARITY_MAP[firstDigit] || 'LLLLLL';

  let bits = '101';
  for (let i = 0; i < 6; i++) {
    const d = leftDigits[i] || 0;
    bits += parityPattern[i] === 'L' ? L_CODES[d] : G_CODES[d];
  }
  bits += '01010';
  for (let i = 0; i < 6; i++) {
    const d = rightDigits[i] || 0;
    bits += R_CODES[d];
  }
  bits += '101';
  return bits;
}

export function countContractOverflows(contract: PackagingContract): number {
  let count = 0;
  if (contract.product.model.length > OVERFLOW_THRESHOLDS.modelMaxChars) count++;
  if (contract.product.brand.length > OVERFLOW_THRESHOLDS.brandMaxChars) count++;
  if (contract.product.category.length > OVERFLOW_THRESHOLDS.categoryMaxChars) count++;

  contract.technicalSpecs.forEach((s) => {
    if (s.label.length > OVERFLOW_THRESHOLDS.specLabelMaxChars) count++;
    if (s.value.length > (s.maxChars || OVERFLOW_THRESHOLDS.specValueMaxChars)) count++;
  });

  contract.dynamicSpecs.forEach((s) => {
    if (s.label.length > OVERFLOW_THRESHOLDS.specLabelMaxChars) count++;
    if (s.value.length > (s.maxChars || OVERFLOW_THRESHOLDS.specValueMaxChars)) count++;
  });

  contract.keySellingPoints.forEach((k) => {
    if (k.title.length > OVERFLOW_THRESHOLDS.kspTitleMaxChars) count++;
    if (k.description.length > OVERFLOW_THRESHOLDS.kspDescriptionMaxChars) count++;
  });

  return count;
}

export const UI_DICTIONARY = {
  EN: {
    brandTitle: '[ FOUNDRY // BLUESTONE_PACKAGING_ENGINE ]',
    loadContractHeaderBtn: '[ ⏣ LOAD AGENT CONTRACT ]',
    exportJsonBtn: '[ EXPORT JSON ]',
    resetBtn: '[ RESET ]',
    overflowBadge: '[ ⚠️ OVERFLOW // EXCEEDS BOUNDING BOX ]',
    col1: {
      header: '[ 01 // AGENT_INGESTION_&_OVERRIDE_DOCK ]',
      ingestionBanner: '[ INGESTION // LOADED_FROM_AGENT_AN ]',
      loadNewContractBtn: '[ ⏣ LOAD NEW AGENT CONTRACT (JSON) ]',
      accStructure: '01.A // BASE_STRUCTURE_INSPECTOR',
      accSpecs: '01.B // TECHNICAL_SPECS_OVERRIDE',
      accKsp: '01.C // KSP_ICON_ASSETS_VIEWER',
      quickEditBtn: '[ Quick Edit ]',
      lockReadOnlyBtn: '[ Lock Read-Only ]',
      readOnlyTag: 'READ_ONLY // AGENT_LOCKED',
      editingTag: 'QUICK_OVERRIDE_ACTIVE',
      modelId: 'MODEL_ID',
      brandEntity: 'BRAND_ENTITY',
      categoryDesc: 'ARTWORK_CATEGORY',
      dielineGeometry: 'DIELINE_GEOMETRY (L × W × H + BLEED)',
      clickToOverrideHint: 'CLICK ANY VALUE BELOW FOR INLINE OVERRIDE',
      coreSpecs: {
        voltage: 'Rated Voltage',
        power: 'Rated Power',
        capacity: 'Capacity',
        barcode: 'Barcode EAN-13',
      },
      dynamicSpecsHeader: 'EXTRACTED_EXTENSION_SPECS',
      addOverrideSpecBtn: '[ + ADD SPEC OVERRIDE ]',
      commitFieldBtn: '[ COMMIT ]',
      cancelBtn: '[ CANCEL ]',
      verifiedVectorBadge: '[ VERIFIED_VECTOR ]',
      pendingVectorBadge: '[ PENDING_AN ]',
      triggerVectorCraftBtn: '[ TRIGGER VECTORCRAFT MCP ]',
      synthesizingSvg: '[ AGENT_AN // SYNTHESIZING_SVG... ]',
      eanChecksumPass: 'EAN-13 CHECKSUM VERIFIED',
      fixDigitBtn: '[ AUTO-FIX ]',
      cycleVectorBtn: '[ CYCLE_SVG ]',
      synthNowBtn: '[ SYNTH_SVG ]',
    },
    col2: {
      header: '[ 02 // DIECUT_&_MOCKUP_VIEWPORT ]',
      flat2dBtn: '[ 2D FLAT DIECUT SHEET ]',
      folded3dBtn: '[ 3D FOLDED PROTOTYPE ]',
      cadLayersMenu: 'CAD_LAYERS',
      cameraPresetsMenu: 'CAMERA_PRESETS',
      substrateMenu: 'SUBSTRATE_&_FINISH',
      pbrBindingsBtn: '[ ⚡ PBR_MAP_BINDINGS ]',
      fitBtn: '[ ⛶ FIT TO SCREEN ]',
      focusModeBtn: '[ ⛶ FULL CANVAS ]',
      exitFocusModeBtn: '[ ◫ RESTORE DOCKS ]',
      collapseLeftBtn: '[ ◀ COLLAPSE ]',
      expandLeftBtn: '[ ▶ EXPAND DOCK 01 ]',
      collapseRightBtn: '[ COLLAPSE ▶ ]',
      expandRightBtn: '[ ◀ EXPAND DOCK 03 ]',
      sheetLabel: 'SHEET',
      dragOrbitHint: 'DRAG CANVAS TO ORBIT 3D PROTOTYPE // KINEMATIC HINGE TREE ACTIVE',
      foldedVolume: 'FOLDED_VOLUME',
    },
    showcase: {
      foldSequenceLabel: 'FOLD SEQUENCE: 0% (FLAT) -> 100% (CLOSED)',
      sequenceIdleTag: '[ ⏣ SEQUENCE_IDLE ]',
      choreographyActiveTag: '[ ⏣ CHOREOGRAPHY_ACTIVE ]',
      playDirectorBtn: '[ ▶ AUTO-STAGE DIRECTOR ]',
      pauseDirectorBtn: '[ ⏸ PAUSE SEQUENCE ]',
      replayDirectorBtn: '[ ↺ REPLAY ]',
      recordWebmBtn: '[ ⏺ RECORD 3D SHOWCASE (WEBM) ]',
      recordingActiveBtn: '[ 🔴 REC 60FPS // STOP & SAVE ]',
      camTag: '[ CAM // 360_ORBIT ]',
      exportTag: '[ EXPORT // WEBM_DELIVERABLE ]',
      phase1Label: 'PHASE 01 // FLAT DIELINE INSPECTION',
      phase2Label: 'PHASE 02 // KINEMATIC FOLDING 0->100%',
      phase3Label: 'PHASE 03 // 360° STUDIO TURNTABLE',
      hideHudBtn: '[ ▾ HIDE_HUD ]',
      showHudBtn: '[ ▴ SHOW_3D_RECORDER_HUD ]',
    },
    col3: {
      header: '[ 03 // PREFLIGHT_AUDIT_&_EXPORT ]',
      statusReady: '[ STATUS // READY ]',
      statusPassSuffix: 'PASS',
      checklistHeader: '[ 03.A // HARDWARE_PREFLIGHT_QA ]',
      reverifyBtn: '[ RE-VERIFY ]',
      telemetryAccordion: 'TELEMETRY_DETAILS & INK_SEPARATIONS',
      contractAccordion: 'RAW_AGENT_CONTRACT_JSON',
      surfaceArea: 'Surface Area',
      sheetExtents: 'Sheet Extents',
      substrateGrade: 'Substrate Grade',
      boardWeight: 'Board Weight Est.',
      pbrOptics: 'PBR Rough / Metal',
      tacLabel: 'Total Area Coverage (TAC)',
      activeLayers: 'Active CAD Layers',
      generateCta: '[ ⏣ GENERATE PRODUCTION PDF/X ]',
      compilingCta: '[ COMPILING PDF/X-4 SEPARATIONS... ]',
      warnPreflight: 'PREFLIGHT RULE(S) REQUIRE ATTENTION',
      overflowGateAlert: 'BOUNDING BOX OVERFLOW DETECTED IN DOCK 01',
    },
  },
  VI: {
    brandTitle: '[ XƯỞNG ĐÚC // HỆ THỐNG_BAO_BÌ_BLUESTONE ]',
    loadContractHeaderBtn: '[ ⏣ NẠP HỢP ĐỒNG AGENT ]',
    exportJsonBtn: '[ XUẤT JSON ]',
    resetBtn: '[ ĐẶT LẠI ]',
    overflowBadge: '[ ⚠️ TRÀN KHUNG // VƯỢT GIỚI HẠN BẾ ]',
    col1: {
      header: '[ 01 // TRẠM TIẾP NHẬN & GHI ĐÈ AGENT AN ]',
      ingestionBanner: '[ TIẾP NHẬN // ĐÃ NẠP TỪ AGENT_AN ]',
      loadNewContractBtn: '[ ⏣ NẠP HỢP ĐỒNG AGENT MỚI (JSON) ]',
      accStructure: '01.A // BASE_STRUCTURE_INSPECTOR (CẤU TRÚC)',
      accSpecs: '01.B // TECHNICAL_SPECS_OVERRIDE (GHI ĐÈ THÔNG SỐ)',
      accKsp: '01.C // KSP_ICON_ASSETS_VIEWER (THƯ VIỆN VECTOR)',
      quickEditBtn: '[ Sửa Nhanh ]',
      lockReadOnlyBtn: '[ Khóa Chỉ Đọc ]',
      readOnlyTag: 'CHỈ_ĐỌC // ĐỒNG_BỘ_AGENT',
      editingTag: 'ĐANG_MỞ_GHI_ĐÈ_NHANH',
      modelId: 'MÃ_MODEL',
      brandEntity: 'THƯƠNG_HIỆU',
      categoryDesc: 'DANH_MỤC_BAO_BÌ',
      dielineGeometry: 'KÍCH THƯỚC KHUÔN BẾ (D × R × C + BÙ XÉN)',
      clickToOverrideHint: 'NHẤP TRỰC TIẾP VÀO GIÁ TRỊ ĐỂ SỬA NHANH',
      coreSpecs: {
        voltage: 'Điện áp định mức',
        power: 'Công suất định mức',
        capacity: 'Dung tích cối',
        barcode: 'Mã vạch EAN-13',
      },
      dynamicSpecsHeader: 'THÔNG_SỐ_MỞ_RỘNG_TRÍCH_XUẤT',
      addOverrideSpecBtn: '[ + THÊM THÔNG SỐ GHI ĐÈ ]',
      commitFieldBtn: '[ LƯU ]',
      cancelBtn: '[ HỦY ]',
      verifiedVectorBadge: '[ VERIFIED_VECTOR // CHUẨN ]',
      pendingVectorBadge: '[ PENDING_AN // CHỜ VẼ ]',
      triggerVectorCraftBtn: '[ KÍCH HOẠT VECTORCRAFT MCP ]',
      synthesizingSvg: '[ AGENT_AN // ĐANG VẼ VECTOR SVG... ]',
      eanChecksumPass: 'MÃ VẠCH EAN-13 ĐẠT CHUẨN QUÉT',
      fixDigitBtn: '[ TỰ SỬA ]',
      cycleVectorBtn: '[ ĐỔI_ICON ]',
      synthNowBtn: '[ VẼ_NGAY ]',
    },
    col2: {
      header: '[ 02 // KHUNG NHÌN BẢN VẼ BẾ & HỘP 3D ]',
      flat2dBtn: '[ BẢN VẼ TRẢI PHẲNG 2D ]',
      folded3dBtn: '[ MÔ PHỎNG HỘP GẬP 3D ]',
      cadLayersMenu: 'CAD_LAYERS',
      cameraPresetsMenu: 'CAMERA_PRESETS',
      substrateMenu: 'SUBSTRATE_&_FINISH',
      pbrBindingsBtn: '[ ⚡ CẤU HÌNH PBR AGENT AN ]',
      fitBtn: '[ ⛶ VỪA KHUNG HÌNH ]',
      focusModeBtn: '[ ⛶ TOÀN MÀN HÌNH ]',
      exitFocusModeBtn: '[ ◫ MỞ CỘT BÊN ]',
      collapseLeftBtn: '[ ◀ THU GỌN ]',
      expandLeftBtn: '[ ▶ MỞ CỘT 01 ]',
      collapseRightBtn: '[ THU GỌN ▶ ]',
      expandRightBtn: '[ ◀ MỞ CỘT 03 ]',
      sheetLabel: 'KHỔ GIẤY',
      dragOrbitHint: 'KÉO CHUỘT ĐỂ XOAY HỘP 3D // ĐỘNG HỌC GẬP KHỚP BẢN LỀ',
      foldedVolume: 'THỂ_TÍCH_HỘP',
    },
    showcase: {
      foldSequenceLabel: 'TIẾN TRÌNH GẬP HỘP: 0% (TRẢI PHẲNG) -> 100% (ĐÓNG KÍN)',
      sequenceIdleTag: '[ ⏣ SEQUENCE_IDLE ]',
      choreographyActiveTag: '[ ⏣ CHOREOGRAPHY_ACTIVE ]',
      playDirectorBtn: '[ ▶ DIỄN HOẠT GẬP & XOAY 360° ]',
      pauseDirectorBtn: '[ ⏸ TẠM DỪNG ]',
      replayDirectorBtn: '[ ↺ CHẠY LẠI ]',
      recordWebmBtn: '[ ⏺ RECORD 3D SHOWCASE (WEBM) ]',
      recordingActiveBtn: '[ 🔴 REC 60FPS // DỪNG & LƯU FILE ]',
      camTag: '[ CAM // 360_ORBIT ]',
      exportTag: '[ EXPORT // WEBM_DELIVERABLE ]',
      phase1Label: 'PHA 01 // KIỂM TRA BẢN TRẢI PHẲNG 0%',
      phase2Label: 'PHA 02 // ĐỘNG HỌC GẬP KHỚP 0->100%',
      phase3Label: 'PHA 03 // BÀN XOAY 360° ÁNH SÁNG STUDIO',
      hideHudBtn: '[ ▾ ẨN_THANH_ĐIỀU_KHIỂN ]',
      showHudBtn: '[ ▴ HIỆN_THANH_ĐIỀU_KHIỂN_3D ]',
    },
    col3: {
      header: '[ 03 // KIỂM ĐỊNH CHẾ BẢN & XUẤT FILE ]',
      statusReady: '[ TRẠNG THÁI // SẴN SÀNG ]',
      statusPassSuffix: 'ĐẠT',
      checklistHeader: '[ 03.A // DANH MỤC KIỂM ĐỊNH CHẾ BẢN ]',
      reverifyBtn: '[ QUÉT LẠI ]',
      telemetryAccordion: 'TELEMETRY_DETAILS & INK_SEPARATIONS (ĐO LƯỜNG)',
      contractAccordion: 'HỢP ĐỒNG DỮ LIỆU GỐC (JSON)',
      surfaceArea: 'Diện tích trải phẳng',
      sheetExtents: 'Khổ giấy trải phẳng',
      substrateGrade: 'Quy cách cốt giấy',
      boardWeight: 'Trọng lượng hộp dự kiến',
      pbrOptics: 'Độ nhám / Ánh kim PBR',
      tacLabel: 'Tổng lượng phủ mực (TAC)',
      activeLayers: 'Số lớp CAD kích hoạt',
      generateCta: '[ ⏣ XUẤT FILE IN KỸ THUẬT PDF/X ]',
      compilingCta: '[ ĐANG TÁCH KẼM MÀU PDF/X-4... ]',
      warnPreflight: 'MỤC KIỂM ĐỊNH CẦN XỬ LÝ',
      overflowGateAlert: 'PHÁT HIỆN CHỮ TRÀN KHUNG BẾ Ở CỘT 01',
    },
  },
} as const;

export function getTranslation(lang: Language) {
  return UI_DICTIONARY[lang];
}
