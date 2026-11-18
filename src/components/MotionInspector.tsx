import React, { useState } from 'react';
import {
  Copy,
  Diamond,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  AnimatableProperty,
  AspectRatio,
  BlendMode,
  Clip,
  EasingType,
  ProjectState,
  TextAnimationType,
} from '../types/editor';
import {
  applyEasing,
  evaluateClipTransform,
  formatShortTime,
  getKeyframeAtTime,
  PROPERTY_LABELS,
} from '../utils/interpolation';

interface MotionInspectorProps {
  project: ProjectState;
  selectedClip: Clip | null;
  currentTime: number;
  onUpdateClip: (clipId: string, patch: Partial<Clip>) => void;
  onDuplicateClip: (clip: Clip) => void;
  onDeleteClip: (clipId: string) => void;
  onUpdateComposition: (
    patch: Partial<
      Pick<
        ProjectState,
        'title' | 'duration' | 'aspectRatio' | 'backgroundColor' | 'fps'
      >
    >
  ) => void;
  onResetProject: () => void;
}

const EASING_OPTIONS: Array<{ value: EasingType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeInOut', label: 'Ease In/Out' },
  { value: 'spring', label: 'Spring Overshoot' },
  { value: 'elastic', label: 'Elastic Bounce' },
];

const EasingCurvePreview: React.FC<{ easing: EasingType }> = ({ easing }) => {
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = applyEasing(t, easing);
    const px = 4 + t * 40;
    const py = 24 - y * 18;
    pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return (
    <svg width="48" height="28" viewBox="0 0 48 28" className="shrink-0">
      <rect
        x="1"
        y="1"
        width="46"
        height="26"
        rx="4"
        fill="#0B0D10"
        stroke="#262D3B"
      />
      <path
        d={pts.join(' ')}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const MotionInspector: React.FC<MotionInspectorProps> = ({
  project,
  selectedClip,
  currentTime,
  onUpdateClip,
  onDuplicateClip,
  onDeleteClip,
  onUpdateComposition,
  onResetProject,
}) => {
  const [activeEasing, setActiveEasing] = useState<EasingType>('easeOut');

  if (!selectedClip) {
    return (
      <aside className="w-[300px] shrink-0 bg-[#11141B] border-l border-[#222733] flex flex-col h-full overflow-y-auto p-4 space-y-5 select-none">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Composition Settings
          </h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Select a clip on the canvas or timeline to animate keyframes, typography, and color effects.
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-[#222733]">
          <div className="space-y-1">
            <label className="text-xs text-[#9CA3AF]">Project Name</label>
            <input
              value={project.title}
              onChange={(e) => onUpdateComposition({ title: e.target.value })}
              className="w-full bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs text-[#9CA3AF]">Duration (sec)</label>
              <input
                type="number"
                min={3}
                max={120}
                step={1}
                value={project.duration}
                onChange={(e) =>
                  onUpdateComposition({
                    duration: Math.max(3, Math.min(120, Number(e.target.value) || 15)),
                  })
                }
                className="w-full bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[#9CA3AF]">Frame Rate</label>
              <select
                value={project.fps}
                onChange={(e) =>
                  onUpdateComposition({ fps: Number(e.target.value) })
                }
                className="w-full bg-[#0B0D10] border border-[#252C3A] rounded px-2 py-1.5 text-xs font-mono tabular-nums text-white focus:outline-none"
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-[#9CA3AF]">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => onUpdateComposition({ aspectRatio: ar })}
                  className={`py-1.5 rounded text-xs font-mono tabular-nums border cursor-pointer ${
                    project.aspectRatio === ar
                      ? 'bg-[#3B82F6]/15 border-[#3B82F6] text-white'
                      : 'bg-[#0B0D10] border-[#252C3A] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-[#9CA3AF]">Stage Backdrop</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={project.backgroundColor}
                onChange={(e) =>
                  onUpdateComposition({ backgroundColor: e.target.value })
                }
                className="w-8 h-7 rounded bg-transparent border border-[#252C3A] cursor-pointer"
              />
              <span className="text-xs font-mono text-[#D1D5DB] uppercase">
                {project.backgroundColor}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-[#222733]">
          <button
            type="button"
            onClick={onResetProject}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded border border-[#2A3140] bg-[#161B24] hover:bg-[#1E2430] text-xs font-medium text-[#D1D5DB] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Starter Reel</span>
          </button>
        </div>
      </aside>
    );
  }

  const localTime = Math.max(
    0,
    Math.min(selectedClip.duration, Number((currentTime - selectedClip.start).toFixed(3)))
  );
  const currentTf = evaluateClipTransform(selectedClip, currentTime);

  const toggleKeyframe = (prop: AnimatableProperty) => {
    const existing = selectedClip.keyframes[prop] || [];
    const hit = getKeyframeAtTime(existing, localTime);
    if (hit) {
      onUpdateClip(selectedClip.id, {
        keyframes: {
          ...selectedClip.keyframes,
          [prop]: existing.filter((k) => k.id !== hit.id),
        },
      });
    } else {
      const next = [
        ...existing,
        {
          id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          time: localTime,
          value: currentTf[prop],
          easing: activeEasing,
        },
      ].sort((a, b) => a.time - b.time);
      onUpdateClip(selectedClip.id, {
        keyframes: {
          ...selectedClip.keyframes,
          [prop]: next,
        },
      });
    }
  };

  const setPropertyValue = (prop: AnimatableProperty, value: number) => {
    const existing = selectedClip.keyframes[prop];
    const nextTf = { ...selectedClip.transform, [prop]: value };

    if (existing && existing.length > 0) {
      const hit = getKeyframeAtTime(existing, localTime);
      const nextKfs = hit
        ? existing.map((k) =>
            k.id === hit.id ? { ...k, value, easing: activeEasing } : k
          )
        : [
            ...existing,
            {
              id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              time: localTime,
              value,
              easing: activeEasing,
            },
          ].sort((a, b) => a.time - b.time);

      onUpdateClip(selectedClip.id, {
        transform: nextTf,
        keyframes: { ...selectedClip.keyframes, [prop]: nextKfs },
      });
    } else {
      onUpdateClip(selectedClip.id, { transform: nextTf });
    }
  };

  const propRows: Array<{
    prop: AnimatableProperty;
    min: number;
    max: number;
    step: number;
    suffix: string;
  }> = [
    { prop: 'x', min: -20, max: 120, step: 0.5, suffix: '%' },
    { prop: 'y', min: -20, max: 120, step: 0.5, suffix: '%' },
    { prop: 'scale', min: 0.1, max: 3.5, step: 0.02, suffix: '×' },
    { prop: 'rotation', min: -180, max: 180, step: 1, suffix: '°' },
    { prop: 'opacity', min: 0, max: 1, step: 0.02, suffix: '' },
  ];

  return (
    <aside className="w-[300px] shrink-0 bg-[#11141B] border-l border-[#222733] flex flex-col h-full select-none">
      {/* Clip Header */}
      <div className="px-4 py-3 border-b border-[#222733] flex items-center justify-between gap-2 bg-[#0E1116]">
        <div className="min-w-0 flex-1">
          <input
            value={selectedClip.name}
            onChange={(e) =>
              onUpdateClip(selectedClip.id, { name: e.target.value })
            }
            className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none focus:bg-[#161B24] rounded px-1 -ml-1 py-0.5 truncate"
          />
          <div className="text-[11px] text-[#6B7280] flex items-center gap-1.5 mt-0.5">
            <span className="capitalize">{selectedClip.kind}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {formatShortTime(selectedClip.start)}–{formatShortTime(selectedClip.start + selectedClip.duration)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDuplicateClip(selectedClip)}
            title="Duplicate clip"
            className="p-1.5 rounded text-[#9CA3AF] hover:text-white hover:bg-[#1D2330] cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteClip(selectedClip.id)}
            title="Delete clip"
            className="p-1.5 rounded text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#1D2330] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inspector Scrollable Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Transform & Keyframe Animation */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#D1D5DB]">
              Transform & Keyframes
            </h3>
            <span className="text-[11px] font-mono text-[#6B7280] tabular-nums">
              +{localTime.toFixed(2)}s
            </span>
          </div>

          <div className="space-y-2.5">
            {propRows.map(({ prop, min, max, step, suffix }) => {
              const kfs = selectedClip.keyframes[prop];
              const hasAnyKf = Boolean(kfs && kfs.length > 0);
              const atKf = Boolean(getKeyframeAtTime(kfs, localTime));
              const val = currentTf[prop];
              return (
                <div key={prop} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleKeyframe(prop)}
                        title={
                          atKf
                            ? 'Remove keyframe at playhead'
                            : 'Add keyframe at playhead'
                        }
                        className={`p-0.5 rounded transition-colors cursor-pointer ${
                          atKf
                            ? 'text-[#3B82F6]'
                            : hasAnyKf
                            ? 'text-[#93C5FD]/60 hover:text-[#3B82F6]'
                            : 'text-[#4B5563] hover:text-[#D1D5DB]'
                        }`}
                      >
                        <Diamond
                          className="w-3.5 h-3.5"
                          fill={atKf ? 'currentColor' : 'none'}
                        />
                      </button>
                      <span className="text-xs text-[#9CA3AF]">
                        {PROPERTY_LABELS[prop]}
                      </span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#E5E7EB]">
                      {prop === 'scale' || prop === 'opacity'
                        ? val.toFixed(2)
                        : val.toFixed(1)}
                      {suffix}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={val}
                    onChange={(e) =>
                      setPropertyValue(prop, Number(e.target.value))
                    }
                    className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg cursor-pointer"
                  />
                </div>
              );
            })}
          </div>

          {/* Easing Curve Selector */}
          <div className="pt-2 border-t border-[#1E2430] flex items-center gap-2.5">
            <EasingCurvePreview easing={activeEasing} />
            <div className="flex-1 space-y-1">
              <label className="text-[11px] text-[#9CA3AF] block">
                Keyframe Easing Curve
              </label>
              <select
                value={activeEasing}
                onChange={(e) => {
                  const next = e.target.value as EasingType;
                  setActiveEasing(next);
                  // Also update any keyframe right at the playhead
                  const updatedKfs = { ...selectedClip.keyframes };
                  let changed = false;
                  for (const prop of Object.keys(updatedKfs) as AnimatableProperty[]) {
                    const list = updatedKfs[prop];
                    if (!list) continue;
                    const hit = getKeyframeAtTime(list, localTime);
                    if (hit) {
                      changed = true;
                      updatedKfs[prop] = list.map((k) =>
                        k.id === hit.id ? { ...k, easing: next } : k
                      );
                    }
                  }
                  if (changed) {
                    onUpdateClip(selectedClip.id, { keyframes: updatedKfs });
                  }
                }}
                className="w-full bg-[#0B0D10] border border-[#252C3A] rounded px-2 py-1 text-xs text-white focus:outline-none"
              >
                {EASING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Text Layer Controls */}
        {selectedClip.kind === 'text' && (
          <section className="space-y-3 pt-4 border-t border-[#222733]">
            <h3 className="text-xs font-semibold text-[#D1D5DB]">
              Kinetic Typography
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-[#9CA3AF]">Headline</label>
                <input
                  value={selectedClip.text ?? ''}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, { text: e.target.value })
                  }
                  className="w-full mt-1 bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9CA3AF]">Subtext</label>
                <input
                  value={selectedClip.subtext ?? ''}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, { subtext: e.target.value })
                  }
                  className="w-full mt-1 bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#9CA3AF]">Animation</label>
                  <select
                    value={selectedClip.textAnimation || 'none'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        textAnimation: e.target.value as TextAnimationType,
                      })
                    }
                    className="w-full mt-1 bg-[#0B0D10] border border-[#252C3A] rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="none">None</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="trackingExpand">Tracking Expand</option>
                    <option value="typewriter">Typewriter</option>
                    <option value="wordPop">Spring Pop</option>
                    <option value="glitch">Chromatic Glitch</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#9CA3AF]">Color</label>
                  <div className="mt-1 flex items-center gap-2 bg-[#0B0D10] border border-[#252C3A] rounded px-2 py-1">
                    <input
                      type="color"
                      value={selectedClip.textColor || '#F4F5F7'}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, {
                          textColor: e.target.value,
                        })
                      }
                      className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-[#D1D5DB]">
                      {selectedClip.textColor || '#F4F5F7'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#9CA3AF]">
                    Size ({selectedClip.fontSize ?? 64}px)
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={140}
                    value={selectedClip.fontSize ?? 64}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        fontSize: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg mt-2"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#9CA3AF]">
                    Tracking ({selectedClip.letterSpacing ?? 2})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={28}
                    value={selectedClip.letterSpacing ?? 2}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        letterSpacing: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg mt-2"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Motion Generator Controls */}
        {selectedClip.kind === 'motion' && (
          <section className="space-y-3 pt-4 border-t border-[#222733]">
            <h3 className="text-xs font-semibold text-[#D1D5DB]">
              Motion Generator
            </h3>
            {(selectedClip.motionType === 'lowerThird' ||
              selectedClip.motionType === 'kineticBadge') && (
              <div className="space-y-2">
                <input
                  value={selectedClip.text ?? ''}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, { text: e.target.value })
                  }
                  placeholder="Primary label"
                  className="w-full bg-[#0B0D10] border border-[#252C3A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
                {selectedClip.motionType === 'lowerThird' && (
                  <input
                    value={selectedClip.subtext ?? ''}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, { subtext: e.target.value })
                    }
                    placeholder="Role / Subtitle"
                    className="w-full bg-[#0B0D10] border border-[#252C3A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  />
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#9CA3AF]">Accent Color</span>
              <input
                type="color"
                value={selectedClip.accentColor || '#3B82F6'}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { accentColor: e.target.value })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#252C3A] cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                <span>Motion Speed</span>
                <span className="font-mono tabular-nums">
                  {(selectedClip.speed ?? 1).toFixed(1)}×
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={selectedClip.speed ?? 1}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    speed: Number(e.target.value),
                  })
                }
                className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg mt-1"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                <span>Intensity</span>
                <span className="font-mono tabular-nums">
                  {Math.round((selectedClip.intensity ?? 0.8) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.5}
                step={0.05}
                value={selectedClip.intensity ?? 0.8}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    intensity: Number(e.target.value),
                  })
                }
                className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg mt-1"
              />
            </div>
          </section>
        )}

        {/* Shape Controls */}
        {selectedClip.kind === 'shape' && (
          <section className="space-y-3 pt-4 border-t border-[#222733]">
            <h3 className="text-xs font-semibold text-[#D1D5DB]">Vector Shape</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#9CA3AF]">Stroke Color</label>
                <input
                  type="color"
                  value={selectedClip.strokeColor || '#3B82F6'}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, { strokeColor: e.target.value })
                  }
                  className="mt-1 w-full h-7 rounded bg-[#0B0D10] border border-[#252C3A] cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9CA3AF]">
                  Stroke ({selectedClip.strokeWidth ?? 3}px)
                </label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={selectedClip.strokeWidth ?? 3}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      strokeWidth: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg mt-3"
                />
              </div>
            </div>
          </section>
        )}

        {/* Compositing & Color Grade */}
        <section className="space-y-3 pt-4 border-t border-[#222733]">
          <h3 className="text-xs font-semibold text-[#D1D5DB]">
            Compositing & Color
          </h3>
          <div>
            <label className="text-[11px] text-[#9CA3AF]">Blend Mode</label>
            <select
              value={selectedClip.effects.blendMode}
              onChange={(e) =>
                onUpdateClip(selectedClip.id, {
                  effects: {
                    ...selectedClip.effects,
                    blendMode: e.target.value as BlendMode,
                  },
                })
              }
              className="w-full mt-1 bg-[#0B0D10] border border-[#252C3A] rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="source-over">Normal</option>
              <option value="screen">Screen</option>
              <option value="multiply">Multiply</option>
              <option value="overlay">Overlay</option>
              <option value="lighter">Additive (Lighter)</option>
            </select>
          </div>

          {(
            [
              { key: 'blur', label: 'Gaussian Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
              { key: 'brightness', label: 'Brightness', min: 40, max: 160, step: 1, unit: '%' },
              { key: 'contrast', label: 'Contrast', min: 50, max: 160, step: 1, unit: '%' },
              { key: 'saturate', label: 'Saturation', min: 0, max: 200, step: 2, unit: '%' },
              { key: 'vignette', label: 'Vignette', min: 0, max: 0.9, step: 0.05, unit: '' },
            ] as const
          ).map((fx) => (
            <div key={fx.key} className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#9CA3AF]">{fx.label}</span>
                <span className="font-mono tabular-nums text-[#E5E7EB]">
                  {selectedClip.effects[fx.key]}
                  {fx.unit}
                </span>
              </div>
              <input
                type="range"
                min={fx.min}
                max={fx.max}
                step={fx.step}
                value={selectedClip.effects[fx.key]}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    effects: {
                      ...selectedClip.effects,
                      [fx.key]: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-[#3B82F6] h-1 bg-[#252C3A] rounded-lg cursor-pointer"
              />
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
};
