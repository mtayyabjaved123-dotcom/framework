import type { Clip, ProjectState } from '../types/editor';
import { applyEasing, evaluateClipTransform, getCanvasDimensions } from '../utils/interpolation';
import { mediaCache } from './mediaCache';

export interface RenderedLayerBounds {
  clipId: string;
  cx: number; // 0..100
  cy: number; // 0..100
  w: number; // 0..100
  h: number; // 0..100
  rotation: number;
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number
) {
  if (amount <= 0.01) return;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(cx, cy);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, amount)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(-width / 2, -height / 2, width, height);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function renderMotionGenerator(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  localTime: number,
  canvasW: number,
  canvasH: number
): { w: number; h: number } {
  const accent = clip.accentColor || '#3B82F6';
  const textColor = clip.textColor || '#F4F5F7';
  const speed = clip.speed ?? 1;
  const intensity = clip.intensity ?? 0.8;

  switch (clip.motionType) {
    case 'lowerThird': {
      const boxW = Math.min(canvasW * 0.44, 520);
      const boxH = 92;
      const enterProgress = applyEasing(Math.min(1, localTime / 0.55), 'easeOut');

      // Subtle obsidian backing
      ctx.save();
      drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW * enterProgress, boxH, 8);
      ctx.fillStyle = 'rgba(13, 16, 22, 0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Animated left accent bar
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, -boxW / 2, -boxH / 2, 5, boxH * enterProgress, 2);
      ctx.fill();

      // Clip text reveal
      ctx.beginPath();
      ctx.rect(-boxW / 2, -boxH / 2, boxW * enterProgress, boxH);
      ctx.clip();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = textColor;
      ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
      ctx.fillText((clip.text || 'SPEAKER NAME').toUpperCase(), -boxW / 2 + 24, -12);

      if (clip.subtext) {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '500 15px "JetBrains Mono", monospace';
        ctx.fillText(clip.subtext.toUpperCase(), -boxW / 2 + 24, 20);
      }
      ctx.restore();
      return { w: boxW, h: boxH };
    }

    case 'waveform': {
      const w = ((clip.width ?? 44) / 100) * canvasW;
      const h = ((clip.height ?? 18) / 100) * canvasH;
      const bars = 32;
      const barSpace = w / bars;
      const barW = Math.max(3, barSpace * 0.58);

      ctx.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        const phase = localTime * 5.2 * speed + i * 0.48;
        const amp =
          (0.25 +
            0.45 * Math.abs(Math.sin(phase)) +
            0.3 * Math.abs(Math.cos(phase * 1.7 + i))) *
          intensity;
        const bh = Math.max(6, h * Math.min(1, amp));
        const bx = -w / 2 + i * barSpace + (barSpace - barW) / 2;
        const by = -bh / 2;
        drawRoundedRect(ctx, bx, by, barW, bh, barW / 2);
        ctx.fill();
      }
      return { w, h };
    }

    case 'gridPulse': {
      const w = ((clip.width ?? 100) / 100) * canvasW;
      const h = ((clip.height ?? 100) / 100) * canvasH;
      const step = 64;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;

      const pulse = 0.22 + 0.16 * Math.sin(localTime * 2.2 * speed);
      ctx.save();
      ctx.globalAlpha *= pulse * intensity;
      for (let x = -w / 2; x <= w / 2; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x, h / 2);
        ctx.stroke();
      }
      for (let y = -h / 2; y <= h / 2; y += step) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, y);
        ctx.lineTo(w / 2, y);
        ctx.stroke();
      }

      // Radar pulse circle
      const maxR = Math.min(w, h) * 0.42;
      const r = ((localTime * 0.35 * speed) % 1) * maxR;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return { w, h };
    }

    case 'particleField': {
      const w = ((clip.width ?? 100) / 100) * canvasW;
      const h = ((clip.height ?? 100) / 100) * canvasH;
      const count = 42;
      ctx.save();
      for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random seeds
        const sx = Math.sin(i * 12.9898) * 43758.5453;
        const sy = Math.sin(i * 78.233) * 19341.231;
        const fx = sx - Math.floor(sx);
        const fy = sy - Math.floor(sy);
        const driftX =
          ((fx + localTime * 0.03 * speed * ((i % 3) + 1) * 0.4) % 1) - 0.5;
        const driftY =
          ((fy - localTime * 0.04 * speed * ((i % 4) + 1) * 0.35 + 10) % 1) -
          0.5;
        const px = driftX * w;
        const py = driftY * h;
        const radius = 1.5 + (i % 4) * 1.1;
        const twinkle =
          0.35 + 0.65 * Math.abs(Math.sin(localTime * 1.8 * speed + i));

        ctx.globalAlpha = twinkle * intensity * 0.75;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return { w, h };
    }

    case 'kineticBadge':
    default: {
      const w = 280;
      const h = 64;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, 10);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(clip.text || 'FEATURED REEL', 0, 0);
      return { w, h };
    }
  }
}

