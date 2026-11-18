import React, { useRef, useState } from 'react';
import {
  Scissors,
  Diamond,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AnimatableProperty,
  Clip,
  Collaborator,
  ProjectState,
  Track,
} from '../types/editor';
import { evaluateClipTransform, formatShortTime } from '../utils/interpolation';

interface TimelineDockProps {
  project: ProjectState;
  currentTime: number;
  selectedClipId: string | null;
  remotePeers: Collaborator[];
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClip: (clipId: string, patch: Partial<Clip>) => void;
  onDeleteClip: (clipId: string) => void;
  onDuplicateClip: (clip: Clip) => void;
  onSplitClip: (clipId: string, splitTime: number) => void;
  onUpdateTrack: (trackId: string, patch: Partial<Track>) => void;
  onTimelineCursorMove: (timeSec: number, trackIdx: number) => void;
  onCursorLeave: () => void;
}

const CLIP_COLORS: Record<Clip['kind'], string> = {
  image: 'bg-[#1F2D42] border-[#35537D]',
  video: 'bg-[#1E333A] border-[#2E6270]',
  text: 'bg-[#2C2447] border-[#594793]',
  motion: 'bg-[#1D352E] border-[#2D6E59]',
  shape: 'bg-[#36291E] border-[#785535]',
  audio: 'bg-[#232A36] border-[#425066]',
};

