import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './useAuth';
import { useProjectContext } from '../contexts/ProjectContext';
import { toast } from 'sonner';

export interface CarouselSlideResult {
  slide_index: number;
  text: string;
  description: string;
}

export interface SavedCarousel {
  id: string;
  user_id: string;
  project_id: string | null;
  folder_id: string | null;
  shortcode: string;
  url: string | null;
  caption: string | null;
  owner_username: string | null;
  like_count: number;
  comment_count: number;
  taken_at: number | null;
  slide_count: number;
  thumbnail_url: string | null;
  slide_urls: string[] | null;
  transcript_status: string | null;
  transcript_text: string | null;
  transcript_slides: CarouselSlideResult[] | null;
  translation_text: string | null;
  script_text: string | null;
  draft_link: string | null;
  final_link: string | null;
  script_responsible: string | null;
  editing_responsible: string | null;
  links: { templateId?: string; label?: string; value: string }[] | null;
  responsibles: { templateId?: string; label?: string; value: string }[] | null;
  added_at: string;
}

const PAGE_SIZE = 60;

function transformRow(row: any): SavedCarousel {
  const links = Array.isArray(row.links) ? row.links : [];
  const responsibles = Array.isArray(row.responsibles) ? row.responsibles : [];
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id ?? null,
    folder_id: row.folder_id ?? null,
    shortcode: row.shortcode,
    url: row.url ?? null,
    caption: row.caption ?? null,
    owner_username: row.owner_username ?? null,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    taken_at: row.taken_at ?? null,
    slide_count: row.slide_count ?? 0,
    thumbnail_url: row.thumbnail_url ?? null,
    slide_urls: Array.isArray(row.slide_urls) ? row.slide_urls : null,
    transcript_status: row.transcript_status ?? null,
    transcript_text: row.transcript_text ?? null,
    transcript_slides: row.transcript_slides ?? null,
    translation_text: row.translation_text ?? null,
    script_text: row.script_text ?? null,
    draft_link: row.draft_link ?? null,
    final_link: row.final_link ?? null,
    script_responsible: row.script_responsible ?? null,
    editing_responsible: row.editing_responsible ?? null,
    links,
    responsibles,
    added_at: row.added_at,
  };
}

