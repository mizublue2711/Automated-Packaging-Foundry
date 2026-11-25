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
    <header className="h-12 px-4 bg-[#09090b] border-b border-[#27272a] flex items-center justify-between gap-4 shrink-0 select-none">
      {/* Left: Brand Title with Satellite Emerald Status Indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className="w-2 h-2 bg-[#10B981] inline-block shrink-0"
          title="Foundry Terminal Active"
        />
        <Terminal size={15} strokeWidth={1.5} className="text-[#71717a] shrink-0" />
        <span className="font-mono text-xs font-semibold tracking-wider text-zinc-100 whitespace-nowrap">
          {t.brandTitle}
        </span>
      </div>

      {/* Center: Artwork Mode Switcher — Reserved Subtle Cyan Border for Active Model */}
      <nav
        aria-label="Artwork Mode Switcher"
        className="flex items-center bg-[#09090b] border border-[#27272a]"
      >
        {ARTWORK_MODE_OPTIONS.map((option) => {
          const isActive = activeArtworkType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectArtworkType(option.id)}
              className={`h-8 px-3 font-mono text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer border-r last:border-r-0 ${
                isActive
                  ? 'bg-[#06b6d4]/10 text-[#00f0ff] border border-[#06b6d4]/80 -my-px'
                  : 'bg-[#09090b] text-[#71717a] hover:text-zinc-200 hover:bg-[#18181b] border-[#27272a]'
              }`}
            >
              {option.label[lang]}
            </button>
          );
        })}
      </nav>

      {/* Right: Neutralized Secondary Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleLanguage}
          title="Switch Technical Language (EN | VI)"
          className="h-8 px-2.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] font-mono text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer text-zinc-300"
        >
          <Globe size={14} strokeWidth={1.5} className="text-[#71717a]" />
          <span className="text-[#71717a]">[</span>
          <span className={lang === 'EN' ? 'text-white font-semibold' : 'text-[#71717a]'}>EN</span>
          <span className="text-[#3f3f46]">|</span>
          <span className={lang === 'VI' ? 'text-white font-semibold' : 'text-[#71717a]'}>VI</span>
          <span className="text-[#71717a]">]</span>
        </button>

        <button
          type="button"
          onClick={onOpenContractModal}
          className="h-8 px-3 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3f3f46] font-mono text-xs font-medium text-zinc-200 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <FileJson size={14} strokeWidth={1.5} className="text-[#71717a]" />
          <span>{t.exportJsonBtn}</span>
        </button>

        <button
          type="button"
          onClick={onResetStudio}
          className="h-8 px-3 bg-[#09090b] hover:bg-[#18181b] border border-[#27272a] hover:border-[#EF4444]/60 font-mono text-xs text-[#71717a] hover:text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
          <span>{t.resetBtn}</span>
        </button>
      </div>
    </header>
  );
};
