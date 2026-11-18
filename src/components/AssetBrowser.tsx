import React, { useRef, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Plus,
  Type,
  Square,
  Upload,
  Sparkles,
  MessageSquare,
  Check,
  Trash2,
  MapPin,
} from 'lucide-react';
import { MOTION_PRESETS, STOCK_MEDIA_LIBRARY } from '../data/defaultProject';
import type { Clip, ReviewComment } from '../types/editor';
import { formatShortTime } from '../utils/interpolation';

interface AssetBrowserProps {
  activeTab: 'media' | 'motion' | 'review';
  onChangeTab: (tab: 'media' | 'motion' | 'review') => void;
  currentTime: number;
  comments: ReviewComment[];
  pinMode: boolean;
  onTogglePinMode: () => void;
  onAddClip: (clip: Clip) => void;
  onJumpToTime: (time: number) => void;
  onAddComment: (time: number, text: string) => void;
  onResolveComment: (id: string, resolved: boolean) => void;
  onDeleteComment: (id: string) => void;
}

const DEFAULT_EFFECTS = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  saturate: 100,
  vignette: 0,
  blendMode: 'source-over' as const,
};

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  activeTab,
  onChangeTab,
  currentTime,
  comments,
  pinMode,
  onTogglePinMode,
  onAddClip,
  onJumpToTime,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<
    Array<{ id: string; name: string; src: string; kind: 'image' | 'video' }>
  >([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const result = String(reader.result || '');
          const commaIdx = result.indexOf(',');
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: base64,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { url: string; id: string };
        const kind: 'image' | 'video' = file.type.startsWith('video/')
          ? 'video'
          : 'image';
        setUploadedAssets((prev) => [
          { id: data.id, name: file.name, src: data.url, kind },
          ...prev,
        ]);
        // Automatically insert into timeline at playhead
        onAddClip({
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          trackId: 'track-v1',
          kind,
          name: file.name.replace(/\.[^/.]+$/, '').slice(0, 24),
          start: Number(currentTime.toFixed(2)),
          duration: 4.5,
          mediaOffset: 0,
          src: data.url,
          transform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
          keyframes: {},
          effects: { ...DEFAULT_EFFECTS },
        });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addMediaToTimeline = (
    name: string,
    src: string,
    kind: 'image' | 'video'
  ) => {
    onAddClip({
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: 'track-v1',
      kind,
      name,
      start: Number(currentTime.toFixed(2)),
      duration: 4.5,
      mediaOffset: 0,
      src,
      transform: { x: 50, y: 50, scale: 1.04, rotation: 0, opacity: 1 },
      keyframes: {
        scale: [
          { id: `kf-${Date.now()}-1`, time: 0, value: 1.0, easing: 'linear' },
          { id: `kf-${Date.now()}-2`, time: 4.5, value: 1.1, easing: 'easeOut' },
        ],
      },
      effects: { ...DEFAULT_EFFECTS, vignette: 0.25 },
    });
  };

  const addQuickText = () => {
    onAddClip({
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: 'track-v2',
      kind: 'text',
      name: 'Title Layer',
      start: Number(currentTime.toFixed(2)),
      duration: 3.5,
      mediaOffset: 0,
      text: 'NEW TITLE',
      subtext: 'DOUBLE-CLICK TO EDIT',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 64,
      fontWeight: 700,
      letterSpacing: 4,
      textColor: '#F4F5F7',
      textAlign: 'center',
      textAnimation: 'slideUp',
      transform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
      keyframes: {
        opacity: [
          { id: `kf-${Date.now()}-o1`, time: 0, value: 0, easing: 'linear' },
          { id: `kf-${Date.now()}-o2`, time: 0.4, value: 1, easing: 'easeOut' },
        ],
      },
      effects: { ...DEFAULT_EFFECTS },
    });
  };

  const addQuickShape = () => {
    onAddClip({
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: 'track-v3',
      kind: 'shape',
      name: 'Vector Frame',
      start: Number(currentTime.toFixed(2)),
      duration: 4.0,
      mediaOffset: 0,
      shapeType: 'rect',
      fillColor: 'rgba(59, 130, 246, 0.14)',
      strokeColor: '#3B82F6',
      strokeWidth: 3,
      cornerRadius: 12,
      width: 32,
      height: 22,
      transform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
      keyframes: {},
      effects: { ...DEFAULT_EFFECTS },
    });
  };

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    onAddComment(currentTime, commentDraft);
    setCommentDraft('');
  };

  const sortedComments = [...comments].sort((a, b) => a.time - b.time);

  return (
    <aside className="w-[272px] shrink-0 bg-[#11141B] border-r border-[#222733] flex flex-col h-full select-none">
      {/* Segmented panel selector */}
      <div className="p-2.5 border-b border-[#222733] grid grid-cols-3 gap-1 bg-[#0E1116]">
        {(
          [
            { id: 'media', label: 'Media', icon: Film },
            { id: 'motion', label: 'Motion', icon: Sparkles },
            { id: 'review', label: 'Review', icon: MessageSquare },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#1D2432] text-white'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#171C26]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable panel body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'media' && (
          <>
            {/* Quick Insert Layers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3AF]">
                  Create Layer
                </span>
                <span className="text-[11px] font-mono text-[#6B7280] tabular-nums">
                  @{formatShortTime(currentTime)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={addQuickText}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#181D27] hover:bg-[#202736] border border-[#262D3B] text-xs font-medium text-[#E5E7EB] transition-colors cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>Add Text</span>
                </button>
                <button
                  type="button"
                  onClick={addQuickShape}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#181D27] hover:bg-[#202736] border border-[#262D3B] text-xs font-medium text-[#E5E7EB] transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Add Shape</span>
                </button>
              </div>
            </div>

            {/* Upload Local Video / Image */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-md border border-dashed border-[#333C4F] hover:border-[#3B82F6] bg-[#141821] hover:bg-[#181E2B] text-xs font-medium text-[#D1D5DB] transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>{uploading ? 'Syncing media...' : 'Import Video or Image'}</span>
              </button>
            </div>

            {uploadedAssets.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#9CA3AF]">
                  Room Uploads
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {uploadedAssets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        addMediaToTimeline(item.name, item.src, item.kind)
                      }
                      className="group text-left rounded-md overflow-hidden border border-[#262D3B] hover:border-[#3B82F6] bg-[#161B24] transition-colors cursor-pointer"
                    >
                      <div className="aspect-video bg-[#0B0D10] flex items-center justify-center overflow-hidden relative">
                        {item.kind === 'image' ? (
                          <img
                            src={item.src}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Film className="w-5 h-5 text-[#6B7280]" />
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/70 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-3 h-3 text-white" />
                        </span>
                      </div>
                      <div className="p-1.5">
                        <div className="text-[11px] font-medium text-[#E5E7EB] truncate">
                          {item.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Studio Stock Footage Plates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3AF]">
                  Studio Plates
                </span>
                <span className="text-[11px] text-[#6B7280]">Click to insert</span>
              </div>
              <div className="space-y-2.5">
                {STOCK_MEDIA_LIBRARY.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addMediaToTimeline(item.name, item.src, 'image')}
                    className="group w-full text-left rounded-md overflow-hidden border border-[#232936] hover:border-[#3B82F6] bg-[#161B24] transition-colors cursor-pointer"
                  >
                    <div className="aspect-video w-full bg-[#0E1117] relative overflow-hidden">
                      {!failedImages[item.id] ? (
                        <img
                          src={item.src}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#161B24] to-[#0D1016] text-[#6B7280]">
                          <ImageIcon className="w-5 h-5" />
                          <span className="text-[11px]">{item.name}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[#D1D5DB]/80 flex items-center gap-1.5">
                            <span>{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{item.duration}</span>
                          </div>
                        </div>
                        <span className="w-6 h-6 rounded bg-[#3B82F6] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'motion' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3AF]">
                Motion Graphics Generators
              </span>
              <span className="text-[11px] font-mono text-[#6B7280] tabular-nums">
                @{formatShortTime(currentTime)}
              </span>
            </div>
            <div className="space-y-2">
              {MOTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const targetTrack =
                      preset.kind === 'text' ? 'track-v2' : 'track-v3';
                    onAddClip(preset.factory(targetTrack, Number(currentTime.toFixed(2))));
                  }}
                  className="w-full text-left p-2.5 rounded-md border border-[#232936] hover:border-[#3B82F6] bg-[#161B24] hover:bg-[#1B212D] transition-colors group cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F4F5F7]">
                      {preset.name}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#3B82F6] shrink-0" />
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] mt-1 leading-relaxed">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3AF]">
                Timecoded Notes ({comments.length})
              </span>
              <button
                type="button"
                onClick={onTogglePinMode}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  pinMode
                    ? 'bg-[#3B82F6] text-white'
                    : 'bg-[#181D27] text-[#9CA3AF] hover:text-white border border-[#262D3B]'
                }`}
              >
                <MapPin className="w-3 h-3" />
                <span>{pinMode ? 'Pinning On' : 'Pin Frame'}</span>
              </button>
            </div>

            <form onSubmit={submitComment} className="space-y-2">
              <textarea
                rows={2}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={`Leave a note at ${formatShortTime(currentTime)}...`}
                className="w-full rounded-md bg-[#0E1116] border border-[#272E3D] focus:border-[#3B82F6] px-2.5 py-2 text-xs text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none resize-none"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim()}
                className="w-full py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Post Note at {formatShortTime(currentTime)}
              </button>
            </form>

            <div className="space-y-2 pt-1">
              {sortedComments.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B7280]">
                  No review notes yet. Scrub to a frame and leave feedback for collaborators.
                </div>
              ) : (
                sortedComments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-2.5 rounded-md border transition-colors ${
                      c.resolved
                        ? 'border-[#1E2430] bg-[#12151C] opacity-60'
                        : 'border-[#252C3A] bg-[#161B24]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.authorColor }}
                        />
                        <span className="text-xs font-medium text-[#E5E7EB] truncate">
                          {c.authorName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJumpToTime(c.time)}
                        className="text-[11px] font-mono tabular-nums text-[#60A5FA] hover:underline shrink-0 cursor-pointer"
                      >
                        @{formatShortTime(c.time)}
                      </button>
                    </div>
                    <p className="text-xs text-[#D1D5DB] mt-1.5 leading-relaxed">
                      {c.text}
                    </p>
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => onResolveComment(c.id, !c.resolved)}
                        className="flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#10B981] cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>{c.resolved ? 'Reopen' : 'Resolve'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteComment(c.id)}
                        className="text-[11px] text-[#9CA3AF] hover:text-[#EF4444] cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
