import { useState, useRef, useCallback, useEffect } from 'react';
import { useProjectCarousels } from '../../hooks/useProjectCarousels';
import type { ProjectCarousel } from '../../hooks/useProjectCarousels';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, ChevronDown, Download, Plus, Trash2,
  ArrowLeft, PenLine, LayoutTemplate, Type, Image as ImageIcon,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Loader2, Camera, Sparkles, Box, Copy, Minus, Circle as CircleIcon,
  Square, RefreshCw, BookmarkPlus, FolderOpen, Link,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import { SlideCanvas } from './SlideCanvas';
import { SlidePreview } from './SlidePreview';
import type { Slide, SlideElement, SlideBackground, TextElement, ImageElement, ShapeElement } from './types';
import {
  createDefaultSlide, createDefaultTextElement, createDefaultImageElement,
  createDefaultShapeElement, createDefaultPlaceholderElement,
} from './types';
import {
  CAROUSEL_TEMPLATES, createEmptySlidesData, createEmptySlideData,
  type CarouselTemplate, type SlideData,
} from './templates';

// ─── Draft system ─────────────────────────────────────────────

// CarouselDraft — совместим с ProjectCarousel из Supabase
type CarouselDraft = ProjectCarousel;

function uid2(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}


function formatDraftDate(ts: string | number): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Shared design tokens (matching AIScriptwriter) ───────────

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('rounded-[18px]', className)}
      style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}
    >
      {children}
    </div>
  );
}

// ─── Mode ────────────────────────────────────────────────────

type EditorMode = 'home' | 'create' | 'template' | 'ai-photo' | 'ai-url';

// ─── Home screen ─────────────────────────────────────────────

