'use client'
import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";
import { proxyImageUrl, PLACEHOLDER_270x360 } from "../../utils/imagePlaceholder";
import { Sparkles, MoreVertical, ArrowRight, Eye, Heart, Loader2, AlertCircle, MessageCircle, TrendingUp, BookOpen, PenLine, Calendar, Mic } from "lucide-react";

export interface VideoGradientCardProps {
  thumbnailUrl?: string;
  username?: string;
  caption?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  date?: string;
  viralCoef?: number;
  viralMultiplier?: number | null; // Множитель залётности (во сколько раз больше среднего автора)
  folderBadge?: { name: string; color: string }; // Бейдж папки
  transcriptStatus?: string | null; // null, downloading, processing, completed, error
  /** Есть ли сценарий у видео */
  hasScript?: boolean;
  onClick?: () => void;
  onAdd?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  showFolderMenu?: boolean;
  onFolderMenuToggle?: () => void;
  folderMenu?: React.ReactNode;
  /** Мини-кнопка «Описание» — открыть полное описание поста */
  onDescriptionClick?: () => void;
  /** При ошибке загрузки превью — обновить через reel-info + Storage. silent=true — без тоста (проактивная подгрузка) */
  onThumbnailError?: (videoId: string, shortcode: string, silent?: boolean) => void | Promise<void>;
  /** При успешной загрузке — сохранить в Storage (если URL не из Storage) */
  onThumbnailLoad?: (videoId: string, shortcode: string, url: string) => void | Promise<void>;
  videoId?: string;
  shortcode?: string;
  className?: string;
  /** Первые карточки в ленте — eager loading */
  priority?: boolean;
  /** Ручное видео без ссылки — показываем превью сценария */
  isManual?: boolean;
  /** Кнопка быстрой транскрибации — появляется при наведении */
  onTranscribeClick?: () => void;
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  // Если число (unix timestamp)
  const asNum = Number(dateStr);
  const d = !isNaN(asNum) && asNum > 0
    ? new Date(asNum > 1e12 ? asNum : asNum * 1000)
    : new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export const VideoGradientCard = ({
  thumbnailUrl,
  username,
  caption,
  viewCount,
  likeCount,
  commentCount,
  date,
  viralCoef = 0,
  viralMultiplier,
  folderBadge,
  transcriptStatus,
  hasScript = false,
  onClick,
  onAdd,
  onDragStart,
  showFolderMenu,
  onFolderMenuToggle,
  folderMenu,
  onDescriptionClick,
  onThumbnailError,
  onThumbnailLoad,
  videoId,
  shortcode,
  className,
  priority = false,
  isManual = false,
  onTranscribeClick,
}: VideoGradientCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isRefreshingThumb, setIsRefreshingThumb] = useState(false);
  useEffect(() => {
    const m = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);

  // Сброс состояния при смене превью
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [thumbnailUrl]);

