import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '../contexts/ProjectContext';
import { useProjectAnalytics, type ProjectReel, type SyncCount } from '../hooks/useProjectAnalytics';
import { useResponsiblesStats } from '../hooks/useResponsiblesAnalytics';
import { useRefsForLinking, reelsWithoutLinkedRef } from '../hooks/useRefsForLinking';
import { useParticipantsForResponsibles } from '../hooks/useParticipantsForResponsibles';
import { useInboxVideos } from '../hooks/useInboxVideos';
import { useAuth } from '../hooks/useAuth';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { CoinBadge } from './ui/CoinBadge';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { ResponsiblePickerModal } from './ui/ResponsiblePickerModal';
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from './ui/area-chart';
import { cn } from '../utils/cn';
import { proxyImageUrl, PLACEHOLDER_270x360 } from '../utils/imagePlaceholder';
import {
  BarChart2, RefreshCw, Instagram, Eye, Heart, MessageCircle,
  Award, Film, X, CalendarDays, Calendar, AlertCircle,
  ArrowUpRight, ArrowDownRight, Mic, Sparkles,
  LayoutGrid, List, Clock, ChevronRight, ChevronLeft, Users, Link2, Unlink, UserPlus,
  FileText, Check, ChevronDown, Trophy, Copy, Shield,
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
        date={reel.taken_at != null ? String(reel.taken_at) : undefined}
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

function ReelDetailModal({ reel, onClose, getReelSnapshots, allReels, avgBottom3Views }: {
  reel: ProjectReel;
  onClose: () => void;
  getReelSnapshots: (reelId: string) => ReturnType<typeof import('../hooks/useProjectAnalytics').useProjectAnalytics>['getReelSnapshots'] extends (id: string) => infer R ? R : never;
  allReels: ProjectReel[];
  avgBottom3Views: number;
}) {
  const reelSnaps = getReelSnapshots(reel.id);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    m(); window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  const { addVideoToInbox, updateVideoShortcode, updateVideoResponsible } = useInboxVideos();
  const { currentProject } = useProjectContext();
  const folderIds = (currentProject?.folders ?? []).map(f => f.id);
  const { refs, refetch: refetchRefs } = useRefsForLinking(currentProject?.id ?? null, folderIds);
  const participants = useParticipantsForResponsibles(currentProject?.id ?? null, currentProject?.owner_id);
  const rolesTemplate = (currentProject?.responsiblesTemplate ?? [{ id: 'resp-0', label: 'За сценарий' }, { id: 'resp-1', label: 'За монтаж' }]) as { id: string; label: string }[];
  const [showResponsiblePicker, setShowResponsiblePicker] = useState(false);

  const linkedRef = refs.find(r => r.shortcode === reel.shortcode);
  const handleLinkRef = async (refId: string) => {
    const ok = await updateVideoShortcode(refId, reel.shortcode);
    setShowRefPicker(false);
    if (ok) {
      toast.success('Исходник привязан к ролику');
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
  const handleSaveResponsibleReel = async (refId: string, items: { templateId: string; value: string }[]) => {
    const ok = await updateVideoResponsible(refId, items);
    if (ok) {
      toast.success('Ответственный обновлён');
      refetchRefs();
    } else toast.error('Не удалось сохранить');
    return ok;
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
  const folders = currentProject?.folders || [];

  // Группируем refs по папкам для ref-picker
  const refsByFolder = useMemo(() => {
    const groups: { folderId: string | null; folderName: string; refs: typeof refs }[] = [];
    const folderMap = new Map(folders.map(f => [f.id, f.name]));
    const seen = new Set<string | null>();
    const allFolderIds = [null, ...folders.map(f => f.id)];
    for (const fId of allFolderIds) {
      const group = refs.filter(r => (r.folder_id ?? null) === fId);
      if (group.length > 0 && !seen.has(fId)) {
        seen.add(fId);
        groups.push({ folderId: fId, folderName: fId ? (folderMap.get(fId) ?? 'Папка') : 'Без папки', refs: group });
      }
    }
    return groups;
  }, [refs, folders]);
  const viralCoef = calcViralCoef(views, reel.taken_at ?? null);
  const viralMult = calcViralMultiplier(views, avgBottom3Views);
  const finalViralCoef = applyMultiplier(viralCoef, viralMult);

  // Rankings среди всех роликов проекта
  const sortedByViews = useMemo(() =>
    [...allReels].sort((a, b) => (b.latest_view_count ?? 0) - (a.latest_view_count ?? 0)),
    [allReels]
  );
  const sortedByComments = useMemo(() =>
    [...allReels].sort((a, b) => (b.latest_comment_count ?? 0) - (a.latest_comment_count ?? 0)),
    [allReels]
  );
  const rankByViews = sortedByViews.findIndex(r => r.id === reel.id) + 1;
  const rankByComments = sortedByComments.findIndex(r => r.id === reel.id) + 1;

  // Folder configs
  const folderConfigs = (currentProject?.folders ?? [])
    .slice().sort((a, b) => a.order - b.order)
    .map(f => ({ id: f.id, title: f.name, color: f.color }));

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

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[20000] flex flex-col bg-[#f5f6f8]"
      style={{ willChange: 'transform' }}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
    >
      {/* Header — точная копия VideoDetailPage */}
      <div className="mb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0 rounded-none bg-white/78 backdrop-blur-glass-xl border-b border-white/65 shadow-glass p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 min-h-[44px] min-w-[44px] pr-2 -ml-2 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-white/82 transition-colors active:scale-95 touch-manipulation"
          >
            <ChevronLeft className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">Назад</span>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Работа с роликом</h1>
            <p className="text-neutral-500 text-sm">instagram reel · @{reel.shortcode?.slice(0, 12) || 'instagram'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={instagramUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium transition-colors shadow-glass-sm touch-manipulation"
          >
            <Instagram className="w-4 h-4" />
            Открыть
          </a>
          {viewsDelta != null && viewsDelta !== 0 && (
            <div className={cn(
              'px-3 py-2 rounded-pill text-sm font-medium flex items-center gap-1.5',
              viewsDelta > 0 ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
            )}>
              {viewsDelta > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {viewsDelta > 0 ? '+' : ''}{fmt(viewsDelta)} просмотров
            </div>
          )}
        </div>
      </div>

      {/* Main content — мобайл: скролл, десктоп: 3 колонки */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden w-full h-full">
        <div className="w-full h-full p-4 md:p-4 pb-28 md:pb-4 flex flex-col">
          <div className="flex flex-col md:flex-row md:flex-1 gap-4 md:min-h-0 md:overflow-hidden">

            {/* ── Left: thumbnail + папка + статистика ── */}
            <div className="flex-shrink-0 flex flex-col gap-3 md:overflow-y-auto custom-scrollbar-light w-full md:w-auto md:min-w-[256px] md:max-w-[min(256px,28vw)]">

              {/* Thumbnail 9:16 — точная копия VideoDetailPage */}
              <div className="flex justify-center flex-shrink-0">
                <div
                  className="relative rounded-2xl overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.18)] border border-white/65 bg-black"
                  style={{ aspectRatio: '9/16', width: 'min(100%, 220px)' }}
                >
                  {reel.thumbnail_url ? (
                    <img
                      src={proxyImageUrl(reel.thumbnail_url ?? undefined)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover object-top"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_270x360; }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                      <Film className="w-10 h-10 text-slate-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                  {/* Caption overlay at bottom */}
                  {reel.caption && (
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
                      <p className="text-white text-[10px] font-medium leading-snug line-clamp-2">{reel.caption.slice(0, 60)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* В ленту — папка (такой же стиль как VideoDetailPage folder picker) */}
              <div className={cn(
                "rounded-card-xl p-3 shadow-glass bg-white/82 backdrop-blur-glass-xl border border-white/70 relative",
                showFolderPicker && "z-[60]"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">Добавить в ленту</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFolderPicker(!showFolderPicker)}
                  className="w-full flex items-center justify-between px-3 py-2 min-h-[44px] rounded-xl border border-slate-200/80 bg-white/60 hover:bg-slate-50/80 active:bg-slate-100 transition-colors touch-manipulation"
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-medium text-slate-600">Выбрать папку</span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showFolderPicker && "rotate-180")} />
                </button>
                {showFolderPicker && (
                  isMobile ? createPortal(
                    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
                      <div className="absolute inset-0 bg-black/40" onClick={() => setShowFolderPicker(false)} />
                      <div className="relative bg-white rounded-t-2xl shadow-2xl p-4 pb-safe max-h-[70vh] overflow-y-auto">
                        <div className="text-xs text-slate-400 font-medium mb-3">Скопировать в папку</div>
                        <button
                          type="button"
                          onClick={() => handleCopyToFolder(null)}
                          className="w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors text-left touch-manipulation active:bg-slate-50"
                        >
                          <div className="w-4 h-4 rounded bg-slate-300 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-700">📥 Без папки</span>
                        </button>
                        {folderConfigs.map(f => (
                          <button key={f.id} type="button" onClick={() => handleCopyToFolder(f.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors text-left touch-manipulation active:bg-slate-50">
                            <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: f.color || '#94a3b8' }} />
                            <span className="text-sm font-medium text-slate-700 flex-1">{f.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body
                  ) : (
                    <div className="absolute left-0 right-0 top-full mt-1 rounded-card-xl shadow-glass-lg bg-white/95 backdrop-blur-glass-xl border border-white/[0.35] p-1.5 z-[70] shadow-xl max-h-[min(50vh,280px)] overflow-y-auto custom-scrollbar-light">
                      <button
                        type="button"
                        onClick={() => handleCopyToFolder(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg transition-colors text-left touch-manipulation hover:bg-slate-50"
                      >
                        <div className="w-3 h-3 rounded bg-slate-300" />
                        <span className="text-sm text-slate-700">📥 Без папки</span>
                      </button>
                      {folderConfigs.map(f => (
                        <button key={f.id} type="button" onClick={() => handleCopyToFolder(f.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg transition-colors text-left touch-manipulation hover:bg-slate-50">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: f.color || '#94a3b8' }} />
                          <span className="text-sm text-slate-700">{f.title}</span>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Статистика — точная копия VideoDetailPage stats */}
              <div className="rounded-card-xl p-3 shadow-glass bg-white/82 backdrop-blur-glass-xl border border-white/70">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{fmt(views)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Heart className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{fmt(likes)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <MessageCircle className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{fmt(comments)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">
                      {takenAt ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>

                {/* Viral coefficient — точная копия VideoDetailPage */}
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm">Виральность</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-bold",
                        finalViralCoef > 10 ? "text-emerald-600" : finalViralCoef > 5 ? "text-amber-600" : "text-slate-600"
                      )}>
                        {Math.round(finalViralCoef)}K/день
                      </span>
                      {viralMult !== null && viralMult !== undefined && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-semibold",
                          viralMult >= 4 ? "bg-red-100 text-red-700" :
                          viralMult >= 3 ? "bg-amber-100 text-amber-700" :
                          viralMult >= 2 ? "bg-lime-100 text-lime-700" :
                          viralMult >= 1.5 ? "bg-green-100 text-green-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {viralMult >= 1 ? `${Math.round(viralMult)}x` : `${(viralMult * 100).toFixed(0)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Открыть в Instagram — точная копия VideoDetailPage */}
              <a
                href={instagramUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-card-xl bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] shadow-glass hover:shadow-glass-hover text-slate-700 text-sm font-medium transition-all touch-manipulation"
              >
                <Instagram className="w-4 h-4" />
                Открыть в Instagram
              </a>

              {/* Ответственные — через привязку к исходнику из папки */}
              {currentProject && (
                <div className="rounded-card-xl p-3 shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] space-y-3">
                  <p className="text-xs text-slate-400 font-medium">Ответственные</p>
                  {linkedRef ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/60 border border-slate-200/60">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Link2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="text-[12px] text-slate-700 truncate">
                            {linkedRef.caption?.slice(0, 35) || 'Исходник без названия'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowResponsiblePicker(true)}
                            className="p-2 rounded-xl bg-slate-700 text-white hover:bg-slate-600 touch-manipulation flex items-center gap-1 shadow-sm min-h-[36px]"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold">Назначить</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleUnlinkRef}
                            className="p-2 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 touch-manipulation"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {linkedRef.responsibles?.length ? (
                        <div className="space-y-1">
                          {linkedRef.responsibles.map(r => (
                            <div key={r.templateId || r.label} className="flex items-center gap-2 px-2 py-1">
                              <span className="text-[10px] font-medium text-slate-400 w-20 flex-shrink-0">{r.label}</span>
                              <span className="text-[12px] text-slate-700 font-medium truncate">{r.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 px-1">Ответственные не назначены</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500">Привяжи исходник из ленты, чтобы назначить ответственных и считать их в отчёте</p>
                      <button
                        type="button"
                        onClick={() => setShowRefPicker(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-2xl bg-white/78 backdrop-blur-glass border border-white/70 hover:bg-white text-slate-700 text-sm font-medium shadow-glass-sm transition-all touch-manipulation"
                      >
                        <Link2 className="w-4 h-4" />
                        Привязать исходник
                      </button>
                    </>
                  )}
                </div>
              )}

              {showResponsiblePicker && linkedRef && (
                <ResponsiblePickerModal
                  isOpen
                  onClose={() => setShowResponsiblePicker(false)}
                  refId={linkedRef.id}
                  refCaption={linkedRef.caption ?? undefined}
                  roles={rolesTemplate}
                  participants={participants}
                  currentResponsibles={linkedRef.responsibles ?? []}
                  onSave={(items) => handleSaveResponsibleReel(linkedRef.id, items)}
                />
              )}
            </div>

            {/* ── Middle: Транскрибация — точная копия VideoDetailPage ── */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[320px] md:min-h-0 rounded-card-xl shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] overflow-hidden">
              {/* Header */}
              <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <h3 className="font-semibold text-slate-800">Транскрибация</h3>
                  </div>
                  {transcript && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(transcript); toast.success('Скопировано'); }}
                      className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-700"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {transcribing ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mb-3" />
                    <p className="text-slate-600 font-medium">Транскрибация в процессе...</p>
                    <p className="text-slate-400 text-sm">Это займёт несколько минут</p>
                  </div>
                ) : transcript ? (
                  <p className="text-slate-700 text-sm leading-relaxed">{transcript}</p>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <Mic className="w-10 h-10 text-slate-300 mb-3" />
                    <p className="text-slate-600 font-medium">Транскрибация не запущена</p>
                    <p className="text-slate-400 text-sm mb-4">Доступна если есть ссылка на видео ролика</p>
                    <button
                      onClick={handleTranscribe}
                      disabled={transcribing || !reel.video_url}
                      className="px-4 py-2.5 rounded-card-xl bg-slate-600 hover:bg-slate-700 text-white font-medium transition-all shadow-glass flex items-center gap-2 disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4" />
                      Транскрибировать
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Аналитика — вместо сценария ── */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[320px] md:min-h-0 rounded-card-xl shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] md:overflow-hidden">
              {/* Header */}
              <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-slate-600 flex-shrink-0" />
                    <h3 className="font-semibold text-slate-800">Аналитика</h3>
                  </div>
                  {allReels.length > 1 && (
                    <button
                      onClick={() => setShowRankingModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium border border-amber-200/60 transition-colors"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      Топ роликов
                    </button>
                  )}
                </div>
                {/* Rankings mini-preview */}
                {allReels.length > 1 && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100">
                      <Eye className="w-3 h-3 text-indigo-500" />
                      <span className="text-[11px] font-semibold text-indigo-700">
                        #{rankByViews} по просмотрам
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100">
                      <MessageCircle className="w-3 h-3 text-emerald-500" />
                      <span className="text-[11px] font-semibold text-emerald-700">
                        #{rankByComments} по коммент.
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">из {allReels.length}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Chart */}
                {chartData.length >= 2 ? (
                  <div>
                    <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Динамика просмотров</p>
                    <AreaChart data={chartData} formatXLabel={(d) => formatChartDateLabel(d, 'day')} aspectRatio="2.5 / 1" margin={{ top: 12, right: 12, bottom: 28, left: 36 }}>
                      <Grid horizontal numTicksRows={3} />
                      <Area dataKey="views" fill="#6366f1" fillOpacity={0.18} stroke="#6366f1" strokeWidth={2} fadeEdges />
                      <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                      <XAxis numTicks={Math.min(chartData.length, 4)} />
                      <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
                    </AreaChart>
                    <p className="text-[10px] text-slate-400 text-center mt-1">{reelSnaps.length} снимков данных</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <BarChart2 className="w-5 h-5 text-indigo-300 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-slate-600">
                        {reelSnaps.length === 0 ? 'Нужно 2 обновления для графика' : 'Ещё 1 обновление — и появится график'}
                      </p>
                      <p className="text-[11px] text-slate-400">{reelSnaps.length}/2 снимков</p>
                    </div>
                  </div>
                )}

                {/* Caption */}
                {reel.caption && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Подпись</p>
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

                {/* AI analyze placeholder */}
                <button disabled className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-slate-200 text-slate-400 cursor-not-allowed">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[13px]">AI-анализ ролика — скоро</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Ref picker overlay ── */}
      <AnimatePresence>
        {showRefPicker && (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col bg-[#f5f6f8]"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100/80 flex-shrink-0 bg-white/78 backdrop-blur-glass-xl">
              <button type="button" onClick={() => setShowRefPicker(false)}
                className="flex items-center gap-2 min-h-[44px] pr-2 -ml-2 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-white/82 transition-colors touch-manipulation">
                <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Назад</span>
              </button>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-slate-800">Выбери исходник</p>
                <p className="text-[11px] text-slate-400">Видео из папок проекта</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 custom-scrollbar-light">
              {refs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <Film className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-[14px] font-medium text-slate-600">Нет видео в проекте</p>
                  <p className="text-[12px] text-slate-400 mt-1">Добавь видео в папки через раздел «Лента»</p>
                </div>
              ) : (
                refsByFolder.map(group => (
                  <div key={group.folderId ?? '__inbox'}>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">📁 {group.folderName}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {group.refs.map(ref => {
                        const isLinked = ref.shortcode === reel.shortcode;
                        const otherLinked = ref.shortcode && ref.shortcode !== reel.shortcode;
                        return (
                          <button key={ref.id} type="button" onClick={() => handleLinkRef(ref.id)}
                            className={cn(
                              'relative flex flex-col rounded-2xl overflow-hidden border-2 transition-all touch-manipulation text-left',
                              isLinked ? 'border-emerald-400 ring-2 ring-emerald-200' : otherLinked ? 'border-amber-300 opacity-70' : 'border-transparent hover:border-indigo-300'
                            )}
                            style={{ aspectRatio: '9/16' }}
                          >
                            {ref.thumbnail_url ? (
                              <img src={proxyImageUrl(ref.thumbnail_url ?? undefined)} alt=""
                                className="absolute inset-0 w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_270x360; }} />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                                <Film className="w-5 h-5 text-slate-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                            <div className="absolute bottom-0 left-0 right-0 p-1.5">
                              <p className="text-white text-[9px] font-medium leading-tight line-clamp-2">{ref.caption?.slice(0, 30) || 'Без названия'}</p>
                            </div>
                            {isLinked && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ranking modal — топ роликов по просмотрам и комментариям ── */}
      <AnimatePresence>
        {showRankingModal && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col bg-[#f5f6f8]"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100/80 flex-shrink-0 bg-white/78 backdrop-blur-glass-xl shadow-glass">
              <button type="button" onClick={() => setShowRankingModal(false)}
                className="flex items-center gap-2 min-h-[44px] pr-2 -ml-2 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-white/82 transition-colors touch-manipulation">
                <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Назад</span>
              </button>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-slate-800">Топ роликов проекта</p>
                <p className="text-[11px] text-slate-400">{allReels.length} роликов</p>
              </div>
              <Trophy className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto px-4 py-4 space-y-6">
                {/* Топ по просмотрам */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-[13px] font-semibold text-slate-700">По просмотрам</h4>
                  </div>
                  <div className="space-y-1.5">
                    {sortedByViews.slice(0, 10).map((r, i) => (
                      <div key={r.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                        r.id === reel.id ? "bg-indigo-50 border border-indigo-200/60" : "bg-white/80 border border-white/60 shadow-sm"
                      )}>
                        <span className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                          i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-500"
                        )}>
                          {i + 1}
                        </span>
                        {r.thumbnail_url ? (
                          <img src={proxyImageUrl(r.thumbnail_url ?? undefined)} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-200 flex-shrink-0 flex items-center justify-center">
                            <Film className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <p className="flex-1 text-[12px] text-slate-700 truncate">{r.caption?.slice(0, 45) || r.shortcode}</p>
                        <span className="text-[12px] font-semibold text-slate-700 tabular-nums">{fmt(r.latest_view_count ?? 0)}</span>
                        {r.id === reel.id && <span className="text-[10px] text-indigo-600 font-bold ml-1">← этот</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Топ по комментариям */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-[13px] font-semibold text-slate-700">По комментариям</h4>
                  </div>
                  <div className="space-y-1.5">
                    {sortedByComments.slice(0, 10).map((r, i) => (
                      <div key={r.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                        r.id === reel.id ? "bg-emerald-50 border border-emerald-200/60" : "bg-white/80 border border-white/60 shadow-sm"
                      )}>
                        <span className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                          i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-500"
                        )}>
                          {i + 1}
                        </span>
                        {r.thumbnail_url ? (
                          <img src={proxyImageUrl(r.thumbnail_url ?? undefined)} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-200 flex-shrink-0 flex items-center justify-center">
                            <Film className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <p className="flex-1 text-[12px] text-slate-700 truncate">{r.caption?.slice(0, 45) || r.shortcode}</p>
                        <span className="text-[12px] font-semibold text-slate-700 tabular-nums">{fmt(r.latest_comment_count ?? 0)}</span>
                        {r.id === reel.id && <span className="text-[10px] text-emerald-600 font-bold ml-1">← этот</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
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
  const { currentProjectId, currentProject, updateProject } = useProjectContext();
  const {
    reels, snapshots, loading, syncing, stats, instagramUsername, lastSyncAt,
    loadAnalytics, loadProjectConfig, setInstagramUsername, syncReels,
    getReelSnapshots, buildChartData,
  } = useProjectAnalytics(currentProjectId);
  const { stats: responsiblesStats } = useResponsiblesStats(currentProjectId, reels);
  const folderIdsForRefs = (currentProject?.folders ?? []).map(f => f.id);
  const { refs, linkedShortcodes, refetch: refetchRefsForLinking } = useRefsForLinking(currentProjectId, folderIdsForRefs);
  const { updateVideoShortcode, updateVideoResponsible } = useInboxVideos();
  const reelsWithoutRef = reelsWithoutLinkedRef(reels, linkedShortcodes);
  const participants = useParticipantsForResponsibles(currentProjectId, currentProject?.owner_id);
  const rolesTemplate = (currentProject?.responsiblesTemplate ?? [{ id: 'resp-0', label: 'За сценарий' }, { id: 'resp-1', label: 'За монтаж' }]) as { id: string; label: string }[];
  const [linkReelForRefId, setLinkReelForRefId] = useState<string | null>(null);
  const [linkRefForReelShortcode, setLinkRefForReelShortcode] = useState<string | null>(null);
  const [responsiblePickerRefId, setResponsiblePickerRefId] = useState<string | null>(null);

  const { deduct, canAfford } = useTokenBalance();
  const { user } = useAuth();
  const { members: projectMembersList } = useProjectMembers(currentProjectId);
  const isAdminOrOwner = !!user?.id && (
    user.id === currentProject?.owner_id ||
    projectMembersList.some(m => m.user_id === user.id && m.role === 'admin' && m.status === 'active')
  );

  const [subView, setSubView] = useState<SubView>('overview');
  const [period, setPeriod] = useState<Period>('week');
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('grid');
  const [selectedReel, setSelectedReel] = useState<ProjectReel | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showPmPicker, setShowPmPicker] = useState(false);
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

  const countChartData = useMemo(() => {
    const getBucketKey = (date: Date) => {
      if (period === 'day') return date.toISOString().slice(0, 10);
      if (period === 'week') {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().slice(0, 10);
      }
      return date.toISOString().slice(0, 7);
    };
    const bucketMap = new Map<string, { count: number; date: Date }>();
    for (const reel of reels) {
      if (!reel.taken_at) continue;
      const date = new Date(reel.taken_at * 1000);
      const key = getBucketKey(date);
      const existing = bucketMap.get(key);
      bucketMap.set(key, existing
        ? { count: existing.count + 1, date: existing.date }
        : { count: 1, date }
      );
    }
    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ date: new Date(v.date.toISOString().slice(0, 10)), count: v.count }));
  }, [reels, period]);

  // Обрезаем ведущие нули — убираем пустые периоды в начале графика
  const trimmedChartData = useMemo(() => {
    if (!effectiveChartData.length) return effectiveChartData;
    const firstNonZero = effectiveChartData.findIndex(d =>
      ((d as { views?: number }).views || 0) > 0 ||
      ((d as { likes?: number }).likes || 0) > 0 ||
      ((d as { comments?: number }).comments || 0) > 0
    );
    return firstNonZero > 0 ? effectiveChartData.slice(firstNonZero) : effectiveChartData;
  }, [effectiveChartData]);

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
            {subView === 'overview' ? 'Аналитика' : subView === 'reels' ? 'Все ролики' : subView === 'charts' ? 'Графики' : 'Аналитика по команде'}
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
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-10">
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
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-10">
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
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-10">
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
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24">
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
          {selectedReel && <ReelDetailModal key="reel-detail" reel={selectedReel} onClose={() => setSelectedReel(null)} getReelSnapshots={getReelSnapshots} allReels={reels} avgBottom3Views={avgBottom3Views} />}
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
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 space-y-4">
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
            {trimmedChartData.length >= 1 ? (
              <AreaChart data={trimmedChartData} formatXLabel={(d) => formatChartDateLabel(d, period)} aspectRatio="2.2 / 1" margin={{ top: 16, right: 20, bottom: 36, left: 44 }}>
                <Grid horizontal numTicksRows={4} />
                <Area dataKey="views" fill="#f97316" fillOpacity={0.13} stroke="#f97316" strokeWidth={2} fadeEdges />
                <YAxis numTicks={4} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [{ color: '#f97316', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
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
          {/* Likes + Comments combined */}
          {trimmedChartData.length >= 1 && (
            <div className={cn(CARD, "p-4")}>
              <p className="text-[13px] font-semibold text-slate-700 mb-3">Лайки и комментарии</p>
              <AreaChart data={trimmedChartData} formatXLabel={(d) => formatChartDateLabel(d, period)} aspectRatio="2.2 / 1" margin={{ top: 16, right: 20, bottom: 36, left: 44 }}>
                <Grid horizontal numTicksRows={3} />
                <Area dataKey="likes" fill="#881337" fillOpacity={0.12} stroke="#881337" strokeWidth={2} fadeEdges />
                <Area dataKey="comments" fill="#1e3a8a" fillOpacity={0.12} stroke="#1e3a8a" strokeWidth={2} fadeEdges />
                <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [
                  { color: '#881337', label: 'Лайки', value: (p.likes as number) ?? 0 },
                  { color: '#1e3a8a', label: 'Комментарии', value: (p.comments as number) ?? 0 },
                ]} />
              </AreaChart>
            </div>
          )}
          {/* Count of released videos — always by taken_at (release_week logic) */}
          {countChartData.length >= 1 && (
            <div className={cn(CARD, "p-4")}>
              <p className="text-[13px] font-semibold text-slate-700 mb-3">Вышедшие ролики</p>
              <AreaChart data={countChartData} formatXLabel={(d) => formatChartDateLabel(d, period)} aspectRatio="2.2 / 1" margin={{ top: 16, right: 20, bottom: 36, left: 44 }}>
                <Grid horizontal numTicksRows={3} />
                <Area dataKey="count" fill="#18181b" fillOpacity={0.12} stroke="#18181b" strokeWidth={2} fadeEdges />
                <YAxis numTicks={3} formatValue={(v) => String(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [{ color: '#18181b', label: 'Роликов', value: (p.count as number) ?? 0 }]} />
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
    // Группировка по людям: person → список ролей со статистикой
    const byPerson = new Map<string, typeof responsiblesStats>();
    for (const s of responsiblesStats) {
      const list = byPerson.get(s.person) || [];
      list.push(s);
      byPerson.set(s.person, list);
    }
    const persons = [...byPerson.keys()];

    const handleLinkRefToReel = async (refId: string, shortcode: string) => {
      const ok = await updateVideoShortcode(refId, shortcode);
      setLinkReelForRefId(null);
      setLinkRefForReelShortcode(null);
      if (ok) {
        toast.success('Исходник привязан к ролику');
        refetchRefsForLinking();
      } else toast.error('Не удалось привязать');
    };

    const handleSaveResponsible = async (refId: string, items: { templateId: string; value: string }[]) => {
      const ok = await updateVideoResponsible(refId, items);
      if (ok) {
        toast.success('Ответственный обновлён');
        refetchRefsForLinking();
      } else toast.error('Не удалось сохранить');
      return ok;
    };

    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 space-y-4">
          {Header}
          <p className="text-[13px] text-slate-500">
            Сумма просмотров роликов, у которых указан ответственный. Заполняйте логины в карточках видео в ленте.
          </p>

          {/* Проджект-менеджер — получает уведомления о просрочках */}
          <div
            className={cn("p-4 rounded-3xl relative overflow-visible", showPmPicker && "z-[50]")}
            style={{
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 8px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                    boxShadow: '0 4px 12px rgba(71,85,105,0.3)',
                  }}
                >
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-slate-800 tracking-tight">Проджект-менеджер</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">Получает уведомления в Telegram при просрочке</p>
                </div>
              </div>
            </div>
            <div className="mt-3 relative">
              {isAdminOrOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPmPicker(prev => !prev)}
                    onBlur={() => setTimeout(() => setShowPmPicker(false), 150)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all touch-manipulation',
                      currentProject?.project_manager_id
                        ? 'bg-slate-50/80 border border-slate-200/80 text-slate-700 hover:bg-slate-100'
                        : 'bg-white/80 border border-slate-200/80 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                    )}
                  >
                    {currentProject?.project_manager_id ? (
                      <>
                        <div className="w-7 h-7 rounded-full bg-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                          {currentProject.project_manager_id.replace(/^tg-@?/, '').slice(0, 1).toUpperCase()}
                        </div>
                        <span className="flex-1 text-left">@{currentProject.project_manager_id.replace(/^tg-@?/, '')}</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 text-left">Выбрать проджект-менеджера</span>
                      </>
                    )}
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', showPmPicker && 'rotate-180')} />
                  </button>
                  <AnimatePresence>
                    {showPmPicker && (
                      <motion.div
                        className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-card-xl overflow-hidden"
                        style={{
                          background: 'rgba(255,255,255,0.95)',
                          backdropFilter: 'blur(24px) saturate(180%)',
                          border: '1px solid rgba(255,255,255,0.8)',
                          boxShadow: '0 16px 48px rgba(15,23,42,0.15), 0 4px 16px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                        }}
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="p-1 space-y-0.5 max-h-[220px] overflow-y-auto custom-scrollbar-light">
                          {currentProject?.project_manager_id && (
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={async () => {
                                try {
                                  await updateProject(currentProjectId!, { project_manager_id: null as any });
                                  toast.success('Проджект убран');
                                } catch { toast.error('Ошибка'); }
                                setShowPmPicker(false);
                              }}
                              className="w-full text-left flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-xl hover:bg-red-50 text-red-500 transition-colors touch-manipulation"
                            >
                              <X className="w-4 h-4" />
                              <span className="text-xs font-medium">Убрать проджекта</span>
                            </button>
                          )}
                          {participants.map(p => {
                            const pmVal = `tg-${p.replace(/^@/, '')}`;
                            const isSelected = currentProject?.project_manager_id === pmVal;
                            return (
                              <button
                                key={p}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={async () => {
                                  try {
                                    await updateProject(currentProjectId!, { project_manager_id: pmVal });
                                    toast.success('Проджект назначен');
                                  } catch { toast.error('Ошибка'); }
                                  setShowPmPicker(false);
                                }}
                                className={cn(
                                  'w-full text-left flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-xl transition-colors touch-manipulation',
                                  isSelected ? 'bg-slate-100 text-slate-700' : 'hover:bg-slate-100/70 text-slate-700'
                                )}
                              >
                                <div className={cn(
                                  'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                                  isSelected ? 'bg-slate-300 text-slate-600' : 'bg-slate-200/80 text-slate-500'
                                )}>
                                  {p.replace('@', '').slice(0, 1).toUpperCase()}
                                </div>
                                <span className="text-xs truncate">{p}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-slate-500 ml-auto flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {currentProject?.project_manager_id ? (
                    <>
                      <div className="w-7 h-7 rounded-full bg-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                        {currentProject.project_manager_id.replace(/^tg-@?/, '').slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-700">@{currentProject.project_manager_id.replace(/^tg-@?/, '')}</span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">Не назначен</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Прикрепления: все исходники из папок + ролики. Показываем всегда блок, при пустоте — подсказку */}
          <div
            className="p-5 space-y-5 rounded-3xl overflow-hidden mb-4"
            style={{
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 8px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div>
              <p className="text-[17px] font-semibold text-slate-800 tracking-tight">Прикрепления</p>
              <p className="text-[13px] text-slate-500 mt-1">Свяжи исходники с роликами и выбери ответственного — участники берутся из проекта.</p>
            </div>
          {(refs.length > 0 || reelsWithoutRef.length > 0) ? (
            <>
              {refs.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">Исходники в папках</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {refs.map((ref) => {
                      const folderName = ref.folder_id ? (currentProject?.folders?.find(f => f.id === ref.folder_id)?.name ?? null) : null;
                      return (
                        <div
                          key={ref.id}
                          className="rounded-2xl overflow-hidden border transition-shadow hover:shadow-lg"
                          style={{
                            background: 'rgba(255,255,255,0.75)',
                            backdropFilter: 'blur(16px) saturate(150%)',
                            borderColor: 'rgba(255,255,255,0.9)',
                            boxShadow: '0 4px 20px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                          }}
                        >
                          <div className="aspect-[9/16] bg-slate-200 relative">
                            {ref.thumbnail_url ? (
                              <img src={ref.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Film className="w-8 h-8 text-slate-400" />
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="text-[11px] text-slate-600 truncate">{ref.caption?.slice(0, 36) || 'Без названия'}{(ref.caption?.length ?? 0) > 36 ? '…' : ''}</p>
                            {folderName && <p className="text-[10px] text-slate-400 truncate">📁 {folderName}</p>}
                            {linkReelForRefId === ref.id ? (
                              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                <p className="text-[10px] font-medium text-slate-500">Выбери ролик:</p>
                                {reelsWithoutRef.map((r) => (
                                  <button key={r.id} type="button" onClick={() => handleLinkRefToReel(ref.id, r.shortcode)}
                                    className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-white hover:bg-indigo-50 transition-colors touch-manipulation text-left">
                                    {r.thumbnail_url ? (
                                      <img src={r.thumbnail_url} alt="" className="w-8 h-10 rounded object-cover shrink-0" />
                                    ) : (
                                      <div className="w-8 h-10 rounded bg-slate-200 shrink-0 flex items-center justify-center">
                                        <Film className="w-4 h-4 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="text-[11px] text-slate-600 truncate flex-1">{r.caption?.slice(0, 25) || r.shortcode}</span>
                                  </button>
                                ))}
                                <button type="button" onClick={() => setLinkReelForRefId(null)} className="w-full text-center py-1 text-[10px] text-slate-400 hover:text-slate-600">Отмена</button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2 mt-3">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setLinkReelForRefId(ref.id)}
                                    className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold touch-manipulation flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] border border-indigo-200/60"
                                    style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca' }}
                                  >
                                    <Link2 className="w-4 h-4" /> Привязать
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResponsiblePickerRefId(ref.id)}
                                    className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold touch-manipulation flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] border border-slate-300/80 bg-slate-700 text-white shadow-sm hover:bg-slate-600"
                                  >
                                    <UserPlus className="w-4 h-4" /> Ответственный
                                  </button>
                                </div>
                                {ref.responsibles?.length ? (
                                  <p className="text-[10px] text-slate-500">
                                    {ref.responsibles.map(r => r.value).join(', ')}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {reelsWithoutRef.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">Ролики без исходника</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {reelsWithoutRef.map((reel) => (
                      <div
                        key={reel.id}
                        className="rounded-2xl overflow-hidden border transition-shadow hover:shadow-lg"
                        style={{
                          background: 'rgba(255,255,255,0.75)',
                          backdropFilter: 'blur(16px) saturate(150%)',
                          borderColor: 'rgba(255,255,255,0.9)',
                          boxShadow: '0 4px 20px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                        }}
                      >
                        <div className="aspect-[9/16] bg-slate-200 relative">
                          {reel.thumbnail_url ? (
                            <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Film className="w-8 h-8 text-slate-400" />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] text-slate-600 truncate">{reel.caption?.slice(0, 36) || reel.shortcode}{(reel.caption?.length ?? 0) > 36 ? '…' : ''}</p>
                          {linkRefForReelShortcode === reel.shortcode ? (
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                              <p className="text-[10px] font-medium text-slate-500">Выбери исходник:</p>
                              {refs.map((r) => {
                                const folderName = r.folder_id ? (currentProject?.folders?.find(f => f.id === r.folder_id)?.name ?? null) : null;
                                return (
                                  <button key={r.id} type="button" onClick={() => handleLinkRefToReel(r.id, reel.shortcode)}
                                    className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-white hover:bg-indigo-50 transition-colors touch-manipulation text-left">
                                    {r.thumbnail_url ? (
                                      <img src={r.thumbnail_url} alt="" className="w-8 h-10 rounded object-cover shrink-0" />
                                    ) : (
                                      <div className="w-8 h-10 rounded bg-slate-200 shrink-0 flex items-center justify-center">
                                        <Film className="w-4 h-4 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="text-[11px] text-slate-600 truncate flex-1">{r.caption?.slice(0, 25) || 'Исходник'}</span>
                                    {folderName && <span className="text-[9px] text-slate-400">📁</span>}
                                  </button>
                                );
                              })}
                              <button type="button" onClick={() => setLinkRefForReelShortcode(null)} className="w-full text-center py-1 text-[10px] text-slate-400 hover:text-slate-600">Отмена</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setLinkRefForReelShortcode(reel.shortcode)}
                              className="mt-2 w-full py-2.5 rounded-xl text-[12px] font-semibold touch-manipulation flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                              style={{ background: 'rgba(99,102,241,0.15)', color: '#4f46e5' }}
                            >
                              <Link2 className="w-4 h-4" /> Привязать
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center rounded-2xl" style={{
              background: 'rgba(241,245,249,0.6)',
              border: '1px dashed rgba(148,163,184,0.5)',
            }}>
              <Film className="w-14 h-14 text-slate-300 mx-auto mb-4" strokeWidth={1.2} />
              <p className="text-[16px] font-semibold text-slate-700">Нет видео в папках</p>
              <p className="text-[14px] text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                Добавь видео в папки в ленте — перетащи ролик в папку или выбери папку в карточке видео.
              </p>
              <p className="text-[12px] text-slate-400 mt-2">Убедись, что выбран нужный проект.</p>
            </div>
          )}
          </div>

          {responsiblePickerRefId && (() => {
            const ref = refs.find(r => r.id === responsiblePickerRefId);
            if (!ref) return null;
            return (
              <ResponsiblePickerModal
                key="responsible-picker"
                isOpen
                onClose={() => setResponsiblePickerRefId(null)}
                refId={ref.id}
                refCaption={ref.caption ?? undefined}
                roles={rolesTemplate}
                participants={participants}
                currentResponsibles={ref.responsibles ?? []}
                onSave={(items) => handleSaveResponsible(ref.id, items)}
              />
            );
          })()}

          {persons.length === 0 ? (
            <div className={cn(CARD, 'p-8 text-center')}>
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-[15px] font-medium text-slate-600">Нет данных по команде</p>
              <p className="text-[13px] text-slate-400 mt-1">
                Укажи ответственных в карточках видео — здесь появится статистика по каждому
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {persons.map(person => {
                const personStats = byPerson.get(person)!;
                const totalAssigned = personStats.reduce((s, r) => s + r.assignedCount, 0);
                const totalLinked = personStats.reduce((s, r) => s + r.linksFilledCount, 0);
                const totalViews = personStats.reduce((s, r) => s + r.views, 0);
                const initials = person.replace('@', '').slice(0, 2).toUpperCase();
                return (
                  <div key={person} className={cn(CARD, 'p-4')}>
                    {/* Имя + суммарные просмотры */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-slate-800 truncate">{person}</p>
                        <p className="text-[11px] text-slate-400">{totalAssigned} видео в работе</p>
                      </div>
                      {totalViews > 0 && (
                        <span className="text-[15px] font-bold text-slate-900 tabular-nums">{fmt(totalViews)}</span>
                      )}
                    </div>
                    {/* Строки по ролям */}
                    <div className="space-y-1.5">
                      {personStats.map((s, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-50">
                          <span className="text-[12px] text-slate-500 font-medium">{s.role}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[12px] text-slate-600">
                              <span className="font-semibold text-indigo-600">{s.assignedCount}</span> назначен
                            </span>
                            {s.linksFilledCount > 0 && (
                              <span className="text-[12px] text-slate-600">
                                <span className="font-semibold text-emerald-600">{s.linksFilledCount}</span> ссылок
                              </span>
                            )}
                            {s.reelsCount > 0 && (
                              <span className="text-[12px] text-slate-400">{s.reelsCount} опубл.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Итоговые бейджи */}
                    {totalLinked > 0 && (
                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
                          ✓ {totalLinked} ссылок заполнено
                        </span>
                        {totalLinked < totalAssigned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-700">
                            ⏳ {totalAssigned - totalLinked} без ссылки
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-10">
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
           * │  (rows 1-4)  ├──────────────────┼──────────┤  row 3
           * │              │  Лучший недели   │ Вчера    │
           * │              ├──────────────────┴──────────┤  row 4
           * │              │  Проджект                   │
           * └──────────────┴─────────────────────────────┘
           * cols: 5fr  7fr  4fr
           */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: '5fr 7fr 4fr', gridTemplateRows: 'auto auto auto auto' }}
          >
            {/* ── LEFT HERO: кубок + сумма просмотров за месяц ─────────────── */}
            <div
              style={{ gridRow: '1 / 5' }}
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

            {/* ── ROW 4: Проджект-менеджер ──────────────────────────────────── */}
            <motion.div
              className={cn(CARD, "p-3 relative overflow-visible", showPmPicker && "z-[50]")}
              style={{ gridColumn: '2 / 4' }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                      boxShadow: '0 2px 8px rgba(71,85,105,0.3)',
                    }}
                  >
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700">Проджект</p>
                    <p className="text-[9px] text-slate-400">Уведомления о просрочках</p>
                  </div>
                </div>

                {/* Кнопка / текущий выбор */}
                <div className="relative">
                  {isAdminOrOwner ? (
                    <button
                      type="button"
                      onClick={() => setShowPmPicker(prev => !prev)}
                      onBlur={() => setTimeout(() => setShowPmPicker(false), 150)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all touch-manipulation',
                        currentProject?.project_manager_id
                          ? 'bg-slate-50 border border-slate-200/80 text-slate-700 hover:bg-slate-100'
                          : 'bg-white/80 border border-slate-200/80 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                      )}
                    >
                      {currentProject?.project_manager_id ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-slate-200/80 flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0">
                            {currentProject.project_manager_id.replace(/^tg-@?/, '').slice(0, 1).toUpperCase()}
                          </div>
                          <span>@{currentProject.project_manager_id.replace(/^tg-@?/, '')}</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Выбрать</span>
                        </>
                      )}
                      <ChevronDown className={cn('w-3 h-3 text-slate-400 transition-transform', showPmPicker && 'rotate-180')} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      {currentProject?.project_manager_id ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-slate-200/80 flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0">
                            {currentProject.project_manager_id.replace(/^tg-@?/, '').slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-slate-700">@{currentProject.project_manager_id.replace(/^tg-@?/, '')}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Не назначен</span>
                      )}
                    </div>
                  )}

                  {/* Glass dropdown */}
                  <AnimatePresence>
                    {showPmPicker && isAdminOrOwner && (
                      <motion.div
                        className="absolute right-0 top-full mt-1 z-[200] min-w-[200px] rounded-card-xl overflow-hidden"
                        style={{
                          background: 'rgba(255,255,255,0.95)',
                          backdropFilter: 'blur(24px) saturate(180%)',
                          border: '1px solid rgba(255,255,255,0.8)',
                          boxShadow: '0 16px 48px rgba(15,23,42,0.15), 0 4px 16px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                        }}
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="p-1 space-y-0.5 max-h-[220px] overflow-y-auto custom-scrollbar-light">
                          {/* Убрать проджекта */}
                          {currentProject?.project_manager_id && (
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={async () => {
                                try {
                                  await updateProject(currentProjectId!, { project_manager_id: null as any });
                                  toast.success('Проджект убран');
                                } catch { toast.error('Ошибка'); }
                                setShowPmPicker(false);
                              }}
                              className="w-full text-left flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-xl hover:bg-red-50 text-red-500 transition-colors touch-manipulation"
                            >
                              <X className="w-4 h-4" />
                              <span className="text-xs font-medium">Убрать проджекта</span>
                            </button>
                          )}
                          {participants.map(p => {
                            const pmVal = `tg-${p.replace(/^@/, '')}`;
                            const isSelected = currentProject?.project_manager_id === pmVal;
                            return (
                              <button
                                key={p}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={async () => {
                                  try {
                                    await updateProject(currentProjectId!, { project_manager_id: pmVal });
                                    toast.success('Проджект назначен');
                                  } catch { toast.error('Ошибка'); }
                                  setShowPmPicker(false);
                                }}
                                className={cn(
                                  'w-full text-left flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-xl transition-colors touch-manipulation',
                                  isSelected ? 'bg-slate-100 text-slate-700' : 'hover:bg-slate-100/70 text-slate-700'
                                )}
                              >
                                <div className={cn(
                                  'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                                  isSelected ? 'bg-slate-300 text-slate-600' : 'bg-slate-200/80 text-slate-500'
                                )}>
                                  {p.replace('@', '').slice(0, 1).toUpperCase()}
                                </div>
                                <span className="text-xs truncate">{p}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-slate-500 ml-auto flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
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
        {selectedReel && <ReelDetailModal key="reel-detail" reel={selectedReel} onClose={() => setSelectedReel(null)} getReelSnapshots={getReelSnapshots} allReels={reels} avgBottom3Views={avgBottom3Views} />}
      </AnimatePresence>
    </div>
  );
}
