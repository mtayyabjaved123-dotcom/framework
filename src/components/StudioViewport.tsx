import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Grid,
  MapPin,
} from 'lucide-react';
import { mediaCache } from '../engine/mediaCache';
import { renderCompositionFrame, type RenderedLayerBounds } from '../engine/renderFrame';
import type {
  AnimatableProperty,
  AspectRatio,
  Clip,
  Collaborator,
  ProjectState,
  ReviewComment,
} from '../types/editor';
import {
  evaluateClipTransform,
  formatTimecode,
  getCanvasDimensions,
} from '../utils/interpolation';

interface StudioViewportProps {
  project: ProjectState;
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  selectedClipId: string | null;
  remotePeers: Collaborator[];
  pinMode: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClip: (clipId: string, patch: Partial<Clip>) => void;
  onChangeAspectRatio: (ar: AspectRatio) => void;
  onCursorMove: (xPct: number, yPct: number) => void;
  onCursorLeave: () => void;
  onCreatePinnedComment: (time: number, text: string, pin: { x: number; y: number }) => void;
  onDisablePinMode: () => void;
}

export const StudioViewport: React.FC<StudioViewportProps> = ({
  project,
  currentTime,
  isPlaying,
  loop,
  selectedClipId,
  remotePeers,
  pinMode,
  onTogglePlay,
  onSeek,
  onToggleLoop,
  onSelectClip,
  onUpdateClip,
  onChangeAspectRatio,
  onCursorMove,
  onCursorLeave,
  onCreatePinnedComment,
  onDisablePinMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const layerBoundsRef = useRef<RenderedLayerBounds[]>([]);
  const [showGuides, setShowGuides] = useState(false);
  const [snapCenter, setSnapCenter] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  const [pendingPin, setPendingPin] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [mediaTick, setMediaTick] = useState(0);

  // Trigger re-render when cached images/videos finish loading
  useEffect(() => {
    return mediaCache.onLoad(() => setMediaTick((n) => n + 1));
  }, []);

  // Render canvas frame whenever state or playhead changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    layerBoundsRef.current = renderCompositionFrame(
      ctx,
      project,
      currentTime,
      isPlaying
    );
  }, [project, currentTime, isPlaying, mediaTick]);

  const activeSelectedClip = project.clips.find(
    (c) =>
      c.id === selectedClipId &&
      currentTime >= c.start &&
      currentTime <= c.start + c.duration
  );

  const selectedBounds = activeSelectedClip
    ? layerBoundsRef.current.find((b) => b.clipId === activeSelectedClip.id)
    : undefined;

  // Helper to apply transform update while respecting existing keyframe tracks
  const applyTransformDelta = (
    clip: Clip,
    updates: Partial<Record<AnimatableProperty, number>>
  ) => {
    const localTime = Number((currentTime - clip.start).toFixed(3));
    const nextTransform = { ...clip.transform };
    const nextKeyframes = { ...clip.keyframes };

    for (const [prop, val] of Object.entries(updates) as Array<
      [AnimatableProperty, number]
    >) {
      nextTransform[prop] = val;
      const existingKfs = nextKeyframes[prop];
      if (existingKfs && existingKfs.length > 0) {
        const hitIdx = existingKfs.findIndex(
          (k) => Math.abs(k.time - localTime) <= 0.08
        );
        if (hitIdx >= 0) {
          nextKeyframes[prop] = existingKfs.map((k, idx) =>
            idx === hitIdx ? { ...k, value: val } : k
          );
        } else {
          nextKeyframes[prop] = [
            ...existingKfs,
            {
              id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              time: Math.max(0, Math.min(clip.duration, localTime)),
              value: val,
              easing: 'easeOut' as const,
            },
          ].sort((a, b) => a.time - b.time);
        }
      }
    }

    onUpdateClip(clip.id, {
      transform: nextTransform,
      keyframes: nextKeyframes,
    });
  };

  const getStagePercentCoords = (
    clientX: number,
    clientY: number
  ): { x: number; y: number } => {
    const el = stageWrapperRef.current;
    if (!el) return { x: 50, y: 50 };
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * 100,
    };
  };

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { x, y } = getStagePercentCoords(e.clientX, e.clientY);

    if (pinMode) {
      setPendingPin({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), text: '' });
      return;
    }

    // Hit test top-most layer first
    const bounds = [...layerBoundsRef.current].reverse();
    let hitClip: Clip | undefined;
    for (const b of bounds) {
      const halfW = Math.max(6, b.w / 2);
      const halfH = Math.max(6, b.h / 2);
      if (
        x >= b.cx - halfW &&
        x <= b.cx + halfW &&
        y >= b.cy - halfH &&
        y <= b.cy + halfH
      ) {
        const candidate = project.clips.find((c) => c.id === b.clipId);
        const track = project.tracks.find((t) => t.id === candidate?.trackId);
        if (candidate && !track?.locked) {
          hitClip = candidate;
          break;
        }
      }
    }

    if (!hitClip) {
      onSelectClip(null);
      return;
    }

    onSelectClip(hitClip.id);
    const startTf = evaluateClipTransform(hitClip, currentTime);
    const startMouse = { x, y };
    let lastEmit = 0;

    const onMove = (moveEvt: MouseEvent) => {
      const cur = getStagePercentCoords(moveEvt.clientX, moveEvt.clientY);
      let nextX = startTf.x + (cur.x - startMouse.x);
      let nextY = startTf.y + (cur.y - startMouse.y);

      const snapX = Math.abs(nextX - 50) < 1.5;
      const snapY = Math.abs(nextY - 50) < 1.5;
      if (snapX) nextX = 50;
      if (snapY) nextY = 50;
      setSnapCenter({ x: snapX, y: snapY });

      const now = performance.now();
      if (now - lastEmit > 32) {
        lastEmit = now;
        applyTransformDelta(hitClip!, {
          x: Number(nextX.toFixed(2)),
          y: Number(nextY.toFixed(2)),
        });
      }
    };

    const onUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSnapCenter({ x: false, y: false });
      const cur = getStagePercentCoords(upEvt.clientX, upEvt.clientY);
      let nextX = startTf.x + (cur.x - startMouse.x);
      let nextY = startTf.y + (cur.y - startMouse.y);
      if (Math.abs(nextX - 50) < 1.5) nextX = 50;
      if (Math.abs(nextY - 50) < 1.5) nextY = 50;
      applyTransformDelta(hitClip!, {
        x: Number(nextX.toFixed(2)),
        y: Number(nextY.toFixed(2)),
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleScaleHandleDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeSelectedClip) return;
    const startTf = evaluateClipTransform(activeSelectedClip, currentTime);
    const startPos = getStagePercentCoords(e.clientX, e.clientY);
    const startDist = Math.max(
      2,
      Math.hypot(startPos.x - startTf.x, startPos.y - startTf.y)
    );

    const onMove = (moveEvt: MouseEvent) => {
      const cur = getStagePercentCoords(moveEvt.clientX, moveEvt.clientY);
      const dist = Math.max(
        1,
        Math.hypot(cur.x - startTf.x, cur.y - startTf.y)
      );
      const nextScale = Math.max(
        0.15,
        Math.min(4, startTf.scale * (dist / startDist))
      );
      applyTransformDelta(activeSelectedClip, {
        scale: Number(nextScale.toFixed(2)),
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleRotateHandleDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeSelectedClip) return;
    const startTf = evaluateClipTransform(activeSelectedClip, currentTime);
    const startPos = getStagePercentCoords(e.clientX, e.clientY);
    const startAngle =
      (Math.atan2(startPos.y - startTf.y, startPos.x - startTf.x) * 180) /
      Math.PI;

    const onMove = (moveEvt: MouseEvent) => {
      const cur = getStagePercentCoords(moveEvt.clientX, moveEvt.clientY);
      const angle =
        (Math.atan2(cur.y - startTf.y, cur.x - startTf.x) * 180) / Math.PI;
      let nextRot = startTf.rotation + (angle - startAngle);
      if (Math.abs(nextRot) < 3) nextRot = 0;
      applyTransformDelta(activeSelectedClip, {
        rotation: Math.round(nextRot),
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const dims = getCanvasDimensions(project.aspectRatio);
  const aspectCss =
    project.aspectRatio === '9:16'
      ? '9 / 16'
      : project.aspectRatio === '1:1'
      ? '1 / 1'
      : '16 / 9';

  const visiblePinnedComments: ReviewComment[] = project.comments.filter(
    (c) =>
      c.x !== undefined &&
      c.y !== undefined &&
      !c.resolved &&
      (pinMode || Math.abs(c.time - currentTime) <= 0.75)
  );

  return (
    <section className="flex-1 min-w-0 bg-[#0A0C0F] flex flex-col overflow-hidden select-none">
      {/* Canvas Stage Area */}
      <div className="flex-1 min-h-0 p-4 flex items-center justify-center relative overflow-hidden">
        <div
          ref={stageWrapperRef}
          onMouseDown={handleStageMouseDown}
          onMouseMove={(e) => {
            const { x, y } = getStagePercentCoords(e.clientX, e.clientY);
            onCursorMove(Number(x.toFixed(2)), Number(y.toFixed(2)));
          }}
          onMouseLeave={onCursorLeave}
          style={{
            aspectRatio: aspectCss,
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          className={`relative bg-black shadow-2xl border border-[#232936] overflow-hidden ${
            pinMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />

          {/* Safe-Zone Guides Overlay */}
          {showGuides && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[5%] border border-white/15 border-dashed" />
              <div className="absolute inset-[10%] border border-white/10" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/15" />
            </div>
          )}

          {/* Snap-to-center guides during drag */}
          {snapCenter.x && (
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#3B82F6] pointer-events-none" />
          )}
          {snapCenter.y && (
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[#3B82F6] pointer-events-none" />
          )}

          {/* Remote collaborator selection highlights */}
          {remotePeers.map((peer) => {
            if (!peer.selectedClipId) return null;
            const b = layerBoundsRef.current.find(
              (item) => item.clipId === peer.selectedClipId
            );
            if (!b) return null;
            return (
              <div
                key={`sel-${peer.id}`}
                style={{
                  left: `${b.cx}%`,
                  top: `${b.cy}%`,
                  width: `${Math.min(100, Math.max(8, b.w))}%`,
                  height: `${Math.min(100, Math.max(8, b.h))}%`,
                  transform: `translate(-50%, -50%) rotate(${b.rotation}deg)`,
                  borderColor: peer.color,
                }}
                className="absolute border border-dashed pointer-events-none"
              >
                <span
                  style={{ backgroundColor: peer.color }}
                  className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-medium text-white rounded whitespace-nowrap"
                >
                  {peer.name}
                </span>
              </div>
            );
          })}

          {/* Active local selection gizmo */}
          {selectedBounds && activeSelectedClip && !pinMode && (
            <div
              style={{
                left: `${selectedBounds.cx}%`,
                top: `${selectedBounds.cy}%`,
                width: `${Math.min(98, Math.max(8, selectedBounds.w))}%`,
                height: `${Math.min(98, Math.max(8, selectedBounds.h))}%`,
                transform: `translate(-50%, -50%) rotate(${selectedBounds.rotation}deg)`,
              }}
              className="absolute border border-[#3B82F6] pointer-events-none"
            >
              {/* Rotation handle */}
              <div
                onMouseDown={handleRotateHandleDown}
                title="Drag to rotate"
                className="pointer-events-auto absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#3B82F6] border border-white cursor-grab"
              />
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3 bg-[#3B82F6]" />
              {/* Corner scale handles */}
              <div
                onMouseDown={handleScaleHandleDown}
                title="Drag to scale"
                className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#3B82F6] rounded-xs cursor-nwse-resize"
              />
              <div
                onMouseDown={handleScaleHandleDown}
                className="pointer-events-auto absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#3B82F6] rounded-xs cursor-nwse-resize"
              />
            </div>
          )}

          {/* Spatial review comment pins */}
          {visiblePinnedComments.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(c.time);
              }}
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
              title={`${c.authorName}: ${c.text}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 group z-20 cursor-pointer"
            >
              <span
                style={{ backgroundColor: c.authorColor }}
                className="w-5 h-5 rounded-full border-2 border-white shadow flex items-center justify-center text-[10px] font-bold text-white"
              >
                {c.authorName.slice(0, 1)}
              </span>
            </button>
          ))}

          {/* Pending comment pin popover */}
          {pendingPin && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                left: `${Math.min(72, Math.max(18, pendingPin.x))}%`,
                top: `${Math.min(78, Math.max(15, pendingPin.y))}%`,
              }}
              className="absolute -translate-x-1/2 z-30 w-56 rounded-md bg-[#131720] border border-[#3B82F6] p-2.5 shadow-xl"
            >
              <div className="text-[11px] font-medium text-[#9CA3AF] mb-1.5">
                Pin feedback at {formatTimecode(currentTime, project.fps)}
              </div>
              <input
                autoFocus
                value={pendingPin.text}
                onChange={(e) =>
                  setPendingPin({ ...pendingPin, text: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pendingPin.text.trim()) {
                    onCreatePinnedComment(currentTime, pendingPin.text, {
                      x: pendingPin.x,
                      y: pendingPin.y,
                    });
                    setPendingPin(null);
                    onDisablePinMode();
                  } else if (e.key === 'Escape') {
                    setPendingPin(null);
                  }
                }}
                placeholder="Write review note..."
                className="w-full bg-[#0B0D10] border border-[#262E3E] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#3B82F6]"
              />
              <div className="flex justify-end gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setPendingPin(null)}
                  className="px-2 py-1 text-[11px] text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pendingPin.text.trim()}
                  onClick={() => {
                    onCreatePinnedComment(currentTime, pendingPin.text, {
                      x: pendingPin.x,
                      y: pendingPin.y,
                    });
                    setPendingPin(null);
                    onDisablePinMode();
                  }}
                  className="px-2.5 py-1 rounded bg-[#3B82F6] text-[11px] font-semibold text-white disabled:opacity-40 cursor-pointer"
                >
                  Post
                </button>
              </div>
            </div>
          )}

          {/* Live Remote Collaborator Cursors */}
          {remotePeers.map((peer) => {
            if (!peer.cursor || peer.cursor.area !== 'canvas') return null;
            return (
              <div
                key={`cursor-${peer.id}`}
                style={{
                  left: `${peer.cursor.x}%`,
                  top: `${peer.cursor.y}%`,
                }}
                className="absolute pointer-events-none z-40 transition-[left,top] duration-75 ease-out"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="-translate-x-0.5 -translate-y-0.5 drop-shadow"
                >
                  <path
                    d="M2 1.5L13.5 7.5L7.8 9.2L5.5 14.5L2 1.5Z"
                    fill={peer.color}
                    stroke="#FFFFFF"
                    strokeWidth="1.2"
                  />
                </svg>
                <span
                  style={{ backgroundColor: peer.color }}
                  className="ml-3 -mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap shadow"
                >
                  {peer.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transport & Composition Control Bar */}
      <div className="h-11 shrink-0 bg-[#11141B] border-t border-[#222733] px-4 flex items-center justify-between gap-4">
        {/* Left: Timecode & Resolution */}
        <div className="flex items-center gap-3">
          <div className="font-mono text-xs tabular-nums flex items-center gap-1.5">
            <span className="text-white font-semibold">
              {formatTimecode(currentTime, project.fps)}
            </span>
            <span className="text-[#4B5563]">/</span>
            <span className="text-[#9CA3AF]">
              {formatTimecode(project.duration, project.fps)}
            </span>
          </div>
          <span className="hidden md:inline text-[11px] font-mono text-[#6B7280] tabular-nums">
            {dims.width}×{dims.height}
          </span>
        </div>

        {/* Center: Playback Transport */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to start"
            className="p-1.5 rounded text-[#9CA3AF] hover:text-white hover:bg-[#1C222E] transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 1 / project.fps))}
            title="Previous frame"
            className="p-1.5 rounded text-[#9CA3AF] hover:text-white hover:bg-[#1C222E] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            className="mx-1 w-8 h-8 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              onSeek(Math.min(project.duration, currentTime + 1 / project.fps))
            }
            title="Next frame"
            className="p-1.5 rounded text-[#9CA3AF] hover:text-white hover:bg-[#1C222E] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleLoop}
            title="Toggle loop playback"
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              loop
                ? 'text-[#3B82F6] bg-[#3B82F6]/15'
                : 'text-[#9CA3AF] hover:text-white hover:bg-[#1C222E]'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Aspect Ratio + Guides */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0B0D10] border border-[#232936] rounded p-0.5">
            {(['16:9', '9:16', '1:1'] as const).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => onChangeAspectRatio(ar)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                  project.aspectRatio === ar
                    ? 'bg-[#222938] text-white font-semibold'
                    : 'text-[#6B7280] hover:text-[#D1D5DB]'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowGuides((s) => !s)}
            title="Toggle safe-zone guides"
            className={`p-1.5 rounded border transition-colors cursor-pointer ${
              showGuides
                ? 'border-[#3B82F6] text-[#3B82F6] bg-[#3B82F6]/10'
                : 'border-[#232936] text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
