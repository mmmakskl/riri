import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '../contexts/ProjectContext';
import { useProjectAnalytics, type ProjectReel, type SyncCount } from '../hooks/useProjectAnalytics';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { CoinBadge } from './ui/CoinBadge';
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from './ui/area-chart';
import { cn } from '../utils/cn';
import {
  BarChart2, RefreshCw, Instagram, Eye, Heart, MessageCircle,
  TrendingUp, Award, Film, X,
  ArrowUpRight, ArrowDownRight, Minus, Play, Mic, Sparkles,
  LayoutGrid, List, AlertCircle, Clock,
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

// ─── Bento Stat Cards ─────────────────────────────────────────────────────────

/** Маленькая карточка для 2-колоночного ряда */
function StatCell({ icon, label, value, sub, accent = '#64748b' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <motion.div
      className="bg-white/78 backdrop-blur-[20px] border border-white/65 rounded-2xl p-4 flex flex-col gap-1 shadow-[0_4px_24px_rgba(15,23,42,0.07)]"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color: accent }} className="opacity-75">{icon}</span>
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
      </div>
      <p className="text-[28px] font-bold text-slate-800 tracking-tight leading-none tabular-nums">
        {typeof value === 'number' ? fmt(value) : value}
      </p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>}
    </motion.div>
  );
}

