import React, { useState } from 'react';
import {
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
  const t = getTranslation(lang).showcase;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isDirectorActive = choreographyStatus === 'CHOREOGRAPHY_ACTIVE';

  const getPhaseDescription = (): string => {
    if (choreographyPhase === 'PHASE_1_INSPECTION') return t.phase1Label;
    if (choreographyPhase === 'PHASE_2_KINEMATICS') return t.phase2Label;
    if (choreographyPhase === 'PHASE_3_TURNTABLE') return t.phase3Label;
    return `${t.foldSequenceLabel}`;
  };

  if (isCollapsed) {
    return (
      <div className="border-t border-[#1F1F2E] bg-[#0A0C14] px-3.5 h-8 flex items-center justify-between shrink-0 z-20 select-none">
        <div className="flex items-center gap-3 font-mono text-[10px] text-[#8A8FA3] tabular-nums">
          <span className="text-[#00E5FF] font-semibold">
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
          className="px-2 py-0.5 bg-[#0D0E17] border border-[#2D2D44] hover:border-[#00E5FF] font-mono text-[10px] text-[#00E5FF] flex items-center gap-1 cursor-pointer"
        >
          <ChevronUp size={13} strokeWidth={1.25} />
          <span>{t.showHudBtn}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="3D Packaging Showcase & WebM Recorder Controls"
      className="border-t border-[#1F1F2E] bg-[#0A0C14] px-3.5 py-2.5 shrink-0 z-20 select-none space-y-2"
    >
      {/* Top Row: Telemetry Tags, Active Phase Readout & Collapse Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F2E] pb-1.5">
        <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums">
          <span className="px-1.5 py-0.5 bg-[#05050A] border border-[#00E5FF] text-[#00E5FF] font-bold">
            [ FOLD // {Math.round(foldPercent)}% ]
          </span>
          <span className="px-1.5 py-0.5 bg-[#05050A] border border-[#2D2D44] text-white">
            {t.camTag}
          </span>
          <span className="px-1.5 py-0.5 bg-[#05050A] border border-[#2D2D44] text-[#8A8FA3] hidden xl:inline">
            {t.exportTag}
          </span>
          <span
            className={`px-1.5 py-0.5 border font-semibold ${
              isDirectorActive
                ? 'bg-[#5322FF]/30 border-[#00E5FF] text-[#00E5FF]'
                : 'bg-[#05050A] border-[#1F1F2E] text-[#8A8FA3]'
            }`}
          >
            {isDirectorActive ? t.choreographyActiveTag : t.sequenceIdleTag}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-[#00E5FF] truncate max-w-xs">
            {getPhaseDescription()}
          </span>
          {lastRecordedFileName && !isRecordingWebm && (
            <span className="px-1.5 py-0.5 bg-[#05050A] border border-[#10B981] text-[#10B981] tabular-nums">
              [ SAVED: {lastRecordedFileName} ]
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="px-2 py-0.5 bg-[#0D0E17] border border-[#1F1F2E] hover:border-[#00E5FF] text-[#8A8FA3] hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ChevronDown size={13} strokeWidth={1.25} />
            <span>{t.hideHudBtn}</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: 1. Kinematic Fold Slider & Ticks | 2. Cinematic Director | 3. WebM Recorder */}
      <div className="grid grid-cols-12 gap-3 items-center">
        {/* 1. Manual Kinematic Fold Slider + Technical Tick Stops (5 cols) */}
        <div className="col-span-12 lg:col-span-5 bg-[#0D0E17] border border-[#1F1F2E] px-2.5 py-1.5 space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[#8A8FA3] flex items-center gap-1">
              <Sliders size={13} strokeWidth={1.25} className="text-[#00E5FF]" />
              <span>[ {t.foldSequenceLabel} ]</span>
            </span>
            <span className="text-[#00E5FF] font-bold tabular-nums">
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
              className="flex-1 h-1.5 bg-[#05050A] accent-[#00E5FF] cursor-pointer"
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
                        ? 'bg-[#00E5FF] text-[#05050A] border-[#00E5FF] font-bold'
                        : 'bg-[#05050A] text-[#8A8FA3] border-[#1F1F2E] hover:border-[#00E5FF] hover:text-white'
                    }`}
                  >
                    {tick}%
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Cinematic Camera Director Controls (3 cols) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleChoreography}
            className={`flex-1 h-9 px-2.5 border font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              isDirectorActive
                ? 'bg-[#5322FF] text-white border-[#00E5FF]'
                : 'bg-[#0D0E17] text-white border-[#2D2D44] hover:border-[#00E5FF]'
            }`}
          >
            {isDirectorActive ? (
              <>
                <Pause size={15} strokeWidth={1.25} className="text-[#00E5FF]" />
                <span>{t.pauseDirectorBtn}</span>
              </>
            ) : (
              <>
                <Play size={15} strokeWidth={1.25} className="text-[#00E5FF]" />
                <span>{t.playDirectorBtn}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReplayChoreography}
            title="Replay 3-Phase Cinematic Sequence from 0% Flat"
            className="h-9 px-2.5 bg-[#0D0E17] border border-[#1F1F2E] hover:border-[#00E5FF] font-mono text-[11px] text-[#8A8FA3] hover:text-white flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw size={14} strokeWidth={1.25} />
            <span>{t.replayDirectorBtn}</span>
          </button>
        </div>

        {/* 3. Direct Client WebM Video Recorder CTA (4 cols) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-4">
          <button
            type="button"
            onClick={onToggleRecordWebm}
            className={`w-full h-9 px-3 border-2 font-mono text-[11px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              isRecordingWebm
                ? 'bg-[#EF4444] text-white border-white'
                : 'bg-[#05050A] hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#05050A] border-[#00E5FF]'
            }`}
          >
            {isRecordingWebm ? (
              <>
                <Film size={16} strokeWidth={1.25} />
                <span>
                  {t.recordingActiveBtn} ({recordingElapsedSec.toFixed(1)}s /{' '}
                  {CHOREOGRAPHY_CONFIG.totalDurationSec.toFixed(1)}s)
                </span>
              </>
            ) : (
              <>
                <Video size={16} strokeWidth={1.25} />
                <span>{t.recordWebmBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
