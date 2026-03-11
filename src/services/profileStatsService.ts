/**
 * Сервис для работы со статистикой Instagram профилей
 * Собирает среднее/медиану/минимум просмотров для расчёта "залётности"
 */

import { supabase } from '../utils/supabase';

export interface InstagramProfileStats {
  id: string;
  username: string;
  full_name?: string;
  followers_count: number;
  following_count: number;
  media_count: number;
  profile_pic_url?: string;
  is_verified: boolean;
  
  // Статистика по видео
  videos_analyzed: number;
  avg_views: number;
  median_views: number;
  min_views: number;
  max_views: number;
  avg_bottom3_views: number; // Среднее из 3 самых маленьких роликов
  avg_bottom3_likes?: number; // Среднее из 3 постов с наименьшими лайками (для каруселей)
  avg_likes: number;
  median_likes: number;
  avg_comments: number;
  
  stats_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReelStats {
  view_count: number;
  like_count: number;
  comment_count: number;
}

// Расчёт медианы
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

// Расчёт среднего
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.floor(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Получить статистику профиля из БД
 */
export async function getProfileStats(username: string): Promise<InstagramProfileStats | null> {
  try {
    const { data, error } = await supabase
      .from('instagram_profiles')
      .select('*')
      .eq('username', username.toLowerCase())
      .maybeSingle();
    
    if (error) {
      // Если таблица не существует (404) - просто возвращаем null без ошибки
      if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.warn('[ProfileStats] Table instagram_profiles does not exist. Please run the migration.');
        return null;
      }
      console.error('[ProfileStats] Error fetching profile:', error);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[ProfileStats] Exception fetching profile:', err);
    return null;
  }
}

/**
 * Проверить нужно ли обновлять статистику профиля
 * Обновляем раз в 7 дней
 */
export function shouldUpdateStats(profile: InstagramProfileStats | null): boolean {
  if (!profile || !profile.stats_updated_at) return true;
  
  const lastUpdate = new Date(profile.stats_updated_at);
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysSinceUpdate >= 7;
}

/**
 * Загрузить и рассчитать статистику профиля по его роликам
 */
export async function fetchAndCalculateProfileStats(username: string): Promise<InstagramProfileStats | null> {
  const cleanUsername = username.toLowerCase().replace('@', '');
  
  console.log(`[ProfileStats] Fetching stats for @${cleanUsername}`);
  
  try {
    // Запрашиваем ролики пользователя через наш API
    const response = await fetch('/api/user-reels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername }),
    });
    
    if (!response.ok) {
      console.error(`[ProfileStats] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.success || !data.reels || data.reels.length === 0) {
      console.log(`[ProfileStats] No reels found for @${cleanUsername}`);
      return null;
    }
    
    const reels: ReelStats[] = data.reels.map((reel: any) => ({
      view_count: reel.play_count || reel.view_count || 0,
      like_count: reel.like_count || 0,
      comment_count: reel.comment_count || 0,
    }));
    
    // Рассчитываем статистику
    const views = reels.map(r => r.view_count).filter(v => v > 0);
    const likes = reels.map(r => r.like_count).filter(v => v > 0);
    const comments = reels.map(r => r.comment_count).filter(v => v > 0);
    
    // Среднее из 3 самых маленьких роликов (для расчета "залётности" рилсов)
    const sortedViews = [...views].sort((a, b) => a - b);
    const bottom3Views = sortedViews.slice(0, Math.min(3, sortedViews.length));
    const avgBottom3Views = bottom3Views.length > 0 
      ? Math.floor(bottom3Views.reduce((a, b) => a + b, 0) / bottom3Views.length)
      : 0;
    // Среднее из 3 постов с наименьшими лайками (для каруселей — «x от мин» по лайкам)
    const sortedLikes = [...likes].sort((a, b) => a - b);
    const bottom3Likes = sortedLikes.slice(0, Math.min(3, sortedLikes.length));
    const avgBottom3Likes = bottom3Likes.length > 0 
      ? Math.floor(bottom3Likes.reduce((a, b) => a + b, 0) / bottom3Likes.length)
      : 0;
    
    const stats = {
      videos_analyzed: reels.length,
      avg_views: calculateAverage(views),
      median_views: calculateMedian(views),
      min_views: views.length > 0 ? Math.min(...views) : 0,
      max_views: views.length > 0 ? Math.max(...views) : 0,
      avg_bottom3_views: avgBottom3Views,
      avg_bottom3_likes: avgBottom3Likes,
      avg_likes: calculateAverage(likes),
      median_likes: calculateMedian(likes),
      avg_comments: calculateAverage(comments),
    };
    
    console.log(`[ProfileStats] Calculated stats for @${cleanUsername}:`, stats);
    
    // Сохраняем/обновляем в БД
    const { data: savedProfile, error } = await supabase
      .from('instagram_profiles')
      .upsert({
        username: cleanUsername,
        ...stats,
        stats_updated_at: new Date().toISOString(),
      }, {
        onConflict: 'username',
      })
      .select()
      .single();
    
    if (error) {
      console.error('[ProfileStats] Error saving profile stats:', error);
      return null;
    }
    
    return savedProfile;
  } catch (err) {
    console.error('[ProfileStats] Error fetching profile stats:', err);
    return null;
  }
}

/**
 * Рассчитать и сохранить статистику профиля из уже загруженных роликов.
 * Используется чтобы не делать повторный API-запрос когда ролики уже есть.
 */
export async function saveProfileStatsFromReels(
  username: string,
  reels: Array<{ view_count?: number; play_count?: number; like_count?: number; comment_count?: number }>
): Promise<InstagramProfileStats | null> {
  const cleanUsername = username.toLowerCase().replace('@', '');
  if (!reels || reels.length === 0) return null;

  const mapped: ReelStats[] = reels.map(r => ({
    view_count: (r as any).play_count || r.view_count || 0,
    like_count: r.like_count || 0,
    comment_count: r.comment_count || 0,
  }));

  const views = mapped.map(r => r.view_count).filter(v => v > 0);
  const likes = mapped.map(r => r.like_count).filter(v => v > 0);
  const comments = mapped.map(r => r.comment_count).filter(v => v > 0);

  const sortedViews = [...views].sort((a, b) => a - b);
  const bottom3Views = sortedViews.slice(0, Math.min(3, sortedViews.length));
  const avgBottom3Views = bottom3Views.length > 0
    ? Math.floor(bottom3Views.reduce((a, b) => a + b, 0) / bottom3Views.length)
    : 0;

  const sortedLikes = [...likes].sort((a, b) => a - b);
  const bottom3Likes = sortedLikes.slice(0, Math.min(3, sortedLikes.length));
  const avgBottom3Likes = bottom3Likes.length > 0
    ? Math.floor(bottom3Likes.reduce((a, b) => a + b, 0) / bottom3Likes.length)
    : 0;

  const stats = {
    videos_analyzed: mapped.length,
    avg_views: calculateAverage(views),
    median_views: calculateMedian(views),
    min_views: views.length > 0 ? Math.min(...views) : 0,
    max_views: views.length > 0 ? Math.max(...views) : 0,
    avg_bottom3_views: avgBottom3Views,
    avg_bottom3_likes: avgBottom3Likes,
    avg_likes: calculateAverage(likes),
    median_likes: calculateMedian(likes),
    avg_comments: calculateAverage(comments),
  };

  try {
    const { data: savedProfile, error } = await supabase
      .from('instagram_profiles')
      .upsert({
        username: cleanUsername,
        ...stats,
        stats_updated_at: new Date().toISOString(),
      }, { onConflict: 'username' })
      .select()
      .single();

    if (error) {
      console.error('[ProfileStats] Error saving stats from reels:', error);
      return null;
    }
    return savedProfile;
  } catch (err) {
    console.error('[ProfileStats] Exception saving stats from reels:', err);
    return null;
  }
}

/**
 * Получить или обновить статистику профиля
 * Если статистика старше 7 дней или отсутствует - обновляем
 */
export async function getOrUpdateProfileStats(username: string, forceUpdate = false): Promise<InstagramProfileStats | null> {
  const cleanUsername = username.toLowerCase().replace('@', '');
  
  // Сначала проверяем есть ли в БД
  const existingProfile = await getProfileStats(cleanUsername);
  
  // Если есть и не устарела - возвращаем
  if (existingProfile && !forceUpdate && !shouldUpdateStats(existingProfile)) {
    console.log(`[ProfileStats] Using cached stats for @${cleanUsername} (updated ${existingProfile.stats_updated_at})`);
    return existingProfile;
  }
  
  // Иначе обновляем
  return await fetchAndCalculateProfileStats(cleanUsername);
}

/**
 * Рассчитать "залётность" видео относительно профиля автора (по просмотрам)
 * Возвращает множитель: 1 = среднее, 2 = в 2 раза больше среднего, и т.д.
 * Использует среднее из 3 самых маленьких роликов
 */
export function calculateViralMultiplier(
  videoViews: number,
  profileStats: InstagramProfileStats | null
): number | null {
  if (!profileStats || !profileStats.avg_bottom3_views || profileStats.avg_bottom3_views === 0) {
    return null; // Нет данных для сравнения
  }
  
  // Используем среднее из 3 самых маленьких роликов
  const baselineViews = profileStats.avg_bottom3_views;
  
  if (baselineViews === 0) return null;
  
  const multiplier = videoViews / baselineViews;
  
  // Округляем до 1 знака
  return Math.round(multiplier * 10) / 10;
}

/**
 * Рассчитать "залётность" карусели относительно профиля автора (по лайкам с последних постов)
 * Возвращает множитель: во сколько раз лайков больше минимума у этого аккаунта
 * Использует среднее из 3 постов с наименьшими лайками
 */
export function calculateCarouselViralMultiplier(
  likeCount: number,
  profileStats: InstagramProfileStats | null
): number | null {
  const baseline = profileStats?.avg_bottom3_likes ?? 0;
  if (!baseline || baseline === 0) return null;
  const multiplier = likeCount / baseline;
  return Math.round(multiplier * 10) / 10;
}

/**
 * Применить множитель залётности к коэффициенту виральности
 * x1 → 0.1, x2 → 1.3, x3 → 3, x4+ → 5
 */
export function applyViralMultiplierToCoefficient(
  viralCoefficient: number,
  multiplier: number | null
): number {
  if (multiplier === null || multiplier < 1) {
    return viralCoefficient * 0.1; // Если нет данных или меньше среднего
  }
  
  if (multiplier >= 4) {
    return viralCoefficient * 5;
  } else if (multiplier >= 3) {
    return viralCoefficient * 3;
  } else if (multiplier >= 2) {
    return viralCoefficient * 1.3;
  } else {
    return viralCoefficient * 0.1; // x1
  }
}

/**
 * Получить текстовую оценку "залётности"
 */
export function getViralMultiplierLabel(multiplier: number | null): string {
  if (multiplier === null) return '';
  
  if (multiplier >= 10) return '🔥 Мега-вирал';
  if (multiplier >= 5) return '🚀 Супер-залёт';
  if (multiplier >= 3) return '⚡ Отличный залёт';
  if (multiplier >= 2) return '📈 Хороший залёт';
  if (multiplier >= 1.5) return '✨ Выше среднего';
  if (multiplier >= 1) return '- Норма';
  return '📉 Ниже среднего';
}

/**
 * Получить цвет для множителя залётности
 */
export function getViralMultiplierColor(multiplier: number | null): string {
  if (multiplier === null) return '#94a3b8';
  
  if (multiplier >= 10) return '#dc2626'; // red-600
  if (multiplier >= 5) return '#ea580c';  // orange-600
  if (multiplier >= 3) return '#d97706';  // amber-600
  if (multiplier >= 2) return '#65a30d';  // lime-600
  if (multiplier >= 1.5) return '#16a34a'; // green-600
  if (multiplier >= 1) return '#64748b';  // slate-500
  return '#94a3b8'; // slate-400
}

/**
 * Массовое обновление статистики для списка профилей
 * Используется в радаре для периодического обновления
 */
export async function batchUpdateProfileStats(usernames: string[]): Promise<Map<string, InstagramProfileStats>> {
  const results = new Map<string, InstagramProfileStats>();
  
  for (const username of usernames) {
    try {
      const stats = await getOrUpdateProfileStats(username);
      if (stats) {
        results.set(username.toLowerCase(), stats);
      }
      
      // Задержка между запросами чтобы не перегружать API
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[ProfileStats] Error updating stats for @${username}:`, err);
    }
  }
  
  return results;
}