  // Если в БД сохранился битый wsrv.nl URL — сразу триггерим refresh (без тоста)
  const hasWsrv = thumbnailUrl?.includes('wsrv.nl');
  useEffect(() => {
    if (hasWsrv && onThumbnailError && videoId && shortcode) {
      setIsRefreshingThumb(true);
      Promise.resolve(onThumbnailError(videoId, shortcode, true)).finally(() => setIsRefreshingThumb(false));
    }
  }, [hasWsrv, onThumbnailError, videoId, shortcode]);

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className="group relative"
    >
      {/* Folder menu - вынесен наружу для корректного z-index */}
      {showFolderMenu && folderMenu && (
        <div className="absolute top-10 right-0 z-[100]">
          {folderMenu}
        </div>
      )}
      <motion.div
        ref={cardRef}
        className={cn(
          "relative rounded-card-xl overflow-hidden cursor-pointer",
          "backdrop-blur-sm touch-manipulation",
          "border border-white/55",
          className
        )}
        style={{
          aspectRatio: "9/16",
          boxShadow: isHovered 
            ? "0 24px 64px -8px rgba(0, 0, 0, 0.13), 0 12px 32px -8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.04)"
            : "0 14px 34px -8px rgba(0, 0, 0, 0.10), 0 6px 18px -6px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.52), 0 0 0 1px rgba(0, 0, 0, 0.04)",
        }}
        initial={false}
        animate={{
          y: isMobile ? 0 : isHovered ? -8 : 0,
          scale: isMobile ? 1 : isHovered ? 1.03 : 1,
        }}
        transition={{
          type: "tween",
          duration: isMobile ? 0.15 : 0.35,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => !isMobile && setIsHovered(true)}
        onTouchEnd={() => !isMobile && setTimeout(() => setIsHovered(false), 150)}
        onClick={onClick}
      >
        {/* Превью: для ручных видео — градиент + иконка сценария; для обычных — img */}
        <motion.div
          className="absolute inset-0 z-0 overflow-hidden"
          animate={{ scale: isMobile ? 1 : isHovered ? 1.08 : 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {isManual ? (
            /* Только текст: единый «стеклянный» фон + заголовок, без картинки и без «?» */
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="absolute inset-0"
                style={{
                  background: `
                    radial-gradient(ellipse 120% 80% at 20% 15%, rgba(255,255,255,0.38) 0%, transparent 55%),
                    radial-gradient(ellipse 90% 70% at 85% 75%, rgba(148,163,184,0.45) 0%, transparent 50%),
                    linear-gradient(155deg, #94a3b8 0%, #64748b 38%, #475569 72%, #334155 100%)
                  `,
                }}
              />
              <div
                className="absolute inset-0 opacity-[0.22]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
              />
              <div className="absolute inset-0 border border-white/25 pointer-events-none" />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-8 md:px-5 z-[1]">
                <span
                  className="mb-3 px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-[0.14em] text-white/85 border border-white/25 bg-black/22 backdrop-blur-md"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}
                >
                  Сценарий
                </span>
                <p
                  className="text-center font-bold text-white leading-snug line-clamp-6 max-w-[95%] break-words"
                  style={{
                    fontSize: 'clamp(0.95rem, 3.8vw, 1.2rem)',
                    textShadow: '0 2px 16px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)',
                  }}
                >
                  {caption?.trim() || 'Без названия'}
                </p>
                <div className="mt-4 flex items-center gap-1 text-white/45">
                  <PenLine className="w-3.5 h-3.5" strokeWidth={2} />
                  <span className="text-[10px] font-medium">Без ссылки</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "absolute inset-0",
                  !imgLoaded && !imgError && "animate-pulse"
                )}
                style={{
                  background: !imgLoaded && !imgError
                    ? "linear-gradient(160deg, #94a3b8 0%, #64748b 50%, #475569 100%)"
                    : "#cbd5e1"
                }}
              />
              <img
                src={imgError ? PLACEHOLDER_270x360 : proxyImageUrl(thumbnailUrl)}
                alt=""
                className={cn(
                  "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                  "opacity-100"
                )}
                loading="eager"
                decoding="async"
                fetchPriority={priority ? "high" : "auto"}
                onLoad={(e) => {
                  setImgLoaded(true);
                  const loadedUrl = (e.target as HTMLImageElement).currentSrc || (e.target as HTMLImageElement).src;
                  if (onThumbnailLoad && videoId && shortcode && loadedUrl && !loadedUrl.startsWith('data:') && !loadedUrl.includes('supabase.co')) {
                    onThumbnailLoad(videoId, shortcode, loadedUrl);
                  }
                }}
                onError={() => {
                  setImgError(true);
                  setImgLoaded(true);
                  if (onThumbnailError && videoId && shortcode && !isRefreshingThumb) {
                    setIsRefreshingThumb(true);
                    Promise.resolve(onThumbnailError(videoId, shortcode)).finally(() => setIsRefreshingThumb(false));
                  }
                }}
              />
            </>
          )}
        </motion.div>

