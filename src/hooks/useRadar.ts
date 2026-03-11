import { useState, useEffect, useCallback } from 'react';
import { InstagramSearchResult } from '../services/videoService';
import { supabase } from '../utils/supabase';
import { 
  getOrCreateGlobalVideo, 
  extractShortcode,
} from '../services/globalVideoService';
import {
  getOrUpdateProfileStats,
  saveProfileStatsFromReels,
  shouldUpdateStats,
  getProfileStats,
  InstagramProfileStats,
} from '../services/profileStatsService';

export interface TrackedProfile {
  id?: string;
  username: string;
  projectId: string;
  addedAt: string;
  lastChecked?: string;
  /** Частота автообновления в днях (1, 3, 7, 14) */
  updateFrequencyDays?: number;
  avatarUrl?: string;
  fullName?: string;
  reelsCount?: number;
  // Статистика профиля
  profileStats?: InstagramProfileStats | null;
}

export interface RadarReel extends InstagramSearchResult {
  isNew?: boolean;
  projectId?: string;
  savedToInbox?: boolean;
}

const STORAGE_KEY = 'radar_profiles';
const STORAGE_MIGRATED_KEY = 'radar_profiles_migrated';

/** Преобразует строку из БД в TrackedProfile */
function dbRowToProfile(row: {
  id: string;
  project_id: string;
  user_id: string;
  instagram_username: string;
  update_frequency_days?: number;
  last_checked_at?: string | null;
  added_at: string;
  avatar_url?: string | null;
  full_name?: string | null;
  reels_count?: number | null;
}): TrackedProfile {
  return {
    id: row.id,
    username: row.instagram_username,
    projectId: row.project_id,
    addedAt: row.added_at,
    lastChecked: row.last_checked_at ?? undefined,
    updateFrequencyDays: row.update_frequency_days ?? 7,
    avatarUrl: row.avatar_url ?? undefined,
    fullName: row.full_name ?? undefined,
    reelsCount: row.reels_count ?? undefined,
  };
}

// Функция для добавления видео в saved_videos пользователя (inbox)
// Использует глобальный сервис для транскрибаций
async function saveReelToInbox(reel: RadarReel, projectId: string, userId: string) {
  try {
    const shortcode = reel.shortcode || extractShortcode(reel.url);
    
    console.log('[Radar] Saving reel:', { shortcode, projectId, userId, url: reel.url });
    
    // Конвертируем taken_at
    let takenAtTimestamp: number | undefined;
    if (reel.taken_at) {
      const ts = typeof reel.taken_at === 'number' ? reel.taken_at : Number(reel.taken_at);
      if (!isNaN(ts)) {
        takenAtTimestamp = ts > 1e12 ? Math.floor(ts / 1000) : ts;
      }
    }
    
    // 1. Получаем/создаём видео в ГЛОБАЛЬНОЙ таблице videos
    const globalVideo = shortcode ? await getOrCreateGlobalVideo({
      shortcode,
      url: reel.url,
      thumbnailUrl: reel.thumbnail_url || reel.display_url,
      caption: typeof reel.caption === 'string' ? reel.caption.slice(0, 500) : '',
      ownerUsername: reel.owner?.username,
      viewCount: reel.view_count,
      likeCount: reel.like_count,
      commentCount: reel.comment_count,
      takenAt: takenAtTimestamp,
      instagramId: reel.id,
    }) : null;
    
    const needsTranscription = !globalVideo?.transcript_status || globalVideo.transcript_status === 'error';
    
    // 2. Проверяем, есть ли уже у ПОЛЬЗОВАТЕЛЯ это видео В ДАННОМ ПРОЕКТЕ
    // Один shortcode может быть в разных проектах — у каждого своя запись
    let existingUserVideo = null;
    if (shortcode) {
      let query = supabase
        .from('saved_videos')
        .select('id')
        .eq('user_id', userId)
        .eq('shortcode', shortcode);
      if (projectId) {
        query = query.eq('project_id', projectId);
      } else {
        query = query.is('project_id', null);
      }
      const { data } = await query.maybeSingle();
      existingUserVideo = data;
    }

    if (existingUserVideo) {
      console.log('[Radar] User already has this video in this project:', existingUserVideo.id);
      
      // Обновляем статистику и копируем транскрибацию из глобальной таблицы
      await supabase
        .from('saved_videos')
        .update({
          view_count: reel.view_count,
          like_count: reel.like_count,
          comment_count: reel.comment_count,
          transcript_status: globalVideo?.transcript_status,
          transcript_text: globalVideo?.transcript_text,
        })
        .eq('id', existingUserVideo.id);
      
      return { updated: true, id: existingUserVideo.id, globalVideoId: globalVideo?.id, needsTranscription: false };
    }

    // 3. Создаём новое видео для пользователя
    const videoId = shortcode || `radar-${Date.now()}`;
    
    const { data, error } = await supabase
      .from('saved_videos')
      .insert({
        user_id: userId,
        video_id: videoId,
        shortcode: shortcode,
        project_id: projectId,
        caption: typeof reel.caption === 'string' ? reel.caption.slice(0, 500) : 'Видео из Instagram',
        thumbnail_url: reel.thumbnail_url || reel.display_url || '',
        video_url: reel.url,
        view_count: reel.view_count,
        like_count: reel.like_count,
        comment_count: reel.comment_count,
        owner_username: reel.owner?.username,
        taken_at: takenAtTimestamp,
        folder_id: null,
        // Копируем транскрибацию если уже есть в глобальной таблице
        transcript_status: globalVideo?.transcript_status,
        transcript_text: globalVideo?.transcript_text,
      })
      .select()
      .single();

    if (error) {
      console.error('[Radar] Error saving reel to inbox:', error);
      return null;
    }

    console.log('[Radar] Video saved successfully:', data?.id);
    return { 
      created: true, 
      id: data?.id, 
      videoUrl: reel.url,
      globalVideoId: globalVideo?.id,
      shortcode,
      needsTranscription,
    };
  } catch (e) {
    console.error('[Radar] Failed to save reel to inbox:', e);
    return null;
  }
}

