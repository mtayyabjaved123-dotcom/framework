export interface MediaAssetEntry {
  kind: 'image' | 'video' | 'audio';
  el: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  ready: boolean;
  error: boolean;
}

class MediaAssetCache {
  private cache = new Map<string, MediaAssetEntry>();
  private listeners = new Set<() => void>();

  onLoad(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }

  getImage(src: string): MediaAssetEntry {
    const existing = this.cache.get(`img:${src}`);
    if (existing) return existing;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const entry: MediaAssetEntry = {
      kind: 'image',
      el: img,
      ready: false,
      error: false,
    };
    this.cache.set(`img:${src}`, entry);

    img.onload = () => {
      entry.ready = true;
      this.notify();
    };
    img.onerror = () => {
      entry.error = true;
      this.notify();
    };
    img.src = src;
    return entry;
  }

  getVideo(src: string): MediaAssetEntry {
    const existing = this.cache.get(`vid:${src}`);
    if (existing) return existing;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const entry: MediaAssetEntry = {
      kind: 'video',
      el: video,
      ready: false,
      error: false,
    };
    this.cache.set(`vid:${src}`, entry);

    video.onloadeddata = () => {
      entry.ready = true;
      this.notify();
    };
    video.onerror = () => {
      entry.error = true;
      this.notify();
    };
    video.src = src;
    return entry;
  }
}

export const mediaCache = new MediaAssetCache();