export const TimelineDock: React.FC<TimelineDockProps> = ({
  project,
  currentTime,
  selectedClipId,
  remotePeers,
  onSeek,
  onSelectClip,
  onUpdateClip,
  onDeleteClip,
  onDuplicateClip,
  onSplitClip,
  onUpdateTrack,
  onTimelineCursorMove,
  onCursorLeave,
}) => {
  const [pxPerSec, setPxPerSec] = useState(64);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;
  const totalWidth = Math.max(900, (project.duration + 4) * pxPerSec);

  const timeFromClientX = (clientX: number): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(project.duration + 2, x / pxPerSec));
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onSeek(Number(timeFromClientX(e.clientX).toFixed(2)));
    const onMove = (ev: MouseEvent) => {
      onSeek(Number(timeFromClientX(ev.clientX).toFixed(2)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startClipDrag = (
    e: React.MouseEvent,
    clip: Clip,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;
    onSelectClip(clip.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.start;
    const origDuration = clip.duration;
    const origTrackIdx = project.tracks.findIndex((t) => t.id === clip.trackId);
    let lastEmit = 0;

    const computePatch = (clientX: number, clientY: number): Partial<Clip> => {
      const dxSec = (clientX - startX) / pxPerSec;
      if (mode === 'move') {
        const nextStart = Math.max(0, Number((origStart + dxSec).toFixed(2)));
        const dyRows = Math.round((clientY - startY) / 40);
        const targetIdx = Math.max(
          0,
          Math.min(project.tracks.length - 1, origTrackIdx + dyRows)
        );
        const targetTrack = project.tracks[targetIdx];
        const canMoveTrack =
          targetTrack &&
          !targetTrack.locked &&
          ((clip.kind === 'audio' && targetTrack.type === 'audio') ||
            (clip.kind !== 'audio' && targetTrack.type !== 'audio'));
        return {
          start: nextStart,
          trackId: canMoveTrack ? targetTrack.id : clip.trackId,
        };
      }
      if (mode === 'trim-left') {
        const maxShift = origDuration - 0.3;
        const shift = Math.max(-origStart, Math.min(maxShift, dxSec));
        return {
          start: Number((origStart + shift).toFixed(2)),
          duration: Number((origDuration - shift).toFixed(2)),
        };
      }
      // trim-right
      return {
        duration: Math.max(0.3, Number((origDuration + dxSec).toFixed(2))),
      };
    };

    const onMove = (ev: MouseEvent) => {
      const now = performance.now();
      if (now - lastEmit < 32) return;
      lastEmit = now;
      onUpdateClip(clip.id, computePatch(ev.clientX, ev.clientY));
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onUpdateClip(clip.id, computePatch(ev.clientX, ev.clientY));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const addKeyframeAtPlayhead = () => {
    if (!selectedClip) return;
    if (
      currentTime < selectedClip.start ||
      currentTime > selectedClip.start + selectedClip.duration
    ) {
      return;
    }
    const localTime = Number((currentTime - selectedClip.start).toFixed(3));
    const tf = evaluateClipTransform(selectedClip, currentTime);
    const nextKfs = { ...selectedClip.keyframes };
    for (const prop of ['x', 'y', 'scale', 'rotation', 'opacity'] as AnimatableProperty[]) {
      const list = nextKfs[prop] || [];
      if (!list.some((k) => Math.abs(k.time - localTime) <= 0.08)) {
        nextKfs[prop] = [
          ...list,
          {
            id: `kf-${Date.now()}-${prop}`,
            time: localTime,
            value: tf[prop],
            easing: 'easeOut' as const,
          },
        ].sort((a, b) => a.time - b.time);
      }
    }
    onUpdateClip(selectedClip.id, { keyframes: nextKfs });
  };

  const canSplit =
    selectedClip &&
    currentTime > selectedClip.start + 0.2 &&
    currentTime < selectedClip.start + selectedClip.duration - 0.2;

  const ticks: number[] = [];
  for (let s = 0; s <= project.duration + 2; s += 1) {
    ticks.push(s);
  }

  return (
    <section className="h-[240px] shrink-0 bg-[#0E1116] border-t border-[#222733] flex flex-col select-none">
      {/* Timeline Action Bar */}
      <div className="h-9 shrink-0 px-3 border-b border-[#222733] bg-[#11141B] flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canSplit}
            onClick={() =>
              selectedClip && onSplitClip(selectedClip.id, currentTime)
            }
            title="Split clip at playhead (S)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#181D27] hover:bg-[#222938] disabled:opacity-35 text-[#E5E7EB] border border-[#262D3B] transition-colors cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={addKeyframeAtPlayhead}
            title="Keyframe all transform properties at playhead"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#181D27] hover:bg-[#222938] disabled:opacity-35 text-[#E5E7EB] border border-[#262D3B] transition-colors cursor-pointer"
          >
            <Diamond className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span>Keyframe</span>
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDuplicateClip(selectedClip)}
            title="Duplicate selected clip"
            className="p-1.5 rounded bg-[#181D27] hover:bg-[#222938] disabled:opacity-35 text-[#9CA3AF] hover:text-white border border-[#262D3B] cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDeleteClip(selectedClip.id)}
            title="Delete selected clip (Delete)"
            className="p-1.5 rounded bg-[#181D27] hover:bg-[#222938] disabled:opacity-35 text-[#9CA3AF] hover:text-[#EF4444] border border-[#262D3B] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Control */}
        <div className="flex items-center gap-2">
          <ZoomOut className="w-3.5 h-3.5 text-[#6B7280]" />
          <input
            type="range"
            min={32}
            max={130}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-24 accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg cursor-pointer"
          />
          <ZoomIn className="w-3.5 h-3.5 text-[#6B7280]" />
        </div>
      </div>

      {/* Track Headers + Scrollable Timeline Canvas */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Track Headers */}
        <div className="w-[156px] shrink-0 bg-[#11141B] border-r border-[#222733] flex flex-col">
          <div className="h-7 border-b border-[#222733] px-3 flex items-center text-[11px] font-mono text-[#6B7280] tabular-nums">
            {formatShortTime(currentTime)}
          </div>
          <div className="flex-1 overflow-hidden">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="h-10 border-b border-[#1B202B] px-3 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-medium text-[#D1D5DB] truncate">
                  {track.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTrack(track.id, { hidden: !track.hidden })
                    }
                    title={track.hidden ? 'Show track' : 'Hide track'}
                    className={`p-1 rounded cursor-pointer ${
                      track.hidden
                        ? 'text-[#EF4444]'
                        : 'text-[#6B7280] hover:text-white'
                    }`}
                  >
                    {track.hidden ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTrack(track.id, { locked: !track.locked })
                    }
                    title={track.locked ? 'Unlock track' : 'Lock track'}
                    className={`p-1 rounded cursor-pointer ${
                      track.locked
                        ? 'text-[#F59E0B]'
                        : 'text-[#6B7280] hover:text-white'
                    }`}
                  >
                    {track.locked ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Time Ruler + Tracks */}
        <div
          ref={scrollRef}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = Math.max(
              0,
              (e.clientX - rect.left + e.currentTarget.scrollLeft) / pxPerSec
            );
            const row = Math.max(
              0,
              Math.floor((e.clientY - rect.top - 28) / 40)
            );
            onTimelineCursorMove(Number(t.toFixed(2)), row);
          }}
          onMouseLeave={onCursorLeave}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0B0D10]"
        >
          <div style={{ width: `${totalWidth}px` }} className="relative h-full">
            {/* Time Ruler */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="h-7 border-b border-[#222733] bg-[#11141B] relative cursor-ew-resize"
            >
              {ticks.map((sec) => (
                <div
                  key={sec}
                  style={{ left: `${sec * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-[#2B3344] pl-1 pt-0.5 text-[10px] font-mono tabular-nums text-[#6B7280]"
                >
                  {sec}s
                </div>
              ))}

              {/* Review Comment Markers on Ruler */}
              {project.comments.map((c) => (
                <button
                  key={`rm-${c.id}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSeek(c.time);
                  }}
                  title={`${c.authorName}: ${c.text}`}
                  style={{
                    left: `${c.time * pxPerSec}px`,
                    backgroundColor: c.authorColor,
                  }}
                  className="absolute bottom-0.5 -translate-x-1/2 w-2 h-2 rounded-full cursor-pointer"
                />
              ))}
            </div>

            {/* Track Lanes */}
            <div
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  onSelectClip(null);
                  onSeek(Number(timeFromClientX(e.clientX).toFixed(2)));
                }
              }}
              className="relative"
            >
              {project.tracks.map((track) => {
                const trackClips = project.clips.filter(
                  (c) => c.trackId === track.id
                );
                return (
                  <div
                    key={track.id}
                    className={`h-10 border-b border-[#191E29] relative ${
                      track.hidden ? 'opacity-40' : ''
                    }`}
                  >
                    {trackClips.map((clip) => {
                      const isSelected = clip.id === selectedClipId;
                      const peerEditing = remotePeers.find(
                        (p) => p.selectedClipId === clip.id
                      );
                      const leftPx = clip.start * pxPerSec;
                      const widthPx = Math.max(24, clip.duration * pxPerSec);

                      // Collect unique keyframe timestamps on this clip
                      const kfTimes = new Set<number>();
                      for (const list of Object.values(clip.keyframes)) {
                        if (!list) continue;
                        for (const k of list) kfTimes.add(k.time);
                      }

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => startClipDrag(e, clip, 'move')}
                          style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                            boxShadow: peerEditing
                              ? `0 0 0 1.5px ${peerEditing.color}`
                              : undefined,
                          }}
                          className={`absolute top-1 bottom-1 rounded border ${
                            CLIP_COLORS[clip.kind]
                          } ${
                            isSelected
                              ? 'ring-2 ring-[#3B82F6] z-10'
                              : 'hover:brightness-110'
                          } cursor-grab active:cursor-grabbing overflow-hidden flex flex-col justify-between px-2 py-0.5`}
                        >
                          {/* Trim Left Handle */}
                          <div
                            onMouseDown={(e) =>
                              startClipDrag(e, clip, 'trim-left')
                            }
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
                          />

                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="text-[11px] font-medium text-[#F4F5F7] truncate">
                              {clip.name}
                            </span>
                            {peerEditing && (
                              <span
                                style={{ backgroundColor: peerEditing.color }}
                                className="px-1 rounded text-[9px] font-semibold text-white shrink-0"
                              >
                                {peerEditing.name.split(' ')[0]}
                              </span>
                            )}
                          </div>

                          {/* Keyframe Diamonds Rail */}
                          <div className="relative h-2.5 w-full pointer-events-none">
                            {Array.from(kfTimes).map((kt) => (
                              <button
                                key={kt}
                                type="button"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  onSelectClip(clip.id);
                                  onSeek(Number((clip.start + kt).toFixed(3)));
                                }}
                                title={`Keyframe at +${kt.toFixed(2)}s`}
                                style={{ left: `${kt * pxPerSec}px` }}
                                className="pointer-events-auto absolute bottom-0 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#60A5FA] border border-[#0E1116] hover:bg-white cursor-pointer"
                              />
                            ))}
                          </div>

                          {/* Trim Right Handle */}
                          <div
                            onMouseDown={(e) =>
                              startClipDrag(e, clip, 'trim-right')
                            }
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Remote Collaborator Timeline Cursors */}
            {remotePeers.map((peer) => {
              if (!peer.cursor || peer.cursor.area !== 'timeline') return null;
              return (
                <div
                  key={`tl-cur-${peer.id}`}
                  style={{
                    left: `${peer.cursor.x * pxPerSec}px`,
                    borderColor: peer.color,
                  }}
                  className="absolute top-0 bottom-0 border-l border-dashed pointer-events-none z-20"
                >
                  <span
                    style={{ backgroundColor: peer.color }}
                    className="absolute top-1 left-1 px-1 rounded text-[9px] font-semibold text-white whitespace-nowrap"
                  >
                    {peer.name.split(' ')[0]}
                  </span>
                </div>
              );
            })}

            {/* Playhead Needle */}
            <div
              style={{ left: `${currentTime * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-px bg-[#3B82F6] pointer-events-none z-30"
            >
              <div className="w-2.5 h-3 bg-[#3B82F6] -translate-x-1/2 rounded-b-xs" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
