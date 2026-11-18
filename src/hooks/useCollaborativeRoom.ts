import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialProjectState } from '../data/defaultProject';
import type {
  ClientMessage,
  Clip,
  Collaborator,
  CollaboratorCursor,
  KeyframesMap,
  ProjectState,
  ReviewComment,
  ServerMessage,
  Track,
} from '../types/editor';

function mergeClip(existing: Clip, patch: Partial<Clip>): Clip {
  return {
    ...existing,
    ...patch,
    id: existing.id,
    transform: patch.transform
      ? { ...existing.transform, ...patch.transform }
      : existing.transform,
    effects: patch.effects
      ? { ...existing.effects, ...patch.effects }
      : existing.effects,
    keyframes: patch.keyframes
      ? { ...existing.keyframes, ...patch.keyframes }
      : existing.keyframes,
  };
}

function splitClipLocal(
  clip: Clip,
  splitTime: number,
  newClipId: string
): { left: Clip; right: Clip } | null {
  const localSplit = splitTime - clip.start;
  if (localSplit <= 0.15 || localSplit >= clip.duration - 0.15) {
    return null;
  }
  const leftKeyframes: KeyframesMap = {};
  const rightKeyframes: KeyframesMap = {};

  for (const [prop, kfs] of Object.entries(clip.keyframes) as Array<
    [keyof KeyframesMap, NonNullable<KeyframesMap[keyof KeyframesMap]>]
  >) {
    if (!kfs) continue;
    leftKeyframes[prop] = kfs
      .filter((k) => k.time <= localSplit)
      .map((k) => ({ ...k }));
    rightKeyframes[prop] = kfs
      .filter((k) => k.time >= localSplit)
      .map((k) => ({ ...k, time: Number((k.time - localSplit).toFixed(3)) }));
  }

  return {
    left: {
      ...clip,
      duration: Number(localSplit.toFixed(3)),
      keyframes: leftKeyframes,
    },
    right: {
      ...clip,
      id: newClipId,
      name: `${clip.name} (2)`,
      start: Number(splitTime.toFixed(3)),
      duration: Number((clip.duration - localSplit).toFixed(3)),
      mediaOffset: Number((clip.mediaOffset + localSplit).toFixed(3)),
      keyframes: rightKeyframes,
    },
  };
}

const DEFAULT_NAMES = [
  'Alex Mercer',
  'Sora Takahashi',
  'Maya Lin',
  'Julian Reed',
  'Nadia Silva',
];

