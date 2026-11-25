import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  FileCheck2,
  Printer,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  AgentAnPbrTexturePack,
  CadLayerVisibility,
  Language,
  PackagingContract,
  PreflightRuleId,
  ProductionJobTicket,
  SubstratePresetId,
} from '../types/packaging';
import {
  INK_SEPARATION_PLATES,
  PREFLIGHT_RULE_CONFIG,
  SUBSTRATE_MATERIAL_CONFIG,
  computeFlatSheetCalibration,
  countContractOverflows,
  evaluateEan13,
  getTranslation,
} from '../config/studioConfig';

interface PreflightAuditDockProps {
  lang: Language;
  contract: PackagingContract;
  layers: CadLayerVisibility;
  activeSubstrate: SubstratePresetId;
  customPbrPack: AgentAnPbrTexturePack;
  onTogglePreflightRule: (key: PreflightRuleId) => void;
  onRunPreflightScan: () => void;
  onGeneratePdfX: () => void;
  isGeneratingPdf: boolean;
  lastGeneratedTicket: ProductionJobTicket | null;
  onCollapse?: () => void;
}

export const PreflightAuditDock: React.FC<PreflightAuditDockProps> = ({
  lang,
  contract,
  layers,
  activeSubstrate,
  customPbrPack,
  onTogglePreflightRule,
  onRunPreflightScan,
  onGeneratePdfX,
  isGeneratingPdf,
  lastGeneratedTicket,
  onCollapse,
}) => {
  const t = getTranslation(lang).col3;

  // Collapsed by default so Primary CTA is always visible without scrolling
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const [showLiveJson, setShowLiveJson] = useState(false);

  const { length_mm: L, width_mm: W, height_mm: H, bleed_mm: B } = contract.product.dimensions;

  const barcodeSpec = contract.technicalSpecs.find((s) => s.id === 'barcode');
  const eanCheck = evaluateEan13(barcodeSpec?.value || '');
  const overflowCount = countContractOverflows(contract);
  const allKspVectorReady = contract.keySellingPoints.every(
    (k) => k.status === 'READY' && Boolean(k.iconSvg)
  );

  // Dynamically evaluate each preflight rule defined in studioConfig.ts
  const evaluateRulePass = (ruleId: PreflightRuleId): boolean => {
    const manualState = contract.preflight[ruleId];
    if (!manualState) return false;
    if (ruleId === 'diecutOverprint') return layers.diecut;
    if (ruleId === 'barcodeVerified') return eanCheck.isChecksumMatch;
    if (ruleId === 'bleedPass') return B >= 2.0;
    if (ruleId === 'fontOutlined') return allKspVectorReady && overflowCount === 0;
    return true;
  };

  const evaluatedRules = PREFLIGHT_RULE_CONFIG.map((rule) => {
    const pass = evaluateRulePass(rule.id);
    return {
      ...rule,
      pass,
      detail: pass ? rule.detailPass[lang] : rule.detailFail[lang],
    };
  });

  const passCount = evaluatedRules.filter((r) => r.pass).length;
  const allPassed = passCount === evaluatedRules.length;

  // Live Telemetry Math (Calibrated per SCB-6119 FEFCO 0201 RSC vs Handle + 1-2-3 Snap Gift Box)
  const flatCal = computeFlatSheetCalibration(contract);
  const flatSheetW = flatCal.flatWidthMm;
  const flatSheetH = flatCal.flatHeightMm;
  const surfaceAreaM2 = (flatSheetW * flatSheetH) / 1_000_000;

  const baseSubstrateSpec = SUBSTRATE_MATERIAL_CONFIG[activeSubstrate];
  const effectiveGsm =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR' ? customPbrPack.gsm : baseSubstrateSpec.gsm;
  const effectiveRoughness =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.roughness
      : baseSubstrateSpec.roughness;
  const effectiveMetalness =
    activeSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.metalness
      : baseSubstrateSpec.metalness;

  const estimatedWeightGrams = Math.round(surfaceAreaM2 * effectiveGsm);
  const activeLayerCount = Object.values(layers).filter(Boolean).length;

  return (
    <aside className="w-[340px] shrink-0 h-full bg-[#09090b] border-l border-[#27272a] flex flex-col select-none shadow-2xl">
      {/* Column Header */}
      <div className="h-10 px-3.5 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck size={15} strokeWidth={1.5} className="text-[#71717a] shrink-0" />
          <span className="font-mono text-xs font-semibold tracking-wider text-zinc-100 truncate">
            {t.header}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {allPassed ? (
            <span className="px-1.5 py-0.5 bg-[#06b6d4]/10 border border-[#06b6d4]/70 font-mono text-[10px] font-semibold text-[#00f0ff] whitespace-nowrap">
              {t.statusReady}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 bg-[#09090b] border border-[#EF4444] font-mono text-[10px] font-semibold text-[#EF4444] whitespace-nowrap">
              [ {passCount}/{evaluatedRules.length} {t.statusPassSuffix} ]
            </span>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse Preflight Panel"
              className="w-6 h-6 bg-[#09090b] hover:bg-[#27272a] border border-[#27272a] text-[#71717a] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#27272a]">
        {/* ====================================================================
            SECTION 03.A: CONFIG-DRIVEN PRE-FLIGHT CHECKLIST
            ==================================================================== */}
        <section className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold text-zinc-300 tracking-wide">
              {t.checklistHeader}
            </span>
            <button
              type="button"
              onClick={onRunPreflightScan}
              className="px-2 py-0.5 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#27272a] font-mono text-[10px] text-zinc-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.reverifyBtn}
            </button>
          </div>

          <div className="space-y-1.5">
            {evaluatedRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => onTogglePreflightRule(rule.id)}
                title="Click to toggle hardware rule interlock"
                className={`w-full text-left p-2 bg-[#18181b] border transition-colors cursor-pointer ${
                  rule.pass
                    ? 'border-[#27272a] hover:border-[#3f3f46]'
                    : 'border-[#EF4444]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono text-xs font-bold shrink-0 ${
                        rule.pass ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {rule.pass ? '[ ✓ ]' : '[ ! ]'}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-zinc-100 truncate">
                      {rule.code} // {rule.label[lang]}
                    </span>
                  </div>
                  {rule.pass ? (
                    <Check size={15} strokeWidth={1.5} className="text-[#10B981] shrink-0" />
                  ) : (
                    <X size={15} strokeWidth={1.5} className="text-[#EF4444] shrink-0" />
                  )}
                </div>
                <div className="mt-0.5 pl-9 font-mono text-[10px] text-[#71717a] truncate">
                  {rule.detail}
                </div>
              </button>
            ))}
          </div>

          {/* Compact Telemetry Summary Strip */}
          <div className="grid grid-cols-3 gap-1.5 pt-1 font-mono text-[10px] tabular-nums">
            <div className="bg-[#18181b] border border-[#27272a] px-2 py-1.5">
              <div className="text-[#71717a] text-[9px] truncate">{t.surfaceArea}</div>
              <div className="text-zinc-100 font-semibold">{surfaceAreaM2.toFixed(3)} m²</div>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] px-2 py-1.5">
              <div className="text-[#71717a] text-[9px] truncate">{t.boardWeight}</div>
              <div className="text-[#10B981] font-semibold">{estimatedWeightGrams} g</div>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] px-2 py-1.5">
              <div className="text-[#71717a] text-[9px] truncate">TAC_INK</div>
              <div className="text-zinc-100 font-semibold">248%</div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            COLLAPSIBLE ACCORDION: [ ▸ TELEMETRY_DETAILS & INK_SEPARATIONS ]
            ==================================================================== */}
        <section className="bg-[#09090b]">
          <button
            type="button"
            onClick={() => setShowTelemetryDetails((v) => !v)}
            className={`w-full h-9 px-3.5 flex items-center justify-between text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
              showTelemetryDetails
                ? 'bg-[#18181b] text-white border-b border-[#27272a]'
                : 'bg-[#09090b] text-zinc-300 hover:bg-[#18181b] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {showTelemetryDetails ? (
                <ChevronDown size={15} strokeWidth={1.5} className="text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight size={15} strokeWidth={1.5} className="text-[#71717a] shrink-0" />
              )}
              <span className="truncate">
                [ {showTelemetryDetails ? '▾' : '▸'} {t.telemetryAccordion} ]
              </span>
            </div>
          </button>

          {showTelemetryDetails && (
            <div className="p-3.5 space-y-2.5">
              <div className="bg-[#18181b] border border-[#27272a] p-3 font-mono text-xs space-y-2 tabular-nums">
                <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                  <span className="text-[#71717a]">{t.surfaceArea}:</span>
                  <span className="text-zinc-100 font-semibold">
                    {surfaceAreaM2.toFixed(4)} m²
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                  <span className="text-[#71717a]">{t.sheetExtents}:</span>
                  <span className="text-zinc-200">
                    {flatSheetW.toFixed(0)} × {flatSheetH.toFixed(0)} mm
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                  <span className="text-[#71717a]">{t.substrateGrade}:</span>
                  <span className="text-zinc-200 text-[11px]">{baseSubstrateSpec.shortCode}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                  <span className="text-[#71717a]">{t.pbrOptics}:</span>
                  <span className="text-zinc-200 text-[11px]">
                    R:{effectiveRoughness.toFixed(2)} / M:{effectiveMetalness.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                  <span className="text-[#71717a]">{t.boardWeight}:</span>
                  <span className="text-[#10B981] font-semibold">
                    {estimatedWeightGrams} g ({effectiveGsm} GSM)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#71717a]">{t.activeLayers}:</span>
                  <span className="text-zinc-200">
                    0{activeLayerCount} / 05 CAD
                  </span>
                </div>
              </div>

              {/* Config-Driven Ink Separation Plates Bar */}
              <div className="bg-[#18181b] border border-[#27272a] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] text-[#71717a]">
                  <span>{t.tacLabel}</span>
                  <span className="text-zinc-200">248% (MAX 300%)</span>
                </div>
                <div className="grid grid-cols-6 gap-1 font-mono text-[9px] text-center">
                  {INK_SEPARATION_PLATES.map((plate) => (
                    <div
                      key={plate.code}
                      className="bg-[#09090b] border py-1"
                      style={{
                        borderColor: plate.border,
                        color: plate.text,
                      }}
                    >
                      {plate.code}:{plate.density}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ====================================================================
            COLLAPSIBLE ACCORDION: [ ▸ RAW_AGENT_CONTRACT_JSON ]
            ==================================================================== */}
        <section className="bg-[#09090b]">
          <button
            type="button"
            onClick={() => setShowLiveJson((v) => !v)}
            className={`w-full h-9 px-3.5 flex items-center justify-between text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
              showLiveJson
                ? 'bg-[#18181b] text-white border-b border-[#27272a]'
                : 'bg-[#09090b] text-zinc-300 hover:bg-[#18181b] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {showLiveJson ? (
                <ChevronDown size={15} strokeWidth={1.5} className="text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight size={15} strokeWidth={1.5} className="text-[#71717a] shrink-0" />
              )}
              <Code2 size={15} strokeWidth={1.5} className="text-[#71717a] shrink-0" />
              <span className="truncate">
                [ {showLiveJson ? '▾' : '▸'} {t.contractAccordion} ]
              </span>
            </div>
          </button>

          {showLiveJson && (
            <div className="p-3.5">
              <pre className="p-2.5 bg-[#18181b] border border-[#27272a] font-mono text-[10px] text-zinc-300 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(contract, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {lastGeneratedTicket && (
          <section className="p-3.5">
            <div className="p-2.5 bg-[#18181b] border border-[#06b6d4]/60 space-y-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between text-[#00f0ff] font-semibold">
                <span className="flex items-center gap-1">
                  <FileCheck2 size={15} strokeWidth={1.5} />
                  PDF/X-4 MASTER COMPILED
                </span>
                <span>{lastGeneratedTicket.jobId}</span>
              </div>
              <div className="text-[#71717a] flex items-center justify-between tabular-nums">
                <span>AREA: {lastGeneratedTicket.surfaceAreaM2}m²</span>
                <span>WT: {lastGeneratedTicket.weightGrams}g</span>
                <span>{lastGeneratedTicket.timestamp}</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* PERSISTENT PRIMARY CTA FOOTER */}
      <div className="p-3.5 border-t border-[#27272a] bg-[#18181b] space-y-2 shrink-0">
        {overflowCount > 0 && (
          <div className="px-2.5 py-1.5 bg-[#09090b] border border-[#EF4444] flex items-center gap-2 font-mono text-[10px] text-[#EF4444]">
            <AlertTriangle size={15} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">
              {t.overflowGateAlert} ({overflowCount})
            </span>
          </div>
        )}

        {!allPassed && overflowCount === 0 && (
          <div className="px-2.5 py-1.5 bg-[#09090b] border border-[#EF4444] flex items-center gap-2 font-mono text-[10px] text-[#EF4444]">
            <AlertTriangle size={15} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">
              {evaluatedRules.length - passCount} {t.warnPreflight}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onGeneratePdfX}
          disabled={isGeneratingPdf}
          className="w-full h-10 bg-zinc-100 hover:bg-white text-[#09090b] border border-zinc-200 font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
        >
          {isGeneratingPdf ? (
            <>
              <RefreshCw size={15} strokeWidth={1.5} className="animate-spin" />
              <span>{t.compilingCta}</span>
            </>
          ) : (
            <>
              <Printer size={15} strokeWidth={1.5} />
              <span>{t.generateCta}</span>
              <Download size={15} strokeWidth={1.5} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
