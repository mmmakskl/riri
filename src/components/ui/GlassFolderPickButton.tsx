'use client';

import { useRef, useEffect, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { GlassFolderIcon } from './GlassFolderIcons';

export type GlassFolderPickItem = {
  id: string | null;
  title: string;
  color: string;
  iconType: string;
};

type GlassFolderPickButtonProps = {
  folders: GlassFolderPickItem[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
  className?: string;
  /** Портал в body — чтобы выпадало поверх хедера */
  usePortal?: boolean;
  /** Светлый стиль (белый фон) — для модалок с белым фоном */
  variant?: 'default' | 'light';
};

/**
 * Кнопка выбора папки в стиле iOS / Liquid Glass: отдельная от «Добавить», кастомный список вместо native select.
 */
const POPOVER_MAX_H = 280;

export function GlassFolderPickButton({
  folders,
  value,
  onChange,
  disabled,
  className,
  usePortal = true,
  variant = 'default',
}: GlassFolderPickButtonProps) {
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });

  const selected = value === null
    ? null
    : folders.find((f) => f.id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const portal = document.getElementById(popoverId);
      if (portal?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, popoverId]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < POPOVER_MAX_H + 16 && spaceAbove > spaceBelow;
      const top = openUp ? r.top - POPOVER_MAX_H - 8 : r.bottom + 8;
      let left = r.left;
      const w = Math.max(r.width, 220);
      if (left + w > vw - 12) left = vw - w - 12;
      if (left < 12) left = 12;
      setCoords({ top, left, width: w, openUp });
    };
    update();
    requestAnimationFrame(update);
  }, [open]);

  const list = (
    <div
      id={popoverId}
      role="listbox"
      className={cn(
        'rounded-2xl p-1.5 min-w-[220px] overflow-y-auto overscroll-contain',
        'animate-in fade-in zoom-in-95 duration-150 custom-scrollbar-light',
        variant === 'light'
          ? 'bg-white border border-slate-200/90 shadow-xl'
          : 'bg-white/92 backdrop-blur-xl border border-white/60 shadow-glass'
      )}
      style={
        usePortal
          ? {
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: POPOVER_MAX_H,
              zIndex: 10050,
              WebkitOverflowScrolling: 'touch',
            }
          : { maxHeight: POPOVER_MAX_H, WebkitOverflowScrolling: 'touch' }
      }
    >
      <button
        type="button"
        role="option"
        aria-selected={value === null}
        onClick={() => {
          onChange(null);
          setOpen(false);
        }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-left transition-colors touch-manipulation',
          variant === 'light'
            ? (value === null ? 'bg-slate-100' : 'hover:bg-slate-50 active:bg-slate-100')
            : (value === null ? 'bg-white/88 border border-white/60 shadow-glass-sm' : 'hover:bg-white/65 active:bg-white/50')
        )}
      >
        <GlassFolderIcon iconType="inbox" color="#64748b" size={20} simple />
        <span className="text-sm font-medium text-slate-800 flex-1">Без папки</span>
        {value === null && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.5} />}
      </button>
      <div className={cn('h-px my-1 mx-1', variant === 'light' ? 'bg-slate-200' : 'bg-white/45')} aria-hidden />
      {folders.map((f) => {
        if (f.id === null) return null;
        const isSel = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="option"
            aria-selected={isSel}
            onClick={() => {
              onChange(f.id);
              setOpen(false);
            }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-left transition-colors touch-manipulation',
              variant === 'light'
                ? (isSel ? 'bg-slate-100' : 'hover:bg-slate-50 active:bg-slate-100')
                : (isSel ? 'bg-white/88 border border-white/60 shadow-glass-sm' : 'hover:bg-white/65 active:bg-white/50')
            )}
          >
            <GlassFolderIcon iconType={f.iconType} color={f.color} size={20} simple />
            <span className="text-sm font-medium text-slate-800 flex-1 truncate">{f.title}</span>
            {isSel && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-2xl w-full sm:w-auto sm:min-w-[140px]',
          variant === 'light'
            ? 'bg-white border border-slate-200 shadow-sm text-slate-800 hover:bg-slate-50'
            : 'bg-white/82 backdrop-blur-glass border border-white/60 shadow-glass-sm hover:bg-white/90',
          'text-sm font-semibold transition-colors active:scale-[0.98] touch-manipulation',
          'disabled:opacity-50 disabled:pointer-events-none',
          open && (variant === 'light' ? 'ring-2 ring-slate-200 bg-slate-50' : 'ring-2 ring-slate-200/80 bg-white/90')
        )}
      >
        <FolderOpen className="w-4 h-4 text-slate-500 flex-shrink-0" strokeWidth={2.5} />
        <span className="truncate flex-1 text-left">{selected?.title ?? 'Папка'}</span>
        <ChevronDown
          className={cn('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', open && 'rotate-180')}
          strokeWidth={2.5}
        />
      </button>
      {open && !usePortal && <div className="absolute z-[100] left-0 right-0 mt-2">{list}</div>}
      {open && usePortal && typeof document !== 'undefined' && createPortal(list, document.body)}
    </div>
  );
}
