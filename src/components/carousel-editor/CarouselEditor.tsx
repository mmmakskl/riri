import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Plus, Trash2,
  ArrowLeft, PenLine, LayoutTemplate, Type, Image as ImageIcon,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Loader2, Camera, Sparkles, Box,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { SlideCanvas } from './SlideCanvas';
import { SlidePreview } from './SlidePreview';
import type { Slide, SlideElement, SlideBackground, TextElement, ImageElement } from './types';
import {
  createDefaultSlide, createDefaultTextElement, createDefaultImageElement,
  createDefaultShapeElement, createDefaultPlaceholderElement,
} from './types';
import {
  CAROUSEL_TEMPLATES, createEmptySlidesData, createEmptySlideData,
  type CarouselTemplate, type SlideData,
} from './templates';

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

type EditorMode = 'home' | 'create' | 'template' | 'ai-photo';

// ─── Home screen ─────────────────────────────────────────────

function HomeScreen({ onMode }: { onMode: (m: EditorMode) => void }) {
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
                { n: '3', text: 'Скачивай готовые PNG 1080×1440' },
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

function AiPhotoScreen({ onBack, onDone }: { onBack: () => void; onDone: (slides: Slide[]) => void }) {
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

        const { background, elements = [] } = data as {
          background: { type: string; color?: string; from?: string; to?: string; direction?: string };
          elements: Array<{
            type: string; text?: string; x: number; y: number;
            fontSize?: number; fontWeight?: number; color?: string;
            textAlign?: string; width?: number; fontFamily?: string;
            label?: string; borderRadius?: number; height?: number;
          }>;
        };

        // Маппинг fontFamily от AI к реальным CSS-шрифтам
        const FONT_MAP: Record<string, string> = {
          'serif':        "'Playfair Display', serif",
          'italic-serif': "'Playfair Display', serif",
          'sans-serif':   'Inter, sans-serif',
          'display':      "'Bebas Neue', cursive",
          'monospace':    'monospace',
        };

        // Фон: если AI вернул type='image' — используем загруженный скриншот как фон
        let resolvedBg: import('./types').SlideBackground;
        if (!background || background.type === 'image') {
          resolvedBg = { type: 'image', src: `data:${mimeType};base64,${base64}` };
        } else if (background.type === 'gradient' && background.from && background.to) {
          resolvedBg = { type: 'gradient', from: background.from, to: background.to, direction: background.direction ?? 'to bottom' };
        } else {
          resolvedBg = { type: 'solid', color: background.color ?? '#f5f5f4' };
        }

        const newSlide = createDefaultSlide();
        newSlide.background = resolvedBg;
        newSlide.elements = elements.flatMap((el): SlideElement[] => {
          if (el.type === 'text') {
            return [createDefaultTextElement({
              text: el.text ?? 'Текст',
              position: { x: Math.max(0, Math.min(90, el.x ?? 8)), y: Math.max(0, Math.min(90, el.y ?? 8)) },
              fontSize: Math.max(24, Math.min(160, el.fontSize ?? 48)),
              fontWeight: el.fontWeight === 400 ? 400 : 700,
              color: el.color ?? '#1a1a18',
              textAlign: (['left', 'center', 'right'].includes(el.textAlign ?? '') ? el.textAlign : 'left') as 'left' | 'center' | 'right',
              width: Math.max(20, Math.min(92, el.width ?? 80)),
              fontFamily: FONT_MAP[el.fontFamily ?? ''] ?? 'Inter, sans-serif',
            })];
          }
          if (el.type === 'placeholder') {
            return [createDefaultPlaceholderElement({
              position: { x: Math.max(0, Math.min(90, el.x ?? 10)), y: Math.max(0, Math.min(90, el.y ?? 30)) },
              size: { width: Math.max(2, Math.min(90, el.width ?? 80)), height: Math.max(0.5, Math.min(90, el.height ?? 45)) },
              label: el.label ?? 'Фото',
              borderRadius: el.borderRadius ?? 16,
            })];
          }
          return [];
        });

        onDone([newSlide]);
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

function FreeEditor({ onBack, initialSlides }: { onBack: () => void; initialSlides?: Slide[] }) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides ?? [createDefaultSlide()]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activePanel, setActivePanel] = useState<'add' | 'bg' | 'text' | 'image' | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const replacePlaceholderInputRef = useRef<HTMLInputElement>(null);
  const pendingPlaceholderIdRef = useRef<string | null>(null);

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
  }, [slide.elements]);

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

  const handleAddShape = useCallback(() => {
    const el = createDefaultShapeElement();
    onAddElement(el);
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
          width: 1080, height: 1440, pixelRatio: 2,
          style: { width: '1080px', height: '1440px', maxWidth: '1080px' },
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
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[14px] text-[#1a1a18]/50 hover:text-[#1a1a18] transition-colors touch-manipulation"
        >
          <ArrowLeft size={16} />
          Назад
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#1a1a18]/35">
            {currentIdx + 1} / {slides.length}
          </span>
          <button
            onClick={exportSlides}
            disabled={exporting}
            className={cn(
              'flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-medium text-white transition-all active:scale-95 touch-manipulation',
              exporting ? 'bg-slate-400 cursor-wait' : 'bg-slate-600 hover:bg-slate-700',
            )}
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
          >
            <Download size={14} />
            {exporting ? 'Экспорт...' : 'Скачать PNG'}
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

        {/* Canvas area */}
        <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto py-4 px-4 gap-4">

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
          <div className="w-full max-w-sm relative">
            <div
              className="w-full overflow-hidden"
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
              />
            </div>

            {/* Empty state hint */}
            {!hasElements && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="px-4 py-2.5 rounded-2xl text-center"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
                >
                  <p className="text-[13px] text-white/80">Нажми кнопки ниже</p>
                  <p className="text-[11px] text-white/50">чтобы добавить текст или фото</p>
                </div>
              </div>
            )}
          </div>

          {/* Hint: drag handle */}
          {selectedEl?.type === 'text' && editingTextId !== selectedId && (
            <p className="text-[12px] text-[#1a1a18]/40 text-center">
              Нажми «Двигай» чтобы переместить
            </p>
          )}
        </div>

        {/* Properties panel (right, desktop) */}
        <div className="hidden lg:flex w-[260px] flex-col border-l border-black/[0.06] overflow-y-auto">
          <PropertiesPanel
            slide={slide}
            selectedEl={selectedEl}
            onUpdateBackground={onUpdateBackground}
            onUpdateElement={onUpdateElement}
            onDeleteElement={onDeleteElement}
            onAddText={handleAddText}
            onAddImage={() => imageInputRef.current?.click()}
            onBgImage={() => bgImageInputRef.current?.click()}
            onAddShape={handleAddShape}
          />
        </div>
      </div>

      {/* Mobile bottom toolbar */}
      <div
        className="lg:hidden px-4 py-3 flex items-center gap-2 overflow-x-auto"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#fafafa' }}
      >
        <ToolbarBtn icon={<Type size={16} />} label="Текст" onClick={handleAddText} />
        <ToolbarBtn icon={<ImageIcon size={16} />} label="Фото" onClick={() => imageInputRef.current?.click()} />
        <ToolbarBtn
          icon={<div className="w-4 h-4 rounded-full border border-slate-300"
            style={slide.background.type === 'solid' ? { backgroundColor: slide.background.color } :
              slide.background.type === 'gradient' ? { background: `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})` } :
              { background: '#888' }
            }
          />}
          label="Фон"
          onClick={() => setActivePanel((p) => p === 'bg' ? null : 'bg')}
          active={activePanel === 'bg'}
        />
        <ToolbarBtn icon={<Box size={16} />} label="Фигура" onClick={handleAddShape} />
        {selectedEl?.type === 'text' && (
          <ToolbarBtn icon={<Bold size={16} />} label="Стиль" onClick={() => setActivePanel((p) => p === 'text' ? null : 'text')} active={activePanel === 'text'} />
        )}
        {selectedEl?.type === 'image' && (
          <ToolbarBtn icon={<ImageIcon size={16} />} label="Фото" onClick={() => setActivePanel((p) => p === 'image' ? null : 'image')} active={activePanel === 'image'} />
        )}
        {selectedEl && (
          <ToolbarBtn icon={<Trash2 size={16} />} label="Удалить" onClick={() => onDeleteElement(selectedEl.id)} danger />
        )}
      </div>

      {/* Mobile bottom sheet for bg/text/image */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="lg:hidden absolute bottom-0 left-0 right-0 z-30 rounded-t-[24px] overflow-hidden"
            style={{ background: '#fff', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)', maxHeight: '50vh', overflowY: 'auto' }}
          >
            <div className="px-4 py-4">
              <PropertiesPanel
                slide={slide}
                selectedEl={selectedEl}
                onUpdateBackground={onUpdateBackground}
                onUpdateElement={onUpdateElement}
                onDeleteElement={onDeleteElement}
                onAddText={handleAddText}
                onAddImage={() => imageInputRef.current?.click()}
                onBgImage={() => bgImageInputRef.current?.click()}
                onAddShape={handleAddShape}
                mobilePanel={activePanel}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
      <input ref={bgImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImage} />
      <input ref={replacePlaceholderInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplacePlaceholderFile} />
    </div>
  );
}

// ─── Toolbar button ──────────────────────────────────────────

function ToolbarBtn({
  icon, label, onClick, active, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 flex-shrink-0 px-3 py-2 rounded-2xl transition-all touch-manipulation min-w-[56px]',
        active ? 'bg-slate-100' : 'hover:bg-slate-50',
        danger && 'text-red-500',
      )}
    >
      <span className={cn(danger ? 'text-red-500' : 'text-slate-600')}>{icon}</span>
      <span className={cn('text-[10px] font-medium', danger ? 'text-red-400' : 'text-slate-500')}>{label}</span>
    </button>
  );
}