function getInitialUserIdentity(): { userId: string; name: string } {
  let userId = sessionStorage.getItem('framecraft_user_id');
  if (!userId) {
    userId = `usr_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('framecraft_user_id', userId);
  }
  let name = localStorage.getItem('framecraft_user_name');
  if (!name) {
    name = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    localStorage.setItem('framecraft_user_name', name);
  }
  return { userId, name };
}

export function useCollaborativeRoom(roomId: string) {
  const [identity] = useState(getInitialUserIdentity);
  const [project, setProject] = useState<ProjectState>(() =>
    createInitialProjectState(roomId)
  );
  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<ClientMessage[]>([]);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastCursorEmitRef = useRef<number>(0);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingQueueRef.current.push(msg);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId,
            userId: identity.userId,
            name: identity.name,
          } satisfies ClientMessage)
        );
        while (pendingQueueRef.current.length > 0) {
          const queued = pendingQueueRef.current.shift();
          if (queued) ws.send(JSON.stringify(queued));
        }
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'room:state':
            setProject(msg.state);
            setPeers(msg.peers);
            break;

          case 'presence:peers':
            setPeers(msg.peers);
            break;

          case 'presence:cursor':
            setPeers((prev) =>
              prev.map((p) =>
                p.id === msg.userId ? { ...p, cursor: msg.cursor } : p
              )
            );
            break;

          case 'presence:select':
            setPeers((prev) =>
              prev.map((p) =>
                p.id === msg.userId
                  ? { ...p, selectedClipId: msg.clipId }
                  : p
              )
            );
            break;

          case 'clip:create':
            setProject((prev) => {
              if (prev.clips.some((c) => c.id === msg.clip.id)) return prev;
              const end = msg.clip.start + msg.clip.duration;
              return {
                ...prev,
                duration: Math.max(prev.duration, Math.ceil(end)),
                clips: [...prev.clips, msg.clip],
              };
            });
            break;

          case 'clip:update':
            setProject((prev) => {
              let maxEnd = prev.duration;
              const clips = prev.clips.map((c) => {
                if (c.id !== msg.clipId) return c;
                const merged = mergeClip(c, msg.patch);
                maxEnd = Math.max(maxEnd, Math.ceil(merged.start + merged.duration));
                return merged;
              });
              return { ...prev, duration: maxEnd, clips };
            });
            break;

          case 'clip:delete':
            setProject((prev) => ({
              ...prev,
              clips: prev.clips.filter((c) => c.id !== msg.clipId),
            }));
            break;

          case 'clip:split':
            setProject((prev) => {
              if (prev.clips.some((c) => c.id === msg.newClipId)) return prev;
              const idx = prev.clips.findIndex((c) => c.id === msg.clipId);
              if (idx === -1) return prev;
              const res = splitClipLocal(
                prev.clips[idx],
                msg.splitTime,
                msg.newClipId
              );
              if (!res) return prev;
              const nextClips = [...prev.clips];
              nextClips[idx] = res.left;
              nextClips.push(res.right);
              return { ...prev, clips: nextClips };
            });
            break;

          case 'track:update':
            setProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === msg.trackId ? { ...t, ...msg.patch, id: t.id } : t
              ),
            }));
            break;

          case 'comp:update':
            setProject((prev) => ({ ...prev, ...msg.patch, roomId: prev.roomId }));
            break;

          case 'comment:create':
            setProject((prev) => {
              if (prev.comments.some((c) => c.id === msg.comment.id)) return prev;
              return { ...prev, comments: [...prev.comments, msg.comment] };
            });
            break;

          case 'comment:resolve':
            setProject((prev) => ({
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === msg.commentId ? { ...c, resolved: msg.resolved } : c
              ),
            }));
            break;

          case 'comment:delete':
            setProject((prev) => ({
              ...prev,
              comments: prev.comments.filter((c) => c.id !== msg.commentId),
            }));
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        const delay = Math.min(4000, 400 * Math.pow(1.6, attempt));
        attempt += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [roomId, identity.userId, identity.name]);

  const selfPeer = peers.find((p) => p.id === identity.userId) || {
    id: identity.userId,
    name: identity.name,
    color: '#3B82F6',
    selectedClipId: null,
    cursor: null,
    lastSeen: Date.now(),
  };

  const remotePeers = peers.filter((p) => p.id !== identity.userId);

  const createClip = useCallback(
    (clip: Clip) => {
      setProject((prev) => {
        if (prev.clips.some((c) => c.id === clip.id)) return prev;
        return {
          ...prev,
          duration: Math.max(prev.duration, Math.ceil(clip.start + clip.duration)),
          clips: [...prev.clips, clip],
        };
      });
      sendMessage({ type: 'clip:create', clip });
    },
    [sendMessage]
  );

  const updateClip = useCallback(
    (clipId: string, patch: Partial<Clip>) => {
      setProject((prev) => {
        let maxEnd = prev.duration;
        const clips = prev.clips.map((c) => {
          if (c.id !== clipId) return c;
          const merged = mergeClip(c, patch);
          maxEnd = Math.max(maxEnd, Math.ceil(merged.start + merged.duration));
          return merged;
        });
        return { ...prev, duration: maxEnd, clips };
      });
      sendMessage({ type: 'clip:update', clipId, patch });
    },
    [sendMessage]
  );

  const deleteClip = useCallback(
    (clipId: string) => {
      setProject((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
      }));
      sendMessage({ type: 'clip:delete', clipId });
    },
    [sendMessage]
  );

  const splitClip = useCallback(
    (clipId: string, splitTime: number): string | null => {
      const newClipId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let didSplit = false;
      setProject((prev) => {
        const idx = prev.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return prev;
        const res = splitClipLocal(prev.clips[idx], splitTime, newClipId);
        if (!res) return prev;
        didSplit = true;
        const nextClips = [...prev.clips];
        nextClips[idx] = res.left;
        nextClips.push(res.right);
        return { ...prev, clips: nextClips };
      });
      if (didSplit) {
        sendMessage({ type: 'clip:split', clipId, splitTime, newClipId });
        return newClipId;
      }
      return null;
    },
    [sendMessage]
  );

  const updateTrack = useCallback(
    (trackId: string, patch: Partial<Track>) => {
      setProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === trackId ? { ...t, ...patch, id: t.id } : t
        ),
      }));
      sendMessage({ type: 'track:update', trackId, patch });
    },
    [sendMessage]
  );

  const updateComposition = useCallback(
    (
      patch: Partial<
        Pick<
          ProjectState,
          'title' | 'duration' | 'aspectRatio' | 'backgroundColor' | 'fps'
        >
      >
    ) => {
      setProject((prev) => ({ ...prev, ...patch }));
      sendMessage({ type: 'comp:update', patch });
    },
    [sendMessage]
  );

  const emitCursor = useCallback(
    (cursor: CollaboratorCursor | null) => {
      const now = performance.now();
      if (cursor !== null && now - lastCursorEmitRef.current < 38) return;
      lastCursorEmitRef.current = now;
      sendMessage({ type: 'presence:cursor', cursor });
    },
    [sendMessage]
  );

  const emitSelectClip = useCallback(
    (clipId: string | null) => {
      sendMessage({ type: 'presence:select', clipId });
    },
    [sendMessage]
  );

  const renameSelf = useCallback(
    (newName: string) => {
      const clean = newName.trim().slice(0, 28);
      if (!clean) return;
      localStorage.setItem('framecraft_user_name', clean);
      identity.name = clean;
      setPeers((prev) =>
        prev.map((p) => (p.id === identity.userId ? { ...p, name: clean } : p))
      );
      sendMessage({ type: 'presence:rename', name: clean });
    },
    [identity, sendMessage]
  );

  const addComment = useCallback(
    (time: number, text: string, pin?: { x: number; y: number }) => {
      const comment: ReviewComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: Number(time.toFixed(2)),
        x: pin?.x,
        y: pin?.y,
        authorId: identity.userId,
        authorName: selfPeer.name,
        authorColor: selfPeer.color,
        text: text.trim(),
        createdAt: Date.now(),
        resolved: false,
      };
      setProject((prev) => ({
        ...prev,
        comments: [...prev.comments, comment],
      }));
      sendMessage({ type: 'comment:create', comment });
    },
    [identity.userId, selfPeer.name, selfPeer.color, sendMessage]
  );

  const resolveComment = useCallback(
    (commentId: string, resolved: boolean) => {
      setProject((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === commentId ? { ...c, resolved } : c
        ),
      }));
      sendMessage({ type: 'comment:resolve', commentId, resolved });
    },
    [sendMessage]
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      setProject((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
      }));
      sendMessage({ type: 'comment:delete', commentId });
    },
    [sendMessage]
  );

  const resetProject = useCallback(() => {
    sendMessage({ type: 'project:reset' });
  }, [sendMessage]);

  return {
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
  };
}
