import type {
  AnimatableProperty,
  AspectRatio,
  Clip,
  ClipTransform,
  EasingType,
  Keyframe,
} from '../types/editor';

export function applyEasing(t: number, easing: EasingType): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return clamped;
    case 'easeIn':
      return clamped * clamped * clamped;
    case 'easeOut':
      return 1 - Math.pow(1 - clamped, 3);
    case 'easeInOut':
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    case 'spring': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
    }
    case 'elastic': {
      if (clamped === 0 || clamped === 1) return clamped;
      const c4 = (2 * Math.PI) / 3;
      return (
        Math.pow(2, -10 * clamped) * Math.sin((clamped * 10 - 0.75) * c4) + 1
      );
    }
    default:
      return clamped;
  }
}

export function evaluateProperty(
  baseValue: number,
  keyframes: Keyframe[] | undefined,
  localTime: number
): number {
  if (!keyframes || keyframes.length === 0) return baseValue;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  if (localTime <= sorted[0].time) return sorted[0].value;
  if (localTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (localTime >= k1.time && localTime <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0.0001) return k2.value;
      const rawT = (localTime - k1.time) / span;
      const easedT = applyEasing(rawT, k2.easing);
      return k1.value + (k2.value - k1.value) * easedT;
    }
  }
  return baseValue;
}

export function evaluateClipTransform(
  clip: Clip,
  globalTime: number
): ClipTransform {
  const localTime = globalTime - clip.start;
  return {
    x: evaluateProperty(clip.transform.x, clip.keyframes.x, localTime),
    y: evaluateProperty(clip.transform.y, clip.keyframes.y, localTime),
    scale: evaluateProperty(clip.transform.scale, clip.keyframes.scale, localTime),
    rotation: evaluateProperty(
      clip.transform.rotation,
      clip.keyframes.rotation,
      localTime
    ),
    opacity: Math.max(
      0,
      Math.min(1, evaluateProperty(clip.transform.opacity, clip.keyframes.opacity, localTime))
    ),
  };
}

export function getKeyframeAtTime(
  keyframes: Keyframe[] | undefined,
  localTime: number,
  tolerance = 0.08
): Keyframe | undefined {
  if (!keyframes) return undefined;
  return keyframes.find((kf) => Math.abs(kf.time - localTime) <= tolerance);
}

export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function formatShortTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function getCanvasDimensions(aspectRatio: AspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

export const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: 'Position X',
  y: 'Position Y',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
};
