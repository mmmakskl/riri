'use client';

import { motion } from 'framer-motion';
import { Link, Radar, LayoutGrid, FileText, Users, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';

const DISPLAY_NAME_KEY = 'riri-display-name';
const ONBOARDING_DONE_KEY = 'riri-onboarding-done';

export function getDisplayName(): string | null {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

/** Имя для приветствия: из localStorage или telegram_username (если залогинен) */
export function getEffectiveDisplayName(telegramUsername?: string | null): string {
  const stored = getDisplayName();
  if (stored?.trim()) return stored.trim();
  if (telegramUsername?.trim()) return telegramUsername.trim();
  return 'друг';
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {}
}

export function isOnboardingDone(): boolean {
  try {
    return !!localStorage.getItem(ONBOARDING_DONE_KEY);
  } catch {
    return false;
  }
}

/** Приветствие по времени МСК */
function getGreeting(): string {
  const msk = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: 'numeric' });
  const h = parseInt(msk, 10);
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

interface DashboardProps {
  onOpenSearch: (tab: 'link' | 'radar') => void;
  onOpenFeed: () => void;
  onOpenTeam: () => void;
  videosCount?: number;
  telegramUsername?: string | null;
}

const GRADIENT_CARDS = [
  {
    id: 'link',
    title: 'Найти ролик по ссылке',
    accent: 'по ссылке',
    subtitle: 'Вставь ссылку на Instagram — получи данные и сохрани',
    icon: Link,
    // Deep navy-indigo: rich, dark, premium
    gradientStyle: {
      background: 'linear-gradient(145deg, #1a2744 0%, #1e3460 40%, #1a2d5a 100%)',
    },
    dotColor: 'rgba(100,140,220,0.18)',
    cta: 'Открыть',
    onAction: (fn: (t: 'link') => void) => fn('link'),
  },
  {
    id: 'radar',
    title: 'Добавить в радар',
    accent: 'радар',
    subtitle: 'Отслеживай новые видео с профилей',
    icon: Radar,
    // Deep forest-teal: dark, serious, premium
    gradientStyle: {
      background: 'linear-gradient(145deg, #0a2e22 0%, #0d3d2e 45%, #0a3528 100%)',
    },
    dotColor: 'rgba(60,200,140,0.16)',
    cta: 'Открыть',
    onAction: (fn: (t: 'radar') => void) => fn('radar'),
  },
];

const WHITE_CARDS = [
  { id: 'feed', title: 'Лента', accent: null, subtitle: 'Твои сохранённые видео по папкам', icon: LayoutGrid, onAction: (fn: () => void) => fn() },
  { id: 'script', title: 'ИИ-сценарист', accent: 'ИИ', subtitle: 'Сценарии по подчерку и примерам', icon: FileText, onAction: (fn: () => void) => fn() },
  { id: 'team', title: 'Команда', accent: null, subtitle: 'Участники проекта и приглашения', icon: Users, onAction: (fn: () => void) => fn() },
];

function renderTitleWithAccent(title: string, accent: string | null) {
  if (!accent || !title.includes(accent)) return title;
  const [before, after] = title.split(accent);
  return (
    <>
      {before}<span className="font-heading italic text-inherit">{accent}</span>{after}
    </>
  );
}

export function Dashboard({ onOpenSearch, onOpenFeed, onOpenTeam, videosCount = 0, telegramUsername }: DashboardProps) {
  const greeting = getGreeting();
  const name = getEffectiveDisplayName(telegramUsername);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#fafafa] safe-top safe-bottom safe-left safe-right custom-scrollbar-light">
      {/* Main content card — iOS 26: компактнее на мобильных */}
      <div className="mx-4 md:mx-6 lg:mx-8 py-4 md:py-8 lg:py-10 pb-24 md:pb-16">
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-10 bg-white/72 backdrop-blur-glass-xl border border-white/55"
            style={{
              boxShadow: '0 10px 40px rgba(15,23,42,0.05), 0 2px 12px rgba(15,23,42,0.035), inset 0 1px 0 rgba(255,255,255,0.82)',
            }}
          >
            {/* Greeting — friendly headline (phrase lighter, name bolder like reference) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mb-6 md:mb-10"
            >
              <h1 className="text-2xl md:text-3xl font-bold leading-tight font-heading">
                <span className="text-slate-500">{greeting},</span>{' '}
                <span className="text-slate-800 italic">{name}</span>
              </h1>
              <p className="text-slate-500 text-base md:text-lg font-normal leading-tight mt-1.5 font-heading">
                Что хочешь сделать сегодня?
              </p>
            </motion.div>

            {/* Two main gradient action cards — compact height, layered shadows, visible gradient */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
              {GRADIENT_CARDS.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="relative rounded-2xl md:rounded-3xl overflow-hidden text-white cursor-pointer group"
                  style={{
                    ...card.gradientStyle,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.14)',
                  }}
                  onClick={() => card.onAction(onOpenSearch)}
                >
                  {/* Noise texture overlay for depth */}
                  <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    }}
                    aria-hidden
                  />
                  {/* Radial glow from icon area */}
                  <div
                    className="absolute -left-8 -top-8 w-48 h-48 rounded-full blur-3xl pointer-events-none"
                    style={{ background: card.dotColor }}
                    aria-hidden
                  />
                  {/* Bottom-right accent orb */}
                  <div
                    className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full blur-2xl pointer-events-none"
                    style={{ background: card.dotColor }}
                    aria-hidden
                  />
                  {/* Top highlight line */}
                  <div className="absolute inset-x-0 top-0 h-px bg-white/12 pointer-events-none" aria-hidden />

                  <div className="relative p-5 md:p-7 flex flex-col min-h-[140px] md:min-h-[172px]">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-2xl mb-4 flex items-center justify-center flex-shrink-0"
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <card.icon className="w-5 h-5 text-white/90" strokeWidth={2} />
                    </div>

                    <h3 className="text-[15px] md:text-base font-semibold mb-1.5 font-heading leading-snug text-white/95">
                      {renderTitleWithAccent(card.title, card.accent)}
                    </h3>
                    <p className="text-white/52 text-[13px] mb-5 flex-1 leading-snug">
                      {card.subtitle}
                    </p>

                    {/* CTA pill */}
                    <div className="self-start flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold text-white/90 transition-all group-hover:text-white group-active:scale-95"
                        style={{
                          background: 'rgba(255,255,255,0.12)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                        }}
                      >
                        {card.cta}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Three white cards below — iOS 26: 1 col на мобильных */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-5">
              {WHITE_CARDS.map((card, i) => (
                <motion.button
                  key={card.id}
                  type="button"
                  onClick={() => (card.id === 'team' ? onOpenTeam() : onOpenFeed())}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.1 + i * 0.05 }}
                  className="relative rounded-2xl p-4 md:p-6 text-left border border-white/55 bg-white/66 backdrop-blur-glass hover:bg-white/78 hover:border-white/70 transition-all duration-200 group overflow-hidden active:scale-[0.99] touch-manipulation"
                  style={{
                    boxShadow:
                      '0 8px 24px rgba(15,23,42,0.045), 0 2px 10px rgba(15,23,42,0.03), inset 0 1px 0 rgba(255,255,255,0.72)',
                  }}
                >
                  {/* Subtle underlay */}
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none"
                    aria-hidden
                  />
                  <div className="relative flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: 'rgba(15,23,42,0.055)',
                          border: '1px solid rgba(15,23,42,0.07)',
                        }}
                      >
                        <card.icon className="w-[18px] h-[18px] text-slate-700" strokeWidth={2} />
                      </div>
                      {card.id === 'feed' && videosCount > 0 && (
                        <span
                          className="px-2.5 py-1 rounded-full text-slate-500 text-xs font-semibold tabular-nums"
                          style={{
                            background: 'rgba(15,23,42,0.055)',
                            border: '1px solid rgba(15,23,42,0.07)',
                          }}
                        >
                          {videosCount}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 text-[14px] md:text-[15px] mb-1.5 font-heading leading-snug">
                      {renderTitleWithAccent(card.title, card.accent)}
                    </h3>
                    <p className="text-slate-500 text-[12px] md:text-[13px] mb-4 leading-relaxed flex-1">
                      {card.subtitle}
                    </p>
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[13px] group-hover:text-slate-800 mt-auto transition-colors">
                      Перейти
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
