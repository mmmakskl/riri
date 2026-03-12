import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { ProjectReel } from './useProjectAnalytics';

export interface RefForLinking {
  id: string;
  shortcode: string | null;
  folder_id: string | null;
  caption: string | null;
  thumbnail_url: string | null;
}

/**
 * Исходники проекта для привязки к роликам: без shortcode и множество уже привязанных shortcode.
 * reelsWithoutLinkedRef = reels.filter(r => !linkedShortcodes.has(r.shortcode)).
 */
export function useRefsForLinking(projectId: string | null) {
  const [refs, setRefs] = useState<RefForLinking[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setRefs([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('saved_videos')
      .select('id, shortcode, folder_id, caption, thumbnail_url')
      .eq('project_id', projectId);
    if (error) {
      setRefs([]);
      setLoading(false);
      return;
    }
    setRefs((data || []).map((row: any) => ({
      id: row.id,
      shortcode: row.shortcode ?? null,
      folder_id: row.folder_id ?? null,
      caption: row.caption ?? null,
      thumbnail_url: row.thumbnail_url ?? null,
    })));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const refsWithoutShortcode = useMemo(() =>
    refs.filter(r => !r.shortcode || r.shortcode.trim() === ''),
    [refs]
  );

  const linkedShortcodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of refs) {
      if (r.shortcode?.trim()) set.add(r.shortcode.trim());
    }
    return set;
  }, [refs]);

  return { refs, refsWithoutShortcode, linkedShortcodes, loading, refetch };
}

/** Ролики, у которых нет привязанного исходника в этом проекте */
export function reelsWithoutLinkedRef(reels: ProjectReel[], linkedShortcodes: Set<string>): ProjectReel[] {
  return reels.filter(r => !linkedShortcodes.has(r.shortcode));
}
