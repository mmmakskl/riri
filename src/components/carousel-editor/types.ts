// ─── Element types on the canvas ─────────────────────────────

export interface Position {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export interface Size {
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
}

export interface TextElement {
  id: string;
  type: 'text';
  position: Position;
  text: string;
  fontSize: number;    // px at 1080 scale
  fontWeight: number;
  color: string;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  width: number; // percentage 0-100
  fontFamily: string;
}

export interface ImageElement {
  id: string;
  type: 'image';
  position: Position;
  size: Size;
  src: string; // data URL or object URL
  borderRadius: number; // px at 1080 scale
  shadow: 'none' | 'sm' | 'md' | 'lg';
  objectFit: 'cover' | 'contain';
}

export interface ShapeElement {
  id: string;
  type: 'shape';
  position: Position;
  size: Size;
  shapeType: 'rect' | 'circle' | 'line';
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  opacity: number;
}

export interface PlaceholderElement {
  id: string;
  type: 'placeholder';
  position: Position;
  size: Size;
  label: string;
  borderRadius: number;
}

export type SlideElement = TextElement | ImageElement | ShapeElement | PlaceholderElement;

// ─── Background ─────────────────────────────────────────────

export interface SolidBackground {
  type: 'solid';
  color: string;
}

export interface GradientBackground {
  type: 'gradient';
  from: string;
  to: string;
  direction: string; // CSS gradient direction e.g. "to bottom right"
}

export interface ImageBackground {
  type: 'image';
  src: string;
  brightness?: number; // 0.3 – 2.0, default 1
}

export type SlideBackground = SolidBackground | GradientBackground | ImageBackground;

// ─── Slide & Template ───────────────────────────────────────

export interface Slide {
  id: string;
  background: SlideBackground;
  elements: SlideElement[];
}

export interface CarouselProject {
  id: string;
  name: string;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ────────────────────────────────────────────────

let _counter = 0;
export function uid(): string {
  return `el_${Date.now()}_${++_counter}`;
}

export function createDefaultSlide(): Slide {
  return {
    id: uid(),
    background: { type: 'solid', color: '#f5f5f4' },
    elements: [],
  };
}

export function createDefaultTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    id: uid(),
    type: 'text',
    position: { x: 10, y: 10 },
    text: 'Текст',
    fontSize: 48,
    fontWeight: 700,
    color: '#1a1a2e',
    fontStyle: 'normal',
    textAlign: 'left',
    width: 80,
    fontFamily: 'Inter, sans-serif',
    ...overrides,
  };
}

export function createDefaultImageElement(src: string, overrides?: Partial<ImageElement>): ImageElement {
  return {
    id: uid(),
    type: 'image',
    position: { x: 10, y: 30 },
    size: { width: 40, height: 40 },
    src,
    borderRadius: 16,
    shadow: 'lg',
    objectFit: 'cover',
    ...overrides,
  };
}

export function createDefaultShapeElement(overrides?: Partial<ShapeElement>): ShapeElement {
  return {
    id: uid(),
    type: 'shape',
    position: { x: 20, y: 20 },
    size: { width: 60, height: 30 },
    shapeType: 'rect',
    fill: 'rgba(255,255,255,0.2)',
    stroke: 'rgba(255,255,255,0.6)',
    strokeWidth: 2,
    borderRadius: 0,
    opacity: 1,
    ...overrides,
  };
}

export function createDefaultPlaceholderElement(overrides?: Partial<PlaceholderElement>): PlaceholderElement {
  return {
    id: uid(),
    type: 'placeholder',
    position: { x: 10, y: 30 },
    size: { width: 80, height: 45 },
    label: 'Фото',
    borderRadius: 16,
    ...overrides,
  };
}

export const SHADOW_MAP: Record<string, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.12)',
  md: '0 4px 12px rgba(0,0,0,0.15)',
  lg: '0 8px 30px rgba(0,0,0,0.2)',
};
