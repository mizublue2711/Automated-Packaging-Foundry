import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileCode2,
  Layers,
  Maximize2,
  Minimize2,
  Palette,
  Sliders,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AgentAnPbrTexturePack,
  CadLayerId,
  CadLayerVisibility,
  CameraPresetConfigItem,
  CameraPresetId,
  ChoreographyPhaseId,
  ChoreographyStatus,
  Language,
  PackagingContract,
  SubstratePresetId,
} from '../types/packaging';
import {
  AGENT_AN_PROCEDURAL_PBR_PACKS,
  CAD_LAYER_CONFIG,
  CAMERA_PRESET_CONFIG,
  OVERFLOW_THRESHOLDS,
  SUBSTRATE_MATERIAL_CONFIG,
  computeFlatSheetCalibration,
  countContractOverflows,
  encodeEan13Bits,
  evaluateEan13,
  getTranslation,
} from '../config/studioConfig';
import {
  SCB6119_GIFTBOX_CREASE_PATH_MM,
  SCB6119_GIFTBOX_CUT_PATH_MM,
} from '../config/scb6119FlatDielinePaths';
import { DynamicBoxEngine } from './DynamicBoxEngine';
import { ShowcaseRecorderBar } from './ShowcaseRecorderBar';
import packaging3dMaterials from '../config/packaging_3d_materials.json';
import fefco0201RscJson from '../config/topologies/FEFCO_0201_RSC.json';
import fefco0215TuckJson from '../config/topologies/FEFCO_0215_TUCK.json';
import { BoxTopologySpec } from '../engines/BoxKinematicsSolver';

const TOPOLOGY_BY_ARTWORK_TYPE: Record<string, BoxTopologySpec> = {
  CARTON_BOX: fefco0201RscJson as unknown as BoxTopologySpec,
  GIFT_BOX: fefco0215TuckJson as unknown as BoxTopologySpec,
};

interface PackagingViewportProps {
  lang: Language;
  contract: PackagingContract;
  layers: CadLayerVisibility;
  onToggleLayer: (layer: CadLayerId) => void;
  activeSubstrate: SubstratePresetId;
  onSelectSubstrate: (preset: SubstratePresetId) => void;
  customPbrPack: AgentAnPbrTexturePack;
  onUpdateCustomPbrPack: (patch: Partial<AgentAnPbrTexturePack>) => void;
  isLeftDockCollapsed?: boolean;
  onToggleLeftDock?: () => void;
  isRightDockCollapsed?: boolean;
  onToggleRightDock?: () => void;
  onToggleFullFocusMode?: () => void;
}

type ViewMode = '2D_FLAT' | '3D_FOLDED';
type OpenDropdown = 'LAYERS' | 'CAMERA' | 'SUBSTRATE' | null;

