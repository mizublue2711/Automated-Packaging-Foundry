import React, { useRef, useState } from 'react';
import { Check, Copy, Download, FileCheck2, FolderOpen, Upload, X } from 'lucide-react';
import { PackagingContract, ProductionJobTicket } from '../types/packaging';
import { AGENT_AN_SAMPLE_CONTRACTS } from '../config/studioConfig';

interface ContractModalProps {
  mode: 'JSON_EXPORT' | 'PDFX_REPORT';
  contract: PackagingContract;
  onClose: () => void;
  onImportContract: (updated: PackagingContract, sourceLabel?: string) => void;
  onDownloadJsonFile: () => void;
  onDownloadDielineSvg: () => void;
  jobTicket: ProductionJobTicket | null;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  mode,
  contract,
  onClose,
  onImportContract,
  onDownloadJsonFile,
  onDownloadDielineSvg,
  jobTicket,
}) => {
  const [copied, setCopied] = useState(false);
  const [editableJson, setEditableJson] = useState(() =>
    JSON.stringify(contract, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(editableJson) as PackagingContract;
      if (!parsed.product || !parsed.technicalSpecs || !parsed.keySellingPoints) {
        setJsonError('SCHEMA_ERR: Missing required contract root keys.');
        return;
      }
      setJsonError(null);
      onImportContract(parsed, `MANUAL_${parsed.product.model}`);
      onClose();
    } catch (err) {
      setJsonError(
        `PARSE_ERR: ${err instanceof Error ? err.message : 'Invalid JSON payload'}`
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setEditableJson(text);
      setJsonError(null);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#05050A]/85 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#0A0C14] border-2 border-[#00E5FF] flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="h-10 px-4 bg-[#0D0E17] border-b border-[#1F1F2E] flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#00E5FF]">
            <FileCheck2 size={16} strokeWidth={1.25} />
            <span>
              {mode === 'JSON_EXPORT'
                ? '[ AGENT_AN_CONTRACT // INGESTION_&_JSON_IO ]'
                : `[ PRE-PRESS_PRODUCTION_TICKET // ${jobTicket?.jobId || 'PDF/X-4'} ]`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8A8FA3] hover:text-white p-1 transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={1.25} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {mode === 'PDFX_REPORT' && jobTicket && (
            <div className="p-3 bg-[#05050A] border border-[#10B981] space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-[#10B981] font-bold">
                <span>[ ✓ ] PDF/X-4 & CAD DIELINE PACKAGE READY FOR CTP</span>
                <span>JOB: {jobTicket.jobId}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-[#8A8FA3] tabular-nums">
                <div className="bg-[#0D0E17] border border-[#1F1F2E] p-2">
                  <div>SKU_MODEL</div>
                  <div className="text-white font-bold mt-0.5">
                    {contract.product.brand} {contract.product.model}
                  </div>
                </div>
                <div className="bg-[#0D0E17] border border-[#1F1F2E] p-2">
                  <div>FLAT_SHEET_AREA</div>
                  <div className="text-[#00E5FF] font-bold mt-0.5">
                    {jobTicket.surfaceAreaM2} m²
                  </div>
                </div>
                <div className="bg-[#0D0E17] border border-[#1F1F2E] p-2">
                  <div>SUBSTRATE_MASS</div>
                  <div className="text-[#10B981] font-bold mt-0.5">
                    {jobTicket.weightGrams} g ({jobTicket.substrateCode})
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Agent An Preset Loader + Local JSON File Upload */}
          <div className="p-2.5 bg-[#0D0E17] border border-[#1F1F2E] space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] text-[#8A8FA3]">
              <span>INGEST PRE-COMPILED AGENT AN SKU CONTRACT OR UPLOAD .JSON:</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-0.5 bg-[#05050A] border border-[#00E5FF] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#05050A] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <FolderOpen size={12} strokeWidth={1.25} />
                <span>[ UPLOAD .JSON FILE ]</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {AGENT_AN_SAMPLE_CONTRACTS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    setEditableJson(JSON.stringify(sample.contract, null, 2));
                    setJsonError(null);
                  }}
                  className="px-2.5 py-1.5 bg-[#05050A] border border-[#2D2D44] hover:border-[#00E5FF] text-left font-mono text-[10px] text-white truncate transition-colors cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between font-mono text-[11px] text-[#8A8FA3]">
            <span>LIVE_JSON_CONTRACT (EDITABLE IN REAL-TIME)</span>
            <span className="text-[#00E5FF]">ENCODING: UTF-8</span>
          </div>

          <textarea
            value={editableJson}
            onChange={(e) => setEditableJson(e.target.value)}
            spellCheck={false}
            className="w-full h-64 p-3 bg-[#05050A] border border-[#1F1F2E] focus:border-[#00E5FF] focus:outline-none font-mono text-xs text-[#00E5FF] leading-relaxed resize-none"
          />

          {jsonError && (
            <div className="p-2 bg-[#05050A] border border-[#EF4444] font-mono text-xs text-[#EF4444]">
              {jsonError}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-[#0D0E17] border-t border-[#1F1F2E] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="h-8 px-3 bg-[#05050A] border border-[#2D2D44] hover:border-[#00E5FF] font-mono text-xs text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <>
                  <Check size={14} strokeWidth={1.25} className="text-[#10B981]" />
                  <span className="text-[#10B981]">[ COPIED ]</span>
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={1.25} className="text-[#00E5FF]" />
                  <span>[ COPY JSON ]</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onDownloadJsonFile}
              className="h-8 px-3 bg-[#05050A] border border-[#2D2D44] hover:border-[#00E5FF] font-mono text-xs text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download size={14} strokeWidth={1.25} className="text-[#00E5FF]" />
              <span>[ DOWNLOAD .JSON ]</span>
            </button>

            <button
              type="button"
              onClick={onDownloadDielineSvg}
              className="h-8 px-3 bg-[#05050A] border border-[#2D2D44] hover:border-[#00E5FF] font-mono text-xs text-[#00E5FF] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download size={14} strokeWidth={1.25} />
              <span>[ EXPORT DIELINE .SVG ]</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyJson}
              className="h-8 px-3 bg-[#5322FF] hover:bg-[#6538FF] border border-[#00E5FF] font-mono text-xs font-semibold text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Upload size={14} strokeWidth={1.25} />
              <span>[ INGEST CONTRACT ]</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 bg-[#05050A] border border-[#1F1F2E] hover:border-white font-mono text-xs text-[#8A8FA3] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              [ CLOSE ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
