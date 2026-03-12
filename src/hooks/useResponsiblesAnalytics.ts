import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import type { ProjectReel } from './useProjectAnalytics';

type ResponsibleRow = { templateId?: string; label?: string; value: string };

export interface ResponsiblesStat {
  role: string;
  person: string;
  views: number;
  reelsCount: number;
}

/** Load saved_videos responsibles for project, match with reels by shortcode, aggregate views by (role, person) */
export function useResponsiblesStats(projectId: string | null, reels: ProjectReel[]) {
  const [responsiblesByShortcode, setResponsiblesByShortcode] = useState<Map<string, ResponsibleRow[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || reels.length === 0) {
      setResponsiblesByShortcode(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('saved_videos')
      .select('shortcode, responsibles, script_responsible, editing_responsible')
      .eq('project_id', projectId)
      .in('shortcode', reels.map(r => r.shortcode))
      .then(({ data, error }) => {
        if (cancelled || error) {
          setResponsiblesByShortcode(new Map());
          setLoading(false);
          return;
        }
        const map = new Map<string, ResponsibleRow[]>();
        for (const row of data || []) {
          const rows: ResponsibleRow[] = [];
          const arr = row.responsibles as Array<{ templateId?: string; label?: string; value: string }> | null;
          if (Array.isArray(arr) && arr.length > 0) {
            for (const r of arr) {
              if (r?.value) rows.push({ templateId: r.templateId, label: r.label || 'Ответственный', value: r.value });
            }
          } else {
            if (row.script_responsible) rows.push({ templateId: 'resp-0', label: 'За сценарий', value: row.script_responsible });
            if (row.editing_responsible) rows.push({ templateId: 'resp-1', label: 'За монтаж', value: row.editing_responsible });
          }
          if (rows.length) map.set(row.shortcode, rows);
        }
        setResponsiblesByShortcode(map);
        setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reels]);

  const stats = useMemo((): ResponsiblesStat[] => {
    const byKey = new Map<string, { views: number; reelsCount: number }>();
    for (const reel of reels) {
      const rows = responsiblesByShortcode.get(reel.shortcode);
      const views = reel.latest_view_count ?? 0;
      if (!rows?.length) continue;
      for (const r of rows) {
        const label = (r.label || 'Ответственный').trim();
        const value = (r.value || '').trim();
        if (!value) continue;
        const key = `${label}::${value}`;
        const cur = byKey.get(key) || { views: 0, reelsCount: 0 };
        byKey.set(key, { views: cur.views + views, reelsCount: cur.reelsCount + 1 });
      }
    }
    return [...byKey.entries()]
      .map(([key, { views, reelsCount }]) => {
        const [role, person] = key.split('::');
        return { role, person, views, reelsCount };
      })
      .sort((a, b) => b.views - a.views);
  }, [reels, responsiblesByShortcode]);

  const byRole = useMemo(() => {
    const m = new Map<string, ResponsiblesStat[]>();
    for (const s of stats) {
      const list = m.get(s.role) || [];
      list.push(s);
      m.set(s.role, list);
    }
    return m;
  }, [stats]);

  return { stats, byRole, loading };
}