        {/* Gradient overlay — ещё светлее, превью видно */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: `linear-gradient(to top, 
              rgba(9, 11, 18, 0.92) 0%, 
              rgba(20, 24, 34, 0.58) 30%, 
              rgba(32, 36, 44, 0.20) 56%, 
              rgba(255,255,255,0.04) 100%
            )`,
          }}
        />
        <div className="absolute inset-x-0 top-0 z-10 h-20 pointer-events-none bg-gradient-to-b from-black/18 via-black/5 to-transparent" />

        {/* Content */}
        <div className="relative flex flex-col justify-end h-full p-3 md:p-4 z-20 text-white min-h-0">
          {/* Top badges */}
          <div className="absolute top-2 md:top-3 left-2 md:left-3 right-2 md:right-3 flex items-center justify-between gap-1">
            {/* Badges container */}
            <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
              {/* Viral badge (скрыт для ручных) */}
              {!isManual && (
              <motion.div
                className={cn(
                  "px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 md:gap-1.5",
                  "border border-white/20",
                  viralCoef > 10 ? "bg-accent-positive text-white" : 
                  viralCoef > 5 ? "bg-amber-500 text-white" :
                  viralCoef > 0 ? "bg-white/90 text-slate-700" :
                  "bg-black/50 text-white/90"
                )}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Sparkles className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                <span className="text-[10px] md:text-xs font-semibold whitespace-nowrap tabular-nums">{viralCoef > 0 ? Math.round(viralCoef) : '-'}</span>
              </motion.div>
              )}
              
              {/* Viral multiplier badge (отдельно рядом, скрыт для ручных) */}
              {!isManual && viralMultiplier !== null && viralMultiplier !== undefined && (
                <motion.div
                  className={cn(
                    "px-1.5 md:px-2 py-0.5 md:py-1 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-0.5 md:gap-1",
                    "border border-white/20",
                    viralMultiplier >= 10 ? "bg-accent-negative text-white" :
                    viralMultiplier >= 5 ? "bg-amber-400/80 text-slate-800" :
                    viralMultiplier >= 3 ? "bg-accent-positive/80 text-white" :
                    viralMultiplier >= 2 ? "bg-accent-positive/70 text-white" :
                    viralMultiplier >= 1.5 ? "bg-accent-positive/60 text-white" :
                    "bg-slate-500/80 text-white"
                  )}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  title={`В ${Math.round(viralMultiplier)}x раз ${viralMultiplier >= 1 ? 'больше' : 'меньше'} среднего у автора`}
                >
                  <TrendingUp className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[9px] md:text-[10px] font-semibold whitespace-nowrap tabular-nums">{Math.round(viralMultiplier)}x</span>
                </motion.div>
              )}
            </div>
            
            {/* Right top controls: description + menu */}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                {/* Мини-кнопка «Транскрибировать» */}
                {onTranscribeClick && !isManual && transcriptStatus !== 'completed' && transcriptStatus !== 'processing' && transcriptStatus !== 'downloading' && (
                  <motion.button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTranscribeClick(); }}
                    title="Транскрибировать"
                    className={cn(
                      "p-2 rounded-full md:backdrop-blur-[20px] border border-white/20 flex items-center justify-center",
                      "bg-black/50 md:bg-black/30 text-white hover:bg-emerald-500/80 transition-colors touch-manipulation",
                      "max-md:hidden"
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Mic className="w-3.5 h-3.5" strokeWidth={2} />
                  </motion.button>
                )}
                {/* Мини-кнопка «Описание» */}
                {onDescriptionClick && (
                  <motion.button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDescriptionClick(); }}
                    title="Описание"
                    className={cn(
                      "p-2 rounded-full md:backdrop-blur-[20px] border border-white/20 flex items-center justify-center",
                      "bg-black/50 md:bg-black/30 text-white hover:bg-white/20 transition-colors touch-manipulation",
                      "max-md:!opacity-100"
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isMobile || isHovered ? 1 : 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <BookOpen className="w-4 h-4" strokeWidth={2} />
                  </motion.button>
                )}
                {/* Menu button */}
                {onFolderMenuToggle && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFolderMenuToggle();
                    }}
                    className={cn(
                      "p-2.5 min-w-[44px] min-h-[44px] rounded-full backdrop-blur-sm transition-all touch-manipulation flex items-center justify-center",
                      "max-md:!opacity-100 max-md:bg-black/40 max-md:text-white",
                      showFolderMenu
                        ? "bg-white text-slate-800"
                        : "bg-black/30 text-white hover:bg-white/20"
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isMobile || isHovered || showFolderMenu ? 1 : 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <MoreVertical className="w-4 h-4 md:w-4 md:h-4" strokeWidth={2.5} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>


          {/* Bottom content */}
          <div>
            {/* Username / badge — для ручных видео показываем «Сценарий» */}
            <motion.div
              className="px-2 py-0.5 md:px-2.5 md:py-1 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 bg-black/36 md:bg-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.18)] mb-2 inline-flex max-w-full"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
            >
              <span className="text-[9px] md:text-[10px] font-semibold text-white/90 truncate max-w-[100px] md:max-w-[120px]">
                {isManual ? '✏️ Сценарий' : `@${username || 'instagram'}`}
              </span>
              {!isManual && viralCoef > 5 && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </motion.div>

            {/* Stats line with icons - iOS 26 style liquid glass buttons (скрываем для ручных) */}
            <div className="flex items-center gap-1.5 md:gap-2 mb-2 flex-wrap">
              {!isManual && viewCount !== undefined && (
                <motion.div
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 bg-black/36 md:bg-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Eye className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[10px] md:text-[11px] font-semibold text-white/90 whitespace-nowrap tabular-nums">{formatNumber(viewCount)}</span>
                </motion.div>
              )}
              {!isManual && likeCount !== undefined && (
                <motion.div
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 bg-black/36 md:bg-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <Heart className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[10px] md:text-[11px] font-semibold text-white/90 whitespace-nowrap tabular-nums">{formatNumber(likeCount)}</span>
                </motion.div>
              )}
              {!isManual && commentCount !== undefined && (
                <motion.div
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 bg-black/36 md:bg-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <MessageCircle className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[10px] md:text-[11px] font-semibold text-white/90 whitespace-nowrap tabular-nums">{formatNumber(commentCount)}</span>
                </motion.div>
              )}
              {!isManual && date && (
                <motion.div
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-pill md:backdrop-blur-[20px] md:backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 bg-black/36 md:bg-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 }}
                >
                  <Calendar className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[10px] md:text-[11px] font-semibold text-white/90 whitespace-nowrap">{formatShortDate(date)}</span>
                </motion.div>
              )}
            </div>

            {/* Нижние бейджи: папка + сценарий — всегда два в ряд */}
            {!isManual && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {/* Транскрипция в процессе (необязательный 3й) */}
                {transcriptStatus && transcriptStatus !== 'completed' && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                      transcriptStatus === 'error' || transcriptStatus === 'timeout'
                        ? "bg-red-500/20 text-red-200 border border-red-500/30"
                        : "bg-slate-500/20 text-slate-200 border border-slate-500/30"
                    )}
                  >
                    {(transcriptStatus === 'downloading' || transcriptStatus === 'processing' || transcriptStatus === 'queued') && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={2.5} />
                    )}
                    {(transcriptStatus === 'error' || transcriptStatus === 'timeout') && (
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2.5} />
                    )}
                    {transcriptStatus === 'downloading' ? 'Скачивание...' :
                     transcriptStatus === 'processing' ? 'Транскрибация...' :
                     transcriptStatus === 'queued' ? 'В очереди...' :
                     transcriptStatus === 'error' ? 'Ошибка' : 'Таймаут'}
                  </span>
                )}

                {/* Папка — всегда */}
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
                  style={folderBadge && folderBadge.color !== '#94a3b8'
                    ? { backgroundColor: folderBadge.color + '30', color: 'white', border: `1px solid ${folderBadge.color}50` }
                    : { backgroundColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.18)' }
                  }
                >
                  {folderBadge?.name || 'Без папки'}
                </span>

                {/* Сценарий — всегда */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                    hasScript
                      ? "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                      : "bg-white/10 text-white/55 border border-white/20"
                  )}
                >
                  <PenLine className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2.5} />
                  {hasScript ? 'Сценарий ✓' : 'Без сценария'}
                </span>
              </div>
            )}

            {/* Action button - для добавления (когда нет folderMenu) */}
            {onAdd && !onFolderMenuToggle && (
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/10 md:backdrop-blur-md border border-white/20 hover:bg-white/20 hover:border-white/30 transition-all min-h-[44px] touch-manipulation"
                whileTap={{ scale: 0.98 }}
              >
                <span className="text-sm font-semibold">Добавить</span>
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default VideoGradientCard;
