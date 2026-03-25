import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, setUserContext } from '../utils/supabase';
import { useFlowStore } from '../stores/flowStore';
import { IncomingVideo } from '../types';
import { useAuth } from './useAuth';
import { useProjectContext } from '../contexts/ProjectContext';
import { toast } from 'sonner';
import { 
  getOrCreateGlobalVideo, 
  getTranscriptionByShortcode,
  startGlobalTranscription,
} from '../services/globalVideoService';

interface SavedVideo {
  id: string;
  user_id: string;
  video_id: string;
  shortcode?: string;
  thumbnail_url?: string;
  video_url?: string;
  caption?: string;
  owner_username?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  added_at: string;
  // Транскрибация и перевод
  download_url?: string;
  storage_video_url?: string;
  transcript_id?: string;
  transcript_status?: string;
  transcript_text?: string;
  translation_text?: string;
  // Сценарий
  script_text?: string;
  // Проекты
  project_id?: string;
  folder_id?: string;
  // Ручное видео (без ссылки)
  is_manual?: boolean;
  // Ссылки (legacy)
  draft_link?: string;
  final_link?: string;
  // Ответственные (legacy)
  script_responsible?: string;
  editing_responsible?: string;
  // Значения ссылок/ответственных: по templateId (из шаблона проекта) или legacy { label, value }
  links?: { templateId?: string; label?: string; value: string }[];
  responsibles?: { templateId?: string; label?: string; value: string }[];
}

/** Элемент списка ссылок/ответственных (label из шаблона проекта, value из видео) */
export type LinkItem = { label: string; value: string };
export type ResponsibleItem = { label: string; value: string };

/** Значение по шаблону проекта (сохраняется в saved_videos) */
export type LinkValueByTemplate = { templateId: string; value: string };
export type ResponsibleValueByTemplate = { templateId: string; value: string };
export type AddVideoSaveAction = 'created' | 'updated';
export type AddVideoResult = (IncomingVideo & { saveAction?: AddVideoSaveAction }) | null;
export type DuplicateVideoChoice = 'update' | 'copy' | 'cancel';

export interface DuplicateVideoPromptState {
  isOpen: boolean;
  scopeLabel: 'project' | 'app';
  title: string;
  ownerUsername?: string;
}

const PAGE_SIZE = 60;
/** Для viral/recent — загружаем все в папке (до лимита), чтобы сортировка была по всей папке */
const FULL_SORT_LIMIT = 2000;

export type InboxSortBy = 'viral' | 'views' | 'likes' | 'date' | 'recent' | 'views_from_avg';

export interface UseInboxVideosOptions {
  /** Фильтр по папке: null = только "без папки", string = конкретная папка, undefined = все (для drawer) */
  folderId?: string | null;
  /** Сортировка — применяется на уровне БД для views/likes/date/recent; viral сортируется на клиенте */
  sortBy?: InboxSortBy;
}

/**
 * Хук для работы с сохранёнными видео пользователя.
 * Загружает видео страницами, чтобы не лагать на проектах с большим количеством видео.
 * При передаче folderId загрузка и пагинация работают только по видео в этой папке.
 */
