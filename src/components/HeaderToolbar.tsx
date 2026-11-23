import React from 'react';
import { FileJson, Globe, RotateCcw, Terminal } from 'lucide-react';
import { ArtworkType, Language } from '../types/packaging';
import { ARTWORK_MODE_OPTIONS, getTranslation } from '../config/studioConfig';

interface HeaderToolbarProps {
  lang: Language;
  activeArtworkType: ArtworkType;
  onToggleLanguage: () => void;
  onSelectArtworkType: (type: ArtworkType) => void;
  onOpenContractModal: () => void;
  onResetStudio: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  lang,
  activeArtworkType,
  onToggleLanguage,
  onSelectArtworkType,
  onOpenContractModal,
  onResetStudio,
}) => {
  const t = getTranslation(lang);

  return (
    <header className="h-12 px-4 bg-[#0A0C14] border-b border-[#1F1F2E] flex items-center justify-between gap-4 shrink-0 select-none">
      {/* Left: Brand Title with Satellite Emerald Status Indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className="w-2.5 h-2.5 bg-[#10B981] inline-block shrink-0"
          title="Foundry Terminal Active"
        />
        <Terminal size={16} strokeWidth={1.25} className="text-[#00E5FF] shrink-0" />
        <span className="font-mono text-xs font-bold tracking-wider text-white whitespace-nowrap">
          {t.brandTitle}
        </span>
      </div>

      {/* Center: Artwork Mode Switcher (Driven from studioConfig.ts) */}
      <nav
        aria-label="Artwork Mode Switcher"
        className="flex items-center bg-[#05050A] border border-[#1F1F2E]"
      >
        {ARTWORK_MODE_OPTIONS.map((option) => {
          const isActive = activeArtworkType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectArtworkType(option.id)}
              className={`h-8 px-3 font-mono text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer border-r last:border-r-0 border-[#1F1F2E] ${
                isActive
                  ? 'bg-[#00E5FF] text-[#05050A]'
                  : 'bg-[#0D0E17] text-[#8A8FA3] hover:text-white hover:bg-[#141624]'
              }`}
            >
              {option.label[lang]}
            </button>
          );
        })}
      </nav>

      {/* Right: Dual-Language Toggle [ 🌐 EN | VI ] + Ingestion / Export + Reset */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleLanguage}
          title="Switch Technical Language (EN | VI)"
          className="h-8 px-3 bg-[#05050A] border-2 border-[#00E5FF] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Globe size={16} strokeWidth={1.25} className="text-[#00E5FF]" />
          <span>[</span>
          <span className={lang === 'EN' ? 'text-[#00E5FF]' : 'text-[#8A8FA3]'}>EN</span>
          <span className="text-[#2D2D44]">|</span>
          <span className={lang === 'VI' ? 'text-[#00E5FF]' : 'text-[#8A8FA3]'}>VI</span>
          <span>]</span>
        </button>

        <button
          type="button"
          onClick={onOpenContractModal}
          className="h-8 px-3 bg-[#0D0E17] border border-[#2D2D44] hover:border-[#00E5FF] font-mono text-xs font-semibold text-[#00E5FF] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <FileJson size={16} strokeWidth={1.25} />
          <span>{t.exportJsonBtn}</span>
        </button>

        <button
          type="button"
          onClick={onResetStudio}
          className="h-8 px-3 bg-[#0D0E17] border border-[#1F1F2E] hover:border-[#EF4444] font-mono text-xs text-[#8A8FA3] hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <RotateCcw size={16} strokeWidth={1.25} />
          <span>{t.resetBtn}</span>
        </button>
      </div>
    </header>
  );
};
