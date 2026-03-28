import { useRef, useState, useCallback, useEffect, forwardRef } from 'react';
import { cn } from '../../utils/cn';
import type { Slide, SlideElement, TextElement, ImageElement, ShapeElement, PlaceholderElement, Position, Size } from './types';
import { SHADOW_MAP } from './types';

// ─── Move hook ───────────────────────────────────────────────

function useDrag(
  getPosition: () => Position,
  onMove: (x: number, y: number) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const active = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startPt = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    active.current = true;
    hasMoved.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = getPosition();
    offset.current = { x: e.clientX - rect.left - (pos.x / 100) * rect.width, y: e.clientY - rect.top - (pos.y / 100) * rect.height };
    startPt.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPosition, containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active.current) return;
    if (Math.abs(e.clientX - startPt.current.x) > 3 || Math.abs(e.clientY - startPt.current.y) > 3) hasMoved.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left - offset.current.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - offset.current.y) / rect.height) * 100;
    onMove(Math.max(0, Math.min(93, x)), Math.max(0, Math.min(93, y)));
  }, [onMove, containerRef]);

  const onPointerUp = useCallback(() => { active.current = false; }, []);

  return { onPointerDown, onPointerMove, onPointerUp, hasMoved };
}

// ─── Canva-style selection handle ────────────────────────────

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const CURSORS: Record<HandleDir, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

const C = 12;  // corner handle size px
const EL = 20; // edge handle long side
const ES = 6;  // edge handle short side
const OFF = -C / 2;

const CORNER_POS: Record<string, React.CSSProperties> = {
  nw: { top: OFF, left: OFF, width: C, height: C },
  ne: { top: OFF, right: OFF, width: C, height: C },
  sw: { bottom: OFF, left: OFF, width: C, height: C },
  se: { bottom: OFF, right: OFF, width: C, height: C },
};
const EDGE_POS: Record<string, React.CSSProperties> = {
  n:  { top: -ES/2, left: '50%', width: EL, height: ES, transform: 'translateX(-50%)' },
  s:  { bottom: -ES/2, left: '50%', width: EL, height: ES, transform: 'translateX(-50%)' },
  e:  { right: -ES/2, top: '50%', width: ES, height: EL, transform: 'translateY(-50%)' },
  w:  { left: -ES/2, top: '50%', width: ES, height: EL, transform: 'translateY(-50%)' },
};

