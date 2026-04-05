import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { Slide } from '../components/carousel-editor/types';

export interface ProjectCarousel {
  id: string;
  project_id: string;
  name: string;
  slides: Slide[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useProjectCarousels(projectId: string | null, userId: string | null) {
  const [carousels, setCarousels] = useState<ProjectCarousel[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setCarousels([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('project_carousels')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(3);
    if (!error && data) setCarousels(data as ProjectCarousel[]);
    setLoading(false);
  }, [projectId]);

  // Realtime
  useEffect(() => {
    if (!projectId) return;
    load();

    const channel = supabase
      .channel(`project_carousels:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_carousels', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCarousels((prev) => {
              const exists = prev.find((c) => c.id === (payload.new as ProjectCarousel).id);
              if (exists) return prev;
              return [payload.new as ProjectCarousel, ...prev].slice(0, 3);
            });
          } else if (payload.eventType === 'UPDATE') {
            setCarousels((prev) =>
              prev.map((c) => c.id === (payload.new as ProjectCarousel).id ? payload.new as ProjectCarousel : c),
            );
          } else if (payload.eventType === 'DELETE') {
            setCarousels((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [projectId, load]);

  const save = useCallback(async (id: string, name: string, slides: Slide[]) => {
    if (!projectId) return;
    const now = new Date().toISOString();
    const row = { id, project_id: projectId, name, slides, updated_by: userId, updated_at: now };
    const existing = carousels.find((c) => c.id === id);
    if (existing) {
      await supabase.from('project_carousels').update(row).eq('id', id);
    } else {
      await supabase.from('project_carousels').insert({ ...row, created_by: userId, created_at: now });
    }
  }, [projectId, userId, carousels]);

  const remove = useCallback(async (id: string) => {
    await supabase.from('project_carousels').delete().eq('id', id);
  }, []);

  return { carousels, loading, save, remove, reload: load };
}
