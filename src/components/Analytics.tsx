import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '../contexts/ProjectContext';
import { useProjectAnalytics, type ProjectReel, type SyncCount } from '../hooks/useProjectAnalytics';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { CoinBadge } from './ui/CoinBadge';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from './ui/area-chart';
import { cn } from '../utils/cn';
import {
  BarChart2, RefreshCw, Instagram, Eye, Heart, MessageCircle,
  TrendingUp, Award, Film, X,
  ArrowUpRight, ArrowDownRight, Minus, Mic, Sparkles,
  LayoutGrid, List, AlertCircle, Clock, ChevronRight, ChevronLeft,
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

// ─── Bento Cards ──────────────────────────────────────────────────────────────

const CARD = "bg-white/80 backdrop-blur-[24px] border border-white/70 rounded-3xl shadow-[0_2px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]";

/** Маленькая стат-карточка: label сверху, большое число снизу */
function StatCell({ icon, label, value, sub, accent = '#64748b' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <motion.div
      className={cn(CARD, "p-4 flex flex-col justify-between")}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span style={{ color: accent }}>{icon}</span>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      </div>
      <div>
        <p className="text-[26px] font-bold text-slate-900 tracking-tight leading-none tabular-nums">
          {typeof value === 'number' ? fmt(value) : value}
        </p>
        {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}

/** Большая карточка «лучший рилс» — занимает всю высоту левой колонки */
function HeroReelCell({ icon, label, reel, accent, onClick }: {
  icon: React.ReactNode; label: string; reel: ProjectReel; accent: string; onClick: () => void;
}) {
  const takenAt = reel.taken_at
    ? new Date(reel.taken_at * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null;
  return (
    <motion.button
      onClick={onClick}
      className={cn(CARD, "relative overflow-hidden text-left w-full h-full flex flex-col active:scale-[0.97]")}
      style={{ minHeight: 260 }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Full thumbnail background */}
      <div className="absolute inset-0">
        {reel.thumbnail_url ? (
          <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-200 flex items-center justify-center">
            <Film className="w-10 h-10 text-slate-300" />
          </div>
        )}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to top, rgba(9,11,18,0.90) 0%, rgba(20,24,34,0.55) 45%, rgba(32,36,44,0.15) 75%, transparent 100%)',
        }} />
      </div>

      {/* Top label badge */}
      <div className="relative p-3.5 flex-shrink-0">
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white border border-white/20 backdrop-blur-sm"
          style={{ background: accent + 'cc' }}
        >
          {icon}{label}
        </span>
      </div>

      {/* Bottom info */}
      <div className="relative mt-auto p-3.5">
        <p className="text-[28px] font-bold text-white leading-none tracking-tight tabular-nums mb-1">
          {fmt(reel.latest_view_count ?? 0)}
        </p>
        <p className="text-[11px] text-white/60 mb-1.5">просмотров</p>
        <p className="text-[12px] text-white/80 line-clamp-2 leading-snug">
          {reel.caption || 'Без подписи'}
        </p>
        {takenAt && <p className="text-[10px] text-white/40 mt-1">{takenAt}</p>}
      </div>
    </motion.button>
  );
}

/** Компактная карточка «лучший рилс» — маленький формат для правой колонки */
function CompactReelCell({ icon, label, reel, accent, onClick }: {
  icon: React.ReactNode; label: string; reel: ProjectReel; accent: string; onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(CARD, "p-3 text-left flex items-center gap-3 active:scale-[0.97] transition-transform w-full")}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Mini thumbnail */}
      <div className="relative w-10 h-[56px] rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
        {reel.thumbnail_url ? (
          <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : <Film className="w-4 h-4 text-slate-300 m-auto mt-4" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span style={{ color: accent }} className="flex-shrink-0">{icon}</span>
          <p className="text-[9px] font-bold uppercase tracking-wider truncate" style={{ color: accent }}>{label}</p>
        </div>
        <p className="text-[15px] font-bold text-slate-900 leading-none tabular-nums">
          {fmt(reel.latest_view_count ?? 0)}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{reel.caption || 'Без подписи'}</p>
      </div>
    </motion.button>
  );
}

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
        Накопл.
      </button>
      <button onClick={() => onChange('release_week')}
        className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          value === 'release_week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
        По выпуску
      </button>
    </div>
  );
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