export const PackagingViewport: React.FC<PackagingViewportProps> = ({
  lang,
  contract,
  layers,
  onToggleLayer,
  activeSubstrate,
  onSelectSubstrate,
  customPbrPack,
  onUpdateCustomPbrPack,
  isLeftDockCollapsed = false,
  onToggleLeftDock,
  isRightDockCollapsed = false,
  onToggleRightDock,
  onToggleFullFocusMode,
}) => {
  const fullT = getTranslation(lang);
  const t = fullT.col2;

  const [viewMode, setViewMode] = useState<ViewMode>('2D_FLAT');
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [showPbrDrawer, setShowPbrDrawer] = useState<boolean>(false);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursorMm, setCursorMm] = useState<{ x: number; y: number }>({ x: 485.0, y: 365.0 });

  // 3D WebGL Kinematic Folding, Camera Orbit & WebM Recorder State
  const [cameraAzimuthDeg, setCameraAzimuthDeg] = useState<number>(38);
  const [cameraPolarDeg, setCameraPolarDeg] = useState<number>(58);
  const [foldPercent, setFoldPercent] = useState<number>(100);
  const [choreographyStatus, setChoreographyStatus] =
    useState<ChoreographyStatus>('SEQUENCE_IDLE');
  const [choreographyPhase, setChoreographyPhase] =
    useState<ChoreographyPhaseId>('IDLE');
  const [replayTriggerCount, setReplayTriggerCount] = useState<number>(0);
  const [recordRequestCount, setRecordRequestCount] = useState<number>(0);
  const [isRecordingWebm, setIsRecordingWebm] = useState<boolean>(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState<number>(0);
  const [lastRecordedFileName, setLastRecordedFileName] = useState<string | null>(
    null
  );
  const [xrayMode, setXrayMode] = useState<boolean>(false);
  const [activeCameraPreset, setActiveCameraPreset] =
    useState<CameraPresetId>('ISO_FRONT');
  const [fitToScreenTriggerCount, setFitToScreenTriggerCount] =
    useState<number>(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { length_mm: L, width_mm: W, height_mm: H, bleed_mm: B } = contract.product.dimensions;
  const artworkType = contract.product.artworkType;
  const activeTopologyConfig: BoxTopologySpec =
    TOPOLOGY_BY_ARTWORK_TYPE[artworkType] ?? TOPOLOGY_BY_ARTWORK_TYPE.CARTON_BOX;

  // Enforce authentic SCB-6119 Gift Box vs Carton Box texture & glossy duplex PBR bindings on mode switch
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    if (artworkType === 'GIFT_BOX') {
      const giftMat = packaging3dMaterials.materials.giftBox;
      if (customPbrPack.albedoMap !== giftMat.publicUrl || customPbrPack.roughness !== giftMat.roughness) {
        onSelectSubstrate('AGENT_AN_CUSTOM_PBR');
        onUpdateCustomPbrPack({
          packName: 'SCB-6119_GIFTBOX_ALBEDO_4K',
          albedoMap: giftMat.publicUrl,
          roughness: giftMat.roughness,
          metalness: 0.04,
          gsm: 350,
        });
      }
    } else if (artworkType === 'CARTON_BOX') {
      const cartonMat = packaging3dMaterials.materials.carton;
      if (customPbrPack.albedoMap !== cartonMat.publicUrl || customPbrPack.roughness !== cartonMat.roughness) {
        onSelectSubstrate('AGENT_AN_CUSTOM_PBR');
        onUpdateCustomPbrPack({
          packName: 'SCB-6119_CARTON_ALBEDO_4K',
          albedoMap: cartonMat.publicUrl,
          roughness: cartonMat.roughness,
          metalness: cartonMat.metalness,
          gsm: 610,
        });
      }
    }
  }, [artworkType]);

  // Resolve Effective Material Physics from studioConfig.ts
  const baseSubstrateSpec = SUBSTRATE_MATERIAL_CONFIG[activeSubstrate];
  const effectiveRoughness =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.roughness
      : baseSubstrateSpec.roughness;
  const effectiveMetalness =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.metalness
      : baseSubstrateSpec.metalness;
  const effectiveGsm =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR' ? customPbrPack.gsm : baseSubstrateSpec.gsm;

  const totalOverflows = countContractOverflows(contract);

  // Extract key specs
  const getSpec = (id: string, fallback: string) =>
    contract.technicalSpecs.find((s) => s.id === id)?.value || fallback;

  const voltageVal = getSpec('voltage', '220-240V ~ 50Hz');
  const powerVal = getSpec('power', '200 W');
  const capacityVal = getSpec('capacity', '1.0 L');
  const barcodeVal = getSpec('barcode', '8936040464170');
  const eanBits = encodeEan13Bits(barcodeVal);
  const eanInfo = evaluateEan13(barcodeVal);

  // Calibrated 2D Flat Sheet Geometry (SCB-6119 Gift Box vs Carton Box vs Parametric Fallback)
  const flatCal = computeFlatSheetCalibration(contract);
  const totalFlatWidthMm = flatCal.flatWidthMm;
  const totalFlatHeightMm = flatCal.flatHeightMm;

  const isScbGiftBox = flatCal.mode === 'SCB6119_GIFT_BOX';
  const isScbCartonBox = flatCal.mode === 'SCB6119_CARTON_BOX';

  const glueFlap = flatCal.glueFlapWidthMm;
  const topSpanMm = flatCal.topFlapDepthMm;
  const botSpanMm = flatCal.bottomFlapDepthMm;
  const dustFlapH = Math.round(W * 0.55);
  const topTuckH = Math.round(W * 0.85);
  const tuckTongueH = Math.round(W * 0.2);
  const bottomFlapH = Math.round(W * 0.65);

  const [pw1, pw2, pw3, pw4] = flatCal.panelWidthsMm;
  const bodySpanWidthMm = pw1 + pw2 + pw3 + pw4;
  const physicalCutWidthMm = bodySpanWidthMm + glueFlap;
  const physicalCutHeightMm = topSpanMm + H + botSpanMm;

  const padX = isScbCartonBox ? 160 : 120;
  const padTop = isScbCartonBox ? 145 : 125;
  const padBot = isScbCartonBox ? 155 : 130;

  const svgW = physicalCutWidthMm + B * 2 + padX * 2;
  const svgH = physicalCutHeightMm + B * 2 + padTop + padBot;

  const leftCutX = padX + B;
  const xGlue = flatCal.glueSide === 'LEFT' ? leftCutX : leftCutX + bodySpanWidthMm;
  const xPanel1 = flatCal.glueSide === 'LEFT' ? leftCutX + glueFlap : leftCutX;
  const xPanel2 = xPanel1 + pw1;
  const xPanel3 = xPanel2 + pw2;
  const xPanel4 = xPanel3 + pw3;
  const xRightEdge = xPanel4 + pw4;
  const xOuterRightCut = flatCal.glueSide === 'RIGHT' ? xRightEdge + glueFlap : xRightEdge;

  const yTopCut = padTop + B;
  const originY = yTopCut + topSpanMm;
  const yBodyBot = originY + H;
  const yBotCut = yBodyBot + botSpanMm;

  const activeLayerCount = Object.values(layers).filter(Boolean).length;

  const handleApplyCameraPreset = (presetItem: CameraPresetConfigItem) => {
    setActiveCameraPreset(presetItem.id);
    setViewMode('3D_FOLDED');
    setOpenDropdown(null);

    if (presetItem.toggleWireframe) {
      setXrayMode((prev) => !prev);
      return;
    }

    setChoreographyStatus('SEQUENCE_IDLE');
    setChoreographyPhase('IDLE');
    setCameraAzimuthDeg(presetItem.azimuthDeg);
    setCameraPolarDeg(presetItem.polarDeg);
    setXrayMode(false);

    if (typeof presetItem.targetFoldPercent === 'number') {
      setFoldPercent(presetItem.targetFoldPercent);
    }
  };

  const handleSelectSubstrateOption = (presetId: SubstratePresetId) => {
    onSelectSubstrate(presetId);
    setOpenDropdown(null);
    if (presetId === 'AGENT_AN_CUSTOM_PBR') {
      setShowPbrDrawer(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode !== '2D_FLAT') return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      setCursorMm({
        x: Math.max(0, Math.round(normX * totalFlatWidthMm * 10) / 10),
        y: Math.max(0, Math.round(normY * totalFlatHeightMm * 10) / 10),
      });
    }

    if (!isDragging || viewMode !== '2D_FLAT') return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleResetView = () => {
    setPan({ x: 0, y: 0 });
    setChoreographyStatus('SEQUENCE_IDLE');
    setChoreographyPhase('IDLE');
    setXrayMode(false);
    if (foldPercent < 15) {
      setCameraAzimuthDeg(0);
      setCameraPolarDeg(76);
    } else {
      setCameraAzimuthDeg(38);
      setCameraPolarDeg(58);
    }
    setFitToScreenTriggerCount((c) => c + 1);
  };

  const handleManualFoldPercentChange = (percent: number) => {
    setViewMode('3D_FOLDED');
    if (!isRecordingWebm && choreographyStatus === 'CHOREOGRAPHY_ACTIVE') {
      setChoreographyStatus('SEQUENCE_IDLE');
      setChoreographyPhase('IDLE');
    }
    setFoldPercent(percent);
  };

  const handleToggleChoreography = () => {
    setViewMode('3D_FOLDED');
    setChoreographyStatus((prev) =>
      prev === 'CHOREOGRAPHY_ACTIVE' ? 'SEQUENCE_IDLE' : 'CHOREOGRAPHY_ACTIVE'
    );
  };

  const handleReplayChoreography = () => {
    setViewMode('3D_FOLDED');
    setReplayTriggerCount((c) => c + 1);
  };

  const handleToggleRecordWebm = () => {
    setViewMode('3D_FOLDED');
    setRecordRequestCount((c) => c + 1);
  };

  const renderSvgBarcode = (bx: number, by: number, bw: number, bh: number) => {
    const moduleW = bw / 95;
    return (
      <g transform={`translate(${bx}, ${by})`}>
        <rect
          x={-6}
          y={-6}
          width={bw + 12}
          height={bh + 22}
          fill="#05050A"
          stroke={eanInfo.isChecksumMatch ? '#1F1F2E' : '#EF4444'}
          strokeWidth={1.5}
        />
        {eanBits.split('').map((bit, i) => {
          if (bit !== '1') return null;
          const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
          return (
            <rect
              key={i}
              x={i * moduleW}
              y={0}
              width={moduleW * 1.05}
              height={isGuard ? bh + 6 : bh}
              fill="#FFFFFF"
            />
          );
        })}
        <text
          x={bw / 2}
          y={bh + 13}
          textAnchor="middle"
          fill={eanInfo.isChecksumMatch ? '#00E5FF' : '#EF4444'}
          fontSize="11"
          fontFamily="JetBrains Mono, monospace"
          letterSpacing="2"
        >
          {barcodeVal}
        </text>
      </g>
    );
  };

  const isFullFocusActive = isLeftDockCollapsed && isRightDockCollapsed;

  return (
    <main className="flex-1 h-full bg-[#09090b] flex flex-col min-w-0 select-none relative overflow-hidden">
      {/* ====================================================================
          TOP VIEWPORT TOOLBAR (Dock Collapse Controls, 2D/3D Toggle, Fit & Focus)
          ==================================================================== */}
      <div
        ref={toolbarRef}
        className="min-h-10 py-1 px-2.5 border-b border-[#27272a] bg-[#09090b] flex flex-wrap items-center justify-between gap-1.5 shrink-0 z-30 relative"
      >
        {/* Left: Left Dock Collapse Toggle, Viewport Title & View Mode Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleLeftDock && (
            <button
              type="button"
              onClick={onToggleLeftDock}
              title="Toggle Left Parameter Dock (Col 01)"
              className="h-7 px-2 border border-[#27272a] hover:border-[#3f3f46] bg-[#18181b] hover:bg-[#27272a] font-mono text-[10px] font-medium text-[#a1a1aa] hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
            >
              {isLeftDockCollapsed ? (
                <>
                  <ChevronRight size={13} strokeWidth={1.5} />
                  <span>{t.expandLeftBtn}</span>
                </>
              ) : (
                <>
                  <ChevronLeft size={13} strokeWidth={1.5} />
                  <span>{t.collapseLeftBtn}</span>
                </>
              )}
            </button>
          )}

          <div className="hidden 2xl:flex items-center gap-1.5 mr-1">
            <Crosshair size={15} strokeWidth={1.5} className="text-[#71717a]" />
            <span className="font-mono text-xs font-semibold tracking-wider text-zinc-200 whitespace-nowrap">
              {t.header}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode('2D_FLAT')}
              className={`h-7 px-2.5 border font-mono text-[11px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === '2D_FLAT'
                  ? 'bg-[#18181b] text-white border-[#3f3f46]'
                  : 'bg-[#09090b] text-[#71717a] border-[#27272a] hover:text-zinc-200 hover:bg-[#18181b]'
              }`}
            >
              <FileCode2 size={14} strokeWidth={1.5} />
              <span>{t.flat2dBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3D_FOLDED')}
              className={`h-7 px-3 font-mono text-[11px] font-bold flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap cursor-pointer bg-[#5322ff] text-white shadow-[0_0_16px_rgba(83,34,255,0.45)] hover:brightness-110 ${
                viewMode === '3D_FOLDED' ? 'ring-1 ring-white/30' : 'opacity-95'
              }`}
            >
              <Box size={14} strokeWidth={1.75} />
              <span>{t.folded3dBtn}</span>
            </button>
          </div>
        </div>

        {/* Center: Config-Driven Dropdown Menus (Neutralized Slate Chrome) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1. [ ▾ CAD_LAYERS (5) ] DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown((prev) => (prev === 'LAYERS' ? null : 'LAYERS'))
              }
              className={`h-7 px-2.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                openDropdown === 'LAYERS'
                  ? 'bg-[#27272a] text-white border-[#3f3f46] font-semibold'
                  : 'bg-[#18181b] text-zinc-300 border-[#27272a] hover:border-[#3f3f46] hover:text-white'
              }`}
            >
              <Layers size={14} strokeWidth={1.5} className="text-[#71717a]" />
              <span>
                [ ▾ {t.cadLayersMenu} ({activeLayerCount}) ]
              </span>
            </button>

            {openDropdown === 'LAYERS' && (
              <div className="absolute left-0 top-8 w-64 max-w-[85vw] bg-[#09090b] border border-[#27272a] shadow-2xl z-50 divide-y divide-[#27272a]">
                {CAD_LAYER_CONFIG.map((item) => {
                  const checked = layers[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onToggleLayer(item.id)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left font-mono text-xs hover:bg-[#18181b] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3.5 h-3.5 border flex items-center justify-center ${
                            checked
                              ? 'border-zinc-400 bg-zinc-800 text-white'
                              : 'border-[#27272a] bg-[#09090b]'
                          }`}
                        >
                          {checked && <Check size={11} strokeWidth={1.75} />}
                        </span>
                        <span className={checked ? 'text-zinc-100' : 'text-[#71717a]'}>
                          {item.label[lang]}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: item.strokeColor }}
                      >
                        {item.id === 'bleed' ? `+${B.toFixed(1)}MM` : item.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. [ ▾ CAMERA_PRESETS ] DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown((prev) => (prev === 'CAMERA' ? null : 'CAMERA'))
              }
              className={`h-7 px-2.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                openDropdown === 'CAMERA'
                  ? 'bg-[#27272a] text-white border-[#3f3f46] font-semibold'
                  : 'bg-[#18181b] text-zinc-300 border-[#27272a] hover:border-[#3f3f46] hover:text-white'
              }`}
            >
              <Camera size={14} strokeWidth={1.5} className="text-[#71717a]" />
              <span>[ ▾ {t.cameraPresetsMenu} ]</span>
            </button>

            {openDropdown === 'CAMERA' && (
              <div className="absolute right-0 origin-top-right top-8 w-64 max-w-[85vw] bg-[#09090b] border border-[#27272a] shadow-2xl z-50 divide-y divide-[#27272a]">
                {CAMERA_PRESET_CONFIG.map((camItem) => {
                  const isCurrent =
                    (camItem.id === 'WIREFRAME_XRAY' && xrayMode) ||
                    (!camItem.toggleWireframe &&
                      activeCameraPreset === camItem.id);

                  return (
                    <button
                      key={camItem.id}
                      type="button"
                      onClick={() => handleApplyCameraPreset(camItem)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left font-mono text-xs hover:bg-[#18181b] transition-colors cursor-pointer"
                    >
                      <span className={isCurrent ? 'text-white font-semibold' : 'text-zinc-300'}>
                        {camItem.label[lang]}
                      </span>
                      {isCurrent && (
                        <Check size={14} strokeWidth={1.5} className="text-zinc-200" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. [ ▾ SUBSTRATE_&_FINISH ] MATERIAL DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown((prev) => (prev === 'SUBSTRATE' ? null : 'SUBSTRATE'))
              }
              className={`h-7 px-2.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                openDropdown === 'SUBSTRATE'
                  ? 'bg-[#27272a] text-white border-[#3f3f46] font-semibold'
                  : 'bg-[#18181b] text-zinc-300 border-[#27272a] hover:border-[#3f3f46] hover:text-white'
              }`}
            >
              <Palette size={14} strokeWidth={1.5} className="text-[#71717a]" />
              <span>[ ▾ {t.substrateMenu} ]</span>
            </button>

            {openDropdown === 'SUBSTRATE' && (
              <div className="absolute right-0 origin-top-right top-8 w-80 sm:w-96 max-w-[85vw] bg-[#09090b] border border-[#27272a] shadow-2xl z-50 divide-y divide-[#27272a]">
                <div className="px-3 py-1.5 bg-[#18181b] font-mono text-[10px] text-[#71717a] flex items-center justify-between">
                  <span>HYBRID 3D PACKAGING MATERIAL ARCHITECTURE</span>
                  <span className="text-zinc-400">PBR_SHADER</span>
                </div>

                {(Object.keys(SUBSTRATE_MATERIAL_CONFIG) as SubstratePresetId[]).map(
                  (presetKey) => {
                    const spec = SUBSTRATE_MATERIAL_CONFIG[presetKey];
                    const isSelected = activeSubstrate === presetKey;

                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectSubstrateOption(presetKey)}
                        className={`w-full px-3 py-2.5 text-left font-mono transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#18181b] text-white'
                            : 'hover:bg-[#18181b] text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{spec.label[lang]}</span>
                          {isSelected && (
                            <Check
                              size={14}
                              strokeWidth={1.5}
                              className="text-zinc-200 shrink-0"
                            />
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-[#71717a] tabular-nums">
                          <span>
                            ROUGH: {spec.roughness.toFixed(2)} | METAL: {spec.metalness.toFixed(2)}
                          </span>
                          <span>{spec.gsm} GSM</span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {activeSubstrate === 'AGENT_AN_CUSTOM_PBR' && (
            <button
              type="button"
              onClick={() => setShowPbrDrawer((v) => !v)}
              className={`h-7 px-2 border font-mono text-[10px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                showPbrDrawer
                  ? 'bg-[#27272a] border-[#3f3f46] text-white'
                  : 'bg-[#18181b] border-[#27272a] text-zinc-300 hover:border-[#3f3f46] hover:text-white'
              }`}
            >
              <Sparkles size={13} strokeWidth={1.5} className="text-[#71717a]" />
              <span>{t.pbrBindingsBtn}</span>
            </button>
          )}
        </div>

        {/* Right: Zoom, [ ⛶ FIT TO SCREEN ], Full Canvas Focus Mode & Right Dock Collapse */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.15).toFixed(2))))}
            title="Zoom Out"
            className="h-7 w-7 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#71717a] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomOut size={14} strokeWidth={1.5} />
          </button>
          <span className="h-7 px-2 bg-[#18181b] border border-[#27272a] font-mono text-[11px] text-zinc-200 tabular-nums flex items-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.4, Number((z + 0.15).toFixed(2))))}
            title="Zoom In"
            className="h-7 w-7 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#71717a] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomIn size={14} strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            title="Fit Entire Dieline (0%) or 3D Carton (100%) to Viewport"
            className="h-7 px-2.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3f3f46] text-zinc-200 hover:text-white font-mono text-[10px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Maximize2 size={12} strokeWidth={1.5} className="text-[#71717a]" />
            <span>{t.fitBtn}</span>
          </button>

          {onToggleFullFocusMode && (
            <button
              type="button"
              onClick={onToggleFullFocusMode}
              title="Toggle 100% Full Canvas Focus Mode"
              className={`h-7 px-2 border font-mono text-[10px] font-medium hidden xl:flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                isFullFocusActive
                  ? 'bg-[#27272a] text-white border-[#3f3f46]'
                  : 'bg-[#18181b] text-zinc-300 border-[#27272a] hover:border-[#3f3f46] hover:text-white'
              }`}
            >
              {isFullFocusActive ? (
                <>
                  <Minimize2 size={12} strokeWidth={1.5} />
                  <span>{t.exitFocusModeBtn}</span>
                </>
              ) : (
                <>
                  <Maximize2 size={12} strokeWidth={1.5} />
                  <span>{t.focusModeBtn}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sub-Status Strip: Active Material Physics, Overflow Gatekeeper Status & Live XY */}
      <div className="h-7 px-3.5 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between gap-2 shrink-0 z-10 font-mono text-[10px] text-[#71717a] tabular-nums">
        <div className="flex items-center gap-3 truncate">
          <span className="text-zinc-300 font-semibold">
            MAT::{baseSubstrateSpec.shortCode}
          </span>
          <span>
            R:{effectiveRoughness.toFixed(2)} | M:{effectiveMetalness.toFixed(2)} | {effectiveGsm}GSM
          </span>
          {totalOverflows > 0 && (
            <span className="text-[#EF4444] font-bold">
              {fullT.overflowBadge} ({totalOverflows})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <span>
            {t.sheetLabel}: <strong className="text-zinc-200">{totalFlatWidthMm.toFixed(0)}</strong> ×{' '}
            <strong className="text-zinc-200">{totalFlatHeightMm.toFixed(0)}</strong> MM
          </span>
          <span className="text-[#27272a]">|</span>
          <span>
            XY: <strong className="text-zinc-300">{cursorMm.x.toFixed(1)}</strong>,{' '}
            <strong className="text-zinc-300">{cursorMm.y.toFixed(1)}</strong> MM
          </span>
        </div>
      </div>

      {/* ====================================================================
          AGENT AN EXTERNAL PBR ASSET PACK HOOK DRAWER (Modular Texture Slot)
          ==================================================================== */}
      {showPbrDrawer && (
        <div className="absolute top-20 right-4 w-96 bg-[#09090b] border border-[#27272a] shadow-2xl z-40 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-100">
              <Sliders size={15} strokeWidth={1.5} className="text-[#71717a]" />
              <span>[ ⚡ AGENT_AN // PBR_MATERIAL_HOOK ]</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPbrDrawer(false)}
              className="text-[#71717a] hover:text-white cursor-pointer"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] text-[#71717a]">
              AGENT AN PROCEDURAL PBR ASSET PACKS:
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {AGENT_AN_PROCEDURAL_PBR_PACKS.map((pack) => (
                <button
                  key={pack.packName}
                  type="button"
                  onClick={() => {
                    onSelectSubstrate('AGENT_AN_CUSTOM_PBR');
                    onUpdateCustomPbrPack(pack);
                  }}
                  className={`px-2.5 py-1.5 border text-left font-mono text-[10px] flex items-center justify-between transition-colors cursor-pointer ${
                    customPbrPack.packName === pack.packName
                      ? 'bg-[#27272a] border-[#52525b] text-white'
                      : 'bg-[#18181b] border-[#27272a] text-zinc-300 hover:border-[#3f3f46]'
                  }`}
                >
                  <span className="truncate">{pack.packName}</span>
                  <span className="text-[#71717a] shrink-0 ml-2">
                    R:{pack.roughness} M:{pack.metalness}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-[#27272a]">
            <div className="font-mono text-[10px] text-zinc-300">
              DYNAMIC TEXTURE MAP SLOTS (URL / DATA_URI):
            </div>
            {(
              [
                { key: 'albedoMap', label: 'albedoMap (Base Color / Pattern)' },
                { key: 'normalMap', label: 'normalMap (Corrugated / Micro-Bump)' },
                { key: 'roughnessMap', label: 'roughnessMap (Spot UV / Foil Mask)' },
              ] as const
            ).map((slot) => (
              <div key={slot.key}>
                <label className="block font-mono text-[9px] text-[#71717a] mb-0.5">
                  {slot.label}
                </label>
                <input
                  type="text"
                  value={customPbrPack[slot.key] || ''}
                  onChange={(e) =>
                    onUpdateCustomPbrPack({ [slot.key]: e.target.value || null })
                  }
                  placeholder="https://... or data:image/svg+xml..."
                  className="w-full h-6 px-2 bg-[#18181b] border border-[#27272a] focus:border-[#52525b] focus:outline-none font-mono text-[10px] text-zinc-100"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-[#27272a] font-mono text-[10px]">
            <div>
              <div className="flex justify-between text-[#71717a] mb-1">
                <span>ROUGHNESS</span>
                <span className="text-zinc-200">{customPbrPack.roughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={customPbrPack.roughness}
                onChange={(e) =>
                  onUpdateCustomPbrPack({ roughness: parseFloat(e.target.value) })
                }
                className="w-full accent-[#5322ff]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[#71717a] mb-1">
                <span>METALNESS</span>
                <span className="text-zinc-200">{customPbrPack.metalness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={customPbrPack.metalness}
                onChange={(e) =>
                  onUpdateCustomPbrPack({ metalness: parseFloat(e.target.value) })
                }
                className="w-full accent-[#5322ff]"
              />
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          INTERACTIVE CAD VIEWPORT SURFACE (2D FLAT DIECUT vs 3D FOLDED)
          ==================================================================== */}
      <div
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'linear-gradient(to right, #111320 1px, transparent 1px), linear-gradient(to bottom, #111320 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      >
        {viewMode === '2D_FLAT' ? (
          /* ============================================================
             2D FLAT DIECUT CAD SHEET RENDERER
             ============================================================ */
          <div
            className="w-full h-full flex items-center justify-center p-6 transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-full max-w-full max-h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <pattern
                  id="glueHatch"
                  width="12"
                  height="12"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#1F1F2E" strokeWidth="3" />
                </pattern>
                <pattern id="efluteBump" width="8" height="8" patternUnits="userSpaceOnUse">
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="#FFFFFF"
                    strokeOpacity="0.035"
                    strokeWidth="2"
                  />
                </pattern>
                <pattern id="kraftFiber" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path
                    d="M0 6 L24 12 M4 0 L16 24 M0 18 L24 4"
                    stroke="#D97706"
                    strokeOpacity="0.09"
                    strokeWidth="1.2"
                  />
                </pattern>
                <linearGradient id="glossIvorySheen" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.03" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.09" />
                  <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="metallicFoilSheen" x1="0%" y1="0%" x2="100%" y2="80%">
                  <stop offset="0%" stopColor="#5322FF" stopOpacity="0.16" />
                  <stop offset="45%" stopColor="#00E5FF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#5322FF" stopOpacity="0.12" />
                </linearGradient>
                <marker
                  id="dimArrowStart"
                  viewBox="0 0 10 10"
                  refX="5"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 5 L 10 0 L 10 10 z" fill="#00E5FF" />
                </marker>
                <marker
                  id="dimArrowEnd"
                  viewBox="0 0 10 10"
                  refX="5"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#00E5FF" />
                </marker>
              </defs>

              {/* PRE-PRESS REGISTRATION MARKS, CMYK BARS & STRUCTURE TELEMETRY */}
              {(() => {
                const uiScale = isScbCartonBox ? 1.65 : 1.0;
                const fsSmall = Math.round(11 * uiScale);
                const fsMed = Math.round(13 * uiScale);
                const fsLarge = Math.round(15 * uiScale);
                const strokeCut = 2.0 * uiScale;
                const strokeCrease = 1.8 * uiScale;
                const strokeDim = 1.6 * uiScale;
                const slotHalf = 2.5; // 5.0 mm FEFCO 0201 RSC flap slot gap

                return (
                  <>
                    <g>
                      {[
                        { label: 'C', color: '#00E5FF' },
                        { label: 'M', color: '#EC4899' },
                        { label: 'Y', color: '#EAB308' },
                        { label: 'K', color: '#374151' },
                        { label: 'PMS286', color: '#004098' },
                        { label: 'CUT', color: '#EF4444' },
                        { label: 'FOLD', color: '#00E5FF' },
                      ].map((swatch, idx) => (
                        <g
                          key={swatch.label}
                          transform={`translate(${padX + idx * Math.round(58 * uiScale)}, ${Math.round(22 * uiScale)})`}
                        >
                          <rect
                            x={0}
                            y={0}
                            width={Math.round(18 * uiScale)}
                            height={Math.round(12 * uiScale)}
                            fill={swatch.color}
                            stroke="#1F1F2E"
                            strokeWidth={1}
                          />
                          <text
                            x={Math.round(23 * uiScale)}
                            y={Math.round(10 * uiScale)}
                            fill="#8A8FA3"
                            fontSize={fsSmall}
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {swatch.label}
                          </text>
                        </g>
                      ))}

                      <text
                        x={svgW - padX}
                        y={Math.round(32 * uiScale)}
                        textAnchor="end"
                        fill="#00E5FF"
                        fontSize={fsSmall}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {contract.product.model} // {flatCal.structureCode} // SHEET: {totalFlatWidthMm} × {totalFlatHeightMm} MM
                      </text>

                      {[
                        { cx: Math.round(42 * uiScale), cy: Math.round(42 * uiScale) },
                        { cx: svgW - Math.round(42 * uiScale), cy: Math.round(42 * uiScale) },
                        { cx: Math.round(42 * uiScale), cy: svgH - Math.round(42 * uiScale) },
                        { cx: svgW - Math.round(42 * uiScale), cy: svgH - Math.round(42 * uiScale) },
                      ].map((pt, idx) => (
                        <g key={idx} transform={`translate(${pt.cx}, ${pt.cy})`}>
                          <circle
                            cx={0}
                            cy={0}
                            r={13 * uiScale}
                            fill="none"
                            stroke="#00E5FF"
                            strokeWidth={1.2 * uiScale}
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={5.5 * uiScale}
                            fill="none"
                            stroke="#EF4444"
                            strokeWidth={1.2 * uiScale}
                          />
                          <line
                            x1={-20 * uiScale}
                            y1={0}
                            x2={20 * uiScale}
                            y2={0}
                            stroke="#00E5FF"
                            strokeWidth={1 * uiScale}
                          />
                          <line
                            x1={0}
                            y1={-20 * uiScale}
                            x2={0}
                            y2={20 * uiScale}
                            stroke="#00E5FF"
                            strokeWidth={1 * uiScale}
                          />
                        </g>
                      ))}
                    </g>

                    {isScbGiftBox ? (
                      /* ==========================================================
                         MODE A: AUTHENTIC SCB-6119 GIFT BOX (HANDLE + 1-2-3 SNAP)
                         4 Body Panels: 230 x 330 mm | Sheet ~935 x 540 mm
                         ========================================================== */
                      <>
                        {/* 1. SUBSTRATE BASE & CROPPED AUTHENTIC GIFT BOX ARTWORK */}
                        <g>
                          <rect
                            x={xPanel1 - B}
                            y={yTopCut - B}
                            width={physicalCutWidthMm + B * 2}
                            height={physicalCutHeightMm + B * 2}
                            fill={flatCal.substrateFillHex}
                          />
                          {layers.artwork && flatCal.flatArtworkUrl && flatCal.artworkRectMm && (
                            <image
                              href={flatCal.flatArtworkUrl}
                              x={xPanel1 + flatCal.artworkRectMm.x}
                              y={originY + flatCal.artworkRectMm.y}
                              width={flatCal.artworkRectMm.width}
                              height={flatCal.artworkRectMm.height}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          )}
                        </g>

                        {/* 2. BLEED PERIMETER (+3.0MM) */}
                        {layers.bleed && B > 0 && (
                          <g>
                            <rect
                              x={xPanel1 - B}
                              y={yTopCut - B}
                              width={physicalCutWidthMm + B * 2}
                              height={physicalCutHeightMm + B * 2}
                              fill="none"
                              stroke="#6B7280"
                              strokeWidth={1.8}
                              strokeDasharray="6 5"
                            />
                            <text
                              x={xPanel1 - B + 4}
                              y={yBotCut + B + 18}
                              fill="#8A8FA3"
                              fontSize={fsSmall}
                              fontFamily="JetBrains Mono, monospace"
                            >
                              BLEED // +{B.toFixed(1)}MM
                            </text>
                          </g>
                        )}

                        {/* 3. CREASE / FOLD LINES (Lossless SCB-6119 Gift Box Vector Creases) */}
                        {layers.crease && (
                          <g>
                            <g
                              transform={`translate(${xPanel1}, ${originY})`}
                              stroke="#00E5FF"
                              strokeWidth={strokeCrease}
                              fill="none"
                            >
                              <path d={SCB6119_GIFTBOX_CREASE_PATH_MM} />
                            </g>
                            <g
                              stroke="#00E5FF"
                              strokeWidth={1.3}
                              strokeDasharray="8 6"
                              strokeOpacity={0.75}
                              fill="none"
                            >
                              <line x1={xPanel1} y1={originY} x2={xRightEdge} y2={originY} />
                              <line x1={xPanel1} y1={yBodyBot} x2={xRightEdge} y2={yBodyBot} />
                              <line x1={xPanel2} y1={originY} x2={xPanel2} y2={yBodyBot} />
                              <line x1={xPanel3} y1={originY} x2={xPanel3} y2={yBodyBot} />
                              <line x1={xPanel4} y1={originY} x2={xPanel4} y2={yBodyBot} />
                              <line x1={xRightEdge} y1={originY} x2={xRightEdge} y2={yBodyBot} />
                            </g>
                          </g>
                        )}

                        {/* 4. DIECUT CUTTING LINES (Lossless SCB-6119 Handle & 1-2-3 Snap Cut Paths) */}
                        {layers.diecut && (
                          <g
                            transform={`translate(${xPanel1}, ${originY})`}
                            stroke="#EF4444"
                            strokeWidth={strokeCut}
                            fill="none"
                          >
                            <path d={SCB6119_GIFTBOX_CUT_PATH_MM} />
                          </g>
                        )}

                        {/* 5. CALIBRATED MILLIMETER DIMENSION CALLOUTS */}
                        {layers.dimensions && (
                          <g fontFamily="JetBrains Mono, monospace" fontSize={fsMed} fill="#00E5FF">
                            {[
                              { x0: xPanel1, x1: xPanel2, label: `${pw1} MM` },
                              { x0: xPanel2, x1: xPanel3, label: `${pw2} MM` },
                              { x0: xPanel3, x1: xPanel4, label: `${pw3} MM` },
                              { x0: xPanel4, x1: xRightEdge, label: `${pw4} MM` },
                            ].map((seg, i) => (
                              <g key={i}>
                                <line
                                  x1={seg.x0}
                                  y1={yTopCut - 26}
                                  x2={seg.x0}
                                  y2={yTopCut - 10}
                                  stroke="#00E5FF"
                                  strokeOpacity={0.5}
                                  strokeWidth={1}
                                />
                                <line
                                  x1={seg.x0 + 5}
                                  y1={yTopCut - 18}
                                  x2={seg.x1 - 5}
                                  y2={yTopCut - 18}
                                  stroke="#00E5FF"
                                  strokeWidth={strokeDim}
                                  markerStart="url(#dimArrowStart)"
                                  markerEnd="url(#dimArrowEnd)"
                                />
                                <text
                                  x={(seg.x0 + seg.x1) / 2}
                                  y={yTopCut - 26}
                                  textAnchor="middle"
                                  fontWeight="600"
                                >
                                  {seg.label}
                                </text>
                              </g>
                            ))}

                            <text
                              x={(xRightEdge + xOuterRightCut) / 2 + 12}
                              y={originY - 10}
                              textAnchor="middle"
                              fontSize={fsSmall}
                              fill="#10B981"
                            >
                              +GLUE
                            </text>

                            {/* Left Body Height Callout (330 MM) */}
                            <line
                              x1={xPanel1 - 38}
                              y1={originY}
                              x2={xPanel1 - 12}
                              y2={originY}
                              stroke="#00E5FF"
                              strokeOpacity={0.5}
                              strokeWidth={1}
                            />
                            <line
                              x1={xPanel1 - 38}
                              y1={yBodyBot}
                              x2={xPanel1 - 12}
                              y2={yBodyBot}
                              stroke="#00E5FF"
                              strokeOpacity={0.5}
                              strokeWidth={1}
                            />
                            <line
                              x1={xPanel1 - 28}
                              y1={originY + 5}
                              x2={xPanel1 - 28}
                              y2={yBodyBot - 5}
                              stroke="#00E5FF"
                              strokeWidth={strokeDim}
                              markerStart="url(#dimArrowStart)"
                              markerEnd="url(#dimArrowEnd)"
                            />
                            <text
                              x={xPanel1 - 44}
                              y={originY + H / 2}
                              dominantBaseline="middle"
                              transform={`rotate(-90, ${xPanel1 - 44}, ${originY + H / 2})`}
                              textAnchor="middle"
                              fontWeight="700"
                            >
                              BODY H: {H} MM
                            </text>

                            {/* Right Structural Zone Callout */}
                            <line
                              x1={xOuterRightCut + 28}
                              y1={yTopCut + 5}
                              x2={xOuterRightCut + 28}
                              y2={yBotCut - 5}
                              stroke="#00E5FF"
                              strokeWidth={strokeDim}
                              markerStart="url(#dimArrowStart)"
                              markerEnd="url(#dimArrowEnd)"
                            />
                            <text
                              x={xOuterRightCut + 46}
                              y={(yTopCut + yBotCut) / 2}
                              dominantBaseline="middle"
                              transform={`rotate(90, ${xOuterRightCut + 46}, ${(yTopCut + yBotCut) / 2})`}
                              textAnchor="middle"
                              fontSize={fsSmall}
                            >
                              FLAT H: ~{totalFlatHeightMm} MM (HANDLE + 330 BODY + 1-2-3 SNAP)
                            </text>

                            {/* Bottom Overall Flat Sheet Width Callout */}
                            <line
                              x1={xPanel1 + 6}
                              y1={yBotCut + 34}
                              x2={xOuterRightCut - 6}
                              y2={yBotCut + 34}
                              stroke="#00E5FF"
                              strokeWidth={strokeDim}
                              markerStart="url(#dimArrowStart)"
                              markerEnd="url(#dimArrowEnd)"
                            />
                            <text
                              x={(xPanel1 + xOuterRightCut) / 2}
                              y={yBotCut + 56}
                              textAnchor="middle"
                              fontSize={fsLarge}
                              fontWeight="700"
                            >
                              FLAT SHEET WIDTH: ~{totalFlatWidthMm} MM (4 × 230 MM + GLUE FLAP)
                            </text>
                          </g>
                        )}
                      </>
                    ) : isScbCartonBox ? (
                      /* ==========================================================
                         MODE B: AUTHENTIC SCB-6119 MASTER CARTON (FEFCO 0201 RSC)
                         4 Panels: 485 x 365 mm | Flaps: 242.5 mm | Sheet: 1980 x 850 mm
                         ========================================================== */
                      <>
                        {/* 1. 5-LAYER KRAFT SUBSTRATE, GLUE TAB & AUTHENTIC RSC ARTWORK */}
                        <g>
                          {/* Left Tapered 40mm RSC Manufacturer's Joint Glue Tab */}
                          <polygon
                            points={`
                              ${xGlue},${originY + 24}
                              ${xPanel1},${originY}
                              ${xPanel1},${yBodyBot}
                              ${xGlue},${yBodyBot - 24}
                            `}
                            fill={flatCal.substrateFillHex}
                          />
                          <polygon
                            points={`
                              ${xGlue},${originY + 24}
                              ${xPanel1},${originY}
                              ${xPanel1},${yBodyBot}
                              ${xGlue},${yBodyBot - 24}
                            `}
                            fill="url(#glueHatch)"
                            opacity={0.35}
                          />
                          <text
                            x={xGlue + glueFlap / 2}
                            y={originY + H / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(-90, ${xGlue + glueFlap / 2}, ${originY + H / 2})`}
                            fill="#1E3A8A"
                            fontSize={13}
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                            letterSpacing="2"
                          >
                            RSC GLUE TAB ({glueFlap}MM)
                          </text>

                          {/* Bare 5-layer Kraft Backing for 4 Panels + 8 Flaps (visible when artwork layer toggled off) */}
                          <rect
                            x={xPanel1}
                            y={originY}
                            width={bodySpanWidthMm}
                            height={H}
                            fill={flatCal.substrateFillHex}
                          />
                          {[
                            { x0: xPanel1, x1: xPanel2 - slotHalf },
                            { x0: xPanel2 + slotHalf, x1: xPanel3 - slotHalf },
                            { x0: xPanel3 + slotHalf, x1: xPanel4 - slotHalf },
                            { x0: xPanel4 + slotHalf, x1: xRightEdge },
                          ].map((flap, idx) => (
                            <g key={idx}>
                              <rect
                                x={flap.x0}
                                y={yTopCut}
                                width={flap.x1 - flap.x0}
                                height={topSpanMm}
                                fill={flatCal.substrateFillHex}
                              />
                              <rect
                                x={flap.x0}
                                y={yBodyBot}
                                width={flap.x1 - flap.x0}
                                height={botSpanMm}
                                fill={flatCal.substrateFillHex}
                              />
                            </g>
                          ))}

                          {/* Genuine Cropped Carton_box_SCB-6119 Artwork (Shipping Marks + Icons) */}
                          {layers.artwork && flatCal.flatArtworkUrl && flatCal.artworkRectMm && (
                            <image
                              href={flatCal.flatArtworkUrl}
                              x={xPanel1 + flatCal.artworkRectMm.x}
                              y={originY + flatCal.artworkRectMm.y}
                              width={flatCal.artworkRectMm.width}
                              height={flatCal.artworkRectMm.height}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          )}
                        </g>

                        {/* 2. BLEED PERIMETER (+3.0MM) */}
                        {layers.bleed && B > 0 && (
                          <g>
                            <rect
                              x={leftCutX - B}
                              y={yTopCut - B}
                              width={physicalCutWidthMm + B * 2}
                              height={physicalCutHeightMm + B * 2}
                              fill="none"
                              stroke="#6B7280"
                              strokeWidth={2.4}
                              strokeDasharray="8 6"
                            />
                            <text
                              x={leftCutX - B + 6}
                              y={yBotCut + B + 24}
                              fill="#8A8FA3"
                              fontSize={fsSmall}
                              fontFamily="JetBrains Mono, monospace"
                            >
                              BLEED // +{B.toFixed(1)}MM
                            </text>
                          </g>
                        )}

                        {/* 3. FEFCO 0201 RSC CREASE / SCORE LINES */}
                        {layers.crease && (
                          <g
                            stroke="#00E5FF"
                            strokeWidth={strokeCrease}
                            strokeDasharray="14 8"
                            fill="none"
                          >
                            <line x1={xPanel1} y1={originY} x2={xRightEdge} y2={originY} />
                            <line x1={xPanel1} y1={yBodyBot} x2={xRightEdge} y2={yBodyBot} />
                            <line x1={xPanel1} y1={originY} x2={xPanel1} y2={yBodyBot} />
                            <line x1={xPanel2} y1={originY} x2={xPanel2} y2={yBodyBot} />
                            <line x1={xPanel3} y1={originY} x2={xPanel3} y2={yBodyBot} />
                            <line x1={xPanel4} y1={originY} x2={xPanel4} y2={yBodyBot} />
                          </g>
                        )}

                        {/* 4. FEFCO 0201 RSC DIECUT & FLAP SLOTS */}
                        {layers.diecut && (
                          <g stroke="#EF4444" strokeWidth={strokeCut} fill="none">
                            {/* Left Tapered Glue Tab */}
                            <polyline
                              points={`
                                ${xPanel1},${originY}
                                ${xGlue},${originY + 24}
                                ${xGlue},${yBodyBot - 24}
                                ${xPanel1},${yBodyBot}
                              `}
                            />
                            {/* Top 4 Slotted RSC Flaps */}
                            <polyline
                              points={`
                                ${xPanel1},${originY}
                                ${xPanel1},${yTopCut}
                                ${xPanel2 - slotHalf},${yTopCut}
                                ${xPanel2 - slotHalf},${originY}
                                ${xPanel2 + slotHalf},${originY}
                                ${xPanel2 + slotHalf},${yTopCut}
                                ${xPanel3 - slotHalf},${yTopCut}
                                ${xPanel3 - slotHalf},${originY}
                                ${xPanel3 + slotHalf},${originY}
                                ${xPanel3 + slotHalf},${yTopCut}
                                ${xPanel4 - slotHalf},${yTopCut}
                                ${xPanel4 - slotHalf},${originY}
                                ${xPanel4 + slotHalf},${originY}
                                ${xPanel4 + slotHalf},${yTopCut}
                                ${xRightEdge},${yTopCut}
                                ${xRightEdge},${yBotCut}
                              `}
                            />
                            {/* Bottom 4 Slotted RSC Flaps */}
                            <polyline
                              points={`
                                ${xPanel1},${yBodyBot}
                                ${xPanel1},${yBotCut}
                                ${xPanel2 - slotHalf},${yBotCut}
                                ${xPanel2 - slotHalf},${yBodyBot}
                                ${xPanel2 + slotHalf},${yBodyBot}
                                ${xPanel2 + slotHalf},${yBotCut}
                                ${xPanel3 - slotHalf},${yBotCut}
                                ${xPanel3 - slotHalf},${yBodyBot}
                                ${xPanel3 + slotHalf},${yBodyBot}
                                ${xPanel3 + slotHalf},${yBotCut}
                                ${xPanel4 - slotHalf},${yBotCut}
                                ${xPanel4 - slotHalf},${yBodyBot}
                                ${xPanel4 + slotHalf},${yBodyBot}
                                ${xPanel4 + slotHalf},${yBotCut}
                                ${xRightEdge},${yBotCut}
                              `}
                            />
                          </g>
                        )}

                        {/* 5. CALIBRATED RSC MILLIMETER DIMENSION CALLOUTS */}
                        {layers.dimensions && (
                          <g fontFamily="JetBrains Mono, monospace" fontSize={fsMed} fill="#00E5FF">
                            {/* Glue Tab + 4 x 485mm Panel Callouts */}
                            <text
                              x={xGlue + glueFlap / 2}
                              y={originY - 14}
                              textAnchor="middle"
                              fontSize={fsSmall}
                              fill="#10B981"
                            >
                              {glueFlap}MM
                            </text>
                            {[
                              { x0: xPanel1, x1: xPanel2, label: `${pw1} MM` },
                              { x0: xPanel2, x1: xPanel3, label: `${pw2} MM` },
                              { x0: xPanel3, x1: xPanel4, label: `${pw3} MM` },
                              { x0: xPanel4, x1: xRightEdge, label: `${pw4} MM` },
                            ].map((seg, i) => (
                              <g key={i}>
                                <line
                                  x1={seg.x0}
                                  y1={yTopCut - 42}
                                  x2={seg.x0}
                                  y2={yTopCut - 14}
                                  stroke="#00E5FF"
                                  strokeOpacity={0.5}
                                  strokeWidth={1.5}
                                />
                                <line
                                  x1={seg.x0 + 8}
                                  y1={yTopCut - 28}
                                  x2={seg.x1 - 8}
                                  y2={yTopCut - 28}
                                  stroke="#00E5FF"
                                  strokeWidth={strokeDim}
                                  markerStart="url(#dimArrowStart)"
                                  markerEnd="url(#dimArrowEnd)"
                                />
                                <text
                                  x={(seg.x0 + seg.x1) / 2}
                                  y={yTopCut - 40}
                                  textAnchor="middle"
                                  fontWeight="700"
                                >
                                  {seg.label}
                                </text>
                              </g>
                            ))}

                            {/* Left Vertical Body Height (365 MM) & Total Height (850 MM) */}
                            <line
                              x1={leftCutX - 58}
                              y1={yTopCut + 8}
                              x2={leftCutX - 58}
                              y2={yBotCut - 8}
                              stroke="#00E5FF"
                              strokeWidth={strokeDim}
                              markerStart="url(#dimArrowStart)"
                              markerEnd="url(#dimArrowEnd)"
                            />
                            <text
                              x={leftCutX - 82}
                              y={(yTopCut + yBotCut) / 2}
                              dominantBaseline="middle"
                              transform={`rotate(-90, ${leftCutX - 82}, ${(yTopCut + yBotCut) / 2})`}
                              textAnchor="middle"
                              fontSize={fsLarge}
                              fontWeight="700"
                            >
                              TOTAL H: {totalFlatHeightMm} MM
                            </text>

                            {/* Right Vertical Breakdown: 242.5 MM Top Flap / 365 MM Body / 242.5 MM Bottom Flap */}
                            {[
                              { y0: yTopCut, y1: originY, label: `FLAP: ${topSpanMm} MM` },
                              { y0: originY, y1: yBodyBot, label: `BODY: ${H} MM` },
                              { y0: yBodyBot, y1: yBotCut, label: `FLAP: ${botSpanMm} MM` },
                            ].map((vSeg, idx) => (
                              <g key={idx}>
                                <line
                                  x1={xRightEdge + 12}
                                  y1={vSeg.y0}
                                  x2={xRightEdge + 54}
                                  y2={vSeg.y0}
                                  stroke="#00E5FF"
                                  strokeOpacity={0.45}
                                  strokeWidth={1.4}
                                />
                                <line
                                  x1={xRightEdge + 42}
                                  y1={vSeg.y0 + 7}
                                  x2={xRightEdge + 42}
                                  y2={vSeg.y1 - 7}
                                  stroke="#00E5FF"
                                  strokeWidth={strokeDim}
                                  markerStart="url(#dimArrowStart)"
                                  markerEnd="url(#dimArrowEnd)"
                                />
                                <text
                                  x={xRightEdge + 68}
                                  y={(vSeg.y0 + vSeg.y1) / 2}
                                  dominantBaseline="middle"
                                  transform={`rotate(90, ${xRightEdge + 68}, ${(vSeg.y0 + vSeg.y1) / 2})`}
                                  textAnchor="middle"
                                  fontWeight="600"
                                >
                                  {vSeg.label}
                                </text>
                              </g>
                            ))}

                            {/* Bottom Overall Flat Width Callout (1980 MM) */}
                            <line
                              x1={xGlue + 8}
                              y1={yBotCut + 48}
                              x2={xRightEdge - 8}
                              y2={yBotCut + 48}
                              stroke="#00E5FF"
                              strokeWidth={strokeDim}
                              markerStart="url(#dimArrowStart)"
                              markerEnd="url(#dimArrowEnd)"
                            />
                            <text
                              x={(xGlue + xRightEdge) / 2}
                              y={yBotCut + 80}
                              textAnchor="middle"
                              fontSize={fsLarge}
                              fontWeight="700"
                            >
                              TOTAL FLAT SHEET: {totalFlatWidthMm} × {totalFlatHeightMm} MM (4 × 485 MM + {glueFlap} MM GLUE TAB)
                            </text>
                          </g>
                        )}
                      </>
                    ) : (
                      /* ==========================================================
                         MODE C: PARAMETRIC FALLBACK FOR OTHER CONTRACTS (ICB-6619, ETC.)
                         ========================================================== */
                      <>
                        <g>
                          <polygon
                            points={`
                              ${xGlue},${originY + 25}
                              ${xPanel1},${originY}
                              ${xPanel1},${originY + H}
                              ${xGlue},${originY + H - 25}
                            `}
                            fill="url(#glueHatch)"
                          />
                          <rect
                            x={xPanel1}
                            y={originY}
                            width={W + L + W + L}
                            height={H}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <polygon
                            points={`
                              ${xPanel1},${originY}
                              ${xPanel1 + 18},${originY - dustFlapH}
                              ${xPanel2 - 18},${originY - dustFlapH}
                              ${xPanel2},${originY}
                            `}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <polygon
                            points={`
                              ${xPanel3},${originY}
                              ${xPanel3 + 18},${originY - dustFlapH}
                              ${xPanel4 - 18},${originY - dustFlapH}
                              ${xPanel4},${originY}
                            `}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <rect
                            x={xPanel2}
                            y={originY - topTuckH}
                            width={L}
                            height={topTuckH}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <polygon
                            points={`
                              ${xPanel2 + 24},${originY - topTuckH}
                              ${xPanel2 + 48},${originY - topTuckH - tuckTongueH}
                              ${xPanel3 - 48},${originY - topTuckH - tuckTongueH}
                              ${xPanel3 - 24},${originY - topTuckH}
                            `}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <rect
                            x={xPanel1}
                            y={originY + H}
                            width={W}
                            height={bottomFlapH * 0.8}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <rect
                            x={xPanel2}
                            y={originY + H}
                            width={L}
                            height={bottomFlapH}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <rect
                            x={xPanel3}
                            y={originY + H}
                            width={W}
                            height={bottomFlapH * 0.8}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                          <rect
                            x={xPanel4}
                            y={originY + H}
                            width={L}
                            height={bottomFlapH}
                            fill={baseSubstrateSpec.surfaceTint2D}
                          />
                        </g>

                        {layers.artwork && (
                          <g>
                            <g transform={`translate(${xPanel2}, ${originY})`}>
                              <rect
                                x={20}
                                y={20}
                                width={L - 40}
                                height={H - 40}
                                fill="#05050A"
                                stroke={
                                  contract.product.brand.length > OVERFLOW_THRESHOLDS.brandMaxChars ||
                                  contract.product.model.length > OVERFLOW_THRESHOLDS.modelMaxChars
                                    ? '#EF4444'
                                    : '#00E5FF'
                                }
                                strokeWidth={1.5}
                              />
                              <text
                                x={36}
                                y={58}
                                fill="#FFFFFF"
                                fontSize="24"
                                fontWeight="700"
                                fontFamily="Plus Jakarta Sans, sans-serif"
                              >
                                {contract.product.brand} // {contract.product.model}
                              </text>
                              <text
                                x={36}
                                y={88}
                                fill="#00E5FF"
                                fontSize="14"
                                fontFamily="Plus Jakarta Sans, sans-serif"
                              >
                                {contract.product.category}
                              </text>
                              <text
                                x={36}
                                y={120}
                                fill="#8A8FA3"
                                fontSize="12"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {powerVal} // {capacityVal} // {voltageVal}
                              </text>
                            </g>
                            <g transform={`translate(${xPanel3}, ${originY})`}>
                              {renderSvgBarcode(20, H - 84, Math.min(200, Math.max(90, W - 40)), 44)}
                            </g>
                          </g>
                        )}

                        {layers.bleed && B > 0 && (
                          <rect
                            x={leftCutX - B}
                            y={yTopCut - B}
                            width={physicalCutWidthMm + B * 2}
                            height={physicalCutHeightMm + B * 2}
                            fill="none"
                            stroke="#6B7280"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                          />
                        )}

                        {layers.crease && (
                          <g stroke="#00E5FF" strokeWidth={2} strokeDasharray="10 6" fill="none">
                            <line x1={xPanel1} y1={originY} x2={xRightEdge} y2={originY} />
                            <line x1={xPanel1} y1={originY + H} x2={xRightEdge} y2={originY + H} />
                            <line x1={xPanel1} y1={originY} x2={xPanel1} y2={originY + H} />
                            <line x1={xPanel2} y1={originY} x2={xPanel2} y2={originY + H} />
                            <line x1={xPanel3} y1={originY} x2={xPanel3} y2={originY + H} />
                            <line x1={xPanel4} y1={originY} x2={xPanel4} y2={originY + H} />
                          </g>
                        )}

                        {layers.diecut && (
                          <rect
                            x={xPanel1}
                            y={originY}
                            width={bodySpanWidthMm}
                            height={H}
                            fill="none"
                            stroke="#EF4444"
                            strokeWidth={2.2}
                          />
                        )}

                        {layers.dimensions && (
                          <g fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#00E5FF">
                            <text x={xPanel1 + W / 2} y={originY - 18} textAnchor="middle">
                              W: {W}MM
                            </text>
                            <text x={xPanel2 + L / 2} y={originY - 18} textAnchor="middle">
                              L: {L}MM
                            </text>
                            <text x={xRightEdge + 36} y={originY + H / 2} textAnchor="middle">
                              H: {H}MM
                            </text>
                          </g>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : (
          /* ============================================================
             3D FOLDED PROTOTYPE VIEWPORT (Data-Driven DynamicBoxEngine)
             ============================================================ */
          <DynamicBoxEngine
            lang={lang}
            contract={contract}
            topologyConfig={activeTopologyConfig}
            activeSubstrate={activeSubstrate}
            customPbrPack={customPbrPack}
            foldPercent={foldPercent}
            onFoldPercentChange={setFoldPercent}
            choreographyStatus={choreographyStatus}
            onChoreographyStatusChange={setChoreographyStatus}
            choreographyPhase={choreographyPhase}
            onChoreographyPhaseChange={setChoreographyPhase}
            replayTriggerCount={replayTriggerCount}
            recordRequestCount={recordRequestCount}
            isRecordingWebm={isRecordingWebm}
            onRecordingStateChange={setIsRecordingWebm}
            onRecordingElapsedChange={setRecordingElapsedSec}
            onRecordingComplete={setLastRecordedFileName}
            cameraAzimuthDeg={cameraAzimuthDeg}
            cameraPolarDeg={cameraPolarDeg}
            onCameraAngleChange={(az, pol) => {
              setCameraAzimuthDeg(az);
              setCameraPolarDeg(pol);
            }}
            xrayMode={xrayMode}
            zoom={zoom}
            onZoomChange={setZoom}
            fitToScreenTriggerCount={fitToScreenTriggerCount}
          />
        )}
      </div>

      {/* ====================================================================
          3D PACKAGING SHOWCASE & WEBM VIDEO RECORDER CONTROL BAR
          ==================================================================== */}
      <ShowcaseRecorderBar
        lang={lang}
        viewMode={viewMode}
        onEnter3DMode={() => setViewMode('3D_FOLDED')}
        foldPercent={foldPercent}
        onFoldPercentChange={handleManualFoldPercentChange}
        choreographyStatus={choreographyStatus}
        choreographyPhase={choreographyPhase}
        onToggleChoreography={handleToggleChoreography}
        onReplayChoreography={handleReplayChoreography}
        isRecordingWebm={isRecordingWebm}
        recordingElapsedSec={recordingElapsedSec}
        onToggleRecordWebm={handleToggleRecordWebm}
        lastRecordedFileName={lastRecordedFileName}
      />
    </main>
  );
};