export function useCarousels() {
  const [carousels, setCarousels] = useState<SavedCarousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore] = useState(false);
  const { user } = useAuth();
  const { currentProjectId } = useProjectContext();

  const getUserId = useCallback((): string => {
    return user?.id || 'anonymous';
  }, [user]);

  const fetchCarousels = useCallback(async () => {
    const userId = getUserId();
    setLoading(true);
    try {
      let query = supabase
        .from('saved_carousels')
        .select('*')
        .order('added_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (currentProjectId) {
        const { data: membersData } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', currentProjectId)
          .in('status', ['active', 'pending']);
        const isShared = membersData && membersData.length > 0;
        if (isShared) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('owner_id, user_id')
            .eq('id', currentProjectId)
            .single();
          const ownerId = (projectData as any)?.owner_id ?? (projectData as any)?.user_id;
          const allUserIds = [...new Set([...(membersData?.map((m: any) => m.user_id) || []), ownerId].filter(Boolean))];
          query = query.eq('project_id', currentProjectId).in('user_id', allUserIds);
        } else {
          query = query.eq('project_id', currentProjectId).eq('user_id', userId);
        }
      } else {
        query = query.is('project_id', null).eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching carousels:', error);
        setCarousels([]);
      } else {
        const rows = (data || []).map(transformRow);
        // Дедупликация по shortcode: одна карусель могла быть добавлена разными участниками.
        // Берём запись с thumbnail_url или slide_urls (чтобы у всех участников было превью).
        const byShortcode = new Map<string, typeof rows[0]>();
        for (const r of rows) {
          const existing = byShortcode.get(r.shortcode);
          const hasMedia = !!(r.thumbnail_url?.trim() || (r.slide_urls?.length ?? 0) > 0);
          const existingHasMedia = existing && !!(existing.thumbnail_url?.trim() || (existing.slide_urls?.length ?? 0) > 0);
          if (!existing || (hasMedia && !existingHasMedia)) {
            byShortcode.set(r.shortcode, r);
          }
        }
        const deduped = Array.from(byShortcode.values()).sort(
          (a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
        );
        setCarousels(deduped);
        setHasMore((data?.length || 0) === PAGE_SIZE);
      }
    } catch (err) {
      console.error('useCarousels fetch:', err);
      setCarousels([]);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, getUserId]);

  useEffect(() => {
    fetchCarousels();
  }, [fetchCarousels]);

  const addCarousel = useCallback(async (payload: {
    shortcode: string;
    url?: string;
    caption?: string;
    owner_username?: string;
    like_count?: number;
    comment_count?: number;
    taken_at?: number;
    slide_count?: number;
    thumbnail_url?: string;
    /** URL всех слайдов (для транскрибации и превью) */
    slide_urls?: string[] | null;
  }) => {
    const userId = getUserId();
    const targetProjectId = currentProjectId ?? null;
    try {
      const { data, error } = await supabase
        .from('saved_carousels')
        .insert({
          user_id: userId,
          project_id: targetProjectId,
          shortcode: payload.shortcode,
          url: payload.url || `https://www.instagram.com/p/${payload.shortcode}/`,
          caption: payload.caption ?? null,
          owner_username: payload.owner_username ?? null,
          like_count: payload.like_count ?? 0,
          comment_count: payload.comment_count ?? 0,
          taken_at: payload.taken_at ?? null,
          slide_count: payload.slide_count ?? (payload.slide_urls?.length ?? 0),
          thumbnail_url: payload.thumbnail_url ?? payload.slide_urls?.[0] ?? null,
          slide_urls: payload.slide_urls ?? null,
        })
        .select()
        .single();
      if (error) {
        if ((error as any).code === '23505') {
          toast.info('Карусель уже добавлена в проект');
          await fetchCarousels();
          return null;
        }
        console.error('Error adding carousel:', error);
        toast.error('Не удалось добавить карусель');
        return null;
      }
      const carousel = transformRow(data);
      setCarousels(prev => [carousel, ...prev]);
      toast.success('Карусель добавлена');
      return carousel;
    } catch (err) {
      console.error('addCarousel:', err);
      toast.error('Ошибка добавления карусели');
      return null;
    }
  }, [getUserId, currentProjectId, fetchCarousels]);

  const updateCarouselTranscript = useCallback(async (id: string, transcriptText: string, transcriptSlides: CarouselSlideResult[] | null) => {
    try {
      const { error } = await supabase
        .from('saved_carousels')
        .update({
          transcript_text: transcriptText,
          transcript_status: 'completed',
          transcript_slides: transcriptSlides,
        })
        .eq('id', id);
      if (error) return false;
      setCarousels(prev => prev.map(c =>
        c.id === id ? { ...c, transcript_text: transcriptText, transcript_status: 'completed', transcript_slides: transcriptSlides } : c
      ));
      return true;
    } catch (err) {
      console.error('updateCarouselTranscript:', err);
      return false;
    }
  }, []);

  const updateCarouselTranslation = useCallback(async (id: string, translationText: string) => {
    try {
      const { error } = await supabase
        .from('saved_carousels')
        .update({ translation_text: translationText })
        .eq('id', id);
      if (error) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, translation_text: translationText } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselTranslation:', err);
      return false;
    }
  }, []);

  const updateCarouselScript = useCallback(async (id: string, scriptText: string) => {
    try {
      const { error } = await supabase
        .from('saved_carousels')
        .update({ script_text: scriptText })
        .eq('id', id);
      if (error) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, script_text: scriptText } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselScript:', err);
      return false;
    }
  }, []);

  const updateCarouselFolder = useCallback(async (id: string, folderId: string | null) => {
    try {
      let query = supabase.from('saved_carousels').update({ folder_id: folderId }).eq('id', id);
      if (currentProjectId) query = query.eq('project_id', currentProjectId);
      else query = query.eq('user_id', getUserId());
      const { error } = await query;
      if (error) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, folder_id: folderId } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselFolder:', err);
      return false;
    }
  }, [currentProjectId, getUserId]);

  const updateCarouselLinks = useCallback(async (id: string, items: { templateId: string; value: string }[]) => {
    try {
      const payload = items.map(({ templateId, value }) => ({ templateId, value: value || '' }));
      let query = supabase.from('saved_carousels').update({ links: payload }).eq('id', id);
      if (currentProjectId) query = query.eq('project_id', currentProjectId);
      else query = query.eq('user_id', getUserId());
      const { data, error } = await query.select('id').maybeSingle();
      if (error) return false;
      if (!data) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, links: payload } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselLinks:', err);
      return false;
    }
  }, [currentProjectId, getUserId]);

  const updateCarouselResponsibles = useCallback(async (id: string, items: { templateId: string; value: string }[]) => {
    try {
      const payload = items.map(({ templateId, value }) => ({ templateId, value: value || '' }));
      let query = supabase.from('saved_carousels').update({ responsibles: payload }).eq('id', id);
      if (currentProjectId) query = query.eq('project_id', currentProjectId);
      else query = query.eq('user_id', getUserId());
      const { data, error } = await query.select('id').maybeSingle();
      if (error) return false;
      if (!data) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, responsibles: payload } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselResponsibles:', err);
      return false;
    }
  }, [currentProjectId, getUserId]);

  const updateCarouselSlideUrls = useCallback(async (id: string, slideUrls: string[], thumbnailUrl?: string) => {
    try {
      const payload: Record<string, unknown> = { slide_urls: slideUrls, slide_count: slideUrls.length };
      if (thumbnailUrl !== undefined) payload.thumbnail_url = thumbnailUrl;
      const { error } = await supabase.from('saved_carousels').update(payload).eq('id', id).select('id').maybeSingle();
      if (error) return false;
      setCarousels(prev => prev.map(c => c.id === id ? { ...c, slide_urls: slideUrls, slide_count: slideUrls.length, thumbnail_url: thumbnailUrl ?? c.thumbnail_url } : c));
      return true;
    } catch (err) {
      console.error('updateCarouselSlideUrls:', err);
      return false;
    }
  }, []);

  /** Подгружает превью для карусели с пустым thumbnail (как refreshThumbnail для видео) */
  const refreshCarouselThumbnail = useCallback(async (carouselId: string, shortcode: string) => {
    try {
      const res = await fetch('/api/reel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcode, url: `https://www.instagram.com/p/${shortcode}/`, source: 'carousel' }),
      });
      const data = await res.json();
      const slideUrls = data?.carousel_slides;
      const thumbUrl = data?.thumbnail_url || slideUrls?.[0];
      if (!slideUrls?.length && !thumbUrl) return;
      await updateCarouselSlideUrls(carouselId, slideUrls || [thumbUrl].filter(Boolean), thumbUrl);
    } catch (e) {
      console.warn('[Carousels] Failed to refresh thumbnail:', e);
    }
  }, [updateCarouselSlideUrls]);

  const removeCarousel = useCallback(async (id: string) => {
    const item = carousels.find(c => c.id === id);
    try {
      let query = supabase.from('saved_carousels').delete().eq('id', id);
      if (currentProjectId) query = query.eq('project_id', currentProjectId);
      else query = query.eq('user_id', getUserId());
      const { error } = await query;
      if (error) return null;
      setCarousels(prev => prev.filter(c => c.id !== id));
      return item;
    } catch (err) {
      console.error('removeCarousel:', err);
      return null;
    }
  }, [carousels, currentProjectId, getUserId]);

  return {
    carousels,
    loading,
    hasMore,
    loadingMore,
    addCarousel,
    updateCarouselTranscript,
    updateCarouselTranslation,
    updateCarouselScript,
    updateCarouselFolder,
    updateCarouselSlideUrls,
    updateCarouselLinks,
    updateCarouselResponsibles,
    removeCarousel,
    refreshCarouselThumbnail,
    refetch: fetchCarousels,
  };
}