function HomeScreen({ onMode, onLoadDraft, drafts, onDeleteDraft, draftsLoading }: {
  onMode: (m: EditorMode) => void;
  onLoadDraft: (draft: CarouselDraft) => void;
  drafts: CarouselDraft[];
  onDeleteDraft: (id: string) => void;
  draftsLoading?: boolean;
}) {
  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteDraft(id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-4 custom-scrollbar-light">
      <div className="max-w-2xl mx-auto w-full py-8 space-y-6">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center space-y-2 pb-2"
        >
          <div
            className="mx-auto w-14 h-14 rounded-[20px] flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #1a1a18 0%, #2c2c28 100%)', boxShadow: '0 6px 20px rgba(0,0,0,0.22)' }}
          >
            <Sparkles size={26} className="text-white" />
          </div>
          <h2 className="text-[20px] font-semibold text-[#1a1a18] tracking-tight">ИИ-Карусели</h2>
          <p className="text-[13px] text-[#1a1a18]/45 leading-relaxed max-w-xs mx-auto">
            Создавай красивые карусели для Instagram
          </p>
        </motion.div>

        {/* Cards — 1 column, horizontal layout */}
        <div className="flex flex-col gap-2.5">
          {[
            {
              delay: 0.05, mode: 'create' as EditorMode,
              icon: <PenLine size={20} className="text-[#1a1a18]" />,
              iconBg: '#f4f4f2',
              title: 'Создать карусель',
              desc: 'Пустой холст — добавляй текст, фото и фон сам',
              badge: null,
            },
            {
              delay: 0.1, mode: 'template' as EditorMode,
              icon: <LayoutTemplate size={20} className="text-amber-700" />,
              iconBg: '#fef3c7',
              title: 'Готовые шаблоны',
              desc: 'Выбери стиль — просто заполни текст',
              badge: null,
            },
            {
              delay: 0.15, mode: 'ai-photo' as EditorMode,
              icon: (
                <div className="relative">
                  <Camera size={19} className="text-white" />
                  <Sparkles size={9} className="text-white/70 absolute -top-1 -right-1" />
                </div>
              ),
              iconBg: 'linear-gradient(135deg, #1a1a18 0%, #2c2c28 100%)',
              title: 'Создать по фото',
              desc: 'Загрузи скриншот — ИИ воспроизведёт дизайн',
              badge: 'ИИ',
            },
            {
              delay: 0.2, mode: 'ai-url' as EditorMode,
              icon: (
                <div className="relative">
                  <Link size={19} className="text-white" />
                  <Sparkles size={9} className="text-white/70 absolute -top-1 -right-1" />
                </div>
              ),
              iconBg: 'linear-gradient(135deg, #833ab4 0%, #c13584 100%)',
              title: 'По ссылке Instagram',
              desc: 'Вставь ссылку — ИИ воссоздаст всю карусель',
              badge: 'ИИ',
            },
          ].map(({ delay, mode, icon, iconBg, title, desc, badge }) => (
            <motion.button
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={() => onMode(mode)}
              className="text-left active:scale-[0.98] touch-manipulation transition-transform"
            >
              <GlassCard className="px-4 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
                  style={{ background: iconBg }}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#1a1a18] leading-tight">{title}</p>
                  <p className="text-[12px] text-[#1a1a18]/45 leading-snug mt-0.5">{desc}</p>
                </div>
                {badge && (
                  <div
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a1a18 0%, #3d3d38 100%)' }}
                  >
                    {badge}
                  </div>
                )}
                <ChevronRight size={16} className="text-[#1a1a18]/20 flex-shrink-0" />
              </GlassCard>
            </motion.button>
          ))}
        </div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <GlassCard className="p-4">
            <p className="text-[12px] font-semibold text-[#1a1a18]/40 uppercase tracking-wider mb-3">Как это работает</p>
            <div className="space-y-3">
              {[
                { n: '1', text: 'Выбери режим — с нуля, по шаблону или по фото' },
                { n: '2', text: 'Добавляй слайды, текст и фото' },
                { n: '3', text: 'Скачивай готовые PNG 1080×1350' },
              ].map((step) => (
                <div key={step.n} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-bold text-slate-500">{step.n}</span>
                  </div>
                  <p className="text-[13px] text-[#1a1a18]/60 leading-snug">{step.text}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Drafts */}
        {(drafts.length > 0 || draftsLoading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider flex items-center gap-1.5">
                <FolderOpen size={12} />
                Черновики проекта
                {draftsLoading && <Loader2 size={10} className="animate-spin ml-1" />}
              </p>
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => onLoadDraft(draft)}
                  className="w-full text-left active:scale-[0.98] touch-manipulation transition-transform"
                >
                  <GlassCard className="px-4 py-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div
                      className="w-8 h-8 rounded-[12px] flex items-center justify-center flex-shrink-0"
                      style={{ background: '#f4f4f2' }}
                    >
                      <PenLine size={15} className="text-[#1a1a18]/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1a1a18] leading-tight truncate">{draft.name}</p>
                      <p className="text-[11px] text-[#1a1a18]/35 leading-snug mt-0.5">
                        {draft.slides.length} сл. · {formatDraftDate(draft.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteDraft(draft.id, e)}
                      className="w-6 h-6 flex items-center justify-center text-[#1a1a18]/20 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </GlassCard>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── AI Photo screen ─────────────────────────────────────────

/** Сжимаем изображение до max 1024px JPEG 0.65 — чтобы влезло в Vercel body limit */
function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function AiPhotoScreen({ onBack, onDone }: { onBack: () => void; onDone: (slides: Slide[], img: { base64: string; mimeType: string }) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { base64, mimeType } = await compressImage(file);
        const res = await fetch('/api/scriptwriter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analyze-carousel', image_data: base64, mime_type: mimeType }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || `HTTP ${res.status}`);
        }
        const data = await res.json();

        const newSlide = convertAiSlideData(data as Parameters<typeof convertAiSlideData>[0]);
        onDone([newSlide], { base64, mimeType });
      } catch (err) {
        console.error('AI analyze error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Ошибка: ${msg}. Попробуй другое фото.`);
      } finally {
        setLoading(false);
      }
    })();
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 flex flex-col overflow-y-auto px-4 custom-scrollbar-light"
    >
      <div className="max-w-2xl mx-auto w-full py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors touch-manipulation"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <h2 className="text-[17px] font-semibold text-[#1a1a18]">Создать по фото</h2>
        </div>

        {/* How it works card */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)' }}
            >
              <div className="relative">
                <Camera size={18} className="text-indigo-600" />
                <Sparkles size={9} className="text-purple-500 absolute -top-1 -right-1" />
              </div>
            </div>
            <p className="text-[14px] font-semibold text-[#1a1a18]">Как это работает</p>
          </div>
          <div className="space-y-3">
            {[
              'Загрузи скриншот карусели (своей или любой другой)',
              'ИИ анализирует фон, расположение текста и блоки с фото',
              'Получаешь готовый слайд — полностью редактируемый',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[11px] font-bold text-indigo-500">{i + 1}</span>
                </div>
                <p className="text-[13px] text-[#1a1a18]/60 leading-snug">{step}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Upload button */}
        <div className="space-y-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-white transition-all active:scale-95 touch-manipulation',
              loading ? 'bg-slate-400 cursor-wait' : 'bg-slate-600 hover:bg-slate-700',
            )}
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Анализирую...
              </>
            ) : (
              <>
                <Camera size={16} />
                Загрузить скриншот
              </>
            )}
          </button>

          {error && (
            <p className="text-[13px] text-red-500 text-center">{error}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </motion.div>
  );
}

// ─── Shared: convert raw AI slide data → Slide ───────────────

function convertAiSlideData(data: {
  background: { type: string; color?: string; from?: string; to?: string; direction?: string; src?: string };
  elements: Array<{
    type: string; text?: string; originalText?: string; x: number; y: number;
    fontSize?: number; fontWeight?: number; color?: string;
    textAlign?: string; width?: number; fontFamily?: string;
    fontStyle?: string; rotation?: number; lineHeight?: number; letterSpacing?: number;
    label?: string; borderRadius?: number; height?: number;
    shapeType?: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number;
    zIndex?: number;
  }>;
}): Slide {
  const px2x = (px: number) => Math.max(0, Math.min(94, (px / 1080) * 100));
  const px2y = (px: number) => Math.max(0, Math.min(94, (px / 1350) * 100));
  const px2w = (px: number) => Math.max(5, Math.min(100, (px / 1080) * 100));
  const px2h = (px: number) => Math.max(1, Math.min(100, (px / 1440) * 100));

  const FONT_MAP: Record<string, string> = {
    'serif':        "'Playfair Display', serif",
    'italic-serif': "'Playfair Display', serif",
    'sans-serif':   'Inter, sans-serif',
    'heavy-sans':   'Montserrat, sans-serif',
    'display':      "'Bebas Neue', cursive",
    'monospace':    'monospace',
  };

  const { background, elements = [] } = data;
  let resolvedBg: import('./types').SlideBackground;
  if (background?.type === 'image' && background.src) {
    // zoom: 1.15 — кадрируем края (убирает ники/подписи снизу из AI-фона)
    resolvedBg = { type: 'image', src: background.src, zoom: 1.15 };
  } else if (background?.type === 'gradient' && background.from && background.to) {
    resolvedBg = { type: 'gradient', from: background.from, to: background.to, direction: background.direction ?? 'to bottom' };
  } else {
    resolvedBg = { type: 'solid', color: background?.color ?? '#f5f5f4' };
  }

  const slide = createDefaultSlide();
  slide.background = resolvedBg;
  slide.elements = elements.flatMap((el): SlideElement[] => {
    if (el.type === 'text') {
      return [createDefaultTextElement({
        text: el.text ?? 'Текст',
        position: { x: px2x(el.x ?? 86), y: px2y(el.y ?? 115) },
        fontSize: Math.max(24, Math.min(220, el.fontSize ?? 48)),
        fontWeight: ([400, 700, 800, 900] as number[]).includes(el.fontWeight ?? 0) ? el.fontWeight! : 700,
        color: el.color ?? '#1a1a18',
        textAlign: (['left', 'center', 'right'].includes(el.textAlign ?? '') ? el.textAlign : 'left') as 'left' | 'center' | 'right',
        width: px2w(el.width ?? 900),
        fontFamily: FONT_MAP[el.fontFamily ?? ''] ?? 'Inter, sans-serif',
        fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
        rotation: typeof el.rotation === 'number' ? el.rotation : 0,
        lineHeight: typeof el.lineHeight === 'number' ? Math.max(0.8, Math.min(2.5, el.lineHeight)) : 1.3,
        letterSpacing: typeof el.letterSpacing === 'number' ? Math.max(-0.1, Math.min(0.5, el.letterSpacing)) : 0,
        zIndex: el.zIndex ?? 2,
        ...(el.originalText ? { originalText: el.originalText } : {}),
      })];
    }
    if (el.type === 'placeholder') {
      return [createDefaultPlaceholderElement({
        position: { x: px2x(el.x ?? 86), y: px2y(el.y ?? 800) },
        size: { width: px2w(el.width ?? 908), height: px2h(el.height ?? 500) },
        label: el.label ?? 'Фото',
        borderRadius: el.borderRadius ?? 16,
        zIndex: el.zIndex ?? 1,
      })];
    }
    if (el.type === 'shape') {
      const validShapeTypes = ['rect', 'circle', 'line', 'arrow'] as const;
      const rawType = el.shapeType ?? 'rect';
      const shapeType = validShapeTypes.includes(rawType as typeof validShapeTypes[number]) ? rawType as typeof validShapeTypes[number] : 'rect';
      return [createDefaultShapeElement({
        position: { x: px2x(el.x ?? 86), y: px2y(el.y ?? 400) },
        size: { width: px2w(el.width ?? 400), height: px2h(el.height ?? 140) },
        shapeType, fill: el.fill ?? 'transparent', stroke: el.stroke ?? '#ffffff',
        strokeWidth: el.strokeWidth ?? 2, borderRadius: el.borderRadius ?? 0,
        opacity: typeof el.opacity === 'number' ? el.opacity : 1,
        zIndex: el.zIndex ?? 1,
      })];
    }
    return [];
  });

  // Smart post-processing 1: центрируем pill-кнопки
  slide.elements = slide.elements.map((el) => {
    if (el.type !== 'shape') return el;
    const s = el as import('./types').ShapeElement;
    if (s.shapeType !== 'rect' || s.borderRadius < 30) return el;
    return { ...s, position: { ...s.position, x: Math.max(0, (100 - s.size.width) / 2) } };
  }).map((el) => {
    if (el.type !== 'text') return el;
    const t = el as import('./types').TextElement;
    const pill = slide.elements.find((e) => {
      if (e.type !== 'shape') return false;
      const s = e as import('./types').ShapeElement;
      return s.shapeType === 'rect' && s.borderRadius >= 30 && Math.abs(s.position.y - t.position.y) < 8;
    }) as import('./types').ShapeElement | undefined;
    if (!pill) return el;
    const pillCenterX = pill.position.x + pill.size.width / 2;
    return { ...t, position: { ...t.position, x: Math.max(0, pillCenterX - t.width / 2) }, textAlign: 'center' as const };
  });

  // Smart post-processing 2: текст не должен перекрывать placeholder
  // Органичные правила (в порядке приоритета):
  //   1. Сжать межстрочный интервал (lineHeight)
  //   2. Сжать межбуквенный интервал (letterSpacing)
  //   3. Расширить ширину блока (чтобы текст занял меньше строк)
  //   4. Сдвинуть вверх (крайний случай)
  const placeholders = slide.elements.filter(e => e.type === 'placeholder') as import('./types').PlaceholderElement[];
  if (placeholders.length > 0) {
    // Вспомогательная функция: приблизительная высота текстового блока в %
    // Считаем по средней ширине символа (fontSize*0.55) → кол-во строк → высота в %
    const estimateTextHeight = (t: import('./types').TextElement): number => {
      const charWidth = t.fontSize * 0.55; // ~ширина символа в px
      const widthPx = (t.width / 100) * 1080;
      const charsPerLine = Math.max(1, Math.floor(widthPx / charWidth));
      const textLen = t.text.replace(/<[^>]+>/g, '').length || 10;
      const lines = Math.ceil(textLen / charsPerLine);
      const heightPx = lines * t.fontSize * (t.lineHeight ?? 1.3);
      return (heightPx / 1440) * 100;
    };

    slide.elements = slide.elements.map((el) => {
      if (el.type !== 'text') return el;
      let t = { ...(el as import('./types').TextElement) };

      for (const ph of placeholders) {
        const phTop = ph.position.y;
        const phLeft = ph.position.x;
        const phRight = phLeft + ph.size.width;

        const tLeft = t.position.x;
        const tRight = tLeft + t.width;
        const xOverlap = tLeft < phRight && tRight > phLeft;
        if (!xOverlap) continue;

        const checkOverlap = () => {
          const tBottom = t.position.y + estimateTextHeight(t);
          return t.position.y < (phTop + ph.size.height) && tBottom > phTop;
        };

        if (!checkOverlap()) continue;

        // Шаг 1: сжать межстрочный интервал до минимума (1.0)
        if ((t.lineHeight ?? 1.3) > 1.0) {
          t = { ...t, lineHeight: Math.max(1.0, (t.lineHeight ?? 1.3) - 0.15) };
          if (!checkOverlap()) continue;
        }

        // Шаг 2: убрать межбуквенный интервал
        if ((t.letterSpacing ?? 0) > 0) {
          t = { ...t, letterSpacing: 0 };
          if (!checkOverlap()) continue;
        }

        // Шаг 3: расширить ширину блока (текст займёт меньше строк)
        const maxWidth = 92; // % от холста
        if (t.width < maxWidth) {
          t = { ...t, width: Math.min(maxWidth, t.width * 1.3) };
          if (!checkOverlap()) continue;
        }

        // Шаг 4: сдвинуть в наиболее логичную сторону
        // Считаем насколько нужно сдвинуть в каждую из 4 сторон
        const textH = estimateTextHeight(t);
        const tCenterY = t.position.y + textH / 2;
        const tCenterX = t.position.x + t.width / 2;
        const phCenterY = phTop + ph.size.height / 2;
        const phCenterX = phLeft + ph.size.width / 2;

        // Расстояния для выталкивания в каждую сторону
        const pushUp    = t.position.y + textH - phTop;           // сколько надо уйти вверх
        const pushDown  = (phTop + ph.size.height) - t.position.y; // сколько надо уйти вниз
        const pushLeft  = t.position.x + t.width - phLeft;         // сколько надо уйти влево
        const pushRight = (phLeft + ph.size.width) - t.position.x; // сколько надо уйти вправо

        // Проверяем хватит ли места на холсте в каждом направлении
        const canUp    = t.position.y - pushUp >= 0;
        const canDown  = t.position.y + textH + pushDown <= 100;
        const canLeft  = t.position.x - pushLeft >= 0;
        const canRight = t.position.x + t.width + pushRight <= 96;

        // Выбираем направление: сначала по тому где центр текста относительно фото
        // (текст левее центра фото → лучше двигать влево, и т.д.)
        const preferVertical = Math.abs(tCenterY - phCenterY) >= Math.abs(tCenterX - phCenterX);

        if (preferVertical) {
          if (tCenterY < phCenterY && canUp) {
            // Текст выше центра фото → двигаем вверх
            t = { ...t, position: { ...t.position, y: Math.max(0, phTop - textH - 1.5) } };
          } else if (canDown) {
            // Текст ниже центра фото → двигаем вниз
            t = { ...t, position: { ...t.position, y: Math.min(96, phTop + ph.size.height + 1.5) } };
          } else if (tCenterX < phCenterX && canLeft) {
            t = { ...t, position: { ...t.position, x: Math.max(0, phLeft - t.width - 1.5) } };
          } else if (canRight) {
            t = { ...t, position: { ...t.position, x: Math.min(96, phLeft + ph.size.width + 1.5) } };
          }
        } else {
          if (tCenterX < phCenterX && canLeft) {
            // Текст левее центра фото → двигаем влево
            t = { ...t, position: { ...t.position, x: Math.max(0, phLeft - t.width - 1.5) } };
          } else if (canRight) {
            // Текст правее центра фото → двигаем вправо
            t = { ...t, position: { ...t.position, x: Math.min(96, phLeft + ph.size.width + 1.5) } };
          } else if (tCenterY < phCenterY && canUp) {
            t = { ...t, position: { ...t.position, y: Math.max(0, phTop - textH - 1.5) } };
          } else if (canDown) {
            t = { ...t, position: { ...t.position, y: Math.min(96, phTop + ph.size.height + 1.5) } };
          }
        }
      }

      return t;
    });
  }

  return slide;
}

// ─── SlideThumb — превью слайда Instagram (с fallback при CORS) ───────────────

function SlideThumb({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#1a1a18]/30">
        <span className="text-[18px]">{index === 0 ? '🖼' : '📄'}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Слайд ${index + 1}`}
      className="absolute inset-0 w-full h-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

// ─── AiUrlScreen ─────────────────────────────────────────────

const IG_GRADIENT = 'linear-gradient(135deg, #833ab4 0%, #c13584 100%)';
type UrlStep = 'url' | 'select' | 'generating';

function AiUrlScreen({ onBack, onDone }: { onBack: () => void; onDone: (slides: Slide[]) => void }) {
  const [step, setStep] = useState<UrlStep>('url');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [slideCount, setSlideCount] = useState(0);
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [bgSlideIdx, setBgSlideIdx] = useState(0);
  const [regenFirstBg, setRegenFirstBg] = useState(false);
  const [translateContent, setTranslateContent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch-carousel-slides', instagram_url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSlideCount(data.slide_count);
      setSlideUrls(data.slide_urls || []);
      setCode(data.code);
      setBgSlideIdx(0);
      setRegenFirstBg(data.slide_count > 1);
      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleGenerate = useCallback(async () => {
    setStep('generating');
    setError(null);
    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze-carousel-from-url',
          code,
          background_slide_index: bgSlideIdx,
          regen_first_bg: regenFirstBg,
          translate: translateContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rawSlides = data.slides as Array<{
        background: { type: string; color?: string; from?: string; to?: string; direction?: string; src?: string };
        elements: any[];
      }>;
      if (!rawSlides?.length) throw new Error('Слайды не получены');
      onDone(rawSlides.map(convertAiSlideData));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('select');
    }
  }, [code, bgSlideIdx, regenFirstBg, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 flex flex-col overflow-y-auto px-4 custom-scrollbar-light"
    >
      <div className="max-w-2xl mx-auto w-full py-6 space-y-5">

        <div className="flex items-center gap-3">
          <button
            onClick={step === 'select' ? () => setStep('url') : onBack}
            className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors touch-manipulation"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <h2 className="text-[17px] font-semibold text-[#1a1a18]">По ссылке Instagram</h2>
        </div>

        {/* Шаг 1 — ввод URL */}
        {step === 'url' && (
          <>
            <GlassCard className="p-4">
              <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider mb-2">Ссылка на карусель</p>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/p/..."
                className="w-full rounded-xl px-3 py-2.5 text-[14px] text-[#1a1a18] outline-none border border-[#1a1a18]/10 focus:border-[#833ab4]/50 bg-white/60 transition-colors"
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleFetch(); }}
                disabled={loading}
                autoFocus
              />
            </GlassCard>

            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-white transition-all active:scale-95 touch-manipulation',
                loading || !url.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90',
              )}
              style={{ background: IG_GRADIENT, boxShadow: '0 1px 6px rgba(131,58,180,0.35)' }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" />Ищу слайды...</> : <><Link size={16} />Найти слайды</>}
            </button>

            {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}

            <GlassCard className="p-3">
              <p className="text-[11px] text-[#1a1a18]/40 leading-relaxed">
                Работает с публичными постами: <span className="font-mono text-[10px]">instagram.com/p/XXX</span> или <span className="font-mono text-[10px]">instagram.com/reel/XXX</span>
              </p>
            </GlassCard>
          </>
        )}

        {/* Шаг 2 — выбор параметров */}
        {step === 'select' && (
          <>
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: IG_GRADIENT }}>
                  <span className="text-white text-[11px] font-bold">{slideCount}</span>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a18]">
                  Найдено {slideCount} {slideCount === 1 ? 'слайд' : slideCount < 5 ? 'слайда' : 'слайдов'}
                </p>
              </div>
              <p className="text-[12px] text-[#1a1a18]/40 truncate">{url}</p>
            </GlassCard>

            <GlassCard className="p-4 space-y-3">
              <p className="text-[13px] font-semibold text-[#1a1a18]">Какой слайд взять за основу фона?</p>
              <p className="text-[11px] text-[#1a1a18]/45 -mt-1">Фон этого слайда будет применён ко всей карусели</p>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: Math.min(slideCount, 15) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setBgSlideIdx(i)}
                    className={cn(
                      'aspect-[3/4] rounded-xl overflow-hidden relative transition-all border-2',
                      bgSlideIdx === i ? 'border-[#833ab4]' : 'border-transparent',
                    )}
                    style={{ background: 'rgba(0,0,0,0.06)' }}
                  >
                    {slideUrls[i] ? (
                      <SlideThumb url={slideUrls[i]} index={i} />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#1a1a18]/30">
                        <span className="text-[18px]">{i === 0 ? '🖼' : '📄'}</span>
                        <span className="text-[11px] font-semibold">{i + 1}</span>
                      </div>
                    )}
                    {bgSlideIdx === i && (
                      <div className="absolute inset-0 rounded-[10px]" style={{ boxShadow: 'inset 0 0 0 2px #833ab4', background: 'rgba(131,58,180,0.12)' }} />
                    )}
                    <div className="absolute bottom-1 left-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: bgSlideIdx === i ? IG_GRADIENT : 'rgba(0,0,0,0.45)', color: '#fff' }}>
                      {i + 1}
                    </div>
                  </button>
                ))}
              </div>
            </GlassCard>

            {slideCount > 1 && (
              <GlassCard className="p-4">
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setRegenFirstBg(!regenFirstBg)}>
                  <div
                    className={cn('w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all', regenFirstBg ? 'border-[#833ab4]' : 'border-[#1a1a18]/15')}
                    style={regenFirstBg ? { background: IG_GRADIENT } : {}}
                  >
                    {regenFirstBg && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a1a18]">Воссоздать фон первого слайда отдельно</p>
                    <p className="text-[11px] text-[#1a1a18]/45 mt-0.5">Обложка часто отличается от остальных слайдов</p>
                  </div>
                </button>
              </GlassCard>
            )}

            <GlassCard className="p-4">
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setTranslateContent(!translateContent)}>
                <div
                  className={cn('w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all', translateContent ? 'border-[#833ab4]' : 'border-[#1a1a18]/15')}
                  style={translateContent ? { background: IG_GRADIENT } : {}}
                >
                  {translateContent && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a18]">Перевести текст на русский</p>
                  <p className="text-[11px] text-[#1a1a18]/45 mt-0.5">RiRi переведёт все тексты при воссоздании</p>
                </div>
              </button>
            </GlassCard>

            {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}

            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-white transition-all active:scale-95 touch-manipulation hover:opacity-90"
              style={{ background: IG_GRADIENT, boxShadow: '0 1px 6px rgba(131,58,180,0.35)' }}
            >
              <Sparkles size={16} />
              Воссоздать карусель
            </button>
          </>
        )}

        {/* Шаг 3 — генерация */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: IG_GRADIENT }}>
              <Loader2 size={26} className="text-white animate-spin" />
            </div>
            <p className="text-[16px] font-semibold text-[#1a1a18]">Воссоздаю карусель...</p>
            <p className="text-[13px] text-[#1a1a18]/45 text-center max-w-xs">
              RiRi трудится сразу над {slideCount} {slideCount === 1 ? 'слайдом' : slideCount < 5 ? 'слайдами' : 'слайдами'} параллельно — обычно это занимает 20–40 сек.
            </p>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// ─── Floating toolbar button ─────────────────────────────────

function FloatBtn({
  icon, label, active, onClick, danger, hasPanel,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  danger?: boolean;
  hasPanel?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      title={label}
      className="flex items-center gap-2 px-3 py-2.5 rounded-2xl touch-manipulation flex-shrink-0 transition-colors w-full"
      style={{
        background: active ? '#1a1a18' : danger ? 'rgba(239,68,68,0.08)' : '#ffffff',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        color: active ? '#ffffff' : danger ? '#ef4444' : '#1a1a18',
        minWidth: 104,
      }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1, flex: 1, textAlign: 'left' }}>{label}</span>
      {hasPanel && (
        <ChevronDown size={11} style={{ opacity: active ? 0.6 : 0.3, flexShrink: 0 }} />
      )}
    </motion.button>
  );
}

// ─── Background preset picker ────────────────────────────────

const PRESET_COLORS = [
  '#ffffff', '#f5f5f4', '#1a1a2e', '#0f172a', '#000000',
  '#fce7f3', '#eff6ff', '#f0fdf4', '#fefce8', '#fdf4ff',
];
const PRESET_GRADIENTS = [
  { from: '#fce4ec', to: '#f3e5f5', dir: 'to bottom right' },
  { from: '#e3f2fd', to: '#e8eaf6', dir: 'to bottom right' },
  { from: '#1a1a2e', to: '#16213e', dir: 'to bottom' },
  { from: '#0f172a', to: '#1e293b', dir: 'to bottom right' },
  { from: '#f0fdf4', to: '#dcfce7', dir: 'to bottom' },
  { from: '#fef9c3', to: '#fef3c7', dir: 'to bottom right' },
];

// ─── Free editor ──────────────────────────────────────────────

function FreeEditor({ onBack, initialSlides, initialDraftId, aiOriginalImage, onUpdateOriginalImage, onSaveDraft }: {
  onBack: () => void;
  initialSlides?: Slide[];
  initialDraftId?: string;
  aiOriginalImage?: { base64: string; mimeType: string };
  onUpdateOriginalImage?: (img: { base64: string; mimeType: string }) => void;
  onSaveDraft?: (id: string, name: string, slides: Slide[]) => Promise<void>;
}) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides ?? [createDefaultSlide()]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activePanel, setActivePanel] = useState<'add' | 'bg' | 'text' | 'image' | 'shape' | 'shape-picker' | null>(null);
  const [regenBgLoading, setRegenBgLoading] = useState(false);
  const [draftId] = useState<string>(initialDraftId ?? uid2());
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const replaceRefInputRef = useRef<HTMLInputElement>(null);
  const replacePlaceholderInputRef = useRef<HTMLInputElement>(null);
  const pendingPlaceholderIdRef = useRef<string | null>(null);

  // ─── Undo ────────────────────────────────────────────────────
  const historyRef = useRef<Slide[][]>([]);
  const isUndoingRef = useRef(false);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSlidesRef = useRef<Slide[]>(slides);

  // Capture a debounced snapshot before each change
  useEffect(() => {
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      prevSlidesRef.current = slides;
      return;
    }
    const prev = prevSlidesRef.current;
    prevSlidesRef.current = slides;
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      historyRef.current = [...historyRef.current.slice(-49), JSON.parse(JSON.stringify(prev))];
    }, 400);
  }, [slides]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) { toast.info('Нечего отменять'); return; }
    isUndoingRef.current = true;
    setSlides(historyRef.current.pop()!);
    setSelectedId(null);
    setActivePanel(null);
  }, []);

  // Ctrl/Cmd+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  // ─── Autosave ─────────────────────────────────────────────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const name = `Автосохранение ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
      if (onSaveDraft) await onSaveDraft(draftId, name, slides);
      setLastSaved(Date.now());
    }, 2000);
  }, [slides, draftId, onSaveDraft]);

  const slide = slides[currentIdx];

  const updateSlide = useCallback((idx: number, updater: (s: Slide) => Slide) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? updater(s) : s)));
  }, []);

  const onUpdateBackground = useCallback((bg: SlideBackground) => {
    updateSlide(currentIdx, (s) => ({ ...s, background: bg }));
  }, [currentIdx, updateSlide]);

  const onAddElement = useCallback((el: SlideElement) => {
    updateSlide(currentIdx, (s) => ({ ...s, elements: [...s.elements, el] }));
    setSelectedId(el.id);
  }, [currentIdx, updateSlide]);

  const onUpdateElement = useCallback((id: string, updates: Partial<SlideElement>) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === id ? { ...el, ...updates } as SlideElement : el
      ),
    }));
  }, [currentIdx, updateSlide]);

  const onUpdateTextContent = useCallback((id: string, text: string) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === id && el.type === 'text' ? { ...el, text } : el
      ),
    }));
  }, [currentIdx, updateSlide]);

  const onDeleteElement = useCallback((id: string) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.filter((el) => el.id !== id),
    }));
    setSelectedId(null);
    setActivePanel(null);
  }, [currentIdx, updateSlide]);

  const addSlide = useCallback(() => {
    if (slides.length >= 10) return;
    const newSlide = createDefaultSlide();
    newSlide.background = { ...slide.background };
    setSlides((prev) => [...prev, newSlide]);
    setCurrentIdx(slides.length);
    setSelectedId(null);
  }, [slides.length, slide.background]);

  const copySlide = useCallback((idx: number) => {
    if (slides.length >= 10) return;
    const source = slides[idx];
    const clone: Slide = {
      ...createDefaultSlide(),
      background: JSON.parse(JSON.stringify(source.background)),
      elements: JSON.parse(JSON.stringify(source.elements)),
    };
    setSlides((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
    setCurrentIdx(idx + 1);
    setSelectedId(null);
  }, [slides]);

  const removeSlide = useCallback((idx: number) => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    setCurrentIdx((prev) => Math.min(prev, slides.length - 2));
    setSelectedId(null);
  }, [slides.length]);

  const handleSelectElement = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) {
      setActivePanel(null);
      return;
    }
    const el = slide.elements.find((e) => e.id === id);
    if (el?.type === 'text') setActivePanel('text');
    else if (el?.type === 'image') setActivePanel('image');
    else if (el?.type === 'shape') setActivePanel('shape');
    else setActivePanel(null);
  }, [slide.elements]);

  const handleSaveDraft = useCallback(async () => {
    const name = `Черновик ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
    if (onSaveDraft) await onSaveDraft(draftId, name, slides);
    setLastSaved(Date.now());
    toast.success('Черновик сохранён');
  }, [draftId, slides, onSaveDraft]);

  const handleAddText = useCallback(() => {
    const el = createDefaultTextElement({ text: 'Твой текст' });
    onAddElement(el);
    setActivePanel('text');
    setTimeout(() => setEditingTextId(el.id), 50);
  }, [onAddElement]);

  const handleAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = createDefaultImageElement(reader.result as string);
      onAddElement(el);
      setActivePanel('image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onAddElement]);

  const handleBgImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdateBackground({ type: 'image', src: reader.result as string });
    };
    reader.readAsDataURL(file);
  }, [onUpdateBackground]);

  const handleRegenBg = useCallback(async () => {
    const img = aiOriginalImage;
    if (!img) return;
    setRegenBgLoading(true);
    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regen-background', image_data: img.base64, mime_type: img.mimeType }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.background?.type === 'image' && data.background.src) {
        onUpdateBackground({ type: 'image', src: data.background.src, zoom: 1.15 });
      }
    } catch (err) {
      console.error('Regen bg error:', err);
    } finally {
      setRegenBgLoading(false);
    }
  }, [aiOriginalImage, onUpdateBackground]);

  const handleReplaceRef = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      onUpdateOriginalImage?.({ base64: b64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }, [onUpdateOriginalImage]);

  const handleAddShape = useCallback((shapeType: 'rect' | 'circle' | 'line' | 'arrow' = 'rect') => {
    const el = createDefaultShapeElement({ shapeType });
    onAddElement(el);
    setActivePanel(null);
  }, [onAddElement]);

  const handleReplacePlaceholder = useCallback((id: string) => {
    pendingPlaceholderIdRef.current = id;
    replacePlaceholderInputRef.current?.click();
  }, []);

  const handleReplacePlaceholderFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const placeholderId = pendingPlaceholderIdRef.current;
    if (!file || !placeholderId) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      // Find the placeholder to get its position/size
      const placeholder = slide.elements.find((el) => el.id === placeholderId);
      if (!placeholder || placeholder.type !== 'placeholder') return;

      // Replace placeholder with image element keeping same position/size
      const newEl = createDefaultImageElement(reader.result as string, {
        position: { ...placeholder.position },
        size: { ...placeholder.size },
        borderRadius: placeholder.borderRadius,
      });

      updateSlide(currentIdx, (s) => ({
        ...s,
        elements: s.elements.map((el) => el.id === placeholderId ? newEl : el),
      }));
      setSelectedId(newEl.id);
    };
    reader.readAsDataURL(file);
    pendingPlaceholderIdRef.current = null;
  }, [slide.elements, currentIdx, updateSlide]);

  const exportSlides = useCallback(async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    setSelectedId(null);
    setEditingTextId(null);
    setActivePanel(null);
    try {
      for (let i = 0; i < slides.length; i++) {
        setCurrentIdx(i);
        await new Promise((r) => setTimeout(r, 150));
        const dataUrl = await toPng(canvasRef.current, {
          width: 1080, height: 1350, pixelRatio: 2,
          style: { width: '1080px', height: '1350px', maxWidth: '1080px' },
        });
        const link = document.createElement('a');
        link.download = `slide-${i + 1}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [slides]);

  const selectedEl = slide.elements.find((el) => el.id === selectedId) || null;

  const hasElements = slide.elements.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-3 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors touch-manipulation flex-shrink-0"
        >
          <ArrowLeft size={16} />
          Назад
        </button>

        {/* Autosave status */}
        {lastSaved && (
          <span className="text-[11px] text-[#1a1a18]/30 hidden sm:block flex-shrink-0">
            Сохр. {new Date(lastSaved).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[12px] text-[#1a1a18]/30 flex-shrink-0">{currentIdx + 1}/{slides.length}</span>
          {/* Undo */}
          <button
            onClick={undo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center justify-center w-8 h-8 rounded-xl transition-all active:scale-95 touch-manipulation"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>↩</span>
          </button>
          <button
            onClick={handleSaveDraft}
            className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-all active:scale-95 touch-manipulation"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <BookmarkPlus size={12} />
            <span className="hidden sm:inline">Сохранить</span>
          </button>
          <button
            onClick={exportSlides}
            disabled={exporting}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-medium text-white transition-all active:scale-95 touch-manipulation',
              exporting ? 'bg-slate-400 cursor-wait' : 'bg-slate-600 hover:bg-slate-700',
            )}
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
          >
            <Download size={13} />
            {exporting ? '...' : 'PNG'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

        {/* Slide thumbnails (left panel on desktop, top strip on mobile) */}
        <div className="hidden lg:flex flex-col w-[88px] border-r border-black/[0.06] overflow-y-auto py-3 gap-2 items-center">
          {slides.map((s, i) => (
            <div key={s.id} className="relative group">
              <button
                onClick={() => { setCurrentIdx(i); setSelectedId(null); }}
                className={cn(
                  'w-9 rounded-xl overflow-hidden border-2 transition-all',
                  i === currentIdx ? 'border-slate-500 shadow-md' : 'border-transparent hover:border-slate-200',
                )}
                style={{ aspectRatio: '3/4' }}
              >
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={s.background.type === 'solid' ? { backgroundColor: s.background.color } :
                    s.background.type === 'gradient' ? { background: `linear-gradient(${s.background.direction}, ${s.background.from}, ${s.background.to})` } :
                    { backgroundImage: `url(${s.background.src})`, backgroundSize: 'cover' }
                  }
                >
                  <span className="text-[10px] font-bold text-white/60 drop-shadow">{i + 1}</span>
                </div>
              </button>
              <button
                onClick={() => copySlide(i)}
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-600 text-white hidden group-hover:flex items-center justify-center"
                title="Копировать слайд"
              >
                <Copy size={8} />
              </button>
              {slides.length > 1 && (
                <button
                  onClick={() => removeSlide(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center"
                >
                  <span className="text-[9px] font-bold">×</span>
                </button>
              )}
            </div>
          ))}
          {slides.length < 10 && (
            <button
              onClick={addSlide}
              className="w-9 rounded-xl border-2 border-dashed border-slate-200 hover:border-slate-400 flex items-center justify-center transition-colors touch-manipulation"
              style={{ aspectRatio: '3/4' }}
            >
              <Plus size={16} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* Canvas + floating UI wrapper */}
        <div className="flex-1 relative overflow-hidden">

          {/* Scrollable canvas area */}
          <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-start py-4 px-4 gap-4 custom-scrollbar-light">

            {/* Mobile slide strip */}
            <div className="flex lg:hidden gap-2 overflow-x-auto pb-1 w-full max-w-sm">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setCurrentIdx(i); setSelectedId(null); }}
                  className={cn(
                    'flex-shrink-0 w-9 h-12 rounded-xl overflow-hidden border-2 transition-all',
                    i === currentIdx ? 'border-slate-500' : 'border-transparent',
                  )}
                  style={s.background.type === 'solid' ? { backgroundColor: s.background.color } :
                    s.background.type === 'gradient' ? { background: `linear-gradient(${s.background.direction}, ${s.background.from}, ${s.background.to})` } :
                    { backgroundImage: `url(${s.background.src})`, backgroundSize: 'cover' }
                  }
                />
              ))}
              {slides.length < 10 && (
                <button
                  onClick={addSlide}
                  className="flex-shrink-0 w-9 h-12 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center"
                >
                  <Plus size={14} className="text-slate-400" />
                </button>
              )}
            </div>

            {/* Canvas */}
            <div className="w-full max-w-sm relative" style={{ padding: 6 }}>
              <div
                className="w-full"
                style={{ borderRadius: 20, boxShadow: '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)' }}
              >
                <SlideCanvas
                  ref={canvasRef}
                  slide={slide}
                  selectedId={selectedId}
                  editingTextId={editingTextId}
                  onSelectElement={handleSelectElement}
                  onStartEditText={setEditingTextId}
                  onStopEditText={() => setEditingTextId(null)}
                  onUpdateElement={onUpdateElement}
                  onUpdateTextContent={onUpdateTextContent}
                  onReplacePlaceholder={handleReplacePlaceholder}
                  className="rounded-[20px]"
                />
              </div>

              {/* Empty state hint */}
              {!hasElements && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="px-4 py-2.5 rounded-2xl text-center"
                    style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
                  >
                    <p className="text-[13px] text-white/80">Нажми + справа</p>
                    <p className="text-[11px] text-white/50">чтобы добавить текст или фото</p>
                  </div>
                </div>
              )}
            </div>

            {/* Hint */}
            {selectedEl?.type === 'text' && editingTextId !== selectedId && (
              <p className="text-[12px] text-[#1a1a18]/40 text-center">
                Нажми «Двигай» чтобы переместить
              </p>
            )}
          </div>

          {/* ── Floating toolbar buttons (right side) ── */}
          <div className="absolute right-3 top-4 flex flex-col gap-1.5 z-30" style={{ width: 112 }}>

            {/* Add */}
            <FloatBtn
              icon={<Plus size={18} />}
              label="Добавить"
              active={activePanel === 'add'}
              hasPanel
              onClick={() => setActivePanel((p) => p === 'add' ? null : 'add')}
            />

            {/* Background */}
            <FloatBtn
              icon={
                <div
                  className="w-[18px] h-[18px] rounded-full border border-black/10 flex-shrink-0"
                  style={
                    slide.background.type === 'solid' ? { backgroundColor: slide.background.color }
                    : slide.background.type === 'gradient' ? { background: `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})` }
                    : { background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' }
                  }
                />
              }
              label="Фон"
              active={activePanel === 'bg'}
              hasPanel
              onClick={() => setActivePanel((p) => p === 'bg' ? null : 'bg')}
            />

            {/* Shape — opens picker panel */}
            <FloatBtn
              icon={<Box size={18} />}
              label="Фигура"
              active={activePanel === 'shape-picker'}
              hasPanel
              onClick={() => setActivePanel((p) => p === 'shape-picker' ? null : 'shape-picker')}
            />

            {/* Text props */}
            {selectedEl?.type === 'text' && (
              <FloatBtn
                icon={<Type size={18} />}
                label="Текст"
                active={activePanel === 'text'}
                hasPanel
                onClick={() => setActivePanel((p) => p === 'text' ? null : 'text')}
              />
            )}

            {/* Image props */}
            {selectedEl?.type === 'image' && (
              <FloatBtn
                icon={<ImageIcon size={18} />}
                label="Фото"
                active={activePanel === 'image'}
                hasPanel
                onClick={() => setActivePanel((p) => p === 'image' ? null : 'image')}
              />
            )}

            {/* Shape props */}
            {selectedEl?.type === 'shape' && (
              <FloatBtn
                icon={<Box size={18} />}
                label="Стиль"
                active={activePanel === 'shape'}
                hasPanel
                onClick={() => setActivePanel((p) => p === 'shape' ? null : 'shape')}
              />
            )}

            {/* Copy to all slides */}
            {selectedEl && slides.length > 1 && (
              <FloatBtn
                icon={<Copy size={16} />}
                label="На все слайды"
                onClick={() => {
                  const elJson = JSON.stringify(selectedEl);
                  setSlides((prev) => prev.map((s, i) => {
                    if (i === currentIdx) return s;
                    const clone = { ...JSON.parse(elJson), id: `${selectedEl.id}-copy-${i}` };
                    return { ...s, elements: [...s.elements, clone] };
                  }));
                  toast.success(`Скопировано на ${slides.length - 1} слайд${slides.length - 1 > 1 ? 'а' : ''}`);
                }}
              />
            )}

            {/* Delete — direct action */}
            {selectedEl && (
              <FloatBtn
                icon={<Trash2 size={16} />}
                label="Удалить"
                onClick={() => { onDeleteElement(selectedEl.id); }}
                danger
              />
            )}
          </div>

          {/* ── Floating properties panel ── */}
          <AnimatePresence>
            {activePanel && (
              <motion.div
                key={activePanel}
                initial={{ opacity: 0, x: 10, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="absolute right-[124px] top-4 z-20 w-52 max-h-[calc(100%-32px)] overflow-y-auto rounded-[20px] custom-scrollbar-light"
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.07)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div className="p-3.5">
                  <PropertiesPanel
                    slide={slide}
                    selectedEl={selectedEl}
                    onUpdateBackground={onUpdateBackground}
                    onUpdateElement={onUpdateElement}
                    onAddText={handleAddText}
                    onAddImage={() => imageInputRef.current?.click()}
                    onBgImage={() => bgImageInputRef.current?.click()}
                    onRegenBg={aiOriginalImage ? handleRegenBg : undefined}
                    regenBgLoading={regenBgLoading}
                    aiOriginalImage={aiOriginalImage}
                    onReplaceRef={onUpdateOriginalImage ? () => replaceRefInputRef.current?.click() : undefined}
                    onAddShape={handleAddShape}
                    mobilePanel={activePanel}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
      <input ref={bgImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImage} />
      <input ref={replaceRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceRef} />
      <input ref={replacePlaceholderInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplacePlaceholderFile} />
    </div>
  );
}

// ─── Properties panel ────────────────────────────────────────

interface PropertiesPanelProps {
  slide: Slide;
  selectedEl: SlideElement | null;
  onUpdateBackground: (bg: SlideBackground) => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onAddText: () => void;
  onAddImage: () => void;
  onBgImage: () => void;
  onRegenBg?: () => void;
  regenBgLoading?: boolean;
  onReplaceRef?: () => void;
  aiOriginalImage?: { base64: string; mimeType: string };
  onAddShape: (type?: 'rect' | 'circle' | 'line' | 'arrow') => void;
  mobilePanel: 'add' | 'bg' | 'text' | 'image' | 'shape' | 'shape-picker';
}

function PropertiesPanel({
  slide, selectedEl, onUpdateBackground, onUpdateElement,
  onAddText, onAddImage, onBgImage, onRegenBg, regenBgLoading, onReplaceRef, aiOriginalImage, onAddShape, mobilePanel,
}: PropertiesPanelProps) {

  const showAdd = mobilePanel === 'add';
  const showBg = mobilePanel === 'bg';
  const showText = mobilePanel === 'text';
  const showImage = mobilePanel === 'image';
  const showShape = mobilePanel === 'shape';
  const showShapePicker = mobilePanel === 'shape-picker';

  return (
    <div className="p-4 space-y-5">
      {/* Shape picker */}
      {showShapePicker && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Добавить фигуру</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { type: 'rect' as const, label: 'Прямоугольник', icon: <Square size={22} /> },
              { type: 'circle' as const, label: 'Круг', icon: <CircleIcon size={22} /> },
              { type: 'line' as const, label: 'Линия', icon: <Minus size={22} /> },
              { type: 'arrow' as const, label: 'Стрелка', icon: <span style={{ fontSize: 22, lineHeight: 1 }}>→</span> },
            ]).map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => { onAddShape(type); }}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all touch-manipulation hover:scale-[1.02] active:scale-95"
                style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.07)' }}
              >
                <span className="text-slate-600">{icon}</span>
                <span className="text-[11px] text-slate-600 font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add elements */}
      {showAdd && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Добавить</p>
          <div className="flex gap-2">
            <button
              onClick={onAddText}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13px] font-medium text-slate-700 transition-all touch-manipulation"
              style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <Type size={14} />
              Текст
            </button>
            <button
              onClick={onAddImage}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13px] font-medium text-slate-700 transition-all touch-manipulation"
              style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <ImageIcon size={14} />
              Фото
            </button>
          </div>
          <button
            onClick={() => onAddShape()}
            className="w-full flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13px] font-medium text-slate-700 transition-all touch-manipulation"
            style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <Box size={14} />
            Фигура
          </button>
        </div>
      )}

      {/* Background */}
      {showBg && (
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Фон слайда</p>

          {/* Solid colors */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onUpdateBackground({ type: 'solid', color })}
                className={cn(
                  'w-7 h-7 rounded-xl border-2 transition-all touch-manipulation',
                  slide.background.type === 'solid' && slide.background.color === color
                    ? 'border-slate-500 scale-110' : 'border-slate-100 hover:border-slate-300',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              className="w-7 h-7 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-all"
              title="Свой цвет"
            >
              <span className="text-[10px] text-slate-400">+</span>
              <input
                type="color"
                className="sr-only"
                value={slide.background.type === 'solid' ? slide.background.color : '#ffffff'}
                onChange={(e) => onUpdateBackground({ type: 'solid', color: e.target.value })}
              />
            </label>
          </div>

          {/* Gradients */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_GRADIENTS.map((g, i) => (
              <button
                key={i}
                onClick={() => onUpdateBackground({ type: 'gradient', from: g.from, to: g.to, direction: g.dir })}
                className={cn(
                  'w-7 h-7 rounded-xl border-2 transition-all touch-manipulation',
                  slide.background.type === 'gradient' && slide.background.from === g.from
                    ? 'border-slate-500 scale-110' : 'border-slate-100 hover:border-slate-300',
                )}
                style={{ background: `linear-gradient(${g.dir}, ${g.from}, ${g.to})` }}
              />
            ))}
          </div>

          {/* Current bg image preview + replace + sliders */}
          {slide.background.type === 'image' && slide.background.src && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-10 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0"
                  style={{ aspectRatio: '4/5', backgroundImage: `url(${slide.background.src})`, backgroundSize: 'cover', filter: `brightness(${slide.background.brightness ?? 1})` }}
                />
                <button
                  onClick={onBgImage}
                  className="flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700 transition-colors touch-manipulation"
                >
                  <RefreshCw size={11} />
                  Заменить фото
                </button>
              </div>
              {/* Brightness */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#1a1a18]/40 uppercase tracking-wider">Яркость</span>
                  <span className="text-[10px] text-slate-400">{Math.round((slide.background.brightness ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range" min="0.2" max="2" step="0.05"
                  value={slide.background.brightness ?? 1}
                  onChange={(e) => onUpdateBackground({ ...slide.background, brightness: parseFloat(e.target.value) } as import('./types').ImageBackground)}
                  className="w-full accent-slate-600"
                />
              </div>
              {/* Zoom */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#1a1a18]/40 uppercase tracking-wider">Масштаб</span>
                  <span className="text-[10px] text-slate-400">{Math.round((slide.background.zoom ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range" min="1" max="3" step="0.05"
                  value={slide.background.zoom ?? 1}
                  onChange={(e) => onUpdateBackground({ ...slide.background, zoom: parseFloat(e.target.value) } as import('./types').ImageBackground)}
                  className="w-full accent-slate-600"
                />
              </div>
              {/* Pan X */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#1a1a18]/40 uppercase tracking-wider">← Позиция X →</span>
                  <span className="text-[10px] text-slate-400">{slide.background.panX ?? 50}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={slide.background.panX ?? 50}
                  onChange={(e) => onUpdateBackground({ ...slide.background, panX: parseInt(e.target.value) } as import('./types').ImageBackground)}
                  className="w-full accent-slate-600"
                />
              </div>
              {/* Pan Y */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#1a1a18]/40 uppercase tracking-wider">↑ Позиция Y ↓</span>
                  <span className="text-[10px] text-slate-400">{slide.background.panY ?? 50}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={slide.background.panY ?? 50}
                  onChange={(e) => onUpdateBackground({ ...slide.background, panY: parseInt(e.target.value) } as import('./types').ImageBackground)}
                  className="w-full accent-slate-600"
                />
              </div>
            </div>
          )}

          {/* Референс + перегенерация */}
          {aiOriginalImage ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Референс (исходное фото)</p>
              <div className="flex items-center gap-3">
                <img
                  src={`data:${aiOriginalImage.mimeType};base64,${aiOriginalImage.base64}`}
                  alt="референс"
                  className="w-12 h-16 object-cover rounded-lg flex-shrink-0"
                  style={{ border: '1.5px solid rgba(0,0,0,0.08)' }}
                />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <button
                    onClick={onRegenBg}
                    disabled={regenBgLoading}
                    className="flex items-center gap-1.5 text-[12px] text-violet-500 hover:text-violet-700 transition-colors touch-manipulation disabled:opacity-50"
                  >
                    {regenBgLoading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <RefreshCw size={12} />}
                    {regenBgLoading ? 'Генерирую фон...' : 'Перегенерировать фон'}
                  </button>
                  {onReplaceRef && (
                    <button
                      onClick={onReplaceRef}
                      className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 transition-colors touch-manipulation"
                    >
                      <ImageIcon size={12} />
                      Заменить фото
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={onBgImage}
                className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 transition-colors touch-manipulation"
              >
                <ImageIcon size={12} />
                Загрузить фоновое фото
              </button>
            </div>
          )}
        </div>
      )}

      {/* Layer controls — shown whenever an element is selected */}
      {selectedEl && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Слой</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateElement(selectedEl.id, { zIndex: Math.max(0, (selectedEl.zIndex ?? 1) - 1) } as Partial<SlideElement>)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all touch-manipulation"
            >
              ↓ Назад
            </button>
            <span className="text-[11px] text-slate-400">z: {selectedEl.zIndex ?? 1}</span>
            <button
              onClick={() => onUpdateElement(selectedEl.id, { zIndex: (selectedEl.zIndex ?? 1) + 1 } as Partial<SlideElement>)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all touch-manipulation"
            >
              ↑ Вперёд
            </button>
          </div>
        </div>
      )}

      {/* Text properties */}
      {showText && selectedEl?.type === 'text' && (
        <TextPropsPanel el={selectedEl} onUpdate={(u) => onUpdateElement(selectedEl.id, u)} />
      )}

      {/* Image properties */}
      {showImage && selectedEl?.type === 'image' && (
        <ImagePropsPanel el={selectedEl} onUpdate={(u) => onUpdateElement(selectedEl.id, u)} />
      )}

      {/* Shape properties */}
      {showShape && selectedEl?.type === 'shape' && (
        <ShapePropsPanel el={selectedEl as ShapeElement} onUpdate={(u) => onUpdateElement(selectedEl.id, u)} />
      )}
    </div>
  );
}

// ─── Text props ──────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Russo One', value: "'Russo One', sans-serif" },
  { label: 'Oswald', value: "'Oswald', sans-serif" },
  { label: 'Unbounded', value: "'Unbounded', sans-serif" },
  { label: 'Jost', value: "'Jost', sans-serif" },
  { label: 'Comfortaa', value: "'Comfortaa', sans-serif" },
  { label: 'Forum', value: "'Forum', serif" },
  { label: 'Playfair', value: "'Playfair Display', serif" },
  { label: 'Exo 2', value: "'Exo 2', sans-serif" },
  { label: 'Nunito', value: "'Nunito', sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
];

// ─── Font-specific spacing memory ────────────────────────────

const FONT_SPACING_KEY = 'carousel_font_spacing';

function getFontSpacing(fontFamily: string): { lineHeight?: number; letterSpacing?: number } {
  try {
    const all = JSON.parse(localStorage.getItem(FONT_SPACING_KEY) || '{}');
    return all[fontFamily] || {};
  } catch { return {}; }
}

function saveFontSpacing(fontFamily: string, lineHeight: number, letterSpacing: number) {
  try {
    const all = JSON.parse(localStorage.getItem(FONT_SPACING_KEY) || '{}');
    all[fontFamily] = { lineHeight, letterSpacing };
    localStorage.setItem(FONT_SPACING_KEY, JSON.stringify(all));
  } catch {}
}

function TextPropsPanel({ el, onUpdate }: { el: TextElement; onUpdate: (u: Partial<TextElement>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Текст</p>

      {/* Font family — scrollable pills */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Шрифт</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                const spacing = getFontSpacing(f.value);
                onUpdate({
                  fontFamily: f.value,
                  ...(spacing.lineHeight !== undefined ? { lineHeight: spacing.lineHeight } : {}),
                  ...(spacing.letterSpacing !== undefined ? { letterSpacing: spacing.letterSpacing } : {}),
                });
              }}
              className={cn(
                'flex-shrink-0 px-2.5 py-1.5 text-[12px] rounded-xl transition-all touch-manipulation',
                (el.fontFamily ?? 'Inter, sans-serif') === f.value ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
              style={{ fontFamily: f.value }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font size — slider + number */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Размер</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={8} max={300}
              value={el.fontSize}
              onChange={(e) => onUpdate({ fontSize: Math.max(8, Math.min(300, Number(e.target.value))) })}
              className="w-12 text-[11px] text-center rounded-lg border border-slate-200 py-0.5 outline-none"
            />
            <span className="text-[10px] text-slate-400">px</span>
          </div>
        </div>
        <input
          type="range" min={8} max={300} step={1} value={el.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
          className="w-full h-1 accent-slate-600"
        />
      </div>

      {/* Style + text align */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onUpdate({ fontWeight: el.fontWeight === 700 ? 400 : 700 })}
          className={cn('p-2 rounded-xl transition-all touch-manipulation', el.fontWeight === 700 ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500')}
        ><Bold size={14} /></button>
        <button
          onClick={() => onUpdate({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={cn('p-2 rounded-xl transition-all touch-manipulation', el.fontStyle === 'italic' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500')}
        ><Italic size={14} /></button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
          return (
            <button key={align} onClick={() => onUpdate({ textAlign: align })}
              className={cn('p-2 rounded-xl transition-all touch-manipulation', el.textAlign === align ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500')}
            ><Icon size={14} /></button>
          );
        })}
      </div>

      {/* Align to slide */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Выравнивание на слайде</p>
        <div className="flex gap-1">
          {([
            { label: '|←', title: 'По левому краю', x: 0 },
            { label: '↔', title: 'По центру', x: (100 - el.width) / 2 },
            { label: '→|', title: 'По правому краю', x: 100 - el.width },
          ] as const).map(({ label, title, x }) => (
            <button key={title} title={title}
              onClick={() => onUpdate({ position: { ...el.position, x: Math.max(0, x) } })}
              className="flex-1 py-1.5 text-[11px] rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all touch-manipulation"
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Цвет текста</p>
        <div className="flex gap-1.5 flex-wrap items-center">
          {['#1a1a18', '#ffffff', '#e11d48', '#2563eb', '#059669', '#d97706'].map((c) => (
            <button key={c} onClick={() => onUpdate({ color: c })}
              className={cn('w-6 h-6 rounded-lg border-2 transition-all touch-manipulation', el.color === c ? 'border-slate-500 scale-110' : 'border-slate-100')}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="w-6 h-6 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer flex items-center justify-center">
            <span className="text-[9px] text-slate-400">+</span>
            <input type="color" className="sr-only" value={el.color} onChange={(e) => onUpdate({ color: e.target.value })} />
          </label>
        </div>
      </div>

      {/* Width */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Ширина блока: {el.width}%</p>
        <input type="range" min={20} max={95} value={el.width}
          onChange={(e) => onUpdate({ width: Number(e.target.value) })}
          className="w-full h-1 accent-slate-600"
        />
      </div>

      {/* Line height — with font memory */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Межстрочный: {(el.lineHeight ?? 1.3).toFixed(2)}</p>
        <input type="range" min={0.8} max={2.5} step={0.05} value={el.lineHeight ?? 1.3}
          onChange={(e) => {
            const v = Number(e.target.value);
            onUpdate({ lineHeight: v });
            saveFontSpacing(el.fontFamily ?? 'Inter, sans-serif', v, el.letterSpacing ?? 0);
          }}
          className="w-full h-1 accent-slate-600"
        />
      </div>

      {/* Letter spacing — with font memory */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Межбуквенный: {(el.letterSpacing ?? 0).toFixed(3)}</p>
        <input type="range" min={-0.05} max={0.3} step={0.005} value={el.letterSpacing ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onUpdate({ letterSpacing: v });
            saveFontSpacing(el.fontFamily ?? 'Inter, sans-serif', el.lineHeight ?? 1.3, v);
          }}
          className="w-full h-1 accent-slate-600"
        />
      </div>

      {/* Оригинальный текст (если был перевод) */}
      {el.originalText && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Оригинал</p>
          <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: '#f8f8f6', border: '1px solid rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#1a1a18]/30 uppercase tracking-wider">EN</span>
              <p className="text-[12px] text-[#1a1a18]/55 leading-relaxed">{el.originalText}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#1a1a18]/30 uppercase tracking-wider">RU</span>
              <p className="text-[12px] text-[#1a1a18]/55 leading-relaxed">{el.text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image props ─────────────────────────────────────────────

function ImagePropsPanel({ el, onUpdate }: { el: ImageElement; onUpdate: (u: Partial<ImageElement>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Фото</p>

      {/* Border radius */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Скругление углов: {el.borderRadius}px</p>
        <input
          type="range" min={0} max={60} value={el.borderRadius}
          onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
          className="w-full h-1 accent-slate-600"
        />
      </div>

      {/* Shadow */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Тень</p>
        <div className="flex gap-1">
          {(['none', 'sm', 'md', 'lg'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ shadow: s })}
              className={cn(
                'px-2.5 py-1.5 text-[11px] rounded-xl transition-all touch-manipulation',
                el.shadow === s ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {s === 'none' ? 'Нет' : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Fit */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Обрезка</p>
        <div className="flex gap-1">
          {(['cover', 'contain'] as const).map((fit) => (
            <button
              key={fit}
              onClick={() => onUpdate({ objectFit: fit })}
              className={cn(
                'px-2.5 py-1.5 text-[11px] rounded-xl transition-all touch-manipulation',
                el.objectFit === fit ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {fit === 'cover' ? 'Заполнить' : 'Вписать'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shape props ─────────────────────────────────────────────

function ShapePropsPanel({ el, onUpdate }: { el: ShapeElement; onUpdate: (u: Partial<ShapeElement>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Фигура</p>

      {/* Shape type */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Тип</p>
        <div className="flex gap-1.5">
          {([
            { v: 'rect', icon: <Square size={14} />, label: 'Прямоугольник' },
            { v: 'circle', icon: <CircleIcon size={14} />, label: 'Круг' },
            { v: 'line', icon: <Minus size={14} />, label: 'Линия' },
          ] as const).map(({ v, icon, label }) => (
            <button
              key={v}
              title={label}
              onClick={() => onUpdate({ shapeType: v })}
              className={cn(
                'p-2 rounded-xl transition-all touch-manipulation',
                el.shapeType === v ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Fill color */}
      {el.shapeType !== 'line' && (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">Заливка</p>
          <div className="flex gap-1.5 flex-wrap items-center">
            {['transparent', '#ffffff', '#1a1a18', '#e11d48', '#2563eb', '#059669'].map((c) => (
              <button
                key={c}
                onClick={() => onUpdate({ fill: c })}
                className={cn(
                  'w-6 h-6 rounded-lg border-2 transition-all touch-manipulation',
                  el.fill === c ? 'border-slate-500 scale-110' : 'border-slate-200',
                  c === 'transparent' && 'bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//8/AxQzgAAiABkAAAIABQAB")]',
                )}
                style={c !== 'transparent' ? { backgroundColor: c } : {}}
              />
            ))}
            <label className="w-6 h-6 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer flex items-center justify-center">
              <span className="text-[9px] text-slate-400">+</span>
              <input type="color" className="sr-only" value={el.fill.startsWith('#') ? el.fill : '#ffffff'} onChange={(e) => onUpdate({ fill: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      {/* Stroke color */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Обводка</p>
        <div className="flex gap-1.5 flex-wrap items-center">
          {['transparent', '#ffffff', '#1a1a18', '#e11d48', '#2563eb', '#059669'].map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ stroke: c })}
              className={cn(
                'w-6 h-6 rounded-lg border-2 transition-all touch-manipulation',
                el.stroke === c ? 'border-slate-500 scale-110' : 'border-slate-200',
              )}
              style={c !== 'transparent' ? { backgroundColor: c } : { background: 'repeating-linear-gradient(45deg,#ccc,#ccc 2px,#fff 2px,#fff 4px)' }}
            />
          ))}
          <label className="w-6 h-6 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer flex items-center justify-center">
            <span className="text-[9px] text-slate-400">+</span>
            <input type="color" className="sr-only" value={el.stroke.startsWith('#') ? el.stroke : '#000000'} onChange={(e) => onUpdate({ stroke: e.target.value })} />
          </label>
        </div>
      </div>

      {/* Stroke width */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Толщина: {el.strokeWidth}px</p>
        <input type="range" min={0} max={16} value={el.strokeWidth} onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) })} className="w-full h-1 accent-slate-600" />
      </div>

      {/* Border radius (rect only) */}
      {el.shapeType === 'rect' && (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">Скругление: {el.borderRadius}px</p>
          <input type="range" min={0} max={80} value={el.borderRadius} onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })} className="w-full h-1 accent-slate-600" />
        </div>
      )}

      {/* Opacity */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Прозрачность: {Math.round(el.opacity * 100)}%</p>
        <input type="range" min={0} max={100} value={Math.round(el.opacity * 100)} onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })} className="w-full h-1 accent-slate-600" />
      </div>
    </div>
  );
}

// ─── Template editor (шаблоны) ───────────────────────────────

function TemplateEditor({ onBack }: { onBack: () => void }) {
  const [template, setTemplate] = useState<CarouselTemplate | null>(null);
  const [slidesData, setSlidesData] = useState<SlideData[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [exporting, setExporting] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);

  const handleSelectTemplate = useCallback((t: CarouselTemplate) => {
    setTemplate(t);
    setSlidesData(createEmptySlidesData(t));
    setCurrentSlide(0);
  }, []);

  const updateField = useCallback((slideIdx: number, fieldId: string, value: string) => {
    setSlidesData((prev) => {
      const next = [...prev];
      next[slideIdx] = { ...next[slideIdx], [fieldId]: value };
      return next;
    });
  }, []);

  const addSlide = useCallback(() => {
    if (!template || slidesData.length >= template.maxSlides) return;
    const standardSlide = template.slides[1] || template.slides[0];
    setSlidesData((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, createEmptySlideData(standardSlide));
      return next;
    });
    setCurrentSlide(slidesData.length - 1);
  }, [template, slidesData.length]);

  const removeSlide = useCallback((idx: number) => {
    if (slidesData.length <= 2) return;
    setSlidesData((prev) => prev.filter((_, i) => i !== idx));
    setCurrentSlide((prev) => Math.min(prev, slidesData.length - 2));
  }, [slidesData.length]);

  const exportSlides = useCallback(async () => {
    if (!slideRef.current || !template) return;
    setExporting(true);
    try {
      for (let i = 0; i < slidesData.length; i++) {
        setCurrentSlide(i);
        await new Promise((r) => setTimeout(r, 100));
        const dataUrl = await toPng(slideRef.current, {
          width: 1080, height: 1080, pixelRatio: 2,
          style: { width: '1080px', height: '1080px', maxWidth: '1080px' },
        });
        const link = document.createElement('a');
        link.download = `slide-${i + 1}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }, [slidesData, template]);

  // Template picker screen
  if (!template) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors touch-manipulation"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="max-w-2xl mx-auto">
            <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider mb-4">Выбери стиль</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CAROUSEL_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={cn(
                    'relative aspect-square rounded-2xl overflow-hidden border-2 border-transparent transition-all active:scale-[0.97] touch-manipulation',
                    'hover:border-slate-300',
                    t.bgClass,
                  )}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4">
                    <span className="text-2xl">{t.previewEmoji}</span>
                    <span className={cn('text-[13px] font-semibold', t.textColorClass)}>{t.name}</span>
                    <span className={cn('text-[11px] opacity-50', t.textColorClass)}>{t.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const slideTemplate = currentSlide < template.slides.length
    ? template.slides[currentSlide]
    : template.slides[1] || template.slides[0];
  const slideData = slidesData[currentSlide] || {};

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => setTemplate(null)}
          className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors"
        >
          <ArrowLeft size={16} />
          Шаблоны
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#1a1a18]/35">{template.previewEmoji} {template.name}</span>
          <button
            onClick={exportSlides}
            disabled={exporting}
            className={cn(
              'flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-medium text-white transition-all active:scale-95',
              exporting ? 'bg-slate-400' : 'bg-slate-600 hover:bg-slate-700',
            )}
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
          >
            <Download size={14} />
            {exporting ? 'Экспорт...' : 'PNG'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Preview */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-full max-w-sm overflow-hidden" style={{ borderRadius: 20, boxShadow: '0 4px 32px rgba(0,0,0,0.12)' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.15 }}
                >
                  <SlidePreview
                    ref={slideRef}
                    template={template}
                    slideTemplate={slideTemplate}
                    slideData={slideData}
                    slideIndex={currentSlide}
                    totalSlides={slidesData.length}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Nav */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentSlide((p) => Math.max(0, p - 1))}
                disabled={currentSlide === 0}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 touch-manipulation"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex gap-1.5">
                {slidesData.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      i === currentSlide ? 'w-5 bg-slate-600' : 'w-1.5 bg-slate-200',
                    )}
                  />
                ))}
              </div>
              <button
                onClick={() => setCurrentSlide((p) => Math.min(slidesData.length - 1, p + 1))}
                disabled={currentSlide === slidesData.length - 1}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 touch-manipulation"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="flex gap-2">
              {currentSlide > 0 && currentSlide < slidesData.length - 1 && (
                <button
                  onClick={() => removeSlide(currentSlide)}
                  className="flex items-center gap-1 text-[12px] text-red-400 hover:text-red-600 touch-manipulation"
                >
                  <Trash2 size={12} /> Удалить
                </button>
              )}
              {slidesData.length < template.maxSlides && (
                <button
                  onClick={addSlide}
                  className="flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700 touch-manipulation"
                >
                  <Plus size={12} /> Слайд
                </button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider mb-1">
                Слайд {currentSlide + 1} из {slidesData.length}
                {currentSlide === 0 ? ' — Обложка' : currentSlide === slidesData.length - 1 ? ' — Финал' : ''}
              </p>
            </div>

            {slideTemplate.fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-[#1a1a18]/40 uppercase tracking-wider">
                  {field.label}
                </label>
                {field.type === 'body' ? (
                  <textarea
                    value={slideData[field.id] || ''}
                    onChange={(e) => updateField(currentSlide, field.id, e.target.value)}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    rows={4}
                    className="rounded-2xl px-4 py-3 text-[14px] text-[#1a1a18] placeholder:text-[#1a1a18]/30 focus:outline-none resize-none transition-all"
                    style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  />
                ) : (
                  <input
                    type="text"
                    value={slideData[field.id] || ''}
                    onChange={(e) => updateField(currentSlide, field.id, e.target.value)}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    className="rounded-2xl px-4 py-3 text-[14px] text-[#1a1a18] placeholder:text-[#1a1a18]/30 focus:outline-none transition-all"
                    style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  />
                )}
                {field.maxLength && (
                  <span className="text-right text-[10px] text-[#1a1a18]/25">
                    {(slideData[field.id] || '').length}/{field.maxLength}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────

export function CarouselEditor({ projectId, userId }: { projectId?: string | null; userId?: string | null }) {
  const [mode, setMode] = useState<EditorMode>('home');
  const [aiGeneratedSlides, setAiGeneratedSlides] = useState<Slide[] | null>(null);
  const [aiOriginalImage, setAiOriginalImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<CarouselDraft | null>(null);

  // Supabase carousels (when in a project)
  const { carousels: drafts, loading: remoteLoading, save: saveDraft, remove: deleteDraft } = useProjectCarousels(projectId ?? null, userId ?? null);

  const handleAiDone = useCallback((slides: Slide[], img: { base64: string; mimeType: string }) => {
    setAiGeneratedSlides(slides);
    setAiOriginalImage(img);
    setMode('create');
  }, []);

  const handleLoadDraft = useCallback((draft: CarouselDraft) => {
    setLoadedDraft(draft);
    setAiGeneratedSlides(null);
    setAiOriginalImage(null);
    setMode('create');
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base relative">
      {/* Header (only on home) */}
      {mode === 'home' && (
        <div className="px-4 pt-5 pb-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-[30px] h-[30px] rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%)' }}
              >
                <span className="text-sm">🎨</span>
              </div>
              <h1 className="text-[17px] font-semibold text-[#1a1a18] tracking-tight">ИИ-Карусели</h1>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {mode === 'home' && <HomeScreen onMode={setMode} onLoadDraft={handleLoadDraft} drafts={drafts} onDeleteDraft={deleteDraft} draftsLoading={projectId ? remoteLoading : false} />}
          {mode === 'create' && (
            <FreeEditor
              onBack={() => { setAiGeneratedSlides(null); setAiOriginalImage(null); setLoadedDraft(null); setMode('home'); }}
              initialSlides={loadedDraft?.slides ?? aiGeneratedSlides ?? undefined}
              initialDraftId={loadedDraft?.id}
              aiOriginalImage={aiOriginalImage ?? undefined}
              onUpdateOriginalImage={(img) => setAiOriginalImage(img)}
              onSaveDraft={saveDraft}
            />
          )}
          {mode === 'template' && <TemplateEditor onBack={() => setMode('home')} />}
          {mode === 'ai-photo' && (
            <AiPhotoScreen
              onBack={() => setMode('home')}
              onDone={handleAiDone}
            />
          )}
          {mode === 'ai-url' && (
            <AiUrlScreen
              onBack={() => setMode('home')}
              onDone={(slides) => { setAiGeneratedSlides(slides); setAiOriginalImage(null); setMode('create'); }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
