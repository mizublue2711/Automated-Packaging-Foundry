import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Lock,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  IngestionMetadata,
  Language,
  PackagingContract,
  ProductDimensions,
} from '../types/packaging';
import {
  OVERFLOW_THRESHOLDS,
  VECTORCRAFT_ICON_TEMPLATES,
  evaluateEan13,
  getTranslation,
  selectVectorCraftSvg,
} from '../config/studioConfig';

interface AgentIngestionDockProps {
  lang: Language;
  contract: PackagingContract;
  ingestionMeta: IngestionMetadata;
  onOpenLoadContractModal: () => void;
  onUpdateProductField: (field: 'model' | 'category' | 'brand', value: string) => void;
  onUpdateDimension: (field: keyof ProductDimensions, value: number) => void;
  onUpdateTechSpec: (id: string, field: 'label' | 'value', value: string) => void;
  onUpdateDynamicSpec: (id: string, field: 'label' | 'value', value: string) => void;
  onAddDynamicSpec: (label: string, value: string) => void;
  onRemoveDynamicSpec: (id: string) => void;
  onUpdateKsp: (
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      status: 'READY' | 'PENDING_AGENT_DRAW';
      iconSvg: string | null;
    }>
  ) => void;
  onTriggerVectorCraft: () => void;
  isVectorCraftRunning: boolean;
  vectorCraftLog: string | null;
}

type AccordionKey = 'structure' | 'specs' | 'ksp';