/** Широкая карточка (полная ширина) с подсветкой */
function FeatureCell({ icon, label, value, sub, caption, accent = '#64748b', children }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; caption?: string; accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      className="bg-white/78 backdrop-blur-[20px] border border-white/65 rounded-2xl p-4 shadow-[0_4px_24px_rgba(15,23,42,0.07)]"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span style={{ color: accent }} className="opacity-75">{icon}</span>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
          </div>
          <p className="text-[32px] font-bold text-slate-800 tracking-tight leading-none tabular-nums">
            {typeof value === 'number' ? fmt(value) : value}
          </p>
          {sub && <p className="text-[12px] text-slate-400 mt-1">{sub}</p>}
          {caption && <p className="text-[12px] text-slate-600 mt-0.5 line-clamp-1">{caption}</p>}
        </div>
        {children}
      </div>
    </motion.div>
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

// ─── Reel Card — стиль как VideoGradientCard ──────────────────────────────────

function ReelCard({ reel, onClick, layout }: { reel: ProjectReel; onClick: () => void; layout: ViewLayout }) {
  const takenAt = reel.taken_at ? new Date(reel.taken_at * 1000) : null;
  const views = reel.latest_view_count ?? 0;
  const likes = reel.latest_like_count ?? 0;
  const comments = reel.latest_comment_count ?? 0;
  const dateLabel = takenAt
    ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : null;

  if (layout === 'list') {
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
          <Play className="absolute bottom-1.5 right-1 w-2.5 h-2.5 text-white fill-white" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 mb-0.5">{dateLabel || '—'}</p>
          <p className="text-[13px] text-slate-700 line-clamp-2 leading-snug font-medium">
            {reel.caption || 'Без подписи'}
          </p>
          {/* Glass pill stats */}
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

  // Grid card — стиль VideoGradientCard
  return (
    <motion.button
      onClick={onClick}
      className="relative group rounded-2xl overflow-hidden bg-slate-200"
      style={{
        aspectRatio: '9/16',
        boxShadow: '0 10px 28px -6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02 }} whileTap={{ scale: 0.97 }}
      transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {reel.thumbnail_url ? (
        <img src={reel.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Film className="w-8 h-8 text-slate-300" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(9,11,18,0.90) 0%, rgba(20,24,34,0.50) 35%, rgba(32,36,44,0.12) 60%, transparent 100%)',
      }} />
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 to-transparent" />

      {/* Date top-left */}
      {dateLabel && (
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-black/36 text-white/90 border border-white/20 backdrop-blur-sm">
            {dateLabel}
          </span>
        </div>
      )}

      {/* Bottom stats */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col gap-1.5">
        {/* View/like/comment pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-black/36 text-white/90 border border-white/20 backdrop-blur-sm">
            <Eye className="w-2 h-2" />{fmt(views)}
          </span>
          {likes > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-black/36 text-white/90 border border-white/20 backdrop-blur-sm">
              <Heart className="w-2 h-2" />{fmt(likes)}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-black/36 text-white/90 border border-white/20 backdrop-blur-sm">
              <MessageCircle className="w-2 h-2" />{fmt(comments)}
            </span>
          )}
        </div>
        {/* Caption */}
        {reel.caption && (
          <p className="text-white/70 text-[9px] leading-tight line-clamp-1">
            {reel.caption}
          </p>
        )}
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

export function Analytics() {
  const { currentProjectId } = useProjectContext();
  const {
    reels, loading, syncing, stats, instagramUsername, lastSyncAt,
    loadAnalytics, loadProjectConfig, setInstagramUsername, syncReels,
    getReelSnapshots, buildChartData,
  } = useProjectAnalytics(currentProjectId);

  const { deduct, canAfford } = useTokenBalance();

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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f5f5f7]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <GreySphere size={48} />
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Аналитика</h1>
              {instagramUsername ? (
                <button onClick={() => setShowSetupModal(true)}
                  className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 mt-0.5">
                  <Instagram className="w-3 h-3" />@{instagramUsername}
                </button>
              ) : (
                <p className="text-[12px] text-slate-400 mt-0.5">Аккаунт не подключён</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastSyncAt && (
              <span className="text-[11px] text-slate-400 hidden md:block">{formatLastSync(lastSyncAt)}</span>
            )}
            <button
              onClick={() => hasAccount ? setShowSyncModal(true) : setShowSetupModal(true)}
              disabled={syncing}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all touch-manipulation',
                'bg-slate-900 text-white hover:bg-slate-700 active:scale-95 shadow-[0_4px_16px_rgba(15,23,42,0.2)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
              <span className="hidden sm:inline">{syncing ? 'Загрузка…' : 'Обновить'}</span>
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-200/70 rounded-2xl animate-pulse" />)}
            </div>
            <div className="h-52 bg-slate-200/70 rounded-2xl animate-pulse" />
          </div>
        )}

        {/* No account */}
        {!loading && !hasAccount && <EmptyState onSetup={() => setShowSetupModal(true)} />}

        {/* Has account, no data */}
        {!loading && hasAccount && !hasData && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <BarChart2 className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700">Нет данных</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">
              Нажмите «Обновить» чтобы загрузить рилсы @{instagramUsername}
            </p>
          </div>
        )}

        {/* ── Main content ── */}
        {!loading && hasData && (
          <>
            {/* ─── Bento stats grid ─── */}
            {/* Row 1: 2 колонки */}
            <div className="grid grid-cols-2 gap-3">
              <StatCell
                icon={<Film className="w-3.5 h-3.5" />}
                label="Роликов"
                value={stats?.totalReels || 0}
                sub="в базе"
                accent="#64748b"
              />
              <StatCell
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Ср. просм./ролик"
                value={stats?.avgViewsLast30Days || 0}
                sub="за 30 дней"
                accent="#6366f1"
              />
            </div>

            {/* Row 2: Лучший рилс недели — полная ширина */}
            {stats?.bestReelWeek && (
              <FeatureCell
                icon={<Award className="w-3.5 h-3.5" />}
                label="Лучший рилс недели"
                value={stats.bestReelWeek.latest_view_count || 0}
                sub="просмотров"
                caption={stats.bestReelWeek.caption?.slice(0, 50) || undefined}
                accent="#f59e0b"
              >
                {stats.bestReelWeek.thumbnail_url && (
                  <div
                    className="w-12 h-[68px] rounded-xl overflow-hidden flex-shrink-0 cursor-pointer shadow-sm"
                    onClick={() => stats.bestReelWeek && setSelectedReel(stats.bestReelWeek)}
                  >
                    <img src={stats.bestReelWeek.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </FeatureCell>
            )}

            {/* Row 3: Лучший рилс месяца — полная ширина */}
            {stats?.bestReelMonth && (
              <FeatureCell
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                label="Лучший рилс месяца"
                value={stats.bestReelMonth.latest_view_count || 0}
                sub="просмотров"
                caption={stats.bestReelMonth.caption?.slice(0, 50) || undefined}
                accent="#10b981"
              >
                {stats.bestReelMonth.thumbnail_url && (
                  <div
                    className="w-12 h-[68px] rounded-xl overflow-hidden flex-shrink-0 cursor-pointer shadow-sm"
                    onClick={() => stats.bestReelMonth && setSelectedReel(stats.bestReelMonth)}
                  >
                    <img src={stats.bestReelMonth.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </FeatureCell>
            )}

            {/* ─── Views chart ─── */}
            <div className="bg-white/78 backdrop-blur-[20px] border border-white/65 rounded-2xl shadow-[0_4px_24px_rgba(15,23,42,0.07)] p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-[13px] font-semibold text-slate-700">Просмотры</p>
                <div className="flex gap-2 flex-wrap">
                  <ChartModeToggle value={chartMode} onChange={setChartMode} />
                  <PeriodSelector value={period} onChange={setPeriod} />
                </div>
              </div>
              {chartData.length >= 2 ? (
                <AreaChart data={chartData} aspectRatio="2.5 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 44 }}>
                  <Grid horizontal numTicksRows={4} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.12} stroke="#6366f1" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={4} formatValue={(v) => fmt(v as number)} />
                  <XAxis numTicks={5} />
                  <ChartTooltip rows={(p) => [{ color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 }]} />
                </AreaChart>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-8 h-8 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">Недостаточно данных</p>
                  <p className="text-xs text-slate-400 mt-0.5">Нужно минимум 2 обновления</p>
                </div>
              )}
            </div>

            {/* ─── Likes & Comments chart ─── */}
            {chartData.length >= 2 && (
              <div className="bg-white/78 backdrop-blur-[20px] border border-white/65 rounded-2xl shadow-[0_4px_24px_rgba(15,23,42,0.07)] p-4">
                <p className="text-[13px] font-semibold text-slate-700 mb-3">Лайки и комментарии</p>
                <AreaChart data={chartData} aspectRatio="2.5 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 44 }}>
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

            {/* ─── Reels grid ─── */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-[13px] font-semibold text-slate-700">
                  Все ролики <span className="text-slate-400 font-normal">({reels.length})</span>
                </p>
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
                    <button
                      onClick={() => setViewLayout('grid')}
                      className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600')}
                    ><LayoutGrid className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={() => setViewLayout('list')}
                      className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600')}
                    ><List className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>

              {viewLayout === 'grid' ? (
                <div className="grid grid-cols-3 gap-2">
                  {sortedReels.map(reel => (
                    <ReelCard key={reel.id} reel={reel} onClick={() => setSelectedReel(reel)} layout="grid" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedReels.map(reel => (
                    <ReelCard key={reel.id} reel={reel} onClick={() => setSelectedReel(reel)} layout="list" />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showSetupModal && (
          <SetupModal key="setup" initial={instagramUsername || ''} onSave={handleSaveUsername} onClose={() => setShowSetupModal(false)} />
        )}
        {showSyncModal && (
          <SyncModal key="sync" onSync={handleSync} onClose={() => setShowSyncModal(false)} syncing={syncing} lastSyncAt={lastSyncAt} />
        )}
        {selectedReel && (
          <ReelDetailModal key="reel-detail" reel={selectedReel} onClose={() => setSelectedReel(null)} getReelSnapshots={getReelSnapshots} />
        )}
      </AnimatePresence>
    </div>
  );
}
