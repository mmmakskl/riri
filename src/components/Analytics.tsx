import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '../contexts/ProjectContext';
import { useProjectAnalytics, type ProjectReel, type SyncCount } from '../hooks/useProjectAnalytics';
import { useResponsiblesStats } from '../hooks/useResponsiblesAnalytics';
import { useRefsForLinking, reelsWithoutLinkedRef } from '../hooks/useRefsForLinking';
import { useInboxVideos } from '../hooks/useInboxVideos';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { CoinBadge } from './ui/CoinBadge';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from './ui/area-chart';
import { cn } from '../utils/cn';
import {
  BarChart2, RefreshCw, Instagram, Eye, Heart, MessageCircle,
  Award, Film, X, CalendarDays,
  ArrowUpRight, ArrowDownRight, Minus, Mic, Sparkles,
  LayoutGrid, List, AlertCircle, Clock, ChevronRight, ChevronLeft, Users, Link2, Unlink,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month';
type ChartMode = 'cumulative' | 'release_week';
type SortBy = 'date' | 'views' | 'likes' | 'comments';
type ViewLayout = 'grid' | 'list';

// ─── Number formatter ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n === undefined || n === null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Форматирует дату для подписи графика. Короткий формат (4–10 мар) для компактных чартов. */
function formatChartDateLabel(date: Date, period: Period, short = false): string {
  const opts = { month: 'short' as const, day: 'numeric' as const };
  if (period === 'day') {
    return date.toLocaleDateString('ru-RU', opts);
  }
  if (period === 'week') {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const mon = d.getDate();
    const sun = new Date(d);
    sun.setDate(sun.getDate() + 6);
    const month = sun.toLocaleDateString('ru-RU', { month: 'short' });
    if (short) return `${mon}–${sun.getDate()} ${month}`;
    return `с ${mon} по ${sun.getDate()} ${month}`;
  }
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const month = last.toLocaleDateString('ru-RU', { month: 'short' });
  if (short) return `${d.getDate()}–${last.getDate()} ${month}`;
  return `с ${d.getDate()} по ${last.getDate()} ${month}`;
}

// ─── Viral helpers (same logic as Workspace.tsx) ──────────────────────────────

/** views / days / 1000 — скорость набора просмотров */
function calcViralCoef(views: number, takenAt: number | null): number {
  if (!views) return 0;
  if (!takenAt) return Math.round((views / 30000) * 10) / 10;
  const diffDays = Math.max(1, Math.floor((Date.now() - takenAt * 1000) / 86400000));
  return Math.round((views / diffDays / 1000) * 10) / 10;
}

/** video_views / avg_bottom3_views профиля */
function calcViralMultiplier(views: number, avgBottom3: number): number | null {
  if (!avgBottom3) return null;
  return Math.round((views / avgBottom3) * 10) / 10;
}

/** Усиливает viralCoef на основе множителя залётности */
function applyMultiplier(coef: number, mult: number | null): number {
  if (mult === null || mult < 1) return coef * 0.1;
  if (mult >= 4) return coef * 5;
  if (mult >= 3) return coef * 3;
  if (mult >= 2) return coef * 1.3;
  return coef * 0.1;
}

// ─── Grey Sphere ──────────────────────────────────────────────────────────────

function GreySphere({ size = 56 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, #e2e8f0, #94a3b8 40%, #64748b 75%, #475569)`,
        boxShadow: `0 ${size * 0.1}px ${size * 0.35}px rgba(71,85,105,0.28), inset 0 ${size * 0.04}px ${size * 0.12}px rgba(255,255,255,0.5)`,
      }}
    />
  );
}

// ─── 3D Trophy Mascot ─────────────────────────────────────────────────────────

function TrophyMascot() {
  return (
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
      className="relative flex items-center justify-center"
    >
      {/* Ambient glow */}
      <div className="absolute w-24 h-16 rounded-full blur-2xl opacity-60" style={{ background: 'radial-gradient(ellipse, #fcd34d 0%, #f59e0b 60%, transparent 100%)', bottom: -8 }} />
      <svg width="88" height="104" viewBox="0 0 88 104" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tg1" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="35%" stopColor="#FCD34D" />
            <stop offset="75%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="tg2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="tg3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="tg4" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="40%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#D97706" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Shadow under base */}
        <ellipse cx="44" cy="100" rx="22" ry="5" fill="#B45309" opacity="0.25" />

        {/* Base plate */}
        <rect x="24" y="88" width="40" height="10" rx="5" fill="url(#tg4)" filter="url(#ts)" />
        <rect x="26" y="89" width="36" height="4" rx="2" fill="#FDE68A" opacity="0.4" />

        {/* Stem */}
        <rect x="37" y="72" width="14" height="18" rx="3" fill="url(#tg3)" />
        <rect x="39" y="73" width="6" height="16" rx="2" fill="#FCD34D" opacity="0.35" />

        {/* Cup body */}
        <path d="M14 16 Q14 8 22 8 L66 8 Q74 8 74 16 L68 70 Q68 74 64 74 L24 74 Q20 74 20 70 Z" fill="url(#tg1)" filter="url(#ts)" />

        {/* Inner cup highlight */}
        <path d="M20 18 Q20 13 26 13 L62 13 Q68 13 68 18 L63 66 Q63 69 60 69 L28 69 Q25 69 25 66 Z" fill="url(#tg2)" opacity="0.5" />

        {/* Left handle */}
        <path d="M18 22 Q4 32 4 48 Q4 60 18 62" stroke="url(#tg1)" strokeWidth="7" fill="none" strokeLinecap="round" filter="url(#ts)" />
        <path d="M18 22 Q6 34 6 48 Q6 58 18 62" stroke="#FDE68A" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />

        {/* Right handle */}
        <path d="M70 22 Q84 32 84 48 Q84 60 70 62" stroke="url(#tg1)" strokeWidth="7" fill="none" strokeLinecap="round" filter="url(#ts)" />
        <path d="M70 22 Q82 34 82 48 Q82 58 70 62" stroke="#FDE68A" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />

        {/* Star on cup */}
        <text x="44" y="52" textAnchor="middle" fontSize="24" fill="white" opacity="0.95" filter="url(#ts)">★</text>

        {/* Shine top-left */}
        <ellipse cx="30" cy="26" rx="7" ry="10" fill="white" opacity="0.22" transform="rotate(-25 30 26)" />
        <ellipse cx="28" cy="23" rx="3" ry="5" fill="white" opacity="0.35" transform="rotate(-25 28 23)" />

        {/* Rim highlight */}
        <path d="M22 8 Q44 5 66 8" stroke="white" strokeWidth="2.5" fill="none" opacity="0.5" strokeLinecap="round" />
      </svg>

      {/* Sparkles */}
      {[
        { x: 6, y: 4, size: 12, delay: 0 },
        { x: 74, y: 10, size: 9, delay: 0.8 },
        { x: 2, y: 52, size: 7, delay: 1.4 },
        { x: 80, y: 58, size: 8, delay: 0.4 },
      ].map((s, i) => (
        <motion.div
          key={i}
          className="absolute text-yellow-300"
          style={{ left: s.x, top: s.y, fontSize: s.size }}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2.5, delay: s.delay, ease: 'easeInOut' }}
        >✦</motion.div>
      ))}
    </motion.div>
  );
}

