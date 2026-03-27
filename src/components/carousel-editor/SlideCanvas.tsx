import { useRef, useState, useCallback, useEffect, forwardRef } from 'react';
import { cn } from '../../utils/cn';
import type { Slide, SlideElement, TextElement, ImageElement, ShapeElement, PlaceholderElement } from './types';
import { SHADOW_MAP } from './types';

// ─── Shared drag logic ───────────────────────────────────────

function useDrag(
  getPosition: () => { x: number; y: number },
  onMove: (x: number, y: number) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    hasMoved.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = getPosition();
    const elX = (pos.x / 100) * rect.width;
    const elY = (pos.y / 100) * rect.height;
    offset.current = { x: e.clientX - rect.left - elX, y: e.clientY - rect.top - elY };
    startPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPosition, containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 3 || dy > 3) hasMoved.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left - offset.current.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - offset.current.y) / rect.height) * 100;
    onMove(Math.max(0, Math.min(94, x)), Math.max(0, Math.min(94, y)));
  }, [onMove, containerRef]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, hasMoved };
}

// ─── Text element ────────────────────────────────────────────

interface TextElementProps {
  el: TextElement;
  selected: boolean;
  editing: boolean;
  scale: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onTextChange: (text: string) => void;
  onMove: (x: number, y: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function TextElementView({
  el, selected, editing, scale,
  onSelect, onStartEdit, onStopEdit, onTextChange, onMove, containerRef,
}: TextElementProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const drag = useDrag(() => el.position, onMove, containerRef);

  // Focus + cursor at end when editing starts
  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) {
      onSelect();
      onStartEdit();
    }
  }, [onSelect, onStartEdit, drag.hasMoved]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.width}%`,
        cursor: editing ? 'text' : 'text',
      }}
    >
      {/* Drag handle — only when selected and not editing */}
      {selected && !editing && (
        <div
          className="absolute -top-5 left-0 flex items-center gap-1 touch-none z-20 select-none"
          style={{ cursor: 'grab' }}
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-white font-medium"
            style={{ background: 'rgba(99,102,241,0.85)', backdropFilter: 'blur(4px)' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="2" cy="2" r="1"/><circle cx="5" cy="2" r="1"/><circle cx="8" cy="2" r="1"/>
              <circle cx="2" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="8" cy="5" r="1"/>
              <circle cx="2" cy="8" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/>
            </svg>
            Двигай
          </div>
        </div>
      )}

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Text content */}
      <div
        ref={textRef}
        contentEditable={editing}
        suppressContentEditableWarning
        className={cn(
          'outline-none whitespace-pre-wrap break-words',
        )}
        style={{
          fontSize: el.fontSize * scale,
          fontWeight: el.fontWeight,
          color: el.color,
          fontStyle: el.fontStyle,
          textAlign: el.textAlign,
          fontFamily: el.fontFamily ?? 'Inter, sans-serif',
          lineHeight: 1.25,
          minHeight: el.fontSize * scale,
          userSelect: editing ? 'text' : 'none',
          cursor: editing ? 'text' : 'text',
        }}
        onClick={handleClick}
        onBlur={() => {
          if (textRef.current) onTextChange(textRef.current.innerText);
          onStopEdit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.target as HTMLElement).blur();
        }}
      >
        {el.text}
      </div>
    </div>
  );
}

// ─── Image element ───────────────────────────────────────────

interface ImageElementProps {
  el: ImageElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ImageElementView({ el, selected, scale, onSelect, onMove, onResize, containerRef }: ImageElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  // Resize
  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(8, Math.min(90, resizeStart.current.w + dx)),
      Math.max(8, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {/* Image */}
      <div
        style={{
          width: '100%',
          paddingBottom: `${(el.size.height / el.size.width) * 100}%`,
          borderRadius: el.borderRadius * scale,
          boxShadow: SHADOW_MAP[el.shadow],
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: el.objectFit }}
        />
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Shape element ───────────────────────────────────────────

interface ShapeElementProps {
  el: ShapeElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ShapeElementView({ el, selected, scale, onSelect, onMove, onResize, containerRef }: ShapeElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(4, Math.min(90, resizeStart.current.w + dx)),
      Math.max(4, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) onSelect();
  }, [onSelect, drag.hasMoved]);

  const shapeStyle: React.CSSProperties = {
    width: '100%',
    opacity: el.opacity,
  };

  if (el.shapeType === 'line') {
    shapeStyle.height = Math.max(el.strokeWidth * scale, 1);
    shapeStyle.background = el.stroke;
    shapeStyle.borderRadius = 2;
  } else {
    shapeStyle.paddingBottom = `${(el.size.height / el.size.width) * 100}%`;
    shapeStyle.position = 'relative';
    shapeStyle.background = el.fill;
    shapeStyle.border = `${el.strokeWidth * scale}px solid ${el.stroke}`;
    shapeStyle.borderRadius = el.shapeType === 'circle' ? '50%' : el.borderRadius * scale;
  }

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      <div style={shapeStyle} />

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Placeholder element ─────────────────────────────────────

interface PlaceholderElementProps {
  el: PlaceholderElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onReplace: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function PlaceholderElementView({ el, selected, scale, onSelect, onMove, onResize, onReplace, containerRef }: PlaceholderElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(8, Math.min(90, resizeStart.current.w + dx)),
      Math.max(8, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) {
      onSelect();
      onReplace(el.id);
    }
  }, [onSelect, onReplace, el.id, drag.hasMoved]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {/* Placeholder block */}
      <div
        style={{
          width: '100%',
          paddingBottom: `${(el.size.height / el.size.width) * 100}%`,
          borderRadius: el.borderRadius * scale,
          border: '2px dashed rgba(255,255,255,0.4)',
          background: 'rgba(0,0,0,0.15)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <svg width={Math.max(16, 24 * scale)} height={Math.max(16, 24 * scale)} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span style={{ fontSize: Math.max(8, 11 * scale), color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>
            {el.label}
          </span>
        </div>
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Main SlideCanvas ────────────────────────────────────────

interface SlideCanvasProps {
  slide: Slide;
  selectedId: string | null;
  editingTextId: string | null;
  onSelectElement: (id: string | null) => void;
  onStartEditText: (id: string) => void;
  onStopEditText: () => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onUpdateTextContent: (id: string, text: string) => void;
  onReplacePlaceholder: (id: string) => void;
  className?: string;
}

export const SlideCanvas = forwardRef<HTMLDivElement, SlideCanvasProps>(
  ({ slide, selectedId, editingTextId, onSelectElement, onStartEditText, onStopEditText, onUpdateElement, onUpdateTextContent, onReplacePlaceholder, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(540);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const scale = containerWidth / 1080;

    const bgStyle: React.CSSProperties = {};
    if (slide.background.type === 'solid') {
      bgStyle.backgroundColor = slide.background.color;
    } else if (slide.background.type === 'gradient') {
      bgStyle.background = `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})`;
    } else if (slide.background.type === 'image') {
      bgStyle.backgroundImage = `url(${slide.background.src})`;
      bgStyle.backgroundSize = 'cover';
      bgStyle.backgroundPosition = 'center';
      const br = slide.background.brightness ?? 1;
      if (br !== 1) bgStyle.filter = `brightness(${br})`;
    }

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn('aspect-[3/4] w-full relative overflow-hidden select-none', className)}
        style={{ ...bgStyle, maxWidth: 540 }}
        onClick={() => onSelectElement(null)}
      >
        {slide.elements.map((el) => {
          if (el.type === 'text') {
            return (
              <TextElementView
                key={el.id}
                el={el}
                selected={selectedId === el.id}
                editing={editingTextId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onStartEdit={() => onStartEditText(el.id)}
                onStopEdit={onStopEditText}
                onTextChange={(text) => onUpdateTextContent(el.id, text)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'image') {
            return (
              <ImageElementView
                key={el.id}
                el={el as ImageElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<ImageElement>)}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'shape') {
            return (
              <ShapeElementView
                key={el.id}
                el={el as ShapeElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<ShapeElement>)}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'placeholder') {
            return (
              <PlaceholderElementView
                key={el.id}
                el={el as PlaceholderElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<PlaceholderElement>)}
                onReplace={onReplacePlaceholder}
                containerRef={containerRef}
              />
            );
          }
          return null;
        })}
      </div>
    );
  }
);

SlideCanvas.displayName = 'SlideCanvas';
