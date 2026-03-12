import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { setUserContext } from '../utils/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectReel {
  id: string;
  project_id: string;
  shortcode: string;
  instagram_id: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  caption: string | null;
  taken_at: number | null;
  created_at: string;
  updated_at: string;
  // Joined latest snapshot
  latest_view_count?: number;
  latest_like_count?: number;
  latest_comment_count?: number;
  latest_snapshotted_at?: string;
}

export interface MetricsSnapshot {
  id: string;
  reel_id: string;
  project_id: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  snapshotted_at: string;
}

export interface ReelWithHistory extends ProjectReel {
  snapshots: MetricsSnapshot[];
}

export type SyncCount = 12 | 24 | 36 | 48 | 60;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectAnalytics(projectId: string | null) {
  const { user } = useAuth();
  const [reels, setReels] = useState<ProjectReel[]>([]);
  const [snapshots, setSnapshots] = useState<MetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [instagramUsername, setInstagramUsernameState] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Reset all state immediately when project changes so old data never bleeds into new project
  useEffect(() => {
    setReels([]);
    setSnapshots([]);
    setInstagramUsernameState(null);
    setLastSyncAt(null);
    setLoading(false);
    setSyncing(false);
  }, [projectId]);

  // ── Load reels + snapshots from DB ──────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const userId = user?.id;
      if (userId) await setUserContext(userId);

      // Load reels
      const { data: reelsData, error: reelsError } = await supabase
        .from('project_reels')
        .select('*')
        .eq('project_id', projectId)
        .order('taken_at', { ascending: false });

      if (reelsError) throw reelsError;

      if (!reelsData || reelsData.length === 0) {
        setReels([]);
        setSnapshots([]);
        setLoading(false);
        return;
      }

      // Load ALL snapshots for this project
      const { data: snapshotsData, error: snapshotsError } = await supabase
        .from('reel_metrics_snapshots')
        .select('*')
        .eq('project_id', projectId)
        .order('snapshotted_at', { ascending: true });

      if (snapshotsError) throw snapshotsError;

      // Attach latest snapshot info to each reel
      const snapshotsByReelId = new Map<string, MetricsSnapshot[]>();
      for (const snap of snapshotsData || []) {
        if (!snapshotsByReelId.has(snap.reel_id)) snapshotsByReelId.set(snap.reel_id, []);
        snapshotsByReelId.get(snap.reel_id)!.push(snap);
      }

      // Load thumbnails from our storage (videos table) — Instagram URLs can expire
      const shortcodes = reelsData.map((r: { shortcode: string }) => r.shortcode);
      const { data: videosData } = await supabase
        .from('videos')
        .select('shortcode, thumbnail_url')
        .in('shortcode', shortcodes);
      const thumbByShortcode = new Map<string, string>();
      for (const v of (videosData || []) as { shortcode: string; thumbnail_url?: string }[]) {
        if (v.thumbnail_url?.includes('supabase')) {
          thumbByShortcode.set(v.shortcode, v.thumbnail_url);
        }
      }

      const reelsWithLatest: ProjectReel[] = (reelsData as ProjectReel[]).map((reel) => {
        const reelSnaps = snapshotsByReelId.get(reel.id) || [];
        const latest = reelSnaps[reelSnaps.length - 1];
        const storedThumb = thumbByShortcode.get(reel.shortcode);
        return {
          ...reel,
          latest_view_count: latest?.view_count,
          latest_like_count: latest?.like_count,
          latest_comment_count: latest?.comment_count,
          latest_snapshotted_at: latest?.snapshotted_at,
          thumbnail_url: (storedThumb || reel.thumbnail_url) ?? null,
        };
      });

      setReels(reelsWithLatest);
      setSnapshots(snapshotsData || []);

      // Load last sync time
      const snapTimes = snapshotsData?.map(s => s.snapshotted_at) || [];
      if (snapTimes.length > 0) setLastSyncAt(snapTimes[snapTimes.length - 1]);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  // ── Load project instagram username ─────────────────────────────────────────
  const loadProjectConfig = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('projects')
      .select('analytics_instagram_username')
      .eq('id', projectId)
      .single();
    if (data?.analytics_instagram_username) {
      setInstagramUsernameState(data.analytics_instagram_username);
    }
  }, [projectId]);

  // ── Save instagram username to project ──────────────────────────────────────
  const setInstagramUsername = useCallback(async (username: string) => {
    if (!projectId) return;
    const clean = username.replace(/^@/, '').trim().toLowerCase();
    const { error } = await supabase
      .from('projects')
      .update({ analytics_instagram_username: clean })
      .eq('id', projectId);
    if (!error) setInstagramUsernameState(clean);
    return !error;
  }, [projectId]);

  // ── Sync reels from Instagram API ───────────────────────────────────────────
  const syncReels = useCallback(async (username: string, count: SyncCount = 12) => {
    if (!projectId) return;
    setSyncing(true);
    try {
      // Fetch from Instagram via our API
      const res = await fetch('/api/user-reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, count }),
      });
      const data = await res.json();

      if (!data.success || !data.reels?.length) {
        toast.error(
          `Аккаунт @${username} не найден или недоступен. Проверь никнейм — он должен быть публичным.`,
          { duration: 6000 }
        );
        return;
      }

      const userId = user?.id;
      if (userId) await setUserContext(userId);

      const snapshotTime = new Date().toISOString();
      let savedCount = 0;
      let firstError: unknown = null;

      // Process reels one by one — upsert then fetch id to avoid .single() issues
      for (const reel of data.reels) {
        try {
          // Step 1: upsert the reel row (no .single() — it can fail on no-change upserts)
          const { error: upsertError } = await supabase
            .from('project_reels')
            .upsert({
              project_id: projectId,
              shortcode: reel.shortcode,
              instagram_id: reel.id,
              thumbnail_url: reel.thumbnail_url,
              video_url: reel.url,
              caption: reel.caption,
              taken_at: reel.taken_at ? Number(reel.taken_at) : null,
              updated_at: snapshotTime,
            }, { onConflict: 'project_id,shortcode' });

          if (upsertError) {
            console.error('Upsert error for', reel.shortcode, ':', upsertError);
            if (!firstError) firstError = upsertError;
            continue;
          }

          // Step 2: fetch the reel id (handles both insert and update cases)
          const { data: reelRow, error: fetchError } = await supabase
            .from('project_reels')
            .select('id')
            .eq('project_id', projectId)
            .eq('shortcode', reel.shortcode)
            .single();

          if (fetchError || !reelRow) {
            console.error('Fetch reel id error for', reel.shortcode, ':', fetchError);
            continue;
          }

          // Step 3: insert snapshot
          const { error: snapError } = await supabase
            .from('reel_metrics_snapshots')
            .insert({
              reel_id: reelRow.id,
              project_id: projectId,
              view_count: reel.view_count || 0,
              like_count: reel.like_count || 0,
              comment_count: reel.comment_count || 0,
              snapshotted_at: snapshotTime,
            });

          if (snapError) {
            console.error('Snapshot insert error for', reel.shortcode, ':', snapError);
          } else {
            savedCount++;
          }
        } catch (reelErr) {
          console.error('Unexpected error for reel', reel.shortcode, ':', reelErr);
        }
      }

      if (savedCount === 0 && firstError) {
        const errMsg = (firstError as { message?: string })?.message || 'Ошибка базы данных';
        toast.error(`Не удалось сохранить данные: ${errMsg}`);
        return;
      }

      if (savedCount > 0) {
        // Check if this was already a second+ sync (snapshots existed before this sync)
        const hadSnapshotsBefore = snapshots.length > 0;
        if (hadSnapshotsBefore) {
          toast.success(`Синхронизировано ${savedCount} роликов — графики обновлены`);
        } else {
          toast.success(`${savedCount} роликов сохранено. Синкайте ещё раз — и появятся графики динамики`);
        }
      } else {
        toast.warning('Ролики получены, но не сохранились. Проверьте что SQL-миграция запущена.');
      }

      setLastSyncAt(snapshotTime);
      await loadAnalytics();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }, [projectId, user?.id, loadAnalytics]);

  // ── Get snapshots for a specific reel ───────────────────────────────────────
  const getReelSnapshots = useCallback((reelId: string): MetricsSnapshot[] => {
    return snapshots.filter(s => s.reel_id === reelId).sort((a, b) =>
      new Date(a.snapshotted_at).getTime() - new Date(b.snapshotted_at).getTime()
    );
  }, [snapshots]);

  // ── Compute summary stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (reels.length === 0) return null;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Reels published in last 30 days
    const reelLast30 = reels.filter(r => r.taken_at && r.taken_at * 1000 > thirtyDaysAgo);
    const avgViews30 = reelLast30.length > 0
      ? Math.round(reelLast30.reduce((sum, r) => sum + (r.latest_view_count || 0), 0) / reelLast30.length)
      : 0;

    // Best reel of the week (most views, published in last 7 days)
    const reelLast7 = reels.filter(r => r.taken_at && r.taken_at * 1000 > sevenDaysAgo);
    const bestReelWeek = reelLast7.reduce<ProjectReel | null>((best, r) => {
      if (!best) return r;
      return (r.latest_view_count || 0) > (best.latest_view_count || 0) ? r : best;
    }, null);

    // Best reel of the month
    const bestReelMonth = reelLast30.reduce<ProjectReel | null>((best, r) => {
      if (!best) return r;
      return (r.latest_view_count || 0) > (best.latest_view_count || 0) ? r : best;
    }, null);

    const totalViews = reels.reduce((sum, r) => sum + (r.latest_view_count || 0), 0);

    return {
      totalReels: reels.length,
      reelsLast30Days: reelLast30.length,
      avgViewsLast30Days: avgViews30,
      bestReelWeek,
      bestReelMonth,
      totalViews,
    };
  }, [reels]);

  // ── Build time-series data for charts ───────────────────────────────────────
  const buildChartData = useCallback((
    period: 'day' | 'week' | 'month',
    mode: 'cumulative' | 'release_week'
  ) => {
    const getBucketKey = (date: Date) => {
      if (period === 'day') {
        return date.toISOString().slice(0, 10);
      } else if (period === 'week') {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().slice(0, 10);
      } else {
        return date.toISOString().slice(0, 7);
      }
    };

    const toSorted = (map: Map<string, { views: number; likes: number; comments: number; date: Date }>) =>
      Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({
          date: new Date(v.date.toISOString().slice(0, 10)),
          views: v.views,
          likes: v.likes,
          comments: v.comments,
        }));

    // ── "Точечно" (release_week): group reels by PUBLICATION date, sum current views ──
    // Always available after the first sync — no historical snapshots required.
    // Example: week 3 bar = sum of current views of all reels published in week 3.
    if (mode === 'release_week') {
      if (reels.length === 0) return [];
      const bucketMap = new Map<string, { views: number; likes: number; comments: number; date: Date }>();
      for (const reel of reels) {
        if (!reel.taken_at) continue;
        const date = new Date(reel.taken_at * 1000);
        const key = getBucketKey(date);
        const existing = bucketMap.get(key);
        const v = reel.latest_view_count || 0;
        const l = reel.latest_like_count || 0;
        const c = reel.latest_comment_count || 0;
        bucketMap.set(key, existing
          ? { views: existing.views + v, likes: existing.likes + l, comments: existing.comments + c, date: existing.date }
          : { views: v, likes: l, comments: c, date }
        );
      }
      return toSorted(bucketMap);
    }

    // ── "Общее" (cumulative): snapshot-based timeline ─────────────────────────
    // X = snapshot date, Y = total views at that moment.
    // Each sync = one point. Without snapshots we can't build this — return empty.
    if (snapshots.length === 0) {
      return [];
    }

    // Group snapshots by sync (same snapshotted_at = one sync batch)
    const bySync = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      const t = snap.snapshotted_at;
      if (!bySync.has(t)) bySync.set(t, []);
      bySync.get(t)!.push(snap);
    }

    // Each sync → one point: sum view_count across all reels in that sync
    const points: { date: Date; views: number; likes: number; comments: number }[] = [];
    const sortedTimes = [...bySync.keys()].sort();
    for (const t of sortedTimes) {
      const batch = bySync.get(t)!;
      const views = batch.reduce((s, x) => s + x.view_count, 0);
      const likes = batch.reduce((s, x) => s + x.like_count, 0);
      const comments = batch.reduce((s, x) => s + x.comment_count, 0);
      points.push({ date: new Date(t), views, likes, comments });
    }

    // If period is day/week/month, collapse to one point per bucket (latest in bucket)
    if (period !== 'day' && period !== 'week' && period !== 'month') {
      return points;
    }
    const bucketMap = new Map<string, { views: number; likes: number; comments: number; date: Date }>();
    for (const pt of points) {
      const key = getBucketKey(pt.date);
      const existing = bucketMap.get(key);
      if (!existing || pt.date > existing.date) {
        bucketMap.set(key, { ...pt, date: pt.date });
      }
    }
    return toSorted(bucketMap);
  }, [snapshots, reels]);

  return {
    reels,
    snapshots,
    loading,
    syncing,
    stats,
    instagramUsername,
    lastSyncAt,
    loadAnalytics,
    loadProjectConfig,
    setInstagramUsername,
    syncReels,
    getReelSnapshots,
    buildChartData,
  };
}