// ─── Bento Cards ──────────────────────────────────────────────────────────────

const CARD = "bg-white/80 backdrop-blur-[24px] border border-white/70 rounded-3xl shadow-[0_2px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]";


// ─── Period Selector ──────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: { id: Period; label: string }[] = [
    { id: 'day', label: 'Дни' },
    { id: 'week', label: 'Нед' },
    { id: 'month', label: 'Мес' },
  ];
  return (
    <div className="flex gap-0.5 p-1 bg-slate-100/80 rounded-xl">
      {options.map(o => (
        <button
          key={o.id} onClick={() => onChange(o.id)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            value === o.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartModeToggle({ value, onChange }: { value: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex gap-0.5 p-1 bg-slate-100/80 rounded-xl">
      <button onClick={() => onChange('cumulative')}
        className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          value === 'cumulative' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
        Общее
      </button>
      <button onClick={() => onChange('release_week')}
        className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          value === 'release_week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
        Точечно
      </button>
    </div>
  );
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

const MIN_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 час

type SyncOption = { count: SyncCount; tokenAction: 'analytics_sync_12' | 'analytics_sync_24' | 'analytics_sync_36' | 'analytics_sync_48' | 'analytics_sync_60' };

const PRIMARY_OPTIONS: SyncOption[] = [
  { count: 12, tokenAction: 'analytics_sync_12' },
  { count: 24, tokenAction: 'analytics_sync_24' },
];
const EXTENDED_OPTIONS: SyncOption[] = [
  { count: 36, tokenAction: 'analytics_sync_36' },
  { count: 48, tokenAction: 'analytics_sync_48' },
  { count: 60, tokenAction: 'analytics_sync_60' },
];

function SyncOptionBtn({ o, syncing, onClick }: { o: SyncOption; syncing: boolean; onClick: () => void }) {
  const { canAfford } = useTokenBalance();
  const cost = getTokenCost(o.tokenAction);
  const affordable = canAfford(cost);
  return (
    <motion.button
      onClick={onClick}
      disabled={syncing || !affordable}
      className={cn(
        'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all touch-manipulation',
        'border shadow-sm active:scale-[0.98]',
        affordable
          ? 'bg-white/70 border-white/80 hover:bg-white/90 hover:shadow-md'
          : 'bg-slate-50/50 border-slate-100 opacity-50 cursor-not-allowed',
        syncing && 'opacity-60 cursor-not-allowed',
      )}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      whileTap={affordable && !syncing ? { scale: 0.97 } : {}}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold text-slate-900 tracking-tight leading-none">{o.count}</span>
        <span className="text-[13px] font-medium text-slate-500">роликов</span>
      </div>
      {syncing ? <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" /> : <CoinBadge coins={cost} size="sm" />}
    </motion.button>
  );
}

function SyncModal({ onSync, onClose, syncing, lastSyncAt }: {
  onSync: (count: SyncCount) => void;
  onClose: () => void;
  syncing: boolean;
  lastSyncAt: string | null;
}) {
  const { balance } = useTokenBalance();
  const [showExtended, setShowExtended] = useState(false);

  const msSinceLast = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : Infinity;
  const cooldownLeft = Math.max(0, MIN_SYNC_INTERVAL_MS - msSinceLast);
  const cooldownMins = Math.ceil(cooldownLeft / 60000);
  const isCooling = cooldownLeft > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
        onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="relative w-full max-w-sm mx-0 md:mx-4 safe-bottom"
        initial={{ opacity: 0, y: 56 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 56 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      >
        <div className="flex justify-center pb-2 md:hidden">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>
        <div className="bg-white/80 backdrop-blur-[32px] backdrop-saturate-[200%] border border-white/70 rounded-t-[28px] md:rounded-[28px] shadow-float overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-start justify-between">
            <div>
              <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Обновить аналитику</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">Баланс: {balance} монет</p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 transition-colors touch-manipulation -mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isCooling && (
            <div className="mx-4 mb-3 flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-50/80 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-[12px] text-amber-700">
                Следующее обновление через <b>{cooldownMins} мин</b>. Для графика лучше обновлять раз в час.
              </p>
            </div>
          )}

          <div className="px-4 pb-4 space-y-2.5">
            {PRIMARY_OPTIONS.map(o => (
              <SyncOptionBtn key={o.count} o={o} syncing={syncing} onClick={() => onSync(o.count)} />
            ))}
          </div>

          {/* Expandable extended options */}
          <div className="px-4 pb-6">
            <button
              onClick={() => setShowExtended(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-100/60 border border-slate-200/50 text-slate-500 hover:bg-slate-100 transition-colors touch-manipulation"
            >
              <span className="text-[13px] font-medium">Больше роликов</span>
              <motion.div animate={{ rotate: showExtended ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronRight className="w-4 h-4 rotate-90" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showExtended && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="pt-2.5 space-y-2.5">
                    {EXTENDED_OPTIONS.map(o => (
                      <SyncOptionBtn key={o.count} o={o} syncing={syncing} onClick={() => onSync(o.count)} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Reel Card ────────────────────────────────────────────────────────────────

function ReelCard({ reel, onClick, layout, avgBottom3Views }: {
  reel: ProjectReel; onClick: () => void; layout: ViewLayout; avgBottom3Views: number;
}) {
  const takenAt = reel.taken_at ? new Date(reel.taken_at * 1000) : null;
  const views = reel.latest_view_count ?? 0;
  const likes = reel.latest_like_count ?? 0;
  const comments = reel.latest_comment_count ?? 0;
  const dateLabel = takenAt
    ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : undefined;

  // Grid — точно тот же VideoGradientCard что и в ленте, с виральностью
  if (layout === 'grid') {
    const viralCoefRaw = calcViralCoef(views, reel.taken_at ?? null);
    const viralMult = calcViralMultiplier(views, avgBottom3Views);
    const viralCoef = applyMultiplier(viralCoefRaw, viralMult);
    return (
      <VideoGradientCard
        thumbnailUrl={reel.thumbnail_url ?? undefined}
        caption={reel.caption ?? undefined}
        viewCount={views}
        likeCount={likes}
        commentCount={comments}
        date={dateLabel}
        viralCoef={viralCoef}
        viralMultiplier={viralMult}
        onClick={onClick}
      />
    );
  }

  // List layout
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-white/70 backdrop-blur-sm border border-white/65 rounded-2xl shadow-[0_2px_12px_rgba(15,23,42,0.07)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.10)] hover:bg-white/90 transition-all text-left"
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} whileTap={{ scale: 0.98 }}
    >
      {/* Превью */}
      <div className="relative w-12 h-[68px] rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
        {reel.thumbnail_url ? (
          <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-4 h-4 text-slate-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 mb-0.5">{dateLabel || '—'}</p>
        <p className="text-[13px] text-slate-700 line-clamp-2 leading-snug font-medium">
          {reel.caption || 'Без подписи'}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
            <Eye className="w-2.5 h-2.5" />{fmt(views)}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-500">
            <Heart className="w-2.5 h-2.5" />{fmt(likes)}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">
            <MessageCircle className="w-2.5 h-2.5" />{fmt(comments)}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Reel Detail Modal ────────────────────────────────────────────────────────

function ReelDetailModal({ reel, onClose, getReelSnapshots }: {
  reel: ProjectReel;
  onClose: () => void;
  getReelSnapshots: (reelId: string) => ReturnType<typeof import('../hooks/useProjectAnalytics').useProjectAnalytics>['getReelSnapshots'] extends (id: string) => infer R ? R : never;
}) {
  const reelSnaps = getReelSnapshots(reel.id);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const { addVideoToInbox, updateVideoShortcode } = useInboxVideos();
  const { currentProject } = useProjectContext();
  const { refs, refsWithoutShortcode, refetch: refetchRefs } = useRefsForLinking(currentProject?.id ?? null);

  const linkedRef = refs.find(r => r.shortcode === reel.shortcode);
  const handleLinkRef = async (refId: string) => {
    const ok = await updateVideoShortcode(refId, reel.shortcode);
    setShowRefPicker(false);
    if (ok) {
      toast.success('Реф привязан к ролику');
      refetchRefs();
    } else toast.error('Не удалось привязать');
  };
  const handleUnlinkRef = async () => {
    if (!linkedRef) return;
    const ok = await updateVideoShortcode(linkedRef.id, null);
    if (ok) {
      toast.success('Привязка снята');
      refetchRefs();
    } else toast.error('Не удалось отвязать');
  };

  const chartData = useMemo(() => {
    if (reelSnaps.length < 2) return [];
    return reelSnaps.map(s => ({
      date: new Date(s.snapshotted_at),
      views: s.view_count,
      likes: s.like_count,
      comments: s.comment_count,
    }));
  }, [reelSnaps]);

  const latestSnap = reelSnaps[reelSnaps.length - 1];
  const prevSnap = reelSnaps[reelSnaps.length - 2];
  const viewsDelta = latestSnap && prevSnap ? latestSnap.view_count - prevSnap.view_count : null;
  const takenAt = reel.taken_at ? new Date(reel.taken_at * 1000) : null;
  const views = latestSnap?.view_count ?? reel.latest_view_count ?? 0;
  const likes = latestSnap?.like_count ?? reel.latest_like_count ?? 0;
  const comments = latestSnap?.comment_count ?? reel.latest_comment_count ?? 0;
  const instagramUrl = `https://www.instagram.com/reel/${reel.shortcode}/`;

  const handleTranscribe = async () => {
    if (!reel.video_url) { toast.error('Нет ссылки на видео для транскрибации'); return; }
    setTranscribing(true);
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: reel.video_url, type: 'reel' }),
      });
      const data = await res.json();
      if (data.transcript || data.text) {
        setTranscript(data.transcript || data.text);
        toast.success('Транскрибация готова');
      } else { toast.error('Не удалось транскрибировать'); }
    } catch { toast.error('Ошибка транскрибации'); }
    finally { setTranscribing(false); }
  };

  const handleCopyToFolder = async (folderId: string | null) => {
    setShowFolderPicker(false);
    await addVideoToInbox({
      title: reel.caption?.slice(0, 80) || 'Reel из аналитики',
      previewUrl: reel.thumbnail_url || '',
      url: instagramUrl,
      viewCount: views,
      likeCount: likes,
      commentCount: comments,
      ownerUsername: reel.shortcode,
      shortcode: reel.shortcode,
      folderId: folderId || undefined,
      takenAt: reel.taken_at || undefined,
    });
    toast.success('Скопировано в ленту');
  };

  const folders = currentProject?.folders || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-[8px]"
        onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="relative w-full max-w-lg mx-0 md:mx-4 max-h-[92vh] flex flex-col rounded-t-[28px] md:rounded-[28px] shadow-2xl safe-bottom overflow-hidden"
        style={{ background: 'rgba(248,248,252,0.96)', backdropFilter: 'blur(32px) saturate(200%)' }}
        initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      >
        {/* Hero thumbnail */}
        <div className="relative w-full flex-shrink-0" style={{ aspectRatio: '16/9' }}>
          {reel.thumbnail_url ? (
            <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
              <Film className="w-12 h-12 text-slate-500" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%)' }} />

          {/* Top buttons */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <a
              href={instagramUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white/90 text-[11px] font-semibold backdrop-blur-md border border-white/20 touch-manipulation"
              style={{ background: 'rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}
            >
              <Instagram className="w-3.5 h-3.5" />
              Открыть в Instagram
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 text-white/90 touch-manipulation"
              style={{ background: 'rgba(0,0,0,0.35)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom title */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6">
            <p className="text-white font-semibold text-[15px] leading-snug line-clamp-2 drop-shadow-sm">
              {reel.caption ? reel.caption.slice(0, 80) + (reel.caption.length > 80 ? '…' : '') : 'Без подписи'}
            </p>
            <p className="text-white/60 text-[11px] mt-0.5">
              {takenAt ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stats row */}
          <div className="flex items-stretch gap-2 px-4 pt-4 pb-0">
            {[
              { icon: <Eye className="w-4 h-4" />, value: views, delta: viewsDelta, label: 'просмотров', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
              { icon: <Heart className="w-4 h-4" />, value: likes, label: 'лайков', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
              { icon: <MessageCircle className="w-4 h-4" />, value: comments, label: 'коммент.', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
            ].map(s => (
              <div key={s.label} className="flex-1 rounded-2xl px-3 py-3 flex flex-col gap-0.5" style={{ background: s.bg }}>
                <span style={{ color: s.color }}>{s.icon}</span>
                <p className="text-[20px] font-bold text-slate-900 leading-none tabular-nums mt-1">{fmt(s.value)}</p>
                {s.delta != null && (
                  <p className={cn('text-[11px] font-semibold flex items-center gap-0.5', s.delta > 0 ? 'text-emerald-500' : s.delta < 0 ? 'text-rose-500' : 'text-slate-400')}>
                    {s.delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : s.delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {fmt(Math.abs(s.delta))}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="px-4 pt-3 space-y-3 pb-6">
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleTranscribe} disabled={transcribing || !reel.video_url}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[13px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-all touch-manipulation"
              >
                {transcribing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                {transcribing ? 'Транскрибирую…' : 'Транскрибировать'}
              </button>
              <button
                onClick={() => setShowFolderPicker(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[13px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all touch-manipulation"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                В папку
              </button>
            </div>

            {/* Folder picker */}
            <AnimatePresence>
              {showFolderPicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">Выбери папку</p>
                    <button
                      onClick={() => handleCopyToFolder(null)}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-100 transition-colors touch-manipulation"
                    >
                      📥 Все видео (без папки)
                    </button>
                    {folders.map((f: { id: string; name: string }) => (
                      <button
                        key={f.id}
                        onClick={() => handleCopyToFolder(f.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-100 transition-colors touch-manipulation"
                      >
                        📁 {f.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowFolderPicker(false)}
                      className="w-full text-center py-2 text-[12px] text-slate-400 hover:text-slate-600 touch-manipulation"
                    >
                      Отмена
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Привязка к рефу из папки (для аналитики по ответственным) */}
            {currentProject && (
              <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1">Реф из папки</p>
                {linkedRef ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100">
                    <span className="text-[13px] text-slate-700 truncate flex-1">
                      {linkedRef.caption?.slice(0, 50) || 'Реф без названия'}
                      {(linkedRef.caption?.length ?? 0) > 50 ? '…' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={handleUnlinkRef}
                      className="shrink-0 p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 touch-manipulation"
                      title="Отвязать реф"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRefPicker(!showRefPicker)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all touch-manipulation"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Привязать к рефу из папки
                    </button>
                    <AnimatePresence>
                      {showRefPicker && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {refsWithoutShortcode.length === 0 ? (
                              <p className="text-[12px] text-slate-400 px-2 py-2">Нет рефов без привязки. Добавь видео в папки в ленте.</p>
                            ) : (
                              refsWithoutShortcode.map((ref) => (
                                <button
                                  key={ref.id}
                                  type="button"
                                  onClick={() => handleLinkRef(ref.id)}
                                  className="w-full text-left px-3 py-2.5 rounded-xl bg-white text-[13px] text-slate-700 hover:bg-slate-100 transition-colors touch-manipulation flex items-center gap-2"
                                >
                                  {ref.thumbnail_url ? (
                                    <img src={ref.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-slate-200 shrink-0 flex items-center justify-center">
                                      <Film className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                  <span className="truncate">{ref.caption?.slice(0, 40) || 'Без названия'}{(ref.caption?.length ?? 0) > 40 ? '…' : ''}</span>
                                </button>
                              ))
                            )}
                            <button
                              type="button"
                              onClick={() => setShowRefPicker(false)}
                              className="w-full text-center py-2 text-[12px] text-slate-400 hover:text-slate-600 touch-manipulation"
                            >
                              Отмена
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            )}

            {/* Views chart */}
            {chartData.length >= 2 ? (
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[13px] font-semibold text-slate-700 mb-3">Динамика просмотров</p>
                <AreaChart data={chartData} formatXLabel={(d) => formatChartDateLabel(d, 'day')} aspectRatio="3 / 1" margin={{ top: 12, right: 12, bottom: 28, left: 36 }}>
                  <Grid horizontal numTicksRows={3} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.18} stroke="#6366f1" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                  <XAxis numTicks={Math.min(chartData.length, 4)} />
                  <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
                </AreaChart>
                <p className="text-[10px] text-slate-400 text-center mt-2">{reelSnaps.length} снимков данных</p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <BarChart2 className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-slate-600">
                    {reelSnaps.length === 0 ? 'Нужно 2 обновления для динамики' : 'Ещё 1 обновление — и появится график'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {reelSnaps.length === 0 ? 'Пока нет снимков данных' : `${reelSnaps.length}/2 снимков собрано`}
                  </p>
                </div>
              </div>
            )}

            {/* Transcription result */}
            {transcript && (
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[13px] font-semibold text-slate-700 mb-2">Транскрибация</p>
                <p className="text-[13px] text-slate-600 leading-relaxed max-h-36 overflow-y-auto">{transcript}</p>
              </div>
            )}

            {/* Caption */}
            {reel.caption && (
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-semibold text-slate-700">Подпись</p>
                  {reel.caption.length > 120 && (
                    <button onClick={() => setCaptionExpanded(v => !v)} className="text-[11px] text-indigo-500 font-medium">
                      {captionExpanded ? 'Свернуть' : 'Развернуть'}
                    </button>
                  )}
                </div>
                <p className={cn('text-[13px] text-slate-600 leading-relaxed', !captionExpanded && 'line-clamp-4')}>
                  {reel.caption}
                </p>
              </div>
            )}

            {/* AI analyze */}
            <button disabled className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-slate-200 text-slate-400 cursor-not-allowed">
              <Sparkles className="w-4 h-4" />
              <span className="text-[13px]">AI-анализ ролика — скоро</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <GreySphere size={72} />
      <h3 className="mt-5 text-lg font-semibold text-slate-800">Настройте аналитику</h3>
      <p className="mt-2 text-sm text-slate-500 max-w-xs">
        Введи свой никнейм в Instagram — и мы будем отслеживать все твои рилсы
      </p>
      <button
        onClick={onSetup}
        className="mt-6 flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 text-white font-medium text-sm shadow-glass hover:bg-slate-700 active:scale-95 transition-all touch-manipulation"
      >
        <Instagram className="w-4 h-4" />
        Ввести никнейм
      </button>
    </div>
  );
}

// ─── Setup Modal ──────────────────────────────────────────────────────────────

function SetupModal({ onSave, onClose, initial }: { onSave: (u: string) => void; onClose: () => void; initial?: string }) {
  const [username, setUsername] = useState(initial || '');

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
        onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="relative w-full max-w-sm mx-0 md:mx-4 safe-bottom"
        initial={{ opacity: 0, y: 56 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 56 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      >
        <div className="flex justify-center pb-2 md:hidden">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>
        <div className="bg-white/80 backdrop-blur-[32px] backdrop-saturate-[200%] border border-white/70 rounded-t-[28px] md:rounded-[28px] shadow-float overflow-hidden">
          <div className="px-6 pt-6 pb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-glass">
                <Instagram className="w-5 h-5 text-white" strokeWidth={1.8} />
              </div>
              <div>
                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Никнейм в Instagram</h3>
                <p className="text-[12px] text-slate-500">Аналитика проекта</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 transition-colors touch-manipulation">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-center gap-0 bg-slate-100/70 rounded-2xl border border-slate-200/60 overflow-hidden focus-within:ring-2 focus-within:ring-slate-300/50 transition-all">
              <span className="pl-4 pr-1 text-[15px] font-semibold text-slate-400 select-none">@</span>
              <input
                type="text" value={username}
                onChange={e => setUsername(e.target.value.replace(/^@/, '').trim().toLowerCase())}
                placeholder="your_instagram"
                className="flex-1 px-3 py-4 bg-transparent outline-none text-slate-900 font-medium text-[15px] placeholder:text-slate-400"
                autoFocus autoComplete="off" autoCapitalize="none"
              />
            </div>
            <motion.button
              onClick={() => { if (username) onSave(username); }} disabled={!username}
              className="w-full py-4 rounded-2xl font-semibold text-[15px] bg-slate-900 text-white shadow-glass active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all touch-manipulation"
              whileTap={username ? { scale: 0.97 } : {}}
            >
              Сохранить и синхронизировать
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Analytics Component ─────────────────────────────────────────────────

type SubView = 'overview' | 'reels' | 'charts' | 'responsibles';

export function Analytics() {
  const { currentProjectId } = useProjectContext();
  const {
    reels, snapshots, loading, syncing, stats, instagramUsername, lastSyncAt,
    loadAnalytics, loadProjectConfig, setInstagramUsername, syncReels,
    getReelSnapshots, buildChartData,
  } = useProjectAnalytics(currentProjectId);
  const { stats: responsiblesStats, byRole } = useResponsiblesStats(currentProjectId, reels);
  const { refsWithoutShortcode, linkedShortcodes, refetch: refetchRefsForLinking } = useRefsForLinking(currentProjectId);
  const { updateVideoShortcode } = useInboxVideos();
  const reelsWithoutRef = reelsWithoutLinkedRef(reels, linkedShortcodes);
  const [linkReelForRefId, setLinkReelForRefId] = useState<string | null>(null);
  const [linkRefForReelShortcode, setLinkRefForReelShortcode] = useState<string | null>(null);

  const { deduct, canAfford } = useTokenBalance();

  const [subView, setSubView] = useState<SubView>('overview');
  const [period, setPeriod] = useState<Period>('week');
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('grid');
  const [selectedReel, setSelectedReel] = useState<ProjectReel | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  useEffect(() => {
    if (currentProjectId) { loadProjectConfig(); loadAnalytics(); }
  }, [currentProjectId, loadProjectConfig, loadAnalytics]);

  // Reset to overview when project changes
  useEffect(() => { setSubView('overview'); }, [currentProjectId]);

  const handleSaveUsername = useCallback(async (username: string) => {
    const ok = await setInstagramUsername(username);
    if (ok !== false) { setShowSetupModal(false); setShowSyncModal(true); }
  }, [setInstagramUsername]);

  const handleSync = useCallback(async (count: SyncCount) => {
    if (!instagramUsername) return;
    const tokenAction = count === 12 ? 'analytics_sync_12' : count === 24 ? 'analytics_sync_24' : count === 36 ? 'analytics_sync_36' : count === 48 ? 'analytics_sync_48' : 'analytics_sync_60';
    const cost = getTokenCost(tokenAction);
    if (!canAfford(cost)) { toast.error(`Недостаточно монет. Нужно ${cost} монет`); return; }
    setShowSyncModal(false);
    await deduct(cost);
    await syncReels(instagramUsername, count);
  }, [instagramUsername, syncReels, deduct, canAfford]);

  const chartData = useMemo(() => buildChartData(period, chartMode), [buildChartData, period, chartMode]);
  // Если «Общее» пусто — показываем «Точечно» в разделе аналитики
  const effectiveChartData = useMemo(() => {
    if (chartData.length > 0) return chartData;
    if (chartMode === 'cumulative') return buildChartData(period, 'release_week');
    return [];
  }, [chartData, chartMode, buildChartData, period]);
  const chartIsFallbackToPoint = chartMode === 'cumulative' && chartData.length === 0 && effectiveChartData.length > 0;
  const chartSubtitle = chartMode === 'release_week' || chartIsFallbackToPoint
    ? 'просмотры роликов по дате выпуска'
    : snapshots.length === 0 ? null : null;

  const sortedReels = useMemo(() => {
    return [...reels].sort((a, b) => {
      if (sortBy === 'date') return (b.taken_at || 0) - (a.taken_at || 0);
      if (sortBy === 'views') return (b.latest_view_count || 0) - (a.latest_view_count || 0);
      if (sortBy === 'likes') return (b.latest_like_count || 0) - (a.latest_like_count || 0);
      if (sortBy === 'comments') return (b.latest_comment_count || 0) - (a.latest_comment_count || 0);
      return 0;
    });
  }, [reels, sortBy]);

  const avgBottom3Views = useMemo(() => {
    const views = reels.map(r => r.latest_view_count ?? 0).filter(v => v > 0).sort((a, b) => a - b);
    const bottom3 = views.slice(0, Math.min(3, views.length));
    if (!bottom3.length) return 0;
    return Math.floor(bottom3.reduce((s, v) => s + v, 0) / bottom3.length);
  }, [reels]);

  const hasAccount = !!instagramUsername;
  const hasData = reels.length > 0;

  const formatLastSync = (dt: string | null) => {
    if (!dt) return null;
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} мин назад`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    return new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  // ── Shared Header ──────────────────────────────────────────────────────────
  const Header = (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3">
        {subView !== 'overview' && (
          <motion.button
            onClick={() => setSubView('overview')}
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-white/80 border border-white/60 shadow-sm text-slate-600 hover:bg-white transition-colors touch-manipulation"
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.94 }}
          >
            <ChevronLeft className="w-4.5 h-4.5" />
          </motion.button>
        )}
        {subView === 'overview' && <GreySphere size={40} />}
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {subView === 'overview' ? 'Аналитика' : subView === 'reels' ? 'Все ролики' : subView === 'charts' ? 'Графики' : 'По ответственным'}
          </h1>
          {subView === 'overview' && instagramUsername && (
            <button onClick={() => setShowSetupModal(true)}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
              <Instagram className="w-2.5 h-2.5" />@{instagramUsername}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {lastSyncAt && subView === 'overview' && (
          <span className="text-[11px] text-slate-400 hidden sm:block">{formatLastSync(lastSyncAt)}</span>
        )}
        <button
          onClick={() => hasAccount ? setShowSyncModal(true) : setShowSetupModal(true)}
          disabled={syncing}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[13px] font-semibold transition-all touch-manipulation',
            'bg-slate-900 text-white hover:bg-slate-700 active:scale-95 shadow-[0_4px_14px_rgba(15,23,42,0.18)]',
            'disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
          <span>{syncing ? 'Загрузка…' : 'Обновить'}</span>
        </button>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
          {Header}
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className={cn("h-28 bg-white/60 rounded-3xl animate-pulse", i <= 2 && "h-24", i >= 5 && "col-span-2 h-48")} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── No account ─────────────────────────────────────────────────────────────
  if (!hasAccount) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
          {Header}
          <EmptyState onSetup={() => setShowSetupModal(true)} />
        </div>
        <AnimatePresence>
          {showSetupModal && <SetupModal key="setup" initial="" onSave={handleSaveUsername} onClose={() => setShowSetupModal(false)} />}
        </AnimatePresence>
      </div>
    );
  }

  // ── Has account, no data ───────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
          {Header}
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-3xl bg-white/80 border border-white/60 flex items-center justify-center mb-4 shadow-sm">
              <BarChart2 className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-700">Нет данных</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">Нажмите «Обновить» чтобы загрузить рилсы</p>
          </div>
        </div>
        <AnimatePresence>
          {showSyncModal && <SyncModal key="sync" onSync={handleSync} onClose={() => setShowSyncModal(false)} syncing={syncing} lastSyncAt={lastSyncAt} />}
          {showSetupModal && <SetupModal key="setup" initial={instagramUsername} onSave={handleSaveUsername} onClose={() => setShowSetupModal(false)} />}
        </AnimatePresence>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── SUB-VIEW: REELS ───────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (subView === 'reels') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
          {Header}
          {/* Sort + layout controls */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-slate-500">{reels.length} роликов</p>
            <div className="flex items-center gap-2">
              <select
                value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                className="text-xs text-slate-600 bg-white/80 border border-white/60 rounded-xl px-3 py-1.5 outline-none cursor-pointer shadow-sm"
              >
                <option value="date">По дате</option>
                <option value="views">По просмотрам</option>
                <option value="likes">По лайкам</option>
                <option value="comments">По комментариям</option>
              </select>
              <div className="flex gap-0.5 p-1 bg-white/80 border border-white/60 rounded-xl shadow-sm">
                <button onClick={() => setViewLayout('grid')} className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewLayout('list')} className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400')}>
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          {viewLayout === 'grid' ? (
            <motion.div className="grid grid-cols-3 gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              {sortedReels.map(reel => (
                <ReelCard key={reel.id} reel={reel} onClick={() => setSelectedReel(reel)} layout="grid" avgBottom3Views={avgBottom3Views} />
              ))}
            </motion.div>
          ) : (
            <motion.div className="space-y-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              {sortedReels.map(reel => (
                <ReelCard key={reel.id} reel={reel} onClick={() => setSelectedReel(reel)} layout="list" avgBottom3Views={avgBottom3Views} />
              ))}
            </motion.div>
          )}
        </div>
        <AnimatePresence>
          {selectedReel && <ReelDetailModal key="reel-detail" reel={selectedReel} onClose={() => setSelectedReel(null)} getReelSnapshots={getReelSnapshots} />}
          {showSyncModal && <SyncModal key="sync" onSync={handleSync} onClose={() => setShowSyncModal(false)} syncing={syncing} lastSyncAt={lastSyncAt} />}
        </AnimatePresence>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── SUB-VIEW: CHARTS ──────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (subView === 'charts') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4">
          {Header}
          {/* Controls */}
          <div className="flex gap-2 flex-wrap">
            <ChartModeToggle value={chartMode} onChange={setChartMode} />
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
          {/* Views */}
          <div className={cn(CARD, "p-4")}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-700">Просмотры</p>
                {chartSubtitle && (
                  <p className="text-[10px] text-indigo-400 font-medium mt-0.5">{chartSubtitle}</p>
                )}
              </div>
            </div>
            {effectiveChartData.length >= 1 ? (
              <AreaChart data={effectiveChartData} formatXLabel={(d) => formatChartDateLabel(d, period)} aspectRatio="2.2 / 1" margin={{ top: 16, right: 20, bottom: 36, left: 44 }}>
                <Grid horizontal numTicksRows={4} />
                <Area dataKey="views" fill="#6366f1" fillOpacity={0.13} stroke="#6366f1" strokeWidth={2} fadeEdges />
                <YAxis numTicks={4} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
              </AreaChart>
            ) : (
              <div className="h-36 flex flex-col items-center justify-center text-center px-4">
                <AlertCircle className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-500">
                  {chartMode === 'cumulative'
                    ? 'Для «Общее» нужны 2+ синхронизации в разное время'
                    : 'Обнови, чтобы загрузить ролики'}
                </p>
              </div>
            )}
          </div>
          {/* Likes + Comments */}
          {effectiveChartData.length >= 1 && (
            <div className={cn(CARD, "p-4")}>
              <p className="text-[13px] font-semibold text-slate-700 mb-3">Лайки и комментарии</p>
              <AreaChart data={effectiveChartData} formatXLabel={(d) => formatChartDateLabel(d, period)} aspectRatio="2.2 / 1" margin={{ top: 16, right: 20, bottom: 36, left: 44 }}>
                <Grid horizontal numTicksRows={3} />
                <Area dataKey="likes" fill="#f43f5e" fillOpacity={0.12} stroke="#f43f5e" strokeWidth={2} fadeEdges />
                <Area dataKey="comments" fill="#10b981" fillOpacity={0.12} stroke="#10b981" strokeWidth={2} fadeEdges />
                <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [
                  { color: '#f43f5e', label: 'Лайки', value: (p.likes as number) ?? 0 },
                  { color: '#10b981', label: 'Комментарии', value: (p.comments as number) ?? 0 },
                ]} />
              </AreaChart>
            </div>
          )}
        </div>
        <AnimatePresence>
          {showSyncModal && <SyncModal key="sync" onSync={handleSync} onClose={() => setShowSyncModal(false)} syncing={syncing} lastSyncAt={lastSyncAt} />}
        </AnimatePresence>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── SUB-VIEW: RESPONSIBLES ─────────────────────────────────────────────═
  // ══════════════════════════════════════════════════════════════════════════
  if (subView === 'responsibles') {
    const roles = [...byRole.keys()];

    const handleLinkRefToReel = async (refId: string, shortcode: string) => {
      const ok = await updateVideoShortcode(refId, shortcode);
      setLinkReelForRefId(null);
      setLinkRefForReelShortcode(null);
      if (ok) {
        toast.success('Реф привязан к ролику');
        refetchRefsForLinking();
      } else toast.error('Не удалось привязать');
    };

    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4">
          {Header}
          <p className="text-[13px] text-slate-500">
            Сумма просмотров роликов, у которых указан ответственный. Заполняйте логины в карточках видео в ленте.
          </p>

          {/* Прикрепления: рефы без привязки ↔ ролики без рефа */}
          {(refsWithoutShortcode.length > 0 || reelsWithoutRef.length > 0) && (
            <div className={cn(CARD, 'p-4 space-y-4')}>
              <p className="text-[13px] font-semibold text-slate-700">Прикрепления</p>
              <p className="text-[11px] text-slate-500">Свяжи рефы из папок с выложенными роликами — тогда просмотры попадут в отчёт по ответственным.</p>
              {refsWithoutShortcode.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2">Рефы без привязки</p>
                  <ul className="space-y-1.5">
                    {refsWithoutShortcode.map((ref) => (
                      <li key={ref.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-slate-50">
                        <span className="text-[13px] text-slate-700 truncate flex-1">
                          {ref.caption?.slice(0, 50) || 'Без названия'}
                          {(ref.caption?.length ?? 0) > 50 ? '…' : ''}
                        </span>
                        {linkReelForRefId === ref.id ? (
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto shrink-0">
                            {reelsWithoutRef.slice(0, 5).map((r) => (
                              <button key={r.id} type="button" onClick={() => handleLinkRefToReel(ref.id, r.shortcode)}
                                className="text-left px-2 py-1.5 rounded-lg bg-white text-[11px] text-slate-600 hover:bg-indigo-50 truncate max-w-[180px]">
                                {r.caption?.slice(0, 30) || r.shortcode}…
                              </button>
                            ))}
                            <button type="button" onClick={() => setLinkReelForRefId(null)} className="text-[10px] text-slate-400">Отмена</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setLinkReelForRefId(ref.id)} className="shrink-0 px-2 py-1 rounded-lg bg-indigo-100 text-indigo-600 text-[11px] font-medium touch-manipulation">
                            Привязать
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reelsWithoutRef.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2">Ролики без рефа</p>
                  <ul className="space-y-1.5">
                    {reelsWithoutRef.slice(0, 10).map((reel) => (
                      <li key={reel.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-slate-50">
                        <span className="text-[13px] text-slate-700 truncate flex-1">
                          {reel.caption?.slice(0, 50) || reel.shortcode}
                          {(reel.caption?.length ?? 0) > 50 ? '…' : ''}
                        </span>
                        {linkRefForReelShortcode === reel.shortcode ? (
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto shrink-0">
                            {refsWithoutShortcode.slice(0, 5).map((r) => (
                              <button key={r.id} type="button" onClick={() => handleLinkRefToReel(r.id, reel.shortcode)}
                                className="text-left px-2 py-1.5 rounded-lg bg-white text-[11px] text-slate-600 hover:bg-indigo-50 truncate max-w-[180px]">
                                {r.caption?.slice(0, 30) || 'Реф'}…
                              </button>
                            ))}
                            <button type="button" onClick={() => setLinkRefForReelShortcode(null)} className="text-[10px] text-slate-400">Отмена</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setLinkRefForReelShortcode(reel.shortcode)} className="shrink-0 px-2 py-1 rounded-lg bg-indigo-100 text-indigo-600 text-[11px] font-medium touch-manipulation">
                            Привязать
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {responsiblesStats.length === 0 ? (
            <div className={cn(CARD, 'p-8 text-center')}>
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-[15px] font-medium text-slate-600">Нет данных по ответственным</p>
              <p className="text-[13px] text-slate-400 mt-1">
                Добавь ролики в папки и укажи ответственных в карточках
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {roles.map(role => (
                <div key={role} className={cn(CARD, 'p-4')}>
                  <p className="text-[13px] font-semibold text-slate-700 mb-3">{role}</p>
                  <div className="space-y-2">
                    {byRole.get(role)!.map((s, i) => (
                      <div key={`${s.person}-${i}`} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50">
                        <span className="text-[14px] font-medium text-slate-800">{s.person}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-[12px] text-slate-400">{s.reelsCount} роликов</span>
                          <span className="text-[15px] font-bold text-slate-900 tabular-nums">{fmt(s.views)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── OVERVIEW — Bento Dashboard ────────────────────────────────────════════
  // ══════════════════════════════════════════════════════════════════════════
  const previewReels = sortedReels.slice(0, 4);

  // Сумма просмотров за последние 30 дней (ролики опубликованные в этом периоде)
  const monthAgo = Date.now() / 1000 - 30 * 86400;
  const totalViewsMonth = reels
    .filter(r => (r.taken_at ?? 0) >= monthAgo)
    .reduce((s, r) => s + (r.latest_view_count ?? 0), 0);

  // Видео за вчерашний день
  const nowMs = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStartSec = (todayStart.getTime() - 86400000) / 1000;
  const yesterdayEndSec = todayStart.getTime() / 1000;
  const videosYesterday = reels.filter(
    r => (r.taken_at ?? 0) >= yesterdayStartSec && (r.taken_at ?? 0) < yesterdayEndSec,
  );
  // Данные считаем свежими, если последний синк был не раньше вчерашнего дня
  const syncFreshEnough = lastSyncAt != null && (nowMs - new Date(lastSyncAt).getTime()) < 48 * 3600_000;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
        {Header}

        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
        >
          {/*
           * ┌──────────────┬──────────────────┬──────────┐  row 1
           * │              │  Просмотры чарт  │ Роликов  │
           * │  HERO        │  (rows 1-2)      ├──────────┤  row 2
           * │  Кубок+месяц │                  │ Ср.просм │
           * │  (rows 1-3)  ├──────────────────┼──────────┤  row 3
           * │              │  Лучший недели   │ Вчера    │
           * └──────────────┴──────────────────┴──────────┘
           * cols: 5fr  7fr  4fr
           */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: '5fr 7fr 4fr', gridTemplateRows: 'auto auto auto' }}
          >
            {/* ── LEFT HERO: кубок + сумма просмотров за месяц ─────────────── */}
            <div
              style={{ gridRow: '1 / 4' }}
              className={cn(CARD, "relative overflow-hidden flex flex-col items-center justify-between p-4 min-h-[280px]")}
              // Dark-gold gradient background
              css-ignore="true"
            >
              {/* Dark gradient bg */}
              <div className="absolute inset-0 rounded-3xl" style={{
                background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
              }} />
              {/* Subtle gold shimmer overlay */}
              <div className="absolute inset-0 rounded-3xl opacity-20" style={{
                background: 'radial-gradient(ellipse at 50% 30%, #fbbf24 0%, transparent 70%)',
              }} />

              {/* Content */}
              <div className="relative w-full flex flex-col items-center gap-1 flex-1 justify-between">
                {/* Label */}
                <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400/80 self-start">
                  Просмотры за месяц
                </p>

                {/* Trophy */}
                <div className="flex-1 flex items-center justify-center">
                  <TrophyMascot />
                </div>

                {/* Big number */}
                <div className="self-start">
                  <p className="text-[30px] font-bold text-white tracking-tight leading-none tabular-nums">
                    {fmt(totalViewsMonth)}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {reels.filter(r => (r.taken_at ?? 0) >= monthAgo).length} роликов
                  </p>
                </div>
              </div>
            </div>

            {/* ── MIDDLE: граф просмотров, rows 1-2 ────────────────────────── */}
            <motion.button
              onClick={() => setSubView('charts')}
              className={cn(CARD, "p-4 text-left active:scale-[0.98] transition-transform")}
              style={{ gridRow: '1 / 3' }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[12px] font-semibold text-slate-700">Просмотры</p>
                  {chartSubtitle && (
                    <p className="text-[9px] text-indigo-400 font-medium mt-0.5">{chartSubtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="text-[10px]">Открыть</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
              {effectiveChartData.length >= 1 ? (
                <AreaChart data={effectiveChartData} formatXLabel={(d) => formatChartDateLabel(d, period, true)} aspectRatio="1.8 / 1" margin={{ top: 8, right: 36, bottom: 28, left: 40 }}>
                  <Grid horizontal numTicksRows={2} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.13} stroke="#6366f1" strokeWidth={1.5} fadeEdges />
                  <YAxis numTicks={2} formatValue={(v) => fmt(v as number)} />
                  <XAxis numTicks={2} tickerHalfWidth={35} />
                  <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
                </AreaChart>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                    <BarChart2 className="w-4 h-4 text-indigo-300" />
                  </div>
                  <p className="text-[12px] font-medium text-slate-400">
                    {chartMode === 'cumulative' ? '2+ синка — график «Общее»' : 'Обнови для графика «Точечно»'}
                  </p>
                </div>
              )}
            </motion.button>

            {/* ── RIGHT row 1: Роликов ───────────────────────────────────────── */}
            <motion.div
              className={cn(CARD, "p-3 flex flex-col justify-between")}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
            >
              <div className="flex items-center gap-1">
                <Film className="w-3 h-3 text-slate-400" />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Роликов</p>
              </div>
              <div>
                <p className="text-[28px] font-bold text-slate-900 leading-none tabular-nums">{stats?.totalReels || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">в базе</p>
              </div>
            </motion.div>

            {/* ── RIGHT row 2: Ср. просмотров ───────────────────────────────── */}
            <motion.div
              className={cn(CARD, "p-3 flex flex-col justify-between")}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            >
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3 text-indigo-400" />
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Ср. просм.</p>
              </div>
              <div>
                <p className="text-[20px] font-bold text-slate-900 leading-none tabular-nums">{fmt(stats?.avgViewsLast30Days || 0)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">за 30 дней</p>
              </div>
            </motion.div>

            {/* ── MIDDLE row 3: Лучший рилс недели ─────────────────────────── */}
            {stats?.bestReelWeek ? (
              <motion.button
                onClick={() => setSelectedReel(stats.bestReelWeek!)}
                className={cn(CARD, "p-3 text-left flex items-center gap-3 active:scale-[0.98] transition-transform")}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="relative w-10 h-[60px] rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                  {stats.bestReelWeek.thumbnail_url
                    ? <img src={stats.bestReelWeek.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    : <Film className="w-4 h-4 text-slate-300 m-auto mt-4" />
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <Award className="w-3 h-3 text-amber-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Лучший недели</p>
                  </div>
                  <p className="text-[15px] font-bold text-slate-900 tabular-nums">{fmt(stats.bestReelWeek.latest_view_count ?? 0)}</p>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{stats.bestReelWeek.caption || 'Без подписи'}</p>
                </div>
              </motion.button>
            ) : (
              <motion.div
                className={cn(CARD, "flex items-center gap-2 p-3")}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
              >
                <Award className="w-5 h-5 text-slate-200 flex-shrink-0" />
                <p className="text-[11px] text-slate-300">Лучший рилс недели</p>
              </motion.div>
            )}

            {/* ── RIGHT row 3: Вчера выложено ───────────────────────────────── */}
            <motion.div
              className={cn(CARD, "p-3 flex flex-col justify-between")}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
            >
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-emerald-500" />
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Вчера</p>
              </div>
              {syncFreshEnough ? (
                <div>
                  <p className="text-[28px] font-bold text-slate-900 leading-none tabular-nums">{videosYesterday.length}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {videosYesterday.length === 1 ? 'ролик выложен' : videosYesterday.length >= 2 && videosYesterday.length <= 4 ? 'ролика выложено' : 'роликов выложено'}
                  </p>
                </div>
              ) : (
                <button onClick={() => setShowSyncModal(true)} className="group flex flex-col gap-0.5">
                  <RefreshCw className="w-4 h-4 text-indigo-400 group-hover:rotate-180 transition-transform duration-500" />
                  <p className="text-[10px] text-indigo-400 font-medium leading-tight">Обнови,<br/>чтобы<br/>увидеть</p>
                </button>
              )}
            </motion.div>
          </div>

          {/* ── Full-width: Reels preview ──────────────────────────────────────── */}
          <motion.button
            onClick={() => setSubView('reels')}
            className={cn(CARD, "w-full p-4 text-left active:scale-[0.98] transition-transform")}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-slate-700">Ролики</p>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="text-[11px]">{reels.length} всего</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
            {previewReels.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {previewReels.map(reel => (
                  <div key={reel.id} className="relative rounded-xl overflow-hidden bg-slate-100" style={{ aspectRatio: '9/16' }}>
                    {reel.thumbnail_url
                      ? <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Film className="w-4 h-4 text-slate-300" /></div>
                    }
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <p className="absolute bottom-1 left-0 right-0 text-center text-white/70 text-[8px] font-medium">
                      {reel.taken_at ? new Date(reel.taken_at * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">Нет роликов</p>}
          </motion.button>

          {/* ── По ответственным ──────────────────────────────────────────────── */}
          <motion.button
            onClick={() => setSubView('responsibles')}
            className={cn(CARD, "w-full p-4 text-left flex items-center justify-between active:scale-[0.98] transition-transform")}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-700">По ответственным</p>
                <p className="text-[11px] text-slate-400">
                  {responsiblesStats.length > 0 ? `${responsiblesStats.length} записей` : 'Заполняй в карточках видео'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </motion.button>
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showSetupModal && <SetupModal key="setup" initial={instagramUsername || ''} onSave={handleSaveUsername} onClose={() => setShowSetupModal(false)} />}
        {showSyncModal && <SyncModal key="sync" onSync={handleSync} onClose={() => setShowSyncModal(false)} syncing={syncing} lastSyncAt={lastSyncAt} />}
        {selectedReel && <ReelDetailModal key="reel-detail" reel={selectedReel} onClose={() => setSelectedReel(null)} getReelSnapshots={getReelSnapshots} />}
      </AnimatePresence>
    </div>
  );
}