function Handle({ pos, dir, onPointerDown, onPointerMove, onPointerUp }: {
  pos: React.CSSProperties;
  dir: HandleDir;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  const isEdge = dir === 'n' || dir === 's' || dir === 'e' || dir === 'w';
  return (
    <div
      className="absolute touch-none select-none"
      style={{
        background: '#ffffff',
        border: '2px solid rgba(99,102,241,0.9)',
        borderRadius: isEdge ? 5 : 3,
        boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
        cursor: CURSORS[dir],
        zIndex: 25,
        ...pos,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

// ─── Shared resize logic (single axis ref) ───────────────────

type ResizeStart = { x: number; y: number; px: number; py: number; w: number; h: number };

function makeResizeHandlers(
  containerRef: React.RefObject<HTMLDivElement | null>,
  resizingDir: React.MutableRefObject<HandleDir | null>,
  resizeStart: React.MutableRefObject<ResizeStart>,
  getEl: () => { position: Position; size: Size },
  onUpdate: (pos: Position, size: Size) => void,
) {
  const startResize = (dir: HandleDir, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizingDir.current = dir;
    const { position: p, size: s } = getEl();
    resizeStart.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y, w: s.width, h: s.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const dir = resizingDir.current;
    if (!dir) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const r = resizeStart.current;
    const dw = ((e.clientX - r.x) / rect.width) * 100;
    const dh = ((e.clientY - r.y) / rect.height) * 100;

    let nx = r.px, ny = r.py, nw = r.w, nh = r.h;

    // East side
    if (dir === 'e' || dir === 'se' || dir === 'ne') nw = Math.max(5, nw + dw);
    // West side (position shifts, width changes inversely)
    if (dir === 'w' || dir === 'sw' || dir === 'nw') { nx = r.px + dw; nw = Math.max(5, r.w - dw); }
    // South side
    if (dir === 's' || dir === 'se' || dir === 'sw') nh = Math.max(5, nh + dh);
    // North side (position shifts, height changes inversely)
    if (dir === 'n' || dir === 'ne' || dir === 'nw') { ny = r.py + dh; nh = Math.max(5, r.h - dh); }

    onUpdate(
      { x: Math.max(0, Math.min(90, nx)), y: Math.max(0, Math.min(90, ny)) },
      { width: Math.min(95, nw), height: Math.min(95, nh) },
    );
  };

  const onResizeUp = () => { resizingDir.current = null; };

  return { startResize, onResizeMove, onResizeUp };
}

// ─── Selection border ────────────────────────────────────────

function SelectionBorder() {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        inset: -2,
        border: '1.5px solid rgba(99,102,241,0.8)',
        borderRadius: 3,
        zIndex: 15,
      }}
    />
  );
}

// ─── Image handles (8-directional) ──────────────────────────────────────────

function ImageHandles({ el, containerRef, onUpdate }: {
  el: ImageElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onUpdate: (pos: Position, size: Size) => void;
}) {
  const resizingDir = useRef<HandleDir | null>(null);
  const resizeStart = useRef<ResizeStart>({ x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 });
  const getEl = useCallback(() => ({ position: el.position, size: el.size }), [el.position, el.size]);
  const { startResize, onResizeMove, onResizeUp } = makeResizeHandlers(containerRef, resizingDir, resizeStart, getEl, onUpdate);

  const dirs: { dir: HandleDir; pos: React.CSSProperties }[] = [
    { dir: 'nw', pos: CORNER_POS.nw }, { dir: 'ne', pos: CORNER_POS.ne },
    { dir: 'sw', pos: CORNER_POS.sw }, { dir: 'se', pos: CORNER_POS.se },
    { dir: 'n',  pos: EDGE_POS.n  }, { dir: 's',  pos: EDGE_POS.s  },
    { dir: 'w',  pos: EDGE_POS.w  }, { dir: 'e',  pos: EDGE_POS.e  },
  ];

  return (
    <>
      {dirs.map(({ dir, pos }) => (
        <Handle
          key={dir}
          dir={dir}
          pos={pos}
          onPointerDown={(e) => startResize(dir, e)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      ))}
    </>
  );
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
  onUpdate: (updates: Partial<TextElement>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function TextElementView({ el, selected, editing, scale, onSelect, onStartEdit, onStopEdit, onTextChange, onUpdate, containerRef }: TextElementProps) {
  const textRef = useRef<HTMLDivElement>(null);

  const drag = useDrag(
    () => el.position,
    (x, y) => onUpdate({ position: { x, y } }),
    containerRef,
  );

  // Width-only resize (text height is always auto)
  const resizingDir = useRef<HandleDir | null>(null);
  const resizeStart = useRef<ResizeStart>({ x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 });

  const startResize = useCallback((dir: HandleDir, e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    resizingDir.current = dir;
    resizeStart.current = { x: e.clientX, y: e.clientY, px: el.position.x, py: el.position.y, w: el.width, h: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.position.x, el.position.y, el.width]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    const dir = resizingDir.current;
    if (!dir) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const r = resizeStart.current;
    const dw = ((e.clientX - r.x) / rect.width) * 100;
    let nx = r.px, nw = r.w;
    if (dir === 'e' || dir === 'se' || dir === 'ne') nw = Math.max(10, nw + dw);
    if (dir === 'w' || dir === 'sw' || dir === 'nw') { nx = r.px + dw; nw = Math.max(10, r.w - dw); }
    onUpdate({ position: { x: Math.max(0, Math.min(90, nx)), y: el.position.y }, width: Math.min(98, nw) });
  }, [containerRef, onUpdate, el.position.y]);

  const onResizeUp = useCallback(() => { resizingDir.current = null; }, []);

  // Sync content when not editing
  useEffect(() => {
    if (!editing && textRef.current) textRef.current.innerHTML = el.text;
  }, [el.text, editing]);

  // Seed + focus when editing starts
  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.innerHTML = el.text;
      textRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBodyDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    onSelect();
    drag.onPointerDown(e);
  }, [editing, onSelect, drag]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) onSelect();
  }, [onSelect, drag.hasMoved]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartEdit();
  }, [onStartEdit]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.width}%`,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'top left',
        zIndex: (el as any).zIndex ?? 1,
        cursor: editing ? 'text' : 'grab',
      }}
      onPointerDown={handleBodyDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
    >
      {/* Selection border */}
      {selected && <SelectionBorder />}

      {/* Inline format toolbar when editing */}
      {editing && (
        <div
          className="absolute left-0 z-40 select-none"
          style={{ bottom: 'calc(100% + 6px)' }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          <div
            className="flex flex-col gap-1.5 px-2 py-2 rounded-2xl"
            style={{ background: 'rgba(18,18,18,0.95)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}
          >
            {/* Row 1: Bold / Italic / remove */}
            <div className="flex items-center gap-0.5">
              <button className="px-2 py-1 text-white rounded-lg text-[12px] font-bold hover:bg-white/20 transition-colors" onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}>B</button>
              <button className="px-2 py-1 text-white rounded-lg text-[12px] italic hover:bg-white/20 transition-colors" onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}>I</button>
              <div className="w-px h-3 bg-white/15 mx-1" />
              <button className="px-1.5 py-1 text-white/60 rounded-lg text-[10px] hover:bg-white/20 transition-colors" onMouseDown={(e) => { e.preventDefault(); document.execCommand('removeFormat'); }} title="Сбросить форматирование">✕</button>
            </div>

            {/* Row 2: Text color (A) */}
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 14, textAlign: 'center', fontWeight: 700 }}>A</span>
              {['#ffffff', '#1a1a18', '#e11d48', '#f59e0b', '#059669', '#2563eb', '#8b5cf6'].map((c) => (
                <button
                  key={c}
                  title={c}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', background: c, flexShrink: 0,
                    border: c === '#ffffff' ? '1.5px solid rgba(255,255,255,0.25)' : '1.5px solid transparent',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
                  }}
                  onMouseDown={(e) => { e.preventDefault(); document.execCommand('foreColor', false, c); }}
                />
              ))}
              <label style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Свой цвет">
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>+</span>
                <input type="color" className="sr-only" onChange={(e) => { document.execCommand('foreColor', false, e.target.value); }} />
              </label>
            </div>

            {/* Row 3: Highlight (фломастер) */}
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 14, textAlign: 'center' }}>▌</span>
              {[
                { color: 'transparent', label: 'Нет' },
                { color: '#fef08a', label: 'Жёлтый' },
                { color: '#86efac', label: 'Зелёный' },
                { color: '#fca5a5', label: 'Красный' },
                { color: '#93c5fd', label: 'Синий' },
                { color: '#f0abfc', label: 'Фиолетовый' },
                { color: '#fdba74', label: 'Оранжевый' },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  title={label}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: color === 'transparent' ? 'transparent' : color,
                    border: color === 'transparent' ? '1.5px dashed rgba(255,255,255,0.3)' : '1.5px solid transparent',
                    boxShadow: color === 'transparent' ? 'none' : '0 0 0 1px rgba(0,0,0,0.15)',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (color === 'transparent') {
                      // Remove highlight only: set to inherit/transparent
                      document.execCommand('hiliteColor', false, 'transparent');
                      document.execCommand('backColor', false, 'transparent');
                    } else {
                      document.execCommand('hiliteColor', false, color);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text content */}
      <div
        ref={textRef}
        contentEditable={editing}
        suppressContentEditableWarning
        className="outline-none whitespace-pre-wrap break-words"
        style={{
          fontSize: el.fontSize * scale,
          fontWeight: el.fontWeight,
          color: el.color,
          fontStyle: el.fontStyle,
          textAlign: el.textAlign,
          fontFamily: el.fontFamily ?? 'Inter, sans-serif',
          lineHeight: el.lineHeight ?? 1.3,
          letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined,
          minHeight: el.fontSize * scale,
          userSelect: editing ? 'text' : 'none',
          cursor: editing ? 'text' : 'grab',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onBlur={() => {
          if (textRef.current) onTextChange(textRef.current.innerHTML);
          onStopEdit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.target as HTMLElement).blur();
        }}
      />

      {/* Canva-style resize handles — shown when selected and not editing */}
      {selected && !editing && (
        <>
          {/* 4 corners */}
          <Handle dir="nw" pos={CORNER_POS.nw} onPointerDown={(e) => startResize('nw', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          <Handle dir="ne" pos={CORNER_POS.ne} onPointerDown={(e) => startResize('ne', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          <Handle dir="sw" pos={CORNER_POS.sw} onPointerDown={(e) => startResize('sw', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          <Handle dir="se" pos={CORNER_POS.se} onPointerDown={(e) => startResize('se', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          {/* Left/right edges */}
          <Handle dir="e" pos={EDGE_POS.e} onPointerDown={(e) => startResize('e', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
          <Handle dir="w" pos={EDGE_POS.w} onPointerDown={(e) => startResize('w', e)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
        </>
      )}
    </div>
  );
}

// ─── Image element ───────────────────────────────────────────

interface ImageElementProps {
  el: ImageElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<ImageElement>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ImageElementView({ el, selected, scale, onSelect, onUpdate, containerRef }: ImageElementProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useDrag(
    () => el.position,
    (x, y) => onUpdate({ position: { x, y } }),
    containerRef,
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) onSelect();
  }, [onSelect, drag.hasMoved]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: (el as any).zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setDragging(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setDragging(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
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
        <img src={el.src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: el.objectFit }} />
      </div>

      {selected && <SelectionBorder />}

      {selected && (
        <ImageHandles
          el={el}
          containerRef={containerRef}
          onUpdate={(pos, size) => onUpdate({ position: pos, size })}
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
  onUpdate: (updates: Partial<ShapeElement>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ShapeElementView({ el, selected, scale, onSelect, onUpdate, containerRef }: ShapeElementProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useDrag(
    () => el.position,
    (x, y) => onUpdate({ position: { x, y } }),
    containerRef,
  );

  const resizingDir = useRef<HandleDir | null>(null);
  const resizeStart = useRef<ResizeStart>({ x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 });
  const getEl = useCallback(() => ({ position: el.position, size: el.size }), [el.position, el.size]);
  const { startResize, onResizeMove, onResizeUp } = makeResizeHandlers(containerRef, resizingDir, resizeStart, getEl, (pos, size) => onUpdate({ position: pos, size }));

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) onSelect();
  }, [onSelect, drag.hasMoved]);

  const shapeStyle: React.CSSProperties = { width: '100%', opacity: el.opacity };
  if (el.shapeType === 'line') {
    shapeStyle.height = Math.max(el.strokeWidth * scale, 1);
    shapeStyle.background = el.stroke;
    shapeStyle.borderRadius = 2;
  } else if (el.shapeType === 'arrow') {
    shapeStyle.height = Math.max(el.strokeWidth * scale, 2);
    shapeStyle.background = el.stroke;
    shapeStyle.borderRadius = 2;
    shapeStyle.position = 'relative';
  } else {
    shapeStyle.paddingBottom = `${(el.size.height / el.size.width) * 100}%`;
    shapeStyle.position = 'relative';
    shapeStyle.background = el.fill;
    shapeStyle.border = `${el.strokeWidth * scale}px solid ${el.stroke}`;
    shapeStyle.borderRadius = el.shapeType === 'circle' ? '50%' : el.borderRadius * scale;
  }

  const arrowHeadSize = Math.max(el.strokeWidth * scale * 3, 8);

  const dirs: { dir: HandleDir; pos: React.CSSProperties }[] = [
    { dir: 'nw', pos: CORNER_POS.nw }, { dir: 'ne', pos: CORNER_POS.ne },
    { dir: 'sw', pos: CORNER_POS.sw }, { dir: 'se', pos: CORNER_POS.se },
    { dir: 'n', pos: EDGE_POS.n }, { dir: 's', pos: EDGE_POS.s },
    { dir: 'w', pos: EDGE_POS.w }, { dir: 'e', pos: EDGE_POS.e },
  ];

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: (el as any).zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setDragging(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setDragging(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {el.shapeType === 'arrow' ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', opacity: el.opacity }}>
          <div style={{ flex: 1, height: Math.max(el.strokeWidth * scale, 1), background: el.stroke, borderRadius: 2 }} />
          <div style={{ width: 0, height: 0, borderTop: `${arrowHeadSize / 2}px solid transparent`, borderBottom: `${arrowHeadSize / 2}px solid transparent`, borderLeft: `${arrowHeadSize}px solid ${el.stroke}` }} />
        </div>
      ) : (
        <div style={shapeStyle} />
      )}

      {selected && <SelectionBorder />}

      {selected && dirs.map(({ dir, pos }) => (
        <Handle key={dir} dir={dir} pos={pos}
          onPointerDown={(e) => startResize(dir, e)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      ))}
    </div>
  );
}

// ─── Placeholder element ─────────────────────────────────────

interface PlaceholderElementProps {
  el: PlaceholderElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<PlaceholderElement>) => void;
  onReplace: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function PlaceholderElementView({ el, selected, scale, onSelect, onUpdate, onReplace, containerRef }: PlaceholderElementProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useDrag(
    () => el.position,
    (x, y) => onUpdate({ position: { x, y } }),
    containerRef,
  );

  const resizingDir = useRef<HandleDir | null>(null);
  const resizeStart = useRef<ResizeStart>({ x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 });
  const getEl = useCallback(() => ({ position: el.position, size: el.size }), [el.position, el.size]);
  const { startResize, onResizeMove, onResizeUp } = makeResizeHandlers(containerRef, resizingDir, resizeStart, getEl, (pos, size) => onUpdate({ position: pos, size }));

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) { onSelect(); onReplace(el.id); }
  }, [onSelect, onReplace, el.id, drag.hasMoved]);

  const dirs: { dir: HandleDir; pos: React.CSSProperties }[] = [
    { dir: 'nw', pos: CORNER_POS.nw }, { dir: 'ne', pos: CORNER_POS.ne },
    { dir: 'sw', pos: CORNER_POS.sw }, { dir: 'se', pos: CORNER_POS.se },
    { dir: 'n', pos: EDGE_POS.n }, { dir: 's', pos: EDGE_POS.s },
    { dir: 'w', pos: EDGE_POS.w }, { dir: 'e', pos: EDGE_POS.e },
  ];

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: dragging ? 'grabbing' : 'pointer',
        zIndex: (el as any).zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setDragging(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setDragging(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <svg width={Math.max(16, 24 * scale)} height={Math.max(16, 24 * scale)} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
          </svg>
          <span style={{ fontSize: Math.max(8, 11 * scale), color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>{el.label}</span>
        </div>
      </div>

      {selected && <SelectionBorder />}

      {selected && dirs.map(({ dir, pos }) => (
        <Handle key={dir} dir={dir} pos={pos}
          onPointerDown={(e) => startResize(dir, e)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      ))}
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
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) setContainerWidth(e.contentRect.width);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const scale = containerWidth / 1080;

    const bgLayerStyle: React.CSSProperties = {};
    if (slide.background.type === 'solid') {
      bgLayerStyle.backgroundColor = slide.background.color;
    } else if (slide.background.type === 'gradient') {
      bgLayerStyle.background = `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})`;
    } else if (slide.background.type === 'image') {
      const bg = slide.background;
      const zoom = bg.zoom ?? 1;
      bgLayerStyle.backgroundImage = `url(${bg.src})`;
      bgLayerStyle.backgroundRepeat = 'no-repeat';
      bgLayerStyle.backgroundSize = zoom <= 1 ? 'cover' : `${Math.round(zoom * 100)}%`;
      bgLayerStyle.backgroundPosition = `${bg.panX ?? 50}% ${bg.panY ?? 50}%`;
      const br = bg.brightness ?? 1;
      if (br !== 1) bgLayerStyle.filter = `brightness(${br})`;
    }

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn('aspect-[4/5] w-full relative select-none', className)}
        style={{ maxWidth: 540 }}
        onClick={() => onSelectElement(null)}
      >
        {/* Background layer — clipped to slide boundary separately from elements */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ ...bgLayerStyle, overflow: 'hidden', borderRadius: 'inherit' }}
        />
        {[...slide.elements].sort((a, b) => ((a as any).zIndex ?? 1) - ((b as any).zIndex ?? 1)).map((el) => {
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
                onTextChange={(html) => onUpdateTextContent(el.id, html)}
                onUpdate={(u) => onUpdateElement(el.id, u)}
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
                onUpdate={(u) => onUpdateElement(el.id, u as Partial<SlideElement>)}
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
                onUpdate={(u) => onUpdateElement(el.id, u as Partial<SlideElement>)}
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
                onUpdate={(u) => onUpdateElement(el.id, u as Partial<SlideElement>)}
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
