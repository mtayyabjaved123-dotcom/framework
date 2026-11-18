import React, { useState } from 'react';
import { Copy, Check, ExternalLink, X } from 'lucide-react';
import type { Collaborator } from '../types/editor';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  selfPeer: Collaborator;
  remotePeers: Collaborator[];
  onRenameSelf: (name: string) => void;
  onSwitchRoom: (newRoomId: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onClose,
  roomId,
  selfPeer,
  remotePeers,
  onRenameSelf,
  onSwitchRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [nameInput, setNameInput] = useState(selfPeer.name);
  const [roomInput, setRoomInput] = useState(roomId);

  if (!open) return null;

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-[#131720] border border-[#262E3E] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222836]">
          <h2 className="font-display text-sm font-semibold text-white">
            Real-Time Collaboration Session
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Invite Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9CA3AF]">
              Session Invite Link
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 bg-[#0B0D10] border border-[#252C3A] rounded px-3 py-2 text-xs font-mono text-[#D1D5DB] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Open this link in another browser window or share with teammates to sync cursors, keyframes, and clips live over WebSockets.
            </p>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#60A5FA] hover:underline pt-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Launch second collaborator window</span>
            </a>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9CA3AF]">
              Your Collaborator Name
            </label>
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRenameSelf(nameInput);
                }}
                className="flex-1 bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-3 py-2 text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onRenameSelf(nameInput)}
                className="px-3 py-2 rounded bg-[#1E2430] hover:bg-[#272F3F] text-xs font-medium text-[#E5E7EB] cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          {/* Switch Room */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9CA3AF]">
              Switch or Create Room ID
            </label>
            <div className="flex items-center gap-2">
              <input
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className="flex-1 bg-[#0B0D10] border border-[#252C3A] focus:border-[#3B82F6] rounded px-3 py-2 text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (roomInput.trim()) {
                    onSwitchRoom(roomInput.trim());
                    onClose();
                  }
                }}
                className="px-3 py-2 rounded bg-[#1E2430] hover:bg-[#272F3F] text-xs font-medium text-[#E5E7EB] cursor-pointer"
              >
                Join Room
              </button>
            </div>
          </div>

          {/* Active Collaborators */}
          <div className="space-y-2 pt-1 border-t border-[#222836]">
            <div className="text-xs font-medium text-[#9CA3AF]">
              Active in Room ({1 + remotePeers.length})
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              <div className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: selfPeer.color }}
                  />
                  <span className="text-white font-medium">{selfPeer.name}</span>
                </div>
                <span className="text-[#6B7280]">You</span>
              </div>
              {remotePeers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex items-center justify-between text-xs py-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: peer.color }}
                    />
                    <span className="text-[#D1D5DB]">{peer.name}</span>
                  </div>
                  <span className="text-[#10B981]">Connected</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
