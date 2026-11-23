/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AgentAnPbrTexturePack,
  ArtworkType,
  CadLayerId,
  CadLayerVisibility,
  IngestionMetadata,
  Language,
  PackagingContract,
  PreflightRuleId,
  ProductDimensions,
  ProductionJobTicket,
  SubstratePresetId,
} from './types/packaging';
import {
  ARTWORK_MODE_OPTIONS,
  DEFAULT_AGENT_AN_PBR_PACK,
  DEFAULT_CAD_LAYERS,
  INITIAL_AGENT_CONTRACT,
  SUBSTRATE_MATERIAL_CONFIG,
  evaluateEan13,
  selectVectorCraftSvg,
} from './config/studioConfig';
import { HeaderToolbar } from './components/HeaderToolbar';
import { AgentIngestionDock } from './components/AgentIngestionDock';
import { PackagingViewport } from './components/PackagingViewport';
import { PreflightAuditDock } from './components/PreflightAuditDock';
import { ContractModal } from './components/ContractModal';

export default function App() {
  const [lang, setLang] = useState<Language>('EN');

  const [contract, setContract] = useState<PackagingContract>(() =>
    structuredClone(INITIAL_AGENT_CONTRACT)
  );

  const [ingestionMeta, setIngestionMeta] = useState<IngestionMetadata>({
    agentId: 'AGENT_AN_v4.2',
    batchId: 'AN-PKG-5888',
    ingestedAt: 'SYNC_OK // 00:00:02s',
    overrideCount: 0,
  });

  const [layers, setLayers] = useState<CadLayerVisibility>(() =>
    structuredClone(DEFAULT_CAD_LAYERS)
  );

  const [activeSubstrate, setActiveSubstrate] =
    useState<SubstratePresetId>('CCNB_EFLUTE_MATTE');
  const [customPbrPack, setCustomPbrPack] = useState<AgentAnPbrTexturePack>(() =>
    structuredClone(DEFAULT_AGENT_AN_PBR_PACK)
  );

  const [isVectorCraftRunning, setIsVectorCraftRunning] = useState(false);
  const [vectorCraftLog, setVectorCraftLog] = useState<string | null>(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [modalMode, setModalMode] = useState<'JSON_EXPORT' | 'PDFX_REPORT' | null>(null);
  const [lastGeneratedTicket, setLastGeneratedTicket] =
    useState<ProductionJobTicket | null>(null);

  // Collapsible Sidebar Docks & Full Canvas Focus Mode State
  const [isLeftDockCollapsed, setIsLeftDockCollapsed] = useState<boolean>(false);
  const [isRightDockCollapsed, setIsRightDockCollapsed] = useState<boolean>(false);

  const handleToggleFullFocusMode = () => {
    const bothCollapsed = isLeftDockCollapsed && isRightDockCollapsed;
    setIsLeftDockCollapsed(!bothCollapsed);
    setIsRightDockCollapsed(!bothCollapsed);
  };

  const incrementOverrideCounter = () => {
    setIngestionMeta((prev) => ({
      ...prev,
      overrideCount: prev.overrideCount + 1,
    }));
  };

  // Switch Artwork Mode from HeaderToolbar (reads defaultSubstrate from studioConfig.ts)
  const handleSelectArtworkType = (type: ArtworkType) => {
    setContract((prev) => ({
      ...prev,
      product: {
        ...prev.product,
        artworkType: type,
      },
    }));

    const modeConfig = ARTWORK_MODE_OPTIONS.find((m) => m.id === type);
    if (modeConfig && activeSubstrate !== 'AGENT_AN_CUSTOM_PBR') {
      setActiveSubstrate(modeConfig.defaultSubstrate);
    }
  };

  // Update Product Core Text Fields (Quick Override)
  const handleUpdateProductField = (
    field: 'model' | 'category' | 'brand',
    value: string
  ) => {
    incrementOverrideCounter();
    setContract((prev) => ({
      ...prev,
      product: {
        ...prev.product,
        [field]: value,
      },
    }));
  };

  // Update Dieline Dimensions (L, W, H, Bleed)
  const handleUpdateDimension = (field: keyof ProductDimensions, value: number) => {
    incrementOverrideCounter();
    setContract((prev) => {
      const nextDims = {
        ...prev.product.dimensions,
        [field]: value,
      };
      return {
        ...prev,
        product: {
          ...prev.product,
          dimensions: nextDims,
        },
        preflight: {
          ...prev.preflight,
          bleedPass: nextDims.bleed_mm >= 2.0,
        },
      };
    });
  };

  // Update Required Technical Specs
  const handleUpdateTechSpec = (
    id: string,
    field: 'label' | 'value',
    value: string
  ) => {
    incrementOverrideCounter();
    setContract((prev) => {
      const updatedSpecs = prev.technicalSpecs.map((spec) =>
        spec.id === id ? { ...spec, [field]: value } : spec
      );
      const barcodeVal =
        updatedSpecs.find((s) => s.id === 'barcode')?.value || '';
      const eanResult = evaluateEan13(barcodeVal);

      return {
        ...prev,
        technicalSpecs: updatedSpecs,
        preflight: {
          ...prev.preflight,
          barcodeVerified: eanResult.isChecksumMatch,
        },
      };
    });
  };

  // Update Dynamic Extension Specs
  const handleUpdateDynamicSpec = (
    id: string,
    field: 'label' | 'value',
    value: string
  ) => {
    incrementOverrideCounter();
    setContract((prev) => ({
      ...prev,
      dynamicSpecs: prev.dynamicSpecs.map((spec) =>
        spec.id === id ? { ...spec, [field]: value } : spec
      ),
    }));
  };

  // Add Dynamic Spec Field
  const handleAddDynamicSpec = (label: string, value: string) => {
    incrementOverrideCounter();
    const newId = `dyn_${Date.now().toString(36)}`;
    setContract((prev) => ({
      ...prev,
      dynamicSpecs: [...prev.dynamicSpecs, { id: newId, label, value }],
    }));
  };

  // Remove Dynamic Spec Field
  const handleRemoveDynamicSpec = (id: string) => {
    incrementOverrideCounter();
    setContract((prev) => ({
      ...prev,
      dynamicSpecs: prev.dynamicSpecs.filter((s) => s.id !== id),
    }));
  };

  // Update KSP Node
  const handleUpdateKsp = (
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      status: 'READY' | 'PENDING_AGENT_DRAW';
      iconSvg: string | null;
    }>
  ) => {
    incrementOverrideCounter();
    setContract((prev) => ({
      ...prev,
      keySellingPoints: prev.keySellingPoints.map((ksp) =>
        ksp.id === id ? { ...ksp, ...patch } : ksp
      ),
    }));
  };

  // Trigger VectorCraft MCP Agent An Draw Pipeline
  const handleTriggerVectorCraft = () => {
    setIsVectorCraftRunning(true);
    setVectorCraftLog('MCP::DISPATCH -> AGENT_AN // TRACING_BEZIER_PATHS...');

    setTimeout(() => {
      setContract((prev) => ({
        ...prev,
        keySellingPoints: prev.keySellingPoints.map((ksp, idx) => {
          if (ksp.status === 'PENDING_AGENT_DRAW' || !ksp.iconSvg) {
            return {
              ...ksp,
              status: 'READY',
              iconSvg: selectVectorCraftSvg(ksp.title, idx),
            };
          }
          return ksp;
        }),
        preflight: {
          ...prev.preflight,
          fontOutlined: true,
        },
      }));
      setIsVectorCraftRunning(false);
      setVectorCraftLog('MCP::AGENT_AN -> 100% KSP VECTORS VERIFIED');
    }, 450);
  };

  // Toggle CAD Layer visibility
  const handleToggleLayer = (layer: CadLayerId) => {
    setLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  };

  // Update Agent An Custom PBR Asset Pack
  const handleUpdateCustomPbrPack = (patch: Partial<AgentAnPbrTexturePack>) => {
    setCustomPbrPack((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  // Toggle Preflight rule
  const handleTogglePreflightRule = (key: PreflightRuleId) => {
    setContract((prev) => ({
      ...prev,
      preflight: {
        ...prev.preflight,
        [key]: !prev.preflight[key],
      },
    }));
  };

  // Run full Preflight Verification & Auto-Remediate
  const handleRunPreflightScan = () => {
    setContract((prev) => {
      const barcodeSpec = prev.technicalSpecs.find((s) => s.id === 'barcode');
      const ean = evaluateEan13(barcodeSpec?.value || '');
      const fixedSpecs = prev.technicalSpecs.map((s) =>
        s.id === 'barcode' && ean.expectedCheckDigit !== null
          ? { ...s, value: `${ean.cleaned.slice(0, 12)}${ean.expectedCheckDigit}` }
          : s
      );

      const fixedKsps = prev.keySellingPoints.map((ksp, idx) =>
        ksp.iconSvg
          ? { ...ksp, status: 'READY' as const }
          : {
              ...ksp,
              status: 'READY' as const,
              iconSvg: selectVectorCraftSvg(ksp.title, idx),
            }
      );

      return {
        ...prev,
        product: {
          ...prev.product,
          dimensions: {
            ...prev.product.dimensions,
            bleed_mm: Math.max(3.0, prev.product.dimensions.bleed_mm),
          },
        },
        technicalSpecs: fixedSpecs,
        keySellingPoints: fixedKsps,
        preflight: {
          cmykColorSpace: true,
          diecutOverprint: true,
          barcodeVerified: true,
          bleedPass: true,
          fontOutlined: true,
        },
      };
    });
    setLayers((prev) => ({ ...prev, diecut: true, crease: true, bleed: true }));
    setVectorCraftLog('PREFLIGHT::AUTO_REMEDIATION -> ALL 5 RULES LOCKED');
  };

  // Ingest New Agent An JSON Contract
  const handleImportContract = (updated: PackagingContract, sourceLabel?: string) => {
    setContract(structuredClone(updated));
    setIngestionMeta({
      agentId: 'AGENT_AN_v4.2',
      batchId: sourceLabel || `AN-PKG-${updated.product.model}`,
      ingestedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      overrideCount: 0,
    });
    setVectorCraftLog(`INGESTED::${updated.product.brand}_${updated.product.model}`);
  };

  // Download JSON Contract File
  const handleDownloadJsonFile = () => {
    const payload = JSON.stringify(contract, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contract.product.brand}_${contract.product.model}_${contract.product.artworkType}_Contract.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download Production CAD Dieline SVG
  const handleDownloadDielineSvg = () => {
    const svgEl = document.querySelector('main svg');
    if (!svgEl) {
      handleDownloadJsonFile();
      return;
    }
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contract.product.brand}_${contract.product.model}_DIELINE_PDFX.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate Production PDF/X Job Ticket
  const handleGeneratePdfX = () => {
    setIsGeneratingPdf(true);
    const { length_mm: L, width_mm: W, height_mm: H, bleed_mm: B } =
      contract.product.dimensions;
    const glueFlap = Math.max(30, Math.round(W * 0.11));
    const topTuckH = Math.round(W * 0.85);
    const tuckTongueH = Math.round(W * 0.2);
    const bottomFlapH = Math.round(W * 0.65);

    const flatW = glueFlap + W + L + W + L + B * 2;
    const flatH = topTuckH + tuckTongueH + H + bottomFlapH + B * 2;
    const areaM2 = (flatW * flatH) / 1_000_000;

    const substrateSpec = SUBSTRATE_MATERIAL_CONFIG[activeSubstrate];
    const effectiveGsm =
      activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
        ? customPbrPack.gsm
        : substrateSpec.gsm;

    setTimeout(() => {
      const ticket: ProductionJobTicket = {
        jobId: `CTP-${contract.product.model}-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        surfaceAreaM2: areaM2.toFixed(4),
        weightGrams: Math.round(areaM2 * effectiveGsm),
        substrateCode: substrateSpec.shortCode,
      };
      setLastGeneratedTicket(ticket);
      setIsGeneratingPdf(false);
      setModalMode('PDFX_REPORT');
    }, 450);
  };

  // Reset Studio to Initial Agent Contract
  const handleResetStudio = () => {
    setContract(structuredClone(INITIAL_AGENT_CONTRACT));
    setLayers(structuredClone(DEFAULT_CAD_LAYERS));
    setActiveSubstrate('CCNB_EFLUTE_MATTE');
    setCustomPbrPack(structuredClone(DEFAULT_AGENT_AN_PBR_PACK));
    setIngestionMeta({
      agentId: 'AGENT_AN_v4.2',
      batchId: 'AN-PKG-5888',
      ingestedAt: 'RESET_FACTORY_OK',
      overrideCount: 0,
    });
    setVectorCraftLog(null);
    setLastGeneratedTicket(null);
  };

  return (
    <div className="h-screen w-screen bg-[#05050A] text-white flex flex-col overflow-hidden select-none">
      {/* GLOBAL HEADER TOOLBAR */}
      <HeaderToolbar
        lang={lang}
        activeArtworkType={contract.product.artworkType}
        onToggleLanguage={() => setLang((prev) => (prev === 'EN' ? 'VI' : 'EN'))}
        onSelectArtworkType={handleSelectArtworkType}
        onOpenContractModal={() => setModalMode('JSON_EXPORT')}
        onResetStudio={handleResetStudio}
      />

      {/* MAIN 3-COLUMN CAD WORKBENCH CONSOLE */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* COLUMN 1: [ 01 // AGENT_INGESTION_&_OVERRIDE_DOCK ] */}
        {!isLeftDockCollapsed ? (
          <div className="relative flex h-full shrink-0">
            <AgentIngestionDock
              lang={lang}
              contract={contract}
              ingestionMeta={ingestionMeta}
              onOpenLoadContractModal={() => setModalMode('JSON_EXPORT')}
              onUpdateProductField={handleUpdateProductField}
              onUpdateDimension={handleUpdateDimension}
              onUpdateTechSpec={handleUpdateTechSpec}
              onUpdateDynamicSpec={handleUpdateDynamicSpec}
              onAddDynamicSpec={handleAddDynamicSpec}
              onRemoveDynamicSpec={handleRemoveDynamicSpec}
              onUpdateKsp={handleUpdateKsp}
              onTriggerVectorCraft={handleTriggerVectorCraft}
              isVectorCraftRunning={isVectorCraftRunning}
              vectorCraftLog={vectorCraftLog}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsLeftDockCollapsed(false)}
            title="Expand Dock 01 (Agent Ingestion & Override)"
            className="w-7 h-full bg-[#0A0C14] hover:bg-[#0D0E17] border-r border-[#1F1F2E] hover:border-[#00E5FF] flex flex-col items-center justify-between py-3 text-[#8A8FA3] hover:text-[#00E5FF] transition-colors shrink-0 cursor-pointer z-30"
          >
            <span className="font-mono text-[10px] font-bold text-[#00E5FF]">▶</span>
            <span
              className="font-mono text-[10px] tracking-widest whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              [ ▶ EXPAND // 01_AGENT_DOCK ]
            </span>
            <span className="font-mono text-[10px] font-bold text-[#00E5FF]">▶</span>
          </button>
        )}

        {/* COLUMN 2: [ 02 // DIECUT_&_MOCKUP_VIEWPORT ] */}
        <PackagingViewport
          lang={lang}
          contract={contract}
          layers={layers}
          onToggleLayer={handleToggleLayer}
          activeSubstrate={activeSubstrate}
          onSelectSubstrate={setActiveSubstrate}
          customPbrPack={customPbrPack}
          onUpdateCustomPbrPack={handleUpdateCustomPbrPack}
          isLeftDockCollapsed={isLeftDockCollapsed}
          onToggleLeftDock={() => setIsLeftDockCollapsed((prev) => !prev)}
          isRightDockCollapsed={isRightDockCollapsed}
          onToggleRightDock={() => setIsRightDockCollapsed((prev) => !prev)}
          onToggleFullFocusMode={handleToggleFullFocusMode}
        />

        {/* COLUMN 3: [ 03 // PREFLIGHT_AUDIT_&_EXPORT ] */}
        {!isRightDockCollapsed ? (
          <div className="relative flex h-full shrink-0">
            <PreflightAuditDock
              lang={lang}
              contract={contract}
              layers={layers}
              activeSubstrate={activeSubstrate}
              customPbrPack={customPbrPack}
              onTogglePreflightRule={handleTogglePreflightRule}
              onRunPreflightScan={handleRunPreflightScan}
              onGeneratePdfX={handleGeneratePdfX}
              isGeneratingPdf={isGeneratingPdf}
              lastGeneratedTicket={lastGeneratedTicket}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsRightDockCollapsed(false)}
            title="Expand Dock 03 (Preflight Audit & Export)"
            className="w-7 h-full bg-[#0A0C14] hover:bg-[#0D0E17] border-l border-[#1F1F2E] hover:border-[#00E5FF] flex flex-col items-center justify-between py-3 text-[#8A8FA3] hover:text-[#00E5FF] transition-colors shrink-0 cursor-pointer z-30"
          >
            <span className="font-mono text-[10px] font-bold text-[#00E5FF]">◀</span>
            <span
              className="font-mono text-[10px] tracking-widest whitespace-nowrap"
              style={{ writingMode: 'vertical-rl' }}
            >
              [ ◀ EXPAND // 03_PREFLIGHT_QA ]
            </span>
            <span className="font-mono text-[10px] font-bold text-[#00E5FF]">◀</span>
          </button>
        )}
      </div>

      {/* AGENT CONTRACT INGESTION & PDF/X PRODUCTION TICKET MODAL */}
      {modalMode && (
        <ContractModal
          mode={modalMode}
          contract={contract}
          onClose={() => setModalMode(null)}
          onImportContract={handleImportContract}
          onDownloadJsonFile={handleDownloadJsonFile}
          onDownloadDielineSvg={handleDownloadDielineSvg}
          jobTicket={lastGeneratedTicket}
        />
      )}
    </div>
  );
}