// ─── Properties panel ────────────────────────────────────────

interface PropertiesPanelProps {
  slide: Slide;
  selectedEl: SlideElement | null;
  onUpdateBackground: (bg: SlideBackground) => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
  onAddText: () => void;
  onAddImage: () => void;
  onBgImage: () => void;
  onAddShape: () => void;
  mobilePanel?: 'add' | 'bg' | 'text' | 'image' | null;
}

function PropertiesPanel({
  slide, selectedEl, onUpdateBackground, onUpdateElement,
  onDeleteElement, onAddText, onAddImage, onBgImage, onAddShape, mobilePanel,
}: PropertiesPanelProps) {

  // On desktop: show everything relevant
  // On mobile: show only the active panel
  const showAdd = !mobilePanel || mobilePanel === 'add';
  const showBg = !mobilePanel || mobilePanel === 'bg';
  const showText = !mobilePanel || mobilePanel === 'text';
  const showImage = !mobilePanel || mobilePanel === 'image';

  return (
    <div className="p-4 space-y-5">
      {/* Add elements */}
      {showAdd && !mobilePanel && (
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
            onClick={onAddShape}
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

          {/* Upload bg image */}
          <button
            onClick={onBgImage}
            className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 transition-colors touch-manipulation"
          >
            <ImageIcon size={12} />
            Загрузить фоновое фото
          </button>
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

      {/* Delete selected */}
      {selectedEl && !mobilePanel && (
        <button
          onClick={() => onDeleteElement(selectedEl.id)}
          className="flex items-center gap-1.5 text-[12px] text-red-400 hover:text-red-600 transition-colors touch-manipulation"
        >
          <Trash2 size={13} />
          Удалить элемент
        </button>
      )}
    </div>
  );
}

// ─── Text props ──────────────────────────────────────────────

const FONT_SIZES = [24, 36, 48, 64, 80];

const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Playfair', value: "'Playfair Display', serif" },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Bebas', value: "'Bebas Neue', cursive" },
  { label: 'Raleway', value: 'Raleway, sans-serif' },
];