const MIN_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 час

function SyncModal({ onSync, onClose, syncing, lastSyncAt }: {
  onSync: (count: SyncCount) => void;
  onClose: () => void;
  syncing: boolean;
  lastSyncAt: string | null;
}) {
  const { balance, canAfford } = useTokenBalance();

  const msSinceLast = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : Infinity;
  const cooldownLeft = Math.max(0, MIN_SYNC_INTERVAL_MS - msSinceLast);
  const cooldownMins = Math.ceil(cooldownLeft / 60000);
  const isCooling = cooldownLeft > 0;

  const options: { count: SyncCount; tokenAction: 'analytics_sync_12' | 'analytics_sync_24' | 'analytics_sync_36' }[] = [
    { count: 12, tokenAction: 'analytics_sync_12' },
    { count: 24, tokenAction: 'analytics_sync_24' },
    { count: 36, tokenAction: 'analytics_sync_36' },
  ];

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

          {/* Cooldown warning */}
          {isCooling && (
            <div className="mx-4 mb-3 flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-50/80 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-[12px] text-amber-700">
                Следующее обновление доступно через <b>{cooldownMins} мин</b>.
                Для лучшего графика обновляй не чаще раза в час.
              </p>
            </div>
          )}

          <div className="px-4 pb-6 space-y-2.5">
            {options.map((o, i) => {
              const cost = getTokenCost(o.tokenAction);
              const affordable = canAfford(cost);
              return (
                <motion.button
                  key={o.count}
                  onClick={() => onSync(o.count)}
                  disabled={syncing || !affordable}
                  className={cn(
                    'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all touch-manipulation',
                    'border shadow-sm active:scale-[0.98]',
                    affordable
                      ? 'bg-white/70 border-white/80 hover:bg-white/90 hover:shadow-md'
                      : 'bg-slate-50/50 border-slate-100 opacity-50 cursor-not-allowed',
                    syncing && 'opacity-60 cursor-not-allowed'
                  )}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 28 }}
                  whileTap={affordable && !syncing ? { scale: 0.97 } : {}}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">{o.count}</span>
                    <span className="text-[13px] font-medium text-slate-500">роликов</span>
                  </div>
                  {syncing ? (
                    <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : (
                    <CoinBadge coins={cost} size="sm" />
                  )}
                </motion.button>
              );
            })}
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="relative w-full max-w-lg mx-0 md:mx-4 max-h-[90vh] flex flex-col bg-white/92 backdrop-blur-[28px] backdrop-saturate-[180%] rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/60 safe-bottom overflow-hidden"
        initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-14 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
              {reel.thumbnail_url ? (
                <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : <Film className="w-5 h-5 text-slate-300 m-auto mt-4" />}
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm line-clamp-1">
                {reel.caption ? reel.caption.slice(0, 40) + (reel.caption.length > 40 ? '…' : '') : 'Без подписи'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {takenAt ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Eye className="w-3.5 h-3.5" />, label: 'Просмотры', value: latestSnap?.view_count ?? 0, delta: viewsDelta, color: 'indigo' },
              { icon: <Heart className="w-3.5 h-3.5" />, label: 'Лайки', value: latestSnap?.like_count ?? 0, color: 'rose' },
              { icon: <MessageCircle className="w-3.5 h-3.5" />, label: 'Комменты', value: latestSnap?.comment_count ?? 0, color: 'emerald' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={cn('w-6 h-6 rounded-lg mx-auto mb-1.5 flex items-center justify-center', {
                  'bg-indigo-50 text-indigo-500': s.color === 'indigo',
                  'bg-rose-50 text-rose-500': s.color === 'rose',
                  'bg-emerald-50 text-emerald-500': s.color === 'emerald',
                })}>{s.icon}</div>
                <p className="text-base font-semibold text-slate-800">{fmt(s.value)}</p>
                {s.delta !== null && s.delta !== undefined && (
                  <p className={cn('text-xs font-medium flex items-center justify-center gap-0.5', {
                    'text-emerald-500': s.delta > 0, 'text-rose-500': s.delta < 0, 'text-slate-400': s.delta === 0,
                  })}>
                    {s.delta > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : s.delta < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                    {fmt(Math.abs(s.delta))}
                  </p>
                )}
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Views chart */}
          {chartData.length >= 2 ? (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Динамика просмотров</p>
              <div className="bg-slate-50 rounded-2xl p-3">
                <AreaChart data={chartData} aspectRatio="3 / 1" margin={{ top: 20, right: 20, bottom: 30, left: 40 }}>
                  <Grid horizontal numTicksRows={3} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.2} stroke="#6366f1" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                  <XAxis numTicks={Math.min(chartData.length, 4)} />
                  <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
                </AreaChart>
              </div>
              <p className="text-xs text-slate-400 mt-1 text-center">{reelSnaps.length} снимков данных</p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <BarChart2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Нужно минимум 2 обновления</p>
              <p className="text-xs text-slate-400">для отображения динамики</p>
            </div>
          )}

          {reel.caption && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Подпись</p>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3">{reel.caption}</p>
            </div>
          )}

          {/* Transcription */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Транскрибация</p>
              <button
                onClick={handleTranscribe} disabled={transcribing || !reel.video_url}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all touch-manipulation"
              >
                {transcribing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                {transcribing ? 'Транскрибирую…' : 'Транскрибировать'}
              </button>
            </div>
            {transcript ? (
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar-light">
                {transcript}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Нажмите кнопку чтобы транскрибировать аудио ролика</p>
            )}
          </div>

          {/* Analyze (disabled) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">AI-анализ</p>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">Скоро</span>
            </div>
            <button disabled className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 cursor-not-allowed">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">Анализировать ролик</span>
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
        Укажите Instagram-аккаунт проекта, и мы будем отслеживать все ваши рилсы
      </p>
      <button
        onClick={onSetup}
        className="mt-6 flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 text-white font-medium text-sm shadow-glass hover:bg-slate-700 active:scale-95 transition-all touch-manipulation"
      >
        <Instagram className="w-4 h-4" />
        Подключить аккаунт
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
                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Instagram аккаунт</h3>
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

type SubView = 'overview' | 'reels' | 'charts';

export function Analytics() {
  const { currentProjectId } = useProjectContext();
  const {
    reels, loading, syncing, stats, instagramUsername, lastSyncAt,
    loadAnalytics, loadProjectConfig, setInstagramUsername, syncReels,
    getReelSnapshots, buildChartData,
  } = useProjectAnalytics(currentProjectId);

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
    const tokenAction = count === 12 ? 'analytics_sync_12' : count === 24 ? 'analytics_sync_24' : 'analytics_sync_36';
    const cost = getTokenCost(tokenAction);
    if (!canAfford(cost)) { toast.error(`Недостаточно монет. Нужно ${cost} монет`); return; }
    setShowSyncModal(false);
    await deduct(cost);
    await syncReels(instagramUsername, count);
  }, [instagramUsername, syncReels, deduct, canAfford]);

  const chartData = useMemo(() => buildChartData(period, chartMode), [buildChartData, period, chartMode]);

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
            {subView === 'overview' ? 'Аналитика' : subView === 'reels' ? 'Все ролики' : 'Графики'}
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
            <p className="text-[13px] font-semibold text-slate-700 mb-3">Просмотры</p>
            {chartData.length >= 2 ? (
              <AreaChart data={chartData} aspectRatio="2.2 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 44 }}>
                <Grid horizontal numTicksRows={4} />
                <Area dataKey="views" fill="#6366f1" fillOpacity={0.13} stroke="#6366f1" strokeWidth={2} fadeEdges />
                <YAxis numTicks={4} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={5} />
                <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
              </AreaChart>
            ) : (
              <div className="h-36 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">Нужно минимум 2 обновления</p>
              </div>
            )}
          </div>
          {/* Likes + Comments */}
          {chartData.length >= 2 && (
            <div className={cn(CARD, "p-4")}>
              <p className="text-[13px] font-semibold text-slate-700 mb-3">Лайки и комментарии</p>
              <AreaChart data={chartData} aspectRatio="2.2 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 44 }}>
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
  // ── OVERVIEW — Bento Dashboard ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const previewReels = sortedReels.slice(0, 4);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0f0f5]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
        {Header}

        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
        >
          {/*
           * Асимметричный бенто-грид:
           *
           *  [ Hero reel (лучший месяца) ]  [ Роликов        ]
           *  [ — tall, spans 3 rows     ]  [ Ср. просм/ролик ]
           *                                 [ Лучший недели   ]
           *
           * cols: 3fr  2fr
           */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: '3fr 2fr', gridTemplateRows: 'auto auto auto' }}
          >
            {/* LEFT: Hero — лучший рилс месяца, занимает 3 строки */}
            {stats?.bestReelMonth ? (
              <div style={{ gridRow: '1 / 4' }}>
                <HeroReelCell
                  icon={<TrendingUp className="w-3 h-3" />}
                  label="Лучший месяца"
                  reel={stats.bestReelMonth}
                  accent="#10b981"
                  onClick={() => setSelectedReel(stats.bestReelMonth!)}
                />
              </div>
            ) : (
              <div style={{ gridRow: '1 / 4' }} className={cn(CARD, "flex items-center justify-center min-h-[260px]")}>
                <TrendingUp className="w-8 h-8 text-slate-200" />
              </div>
            )}

            {/* RIGHT col: 3 карточки разной высоты */}
            {/* R1: Роликов в базе */}
            <StatCell
              icon={<Film className="w-3.5 h-3.5" />}
              label="Роликов"
              value={stats?.totalReels || 0}
              sub="в базе"
              accent="#64748b"
            />
            {/* R2: Ср. просм./ролик */}
            <StatCell
              icon={<Eye className="w-3.5 h-3.5" />}
              label="Ср. просм./ролик"
              value={stats?.avgViewsLast30Days || 0}
              sub="за 30 дней"
              accent="#6366f1"
            />
            {/* R3: Лучший рилс недели — компактная карточка */}
            {stats?.bestReelWeek ? (
              <CompactReelCell
                icon={<Award className="w-3 h-3" />}
                label="Лучший недели"
                reel={stats.bestReelWeek}
                accent="#f59e0b"
                onClick={() => setSelectedReel(stats.bestReelWeek!)}
              />
            ) : (
              <div className={cn(CARD, "flex items-center justify-center p-3")}>
                <Award className="w-5 h-5 text-slate-200" />
              </div>
            )}
          </div>

          {/* Row 3: Charts card — clickable tile */}
          <motion.button
            onClick={() => setSubView('charts')}
            className={cn(CARD, "w-full p-4 text-left active:scale-[0.98] transition-transform")}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-slate-700">Просмотры</p>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="text-[11px]">Открыть</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
            {chartData.length >= 2 ? (
              <AreaChart data={chartData} aspectRatio="3 / 1" margin={{ top: 10, right: 10, bottom: 24, left: 36 }}>
                <Grid horizontal numTicksRows={3} />
                <Area dataKey="views" fill="#6366f1" fillOpacity={0.12} stroke="#6366f1" strokeWidth={2} fadeEdges />
                <YAxis numTicks={3} formatValue={(v) => fmt(v as number)} />
                <XAxis numTicks={4} />
                <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
              </AreaChart>
            ) : (
              <div className="h-24 flex items-center justify-center text-center">
                <p className="text-sm text-slate-400">Нужно минимум 2 обновления</p>
              </div>
            )}
          </motion.button>

          {/* Row 4: Reels preview card — clickable tile */}
          <motion.button
            onClick={() => setSubView('reels')}
            className={cn(CARD, "w-full p-4 text-left active:scale-[0.98] transition-transform")}
            whileTap={{ scale: 0.98 }}
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
                {previewReels.map(reel => {
                  const takenAt = reel.taken_at
                    ? new Date(reel.taken_at * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                    : undefined;
                  return (
                    <div key={reel.id} className="relative rounded-xl overflow-hidden bg-slate-100" style={{ aspectRatio: '9/16' }}>
                      {reel.thumbnail_url
                        ? <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Film className="w-4 h-4 text-slate-300" /></div>
                      }
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      {takenAt && (
                        <p className="absolute bottom-1 left-0 right-0 text-center text-white/80 text-[8px] font-medium">{takenAt}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Нет роликов</p>
            )}
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
