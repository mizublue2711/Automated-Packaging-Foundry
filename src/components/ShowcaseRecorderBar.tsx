import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Film,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Video,
} from 'lucide-react';
import {
  ChoreographyPhaseId,
  ChoreographyStatus,
  Language,
} from '../types/packaging';
import { CHOREOGRAPHY_CONFIG, getTranslation } from '../config/studioConfig';

interface ShowcaseRecorderBarProps {
  lang: Language;
  viewMode: '2D_FLAT' | '3D_FOLDED';
  onEnter3DMode: () => void;
  foldPercent: number;
  onFoldPercentChange: (percent: number) => void;
  choreographyStatus: ChoreographyStatus;
  choreographyPhase: ChoreographyPhaseId;
  onToggleChoreography: () => void;
  onReplayChoreography: () => void;
  isRecordingWebm: boolean;
  recordingElapsedSec: number;
  onToggleRecordWebm: () => void;
  lastRecordedFileName: string | null;
}

export const ShowcaseRecorderBar: React.FC<ShowcaseRecorderBarProps> = ({
  lang,
  viewMode,
  onEnter3DMode,
  foldPercent,
  onFoldPercentChange,
  choreographyStatus,
  choreographyPhase,
  onToggleChoreography,
  onReplayChoreography,
  isRecordingWebm,
  recordingElapsedSec,
  onToggleRecordWebm,
  lastRecordedFileName,
}) => {
  const fullT = getTranslation(lang);
  const t = fullT.showcase;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isDirectorActive = choreographyStatus === 'CHOREOGRAPHY_ACTIVE';

  const getPhaseDescription = (): string => {
    if (choreographyPhase === 'PHASE_1_INSPECTION') return t.phase1Label;
    if (choreographyPhase === 'PHASE_2_KINEMATICS') return t.phase2Label;
    if (choreographyPhase === 'PHASE_3_TURNTABLE') return t.phase3Label;
    return `${t.foldSequenceLabel}`;
  };

  // In 2D FLAT DIECUT SHEET mode: hide folding slider & frame controls; show only a single prominent 3D Hero CTA
  if (viewMode === '2D_FLAT') {
    return (
      <section
        aria-label="Enter 3D Prototype Mode"
        className="border-t border-[#27272a] bg-[#09090b] px-4 py-2.5 shrink-0 z-20 select-none flex items-center justify-center"
      >
        <button
          type="button"
          onClick={onEnter3DMode}
          className="h-9 px-6 bg-[#5322ff] text-white font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(83,34,255,0.45)] hover:brightness-110 transition-all duration-200 cursor-pointer whitespace-nowrap"
        >
          <Box size={15} strokeWidth={1.75} />
          <span>{fullT.col2.folded3dBtn}</span>
        </button>
      </section>
    );
  }

  if (isCollapsed) {
    return (
      <div className="border-t border-[#27272a] bg-[#09090b] px-3.5 h-8 flex items-center justify-between shrink-0 z-20 select-none animate-dock-fade">
        <div className="flex items-center gap-3 font-mono text-[10px] text-[#71717a] tabular-nums">
          <span className="text-zinc-200 font-semibold">
            [ FOLD // {Math.round(foldPercent)}% ]
          </span>
          <span>
            {isDirectorActive ? t.choreographyActiveTag : t.sequenceIdleTag}
          </span>
          {isRecordingWebm && (
            <span className="text-[#EF4444] font-bold">
              [ 🔴 REC 60FPS // {recordingElapsedSec.toFixed(1)}s ]
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="px-2 py-0.5 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] font-mono text-[10px] text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
        >
          <ChevronUp size={13} strokeWidth={1.5} />
          <span>{t.showHudBtn}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="3D Packaging Showcase & WebM Recorder Controls"
      className="border-t border-[#27272a] bg-[#09090b] px-3.5 py-2.5 shrink-0 z-20 select-none space-y-2 animate-dock-fade"
    >
      {/* Top Row: Telemetry Tags, Active Phase Readout & Collapse Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272a] pb-1.5">
        <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums">
          <span className="px-1.5 py-0.5 bg-[#18181b] border border-[#27272a] text-zinc-100 font-semibold">
            [ FOLD // {Math.round(foldPercent)}% ]
          </span>
          <span className="px-1.5 py-0.5 bg-[#18181b] border border-[#27272a] text-zinc-300">
            {t.camTag}
          </span>
          <span className="px-1.5 py-0.5 bg-[#18181b] border border-[#27272a] text-[#71717a] hidden xl:inline">
            {t.exportTag}
          </span>
          <span
            className={`px-1.5 py-0.5 border font-semibold ${
              isDirectorActive
                ? 'bg-[#5322ff]/20 border-[#5322ff] text-white'
                : 'bg-[#18181b] border-[#27272a] text-[#71717a]'
            }`}
          >
            {isDirectorActive ? t.choreographyActiveTag : t.sequenceIdleTag}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-[#71717a] truncate max-w-xs">
            {getPhaseDescription()}
          </span>
          {lastRecordedFileName && !isRecordingWebm && (
            <span className="px-1.5 py-0.5 bg-[#18181b] border border-[#06b6d4]/60 text-[#00f0ff] tabular-nums">
              [ SAVED: {lastRecordedFileName} ]
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="px-2 py-0.5 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-[#71717a] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ChevronDown size={13} strokeWidth={1.5} />
            <span>{t.hideHudBtn}</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: 1. Kinematic Fold Slider & Ticks | 2. Cinematic Director (#5322ff Hero) | 3. WebM Recorder */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* 1. Manual Kinematic Fold Slider + Technical Tick Stops */}
        <div className="flex-1 min-w-[260px] bg-[#18181b] border border-[#27272a] px-2.5 py-1.5 space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[#71717a] flex items-center gap-1">
              <Sliders size={13} strokeWidth={1.5} className="text-[#71717a]" />
              <span>[ {t.foldSequenceLabel} ]</span>
            </span>
            <span className="text-zinc-100 font-bold tabular-nums">
              {foldPercent.toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={foldPercent}
              onChange={(e) => onFoldPercentChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-[#09090b] accent-[#5322ff] cursor-pointer"
            />
            <div className="flex items-center gap-1 shrink-0">
              {CHOREOGRAPHY_CONFIG.foldTicks.map((tick) => {
                const isTickActive = Math.round(foldPercent) === tick;
                return (
                  <button
                    key={tick}
                    type="button"
                    onClick={() => onFoldPercentChange(tick)}
                    className={`px-1.5 py-0.5 border font-mono text-[9px] tabular-nums transition-colors cursor-pointer ${
                      isTickActive
                        ? 'bg-[#5322ff] text-white border-[#5322ff] font-bold'
                        : 'bg-[#09090b] text-[#71717a] border-[#27272a] hover:border-[#3f3f46] hover:text-white'
                    }`}
                  >
                    {tick}%
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Cinematic Camera Director Controls — #5322ff Hero Accent */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleChoreography}
            className="h-9 px-3.5 bg-[#5322ff] text-white font-mono text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(83,34,255,0.45)] hover:brightness-110 transition-all duration-200 cursor-pointer whitespace-nowrap"
          >
            {isDirectorActive ? (
              <>
                <Pause size={15} strokeWidth={1.75} />
                <span>{t.pauseDirectorBtn}</span>
              </>
            ) : (
              <>
                <Play size={15} strokeWidth={1.75} />
                <span>{t.playDirectorBtn}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReplayChoreography}
            title="Replay 3-Phase Cinematic Sequence from 0% Flat"
            className="h-9 px-2.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3f3f46] font-mono text-[11px] text-zinc-300 hover:text-white flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw size={14} strokeWidth={1.5} />
            <span>{t.replayDirectorBtn}</span>
          </button>
        </div>

        {/* 3. Direct Client WebM Video Recorder CTA */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onToggleRecordWebm}
            className={`h-9 px-3 border font-mono text-[11px] font-semibold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              isRecordingWebm
                ? 'bg-[#EF4444] text-white border-[#EF4444]'
                : 'bg-[#18181b] hover:bg-[#27272a] text-zinc-200 hover:text-white border-[#27272a] hover:border-[#3f3f46]'
            }`}
          >
            {isRecordingWebm ? (
              <>
                <Film size={15} strokeWidth={1.5} />
                <span>
                  {t.recordingActiveBtn} ({recordingElapsedSec.toFixed(1)}s /{' '}
                  {CHOREOGRAPHY_CONFIG.totalDurationSec.toFixed(1)}s)
                </span>
              </>
            ) : (
              <>
                <Video size={15} strokeWidth={1.5} className="text-[#71717a]" />
                <span>{t.recordWebmBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
