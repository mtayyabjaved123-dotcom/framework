import type { ProjectState } from '../types/editor';
import { getCanvasDimensions } from '../utils/interpolation';
import { renderCompositionFrame } from './renderFrame';

export async function exportProjectToWebM(
  project: ProjectState,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const { width, height } = getCanvasDimensions(project.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D rendering context');

  const fps = 30;
  const totalFrames = Math.max(1, Math.ceil(project.duration * fps));

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  recorder.start(100);

  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = Math.min(project.duration, frame / fps);
    renderCompositionFrame(ctx, project, t, false);
    onProgress(Math.round((frame / totalFrames) * 100));
    await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
  }

  recorder.stop();
  return stopped;
}