export const AgentIngestionDock: React.FC<AgentIngestionDockProps> = ({
  lang,
  contract,
  ingestionMeta,
  onOpenLoadContractModal,
  onUpdateProductField,
  onUpdateDimension,
  onUpdateTechSpec,
  onUpdateDynamicSpec,
  onAddDynamicSpec,
  onRemoveDynamicSpec,
  onUpdateKsp,
  onTriggerVectorCraft,
  isVectorCraftRunning,
  vectorCraftLog,
}) => {
  const fullT = getTranslation(lang);
  const t = fullT.col1;

  // Collapsible Accordion state memory
  const [expanded, setExpanded] = useState<Record<AccordionKey, boolean>>({
    structure: true,
    specs: true,
    ksp: true,
  });

  // Read-only inspector lock for 01.A Base Structure
  const [isStructureQuickEdit, setIsStructureQuickEdit] = useState<boolean>(false);

  // Track which spec ID is currently focused for quick inline override
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [editingKspId, setEditingKspId] = useState<string | null>(null);

  const [showAddSpecForm, setShowAddSpecForm] = useState(false);
  const [newSpecLabel, setNewSpecLabel] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');

  const toggleSection = (key: AccordionKey) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const barcodeSpec = contract.technicalSpecs.find((s) => s.id === 'barcode');
  const eanAudit = evaluateEan13(barcodeSpec?.value || '');

  const pendingKspCount = contract.keySellingPoints.filter(
    (k) => k.status === 'PENDING_AGENT_DRAW' || !k.iconSvg
  ).length;

  // Text Overflow Gatekeeper Evaluators
  const isModelOverflow =
    contract.product.model.length > OVERFLOW_THRESHOLDS.modelMaxChars;
  const isBrandOverflow =
    contract.product.brand.length > OVERFLOW_THRESHOLDS.brandMaxChars;
  const isCategoryOverflow =
    contract.product.category.length > OVERFLOW_THRESHOLDS.categoryMaxChars;

  const getLocalizedSpecTitle = (specId: string, fallbackLabel: string): string => {
    if (specId === 'voltage') return t.coreSpecs.voltage;
    if (specId === 'power') return t.coreSpecs.power;
    if (specId === 'capacity') return t.coreSpecs.capacity;
    if (specId === 'barcode') return t.coreSpecs.barcode;
    return fallbackLabel;
  };

  const handleConfirmAddSpec = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel =
      newSpecLabel.trim() ||
      (lang === 'VI'
        ? `Thông số #${contract.dynamicSpecs.length + 1}`
        : `Spec #${contract.dynamicSpecs.length + 1}`);
    const cleanValue = newSpecValue.trim() || 'IEC-60335';
    onAddDynamicSpec(cleanLabel, cleanValue);
    setNewSpecLabel('');
    setNewSpecValue('');
    setShowAddSpecForm(false);
  };

  const handleCycleKspVector = (id: string, currentSvg: string | null) => {
    const svgList = Object.values(VECTORCRAFT_ICON_TEMPLATES);
    const currentIndex = currentSvg ? svgList.indexOf(currentSvg) : -1;
    const nextSvg = svgList[(currentIndex + 1) % svgList.length];
    onUpdateKsp(id, {
      iconSvg: nextSvg,
      status: 'READY',
    });
  };

  return (
    <aside className="w-[385px] shrink-0 h-full bg-[#0A0C14] border-r border-[#1F1F2E] flex flex-col select-none">
      {/* Column 1 Header */}
      <div className="h-10 px-3.5 border-b border-[#1F1F2E] bg-[#0D0E17] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders size={16} strokeWidth={1.25} className="text-[#00E5FF] shrink-0" />
          <span className="font-mono text-xs font-semibold tracking-wider text-white truncate">
            {t.header}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            const allOpen = expanded.structure && expanded.specs && expanded.ksp;
            setExpanded({
              structure: !allOpen,
              specs: !allOpen,
              ksp: !allOpen,
            });
          }}
          className="px-1.5 py-0.5 bg-[#05050A] border border-[#1F1F2E] hover:border-[#00E5FF] font-mono text-[10px] text-[#8A8FA3] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {expanded.structure && expanded.specs && expanded.ksp ? '[-ALL]' : '[+ALL]'}
        </button>
      </div>

      {/* Top Ingestion Telemetry Banner & Load Contract Action */}
      <div className="p-3 bg-[#05050A] border-b border-[#1F1F2E] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 bg-[#10B981] inline-block shrink-0" />
            <span className="font-mono text-[10px] font-semibold text-[#10B981] truncate">
              {t.ingestionBanner}
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#8A8FA3] tabular-nums shrink-0">
            {ingestionMeta.ingestedAt}
          </span>
        </div>

        <div className="flex items-center justify-between font-mono text-[10px] text-[#8A8FA3] tabular-nums">
          <span>BATCH: {ingestionMeta.batchId}</span>
          <span className="text-[#00E5FF]">OVERRIDES: {ingestionMeta.overrideCount}</span>
        </div>

        <button
          type="button"
          onClick={onOpenLoadContractModal}
          className="w-full h-8 px-3 bg-[#0D0E17] hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#05050A] border border-[#00E5FF] font-mono text-[11px] font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Upload size={16} strokeWidth={1.25} />
          <span>{t.loadNewContractBtn}</span>
        </button>
      </div>

      {/* Scrollable Accordion Stack */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1F1F2E]">
        {/* ====================================================================
            ACCORDION 01.A: [ ▾ 01.A // BASE_STRUCTURE_INSPECTOR ]
            ==================================================================== */}
        <section className="bg-[#0A0C14]">
          <button
            type="button"
            onClick={() => toggleSection('structure')}
            className={`w-full h-9 px-3.5 flex items-center justify-between text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
              expanded.structure
                ? 'bg-[#0D0E17] text-[#00E5FF] border-b border-[#1F1F2E]'
                : 'bg-[#0A0C14] text-white hover:bg-[#0D0E17]'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expanded.structure ? (
                <ChevronDown size={16} strokeWidth={1.25} className="text-[#00E5FF] shrink-0" />
              ) : (
                <ChevronRight size={16} strokeWidth={1.25} className="text-[#8A8FA3] shrink-0" />
              )}
              <span className="truncate">
                [ {expanded.structure ? '▾' : '▸'} {t.accStructure} ]
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#8A8FA3] tabular-nums shrink-0 ml-2">
              {contract.product.dimensions.length_mm}×{contract.product.dimensions.width_mm}×
              {contract.product.dimensions.height_mm}
            </span>
          </button>

          {expanded.structure && (
            <div className="p-3.5 space-y-2.5">
              {/* Inspector Header Bar with [ Quick Edit ] Toggle */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#8A8FA3] flex items-center gap-1">
                  {isStructureQuickEdit ? (
                    <>
                      <Edit3 size={13} strokeWidth={1.25} className="text-[#00E5FF]" />
                      <span className="text-[#00E5FF]">{t.editingTag}</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} strokeWidth={1.25} className="text-[#8A8FA3]" />
                      <span>{t.readOnlyTag}</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setIsStructureQuickEdit((v) => !v)}
                  className={`px-2 py-0.5 border font-mono text-[10px] transition-colors cursor-pointer whitespace-nowrap ${
                    isStructureQuickEdit
                      ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF] font-semibold'
                      : 'bg-[#0D0E17] text-[#00E5FF] border-[#2D2D44] hover:border-[#00E5FF]'
                  }`}
                >
                  {isStructureQuickEdit ? t.lockReadOnlyBtn : t.quickEditBtn}
                </button>
              </div>

              {/* Read-Only Overview vs Quick Edit Inputs */}
              {!isStructureQuickEdit ? (
                <div className="bg-[#05050A] border border-[#1F1F2E] divide-y divide-[#1F1F2E] font-mono text-xs">
                  <div className="px-2.5 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-[#8A8FA3]">{t.modelId}</span>
                    <span className="text-white font-semibold tabular-nums">
                      {contract.product.model}
                    </span>
                  </div>
                  <div className="px-2.5 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-[#8A8FA3]">{t.brandEntity}</span>
                    <span className="text-[#00E5FF] font-semibold">
                      {contract.product.brand}
                    </span>
                  </div>
                  <div className="px-2.5 py-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[#8A8FA3] shrink-0">{t.categoryDesc}</span>
                    <span className="text-white text-[11px] truncate">
                      {contract.product.category}
                    </span>
                  </div>
                  <div className="px-2.5 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-[#8A8FA3]">L × W × H (BLEED)</span>
                    <span className="text-[#10B981] tabular-nums">
                      {contract.product.dimensions.length_mm} ×{' '}
                      {contract.product.dimensions.width_mm} ×{' '}
                      {contract.product.dimensions.height_mm} mm (+
                      {contract.product.dimensions.bleed_mm.toFixed(1)}mm)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 bg-[#05050A] border border-[#00E5FF] p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center justify-between font-mono text-[9px] text-[#8A8FA3] mb-1">
                        <span>{t.modelId}</span>
                        <span>
                          {contract.product.model.length}/{OVERFLOW_THRESHOLDS.modelMaxChars}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={contract.product.model}
                        onChange={(e) => onUpdateProductField('model', e.target.value)}
                        className={`w-full h-7 px-2 bg-[#0D0E17] border focus:outline-none font-mono text-xs text-white tabular-nums ${
                          isModelOverflow
                            ? 'border-[#EF4444]'
                            : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between font-mono text-[9px] text-[#8A8FA3] mb-1">
                        <span>{t.brandEntity}</span>
                        <span>
                          {contract.product.brand.length}/{OVERFLOW_THRESHOLDS.brandMaxChars}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={contract.product.brand}
                        onChange={(e) => onUpdateProductField('brand', e.target.value)}
                        className={`w-full h-7 px-2 bg-[#0D0E17] border focus:outline-none font-mono text-xs text-white ${
                          isBrandOverflow
                            ? 'border-[#EF4444]'
                            : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between font-mono text-[9px] text-[#8A8FA3] mb-1">
                      <span>{t.categoryDesc}</span>
                      <span>
                        {contract.product.category.length}/{OVERFLOW_THRESHOLDS.categoryMaxChars}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={contract.product.category}
                      onChange={(e) => onUpdateProductField('category', e.target.value)}
                      className={`w-full h-7 px-2 bg-[#0D0E17] border focus:outline-none text-xs text-white ${
                        isCategoryOverflow
                          ? 'border-[#EF4444]'
                          : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                      }`}
                    />
                  </div>

                  {/* Structural Geometry Matrix (L, W, H, Bleed) */}
                  <div>
                    <div className="font-mono text-[9px] text-[#8A8FA3] mb-1">
                      {t.dielineGeometry}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { key: 'length_mm', code: 'L (MM)', min: 80, max: 900, step: 5 },
                          { key: 'width_mm', code: 'W (MM)', min: 60, max: 800, step: 5 },
                          { key: 'height_mm', code: 'H (MM)', min: 80, max: 950, step: 5 },
                          { key: 'bleed_mm', code: 'BLEED', min: 0, max: 15, step: 0.5 },
                        ] as const
                      ).map((dim) => (
                        <div key={dim.key} className="bg-[#0D0E17] border border-[#1F1F2E] p-1">
                          <div className="font-mono text-[8px] text-[#8A8FA3] mb-0.5">
                            {dim.code}
                          </div>
                          <input
                            type="number"
                            min={dim.min}
                            max={dim.max}
                            step={dim.step}
                            value={contract.product.dimensions[dim.key]}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!Number.isNaN(val)) {
                                onUpdateDimension(dim.key, Math.max(0, val));
                              }
                            }}
                            className="w-full bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none px-1 py-0.5 font-mono text-xs text-white tabular-nums text-right"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Text Overflow Gatekeeper Alert for Section 01.A */}
              {(isModelOverflow || isBrandOverflow || isCategoryOverflow) && (
                <div className="px-2 py-1.5 bg-[#05050A] border border-[#EF4444] font-mono text-[10px] text-[#EF4444] font-semibold flex items-center justify-between">
                  <span>{fullT.overflowBadge}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ====================================================================
            ACCORDION 01.B: [ ▸ 01.B // TECHNICAL_SPECS_OVERRIDE ]
            ==================================================================== */}
        <section className="bg-[#0A0C14]">
          <button
            type="button"
            onClick={() => toggleSection('specs')}
            className={`w-full h-9 px-3.5 flex items-center justify-between text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
              expanded.specs
                ? 'bg-[#0D0E17] text-[#00E5FF] border-b border-[#1F1F2E]'
                : 'bg-[#0A0C14] text-white hover:bg-[#0D0E17]'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expanded.specs ? (
                <ChevronDown size={16} strokeWidth={1.25} className="text-[#00E5FF] shrink-0" />
              ) : (
                <ChevronRight size={16} strokeWidth={1.25} className="text-[#8A8FA3] shrink-0" />
              )}
              <span className="truncate">
                [ {expanded.specs ? '▾' : '▸'} {t.accSpecs} ]
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#8A8FA3] tabular-nums shrink-0 ml-2">
              [{contract.technicalSpecs.length + contract.dynamicSpecs.length}]
            </span>
          </button>

          {expanded.specs && (
            <div className="p-3.5 space-y-2.5">
              <div className="font-mono text-[9px] text-[#8A8FA3] flex items-center justify-between">
                <span>{t.clickToOverrideHint}</span>
                <span className="text-[#00E5FF]">MAX:{OVERFLOW_THRESHOLDS.specValueMaxChars}CH</span>
              </div>

              {/* Mandatory Technical Specs (Click value for quick inline edit) */}
              <div className="space-y-2">
                {contract.technicalSpecs.map((spec) => {
                  const isBarcode = spec.id === 'barcode';
                  const isEditingThis = editingSpecId === spec.id;
                  const maxAllowed = spec.maxChars || OVERFLOW_THRESHOLDS.specValueMaxChars;
                  const isValueOverflow = spec.value.length > maxAllowed;
                  const isLabelOverflow =
                    spec.label.length > OVERFLOW_THRESHOLDS.specLabelMaxChars;
                  const hasOverflow = isValueOverflow || isLabelOverflow;

                  return (
                    <div
                      key={spec.id}
                      className={`bg-[#0D0E17] border p-2 space-y-1.5 transition-colors ${
                        hasOverflow
                          ? 'border-[#EF4444]'
                          : isEditingThis
                          ? 'border-[#00E5FF]'
                          : 'border-[#1F1F2E] hover:border-[#2D2D44]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-[#00E5FF] font-semibold truncate">
                          {getLocalizedSpecTitle(spec.id, spec.label)}
                        </span>
                        <span className="font-mono text-[9px] text-[#8A8FA3] tabular-nums shrink-0">
                          {spec.value.length}/{maxAllowed}CH
                        </span>
                      </div>

                      {/* Click-to-override row */}
                      <div className="grid grid-cols-12 gap-1.5 items-center">
                        <input
                          type="text"
                          value={spec.label}
                          onFocus={() => setEditingSpecId(spec.id)}
                          onBlur={() => setEditingSpecId(null)}
                          onChange={(e) => onUpdateTechSpec(spec.id, 'label', e.target.value)}
                          className="col-span-5 h-7 px-2 bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none font-mono text-[11px] text-[#8A8FA3] focus:text-white"
                        />
                        <input
                          type="text"
                          value={spec.value}
                          onFocus={() => setEditingSpecId(spec.id)}
                          onBlur={() => setEditingSpecId(null)}
                          onChange={(e) => onUpdateTechSpec(spec.id, 'value', e.target.value)}
                          className={`col-span-7 h-7 px-2 bg-[#05050A] border focus:outline-none font-mono text-xs text-white tabular-nums ${
                            isValueOverflow
                              ? 'border-[#EF4444] text-[#EF4444]'
                              : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                          }`}
                        />
                      </div>

                      {/* Text Overflow Gatekeeper Warning Badge */}
                      {hasOverflow && (
                        <div className="px-2 py-1 bg-[#05050A] border border-[#EF4444] font-mono text-[9px] text-[#EF4444] font-bold">
                          {fullT.overflowBadge}
                        </div>
                      )}

                      {/* EAN-13 Checksum Gatekeeper */}
                      {isBarcode && (
                        <div className="pt-0.5 flex items-center justify-between text-[10px] font-mono">
                          {eanAudit.isChecksumMatch ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <CheckCircle2 size={13} strokeWidth={1.25} />
                              {t.eanChecksumPass} (CHK:{eanAudit.actualCheckDigit})
                            </span>
                          ) : (
                            <div className="flex items-center justify-between w-full gap-2">
                              <span className="text-[#EF4444] flex items-center gap-1">
                                <AlertTriangle size={13} strokeWidth={1.25} />
                                {eanAudit.expectedCheckDigit !== null
                                  ? `CHK -> ${eanAudit.expectedCheckDigit}`
                                  : '13 DIGITS REQ'}
                              </span>
                              {eanAudit.expectedCheckDigit !== null && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateTechSpec(
                                      'barcode',
                                      'value',
                                      `${eanAudit.cleaned.slice(0, 12)}${eanAudit.expectedCheckDigit}`
                                    )
                                  }
                                  className="px-1.5 py-0.5 bg-[#05050A] border border-[#00E5FF] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#05050A] transition-colors text-[9px] whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  {t.fixDigitBtn}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Extension Specs Header */}
              <div className="pt-1 flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#8A8FA3]">
                  {t.dynamicSpecsHeader}
                </span>
                <span className="font-mono text-[10px] text-[#8A8FA3] tabular-nums">
                  [{contract.dynamicSpecs.length}]
                </span>
              </div>

              {/* Dynamic Extension Specs List */}
              <div className="space-y-2">
                {contract.dynamicSpecs.map((dSpec) => {
                  const maxAllowed = dSpec.maxChars || OVERFLOW_THRESHOLDS.specValueMaxChars;
                  const isValOverflow = dSpec.value.length > maxAllowed;
                  const isLblOverflow =
                    dSpec.label.length > OVERFLOW_THRESHOLDS.specLabelMaxChars;
                  const hasOverflow = isValOverflow || isLblOverflow;

                  return (
                    <div
                      key={dSpec.id}
                      className={`bg-[#0D0E17] border p-2 space-y-1.5 transition-colors ${
                        hasOverflow
                          ? 'border-[#EF4444]'
                          : 'border-[#1F1F2E] hover:border-[#2D2D44]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={dSpec.label}
                          onChange={(e) =>
                            onUpdateDynamicSpec(dSpec.id, 'label', e.target.value)
                          }
                          className="bg-transparent font-mono text-[10px] text-[#8A8FA3] focus:text-white focus:outline-none w-full"
                        />
                        <span className="font-mono text-[9px] text-[#8A8FA3] tabular-nums shrink-0">
                          {dSpec.value.length}/{maxAllowed}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveDynamicSpec(dSpec.id)}
                          className="text-[#8A8FA3] hover:text-[#EF4444] transition-colors p-0.5 shrink-0 cursor-pointer"
                        >
                          <Trash2 size={13} strokeWidth={1.25} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={dSpec.value}
                        onChange={(e) =>
                          onUpdateDynamicSpec(dSpec.id, 'value', e.target.value)
                        }
                        className={`w-full h-7 px-2 bg-[#05050A] border focus:outline-none font-mono text-xs text-white tabular-nums ${
                          isValOverflow
                            ? 'border-[#EF4444]'
                            : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                        }`}
                      />
                      {hasOverflow && (
                        <div className="px-2 py-1 bg-[#05050A] border border-[#EF4444] font-mono text-[9px] text-[#EF4444] font-bold">
                          {fullT.overflowBadge}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Spec Override Form */}
              {showAddSpecForm ? (
                <form
                  onSubmit={handleConfirmAddSpec}
                  className="bg-[#0D0E17] border border-[#00E5FF] p-2.5 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={newSpecLabel}
                      onChange={(e) => setNewSpecLabel(e.target.value)}
                      placeholder="Label"
                      autoFocus
                      className="h-7 px-2 bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none font-mono text-xs text-white"
                    />
                    <input
                      type="text"
                      value={newSpecValue}
                      onChange={(e) => setNewSpecValue(e.target.value)}
                      placeholder="Value"
                      className="h-7 px-2 bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none font-mono text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 h-7 bg-[#00E5FF] text-[#05050A] font-mono text-[11px] font-semibold hover:bg-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {t.commitFieldBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddSpecForm(false)}
                      className="px-2.5 h-7 bg-[#05050A] border border-[#1F1F2E] text-[#8A8FA3] hover:text-white font-mono text-[11px] whitespace-nowrap cursor-pointer"
                    >
                      {t.cancelBtn}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddSpecForm(true)}
                  className="w-full h-8 bg-[#0D0E17] border border-[#2D2D44] hover:border-[#00E5FF] text-[#00E5FF] font-mono text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus size={15} strokeWidth={1.25} />
                  <span>{t.addOverrideSpecBtn}</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* ====================================================================
            ACCORDION 01.C: [ ▸ 01.C // KSP_ICON_ASSETS_VIEWER ]
            ==================================================================== */}
        <section className="bg-[#0A0C14]">
          <button
            type="button"
            onClick={() => toggleSection('ksp')}
            className={`w-full h-9 px-3.5 flex items-center justify-between text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
              expanded.ksp
                ? 'bg-[#0D0E17] text-[#00E5FF] border-b border-[#1F1F2E]'
                : 'bg-[#0A0C14] text-white hover:bg-[#0D0E17]'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expanded.ksp ? (
                <ChevronDown size={16} strokeWidth={1.25} className="text-[#00E5FF] shrink-0" />
              ) : (
                <ChevronRight size={16} strokeWidth={1.25} className="text-[#8A8FA3] shrink-0" />
              )}
              <span className="truncate">
                [ {expanded.ksp ? '▾' : '▸'} {t.accKsp} ]
              </span>
            </div>
            <span
              className={`font-mono text-[10px] tabular-nums shrink-0 ml-2 ${
                pendingKspCount > 0 ? 'text-[#5322FF] font-bold' : 'text-[#10B981]'
              }`}
            >
              {contract.keySellingPoints.length - pendingKspCount}/
              {contract.keySellingPoints.length} SVG
            </span>
          </button>

          {expanded.ksp && (
            <div className="p-3.5 space-y-2.5">
              {/* KSP Vector Cards */}
              <div className="space-y-2.5">
                {contract.keySellingPoints.map((ksp, idx) => {
                  const isReady = ksp.status === 'READY' && Boolean(ksp.iconSvg);
                  const isTitleOverflow =
                    ksp.title.length > OVERFLOW_THRESHOLDS.kspTitleMaxChars;
                  const isDescOverflow =
                    ksp.description.length > OVERFLOW_THRESHOLDS.kspDescriptionMaxChars;
                  const hasKspOverflow = isTitleOverflow || isDescOverflow;
                  const isEditingThisKsp = editingKspId === ksp.id;

                  return (
                    <div
                      key={ksp.id}
                      className={`bg-[#0D0E17] border p-2.5 space-y-2 transition-colors ${
                        hasKspOverflow
                          ? 'border-[#EF4444]'
                          : isEditingThisKsp
                          ? 'border-[#00E5FF]'
                          : isReady
                          ? 'border-[#1F1F2E] hover:border-[#2D2D44]'
                          : 'border-[#5322FF]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Vector Icon Preview Frame */}
                        <button
                          type="button"
                          onClick={() => handleCycleKspVector(ksp.id, ksp.iconSvg)}
                          title="Click to cycle or synthesize KSP Vector SVG"
                          className={`w-12 h-12 shrink-0 border flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                            isReady
                              ? 'bg-[#05050A] border-[#2D2D44] text-[#00E5FF] hover:border-[#00E5FF]'
                              : 'bg-[#05050A] border-[#5322FF] text-[#8A8FA3] hover:border-[#00E5FF]'
                          }`}
                        >
                          {ksp.iconSvg ? (
                            <div
                              className="w-8 h-8 text-[#00E5FF]"
                              dangerouslySetInnerHTML={{ __html: ksp.iconSvg }}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-[8px] font-mono text-[#8A8FA3] leading-tight">
                              <span>NO_SVG</span>
                              <span className="text-[#5322FF]">AGENT</span>
                            </div>
                          )}
                        </button>

                        {/* KSP Metadata & Inline Override Fields */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono text-[10px] text-[#8A8FA3] tabular-nums">
                              ASSET_0{idx + 1}
                            </span>
                            {isReady ? (
                              <span className="px-1.5 py-0.5 bg-[#05050A] border border-[#10B981] text-[#10B981] font-mono text-[9px] font-semibold tracking-wider whitespace-nowrap">
                                {t.verifiedVectorBadge}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-[#5322FF]/20 border border-[#5322FF] text-white font-mono text-[9px] font-semibold tracking-wider whitespace-nowrap">
                                {t.pendingVectorBadge}
                              </span>
                            )}
                          </div>

                          <input
                            type="text"
                            value={ksp.title}
                            onFocus={() => setEditingKspId(ksp.id)}
                            onBlur={() => setEditingKspId(null)}
                            onChange={(e) => onUpdateKsp(ksp.id, { title: e.target.value })}
                            className={`w-full h-6 px-1.5 bg-[#05050A] border focus:outline-none text-xs font-medium text-white ${
                              isTitleOverflow
                                ? 'border-[#EF4444]'
                                : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                            }`}
                          />
                          <input
                            type="text"
                            value={ksp.description}
                            onFocus={() => setEditingKspId(ksp.id)}
                            onBlur={() => setEditingKspId(null)}
                            onChange={(e) =>
                              onUpdateKsp(ksp.id, { description: e.target.value })
                            }
                            className={`w-full h-6 px-1.5 bg-[#05050A] border focus:outline-none text-[11px] text-[#8A8FA3] focus:text-white ${
                              isDescOverflow
                                ? 'border-[#EF4444]'
                                : 'border-[#1F1F2E] focus:border-[#00E5FF]'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Text Overflow Gatekeeper Badge for KSP */}
                      {hasKspOverflow && (
                        <div className="px-2 py-1 bg-[#05050A] border border-[#EF4444] font-mono text-[9px] text-[#EF4444] font-bold">
                          {fullT.overflowBadge} ({ksp.title.length}/
                          {OVERFLOW_THRESHOLDS.kspTitleMaxChars} | {ksp.description.length}/
                          {OVERFLOW_THRESHOLDS.kspDescriptionMaxChars})
                        </div>
                      )}

                      {/* Vector Path Telemetry Row */}
                      <div className="pt-1 border-t border-[#1F1F2E] flex items-center justify-between font-mono text-[9px] text-[#8A8FA3]">
                        <span>
                          {ksp.iconSvg
                            ? 'SVG_PATH::48x48_BEZIER_LOCKED'
                            : 'QUEUE::AWAITING_VECTORCRAFT_MCP'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (isReady) {
                              handleCycleKspVector(ksp.id, ksp.iconSvg);
                            } else {
                              onUpdateKsp(ksp.id, {
                                status: 'READY',
                                iconSvg: selectVectorCraftSvg(ksp.title, idx),
                              });
                            }
                          }}
                          className="text-[#00E5FF] hover:underline whitespace-nowrap cursor-pointer"
                        >
                          {isReady ? t.cycleVectorBtn : t.synthNowBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VectorCraft MCP Trigger Button */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={onTriggerVectorCraft}
                  disabled={isVectorCraftRunning}
                  className="w-full h-9 px-3 bg-[#5322FF] hover:bg-[#6438FF] disabled:opacity-60 border border-[#00E5FF] text-white font-mono text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isVectorCraftRunning ? (
                    <>
                      <RefreshCw
                        size={16}
                        strokeWidth={1.25}
                        className="animate-spin text-[#00E5FF]"
                      />
                      <span>{t.synthesizingSvg}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} strokeWidth={1.25} className="text-[#00E5FF]" />
                      <span>
                        {t.triggerVectorCraftBtn}{' '}
                        {pendingKspCount > 0 ? `(${pendingKspCount})` : ''}
                      </span>
                    </>
                  )}
                </button>

                {vectorCraftLog && (
                  <div className="p-2 bg-[#05050A] border border-[#2D2D44] font-mono text-[10px] text-[#10B981] flex items-center justify-between">
                    <span className="truncate">{vectorCraftLog}</span>
                    <span className="text-[#00E5FF] shrink-0 ml-2">[OK]</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
