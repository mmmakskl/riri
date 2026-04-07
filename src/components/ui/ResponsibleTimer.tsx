'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, HelpCircle, Check, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { iosSpringSnap } from '../../utils/motionPresets';

const TIMER_HOURS = 24;

interface ResponsibleTimerProps {
  /** ISO-строка: когда ответственный назначен / таймер стартовал */
  assignedAt: string | null | undefined;
  /** Таймер уже остановлен (ответственный отметил «готово») */
  timerDone?: boolean;
  /** Кто ответственные (чтобы показывать таймер только если есть) */
  hasResponsible: boolean;
  /** Текущий пользователь — ответственный или проджект? */
  canComplete: boolean;
  /** Колбэк — отметить видео как «готово» */
  onComplete: () => Promise<void>;
  /** Компактный режим для карточек (без тултипа, только иконка + часы) */
  compact?: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Просрочено';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export function ResponsibleTimer({
  assignedAt,
  timerDone,
  hasResponsible,
  canComplete,
  onComplete,
  compact = false,
}: ResponsibleTimerProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Расчёт оставшегося времени
  useEffect(() => {
    if (!assignedAt || !hasResponsible || timerDone) {
      setRemaining(null);
      return;
    }

    const calc = () => {
      const deadline = new Date(assignedAt).getTime() + TIMER_HOURS * 3600000;
      setRemaining(deadline - Date.now());
    };

    calc();
    const interval = setInterval(calc, 60000); // обновляем каждую минуту
    return () => clearInterval(interval);
  }, [assignedAt, hasResponsible, timerDone]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await onComplete();
      setShowConfirm(false);
    } finally {
      setCompleting(false);
    }
  }, [onComplete]);

  // Не показываем если нет ответственного или нет таймера
  if (!hasResponsible || !assignedAt) return null;

  // Готово — показываем галочку
  if (timerDone) {
    return (
      <div className={cn(
        'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1',
        'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
        compact && 'px-1.5 py-0.5'
      )}>
        <Check className={cn('w-3.5 h-3.5', compact && 'w-3 h-3')} />
        {!compact && <span className="text-xs font-medium">Готово</span>}
      </div>
    );
  }

  const isOverdue = remaining !== null && remaining <= 0;
  const isWarning = remaining !== null && remaining > 0 && remaining < 4 * 3600000; // меньше 4ч

  return (
    <div className="relative inline-flex items-center gap-1">
      {/* Таймер */}
      <motion.div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 cursor-default select-none',
          'border transition-colors',
          isOverdue && 'bg-red-50 text-red-600 border-red-200/80',
          isWarning && !isOverdue && 'bg-amber-50 text-amber-600 border-amber-200/80',
          !isOverdue && !isWarning && 'bg-slate-50 text-slate-600 border-slate-200/60',
          compact && 'px-1.5 py-0.5'
        )}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={iosSpringSnap}
      >
        <Clock className={cn(
          'w-3.5 h-3.5 shrink-0',
          isOverdue && 'text-red-500',
          isWarning && !isOverdue && 'text-amber-500',
          !isOverdue && !isWarning && 'text-slate-400',
          compact && 'w-3 h-3'
        )} />
        <span className={cn('text-xs font-medium whitespace-nowrap', compact && 'text-[11px]')}>
          {remaining !== null ? formatRemaining(remaining) : '...'}
        </span>
      </motion.div>

      {/* Вопросик с тултипом */}
      {!compact && (
        <button
          type="button"
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
          onClick={() => setShowTooltip(prev => !prev)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Тултип */}
      <AnimatePresence>
        {showTooltip && !compact && (
          <motion.div
            className="absolute bottom-full left-0 mb-2 z-50 w-64"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="rounded-2xl p-3 text-xs text-slate-700 leading-relaxed"
              style={{
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 32px -8px rgba(15,23,42,0.18)',
              }}
            >
              <p className="font-medium text-slate-800 mb-1">Таймер ответственного</p>
              <p className="text-slate-500">
                У ответственного есть 24 часа на обработку видео.
                Если видео не перемещено в другую папку за это время —
                проджект-менеджер получит уведомление в Telegram.
              </p>
              <p className="text-slate-500 mt-1.5">
                Перемещение видео в другую папку сбрасывает таймер.
                Нажми «Готово» чтобы завершить таймер вручную.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Кнопка "Готово" — только для ответственного или проджекта */}
      {canComplete && !compact && (
        <>
          {!showConfirm ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium',
                'bg-white border border-slate-200/80 text-slate-600',
                'hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600',
                'transition-all touch-manipulation active:scale-[0.97]'
              )}
            >
              <Check className="w-3.5 h-3.5" />
              Готово
            </button>
          ) : (
            <motion.div
              className="inline-flex items-center gap-1"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={iosSpringSnap}
            >
              <span className="text-xs text-slate-500 mr-1">Точно?</span>
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                className={cn(
                  'p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60',
                  'hover:bg-emerald-100 transition-colors touch-manipulation',
                  'disabled:opacity-50'
                )}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200/60 hover:bg-slate-100 transition-colors touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
