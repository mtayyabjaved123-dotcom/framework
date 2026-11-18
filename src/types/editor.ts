export type AspectRatio = '16:9' | '9:16' | '1:1';

export type EasingType =
  | 'linear'
  | 'easeOut'
  | 'easeIn'
  | 'easeInOut'
  | 'spring'
  | 'elastic';

export type AnimatableProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface Keyframe {
  id: string;
  time: number; // Seconds relative to clip.start (0 .. clip.duration)
  value: number;
  easing: EasingType;
}

export type KeyframesMap = Partial<Record<AnimatableProperty, Keyframe[]>>;

export type BlendMode =
  | 'source-over'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighter';

export type TextAnimationType =
  | 'none'
  | 'slideUp'
  | 'typewriter'
  | 'trackingExpand'
  | 'wordPop'
  | 'glitch';

export type MotionGeneratorType =
  | 'lowerThird'
  | 'waveform'
  | 'gridPulse'
  | 'kineticBadge'
  | 'particleField';

export type ShapeType = 'rect' | 'circle' | 'line' | 'ring';

export type ClipKind = 'image' | 'video' | 'text' | 'shape' | 'motion' | 'audio';

export interface ClipTransform {
  x: number; // Percentage of canvas width (50 = center)
  y: number; // Percentage of canvas height (50 = center)
  scale: number; // Multiplier (1 = 100%)
  rotation: number; // Degrees (-360..360)
  opacity: number; // 0..1
}

export interface ClipEffects {
  blur: number; // px (0..30)
  brightness: number; // % (0..200, default 100)
  contrast: number; // % (0..200, default 100)
  saturate: number; // % (0..200, default 100)
  vignette: number; // 0..1
  blendMode: BlendMode;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  start: number; // Global timeline start in seconds
  duration: number; // Duration in seconds
  mediaOffset: number; // Source trim offset in seconds
  src?: string;
  // Text properties
  text?: string;
  subtext?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  textAnimation?: TextAnimationType;
  // Shape properties
  shapeType?: ShapeType;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  width?: number; // Base % of canvas width
  height?: number; // Base % of canvas height
  // Motion generator properties
  motionType?: MotionGeneratorType;
  accentColor?: string;
  intensity?: number;
  speed?: number;
  // Audio / Video volume
  volume?: number;
  // Spatial & Motion properties
  transform: ClipTransform;
  keyframes: KeyframesMap;
  effects: ClipEffects;
}

export interface Track {
  id: string;
  name: string;
  type: 'graphics' | 'video' | 'audio';
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface ReviewComment {
  id: string;
  time: number;
  x?: number; // Optional normalized 0..100 pin X on canvas
  y?: number; // Optional normalized 0..100 pin Y on canvas
  authorId: string;
  authorName: string;
  authorColor: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

export interface CollaboratorCursor {
  area: 'canvas' | 'timeline';
  x: number; // Percentage 0..100 on canvas, or seconds on timeline
  y: number; // Percentage 0..100 on canvas, or track index on timeline
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  selectedClipId: string | null;
  cursor: CollaboratorCursor | null;
  lastSeen: number;
}

export interface ProjectState {
  roomId: string;
  title: string;
  duration: number;
  fps: number;
  aspectRatio: AspectRatio;
  backgroundColor: string;
  tracks: Track[];
  clips: Clip[];
  comments: ReviewComment[];
}

export type ClientMessage =
  | { type: 'room:join'; roomId: string; userId: string; name: string }
  | { type: 'presence:rename'; name: string }
  | { type: 'presence:cursor'; cursor: CollaboratorCursor | null }
  | { type: 'presence:select'; clipId: string | null }
  | { type: 'clip:create'; clip: Clip }
  | { type: 'clip:update'; clipId: string; patch: Partial<Clip> }
  | { type: 'clip:delete'; clipId: string }
  | { type: 'clip:split'; clipId: string; splitTime: number; newClipId: string }
  | { type: 'track:update'; trackId: string; patch: Partial<Track> }
  | { type: 'comp:update'; patch: Partial<Pick<ProjectState, 'title' | 'duration' | 'aspectRatio' | 'backgroundColor' | 'fps'>> }
  | { type: 'comment:create'; comment: ReviewComment }
  | { type: 'comment:resolve'; commentId: string; resolved: boolean }
  | { type: 'comment:delete'; commentId: string }
  | { type: 'project:reset' };

export type ServerMessage =
  | { type: 'room:state'; state: ProjectState; peers: Collaborator[]; selfId: string }
  | { type: 'presence:peers'; peers: Collaborator[] }
  | { type: 'presence:cursor'; userId: string; cursor: CollaboratorCursor | null }
  | { type: 'presence:select'; userId: string; clipId: string | null }
  | { type: 'clip:create'; clip: Clip; actorId: string }
  | { type: 'clip:update'; clipId: string; patch: Partial<Clip>; actorId: string }
  | { type: 'clip:delete'; clipId: string; actorId: string }
  | { type: 'clip:split'; clipId: string; splitTime: number; newClipId: string; actorId: string }
  | { type: 'track:update'; trackId: string; patch: Partial<Track>; actorId: string }
  | { type: 'comp:update'; patch: Partial<Pick<ProjectState, 'title' | 'duration' | 'aspectRatio' | 'backgroundColor' | 'fps'>>; actorId: string }
  | { type: 'comment:create'; comment: ReviewComment; actorId: string }
  | { type: 'comment:resolve'; commentId: string; resolved: boolean; actorId: string }
  | { type: 'comment:delete'; commentId: string; actorId: string };