function TextPropsPanel({ el, onUpdate }: { el: TextElement; onUpdate: (u: Partial<TextElement>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-[#1a1a18]/35 uppercase tracking-wider">Текст</p>

      {/* Font family */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Шрифт</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              onClick={() => onUpdate({ fontFamily: f.value })}
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

      {/* Font size */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Размер</p>
        <div className="flex gap-1 flex-wrap">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onUpdate({ fontSize: size })}
              className={cn(
                'px-2 py-1 text-[11px] rounded-xl transition-all touch-manipulation',
                el.fontSize === size ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onUpdate({ fontWeight: el.fontWeight === 700 ? 400 : 700 })}
          className={cn(
            'p-2 rounded-xl transition-all touch-manipulation',
            el.fontWeight === 700 ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Bold size={14} />
        </button>
        <button
          onClick={() => onUpdate({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={cn(
            'p-2 rounded-xl transition-all touch-manipulation',
            el.fontStyle === 'italic' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Italic size={14} />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
          return (
            <button
              key={align}
              onClick={() => onUpdate({ textAlign: align })}
              className={cn(
                'p-2 rounded-xl transition-all touch-manipulation',
                el.textAlign === align ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      {/* Color */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Цвет текста</p>
        <div className="flex gap-1.5 flex-wrap items-center">
          {['#1a1a18', '#ffffff', '#e11d48', '#2563eb', '#059669', '#d97706'].map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ color: c })}
              className={cn(
                'w-6 h-6 rounded-lg border-2 transition-all touch-manipulation',
                el.color === c ? 'border-slate-500 scale-110' : 'border-slate-100',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="w-6 h-6 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer flex items-center justify-center">
            <span className="text-[9px] text-slate-400">+</span>
            <input
              type="color"
              className="sr-only"
              value={el.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Width */}
      <div className="space-y-1">
        <p className="text-[11px] text-slate-400">Ширина блока</p>
        <input
          type="range" min={20} max={95} value={el.width}
          onChange={(e) => onUpdate({ width: Number(e.target.value) })}
          className="w-full h-1 accent-slate-600"
        />
      </div>
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

export function CarouselEditor() {
  const [mode, setMode] = useState<EditorMode>('home');
  const [aiGeneratedSlides, setAiGeneratedSlides] = useState<Slide[] | null>(null);

  const handleAiDone = useCallback((slides: Slide[]) => {
    setAiGeneratedSlides(slides);
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
          {mode === 'home' && <HomeScreen onMode={setMode} />}
          {mode === 'create' && (
            <FreeEditor
              onBack={() => { setAiGeneratedSlides(null); setMode('home'); }}
              initialSlides={aiGeneratedSlides ?? undefined}
            />
          )}
          {mode === 'template' && <TemplateEditor onBack={() => setMode('home')} />}
          {mode === 'ai-photo' && (
            <AiPhotoScreen
              onBack={() => setMode('home')}
              onDone={handleAiDone}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