function renderTextLayer(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  localTime: number,
  canvasW: number
): { w: number; h: number } {
  const rawText = clip.text ?? 'MOTION TITLE';
  const fontSize = clip.fontSize ?? 64;
  const fontWeight = clip.fontWeight ?? 700;
  const fontFamily = clip.fontFamily || 'Plus Jakarta Sans';
  const baseSpacing = clip.letterSpacing ?? 2;
  const anim = clip.textAnimation || 'none';
  const color = clip.textColor || '#F4F5F7';

  let displayText = rawText;
  let offsetY = 0;
  let extraSpacing = 0;
  let glitchOffset = 0;
  let wordScale = 1;

  const tNorm = Math.min(1, Math.max(0, localTime / 0.65));

  if (anim === 'slideUp') {
    offsetY = (1 - applyEasing(tNorm, 'easeOut')) * 42;
  } else if (anim === 'typewriter') {
    const charCount = Math.max(
      1,
      Math.floor(rawText.length * Math.min(1, localTime / 1.1))
    );
    displayText = rawText.slice(0, charCount);
    if (localTime < 1.35 && Math.floor(localTime * 4) % 2 === 0) {
      displayText += '|';
    }
  } else if (anim === 'trackingExpand') {
    extraSpacing = (1 - applyEasing(Math.min(1, localTime / 0.9), 'easeOut')) * 26;
  } else if (anim === 'wordPop') {
    wordScale = 0.75 + 0.25 * applyEasing(tNorm, 'spring');
  } else if (anim === 'glitch') {
    if (localTime < 0.7 || Math.sin(localTime * 19) > 0.92) {
      glitchOffset = Math.sin(localTime * 97) * 7;
    }
  }

  ctx.save();
  ctx.scale(wordScale, wordScale);
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = clip.textAlign || 'center';

  const spacing = baseSpacing + extraSpacing;
  const drawSpacedText = (
    str: string,
    yPos: number,
    fill: string,
    xShift = 0
  ): number => {
    ctx.fillStyle = fill;
    if (spacing <= 0.5) {
      ctx.fillText(str, xShift, yPos);
      return ctx.measureText(str).width;
    }
    const chars = Array.from(str);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const totalW =
      widths.reduce((acc, w) => acc + w, 0) +
      Math.max(0, chars.length - 1) * spacing;
    let cursorX =
      clip.textAlign === 'left'
        ? 0
        : clip.textAlign === 'right'
        ? -totalW
        : -totalW / 2;
    cursorX += xShift;
    ctx.textAlign = 'left';
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cursorX, yPos);
      cursorX += widths[i] + spacing;
    }
    return totalW;
  };

  if (glitchOffset !== 0) {
    ctx.save();
    ctx.globalAlpha *= 0.75;
    drawSpacedText(displayText, offsetY, '#3B82F6', -glitchOffset);
    drawSpacedText(displayText, offsetY, '#EF4444', glitchOffset);
    ctx.restore();
  }

  // Subtle legibility shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;

  const textW = drawSpacedText(displayText, offsetY, color);

  let totalH = fontSize * 1.2;
  let maxW = Math.min(canvasW * 0.92, Math.max(180, textW + 32));

  if (clip.subtext) {
    ctx.shadowBlur = 8;
    ctx.font = `500 ${Math.max(14, Math.round(fontSize * 0.24))}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'center';
    ctx.fillText(clip.subtext, 0, offsetY + fontSize * 0.72);
    totalH += fontSize * 0.45;
    maxW = Math.max(maxW, ctx.measureText(clip.subtext).width + 32);
  }

  ctx.restore();
  return { w: maxW, h: totalH };
}

function renderShapeLayer(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  canvasW: number,
  canvasH: number
): { w: number; h: number } {
  const w = ((clip.width ?? 24) / 100) * canvasW;
  const h = ((clip.height ?? 24) / 100) * canvasH;
  const fill = clip.fillColor || 'rgba(59, 130, 246, 0.25)';
  const stroke = clip.strokeColor || '#3B82F6';
  const strokeW = clip.strokeWidth ?? 3;

  ctx.lineWidth = strokeW;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;

  switch (clip.shapeType) {
    case 'circle': {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      if (fill !== 'transparent') ctx.fill();
      if (strokeW > 0) ctx.stroke();
      return { w: r * 2, h: r * 2 };
    }
    case 'ring': {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Precision inner dashed ring
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = Math.max(1, strokeW * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return { w: r * 2, h: r * 2 };
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
      return { w, h: Math.max(24, strokeW * 4) };
    }
    case 'rect':
    default: {
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, clip.cornerRadius ?? 8);
      if (fill !== 'transparent') ctx.fill();
      if (strokeW > 0) ctx.stroke();
      return { w, h };
    }
  }
}

export function renderCompositionFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  currentTime: number,
  isPlaying: boolean
): RenderedLayerBounds[] {
  const { width, height } = getCanvasDimensions(project.aspectRatio);

  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = project.backgroundColor || '#090B0E';
  ctx.fillRect(0, 0, width, height);

  const boundsList: RenderedLayerBounds[] = [];

  // Render tracks from bottom (last in array) to top (index 0)
  const orderedTracks = [...project.tracks].reverse();

  for (const track of orderedTracks) {
    if (track.hidden || track.type === 'audio') continue;

    const activeClips = project.clips.filter(
      (c) =>
        c.trackId === track.id &&
        currentTime >= c.start &&
        currentTime <= c.start + c.duration
    );

    for (const clip of activeClips) {
      const localTime = currentTime - clip.start;
      const tf = evaluateClipTransform(clip, currentTime);
      if (tf.opacity <= 0.005) continue;

      const px = (tf.x / 100) * width;
      const py = (tf.y / 100) * height;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((tf.rotation * Math.PI) / 180);
      ctx.scale(tf.scale, tf.scale);
      ctx.globalAlpha = tf.opacity;
      ctx.globalCompositeOperation = clip.effects.blendMode || 'source-over';

      const filters: string[] = [];
      if (clip.effects.blur > 0) filters.push(`blur(${clip.effects.blur}px)`);
      if (clip.effects.brightness !== 100)
        filters.push(`brightness(${clip.effects.brightness}%)`);
      if (clip.effects.contrast !== 100)
        filters.push(`contrast(${clip.effects.contrast}%)`);
      if (clip.effects.saturate !== 100)
        filters.push(`saturate(${clip.effects.saturate}%)`);
      ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';

      let boxW = width;
      let boxH = height;

      if (clip.kind === 'image' && clip.src) {
        const asset = mediaCache.getImage(clip.src);
        if (asset.ready) {
          const img = asset.el as HTMLImageElement;
          const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
          const canvasRatio = width / height;
          if (imgRatio > canvasRatio) {
            boxH = height;
            boxW = height * imgRatio;
          } else {
            boxW = width;
            boxH = width / imgRatio;
          }
          ctx.drawImage(img, -boxW / 2, -boxH / 2, boxW, boxH);
        } else {
          ctx.fillStyle = '#141820';
          ctx.fillRect(-width / 2, -height / 2, width, height);
        }
        drawVignette(ctx, width, height, clip.effects.vignette);
      } else if (clip.kind === 'video' && clip.src) {
        const asset = mediaCache.getVideo(clip.src);
        const video = asset.el as HTMLVideoElement;
        if (asset.ready && video.videoWidth > 0) {
          const targetVideoTime = clip.mediaOffset + localTime;
          if (
            !isPlaying ||
            Math.abs(video.currentTime - targetVideoTime) > 0.25
          ) {
            if (Number.isFinite(targetVideoTime)) {
              video.currentTime = Math.min(
                targetVideoTime,
                Math.max(0, (video.duration || 10) - 0.05)
              );
            }
          }
          if (isPlaying && video.paused) {
            video.play().catch(() => {});
          } else if (!isPlaying && !video.paused) {
            video.pause();
          }
          const vRatio = video.videoWidth / Math.max(1, video.videoHeight);
          const cRatio = width / height;
          if (vRatio > cRatio) {
            boxH = height;
            boxW = height * vRatio;
          } else {
            boxW = width;
            boxH = width / vRatio;
          }
          ctx.drawImage(video, -boxW / 2, -boxH / 2, boxW, boxH);
        } else {
          ctx.fillStyle = '#161B24';
          ctx.fillRect(-width / 2, -height / 2, width, height);
        }
        drawVignette(ctx, width, height, clip.effects.vignette);
      } else if (clip.kind === 'text') {
        const size = renderTextLayer(ctx, clip, localTime, width);
        boxW = size.w;
        boxH = size.h;
      } else if (clip.kind === 'shape') {
        const size = renderShapeLayer(ctx, clip, width, height);
        boxW = size.w;
        boxH = size.h;
      } else if (clip.kind === 'motion') {
        const size = renderMotionGenerator(ctx, clip, localTime, width, height);
        boxW = size.w;
        boxH = size.h;
      }

      ctx.restore();

      boundsList.push({
        clipId: clip.id,
        cx: tf.x,
        cy: tf.y,
        w: ((boxW * tf.scale) / width) * 100,
        h: ((boxH * tf.scale) / height) * 100,
        rotation: tf.rotation,
      });
    }
  }

  ctx.restore();
  return boundsList;
}
