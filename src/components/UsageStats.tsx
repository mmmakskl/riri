import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import {
  Activity, TrendingUp, Zap, Globe, RefreshCw,
  BarChart2, Users, Calendar
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface UsageRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  api_name: string;
  action: string;
  calls_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ApiSummary {
  api_name: string;
  total_calls: number;
  total_requests: number;
}

interface ActionSummary {
  action: string;
  api_name: string;
  total_calls: number;
  total_requests: number;
}

interface UserSummary {
  user_id: string;
  total_calls: number;
  total_requests: number;
}

interface DaySummary {
  date: string;
  rapidapi: number;
  assemblyai: number;
  openrouter: number;
  total: number;
}

type Period = '7d' | '30d' | '90d' | 'all';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const API_COLORS: Record<string, string> = {
  rapidapi: '#f97316',
  assemblyai: '#8b5cf6',
  openrouter: '#0ea5e9',
};

const API_LABELS: Record<string, string> = {
  rapidapi: 'RapidAPI (Instagram)',
  assemblyai: 'AssemblyAI',
  openrouter: 'OpenRouter (AI)',
};

const ACTION_LABELS: Record<string, string> = {
  'reel-info': 'Инфо о рилсе',
  'user-reels': 'Рилсы пользователя',
  'search': 'Поиск',
  'hashtag': 'Поиск по хэштегу',
  'download': 'Скачивание',
  'transcribe': 'Транскрипция',
  'transcribe-carousel': 'Транскрипция карусели',
  'translate': 'Перевод',
  'script-analyze': 'Анализ стиля',
  'script-generate': 'Генерация сценария',
  'script-refine': 'Улучшение сценария',
  'script-refine-diff': 'Рефайн по правкам',
  'script-chat': 'Чат с AI',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function UsageStats() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30d');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'usage-stats', userId: user?.telegram_username, period }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'table_not_found') {
          throw new Error('Таблица не создана. Запусти create_api_usage_log.sql в Supabase SQL Editor');
        }
        throw new Error(json.error || 'Ошибка загрузки данных');
      }
      setRows(json.rows || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [period, user?.telegram_username]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed stats ───────────────────────────────────────────────────────

  const apiSummary: ApiSummary[] = (() => {
    const map: Record<string, ApiSummary> = {};
    for (const r of rows) {
      if (!map[r.api_name]) map[r.api_name] = { api_name: r.api_name, total_calls: 0, total_requests: 0 };
      map[r.api_name].total_calls += 1;
      map[r.api_name].total_requests += r.calls_count;
    }
    return Object.values(map).sort((a, b) => b.total_requests - a.total_requests);
  })();

  const actionSummary: ActionSummary[] = (() => {
    const map: Record<string, ActionSummary> = {};
    for (const r of rows) {
      const key = `${r.api_name}::${r.action}`;
      if (!map[key]) map[key] = { action: r.action, api_name: r.api_name, total_calls: 0, total_requests: 0 };
      map[key].total_calls += 1;
      map[key].total_requests += r.calls_count;
    }
    return Object.values(map).sort((a, b) => b.total_requests - a.total_requests);
  })();

  const userSummary: UserSummary[] = (() => {
    const map: Record<string, UserSummary> = {};
    for (const r of rows) {
      const uid = r.user_id || '(неизвестен)';
      if (!map[uid]) map[uid] = { user_id: uid, total_calls: 0, total_requests: 0 };
      map[uid].total_calls += 1;
      map[uid].total_requests += r.calls_count;
    }
    return Object.values(map).sort((a, b) => b.total_requests - a.total_requests).slice(0, 10);
  })();

  const dailyChart: DaySummary[] = (() => {
    const map: Record<string, DaySummary> = {};
    for (const r of rows) {
      const date = r.created_at.slice(0, 10);
      if (!map[date]) map[date] = { date, rapidapi: 0, assemblyai: 0, openrouter: 0, total: 0 };
      const n = r.calls_count;
      map[date][r.api_name as keyof Omit<DaySummary, 'date' | 'total'>] += n;
      map[date].total += n;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  })();

  const totalRequests = rows.reduce((s, r) => s + r.calls_count, 0);
  const totalCalls = rows.length;
  const maxDay = dailyChart.length > 0 ? Math.max(...dailyChart.map(d => d.total)) : 1;

  const PERIODS: { id: Period; label: string }[] = [
    { id: '7d', label: '7 дней' },
    { id: '30d', label: '30 дней' },
    { id: '90d', label: '90 дней' },
    { id: 'all', label: 'Всё время' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Статистика API</h1>
          <p className="text-sm text-slate-500 mt-0.5">Использование внешних API по всем пользователям</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                  period === p.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-all"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm">
          {error}
          {error.includes('permission') || error.includes('policy') ? (
            <p className="mt-1 text-xs text-red-500">
              Запусти SQL миграцию <code>create_api_usage_log.sql</code> в Supabase SQL Editor
            </p>
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-3" />
          <span>Загрузка данных...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Activity className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">Данных пока нет</p>
          <p className="text-sm text-slate-400 mt-1">
            Логи появятся после первых запросов к API
          </p>
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<Zap className="w-4 h-4" />}
              label="Всего запросов к API"
              value={fmt(totalRequests)}
              color="orange"
            />
            <KpiCard
              icon={<Activity className="w-4 h-4" />}
              label="Вызовов функций"
              value={fmt(totalCalls)}
              color="blue"
            />
            <KpiCard
              icon={<Calendar className="w-4 h-4" />}
              label="Дней активности"
              value={String(dailyChart.length)}
              color="purple"
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="В день (среднее)"
              value={dailyChart.length > 0 ? fmt(Math.round(totalRequests / dailyChart.length)) : '0'}
              color="green"
            />
          </div>

          {/* Daily chart */}
          {dailyChart.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-slate-400" />
                Запросы по дням
              </h2>
              <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
                {dailyChart.map(d => (
                  <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-[18px] group relative">
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {d.date.slice(5)}: {d.total}
                    </div>
                    <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                      {(['openrouter', 'assemblyai', 'rapidapi'] as const).map(api => {
                        const val = d[api];
                        const h = maxDay > 0 ? Math.max(2, (val / maxDay) * 88) : 0;
                        return val > 0 ? (
                          <div
                            key={api}
                            style={{ height: `${h}px`, backgroundColor: API_COLORS[api] }}
                            className="w-full rounded-sm opacity-80"
                          />
                        ) : null;
                      })}
                    </div>
                    <span className="text-[9px] text-slate-400 leading-none">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex gap-4 mt-3 flex-wrap">
                {Object.entries(API_COLORS).map(([api, color]) => (
                  <div key={api} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs text-slate-500">{API_LABELS[api] || api}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* By API */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                По сервисам
              </h2>
              <div className="space-y-2">
                {apiSummary.map(s => (
                  <ApiBar
                    key={s.api_name}
                    label={API_LABELS[s.api_name] || s.api_name}
                    requests={s.total_requests}
                    calls={s.total_calls}
                    color={API_COLORS[s.api_name] || '#94a3b8'}
                    max={apiSummary[0]?.total_requests || 1}
                  />
                ))}
              </div>
            </div>

            {/* By action */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-slate-400" />
                По действиям
              </h2>
              <div className="space-y-2">
                {actionSummary.slice(0, 10).map(s => (
                  <ApiBar
                    key={`${s.api_name}::${s.action}`}
                    label={ACTION_LABELS[s.action] || s.action}
                    sublabel={API_LABELS[s.api_name] || s.api_name}
                    requests={s.total_requests}
                    calls={s.total_calls}
                    color={API_COLORS[s.api_name] || '#94a3b8'}
                    max={actionSummary[0]?.total_requests || 1}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* By user */}
          {userSummary.some(u => u.user_id !== '(неизвестен)') && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                По пользователям
              </h2>
              <div className="space-y-2">
                {userSummary.map(u => (
                  <ApiBar
                    key={u.user_id}
                    label={u.user_id === '(неизвестен)' ? '(без user_id — авто-запросы)' : `@${u.user_id}`}
                    requests={u.total_requests}
                    calls={u.total_calls}
                    color="#64748b"
                    max={userSummary[0]?.total_requests || 1}
                  />
                ))}
              </div>
              {userSummary.some(u => u.user_id === '(неизвестен)') && (
                <p className="text-xs text-slate-400 mt-3">
                  * Авто-запросы — обновление превью и синхронизации без явного действия пользователя
                </p>
              )}
            </div>
          )}

          {/* Recent log */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Последние вызовы
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-2 font-medium">Время</th>
                    <th className="text-left pb-2 font-medium">API</th>
                    <th className="text-left pb-2 font-medium">Действие</th>
                    <th className="text-left pb-2 font-medium">Кол-во</th>
                    <th className="text-left pb-2 font-medium">Пользователь</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                          style={{ backgroundColor: API_COLORS[r.api_name] || '#94a3b8' }}
                        >
                          {r.api_name}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">{ACTION_LABELS[r.action] || r.action}</td>
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{r.calls_count}</td>
                      <td className="py-1.5 text-slate-400">{r.user_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'orange' | 'blue' | 'purple' | 'green' }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-500',
    blue: 'bg-blue-50 text-blue-500',
    purple: 'bg-purple-50 text-purple-500',
    green: 'bg-emerald-50 text-emerald-500',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
    >
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2', colors[color])}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</div>
    </motion.div>
  );
}

function ApiBar({ label, sublabel, requests, calls, color, max }: {
  label: string;
  sublabel?: string;
  requests: number;
  calls: number;
  color: string;
  max: number;
}) {
  const pct = max > 0 ? (requests / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-slate-700 truncate block">{label}</span>
          {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span className="text-xs text-slate-400">{calls} вызовов</span>
          <span className="text-xs font-semibold text-slate-700 w-10 text-right">{fmt(requests)}</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
