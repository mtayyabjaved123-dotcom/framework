import React, { useState } from 'react';
import { Download, Share2, Check, Loader2 } from 'lucide-react';
import type { Collaborator } from '../types/editor';

interface TopBarProps {
  projectTitle: string;
  roomId: string;
  connected: boolean;
  peers: Collaborator[];
  selfId: string;
  activeLeftTab: 'media' | 'motion' | 'review';
  onChangeLeftTab: (tab: 'media' | 'motion' | 'review') => void;
  onUpdateTitle: (title: string) => void;
  onOpenShare: () => void;
  onExportVideo: () => void;
  exportProgress: number | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectTitle,
  roomId,
  connected,
  peers,
  selfId,
  activeLeftTab,
  onChangeLeftTab,
  onUpdateTitle,
  onOpenShare,
  onExportVideo,
  exportProgress,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(projectTitle);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== projectTitle) {
      onUpdateTitle(trimmed);
    } else {
      setDraftTitle(projectTitle);
    }
  };

  return (
    <header className="h-12 shrink-0 bg-[#0E1116] border-b border-[#222733] px-4 flex items-center justify-between gap-8 select-none">
      {/* Zone 1: Brand wordmark + room/project context */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-display text-base font-bold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0">
          Framecraft
        </span>
        <span className="text-[#4B5563] text-sm" aria-hidden="true">
          /
        </span>
        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setDraftTitle(projectTitle);
                setEditingTitle(false);
              }
            }}
            className="bg-[#161B23] border border-[#3B82F6] rounded px-2 py-0.5 text-sm text-[#F4F5F7] focus:outline-none w-48"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftTitle(projectTitle);
              setEditingTitle(true);
            }}
            title="Click to rename composition"
            className="text-sm font-medium text-[#D1D5DB] hover:text-white truncate max-w-[200px] text-left cursor-text"
          >
            {projectTitle}
          </button>
        )}
        <span className="hidden xl:inline text-xs text-[#6B7280] font-mono tabular-nums whitespace-nowrap shrink-0">
          {roomId}
        </span>
      </div>

      {/* Zone 2: Concise single-line workspace navigation */}
      <nav className="flex items-center gap-6 text-sm font-medium">
        {(
          [
            { id: 'media', label: 'Media' },
            { id: 'motion', label: 'Motion' },
            { id: 'review', label: 'Review' },
          ] as const
        ).map((tab) => {
          const active = activeLeftTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeLeftTab(tab.id)}
              className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-[#3B82F6] text-white'
                  : 'border-transparent text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Collaborator roster + Share & Primary Export CTA */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Real-time WebSocket connection + collaborator stack */}
        <div
          className="flex items-center gap-2 pr-1"
          title={connected ? 'Live WebSocket sync active' : 'Reconnecting...'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-[#10B981]' : 'bg-[#F59E0B] animate-pulse'
            }`}
          />
          <div className="flex -space-x-1.5">
            {peers.slice(0, 5).map((peer) => (
              <div
                key={peer.id}
                title={`${peer.name}${peer.id === selfId ? ' (You)' : ''}`}
                style={{ backgroundColor: peer.color }}
                className="w-6 h-6 rounded-full border border-[#0E1116] flex items-center justify-center text-[11px] font-semibold text-white uppercase shrink-0"
              >
                {peer.name.slice(0, 1)}
              </div>
            ))}
          </div>
          <span className="hidden lg:inline text-xs text-[#9CA3AF] tabular-nums whitespace-nowrap">
            {peers.length} {peers.length === 1 ? 'editor' : 'editors'}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2A3140] bg-[#161B23] hover:bg-[#1E2430] text-xs font-medium text-[#E5E7EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Collaborate</span>
        </button>

        <button
          type="button"
          onClick={onExportVideo}
          disabled={exportProgress !== null}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-70 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {exportProgress !== null ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="tabular-nums">Rendering {exportProgress}%</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Export Video</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
