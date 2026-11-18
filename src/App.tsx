import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AssetBrowser } from './components/AssetBrowser';
import { MotionInspector } from './components/MotionInspector';
import { ShareModal } from './components/ShareModal';
import { StudioViewport } from './components/StudioViewport';
import { TimelineDock } from './components/TimelineDock';
import { TopBar } from './components/TopBar';
import { exportProjectToWebM } from './engine/exportVideo';
import { useCollaborativeRoom } from './hooks/useCollaborativeRoom';
import type { Clip } from './types/editor';

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room')?.trim() || 'launch-reel';
}

export default function App() {
  const [roomId, setRoomId] = useState<string>(getInitialRoomId);
  const {
    project,
    peers,
    remotePeers,
    selfPeer,
    connected,
    createClip,
    updateClip,
    deleteClip,
    splitClip,
    updateTrack,
    updateComposition,
    emitCursor,
    emitSelectClip,
    renameSelf,
    addComment,
    resolveComment,
    deleteComment,
    resetProject,
  } = useCollaborativeRoom(roomId);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-title-1');
  const [activeLeftTab, setActiveLeftTab] = useState<'media' | 'motion' | 'review'>('media');
  const [pinMode, setPinMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);

  const handleSelectClip = useCallback(
    (clipId: string | null) => {
      setSelectedClipId(clipId);
      emitSelectClip(clipId);
    },
    [emitSelectClip]
  );

  // Sync URL query param when switching rooms
  const handleSwitchRoom = useCallback((nextRoom: string) => {
    setRoomId(nextRoom);
    const url = new URL(window.location.href);
    url.searchParams.set('room', nextRoom);
    window.history.replaceState({}, '', url.toString());
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      lastFrameTsRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (now: number) => {
      if (lastFrameTsRef.current !== null) {
        const dt = (now - lastFrameTsRef.current) / 1000;
        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= project.duration) {
            if (loop) return 0;
            setIsPlaying(false);
            return project.duration;
          }
          return next;
        });
      }
      lastFrameTsRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, loop, project.duration]);

  const handleDuplicateClip = useCallback(
    (clip: Clip) => {
      const cloned: Clip = {
        ...clip,
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${clip.name} Copy`,
        start: Number(Math.min(project.duration - 0.5, clip.start + 0.5).toFixed(2)),
        transform: { ...clip.transform },
        effects: { ...clip.effects },
        keyframes: structuredClone(clip.keyframes),
      };
      createClip(cloned);
      handleSelectClip(cloned.id);
    },
    [createClip, handleSelectClip, project.duration]
  );

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      deleteClip(clipId);
      if (selectedClipId === clipId) {
        handleSelectClip(null);
      }
    },
    [deleteClip, handleSelectClip, selectedClipId]
  );

  const handleSplitClip = useCallback(
    (clipId: string, splitTime: number) => {
      const rightId = splitClip(clipId, splitTime);
      if (rightId) handleSelectClip(rightId);
    },
    [handleSelectClip, splitClip]
  );

  // Studio keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentTime((t) => Math.max(0, t - 1 / project.fps));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentTime((t) => Math.min(project.duration, t + 1 / project.fps));
      } else if (
        (e.code === 'Delete' || e.code === 'Backspace') &&
        selectedClipId
      ) {
        e.preventDefault();
        handleDeleteClip(selectedClipId);
      } else if (e.key.toLowerCase() === 's' && selectedClipId) {
        e.preventDefault();
        handleSplitClip(selectedClipId, currentTime);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentTime,
    handleDeleteClip,
    handleSplitClip,
    project.duration,
    project.fps,
    selectedClipId,
  ]);

  const handleExportVideo = async () => {
    if (exportProgress !== null) return;
    setIsPlaying(false);
    setExportProgress(0);
    try {
      const blob = await exportProjectToWebM(project, (pct) =>
        setExportProgress(pct)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = project.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      a.download = `${slug || 'framecraft-export'}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportProgress(null);
    }
  };

  const selectedClip =
    project.clips.find((c) => c.id === selectedClipId) || null;

  return (
    <div className="h-screen w-screen bg-[#0B0D10] text-[#F4F5F7] flex flex-col overflow-hidden">
      <TopBar
        projectTitle={project.title}
        roomId={roomId}
        connected={connected}
        peers={peers}
        selfId={selfPeer.id}
        activeLeftTab={activeLeftTab}
        onChangeLeftTab={setActiveLeftTab}
        onUpdateTitle={(title) => updateComposition({ title })}
        onOpenShare={() => setShareOpen(true)}
        onExportVideo={handleExportVideo}
        exportProgress={exportProgress}
      />

      {/* Main 3-Column Studio Workbench */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <AssetBrowser
          activeTab={activeLeftTab}
          onChangeTab={setActiveLeftTab}
          currentTime={currentTime}
          comments={project.comments}
          pinMode={pinMode}
          onTogglePinMode={() => setPinMode((p) => !p)}
          onAddClip={(clip) => {
            createClip(clip);
            handleSelectClip(clip.id);
          }}
          onJumpToTime={(t) => {
            setIsPlaying(false);
            setCurrentTime(t);
          }}
          onAddComment={(time, text) => addComment(time, text)}
          onResolveComment={resolveComment}
          onDeleteComment={deleteComment}
        />

        <StudioViewport
          project={project}
          currentTime={currentTime}
          isPlaying={isPlaying}
          loop={loop}
          selectedClipId={selectedClipId}
          remotePeers={remotePeers}
          pinMode={pinMode}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSeek={(t) => {
            setIsPlaying(false);
            setCurrentTime(Math.max(0, Math.min(project.duration, t)));
          }}
          onToggleLoop={() => setLoop((l) => !l)}
          onSelectClip={handleSelectClip}
          onUpdateClip={updateClip}
          onChangeAspectRatio={(aspectRatio) => updateComposition({ aspectRatio })}
          onCursorMove={(x, y) => emitCursor({ area: 'canvas', x, y })}
          onCursorLeave={() => emitCursor(null)}
          onCreatePinnedComment={(time, text, pin) =>
            addComment(time, text, pin)
          }
          onDisablePinMode={() => setPinMode(false)}
        />

        <MotionInspector
          project={project}
          selectedClip={selectedClip}
          currentTime={currentTime}
          onUpdateClip={updateClip}
          onDuplicateClip={handleDuplicateClip}
          onDeleteClip={handleDeleteClip}
          onUpdateComposition={updateComposition}
          onResetProject={resetProject}
        />
      </div>

      <TimelineDock
        project={project}
        currentTime={currentTime}
        selectedClipId={selectedClipId}
        remotePeers={remotePeers}
        onSeek={(t) => {
          setIsPlaying(false);
          setCurrentTime(Math.max(0, Math.min(project.duration, t)));
        }}
        onSelectClip={handleSelectClip}
        onUpdateClip={updateClip}
        onDeleteClip={handleDeleteClip}
        onDuplicateClip={handleDuplicateClip}
        onSplitClip={handleSplitClip}
        onUpdateTrack={updateTrack}
        onTimelineCursorMove={(timeSec, trackIdx) =>
          emitCursor({ area: 'timeline', x: timeSec, y: trackIdx })
        }
        onCursorLeave={() => emitCursor(null)}
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={roomId}
        selfPeer={selfPeer}
        remotePeers={remotePeers}
        onRenameSelf={renameSelf}
        onSwitchRoom={handleSwitchRoom}
      />
    </div>
  );
}
