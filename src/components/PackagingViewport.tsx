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
  countContractOverflows,
  encodeEan13Bits,
  evaluateEan13,
  getTranslation,
} from '../config/studioConfig';
import { DynamicBoxEngine } from './DynamicBoxEngine';
import { ShowcaseRecorderBar } from './ShowcaseRecorderBar';

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
  const [cursorMm, setCursorMm] = useState<{ x: number; y: number }>({ x: 380.0, y: 395.0 });

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

  const voltageVal = getSpec('voltage', '220V - 50Hz');
  const powerVal = getSpec('power', '1800W');
  const capacityVal = getSpec('capacity', '6.5 Lít');
  const barcodeVal = getSpec('barcode', '8935219412345');
  const eanBits = encodeEan13Bits(barcodeVal);
  const eanInfo = evaluateEan13(barcodeVal);

  // Compute physical flat dieline dimensions in mm
  const glueFlap = Math.max(30, Math.round(W * 0.11));
  const dustFlapH = Math.round(W * 0.55);
  const topTuckH = Math.round(W * 0.85);
  const tuckTongueH = Math.round(W * 0.2);
  const bottomFlapH = Math.round(W * 0.65);

  const totalFlatWidthMm = glueFlap + W + L + W + L + B * 2;
  const totalFlatHeightMm = topTuckH + tuckTongueH + H + bottomFlapH + B * 2;

  const pad = 110;
  const svgW = totalFlatWidthMm + pad * 2;
  const svgH = totalFlatHeightMm + pad * 2;

  const originX = pad + B;
  const originY = pad + B + topTuckH + tuckTongueH;

  const xGlue = originX;
  const xPanel1 = xGlue + glueFlap;
  const xPanel2 = xPanel1 + W;
  const xPanel3 = xPanel2 + L;
  const xPanel4 = xPanel3 + W;
  const xRightEdge = xPanel4 + L;

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
    <main className="flex-1 h-full bg-[#05050A] flex flex-col min-w-0 select-none relative overflow-hidden">
      {/* ====================================================================
          TOP VIEWPORT TOOLBAR (Dock Collapse Controls, 2D/3D Toggle, Fit & Focus)
          ==================================================================== */}
      <div
        ref={toolbarRef}
        className="min-h-10 py-1 px-2.5 border-b border-[#1F1F2E] bg-[#0A0C14] flex flex-wrap items-center justify-between gap-1.5 shrink-0 z-50 relative"
      >
        {/* Left: Left Dock Collapse Toggle, Viewport Title & View Mode Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleLeftDock && (
            <button
              type="button"
              onClick={onToggleLeftDock}
              title="Toggle Left Parameter Dock (Col 01)"
              className={`h-7 px-2 border font-mono text-[10px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                isLeftDockCollapsed
                  ? 'bg-[#5322FF]/30 text-[#00E5FF] border-[#00E5FF]'
                  : 'bg-[#0D0E17] text-[#8A8FA3] hover:text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
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
            <Crosshair size={16} strokeWidth={1.25} className="text-[#00E5FF]" />
            <span className="font-mono text-xs font-semibold tracking-wider text-white whitespace-nowrap">
              {t.header}
            </span>
          </div>

          <div className="flex items-center border border-[#2D2D44] bg-[#05050A]">
            <button
              type="button"
              onClick={() => setViewMode('2D_FLAT')}
              className={`h-7 px-2.5 font-mono text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === '2D_FLAT'
                  ? 'bg-[#00E5FF] text-[#05050A]'
                  : 'text-[#8A8FA3] hover:text-white'
              }`}
            >
              <FileCode2 size={15} strokeWidth={1.25} />
              <span>{t.flat2dBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3D_FOLDED')}
              className={`h-7 px-2.5 font-mono text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === '3D_FOLDED'
                  ? 'bg-[#00E5FF] text-[#05050A]'
                  : 'text-[#8A8FA3] hover:text-white'
              }`}
            >
              <Box size={15} strokeWidth={1.25} />
              <span>{t.folded3dBtn}</span>
            </button>
          </div>
        </div>

        {/* Center: Config-Driven Dropdown Menus */}
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
                  ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF] font-semibold'
                  : 'bg-[#0D0E17] text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
            >
              <Layers size={15} strokeWidth={1.25} />
              <span>
                [ ▾ {t.cadLayersMenu} ({activeLayerCount}) ]
              </span>
            </button>

            {openDropdown === 'LAYERS' && (
              <div className="absolute left-0 top-8 w-64 max-w-[85vw] bg-[#0A0C14] border-2 border-[#00E5FF] z-50 divide-y divide-[#1F1F2E]">
                {CAD_LAYER_CONFIG.map((item) => {
                  const checked = layers[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onToggleLayer(item.id)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left font-mono text-xs hover:bg-[#0D0E17] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3.5 h-3.5 border flex items-center justify-center ${
                            checked
                              ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                              : 'border-[#2D2D44] bg-[#05050A]'
                          }`}
                        >
                          {checked && <Check size={12} strokeWidth={1.5} />}
                        </span>
                        <span className={checked ? 'text-white' : 'text-[#8A8FA3]'}>
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

          {/* 2. [ ▾ CAMERA_PRESETS ] DROPDOWN (Aligned right-0 origin-top-right to prevent right-edge clipping) */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown((prev) => (prev === 'CAMERA' ? null : 'CAMERA'))
              }
              className={`h-7 px-2.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                openDropdown === 'CAMERA'
                  ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF] font-semibold'
                  : 'bg-[#0D0E17] text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
            >
              <Camera size={15} strokeWidth={1.25} />
              <span>[ ▾ {t.cameraPresetsMenu} ]</span>
            </button>

            {openDropdown === 'CAMERA' && (
              <div className="absolute right-0 origin-top-right top-8 w-64 max-w-[85vw] bg-[#0A0C14] border-2 border-[#00E5FF] z-50 divide-y divide-[#1F1F2E]">
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
                      className="w-full px-3 py-2 flex items-center justify-between text-left font-mono text-xs hover:bg-[#0D0E17] transition-colors cursor-pointer"
                    >
                      <span className={isCurrent ? 'text-[#00E5FF] font-semibold' : 'text-white'}>
                        {camItem.label[lang]}
                      </span>
                      {isCurrent && (
                        <Check size={14} strokeWidth={1.25} className="text-[#00E5FF]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. [ ▾ SUBSTRATE_&_FINISH ] MATERIAL DROPDOWN (Aligned right-0 origin-top-right so it opens downwards-left inside Viewport 02) */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown((prev) => (prev === 'SUBSTRATE' ? null : 'SUBSTRATE'))
              }
              className={`h-7 px-2.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                openDropdown === 'SUBSTRATE'
                  ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF] font-semibold'
                  : activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
                  ? 'bg-[#5322FF]/30 text-[#00E5FF] border-[#00E5FF]'
                  : 'bg-[#0D0E17] text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
            >
              <Palette size={15} strokeWidth={1.25} />
              <span>[ ▾ {t.substrateMenu} ]</span>
            </button>

            {openDropdown === 'SUBSTRATE' && (
              <div className="absolute right-0 origin-top-right top-8 w-80 sm:w-96 max-w-[85vw] bg-[#0A0C14] border-2 border-[#00E5FF] z-50 divide-y divide-[#1F1F2E]">
                <div className="px-3 py-1.5 bg-[#0D0E17] font-mono text-[10px] text-[#8A8FA3] flex items-center justify-between">
                  <span>HYBRID 3D PACKAGING MATERIAL ARCHITECTURE</span>
                  <span className="text-[#00E5FF]">PBR_SHADER</span>
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
                            ? 'bg-[#0D0E17] text-[#00E5FF]'
                            : spec.isCustomAgentSlot
                            ? 'bg-[#5322FF]/15 text-white hover:bg-[#5322FF]/25'
                            : 'hover:bg-[#0D0E17] text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{spec.label[lang]}</span>
                          {isSelected && (
                            <Check
                              size={14}
                              strokeWidth={1.25}
                              className="text-[#00E5FF] shrink-0"
                            />
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-[#8A8FA3] tabular-nums">
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
              className="h-7 px-2 bg-[#5322FF] border border-[#00E5FF] font-mono text-[10px] text-white font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Sparkles size={14} strokeWidth={1.25} className="text-[#00E5FF]" />
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
            className="h-7 w-7 bg-[#0D0E17] border border-[#1F1F2E] hover:border-[#00E5FF] flex items-center justify-center text-[#8A8FA3] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomOut size={15} strokeWidth={1.25} />
          </button>
          <span className="h-7 px-2 bg-[#0D0E17] border border-[#1F1F2E] font-mono text-[11px] text-white tabular-nums flex items-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.4, Number((z + 0.15).toFixed(2))))}
            title="Zoom In"
            className="h-7 w-7 bg-[#0D0E17] border border-[#1F1F2E] hover:border-[#00E5FF] flex items-center justify-center text-[#8A8FA3] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomIn size={15} strokeWidth={1.25} />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            title="Fit Entire Dieline (0%) or 3D Carton (100%) to Viewport"
            className="h-7 px-2.5 bg-[#0D0E17] border border-[#00E5FF] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#05050A] font-mono text-[10px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Maximize2 size={13} strokeWidth={1.5} />
            <span>{t.fitBtn}</span>
          </button>

          {onToggleFullFocusMode && (
            <button
              type="button"
              onClick={onToggleFullFocusMode}
              title="Toggle 100% Full Canvas Focus Mode"
              className={`h-7 px-2 border font-mono text-[10px] font-semibold hidden xl:flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                isFullFocusActive
                  ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF]'
                  : 'bg-[#0D0E17] text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
            >
              {isFullFocusActive ? (
                <>
                  <Minimize2 size={13} strokeWidth={1.5} />
                  <span>{t.exitFocusModeBtn}</span>
                </>
              ) : (
                <>
                  <Maximize2 size={13} strokeWidth={1.5} />
                  <span>{t.focusModeBtn}</span>
                </>
              )}
            </button>
          )}

          {onToggleRightDock && (
            <button
              type="button"
              onClick={onToggleRightDock}
              title="Toggle Right Preflight Dock (Col 03)"
              className={`h-7 px-2 border font-mono text-[10px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                isRightDockCollapsed
                  ? 'bg-[#5322FF]/30 text-[#00E5FF] border-[#00E5FF]'
                  : 'bg-[#0D0E17] text-[#8A8FA3] hover:text-white border-[#2D2D44] hover:border-[#00E5FF]'
              }`}
            >
              {isRightDockCollapsed ? (
                <>
                  <ChevronLeft size={13} strokeWidth={1.5} />
                  <span>{t.expandRightBtn}</span>
                </>
              ) : (
                <>
                  <span>{t.collapseRightBtn}</span>
                  <ChevronRight size={13} strokeWidth={1.5} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sub-Status Strip: Active Material Physics, Overflow Gatekeeper Status & Live XY */}
      <div className="h-7 px-3.5 border-b border-[#1F1F2E] bg-[#0D0E17] flex items-center justify-between gap-2 shrink-0 z-10 font-mono text-[10px] text-[#8A8FA3] tabular-nums">
        <div className="flex items-center gap-3 truncate">
          <span className="text-[#00E5FF] font-semibold">
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
            {t.sheetLabel}: <strong className="text-white">{totalFlatWidthMm.toFixed(0)}</strong> ×{' '}
            <strong className="text-white">{totalFlatHeightMm.toFixed(0)}</strong> MM
          </span>
          <span className="text-[#2D2D44]">|</span>
          <span>
            XY: <strong className="text-[#00E5FF]">{cursorMm.x.toFixed(1)}</strong>,{' '}
            <strong className="text-[#00E5FF]">{cursorMm.y.toFixed(1)}</strong> MM
          </span>
        </div>
      </div>

      {/* ====================================================================
          AGENT AN EXTERNAL PBR ASSET PACK HOOK DRAWER (Modular Texture Slot)
          ==================================================================== */}
      {showPbrDrawer && (
        <div className="absolute top-20 right-4 w-96 bg-[#0A0C14] border-2 border-[#00E5FF] z-40 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1F1F2E] pb-2">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#00E5FF]">
              <Sliders size={16} strokeWidth={1.25} />
              <span>[ ⚡ AGENT_AN // PBR_MATERIAL_HOOK ]</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPbrDrawer(false)}
              className="text-[#8A8FA3] hover:text-white cursor-pointer"
            >
              <X size={16} strokeWidth={1.25} />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] text-[#8A8FA3]">
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
                      ? 'bg-[#5322FF]/30 border-[#00E5FF] text-[#00E5FF]'
                      : 'bg-[#0D0E17] border-[#1F1F2E] text-white hover:border-[#2D2D44]'
                  }`}
                >
                  <span className="truncate">{pack.packName}</span>
                  <span className="text-[#8A8FA3] shrink-0 ml-2">
                    R:{pack.roughness} M:{pack.metalness}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-[#1F1F2E]">
            <div className="font-mono text-[10px] text-[#00E5FF]">
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
                <label className="block font-mono text-[9px] text-[#8A8FA3] mb-0.5">
                  {slot.label}
                </label>
                <input
                  type="text"
                  value={customPbrPack[slot.key] || ''}
                  onChange={(e) =>
                    onUpdateCustomPbrPack({ [slot.key]: e.target.value || null })
                  }
                  placeholder="https://... or data:image/svg+xml..."
                  className="w-full h-6 px-2 bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none font-mono text-[10px] text-white"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-[#1F1F2E] font-mono text-[10px]">
            <div>
              <div className="flex justify-between text-[#8A8FA3] mb-1">
                <span>ROUGHNESS</span>
                <span className="text-[#00E5FF]">{customPbrPack.roughness.toFixed(2)}</span>
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
                className="w-full accent-[#00E5FF]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[#8A8FA3] mb-1">
                <span>METALNESS</span>
                <span className="text-[#00E5FF]">{customPbrPack.metalness.toFixed(2)}</span>
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
                className="w-full accent-[#00E5FF]"
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

              {/* PRE-PRESS REGISTRATION MARKS & CMYK COLOR BARS */}
              <g>
                {[
                  { label: 'C:100', color: '#00E5FF' },
                  { label: 'M:100', color: '#EC4899' },
                  { label: 'Y:100', color: '#EAB308' },
                  { label: 'K:100', color: '#374151' },
                  { label: 'PMS_2935C', color: '#0055FF' },
                  { label: 'SPOT_UV', color: '#5322FF' },
                  { label: 'DIECUT_SPOT', color: '#EF4444' },
                ].map((swatch, idx) => (
                  <g key={swatch.label} transform={`translate(${pad + idx * 125}, 24)`}>
                    <rect
                      x={0}
                      y={0}
                      width={34}
                      height={14}
                      fill={swatch.color}
                      stroke="#1F1F2E"
                      strokeWidth={1}
                    />
                    <text
                      x={40}
                      y={11}
                      fill="#8A8FA3"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {swatch.label}
                    </text>
                  </g>
                ))}

                <text
                  x={svgW - pad}
                  y={35}
                  textAnchor="end"
                  fill="#00E5FF"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                >
                  SUBSTRATE: {baseSubstrateSpec.shortCode} (R:{effectiveRoughness.toFixed(2)} M:
                  {effectiveMetalness.toFixed(2)} // {effectiveGsm}GSM)
                </text>

                {[
                  { cx: 45, cy: 45 },
                  { cx: svgW - 45, cy: 45 },
                  { cx: 45, cy: svgH - 45 },
                  { cx: svgW - 45, cy: svgH - 45 },
                ].map((pt, idx) => (
                  <g key={idx} transform={`translate(${pt.cx}, ${pt.cy})`}>
                    <circle cx={0} cy={0} r={14} fill="none" stroke="#00E5FF" strokeWidth={1.2} />
                    <circle cx={0} cy={0} r={6} fill="none" stroke="#EF4444" strokeWidth={1.2} />
                    <line x1={-22} y1={0} x2={22} y2={0} stroke="#00E5FF" strokeWidth={1} />
                    <line x1={0} y1={-22} x2={0} y2={22} stroke="#00E5FF" strokeWidth={1} />
                  </g>
                ))}
              </g>

              {/* 1. SUBSTRATE BASE FILL & PBR TEXTURE SIMULATION */}
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

                {baseSubstrateSpec.patternType === 'MATTE_EFLUTE' && (
                  <rect
                    x={xPanel1}
                    y={originY}
                    width={W + L + W + L}
                    height={H}
                    fill="url(#efluteBump)"
                  />
                )}
                {baseSubstrateSpec.patternType === 'KRAFT_FIBER' && (
                  <rect
                    x={xPanel1}
                    y={originY}
                    width={W + L + W + L}
                    height={H}
                    fill="url(#kraftFiber)"
                  />
                )}
                {baseSubstrateSpec.patternType === 'GLOSS_IVORY' && (
                  <rect
                    x={xPanel1}
                    y={originY}
                    width={W + L + W + L}
                    height={H}
                    fill="url(#glossIvorySheen)"
                  />
                )}
                {(baseSubstrateSpec.patternType === 'FOIL_SPOT_UV' ||
                  baseSubstrateSpec.patternType === 'CUSTOM_PBR') && (
                  <rect
                    x={xPanel1}
                    y={originY}
                    width={W + L + W + L}
                    height={H}
                    fill="url(#metallicFoilSheen)"
                  />
                )}

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

              {/* 2. ARTWORK PRINT LAYER */}
              {layers.artwork && (
                <g>
                  <text
                    x={xGlue + glueFlap / 2}
                    y={originY + H / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(-90, ${xGlue + glueFlap / 2}, ${originY + H / 2})`}
                    fill="#8A8FA3"
                    fontSize="12"
                    fontFamily="JetBrains Mono, monospace"
                    letterSpacing="3"
                  >
                    GLUE_FLAP // NO_INK_ZONE ({glueFlap}MM)
                  </text>

                  {/* PANEL 1 (LEFT SIDE PANEL - WIDTH W) */}
                  <g transform={`translate(${xPanel1}, ${originY})`}>
                    <rect
                      x={16}
                      y={20}
                      width={W - 32}
                      height={44}
                      fill="#05050A"
                      stroke={baseSubstrateSpec.borderAccent}
                    />
                    <text
                      x={28}
                      y={47}
                      fill="#00E5FF"
                      fontSize="20"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {contract.product.brand.toUpperCase()}
                    </text>
                    <text
                      x={W - 28}
                      y={46}
                      textAnchor="end"
                      fill="#FFFFFF"
                      fontSize="14"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {contract.product.model}
                    </text>

                    <text
                      x={20}
                      y={92}
                      fill="#8A8FA3"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      [ SIDE_PANEL_A // KSP_VECTOR_STACK ]
                    </text>

                    {contract.keySellingPoints.map((ksp, idx) => {
                      const hasKspOverflow =
                        ksp.title.length > OVERFLOW_THRESHOLDS.kspTitleMaxChars ||
                        ksp.description.length > OVERFLOW_THRESHOLDS.kspDescriptionMaxChars;
                      return (
                        <g key={ksp.id} transform={`translate(20, ${108 + idx * 72})`}>
                          <rect
                            x={0}
                            y={0}
                            width={W - 40}
                            height={60}
                            fill="#05050A"
                            stroke={
                              hasKspOverflow
                                ? '#EF4444'
                                : ksp.status === 'READY'
                                ? '#2D2D44'
                                : '#5322FF'
                            }
                            strokeWidth={hasKspOverflow ? 2 : 1.2}
                          />
                          <rect
                            x={10}
                            y={10}
                            width={40}
                            height={40}
                            fill="#0D0E17"
                            stroke={ksp.status === 'READY' ? '#00E5FF' : '#5322FF'}
                            strokeWidth={1}
                          />
                          {ksp.iconSvg ? (
                            <g
                              transform="translate(14, 14) scale(0.66)"
                              stroke="#00E5FF"
                              fill="none"
                              dangerouslySetInnerHTML={{
                                __html: ksp.iconSvg
                                  .replace(/<svg[^>]*>/, '')
                                  .replace(/<\/svg>/, ''),
                              }}
                            />
                          ) : (
                            <text
                              x={30}
                              y={33}
                              textAnchor="middle"
                              fill="#5322FF"
                              fontSize="9"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              PEND
                            </text>
                          )}
                          <text
                            x={62}
                            y={26}
                            fill={hasKspOverflow ? '#EF4444' : '#FFFFFF'}
                            fontSize="14"
                            fontWeight="600"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                          >
                            {ksp.title}
                          </text>
                          <text
                            x={62}
                            y={44}
                            fill="#8A8FA3"
                            fontSize="11"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                          >
                            {ksp.description}
                          </text>
                        </g>
                      );
                    })}

                    <rect
                      x={20}
                      y={H - 68}
                      width={W - 40}
                      height={46}
                      fill="#05050A"
                      stroke="#1F1F2E"
                    />
                    <text
                      x={32}
                      y={H - 40}
                      fill="#00E5FF"
                      fontSize="13"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {powerVal} // {capacityVal} // {voltageVal}
                    </text>
                  </g>

                  {/* PANEL 2 (FRONT HERO DISPLAY PANEL - LENGTH L) */}
                  <g transform={`translate(${xPanel2}, ${originY})`}>
                    <rect
                      x={20}
                      y={20}
                      width={L - 40}
                      height={58}
                      fill="#05050A"
                      stroke={
                        contract.product.brand.length > OVERFLOW_THRESHOLDS.brandMaxChars ||
                        contract.product.model.length > OVERFLOW_THRESHOLDS.modelMaxChars
                          ? '#EF4444'
                          : activeSubstrate === 'METALLIC_FOIL_SPOT_UV'
                          ? '#5322FF'
                          : '#00E5FF'
                      }
                      strokeWidth={1.8}
                    />
                    <text
                      x={36}
                      y={57}
                      fill="#FFFFFF"
                      fontSize="28"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      letterSpacing="1"
                    >
                      {contract.product.brand}
                    </text>
                    <rect
                      x={L - 165}
                      y={32}
                      width={130}
                      height={34}
                      fill="#5322FF"
                      stroke="#00E5FF"
                      strokeWidth={1}
                    />
                    <text
                      x={L - 100}
                      y={54}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="16"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {contract.product.model}
                    </text>

                    <text
                      x={24}
                      y={104}
                      fill={
                        contract.product.category.length > OVERFLOW_THRESHOLDS.categoryMaxChars
                          ? '#EF4444'
                          : '#00E5FF'
                      }
                      fontSize="16"
                      fontWeight="600"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {contract.product.category.toUpperCase()}
                    </text>
                    <text
                      x={L - 24}
                      y={104}
                      textAnchor="end"
                      fill="#8A8FA3"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      [ FRONT_PRIMARY_PANEL // {L}×{H}MM ]
                    </text>

                    <g transform="translate(24, 120)">
                      <rect
                        x={0}
                        y={0}
                        width={L - 48}
                        height={Math.max(120, H - 235)}
                        fill="#05050A"
                        stroke="#2D2D44"
                        strokeWidth={1.5}
                      />

                      <line
                        x1={(L - 48) / 2}
                        y1={10}
                        x2={(L - 48) / 2}
                        y2={Math.max(120, H - 245)}
                        stroke="#1F1F2E"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={10}
                        y1={Math.max(120, H - 235) / 2}
                        x2={L - 58}
                        y2={Math.max(120, H - 235) / 2}
                        stroke="#1F1F2E"
                        strokeDasharray="4 4"
                      />

                      <g
                        transform={`translate(${(L - 48) / 2}, ${
                          Math.max(120, H - 235) / 2
                        })`}
                      >
                        <rect
                          x={-65}
                          y={-62}
                          width={130}
                          height={124}
                          fill="#0D0E17"
                          stroke="#00E5FF"
                          strokeWidth={1.5}
                        />
                        <rect
                          x={-48}
                          y={-46}
                          width={96}
                          height={36}
                          fill="#05050A"
                          stroke="#5322FF"
                          strokeWidth={1.2}
                        />
                        <text
                          x={0}
                          y={-24}
                          textAnchor="middle"
                          fill="#00E5FF"
                          fontSize="13"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          200°C // 60M
                        </text>
                        <rect
                          x={-52}
                          y={0}
                          width={104}
                          height={50}
                          fill="#05050A"
                          stroke="#00E5FF"
                          strokeWidth={1.2}
                        />
                        <line x1={-12} y1={-5} x2={12} y2={-5} stroke="#10B981" strokeWidth={3} />
                        <text
                          x={0}
                          y={29}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="14"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {capacityVal}
                        </text>
                      </g>

                      <text
                        x={14}
                        y={22}
                        fill="#10B981"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        [ {artworkType} // {baseSubstrateSpec.shortCode} ]
                      </text>
                      <text
                        x={14}
                        y={Math.max(120, H - 235) - 12}
                        fill="#8A8FA3"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        PWR: {powerVal} | VOLT: {voltageVal}
                      </text>
                    </g>

                    {/* Front Bottom KSP Feature Bar */}
                    <g transform={`translate(24, ${H - 96})`}>
                      {contract.keySellingPoints.slice(0, 3).map((ksp, i) => {
                        const count = Math.min(3, Math.max(1, contract.keySellingPoints.length));
                        const cardW = (L - 48 - (count - 1) * 10) / count;
                        const hasOverflow =
                          ksp.title.length > OVERFLOW_THRESHOLDS.kspTitleMaxChars ||
                          ksp.description.length > OVERFLOW_THRESHOLDS.kspDescriptionMaxChars;
                        return (
                          <g key={ksp.id} transform={`translate(${i * (cardW + 10)}, 0)`}>
                            <rect
                              x={0}
                              y={0}
                              width={cardW}
                              height={74}
                              fill="#05050A"
                              stroke={
                                hasOverflow
                                  ? '#EF4444'
                                  : ksp.status === 'READY'
                                  ? '#00E5FF'
                                  : '#5322FF'
                              }
                              strokeWidth={hasOverflow ? 2 : 1.2}
                            />
                            <text
                              x={12}
                              y={26}
                              fill={hasOverflow ? '#EF4444' : '#00E5FF'}
                              fontSize="13"
                              fontWeight="700"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {ksp.title}
                            </text>
                            <text
                              x={12}
                              y={46}
                              fill="#FFFFFF"
                              fontSize="11"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {ksp.description}
                            </text>
                            <text
                              x={12}
                              y={64}
                              fill={
                                hasOverflow
                                  ? '#EF4444'
                                  : ksp.status === 'READY'
                                  ? '#10B981'
                                  : '#5322FF'
                              }
                              fontSize="9"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              [
                              {hasOverflow
                                ? 'OVERFLOW_WARN'
                                : ksp.status === 'READY'
                                ? 'VERIFIED_VECTOR'
                                : 'PENDING_AN'}
                              ]
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </g>

                  {/* PANEL 3 (RIGHT SIDE PANEL - WIDTH W) */}
                  <g transform={`translate(${xPanel3}, ${originY})`}>
                    <rect x={16} y={20} width={W - 32} height={44} fill="#05050A" stroke="#2D2D44" />
                    <text
                      x={28}
                      y={46}
                      fill="#FFFFFF"
                      fontSize="16"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      [ TECH_SPEC_TABLE ]
                    </text>

                    <g transform="translate(16, 80)">
                      {[
                        ...contract.technicalSpecs.filter((s) => s.id !== 'barcode'),
                        ...contract.dynamicSpecs,
                      ]
                        .slice(0, 7)
                        .map((spec, idx) => {
                          const isSpecOverflow =
                            spec.value.length > OVERFLOW_THRESHOLDS.specValueMaxChars ||
                            spec.label.length > OVERFLOW_THRESHOLDS.specLabelMaxChars;
                          return (
                            <g key={spec.id} transform={`translate(0, ${idx * 34})`}>
                              <rect
                                x={0}
                                y={0}
                                width={W - 32}
                                height={28}
                                fill={idx % 2 === 0 ? '#05050A' : '#0D0E17'}
                                stroke={isSpecOverflow ? '#EF4444' : '#1F1F2E'}
                              />
                              <text
                                x={10}
                                y={18}
                                fill="#8A8FA3"
                                fontSize="11"
                                fontFamily="Plus Jakarta Sans, sans-serif"
                              >
                                {spec.label}
                              </text>
                              <text
                                x={W - 42}
                                y={18}
                                textAnchor="end"
                                fill={isSpecOverflow ? '#EF4444' : '#FFFFFF'}
                                fontSize="12"
                                fontWeight="600"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {spec.value}
                              </text>
                            </g>
                          );
                        })}
                    </g>

                    {renderSvgBarcode(26, H - 90, Math.min(220, W - 52), 48)}
                  </g>

                  {/* PANEL 4 (BACK PANEL - LENGTH L) */}
                  <g transform={`translate(${xPanel4}, ${originY})`}>
                    <rect
                      x={20}
                      y={20}
                      width={L - 40}
                      height={H - 40}
                      fill="#05050A"
                      stroke="#1F1F2E"
                      strokeWidth={1.2}
                    />
                    <text
                      x={36}
                      y={52}
                      fill="#00E5FF"
                      fontSize="20"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {contract.product.brand.toUpperCase()} // {contract.product.model}
                    </text>
                    <text
                      x={36}
                      y={76}
                      fill="#8A8FA3"
                      fontSize="13"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {contract.product.category} — {baseSubstrateSpec.shortCode}
                    </text>

                    <line x1={36} y1={94} x2={L - 36} y2={94} stroke="#1F1F2E" />

                    <g transform="translate(36, 114)">
                      <text
                        x={0}
                        y={0}
                        fill="#00E5FF"
                        fontSize="12"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        [ 01 // ELECTRICAL_&_THERMAL_RATINGS ]
                      </text>
                      <text
                        x={0}
                        y={24}
                        fill="#FFFFFF"
                        fontSize="13"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        • MODEL: {contract.product.model} ({contract.product.artworkType})
                      </text>
                      <text
                        x={0}
                        y={46}
                        fill="#FFFFFF"
                        fontSize="13"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        • RATED VOLTAGE: {voltageVal} | POWER: {powerVal}
                      </text>
                      <text
                        x={0}
                        y={68}
                        fill="#FFFFFF"
                        fontSize="13"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        • CAPACITY: {capacityVal} | NET BOX: {L}×{W}×{H} MM
                      </text>
                      {contract.dynamicSpecs.slice(0, 3).map((ds, i) => (
                        <text
                          key={ds.id}
                          x={0}
                          y={90 + i * 22}
                          fill="#8A8FA3"
                          fontSize="12"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          • {ds.label.toUpperCase()}: {ds.value}
                        </text>
                      ))}
                    </g>

                    <g transform={`translate(36, ${H - 106})`}>
                      <rect
                        x={0}
                        y={0}
                        width={46}
                        height={46}
                        fill="none"
                        stroke="#8A8FA3"
                        strokeWidth={1.5}
                      />
                      <text
                        x={23}
                        y={29}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="16"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        CE
                      </text>
                      <rect
                        x={56}
                        y={0}
                        width={46}
                        height={46}
                        fill="none"
                        stroke="#8A8FA3"
                        strokeWidth={1.5}
                      />
                      <rect
                        x={66}
                        y={10}
                        width={26}
                        height={26}
                        fill="none"
                        stroke="#8A8FA3"
                        strokeWidth={1.5}
                      />
                    </g>

                    {renderSvgBarcode(L - 225, H - 102, 185, 48)}
                  </g>

                  {/* TOP LID ARTWORK */}
                  <g transform={`translate(${xPanel2}, ${originY - topTuckH})`}>
                    <text
                      x={L / 2}
                      y={topTuckH / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#00E5FF"
                      fontSize="22"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      letterSpacing="2"
                    >
                      {contract.product.brand.toUpperCase()} // {contract.product.model}
                    </text>
                  </g>
                </g>
              )}

              {/* 3. BLEED PERIMETER LINE */}
              {layers.bleed && B > 0 && (
                <g>
                  <rect
                    x={xGlue - B}
                    y={originY - topTuckH - tuckTongueH - B}
                    width={totalFlatWidthMm}
                    height={totalFlatHeightMm}
                    fill="none"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={xGlue - B + 8}
                    y={originY - topTuckH - tuckTongueH - B - 8}
                    fill="#8A8FA3"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    BLEED_PERIMETER_OFFSET // +{B.toFixed(1)}MM
                  </text>
                </g>
              )}

              {/* 4. CREASE / FOLD LINES */}
              {layers.crease && (
                <g stroke="#00E5FF" strokeWidth={2.2} strokeDasharray="10 6" fill="none">
                  <line x1={xPanel1} y1={originY} x2={xRightEdge} y2={originY} />
                  <line x1={xPanel1} y1={originY + H} x2={xRightEdge} y2={originY + H} />
                  <line x1={xPanel1} y1={originY} x2={xPanel1} y2={originY + H} />
                  <line x1={xPanel2} y1={originY} x2={xPanel2} y2={originY + H} />
                  <line x1={xPanel3} y1={originY} x2={xPanel3} y2={originY + H} />
                  <line x1={xPanel4} y1={originY} x2={xPanel4} y2={originY + H} />
                  <line
                    x1={xPanel2}
                    y1={originY - topTuckH}
                    x2={xPanel3}
                    y2={originY - topTuckH}
                  />
                </g>
              )}

              {/* 5. DIECUT CUTTING LINES */}
              {layers.diecut && (
                <g stroke="#EF4444" strokeWidth={2.5} fill="none">
                  <polyline
                    points={`
                      ${xPanel1},${originY}
                      ${xGlue},${originY + 25}
                      ${xGlue},${originY + H - 25}
                      ${xPanel1},${originY + H}
                    `}
                  />
                  <line x1={xRightEdge} y1={originY} x2={xRightEdge} y2={originY + H} />
                  <polyline
                    points={`
                      ${xPanel1},${originY}
                      ${xPanel1 + 18},${originY - dustFlapH}
                      ${xPanel2 - 18},${originY - dustFlapH}
                      ${xPanel2},${originY}
                    `}
                  />
                  <polyline
                    points={`
                      ${xPanel2},${originY}
                      ${xPanel2},${originY - topTuckH}
                      ${xPanel2 + 24},${originY - topTuckH}
                      ${xPanel2 + 48},${originY - topTuckH - tuckTongueH}
                      ${xPanel3 - 48},${originY - topTuckH - tuckTongueH}
                      ${xPanel3 - 24},${originY - topTuckH}
                      ${xPanel3},${originY - topTuckH}
                      ${xPanel3},${originY}
                    `}
                  />
                  <polyline
                    points={`
                      ${xPanel3},${originY}
                      ${xPanel3 + 18},${originY - dustFlapH}
                      ${xPanel4 - 18},${originY - dustFlapH}
                      ${xPanel4},${originY}
                    `}
                  />
                  <line x1={xPanel4} y1={originY} x2={xRightEdge} y2={originY} />
                  <polyline
                    points={`
                      ${xPanel1},${originY + H}
                      ${xPanel1 + 12},${originY + H + bottomFlapH * 0.8}
                      ${xPanel2 - 12},${originY + H + bottomFlapH * 0.8}
                      ${xPanel2},${originY + H}
                    `}
                  />
                  <polyline
                    points={`
                      ${xPanel2},${originY + H}
                      ${xPanel2},${originY + H + bottomFlapH}
                      ${xPanel3},${originY + H + bottomFlapH}
                      ${xPanel3},${originY + H}
                    `}
                  />
                  <polyline
                    points={`
                      ${xPanel3},${originY + H}
                      ${xPanel3 + 12},${originY + H + bottomFlapH * 0.8}
                      ${xPanel4 - 12},${originY + H + bottomFlapH * 0.8}
                      ${xPanel4},${originY + H}
                    `}
                  />
                  <polyline
                    points={`
                      ${xPanel4},${originY + H}
                      ${xPanel4},${originY + H + bottomFlapH}
                      ${xRightEdge},${originY + H + bottomFlapH}
                      ${xRightEdge},${originY + H}
                    `}
                  />
                </g>
              )}

              {/* 6. CAD DIMENSION CALLOUT ARROWS */}
              {layers.dimensions && (
                <g fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#00E5FF">
                  <line
                    x1={xPanel1 + 6}
                    y1={originY - 18}
                    x2={xPanel2 - 6}
                    y2={originY - 18}
                    stroke="#00E5FF"
                    strokeWidth={1.5}
                    markerStart="url(#dimArrowStart)"
                    markerEnd="url(#dimArrowEnd)"
                  />
                  <text x={xPanel1 + W / 2} y={originY - 26} textAnchor="middle">
                    W: {W}MM
                  </text>

                  <line
                    x1={xPanel2 + 6}
                    y1={originY - 18}
                    x2={xPanel3 - 6}
                    y2={originY - 18}
                    stroke="#00E5FF"
                    strokeWidth={1.5}
                    markerStart="url(#dimArrowStart)"
                    markerEnd="url(#dimArrowEnd)"
                  />
                  <text x={xPanel2 + L / 2} y={originY - 26} textAnchor="middle">
                    L: {L}MM
                  </text>

                  <line
                    x1={xPanel3 + 6}
                    y1={originY - 18}
                    x2={xPanel4 - 6}
                    y2={originY - 18}
                    stroke="#00E5FF"
                    strokeWidth={1.5}
                    markerStart="url(#dimArrowStart)"
                    markerEnd="url(#dimArrowEnd)"
                  />
                  <text x={xPanel3 + W / 2} y={originY - 26} textAnchor="middle">
                    W: {W}MM
                  </text>

                  <line
                    x1={xPanel4 + 6}
                    y1={originY - 18}
                    x2={xRightEdge - 6}
                    y2={originY - 18}
                    stroke="#00E5FF"
                    strokeWidth={1.5}
                    markerStart="url(#dimArrowStart)"
                    markerEnd="url(#dimArrowEnd)"
                  />
                  <text x={xPanel4 + L / 2} y={originY - 26} textAnchor="middle">
                    L: {L}MM
                  </text>

                  <line
                    x1={xRightEdge + 32}
                    y1={originY + 6}
                    x2={xRightEdge + 32}
                    y2={originY + H - 6}
                    stroke="#00E5FF"
                    strokeWidth={1.5}
                    markerStart="url(#dimArrowStart)"
                    markerEnd="url(#dimArrowEnd)"
                  />
                  <text
                    x={xRightEdge + 48}
                    y={originY + H / 2}
                    dominantBaseline="middle"
                    transform={`rotate(90, ${xRightEdge + 48}, ${originY + H / 2})`}
                    textAnchor="middle"
                  >
                    H: {H}MM
                  </text>
                </g>
              )}
            </svg>
          </div>
        ) : (
          /* ============================================================
             3D FOLDED PROTOTYPE VIEWPORT (Data-Driven DynamicBoxEngine)
             ============================================================ */
          <DynamicBoxEngine
            lang={lang}
            contract={contract}
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