export function useInboxVideos(options?: UseInboxVideosOptions) {
  const { folderId: filterFolderId, sortBy = 'recent' } = options ?? {};
  const [videos, setVideos] = useState<IncomingVideo[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [duplicateVideoPrompt, setDuplicateVideoPrompt] = useState<DuplicateVideoPromptState | null>(null);
  const { setIncomingVideos } = useFlowStore();
  const { user } = useAuth();
  const { currentProjectId } = useProjectContext();
  const duplicateVideoResolverRef = useRef<((choice: DuplicateVideoChoice) => void) | null>(null);
  
  // Получаем user_id из контекста авторизации
  const getUserId = useCallback((): string => {
    return user?.id || 'anonymous';
  }, [user]);

  // Преобразование из БД в IncomingVideo
  const transformVideo = useCallback((video: SavedVideo): IncomingVideo & { 
    shortcode?: string;
    is_manual?: boolean;
    view_count?: number; 
    like_count?: number; 
    comment_count?: number;
    owner_username?: string;
    folder_id?: string;
    project_id?: string;
    transcript_id?: string;
    transcript_status?: string;
    transcript_text?: string;
    translation_text?: string;
    script_text?: string;
    download_url?: string;
    storage_video_url?: string;
    taken_at?: number;
    draft_link?: string;
    final_link?: string;
    script_responsible?: string;
    editing_responsible?: string;
    links?: { templateId?: string; label?: string; value: string }[];
    responsibles?: { templateId?: string; label?: string; value: string }[];
  } => {
    const links = Array.isArray(video.links) && video.links.length > 0
      ? video.links.map((row: any) => ({
          templateId: row.templateId,
          label: row.label,
          value: String(row.value ?? ''),
        }))
      : [
          { label: 'Заготовка', value: video.draft_link || '' },
          { label: 'Готовое', value: video.final_link || '' },
        ];
    const responsibles = Array.isArray(video.responsibles) && video.responsibles.length > 0
      ? video.responsibles.map((row: any) => ({
          templateId: row.templateId,
          label: row.label,
          value: String(row.value ?? ''),
        }))
      : [
          { label: 'За сценарий', value: video.script_responsible || '' },
          { label: 'За монтаж', value: video.editing_responsible || '' },
        ];
    const isManual = !!(video as any).is_manual;
    return {
      id: video.id,
      title: video.caption || 'Без названия',
      previewUrl: video.thumbnail_url || '',
      url: isManual ? '' : (video.video_url || (video.shortcode ? `https://instagram.com/reel/${video.shortcode}` : '')),
      shortcode: video.shortcode,
      is_manual: isManual,
      receivedAt: new Date(video.added_at),
      view_count: video.view_count,
      like_count: video.like_count,
      comment_count: video.comment_count,
      owner_username: video.owner_username,
      folder_id: video.folder_id || undefined,
      project_id: video.project_id,
      transcript_id: video.transcript_id,
      transcript_status: video.transcript_status,
      transcript_text: video.transcript_text,
      translation_text: video.translation_text,
      script_text: video.script_text,
      download_url: video.download_url,
      storage_video_url: video.storage_video_url,
      taken_at: video.taken_at,
      draft_link: video.draft_link,
      final_link: video.final_link,
      script_responsible: video.script_responsible,
      editing_responsible: video.editing_responsible,
      links,
      responsibles,
    };
  }, []);

  // Сортировка на уровне БД (viral — через view saved_videos_with_viral и viral_coef)
  const getOrderConfig = useCallback(() => {
    switch (sortBy) {
      case 'views':
      case 'views_from_avg':
        return { column: 'view_count' as const, ascending: false, nullsFirst: false };
      case 'likes':
        return { column: 'like_count' as const, ascending: false, nullsFirst: false };
      case 'date':
        return { column: 'taken_at' as const, ascending: false, nullsFirst: false };
      case 'viral':
        return { column: 'viral_coef' as const, ascending: false, nullsFirst: false };
      case 'recent':
      default:
        return { column: 'added_at' as const, ascending: false };
    }
  }, [sortBy]);

  // Подсчёт видео по папкам (для бейджей) — отдельный лёгкий запрос
  const fetchFolderCounts = useCallback(async () => {
    const userId = getUserId();
    try {
      let query = supabase.from('saved_videos').select('folder_id');
      if (currentProjectId) {
        query = query.eq('project_id', currentProjectId);
        const { data: membersData } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', currentProjectId)
          .in('status', ['active', 'pending']);
        const isSharedProject = membersData && membersData.length > 0;
        if (isSharedProject) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('owner_id')
            .eq('id', currentProjectId)
            .single();
          const allUserIds = [...new Set([...membersData!.map(m => m.user_id), projectData?.owner_id].filter(Boolean))];
          query = query.in('user_id', allUserIds);
        } else {
          query = query.eq('user_id', userId);
        }
      } else {
        query = query.is('project_id', null).eq('user_id', userId);
      }
      const { data } = await query;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: { folder_id: string | null }) => {
        const key = row.folder_id ?? '__null__';
        counts[key] = (counts[key] || 0) + 1;
      });
      setFolderCounts(counts);
    } catch {
      setFolderCounts({});
    }
  }, [currentProjectId, getUserId]);

  // Таблица/view: для viral — view с viral_coef, иначе saved_videos
  const tableOrView = sortBy === 'viral' ? 'saved_videos_with_viral' : 'saved_videos';

  const findExistingSavedVideos = useCallback(async (
    shortcode: string,
    targetProjectId: string | null,
    userId: string
  ) => {
    let query = supabase
      .from('saved_videos')
      .select('id, transcript_status, transcript_text, owner_username, caption, added_at')
      .eq('shortcode', shortcode)
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (targetProjectId) {
      query = query.eq('project_id', targetProjectId);
    } else {
      query = query.is('project_id', null);
    }

    const { data } = await query;
    return data ?? [];
  }, []);

  const requestDuplicateVideoChoice = useCallback((payload: DuplicateVideoPromptState) => {
    setDuplicateVideoPrompt(payload);

    return new Promise<DuplicateVideoChoice>((resolve) => {
      duplicateVideoResolverRef.current = resolve;
    });
  }, []);

  const resolveDuplicateVideoPrompt = useCallback((choice: DuplicateVideoChoice) => {
    duplicateVideoResolverRef.current?.(choice);
    duplicateVideoResolverRef.current = null;
    setDuplicateVideoPrompt(null);
  }, []);

  // Загрузка видео пользователя
  const fetchVideos = useCallback(async () => {
    const userId = getUserId();
    console.log('[InboxVideos] Fetching videos for user:', userId, 'project:', currentProjectId, 'folder:', filterFolderId, 'sortBy:', sortBy);
    
    try {
      let query = supabase
        .from(tableOrView as 'saved_videos')
        .select('*');
      
      // Фильтр по папке: при выборе папки загружаем только видео из неё
      if (filterFolderId !== undefined) {
        if (filterFolderId === null) {
          query = query.is('folder_id', null);
        } else {
          query = query.eq('folder_id', filterFolderId);
        }
      }
      
      // Фильтруем строго по проекту - если проект выбран, показываем ТОЛЬКО видео этого проекта
      if (currentProjectId) {
        const { data: membersData } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', currentProjectId)
          .in('status', ['active', 'pending']);
        
        const isSharedProject = membersData && membersData.length > 0;
        
        if (isSharedProject) {
          const memberUserIds = membersData.map(m => m.user_id);
          const { data: projectData } = await supabase
            .from('projects')
            .select('owner_id')
            .eq('id', currentProjectId)
            .single();
          
          const allUserIds = [...new Set([...memberUserIds, projectData?.owner_id].filter(Boolean))];
          
          query = query
            .eq('project_id', currentProjectId)
            .in('user_id', allUserIds);
        } else {
          query = query
            .eq('project_id', currentProjectId)
            .eq('user_id', userId);
        }
      } else {
        query = query
          .is('project_id', null)
          .eq('user_id', userId);
      }
      
      const orderConfig = getOrderConfig();
      const orderQuery = 'nullsFirst' in orderConfig
        ? query.order(orderConfig.column, { ascending: orderConfig.ascending, nullsFirst: orderConfig.nullsFirst })
        : query.order(orderConfig.column, { ascending: orderConfig.ascending });
      
      // Для views_from_avg — загружаем все в папке (сортировка по отклонению на клиенте); viral уже в БД — пагинация как обычно
      const needsFullSort = sortBy === 'views_from_avg' && filterFolderId !== undefined;
      const initialLimit = needsFullSort ? FULL_SORT_LIMIT : PAGE_SIZE;
      
      const { data, error: fetchError } = await orderQuery.range(0, initialLimit - 1);

      console.log('[InboxVideos] Fetch result:', { count: data?.length, error: fetchError, projectId: currentProjectId, sortBy, needsFullSort, table: tableOrView });

      if (fetchError) {
        console.error('Error fetching saved videos:', fetchError);
        setVideos([]);
        setIncomingVideos([]);
        setHasMore(false);
      } else if (data) {
        const transformedVideos = data.map(transformVideo);
        setVideos(transformedVideos);
        setIncomingVideos(transformedVideos);
        setHasMore(needsFullSort ? data.length === FULL_SORT_LIMIT : data.length === PAGE_SIZE);
        console.log('[InboxVideos] Loaded', transformedVideos.length, 'videos for project', currentProjectId);
      } else {
        setVideos([]);
        setIncomingVideos([]);
        setHasMore(false);
      }
      fetchFolderCounts();
    } catch (err) {
      console.error('Error loading saved videos:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch videos'));
    } finally {
      setLoading(false);
    }
  }, [setIncomingVideos, transformVideo, getUserId, currentProjectId, filterFolderId, sortBy, getOrderConfig, fetchFolderCounts, tableOrView]);

  // Подгрузить следующую страницу (для проектов с большим количеством видео)
  // Пагинация учитывает folderId — подгружаем следующие страницы только из выбранной папки
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    const userId = getUserId();
    setLoadingMore(true);
    try {
      let query = supabase.from(tableOrView as 'saved_videos').select('*');
      
      // Тот же фильтр по папке, что и при первой загрузке
      if (filterFolderId !== undefined) {
        if (filterFolderId === null) {
          query = query.is('folder_id', null);
        } else {
          query = query.eq('folder_id', filterFolderId);
        }
      }
      
      if (currentProjectId) {
        const { data: membersData } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', currentProjectId)
          .in('status', ['active', 'pending']);
        const isSharedProject = membersData && membersData.length > 0;
        if (isSharedProject) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('owner_id')
            .eq('id', currentProjectId)
            .single();
          const memberUserIds = membersData!.map(m => m.user_id);
          const allUserIds = [...new Set([...memberUserIds, projectData?.owner_id].filter(Boolean))];
          query = query.eq('project_id', currentProjectId).in('user_id', allUserIds);
        } else {
          query = query.eq('project_id', currentProjectId).eq('user_id', userId);
        }
      } else {
        query = query.is('project_id', null).eq('user_id', userId);
      }
      
      const offset = videos.length;
      const orderConfig = getOrderConfig();
      const orderQuery = 'nullsFirst' in orderConfig
        ? query.order(orderConfig.column, { ascending: orderConfig.ascending, nullsFirst: orderConfig.nullsFirst })
        : query.order(orderConfig.column, { ascending: orderConfig.ascending });
      
      const { data, error: fetchError } = await orderQuery.range(offset, offset + PAGE_SIZE - 1);
      if (fetchError) return;
      if (data && data.length > 0) {
        const transformed = data.map(transformVideo);
        setVideos(prev => {
          const next = [...prev, ...transformed];
          setIncomingVideos(next);
          return next;
        });
        setHasMore(data.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, getUserId, currentProjectId, videos.length, transformVideo, setIncomingVideos, filterFolderId, getOrderConfig, tableOrView]);

  // Перезагружаем видео при смене пользователя, проекта, папки или сортировки
  useEffect(() => {
    if (user) {
      fetchVideos();
    }
  }, [user, currentProjectId, filterFolderId, sortBy, fetchVideos]);

  // Слушаем события обновления видео от других участников проекта
  useEffect(() => {
    const handleVideosUpdated = (event: CustomEvent) => {
      const { projectId } = event.detail;
      if (projectId !== currentProjectId) return;
      // Рефетчим только если не загружено больше одной страницы — иначе потеряем подгруженные видео
      const currentCount = videos.length;
      if (currentCount <= PAGE_SIZE) {
        console.log('[InboxVideos] Videos updated by another user, refetching...');
        fetchVideos();
      }
    };

    window.addEventListener('videos-updated', handleVideosUpdated as EventListener);
    return () => {
      window.removeEventListener('videos-updated', handleVideosUpdated as EventListener);
    };
  }, [currentProjectId, fetchVideos, videos.length]);

  /**
   * Добавляет видео в сохранённые
   * Использует глобальную таблицу videos для транскрибаций
   */
  const addVideoToInbox = useCallback(async (video: {
    title: string;
    previewUrl?: string;
    url?: string;
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    ownerUsername?: string;
    shortcode?: string;
    videoId?: string;
    projectId?: string;
    folderId?: string;
    takenAt?: string | number;
    /** Ручное видео без ссылки — только сценарий */
    isManual?: boolean;
    /** Текст сценария (для ручных видео) */
    script_text?: string;
  }): Promise<AddVideoResult> => {
    const userId = getUserId();
    const isManual = !!video.isManual;
    const url = video.url ?? '';
    
    // Используем currentProjectId из контекста, если projectId не передан явно
    const targetProjectId = video.projectId !== undefined ? video.projectId : currentProjectId || null;
    
    // Извлекаем shortcode из URL если его нет (для ручных видео — null)
    const shortcode = isManual ? undefined : (video.shortcode || extractShortcode(url) || undefined);
    const videoId = video.videoId || shortcode || (isManual ? `manual-${Date.now()}` : `video-${Date.now()}`);
    
    console.log('[InboxVideos] Adding video:', { 
      userId, 
      videoId, 
      shortcode,
      projectId: targetProjectId, 
      folderId: video.folderId,
      url,
      isManual,
    });

    let existingUserVideos: Awaited<ReturnType<typeof findExistingSavedVideos>> = [];
    let shouldCreateCopy = false;
    if (shortcode && !isManual) {
      existingUserVideos = await findExistingSavedVideos(shortcode, targetProjectId, userId);

      if (existingUserVideos.length > 0) {
        const duplicateChoice = await requestDuplicateVideoChoice({
          isOpen: true,
          scopeLabel: targetProjectId ? 'project' : 'app',
          title: video.title,
          ownerUsername: video.ownerUsername || existingUserVideos[0]?.owner_username || undefined,
        });

        if (duplicateChoice === 'cancel') {
          toast.info('Видео уже есть', {
            description: 'Существующую запись оставили без изменений',
          });
          return null;
        }

        shouldCreateCopy = duplicateChoice === 'copy';
      }
    }
    
    // Конвертируем taken_at в число (unix timestamp)
    let takenAtTimestamp: number | undefined;
    if (video.takenAt) {
      if (typeof video.takenAt === 'number') {
        takenAtTimestamp = video.takenAt > 1e12 ? Math.floor(video.takenAt / 1000) : video.takenAt;
      } else if (typeof video.takenAt === 'string') {
        const ts = Number(video.takenAt);
        if (!isNaN(ts)) {
          takenAtTimestamp = ts > 1e12 ? Math.floor(ts / 1000) : ts;
        }
      }
    }
    
    // Пытаемся сохранить превью в Supabase Storage (постоянный URL вместо истекающего Instagram)
    // Для ручных видео — previewUrl опционален, оставляем пустым или как передан
    let thumbnailToSave = video.previewUrl ?? '';
    let reelInfoVideoUrl: string | undefined;
    if (!isManual && !thumbnailToSave && shortcode) {
      try {
        const infoRes = await fetch('/api/reel-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shortcode, url, source: 'lenta' }),
        });
        const infoData = await infoRes.json();
        thumbnailToSave = infoData?.thumbnail_url || infoData?.carousel_slides?.[0] || '';
        if (infoData?.is_video && infoData?.video_url) reelInfoVideoUrl = infoData.video_url;
      } catch {
        /* ignore */
      }
    }
    if (!isManual && shortcode && thumbnailToSave && !thumbnailToSave.includes('supabase')) {
      try {
        const res = await fetch('/api/save-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'thumbnail', url: thumbnailToSave, shortcode }),
        });
        const data = await res.json();
        if (data.success && data.storageUrl) {
          thumbnailToSave = data.storageUrl;
        }
      } catch {
        /* ignore */
      }
    }
    if (!isManual && shortcode && reelInfoVideoUrl) {
      fetch('/api/save-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'video', shortcode, url: reelInfoVideoUrl }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) fetchVideos();
        })
        .catch(() => {});
    }

    let localVideo: (IncomingVideo & {
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      owner_username?: string;
      taken_at?: number;
      is_manual?: boolean;
    }) | null = null;

    if (existingUserVideos.length === 0 || shouldCreateCopy) {
      localVideo = {
        id: `local-${Date.now()}`,
        title: video.title,
        previewUrl: thumbnailToSave,
        url,
        is_manual: isManual,
        receivedAt: new Date(),
        view_count: video.viewCount,
        like_count: video.likeCount,
        comment_count: video.commentCount,
        owner_username: video.ownerUsername,
        taken_at: takenAtTimestamp,
      };

      // Оптимистичное обновление UI только для новых видео
      setVideos(prev => [localVideo as IncomingVideo, ...prev]);
      setIncomingVideos([localVideo as IncomingVideo, ...useFlowStore.getState().incomingVideos]);
    }

    try {
      // 1. СНАЧАЛА проверяем/создаём видео в ГЛОБАЛЬНОЙ таблице videos (только для видео по ссылке)
      let globalVideo = null;
      let existingTranscription = null;
      
      if (shortcode && !isManual) {
        existingTranscription = await getTranscriptionByShortcode(shortcode);
        console.log('[InboxVideos] Existing transcription check:', existingTranscription);
        
        globalVideo = await getOrCreateGlobalVideo({
          shortcode,
          url,
          thumbnailUrl: thumbnailToSave,
          caption: video.title,
          ownerUsername: video.ownerUsername,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          takenAt: takenAtTimestamp,
        });
        
        console.log('[InboxVideos] Global video:', globalVideo?.id, 'transcript:', globalVideo?.transcript_status);
      }
      
      let data;
      let error;

      const baseVideoData: Record<string, unknown> = {
        thumbnail_url: thumbnailToSave,
        video_url: isManual ? null : url,
        caption: video.title,
        is_manual: isManual,
        ...(video.script_text !== undefined && { script_text: video.script_text }),
        owner_username: video.ownerUsername,
        view_count: video.viewCount,
        like_count: video.likeCount,
        comment_count: video.commentCount,
        project_id: targetProjectId,
        folder_id: video.folderId || null,
        taken_at: takenAtTimestamp,
      };

      if (existingTranscription?.hasTranscription) {
        baseVideoData.transcript_status = existingTranscription.transcriptStatus;
        baseVideoData.transcript_text = existingTranscription.transcriptText;
        console.log('[InboxVideos] Copying transcription from global DB');
      }

      if (existingUserVideos.length > 0 && shortcode && !shouldCreateCopy) {
        console.log('[InboxVideos] Duplicate found, updating existing videos:', existingUserVideos.length);

        let updateQuery = supabase
          .from('saved_videos')
          .update(baseVideoData)
          .eq('shortcode', shortcode)
          .eq('user_id', userId);

        if (targetProjectId) {
          updateQuery = updateQuery.eq('project_id', targetProjectId);
        } else {
          updateQuery = updateQuery.is('project_id', null);
        }

        const updateResult = await updateQuery.select();
        error = updateResult.error;
        data = updateResult.data?.[0] ?? null;
      }

      if (!existingUserVideos.length || shouldCreateCopy) {
        console.log('[InboxVideos] Creating new user video');

        const insertData: Record<string, unknown> = {
          user_id: userId,
          video_id: shouldCreateCopy ? `${videoId}-${Date.now()}` : videoId,
          shortcode: shortcode ?? null,
          ...baseVideoData,
        };

        const insertResult = await supabase
          .from('saved_videos')
          .insert(insertData)
          .select()
          .single();
        data = insertResult.data;
        error = error || insertResult.error;
      }

      if (error) {
        console.error('[InboxVideos] Error saving video:', error);
        return localVideo;
      }

      if (data) {
        const saveAction: AddVideoSaveAction = (!existingUserVideos.length || shouldCreateCopy) ? 'created' : 'updated';
        const savedVideo = {
          ...transformVideo(data),
          saveAction,
        };

        if (localVideo) {
          // Заменяем локальное видео на сохранённое
          setVideos(prev => [savedVideo, ...prev.filter(v => v.id !== localVideo.id)]);
          setIncomingVideos([savedVideo, ...useFlowStore.getState().incomingVideos.filter(v => v.id !== localVideo.id)]);
        } else {
          await fetchVideos();
        }
        
        // 4. Транскрибация только по кнопке — не запускаем автоматически
        if (existingTranscription?.hasTranscription) {
          toast.success('Транскрибация найдена', {
            description: 'Видео уже было обработано ранее',
          });
        }

        if (existingUserVideos.length > 0 && shouldCreateCopy) {
          toast.success('Видео уже было в проекте', {
            description: 'Обновили существующие данные и добавили копию',
          });
        } else if (saveAction === 'updated') {
          toast.success('Видео уже было в приложении', {
            description: 'Обновили данные существующей записи',
          });
        }
        
        // Отправляем событие синхронизации для общих проектов
        if (targetProjectId) {
          window.dispatchEvent(new CustomEvent('videos-updated', { 
            detail: { projectId: targetProjectId } 
          }));
        }
        
        fetchFolderCounts();
        return savedVideo;
      }

      return localVideo;
    } catch (err) {
      console.error('Error saving video:', err);
      return localVideo;
    }
  }, [setIncomingVideos, transformVideo, getUserId, currentProjectId, findExistingSavedVideos, requestDuplicateVideoChoice, fetchFolderCounts, fetchVideos]);

  /**
   * Ручной запуск транскрибации (для кнопки "Транскрибировать")
   * Использует глобальный сервис
   */
  const startVideoProcessing = useCallback(async (videoDbId: string, instagramUrl: string) => {
    console.log('[InboxVideos] Manual transcription request for:', instagramUrl);
    
    const shortcode = extractShortcode(instagramUrl);
    
    // Сначала проверяем есть ли уже транскрибация в глобальной таблице
    if (shortcode) {
      const existing = await getTranscriptionByShortcode(shortcode);
      
      if (existing.hasTranscription) {
        console.log('[InboxVideos] Found existing transcription in global DB');
        
        // Копируем к пользователю
        await supabase
          .from('saved_videos')
          .update({
            transcript_status: existing.transcriptStatus,
            transcript_text: existing.transcriptText,
          })
          .eq('id', videoDbId);
        
        toast.success('Транскрибация найдена', {
          description: 'Видео уже было обработано ранее',
        });
        
        fetchVideos();
        return;
      }
      
      // Получаем или создаём глобальное видео
      const globalVideo = await getOrCreateGlobalVideo({
        shortcode,
        url: instagramUrl,
      });
      
      // Запускаем глобальную транскрибацию
      toast.success('Видео обрабатывается', {
        description: 'Транскрибация запущена',
      });
      
      startGlobalTranscription(videoDbId, globalVideo?.id, shortcode, instagramUrl);
    } else {
      console.error('[InboxVideos] No shortcode found for:', instagramUrl);
      toast.error('Не удалось определить видео');
    }
  }, [fetchVideos]);

  /**
   * Сохраняет превью по URL в Storage (если картинка загрузилась — workers.dev, Instagram и т.д.)
   */
  const saveThumbnailFromUrl = useCallback(async (videoId: string, shortcode: string, url: string) => {
    if (!url || url.includes('supabase.co')) return;
    try {
      const saveRes = await fetch('/api/save-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'thumbnail', url, shortcode }),
      });
      const data = await saveRes.json();
      if (data.success && data.storageUrl) {
        await supabase.from('saved_videos').update({ thumbnail_url: data.storageUrl }).eq('id', videoId);
        await supabase.from('videos').update({ thumbnail_url: data.storageUrl }).eq('shortcode', shortcode);
        fetchVideos();
      }
    } catch {
      /* silent */
    }
  }, [fetchVideos]);

  /**
   * Обновляет превью: reel-info → save-media (type=thumbnail) → update DB.
   * Вызывать при onError загрузки картинки (истёкший Instagram URL).
   */
  const refreshThumbnail = useCallback(async (videoId: string, shortcode: string, silent = false) => {
    try {
      // Сначала проверяем таблицу videos (общая для всего проекта) — другой участник мог уже
      // сохранить превью в Storage. Если там есть supabase.co URL — используем его без API вызова.
      const { data: globalVideo } = await supabase
        .from('videos')
        .select('thumbnail_url')
        .eq('shortcode', shortcode)
        .maybeSingle();

      const existingStorageUrl = globalVideo?.thumbnail_url?.includes('supabase.co')
        ? globalVideo.thumbnail_url
        : null;

      let storageUrl = existingStorageUrl;

      if (!storageUrl) {
        // В общей таблице нет storage URL — идём в RapidAPI
        const res = await fetch('/api/reel-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shortcode, source: 'lenta' }),
        });
        const data = await res.json();
        const thumbUrl = data?.thumbnail_url || data?.carousel_slides?.[0];
        if (!thumbUrl) {
          if (!silent) toast.error('Не удалось получить превью');
          return;
        }
        const saveRes = await fetch('/api/save-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'thumbnail', url: thumbUrl, shortcode }),
        });
        const saveData = await saveRes.json();
        if (!saveData.success || !saveData.storageUrl) {
          if (!silent) toast.error('Не удалось сохранить превью');
          return;
        }
        storageUrl = saveData.storageUrl;
        // Обновляем глобальную таблицу чтобы следующие участники тоже нашли готовый URL
        await supabase
          .from('videos')
          .update({ thumbnail_url: storageUrl })
          .eq('shortcode', shortcode);
      }

      await supabase
        .from('saved_videos')
        .update({ thumbnail_url: storageUrl })
        .eq('id', videoId);

      if (!silent) toast.success('Превью обновлено');
      fetchVideos();
    } catch {
      if (!silent) toast.error('Ошибка обновления превью');
    }
  }, [fetchVideos]);

  /**
   * Обновляет папку видео
   * В общих проектах любой участник может перемещать любое видео — фильтруем по project_id, а не user_id
   */
  const updateVideoFolder = useCallback(async (videoId: string, newFolderId: string | null) => {
    const userId = getUserId();
    const folderValue = newFolderId === 'inbox' ? null : newFolderId;

    // Оптимистичное обновление: обновляем папку и убираем из списка, если видео переместили в другую папку
    setVideos(prev => {
      const updated = prev.map(v =>
        v.id === videoId ? { ...v, folder_id: folderValue } as any : v
      );
      let result = updated;
      if (filterFolderId !== undefined) {
        result = updated.filter(v => {
          const fid = (v as any).folder_id;
          return filterFolderId === null ? (fid == null) : fid === filterFolderId;
        });
      }
      setIncomingVideos(result);
      return result;
    });

    try {
      let query = supabase
        .from('saved_videos')
        .update({ folder_id: folderValue })
        .eq('id', videoId);

      if (currentProjectId) {
        query = query.eq('project_id', currentProjectId);
      } else {
        query = query.eq('user_id', userId);
      }

      const { error } = await query;

      if (error) {
        console.error('Error updating video folder:', error);
        fetchVideos();
        return false;
      }

      fetchFolderCounts();
      return true;
    } catch (err) {
      console.error('Error updating video folder:', err);
      fetchVideos();
      return false;
    }
  }, [getUserId, currentProjectId, fetchVideos, fetchFolderCounts, filterFolderId]);

  /**
   * Удаляет видео из сохранённых
   * Возвращает данные удаленного видео для возможности отмены
   */
  const removeVideo = useCallback(async (videoId: string) => {
    const userId = getUserId();
    
    // Сохраняем данные видео перед удалением (для отмены)
    const videoToDelete = videos.find(v => v.id === videoId);
    const videoData = videoToDelete ? {
      id: videoToDelete.id,
      title: videoToDelete.title,
      previewUrl: videoToDelete.previewUrl,
      url: videoToDelete.url,
      view_count: (videoToDelete as any).view_count,
      like_count: (videoToDelete as any).like_count,
      comment_count: (videoToDelete as any).comment_count,
      owner_username: (videoToDelete as any).owner_username,
      folder_id: (videoToDelete as any).folder_id,
      project_id: (videoToDelete as any).project_id,
      taken_at: (videoToDelete as any).taken_at,
      transcript_text: (videoToDelete as any).transcript_text,
      translation_text: (videoToDelete as any).translation_text,
      script_text: (videoToDelete as any).script_text,
    } : null;
    
    // Оптимистичное удаление
    setVideos(prev => prev.filter(v => v.id !== videoId));
    setIncomingVideos(useFlowStore.getState().incomingVideos.filter(v => v.id !== videoId));

    try {
      await supabase
        .from('saved_videos')
        .delete()
        .eq('user_id', userId)
        .eq('id', videoId);
      fetchFolderCounts();
    } catch (err) {
      console.error('Error removing video:', err);
      // Восстанавливаем при ошибке
      if (videoToDelete) {
        setVideos(prev => [...prev, videoToDelete]);
      }
    }
    
    return videoData;
  }, [setIncomingVideos, getUserId, videos, fetchFolderCounts]);

  // Вспомогательная функция для извлечения shortcode
  const extractShortcode = (url: string): string | undefined => {
    const match = url.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : undefined;
  };

  /**
   * Восстановить удаленное видео
   */
  const restoreVideo = useCallback(async (videoData: any) => {
    const userId = getUserId();
    
    if (!videoData) return false;
    
    try {
      // Восстанавливаем в БД
      const { error } = await supabase
        .from('saved_videos')
        .insert({
          id: videoData.id,
          user_id: userId,
          video_id: videoData.id, // Используем id как video_id
          shortcode: extractShortcode(videoData.url),
          thumbnail_url: videoData.previewUrl,
          video_url: videoData.url,
          caption: videoData.title,
          owner_username: videoData.owner_username,
          view_count: videoData.view_count,
          like_count: videoData.like_count,
          comment_count: videoData.comment_count,
          folder_id: videoData.folder_id,
          project_id: videoData.project_id,
          taken_at: videoData.taken_at,
          transcript_text: videoData.transcript_text,
          translation_text: videoData.translation_text,
          script_text: videoData.script_text,
        });
      
      if (error) {
        console.error('Error restoring video:', error);
        return false;
      }
      
      // Перезагружаем видео
      await fetchVideos();
      return true;
    } catch (err) {
      console.error('Error restoring video:', err);
      return false;
    }
  }, [getUserId, fetchVideos, extractShortcode]);

  /**
   * Для совместимости со старым кодом
   */
  const markVideoAsOnCanvas = useCallback(async (videoId: string) => {
    // Просто удаляем из списка входящих
    setVideos(prev => prev.filter(v => v.id !== videoId));
    setIncomingVideos(useFlowStore.getState().incomingVideos.filter(v => v.id !== videoId));
  }, [setIncomingVideos]);

  /**
   * Обновляет сценарий видео
   */
  const updateVideoScript = useCallback(async (videoId: string, scriptText: string) => {
    try {
      const { error } = await supabase
        .from('saved_videos')
        .update({ script_text: scriptText })
        .eq('id', videoId);
      
      if (error) {
        console.error('Error updating video script:', error);
        return false;
      }
      
      // Обновляем локальное состояние
      setVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, script_text: scriptText } as any : v
      ));
      
      return true;
    } catch (err) {
      console.error('Error updating video script:', err);
      return false;
    }
  }, []);

  /**
   * Обновляет значения ссылок по шаблону проекта (только value по templateId)
   */
  const updateVideoLinks = useCallback(async (
    videoId: string,
    items: LinkValueByTemplate[]
  ) => {
    try {
      const userId = getUserId();
      await setUserContext(userId);

      const payload = items.map(({ templateId, value }) => ({ templateId, value: value || '' }));

      const { data, error } = await supabase
        .from('saved_videos')
        .update({ links: payload })
        .eq('id', videoId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Error updating video links:', error);
        return false;
      }
      if (!data) {
        console.warn('updateVideoLinks: no row updated, check RLS or video id');
        return false;
      }

      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, links: payload } as any : v
      ));
      return true;
    } catch (err) {
      console.error('Error updating video links:', err);
      return false;
    }
  }, [getUserId]);

  /**
   * Обновляет значения ответственных по шаблону проекта (только value по templateId)
   */
  const updateVideoResponsible = useCallback(async (
    videoId: string,
    items: ResponsibleValueByTemplate[]
  ) => {
    try {
      const userId = getUserId();
      await setUserContext(userId);

      const payload = items.map(({ templateId, value }) => ({ templateId, value: value || '' }));

      const { data, error } = await supabase
        .from('saved_videos')
        .update({ responsibles: payload })
        .eq('id', videoId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Error updating video responsibles:', error);
        return false;
      }
      if (!data) {
        console.warn('updateVideoResponsible: no row updated, check RLS or video id');
        return false;
      }

      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, responsibles: payload } as any : v
      ));
      return true;
    } catch (err) {
      console.error('Error updating video responsibles:', err);
      return false;
    }
  }, [getUserId]);

  /**
   * Привязывает исходник (saved_video) к выложенному ролику: проставляет shortcode.
   * Используется для связи «исходник из папки» ↔ «ролик в аналитике».
   */
  const updateVideoShortcode = useCallback(async (videoId: string, shortcode: string | null): Promise<boolean> => {
    try {
      const userId = getUserId();
      await setUserContext(userId);

      const { data, error } = await supabase
        .from('saved_videos')
        .update({ shortcode: shortcode || null })
        .eq('id', videoId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Error updating video shortcode:', error);
        return false;
      }
      if (!data) {
        console.warn('updateVideoShortcode: no row updated, check RLS or video id');
        return false;
      }

      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, shortcode: shortcode ?? undefined } as any : v
      ));
      return true;
    } catch (err) {
      console.error('Error updating video shortcode:', err);
      return false;
    }
  }, [getUserId]);

  /**
   * Обновляет транскрипцию видео
   * Синхронизирует с глобальной таблицей videos
   */
  const updateVideoTranscript = useCallback(async (videoId: string, transcriptText: string) => {
    try {
      // 1. Получаем shortcode видео
      const { data: video } = await supabase
        .from('saved_videos')
        .select('shortcode')
        .eq('id', videoId)
        .single();
      
      const shortcode = video?.shortcode;
      
      // 2. Обновляем у пользователя
      const { error } = await supabase
        .from('saved_videos')
        .update({ 
          transcript_text: transcriptText,
          transcript_status: 'completed',
        })
        .eq('id', videoId);
      
      if (error) {
        console.error('Error updating video transcript:', error);
        return false;
      }
      
      // 3. Обновляем в глобальной таблице
      if (shortcode) {
        await supabase
          .from('videos')
          .update({ 
            transcript_text: transcriptText,
            transcript_status: 'completed',
          })
          .eq('shortcode', shortcode);
        
        console.log('[InboxVideos] Synced transcript to global table for:', shortcode);
      }
      
      // 4. Обновляем локальное состояние
      setVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, transcript_text: transcriptText, transcript_status: 'completed' } as any : v
      ));
      
      return true;
    } catch (err) {
      console.error('Error updating video transcript:', err);
      return false;
    }
  }, []);

  /**
   * Сохраняет перевод (после получения от Google/Gemini API)
   */
  const updateVideoTranslation = useCallback(async (videoId: string, translationText: string) => {
    try {
      const userId = getUserId();
      await setUserContext(userId);

      const { data, error } = await supabase
        .from('saved_videos')
        .update({ translation_text: translationText })
        .eq('id', videoId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Error updating video translation:', error);
        return false;
      }
      if (!data) {
        console.warn('updateVideoTranslation: no row updated, check RLS or video id');
        return false;
      }

      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, translation_text: translationText } as any : v
      ));
      return true;
    } catch (err) {
      console.error('Error updating video translation:', err);
      return false;
    }
  }, [getUserId]);

  return {
    videos,
    folderCounts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    addVideoToInbox,
    removeVideo,
    updateVideoFolder,
    updateVideoScript,
    updateVideoTranscript,
    updateVideoTranslation,
    updateVideoResponsible,
    updateVideoLinks,
    updateVideoShortcode,
    restoreVideo,
    startVideoProcessing, // Ручной запуск транскрибации
    refreshThumbnail,
    saveThumbnailFromUrl,
    markVideoAsOnCanvas,
    duplicateVideoPrompt,
    resolveDuplicateVideoPrompt,
    refetch: fetchVideos,
    isConfigured: true,
  };
}
