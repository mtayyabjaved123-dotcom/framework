import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { createInitialProjectState } from './src/data/defaultProject.ts';
import type {
  ClientMessage,
  Clip,
  Collaborator,
  KeyframesMap,
  ProjectState,
  ServerMessage,
} from './src/types/editor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLLABORATOR_COLORS = [
  '#3B82F6',
  '#F59E0B',
  '#10B981',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
];

interface RoomData {
  state: ProjectState;
  clients: Map<WebSocket, Collaborator>;
  colorIndex: number;
}

const rooms = new Map<string, RoomData>();

interface UploadedMedia {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

const uploadedMediaStore = new Map<string, UploadedMedia>();
const MAX_STORED_MEDIA = 40;

function getOrCreateRoom(roomId: string): RoomData {
  const normalized = roomId.trim() || 'studio-main';
  let room = rooms.get(normalized);
  if (!room) {
    room = {
      state: createInitialProjectState(normalized),
      clients: new Map(),
      colorIndex: 0,
    };
    rooms.set(normalized, room);
  }
  return room;
}

function getRoomPeers(room: RoomData): Collaborator[] {
  return Array.from(room.clients.values());
}

function sendJson(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToRoom(
  room: RoomData,
  msg: ServerMessage,
  excludeWs?: WebSocket
): void {
  const payload = JSON.stringify(msg);
  for (const [clientWs] of room.clients) {
    if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
    }
  }
}

function mergeClipPatch(existing: Clip, patch: Partial<Clip>): Clip {
  return {
    ...existing,
    ...patch,
    id: existing.id, // Identity immutable
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

function splitClipAtTime(
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

  const left: Clip = {
    ...clip,
    duration: Number(localSplit.toFixed(3)),
    keyframes: leftKeyframes,
  };

  const right: Clip = {
    ...clip,
    id: newClipId,
    name: `${clip.name} (2)`,
    start: Number(splitTime.toFixed(3)),
    duration: Number((clip.duration - localSplit).toFixed(3)),
    mediaOffset: Number((clip.mediaOffset + localSplit).toFixed(3)),
    keyframes: rightKeyframes,
  };

  return { left, right };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  // Media upload endpoint so local files uploaded by one user play for all collaborators
  app.post('/api/media', (req, res) => {
    const { name, mimeType, dataBase64 } = req.body as {
      name?: string;
      mimeType?: string;
      dataBase64?: string;
    };
    if (!dataBase64 || !mimeType) {
      res.status(400).json({ error: 'Missing media payload' });
      return;
    }

    if (uploadedMediaStore.size >= MAX_STORED_MEDIA) {
      const oldestKey = uploadedMediaStore.keys().next().value;
      if (oldestKey) uploadedMediaStore.delete(oldestKey);
    }

    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const buffer = Buffer.from(dataBase64, 'base64');
    uploadedMediaStore.set(id, {
      buffer,
      mimeType,
      name: name || 'uploaded-media',
    });

    res.json({ url: `/api/media/${id}`, id });
  });

  app.get('/api/media/:id', (req, res) => {
    const item = uploadedMediaStore.get(req.params.id);
    if (!item) {
      res.status(404).send('Media not found');
      return;
    }
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('Content-Length', item.buffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(item.buffer);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'room:join') {
        // Leave previous room if switching rooms
        if (currentRoomId) {
          const prevRoom = rooms.get(currentRoomId);
          if (prevRoom) {
            prevRoom.clients.delete(ws);
            broadcastToRoom(prevRoom, {
              type: 'presence:peers',
              peers: getRoomPeers(prevRoom),
            });
          }
        }

        const room = getOrCreateRoom(msg.roomId);
        currentRoomId = room.state.roomId;
        currentUserId = msg.userId;

        const color =
          COLLABORATOR_COLORS[room.colorIndex % COLLABORATOR_COLORS.length];
        room.colorIndex += 1;

        const collaborator: Collaborator = {
          id: msg.userId,
          name: msg.name.slice(0, 28) || 'Editor',
          color,
          selectedClipId: null,
          cursor: null,
          lastSeen: Date.now(),
        };

        room.clients.set(ws, collaborator);

        // Send authoritative full state to joining client
        sendJson(ws, {
          type: 'room:state',
          state: room.state,
          peers: getRoomPeers(room),
          selfId: collaborator.id,
        });

        // Notify all peers of updated active roster
        broadcastToRoom(
          room,
          {
            type: 'presence:peers',
            peers: getRoomPeers(room),
          },
          ws
        );
        return;
      }

      if (!currentRoomId || !currentUserId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const self = room.clients.get(ws);
      if (!self) return;

      self.lastSeen = Date.now();

      switch (msg.type) {
        case 'presence:rename': {
          self.name = msg.name.trim().slice(0, 28) || self.name;
          broadcastToRoom(room, {
            type: 'presence:peers',
            peers: getRoomPeers(room),
          });
          break;
        }

        case 'presence:cursor': {
          self.cursor = msg.cursor;
          broadcastToRoom(
            room,
            {
              type: 'presence:cursor',
              userId: currentUserId,
              cursor: msg.cursor,
            },
            ws
          );
          break;
        }

        case 'presence:select': {
          self.selectedClipId = msg.clipId;
          broadcastToRoom(
            room,
            {
              type: 'presence:select',
              userId: currentUserId,
              clipId: msg.clipId,
            },
            ws
          );
          break;
        }

        case 'clip:create': {
          // Idempotency guard against duplicate create broadcasts
          if (room.state.clips.some((c) => c.id === msg.clip.id)) {
            return;
          }
          room.state.clips.push(msg.clip);
          // Expand project duration if clip extends beyond
          const clipEnd = msg.clip.start + msg.clip.duration;
          if (clipEnd > room.state.duration) {
            room.state.duration = Math.ceil(clipEnd);
          }
          broadcastToRoom(
            room,
            { type: 'clip:create', clip: msg.clip, actorId: currentUserId },
            ws
          );
          break;
        }

        case 'clip:update': {
          const idx = room.state.clips.findIndex((c) => c.id === msg.clipId);
          if (idx === -1) return;
          const updated = mergeClipPatch(room.state.clips[idx], msg.patch);
          room.state.clips[idx] = updated;
          const clipEnd = updated.start + updated.duration;
          if (clipEnd > room.state.duration) {
            room.state.duration = Math.ceil(clipEnd);
          }
          broadcastToRoom(
            room,
            {
              type: 'clip:update',
              clipId: msg.clipId,
              patch: msg.patch,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'clip:delete': {
          const exists = room.state.clips.some((c) => c.id === msg.clipId);
          if (!exists) return;
          room.state.clips = room.state.clips.filter((c) => c.id !== msg.clipId);
          for (const peer of room.clients.values()) {
            if (peer.selectedClipId === msg.clipId) {
              peer.selectedClipId = null;
            }
          }
          broadcastToRoom(
            room,
            {
              type: 'clip:delete',
              clipId: msg.clipId,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'clip:split': {
          if (room.state.clips.some((c) => c.id === msg.newClipId)) return;
          const idx = room.state.clips.findIndex((c) => c.id === msg.clipId);
          if (idx === -1) return;
          const splitRes = splitClipAtTime(
            room.state.clips[idx],
            msg.splitTime,
            msg.newClipId
          );
          if (!splitRes) return;
          room.state.clips[idx] = splitRes.left;
          room.state.clips.push(splitRes.right);
          broadcastToRoom(
            room,
            {
              type: 'clip:split',
              clipId: msg.clipId,
              splitTime: msg.splitTime,
              newClipId: msg.newClipId,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'track:update': {
          const tIdx = room.state.tracks.findIndex((t) => t.id === msg.trackId);
          if (tIdx === -1) return;
          room.state.tracks[tIdx] = {
            ...room.state.tracks[tIdx],
            ...msg.patch,
            id: room.state.tracks[tIdx].id,
          };
          broadcastToRoom(
            room,
            {
              type: 'track:update',
              trackId: msg.trackId,
              patch: msg.patch,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'comp:update': {
          room.state = {
            ...room.state,
            ...msg.patch,
            roomId: room.state.roomId,
          };
          broadcastToRoom(
            room,
            {
              type: 'comp:update',
              patch: msg.patch,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'comment:create': {
          if (room.state.comments.some((c) => c.id === msg.comment.id)) return;
          room.state.comments.push(msg.comment);
          broadcastToRoom(
            room,
            {
              type: 'comment:create',
              comment: msg.comment,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'comment:resolve': {
          const cIdx = room.state.comments.findIndex(
            (c) => c.id === msg.commentId
          );
          if (cIdx === -1) return;
          room.state.comments[cIdx] = {
            ...room.state.comments[cIdx],
            resolved: msg.resolved,
          };
          broadcastToRoom(
            room,
            {
              type: 'comment:resolve',
              commentId: msg.commentId,
              resolved: msg.resolved,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'comment:delete': {
          room.state.comments = room.state.comments.filter(
            (c) => c.id !== msg.commentId
          );
          broadcastToRoom(
            room,
            {
              type: 'comment:delete',
              commentId: msg.commentId,
              actorId: currentUserId,
            },
            ws
          );
          break;
        }

        case 'project:reset': {
          room.state = createInitialProjectState(room.state.roomId);
          for (const [clientWs, peer] of room.clients) {
            peer.selectedClipId = null;
            sendJson(clientWs, {
              type: 'room:state',
              state: room.state,
              peers: getRoomPeers(room),
              selfId: peer.id,
            });
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.clients.delete(ws);
      broadcastToRoom(room, {
        type: 'presence:peers',
        peers: getRoomPeers(room),
      });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Framecraft studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