export function useRadar(
  currentProjectId?: string | null,
  userId?: string,
  isSharedProject?: boolean
) {
  const [profiles, setProfiles] = useState<TrackedProfile[]>([]);
  const [recentReels, setRecentReels] = useState<RadarReel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null);
  const [stats, setStats] = useState({ newVideos: 0, updatedVideos: 0 });
  const [profileStatsCache, setProfileStatsCache] = useState<Map<string, InstagramProfileStats>>(new Map());

  // Загрузка профилей из Supabase (для общих проектов — от всех участников)
  useEffect(() => {
    if (!userId || userId === 'anonymous') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && currentProjectId) {
        try {
          const allProfiles = JSON.parse(saved) as TrackedProfile[];
          const filtered = allProfiles
            .filter(p => p.projectId === currentProjectId)
            .map(p => ({ ...p, updateFrequencyDays: p.updateFrequencyDays ?? 7 }));
          setProfiles(filtered);
        } catch (e) {
          console.error('Failed to parse radar profiles:', e);
        }
      } else {
        setProfiles([]);
      }
      return;
    }

    if (!currentProjectId) {
      setProfiles([]);
      return;
    }

    let cancelled = false;

    async function loadFromSupabase() {
      // Миграция из localStorage (однократно) — загружаем свои профили для проверки
      const migrated = localStorage.getItem(STORAGE_MIGRATED_KEY);
      if (!migrated) {
        const { data: myData } = await supabase
          .from('radar_profiles')
          .select('*')
          .eq('user_id', userId);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const localProfiles = JSON.parse(saved) as TrackedProfile[];
            const toMigrate = localProfiles
              .map(p => ({ ...p, projectId: p.projectId || 'default' }))
              .filter(p => !(myData ?? []).some(
                db => db.instagram_username === p.username && db.project_id === p.projectId
              ));
            for (const p of toMigrate) {
              await supabase.from('radar_profiles').upsert({
                project_id: p.projectId,
                user_id: userId,
                instagram_username: p.username.toLowerCase(),
                update_frequency_days: p.updateFrequencyDays ?? 7,
                added_at: p.addedAt,
                last_checked_at: p.lastChecked ?? null,
              }, { onConflict: 'project_id,user_id,instagram_username' });
            }
            localStorage.setItem(STORAGE_MIGRATED_KEY, '1');
          } catch (e) {
            console.error('[Radar] Migration error:', e);
          }
        }
      }

      if (isSharedProject) {
        // Общий проект: загружаем радар от всех участников
        const { data: membersData } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', currentProjectId)
          .in('status', ['active', 'pending']);
        const { data: projectData } = await supabase
          .from('projects')
          .select('user_id, owner_id')
          .eq('id', currentProjectId)
          .single();
        const memberIds = new Set((membersData ?? []).map(m => m.user_id));
        if (projectData?.user_id) memberIds.add(projectData.user_id);
        if (projectData?.owner_id) memberIds.add(projectData.owner_id);

        const { data, error } = await supabase
          .from('radar_profiles')
          .select('*')
          .eq('project_id', currentProjectId)
          .in('user_id', Array.from(memberIds))
          .order('added_at', { ascending: false });

        if (cancelled) return;
        if (error) {
          console.error('[Radar] Error loading shared radar:', error);
          setProfiles([]);
          return;
        }
        // Дедупликация по username (оставляем запись с последним last_checked_at)
        const byUsername = new Map<string, typeof data[0]>();
        for (const row of data ?? []) {
          const un = row.instagram_username.toLowerCase();
          const existing = byUsername.get(un);
          if (!existing || (row.last_checked_at || '') > (existing.last_checked_at || '')) {
            byUsername.set(un, row);
          }
        }
        if (!cancelled) setProfiles(Array.from(byUsername.values()).map(dbRowToProfile));
      } else {
        // Обычный проект: только свои профили
        const { data, error } = await supabase
          .from('radar_profiles')
          .select('*')
          .eq('project_id', currentProjectId)
          .eq('user_id', userId)
          .order('added_at', { ascending: false });

        if (cancelled) return;
        if (error) {
          console.error('[Radar] Error loading from Supabase:', error);
          setProfiles([]);
          return;
        }
        if (!cancelled) setProfiles((data ?? []).map(dbRowToProfile));
      }
    }

    loadFromSupabase();
    return () => { cancelled = true; };
  }, [userId, currentProjectId, isSharedProject]);

  // Realtime: подписка на изменения радара в общих проектах
  useEffect(() => {
    if (!currentProjectId || !isSharedProject || !userId || userId === 'anonymous') return;

    const channel = supabase
      .channel(`radar:${currentProjectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'radar_profiles',
          filter: `project_id=eq.${currentProjectId}`,
        },
        () => {
          // Перезагружаем при любом изменении
          loadRadarRefetch();
        }
      )
      .subscribe();

    let loadRadarRefetch: () => void = () => {};
    const fetchProfiles = async () => {
      const { data: membersData } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', currentProjectId)
        .in('status', ['active', 'pending']);
      const { data: projectData } = await supabase
        .from('projects')
        .select('user_id, owner_id')
        .eq('id', currentProjectId)
        .single();
      const memberIds = new Set((membersData ?? []).map(m => m.user_id));
      if (projectData?.user_id) memberIds.add(projectData.user_id);
      if (projectData?.owner_id) memberIds.add(projectData.owner_id);
      const { data } = await supabase
        .from('radar_profiles')
        .select('*')
        .eq('project_id', currentProjectId)
        .in('user_id', Array.from(memberIds))
        .order('added_at', { ascending: false });
      const byUsername = new Map<string, NonNullable<typeof data>[0]>();
      for (const row of data ?? []) {
        const un = row.instagram_username.toLowerCase();
        const existing = byUsername.get(un);
        if (!existing || (row.last_checked_at || '') > (existing.last_checked_at || '')) {
          byUsername.set(un, row);
        }
      }
      setProfiles(Array.from(byUsername.values()).map(dbRowToProfile));
    };
    loadRadarRefetch = fetchProfiles;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProjectId, isSharedProject, userId]);

  // Синхронизация в localStorage для анонимных (бэкап) и откат при ошибках
  useEffect(() => {
    if (userId && userId !== 'anonymous') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }
  }, [profiles, userId]);

  // Профили текущего проекта
  const projectProfiles = currentProjectId 
    ? profiles.filter(p => p.projectId === currentProjectId)
    : profiles;

  // Профили, которым пора обновиться (lastChecked старше updateFrequencyDays)
  const dueProfiles = projectProfiles.filter(p => {
    const days = p.updateFrequencyDays ?? 7;
    if (!p.lastChecked) return true;
    const last = new Date(p.lastChecked).getTime();
    const now = Date.now();
    return (now - last) / (24 * 60 * 60 * 1000) >= days;
  });
  const profilesDueCount = dueProfiles.length;

  // Добавить профиль в радар для текущего проекта
  const addProfile = useCallback(async (
    username: string, 
    projectId?: string, 
    updateFrequencyDays: number = 7
  ): Promise<boolean> => {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    const targetProjectId = projectId || currentProjectId;
    
    if (!cleanUsername || !targetProjectId) return false;
    
    // Проверяем, не добавлен ли уже в этот проект
    if (profiles.some(p => 
      p.username.toLowerCase() === cleanUsername && 
      p.projectId === targetProjectId
    )) {
      return false;
    }

    const addedAt = new Date().toISOString();
    const newProfile: TrackedProfile = {
      id: `local-${targetProjectId}-${cleanUsername}-${Date.now()}`,
      username: cleanUsername,
      projectId: targetProjectId,
      addedAt,
      updateFrequencyDays,
    };

    setProfiles(prev => [...prev, newProfile]);

    // Сохраняем в Supabase для авторизованных
    if (userId && userId !== 'anonymous') {
      const { data, error } = await supabase
        .from('radar_profiles')
        .upsert({
          project_id: targetProjectId,
          user_id: userId,
          instagram_username: cleanUsername,
          update_frequency_days: updateFrequencyDays,
          added_at: addedAt,
        }, { onConflict: 'project_id,user_id,instagram_username' })
        .select()
        .single();

      if (error) {
        console.error('[Radar] Error saving profile to Supabase:', error);
        setProfiles(prev => prev.filter(p => !(p.username === cleanUsername && p.projectId === targetProjectId)));
        return false;
      }
      if (data) {
        setProfiles(prev => prev.map(p => 
          p.username === cleanUsername && p.projectId === targetProjectId
            ? { ...dbRowToProfile(data), profileStats: p.profileStats }
            : p
        ));
      }
    }
    
    // fetchUserReels загружает ролики и сразу рассчитывает статистику профиля из них
    if (userId) {
      fetchUserReels(cleanUsername, targetProjectId);
    }
    
    return true;
  }, [profiles, currentProjectId, userId]);

  // Удалить профиль из радара
  const removeProfile = useCallback(async (username: string, projectId?: string) => {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    const targetProjectId = projectId || currentProjectId;
    
    setProfiles(prev => prev.filter(p => 
      !(p.username.toLowerCase() === cleanUsername && 
        (targetProjectId ? p.projectId === targetProjectId : true))
    ));
    
    setRecentReels(prev => prev.filter(r => 
      !(r.owner?.username?.toLowerCase() === cleanUsername && 
        (targetProjectId ? r.projectId === targetProjectId : true))
    ));

    if (userId && userId !== 'anonymous') {
      if (isSharedProject) {
        // Общий проект: удаляем для всех (любой участник может убрать)
        await supabase
          .from('radar_profiles')
          .delete()
          .eq('project_id', targetProjectId)
          .eq('instagram_username', cleanUsername);
      } else {
        await supabase
          .from('radar_profiles')
          .delete()
          .eq('project_id', targetProjectId)
          .eq('user_id', userId)
          .eq('instagram_username', cleanUsername);
      }
    }
  }, [currentProjectId, userId, isSharedProject]);

  // Обновить частоту автообновления профиля
  const updateProfileFrequency = useCallback(async (
    username: string, 
    updateFrequencyDays: number, 
    projectId?: string
  ) => {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    const targetProjectId = projectId || currentProjectId;
    if (!targetProjectId || !userId || userId === 'anonymous') return;

    setProfiles(prev => prev.map(p => 
      p.username.toLowerCase() === cleanUsername && p.projectId === targetProjectId
        ? { ...p, updateFrequencyDays }
        : p
    ));

    if (isSharedProject) {
      await supabase
        .from('radar_profiles')
        .update({ update_frequency_days: updateFrequencyDays })
        .eq('project_id', targetProjectId)
        .eq('instagram_username', cleanUsername);
    } else {
      await supabase
        .from('radar_profiles')
        .update({ update_frequency_days: updateFrequencyDays })
        .eq('project_id', targetProjectId)
        .eq('user_id', userId)
        .eq('instagram_username', cleanUsername);
    }
  }, [currentProjectId, userId, isSharedProject]);

  // Получить рилсы одного пользователя и сохранить в inbox проекта
  const fetchUserReels = useCallback(async (username: string, projectId?: string) => {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    const targetProjectId = projectId || currentProjectId;
    
    console.log('[Radar] fetchUserReels:', { cleanUsername, targetProjectId, userId });
    
    if (!targetProjectId || !userId) {
      console.error('[Radar] Missing projectId or userId:', { targetProjectId, userId });
      return [];
    }
    
    setLoadingUsername(cleanUsername);
    
    try {
      console.log('[Radar] Calling /api/user-reels for:', cleanUsername);
      const response = await fetch('/api/user-reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername }),
      });

      console.log('[Radar] API response status:', response.status);
      
      if (!response.ok) {
        console.error('[Radar] Failed to fetch user reels:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('[Radar] API full response:', JSON.stringify(data).slice(0, 500));
      console.log('[Radar] API response parsed:', { 
        success: data.success, 
        reelsCount: data.reels?.length,
        message: data.message,
        apiUsed: data.api_used 
      });
      
      if (data.success && data.reels?.length > 0) {
        let newCount = 0;
        let updatedCount = 0;
        
        // Сохраняем каждый рилс в inbox проекта
        const savedReels: RadarReel[] = [];
        
        for (const reel of data.reels) {
          const result = await saveReelToInbox(reel, targetProjectId, userId);
          
          if (result?.created && result.id) {
            newCount++;
            savedReels.push({ ...reel, isNew: true, projectId: targetProjectId, savedToInbox: true });
            // Транскрибация только по кнопке — не запускаем автоматически
          } else if (result?.updated) {
            updatedCount++;
            savedReels.push({ ...reel, isNew: false, projectId: targetProjectId, savedToInbox: true });
          }
        }

        // Обновляем recent reels для UI (только последние 6 для мини-превью)
        setRecentReels(prev => {
          const filtered = prev.filter(r => r.owner?.username?.toLowerCase() !== cleanUsername);
          return [...savedReels.slice(0, 6), ...filtered].slice(0, 30);
        });

        // Обновляем статистику
        setStats(prev => ({
          newVideos: prev.newVideos + newCount,
          updatedVideos: prev.updatedVideos + updatedCount,
        }));

        const nowIso = new Date().toISOString();
        setProfiles(prev => prev.map(p => 
          p.username.toLowerCase() === cleanUsername && p.projectId === targetProjectId
            ? { ...p, lastChecked: nowIso, reelsCount: data.reels.length }
            : p
        ));

        // Сохраняем last_checked_at в Supabase
        if (userId && userId !== 'anonymous') {
          let updateQuery = supabase
            .from('radar_profiles')
            .update({ last_checked_at: nowIso, reels_count: data.reels.length })
            .eq('project_id', targetProjectId)
            .eq('instagram_username', cleanUsername);
          if (!isSharedProject) {
            updateQuery = updateQuery.eq('user_id', userId);
          }
          await updateQuery;
        }

        // Рассчитываем статистику профиля из уже полученных роликов — без доп. API запроса.
        // Обновляем только если данные устарели (>7 дней) или отсутствуют.
        const existingStats = await getProfileStats(cleanUsername);
        if (!existingStats || shouldUpdateStats(existingStats)) {
          saveProfileStatsFromReels(cleanUsername, data.reels).then(stats => {
            if (stats) {
              setProfileStatsCache(prev => new Map(prev).set(cleanUsername, stats));
              setProfiles(prev => prev.map(p =>
                p.username.toLowerCase() === cleanUsername && p.projectId === targetProjectId
                  ? { ...p, profileStats: stats }
                  : p
              ));
            }
          });
        }

        // Возвращаем ВСЕ видео профиля (не только последние 6)
        return data.reels.map((reel: any) => ({
          ...reel,
          isNew: savedReels.some(sr => sr.shortcode === reel.shortcode && sr.isNew),
          projectId: targetProjectId,
          savedToInbox: savedReels.some(sr => sr.shortcode === reel.shortcode),
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching user reels:', error);
      return [];
    } finally {
      setLoadingUsername(null);
    }
  }, [currentProjectId, userId, isSharedProject]);

  // Обновить статистику одного профиля
  const updateProfileStats = useCallback(async (username: string, forceUpdate = false) => {
    const cleanUsername = username.toLowerCase().replace('@', '');
    
    try {
      const stats = await getOrUpdateProfileStats(cleanUsername, forceUpdate);
      if (stats) {
        setProfileStatsCache(prev => new Map(prev).set(cleanUsername, stats));
        setProfiles(prev => prev.map(p => 
          p.username.toLowerCase() === cleanUsername
            ? { ...p, profileStats: stats }
            : p
        ));
        return stats;
      }
    } catch (err) {
      console.error(`[Radar] Error updating profile stats for @${username}:`, err);
    }
    return null;
  }, []);

  // Получить статистику профиля (из кэша или загрузить)
  const getProfileStats = useCallback((username: string): InstagramProfileStats | undefined => {
    return profileStatsCache.get(username.toLowerCase().replace('@', ''));
  }, [profileStatsCache]);

  // Обновить все профили текущего проекта
  const refreshAll = useCallback(async () => {
    console.log('[Radar] refreshAll called:', { 
      loading, 
      profilesCount: projectProfiles.length,
      userId,
      currentProjectId,
      profiles: projectProfiles.map(p => p.username)
    });
    
    if (loading) {
      console.log('[Radar] Already loading, skip');
      return;
    }
    
    if (projectProfiles.length === 0) {
      console.log('[Radar] No profiles to refresh');
      return;
    }
    
    if (!userId) {
      console.error('[Radar] No userId for refreshAll');
      return;
    }
    
    setLoading(true);
    setStats({ newVideos: 0, updatedVideos: 0 });
    
    for (const profile of projectProfiles) {
      console.log('[Radar] Fetching reels for:', profile.username);
      // fetchUserReels теперь сам считает статистику из полученных данных — доп. вызова не нужно
      await fetchUserReels(profile.username, profile.projectId);
      
      // Небольшая задержка между запросами
      await new Promise(r => setTimeout(r, 1000));
    }
    
    setLoading(false);
    console.log('[Radar] refreshAll completed');
  }, [projectProfiles, loading, fetchUserReels, userId, currentProjectId]);

  // Очистить профили текущего проекта
  const clearProject = useCallback(async () => {
    if (!currentProjectId) return;
    
    if (userId && userId !== 'anonymous') {
      await supabase
        .from('radar_profiles')
        .delete()
        .eq('project_id', currentProjectId)
        .eq('user_id', userId);
    }
    setProfiles(prev => prev.filter(p => p.projectId !== currentProjectId));
    setRecentReels(prev => prev.filter(r => r.projectId !== currentProjectId));
  }, [currentProjectId, userId]);

  // Очистить все
  const clearAll = useCallback(async () => {
    if (userId && userId !== 'anonymous') {
      await supabase
        .from('radar_profiles')
        .delete()
        .eq('user_id', userId);
    }
    setProfiles([]);
    setRecentReels([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_MIGRATED_KEY);
  }, [userId]);

  return {
    profiles: projectProfiles,
    allProfiles: profiles,
    recentReels: currentProjectId 
      ? recentReels.filter(r => r.projectId === currentProjectId)
      : recentReels,
    loading,
    loadingUsername,
    stats,
    profileStatsCache,
    profilesDueCount,
    dueProfiles,
    addProfile,
    removeProfile,
    updateProfileFrequency,
    fetchUserReels,
    refreshAll,
    updateProfileStats,
    getProfileStats,
    clearProject,
    clearAll,
  };
}
