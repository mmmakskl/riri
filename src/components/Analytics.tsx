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
  LayoutGrid, List, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month';
type ChartMode = 'cumulative' | 'release_week';
type SortBy = 'date' | 'views' | 'likes' | 'comments';
type ViewLayout = 'grid' | 'list';

// ─── Grey Sphere (same vibe as AIScriptwriter) ───────────────────────────────

function GreySphere({ size = 56 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, #e2e8f0, #94a3b8 40%, #64748b 75%, #475569)`,
        boxShadow: `0 ${size * 0.1}px ${size * 0.35}px rgba(71,85,105,0.28), inset 0 ${size * 0.04}px ${size * 0.12}px rgba(255,255,255,0.5)`,
      }}
    />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'slate' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-500',
    indigo: 'bg-indigo-50 text-indigo-500',
    emerald: 'bg-emerald-50 text-emerald-500',
    amber: 'bg-amber-50 text-amber-500',
    rose: 'bg-rose-50 text-rose-500',
  };

  return (
    <motion.div
      className="bg-white/75 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/70 rounded-2xl p-4 shadow-glass"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', colorMap[color] || colorMap.slate)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
          <p className="text-xl font-semibold text-slate-800 tracking-tight mt-0.5">
            {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
          </p>
          {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Period Selector ──────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: { id: Period; label: string }[] = [
    { id: 'day', label: 'Дни' },
    { id: 'week', label: 'Недели' },
    { id: 'month', label: 'Месяцы' },
  ];
  return (
    <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            value === o.id
              ? 'bg-white text-slate-800 shadow-glass-sm'
              : 'text-slate-500 hover:text-slate-700'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Chart Mode Toggle ────────────────────────────────────────────────────────

function ChartModeToggle({ value, onChange }: { value: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
      <button
        onClick={() => onChange('cumulative')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
          value === 'cumulative' ? 'bg-white text-slate-800 shadow-glass-sm' : 'text-slate-500 hover:text-slate-700'
        )}
      >
        Накопительно
      </button>
      <button
        onClick={() => onChange('release_week')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
          value === 'release_week' ? 'bg-white text-slate-800 shadow-glass-sm' : 'text-slate-500 hover:text-slate-700'
        )}
      >
        По выпуску
      </button>
    </div>
  );
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

function SyncModal({ onSync, onClose, syncing }: {
  onSync: (count: SyncCount) => void;
  onClose: () => void;
  syncing: boolean;
}) {
  const { balance, canAfford } = useTokenBalance();

  const options: { count: SyncCount; tokenAction: 'analytics_sync_12' | 'analytics_sync_24' | 'analytics_sync_36' }[] = [
    { count: 12, tokenAction: 'analytics_sync_12' },
    { count: 24, tokenAction: 'analytics_sync_24' },
    { count: 36, tokenAction: 'analytics_sync_36' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative w-full max-w-sm mx-0 md:mx-4 safe-bottom"
        initial={{ opacity: 0, y: 56 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 56 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      >
        {/* iOS-style handle */}
        <div className="flex justify-center pb-2 md:hidden">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>

        <div className="bg-white/80 backdrop-blur-[32px] backdrop-saturate-[200%] border border-white/70 rounded-t-[28px] md:rounded-[28px] shadow-float overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-start justify-between">
            <div>
              <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Обновить аналитику</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">Баланс: {balance} монет</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 transition-colors touch-manipulation -mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Options */}
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
                    'border shadow-glass-sm active:scale-[0.98]',
                    affordable
                      ? 'bg-white/70 border-white/80 hover:bg-white/90 hover:shadow-glass'
                      : 'bg-slate-50/50 border-slate-100 opacity-50 cursor-not-allowed',
                    syncing && 'opacity-60 cursor-not-allowed'
                  )}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
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

function ReelCard({ reel, onClick, layout }: { reel: ProjectReel; onClick: () => void; layout: ViewLayout }) {
  const takenAt = reel.taken_at ? new Date(reel.taken_at * 1000) : null;
  const views = reel.latest_view_count ?? 0;
  const likes = reel.latest_like_count ?? 0;
  const comments = reel.latest_comment_count ?? 0;

  if (layout === 'list') {
    return (
      <motion.button
        onClick={onClick}
        className="w-full flex items-center gap-4 p-3 bg-white/70 backdrop-blur-sm border border-white/70 rounded-2xl shadow-glass-sm hover:shadow-glass hover:bg-white/90 transition-all text-left"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="relative w-14 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
          {reel.thumbnail_url ? (
            <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-5 h-5 text-slate-300" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <Play className="absolute bottom-1.5 right-1.5 w-3 h-3 text-white fill-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-1">
            {takenAt ? takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}
          </p>
          <p className="text-sm text-slate-700 line-clamp-2 leading-snug">
            {reel.caption || 'Без подписи'}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Eye className="w-3 h-3" /> {views >= 1000 ? `${(views / 1000).toFixed(1)}k` : views}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Heart className="w-3 h-3" /> {likes >= 1000 ? `${(likes / 1000).toFixed(1)}k` : likes}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <MessageCircle className="w-3 h-3" /> {comments}
            </span>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      className="relative group aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 shadow-glass-sm hover:shadow-glass transition-all"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.97 }}
    >
      {reel.thumbnail_url ? (
        <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Film className="w-8 h-8 text-slate-300" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-2 text-white/90 text-xs font-medium">
          <Eye className="w-3 h-3" />
          <span>{views >= 1000 ? `${(views / 1000).toFixed(1)}k` : views}</span>
        </div>
        {takenAt && (
          <p className="text-white/60 text-xs mt-0.5">
            {takenAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
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
    if (!reel.video_url) {
      toast.error('Нет ссылки на видео для транскрибации');
      return;
    }
    setTranscribing(true);
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: reel.video_url, type: 'reel' }),
      });
      const data = await res.json();
      if (data.transcript || data.text) {
        setTranscript(data.transcript || data.text);
        toast.success('Транскрибация готова');
      } else {
        toast.error('Не удалось транскрибировать');
      }
    } catch {
      toast.error('Ошибка транскрибации');
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative w-full max-w-lg mx-0 md:mx-4 max-h-[90vh] flex flex-col bg-white/92 backdrop-blur-[28px] backdrop-saturate-[180%] rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/60 safe-bottom overflow-hidden"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-14 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
              {reel.thumbnail_url ? (
                <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Film className="w-5 h-5 text-slate-300 m-auto mt-4" />
              )}
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Eye className="w-3.5 h-3.5" />, label: 'Просмотры', value: latestSnap?.view_count ?? 0, delta: viewsDelta, color: 'indigo' },
              { icon: <Heart className="w-3.5 h-3.5" />, label: 'Лайки', value: latestSnap?.like_count ?? 0, color: 'rose' },
              { icon: <MessageCircle className="w-3.5 h-3.5" />, label: 'Комментарии', value: latestSnap?.comment_count ?? 0, color: 'emerald' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={cn('w-6 h-6 rounded-lg mx-auto mb-1.5 flex items-center justify-center', {
                  'bg-indigo-50 text-indigo-500': s.color === 'indigo',
                  'bg-rose-50 text-rose-500': s.color === 'rose',
                  'bg-emerald-50 text-emerald-500': s.color === 'emerald',
                })}>
                  {s.icon}
                </div>
                <p className="text-base font-semibold text-slate-800">
                  {s.value >= 1000 ? `${(s.value / 1000).toFixed(1)}k` : s.value}
                </p>
                {s.delta !== null && s.delta !== undefined && (
                  <p className={cn('text-xs font-medium flex items-center justify-center gap-0.5', {
                    'text-emerald-500': s.delta > 0,
                    'text-rose-500': s.delta < 0,
                    'text-slate-400': s.delta === 0,
                  })}>
                    {s.delta > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : s.delta < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                    {Math.abs(s.delta) >= 1000 ? `${(Math.abs(s.delta) / 1000).toFixed(1)}k` : Math.abs(s.delta)}
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
                <AreaChart
                  data={chartData}
                  aspectRatio="3 / 1"
                  margin={{ top: 20, right: 20, bottom: 30, left: 40 }}
                >
                  <Grid horizontal numTicksRows={3} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.2} stroke="#6366f1" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={3} formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <XAxis numTicks={Math.min(chartData.length, 4)} />
                  <ChartTooltip
                    rows={(p) => [
                      { color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 },
                    ]}
                  />
                </AreaChart>
              </div>
              <p className="text-xs text-slate-400 mt-1 text-center">
                {reelSnaps.length} снимков данных
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <BarChart2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Нужно минимум 2 обновления</p>
              <p className="text-xs text-slate-400">для отображения динамики</p>
            </div>
          )}

          {/* Caption */}
          {reel.caption && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Подпись</p>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3">
                {reel.caption}
              </p>
            </div>
          )}

          {/* Transcription */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Транскрибация</p>
              <button
                onClick={handleTranscribe}
                disabled={transcribing || !reel.video_url}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all touch-manipulation',
                  'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
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
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 cursor-not-allowed"
            >
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
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative w-full max-w-sm mx-0 md:mx-4 safe-bottom"
        initial={{ opacity: 0, y: 56 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 56 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      >
        {/* iOS-style handle */}
        <div className="flex justify-center pb-2 md:hidden">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>

        <div className="bg-white/80 backdrop-blur-[32px] backdrop-saturate-[200%] border border-white/70 rounded-t-[28px] md:rounded-[28px] shadow-float overflow-hidden">
          {/* Header */}
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
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 transition-colors touch-manipulation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Input */}
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-center gap-0 bg-slate-100/70 rounded-2xl border border-slate-200/60 overflow-hidden focus-within:ring-2 focus-within:ring-slate-300/50 focus-within:border-slate-300/60 transition-all">
              <span className="pl-4 pr-1 text-[15px] font-semibold text-slate-400 select-none">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/^@/, '').trim().toLowerCase())}
                placeholder="your_instagram"
                className="flex-1 px-3 py-4 bg-transparent outline-none text-slate-900 font-medium text-[15px] placeholder:text-slate-400"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
              />
            </div>

            <motion.button
              onClick={() => { if (username) onSave(username); }}
              disabled={!username}
              className={cn(
                'w-full py-4 rounded-2xl font-semibold text-[15px] transition-all touch-manipulation',
                'bg-slate-900 text-white shadow-glass active:scale-[0.98]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'hover:bg-slate-800'
              )}
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
    reels,
    loading,
    syncing,
    stats,
    instagramUsername,
    lastSyncAt,
    loadAnalytics,
    loadProjectConfig,
    setInstagramUsername,
    syncReels,
    getReelSnapshots,
    buildChartData,
  } = useProjectAnalytics(currentProjectId);

  const { deduct, canAfford } = useTokenBalance();

  const [period, setPeriod] = useState<Period>('week');
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('grid');
  const [selectedReel, setSelectedReel] = useState<ProjectReel | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const isValidProject = currentProjectId
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentProjectId)
    : false;

  useEffect(() => {
    if (currentProjectId) {
      loadProjectConfig();
      loadAnalytics();
    }
  }, [currentProjectId, loadProjectConfig, loadAnalytics]);

  const handleSaveUsername = useCallback(async (username: string) => {
    const ok = await setInstagramUsername(username);
    if (ok !== false) {
      setShowSetupModal(false);
      setShowSyncModal(true);
    }
  }, [setInstagramUsername]);

  const handleSync = useCallback(async (count: SyncCount) => {
    if (!instagramUsername) return;
    const tokenAction = count === 12 ? 'analytics_sync_12' : count === 24 ? 'analytics_sync_24' : 'analytics_sync_36';
    const cost = getTokenCost(tokenAction);
    if (!canAfford(cost)) {
      toast.error(`Недостаточно монет. Нужно ${cost} монет`);
      return;
    }
    setShowSyncModal(false);
    await deduct(cost);
    await syncReels(instagramUsername, count);
  }, [instagramUsername, syncReels, deduct, canAfford]);

  // Chart data
  const chartData = useMemo(() => buildChartData(period, chartMode), [buildChartData, period, chartMode]);

  // Sorted reels
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
    const d = new Date(dt);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} мин назад`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#fafafa]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <GreySphere size={52} />
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Аналитика</h1>
              {instagramUsername ? (
                <button
                  onClick={() => setShowSetupModal(true)}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1.5 mt-0.5"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  @{instagramUsername}
                </button>
              ) : (
                <p className="text-sm text-slate-400 mt-0.5">Аккаунт не подключён</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {lastSyncAt && (
              <span className="text-xs text-slate-400 hidden md:block">
                {formatLastSync(lastSyncAt)}
              </span>
            )}
            <button
              onClick={() => hasAccount ? setShowSyncModal(true) : setShowSetupModal(true)}
              disabled={syncing}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all touch-manipulation',
                'bg-slate-800 text-white hover:bg-slate-700 active:scale-95 shadow-glass',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
              <span>{syncing ? 'Загрузка…' : 'Обновить'}</span>
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        )}

        {/* Invalid project (temp local ID — not yet saved to DB) */}
        {!loading && !isValidProject && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-700">Проект не сохранён</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">
              Обновите страницу — проект должен синхронизироваться с сервером
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Обновить страницу
            </button>
          </div>
        )}

        {/* No account */}
        {!loading && isValidProject && !hasAccount && <EmptyState onSetup={() => setShowSetupModal(true)} />}

        {/* Has account, no data */}
        {!loading && isValidProject && hasAccount && !hasData && (
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

        {/* Main content with data */}
        {!loading && isValidProject && hasData && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Film className="w-4 h-4" />}
                label="Роликов в базе"
                value={stats?.totalReels || 0}
                sub="всего загружено"
                color="slate"
              />
              <StatCard
                icon={<Eye className="w-4 h-4" />}
                label="Ср. просмотры"
                value={stats?.avgViewsLast30Days || 0}
                sub="за 30 дней"
                color="indigo"
              />
              <StatCard
                icon={<Award className="w-4 h-4" />}
                label="Лучший рилс недели"
                value={stats?.bestReelWeek
                  ? `${((stats.bestReelWeek.latest_view_count || 0) / 1000).toFixed(1)}k`
                  : '—'}
                sub={stats?.bestReelWeek?.caption?.slice(0, 20) || 'нет данных'}
                color="amber"
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Лучший рилс месяца"
                value={stats?.bestReelMonth
                  ? `${((stats.bestReelMonth.latest_view_count || 0) / 1000).toFixed(1)}k`
                  : '—'}
                sub={stats?.bestReelMonth?.caption?.slice(0, 20) || 'нет данных'}
                color="emerald"
              />
            </div>

            {/* Charts */}
            <div className="bg-white/75 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/70 rounded-2xl shadow-glass p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-700">Просмотры</p>
                <div className="flex gap-2 flex-wrap">
                  <ChartModeToggle value={chartMode} onChange={setChartMode} />
                  <PeriodSelector value={period} onChange={setPeriod} />
                </div>
              </div>

              {chartData.length >= 2 ? (
                <AreaChart
                  data={chartData}
                  aspectRatio="2.5 / 1"
                  margin={{ top: 20, right: 20, bottom: 36, left: 44 }}
                >
                  <Grid horizontal numTicksRows={4} />
                  <Area dataKey="views" fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={4} formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <XAxis numTicks={5} />
                  <ChartTooltip
                    rows={(p) => [
                      { color: '#6366f1', label: 'Просмотры', value: (p.views as number) ?? 0 },
                    ]}
                  />
                </AreaChart>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-8 h-8 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">Недостаточно данных для графика</p>
                  <p className="text-xs text-slate-400 mt-0.5">Нужно минимум 2 обновления</p>
                </div>
              )}
            </div>

            {/* Comments/Likes chart */}
            {chartData.length >= 2 && (
              <div className="bg-white/75 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/70 rounded-2xl shadow-glass p-4">
                <p className="text-sm font-semibold text-slate-700 mb-4">Лайки и комментарии</p>
                <AreaChart
                  data={chartData}
                  aspectRatio="2.5 / 1"
                  margin={{ top: 20, right: 20, bottom: 36, left: 44 }}
                >
                  <Grid horizontal numTicksRows={3} />
                  <Area dataKey="likes" fill="#f43f5e" fillOpacity={0.12} stroke="#f43f5e" strokeWidth={2} fadeEdges />
                  <Area dataKey="comments" fill="#10b981" fillOpacity={0.12} stroke="#10b981" strokeWidth={2} fadeEdges />
                  <YAxis numTicks={3} formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <XAxis numTicks={5} />
                  <ChartTooltip
                    rows={(p) => [
                      { color: '#f43f5e', label: 'Лайки', value: (p.likes as number) ?? 0 },
                      { color: '#10b981', label: 'Комментарии', value: (p.comments as number) ?? 0 },
                    ]}
                  />
                </AreaChart>
              </div>
            )}

            {/* Reels grid */}
            <div>
              {/* Controls */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-700">
                  Все ролики ({reels.length})
                </p>
                <div className="flex items-center gap-2">
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortBy)}
                    className="text-xs text-slate-600 bg-slate-100 border-none rounded-xl px-3 py-1.5 outline-none cursor-pointer"
                  >
                    <option value="date">По дате</option>
                    <option value="views">По просмотрам</option>
                    <option value="likes">По лайкам</option>
                    <option value="comments">По комментариям</option>
                  </select>
                  {/* Layout toggle */}
                  <div className="flex gap-0.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setViewLayout('grid')}
                      className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'grid' ? 'bg-white shadow-glass-sm' : 'text-slate-400')}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewLayout('list')}
                      className={cn('p-1.5 rounded-lg transition-all', viewLayout === 'list' ? 'bg-white shadow-glass-sm' : 'text-slate-400')}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Reels */}
              {viewLayout === 'grid' ? (
                <div className="grid grid-cols-3 gap-2.5">
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
          <SetupModal
            key="setup"
            initial={instagramUsername || ''}
            onSave={handleSaveUsername}
            onClose={() => setShowSetupModal(false)}
          />
        )}
        {showSyncModal && (
          <SyncModal
            key="sync"
            onSync={handleSync}
            onClose={() => setShowSyncModal(false)}
            syncing={syncing}
          />
        )}
        {selectedReel && (
          <ReelDetailModal
            key="reel-detail"
            reel={selectedReel}
            onClose={() => setSelectedReel(null)}
            getReelSnapshots={getReelSnapshots}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
