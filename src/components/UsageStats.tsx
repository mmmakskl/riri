import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import {
  Activity, TrendingUp, Zap, Globe, RefreshCw,
  BarChart2, Users, Calendar, Coins, Clock, ChevronDown, ChevronUp,
  ChevronRight, Layers
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

/** Раздел → действие → пользователь → { calls, requests } */
interface SectionActionUserRow {
  section: string;
  action: string;
  user_id: string;
  calls: number;
  requests: number;
}

interface DaySummary {
  date: string;
  rapidapi: number;
  assemblyai: number;
  openrouter: number;
  total: number;
}

type Period = '7d' | '30d' | '90d' | 'all';

interface UserTokenStat {
  id: string;
  username: string;
  token_balance: number;
  last_active: string | null;
  spent_week: number;
  spent_month: number;
  spent_total_90d: number;
  actions_count: number;
}

interface ActionStat { tokens: number; count: number; label: string; section: string | null; }
interface UserSpendStat { total: number; week: number; month: number; byAction: Record<string, ActionStat>; }
interface DailyTokenStat { date: string; tokens: number; count: number; }
interface TokenSpendData {
  totalTokens: number;
  rowCount: number;
  byUser: Record<string, UserSpendStat>;
  byAction: Record<string, ActionStat>;
  bySection: Record<string, { tokens: number; count: number }>;
  daily: DailyTokenStat[];
  tableExists: boolean;
}

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
  'user-reels': 'Рилсы пользователя (аналитика/радар)',
  'search': 'Поиск',
  'hashtag': 'Поиск по хэштегу',
  'download': 'Скачивание видео',
  'transcribe': 'Транскрипция видео',
  'transcribe-carousel': 'Транскрипция карусели',
  'translate': 'Перевод',
  'script-analyze': 'Анализ стиля',
  'script-generate': 'Генерация сценария',
  'script-refine': 'Улучшение сценария',
  'script-refine-diff': 'Рефайн по правкам',
  'script-chat': 'Чат с AI',
  'scriptwriter-quick-generate': 'Быстрая генерация',
  'scriptwriter-clarify-topic': 'Уточнение темы',
  'scriptwriter-generate-hooks': 'Генерация хуков',
  'scriptwriter-generate-body': 'Генерация тела',
  'scriptwriter-assemble-script': 'Сборка сценария',
  'scriptwriter-improve-script': 'Улучшение',
  'scriptwriter-refine': 'Рефайн',
  'scriptwriter-analyze-structure': 'Анализ структуры',
};

/** Источник вызова (кнопка в разделе) — передаётся с фронта в metadata.source */
const SOURCE_LABELS: Record<string, string> = {
  search: 'Поиск',
  lenta: 'Лента',
  radar: 'Радар',
  analytics: 'Аналитика',
  carousel: 'Карусели',
  scriptwriter: 'AI-сценарист',
};

/** Раздел по action, если source не передан (старые записи) */
const ACTION_TO_SECTION: Record<string, string> = {
  'user-reels': 'Аналитика / Радар',
  'reel-info': 'Лента / Поиск / Карусели',
  'search': 'Поиск',
  'hashtag': 'Поиск',
  'download': 'Лента',
  'transcribe': 'Лента',
  'transcribe-carousel': 'Карусели',
  'translate': 'Лента',
  'script-analyze': 'AI-сценарист',
  'script-generate': 'AI-сценарист',
  'script-refine': 'AI-сценарист',
  'script-refine-diff': 'AI-сценарист',
  'script-chat': 'AI-сценарист',
  'scriptwriter-quick-generate': 'AI-сценарист',
  'scriptwriter-clarify-topic': 'AI-сценарист',
  'scriptwriter-generate-hooks': 'AI-сценарист',
  'scriptwriter-generate-body': 'AI-сценарист',
  'scriptwriter-assemble-script': 'AI-сценарист',
  'scriptwriter-improve-script': 'AI-сценарист',
  'scriptwriter-refine': 'AI-сценарист',
  'scriptwriter-analyze-structure': 'AI-сценарист',
};

function getSection(row: UsageRow): string {
  const src = (row.metadata as { source?: string } | null)?.source;
  if (src && SOURCE_LABELS[src]) return SOURCE_LABELS[src];
  return ACTION_TO_SECTION[row.action] || 'Другое';
}

function getActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith('scriptwriter-')) {
    const sub = action.replace('scriptwriter-', '').replace(/-/g, ' ');
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  }
  return action;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UsageStats() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30d');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenStats, setTokenStats] = useState<UserTokenStat[]>([]);
  const [tokenStatsLoading, setTokenStatsLoading] = useState(false);
  const [showTokenStats, setShowTokenStats] = useState(false);
  const [tokenSortKey, setTokenSortKey] = useState<'token_balance' | 'spent_month' | 'spent_week' | 'last_active'>('spent_month');

  // Детальная аналитика токенов
  const [tokenSpend, setTokenSpend] = useState<TokenSpendData | null>(null);
  const [tokenSpendLoading, setTokenSpendLoading] = useState(false);
  const [showTokenSpend, setShowTokenSpend] = useState(false);
  const [spendPeriod, setSpendPeriod] = useState<Period>('30d');
  const [expandedSpendUser, setExpandedSpendUser] = useState<string | null>(null);

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

  const fetchTokenStats = useCallback(async () => {
    setTokenStatsLoading(true);
    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'user-token-stats', userId: user?.telegram_username }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setTokenStats(json.users || []);
      }
    } catch (e) {
      console.error('Error fetching token stats:', e);
    } finally {
      setTokenStatsLoading(false);
    }
  }, [user?.telegram_username]);

  const fetchTokenSpend = useCallback(async () => {
    setTokenSpendLoading(true);
    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'token-spend-details', userId: user?.telegram_username, period: spendPeriod }),
      });
      const json = await res.json();
      if (res.ok && json.success) setTokenSpend(json);
    } catch (e) {
      console.error('Error fetching token spend:', e);
    } finally {
      setTokenSpendLoading(false);
    }
  }, [user?.telegram_username, spendPeriod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (showTokenStats && tokenStats.length === 0) {
      fetchTokenStats();
    }
  }, [showTokenStats, fetchTokenStats, tokenStats.length]);

  useEffect(() => {
    if (showTokenSpend) fetchTokenSpend();
  }, [showTokenSpend, fetchTokenSpend]);

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
    return Object.values(map).sort((a, b) => b.total_requests - a.total_requests);
  })();

  /** Полная разбивка: раздел → кнопка → пользователь */
  const sectionActionUser: SectionActionUserRow[] = (() => {
    const map = new Map<string, SectionActionUserRow>();
    for (const r of rows) {
      const section = getSection(r);
      const uid = r.user_id || '(неизвестен)';
      const key = `${section}::${r.action}::${uid}`;
      const cur = map.get(key);
      if (cur) {
        cur.calls += 1;
        cur.requests += r.calls_count;
      } else {
        map.set(key, { section, action: r.action, user_id: uid, calls: 1, requests: r.calls_count });
      }
    }
    return [...map.values()].sort((a, b) => b.requests - a.requests);
  })();

  /** Группировка по разделам: section -> actions -> users */
  const bySection = (() => {
    const sections = new Map<string, Map<string, Map<string, { calls: number; requests: number }>>>();
    for (const r of sectionActionUser) {
      if (!sections.has(r.section)) sections.set(r.section, new Map());
      const actions = sections.get(r.section)!;
      if (!actions.has(r.action)) actions.set(r.action, new Map());
      const users = actions.get(r.action)!;
      const cur = users.get(r.user_id) || { calls: 0, requests: 0 };
      users.set(r.user_id, { calls: cur.calls + r.calls, requests: cur.requests + r.requests });
    }
    return sections;
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
                По кнопкам (действиям)
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {actionSummary.map(s => (
                  <ApiBar
                    key={`${s.api_name}::${s.action}`}
                    label={getActionLabel(s.action)}
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

          {/* По разделам → кнопки → пользователи */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              По разделам, кнопкам и пользователям
            </h2>
            <div className="space-y-6">
              {[...bySection.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([section, actions]) => (
                <div key={section}>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{section}</h3>
                  <div className="space-y-3 pl-2 border-l-2 border-slate-100">
                    {[...actions.entries()].sort((a, b) => {
                      const sumA = [...a[1].values()].reduce((s, u) => s + u.requests, 0);
                      const sumB = [...b[1].values()].reduce((s, u) => s + u.requests, 0);
                      return sumB - sumA;
                    }).map(([action, users]) => {
                      const totalRequests = [...users.values()].reduce((s, u) => s + u.requests, 0);
                      const totalCalls = [...users.values()].reduce((s, u) => s + u.calls, 0);
                      return (
                        <div key={action}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-700">{getActionLabel(action)}</span>
                            <span className="text-xs text-slate-400">{totalCalls} вызовов · {fmt(totalRequests)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                            {[...users.entries()].sort((a, b) => b[1].requests - a[1].requests).map(([uid, { calls, requests }]) => (
                              <span key={uid} title={`${calls} вызовов`}>
                                {uid === '(неизвестен)' ? '(авто)' : `@${uid}`}: {fmt(requests)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Token balances per user */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <button
              onClick={() => setShowTokenStats(v => !v)}
              className="w-full flex items-center justify-between"
            >
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" />
                Токены пользователей
              </h2>
              <div className="flex items-center gap-2">
                {tokenStatsLoading && <span className="text-xs text-slate-400">загрузка...</span>}
                {showTokenStats ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {showTokenStats && (
              <div className="mt-3">
                {/* Sort controls */}
                <div className="flex gap-1 mb-3 flex-wrap">
                  {(['spent_month', 'spent_week', 'token_balance', 'last_active'] as const).map(key => (
                    <button
                      key={key}
                      onClick={() => setTokenSortKey(key)}
                      className={cn(
                        'px-2 py-1 rounded-lg text-xs font-medium transition-all',
                        tokenSortKey === key
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      )}
                    >
                      {key === 'spent_month' ? 'За месяц' : key === 'spent_week' ? 'За неделю' : key === 'token_balance' ? 'Баланс' : 'Активность'}
                    </button>
                  ))}
                  <button
                    onClick={fetchTokenStats}
                    className="ml-auto p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
                    title="Обновить"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {tokenStats.length === 0 && !tokenStatsLoading && (
                  <p className="text-xs text-slate-400 text-center py-4">Нет данных</p>
                )}

                {tokenStats.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100">
                          <th className="text-left pb-2 font-medium">Пользователь</th>
                          <th className="text-right pb-2 font-medium">Баланс</th>
                          <th className="text-right pb-2 font-medium">За нед.</th>
                          <th className="text-right pb-2 font-medium">За мес.</th>
                          <th className="text-left pb-2 font-medium pl-3">Последний визит</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...tokenStats]
                          .sort((a, b) => {
                            if (tokenSortKey === 'last_active') {
                              if (!a.last_active) return 1;
                              if (!b.last_active) return -1;
                              return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
                            }
                            return (b[tokenSortKey] as number) - (a[tokenSortKey] as number);
                          })
                          .map(u => (
                          <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="py-1.5 pr-2 font-medium text-slate-700">@{u.username}</td>
                            <td className="py-1.5 text-right">
                              <span className={cn(
                                'font-semibold',
                                u.token_balance > 100 ? 'text-emerald-600' :
                                u.token_balance > 20 ? 'text-amber-600' : 'text-red-500'
                              )}>
                                {u.token_balance}
                              </span>
                            </td>
                            <td className="py-1.5 text-right text-slate-500">{u.spent_week || '—'}</td>
                            <td className="py-1.5 text-right text-slate-500">{u.spent_month || '—'}</td>
                            <td className="py-1.5 pl-3 text-slate-400 whitespace-nowrap flex items-center gap-1">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              {u.last_active
                                ? new Date(u.last_active).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : 'никогда'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Token Spend Details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <button onClick={() => setShowTokenSpend(v => !v)} className="w-full flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" />
                Детальные траты токенов по кнопкам
              </h2>
              <div className="flex items-center gap-2">
                {tokenSpendLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                {showTokenSpend ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {showTokenSpend && (
              <div className="mt-3 space-y-4">
                {/* Period + refresh */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500">Период:</span>
                  {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
                    <button key={p} onClick={() => setSpendPeriod(p)}
                      className={cn('px-2 py-1 rounded-lg text-xs font-medium transition-all',
                        spendPeriod === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                      {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : p === '90d' ? '90 дней' : 'Всё'}
                    </button>
                  ))}
                  <button onClick={fetchTokenSpend} className="ml-auto p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!tokenSpend?.tableExists && !tokenSpendLoading && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-xs">
                    Таблица <code>token_transactions</code> ещё не создана. Запусти миграцию <code>create_token_transactions.sql</code> в Supabase SQL Editor.
                  </div>
                )}

                {tokenSpend && tokenSpend.rowCount === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Транзакций пока нет — данные накопятся после действий пользователей</p>
                )}

                {tokenSpend && tokenSpend.rowCount > 0 && (
                  <>
                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                        <p className="text-[10px] text-violet-600 font-medium">Токенов потрачено</p>
                        <p className="text-lg font-bold text-violet-700">{fmt(tokenSpend.totalTokens)}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                        <p className="text-[10px] text-blue-600 font-medium">Транзакций</p>
                        <p className="text-lg font-bold text-blue-700">{fmt(tokenSpend.rowCount)}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] text-slate-600 font-medium">Пользователей</p>
                        <p className="text-lg font-bold text-slate-700">{Object.keys(tokenSpend.byUser).length}</p>
                      </div>
                    </div>

                    {/* Мини-чарт по дням */}
                    {tokenSpend.daily.length > 1 && (() => {
                      const maxT = Math.max(...tokenSpend.daily.map(d => d.tokens), 1);
                      return (
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500 font-medium mb-2">Токены по дням</p>
                          <div className="flex items-end gap-0.5 h-16">
                            {tokenSpend.daily.map(d => (
                              <div key={d.date} className="flex-1 flex flex-col items-center group relative min-w-[12px]">
                                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                                  {d.date.slice(5)}: {d.tokens} коин
                                </div>
                                <div className="w-full rounded-sm bg-violet-400" style={{ height: `${Math.max(2, (d.tokens / maxT) * 52)}px` }} />
                                <span className="text-[8px] text-slate-400 mt-0.5">{d.date.slice(8)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* По разделам */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">По разделам</p>
                      <div className="space-y-1">
                        {Object.entries(tokenSpend.bySection)
                          .sort((a, b) => b[1].tokens - a[1].tokens)
                          .map(([sec, stat]) => {
                            const maxSec = Math.max(...Object.values(tokenSpend.bySection).map(s => s.tokens), 1);
                            return (
                              <div key={sec} className="flex items-center gap-2 text-xs">
                                <span className="w-24 text-slate-500 truncate">{sec}</span>
                                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-violet-400 rounded-full" style={{ width: `${(stat.tokens / maxSec) * 100}%` }} />
                                </div>
                                <span className="w-14 text-right font-semibold text-slate-700">{stat.tokens} коин</span>
                                <span className="text-slate-400">({stat.count}×)</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* По кнопкам/действиям */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">По кнопкам (топ-20)</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-100">
                              <th className="text-left pb-1.5 font-medium">Действие</th>
                              <th className="text-left pb-1.5 font-medium">Раздел</th>
                              <th className="text-right pb-1.5 font-medium">Коинов</th>
                              <th className="text-right pb-1.5 font-medium">Раз</th>
                              <th className="text-right pb-1.5 font-medium">Ср/раз</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(tokenSpend.byAction)
                              .sort((a, b) => b[1].tokens - a[1].tokens)
                              .slice(0, 20)
                              .map(([action, stat]) => (
                                <tr key={action} className="border-b border-slate-50 hover:bg-slate-50">
                                  <td className="py-1.5 pr-2 text-slate-700">{stat.label || action}</td>
                                  <td className="py-1.5 pr-2 text-slate-400">{stat.section || '—'}</td>
                                  <td className="py-1.5 text-right font-semibold text-violet-600">{stat.tokens}</td>
                                  <td className="py-1.5 text-right text-slate-500">{stat.count}</td>
                                  <td className="py-1.5 text-right text-slate-400">{(stat.tokens / stat.count).toFixed(1)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* По пользователям */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">По пользователям</p>
                      <div className="space-y-1">
                        {Object.entries(tokenSpend.byUser)
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([uname, stat]) => (
                            <div key={uname} className="rounded-xl border border-slate-100 overflow-hidden">
                              <button
                                onClick={() => setExpandedSpendUser(expandedSpendUser === uname ? null : uname)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-xs text-left"
                              >
                                <ChevronRight className={cn('w-3 h-3 text-slate-400 transition-transform flex-shrink-0', expandedSpendUser === uname && 'rotate-90')} />
                                <span className="font-semibold text-slate-700 flex-1">@{uname}</span>
                                <span className="text-slate-400">7д: <b className="text-slate-700">{stat.week}</b></span>
                                <span className="text-slate-400">30д: <b className="text-slate-700">{stat.month}</b></span>
                                <span className="bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-lg">Итого: {stat.total}</span>
                              </button>
                              {expandedSpendUser === uname && (
                                <div className="px-3 pb-2 bg-slate-50/60">
                                  <table className="w-full text-xs mt-1">
                                    <thead>
                                      <tr className="text-slate-400">
                                        <th className="text-left pb-1 font-medium">Действие</th>
                                        <th className="text-left pb-1 font-medium">Раздел</th>
                                        <th className="text-right pb-1 font-medium">Коин</th>
                                        <th className="text-right pb-1 font-medium">Раз</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(stat.byAction)
                                        .sort((a, b) => b[1].tokens - a[1].tokens)
                                        .map(([act, as_]) => (
                                          <tr key={act} className="border-t border-slate-100">
                                            <td className="py-1 pr-2 text-slate-700">{as_.label || act}</td>
                                            <td className="py-1 pr-2 text-slate-400">{as_.section || '—'}</td>
                                            <td className="py-1 text-right font-semibold text-violet-600">{as_.tokens}</td>
                                            <td className="py-1 text-right text-slate-400">{as_.count}</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

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
                      <td className="py-1.5 pr-3 text-slate-600">{getActionLabel(r.action)}</td>
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
