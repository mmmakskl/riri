import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar, UserPlus, X, Loader2, ChevronLeft, Eye, Heart, Calendar,
  Sparkles, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { supabase } from '../utils/supabase';
import { useRadar } from '../hooks/useRadar';
import { useAuth } from '../hooks/useAuth';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { TokenBadge } from './ui/TokenBadge';
import { proxyImageUrl, PLACEHOLDER_200x356 } from '../utils/imagePlaceholder';
import { calculateViralMultiplier, applyViralMultiplierToCoefficient } from '../services/profileStatsService';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { useInboxVideos } from '../hooks/useInboxVideos';
import type { InstagramSearchResult } from '../services/videoService';

type SortOption = 'date' | 'views' | 'likes' | 'viral';

function formatVideoDate(takenAt?: string | number): string {
  if (!takenAt) return '';
  const ts = typeof takenAt === 'number' ? takenAt : Number(takenAt);
  const date = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
  if (isNaN(date.getTime())) return '';
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн.`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} мес.`;
  return `${Math.floor(diffDays / 365)} г.`;
}

function calculateViralCoefficient(views?: number, takenAt?: string | number): number {
  if (!views || views < 30_000 || !takenAt) return 0;
  const ts = typeof takenAt === 'number' ? takenAt : Number(takenAt);
  const date = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
  if (isNaN(date.getTime())) return 0;
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return 0;
  return Math.round((views / (diffDays * 1000)) * 100) / 100;
}

export function RadarPage() {
  const { currentProjectId, currentProject } = useProjectContext();
  const { user } = useAuth();
  const { balance, canAfford, deduct } = useTokenBalance();
  const userId = user?.id || 'anonymous';

  const {
    profiles: radarProfiles,
    loading: radarLoading,
    loadingUsername: radarLoadingUsername,
    stats: radarStats,
    profilesDueCount,
    addProfile: addRadarProfile,
    removeProfile: removeRadarProfile,
    updateProfileFrequency: updateRadarProfileFrequency,
    refreshAll: refreshRadar,
    getProfileStats,
  } = useRadar(currentProjectId, userId, currentProject?.isShared);

  const { videos: inboxVideos } = useInboxVideos();

  const [radarUsername, setRadarUsername] = useState('');
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [profileVideos, setProfileVideos] = useState<InstagramSearchResult[]>([]);
  const [profileVideosLoading, setProfileVideosLoading] = useState(false);

  // Загружаем все видео профиля из Supabase при выборе
  useEffect(() => {
    if (!selectedProfile || !currentProjectId) {
      setProfileVideos([]);
      return;
    }
    setProfileVideosLoading(true);
    const username = selectedProfile.toLowerCase();

    const load = async () => {
      try {
        let query = supabase
          .from('saved_videos')
          .select('*')
          .eq('project_id', currentProjectId)
          .ilike('owner_username', username)
          .order('taken_at', { ascending: false, nullsFirst: false });

        if (!currentProject?.isShared) {
          query = query.eq('user_id', userId);
        }

        const { data } = await query;
        if (!data) return;

        setProfileVideos(
          data.map((v: any) => ({
            id: v.id,
            shortcode: v.shortcode,
            url: v.video_url || (v.shortcode ? `https://instagram.com/reel/${v.shortcode}` : ''),
            thumbnail_url: v.thumbnail_url,
            display_url: v.thumbnail_url,
            caption: v.caption,
            view_count: v.view_count,
            like_count: v.like_count,
            comment_count: v.comment_count,
            taken_at: v.taken_at,
            owner: { username: v.owner_username },
            savedToInbox: true,
          }))
        );
      } finally {
        setProfileVideosLoading(false);
      }
    };
    load();
  }, [selectedProfile, currentProjectId, userId, currentProject?.isShared]);

  // Счётчик видео профиля из inboxVideos (для пилл)
  const getProfileVideoCount = useCallback(
    (username: string) =>
      inboxVideos.filter(
        (v: any) =>
          v.owner_username?.toLowerCase() === username.toLowerCase() &&
          (!currentProjectId || v.project_id === currentProjectId)
      ).length,
    [inboxVideos, currentProjectId]
  );

  const radarAddCost = getTokenCost('radar_add_profile');

  const handleAddProfile = useCallback(
    async (input: string) => {
      if (!input.trim() || !currentProjectId) return;
      if (!canAfford(radarAddCost)) {
        toast.error('Недостаточно коинов', {
          description: `Нужно ${radarAddCost}. Баланс: ${balance}`,
        });
        return;
      }
      let username = input.trim();
      const urlMatch = input.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
      if (urlMatch) username = urlMatch[1].toLowerCase();
      else username = username.replace(/^@/, '').toLowerCase();

      if (!username) {
        toast.error('Не удалось определить username');
        return;
      }
      const added = await addRadarProfile(username, currentProjectId, frequencyDays);
      if (added) {
        await deduct(radarAddCost, {
          action: 'radar_add_profile',
          section: 'radar',
          label: 'Добавить в радар',
        });
        toast.success(`@${username} добавлен в радар`, {
          description: `Обновление каждые ${frequencyDays} дн. Загружаем видео...`,
        });
        setRadarUsername('');
      } else {
        toast.error('Профиль уже отслеживается в этом проекте');
      }
    },
    [addRadarProfile, currentProjectId, frequencyDays, canAfford, deduct, balance, radarAddCost]
  );

  // Сортировка видео профиля
  const sortedProfileVideos = [...profileVideos].sort((a, b) => {
    switch (sortBy) {
      case 'views': return (b.view_count || 0) - (a.view_count || 0);
      case 'likes': return (b.like_count || 0) - (a.like_count || 0);
      case 'date': {
        const da = a.taken_at ? (typeof a.taken_at === 'number' ? a.taken_at : Number(a.taken_at)) : 0;
        const db = b.taken_at ? (typeof b.taken_at === 'number' ? b.taken_at : Number(b.taken_at)) : 0;
        return db - da;
      }
      case 'viral': {
        const profileStats = getProfileStats(selectedProfile || '') || null;
        const ca = calculateViralCoefficient(a.view_count, a.taken_at as any);
        const cb = calculateViralCoefficient(b.view_count, b.taken_at as any);
        const ma = calculateViralMultiplier(a.view_count || 0, profileStats);
        const mb = calculateViralMultiplier(b.view_count || 0, profileStats);
        return applyViralMultiplierToCoefficient(cb, mb) - applyViralMultiplierToCoefficient(ca, ma);
      }
      default: return 0;
    }
  });

  const projectName = currentProject?.name || 'Проект';

  // ── Вид: видео профиля ──────────────────────────────────────────
  if (selectedProfile) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-base">
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedProfile(null)}
                className="p-2 rounded-xl bg-white/80 border border-white/60 shadow-glass-sm text-slate-500 hover:text-slate-700 hover:bg-white transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {selectedProfile[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">@{selectedProfile}</h2>
                <p className="text-xs text-slate-500">{profileVideos.length} видео в проекте</p>
              </div>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-glass rounded-xl p-1 shadow-glass-sm border border-white/60">
              {([
                { value: 'date', label: 'Новые', icon: Calendar },
                { value: 'viral', label: 'Вирал', icon: Sparkles },
                { value: 'views', label: 'Просмотры', icon: Eye },
                { value: 'likes', label: 'Лайки', icon: Heart },
              ] as { value: SortOption; label: string; icon: any }[]).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setSortBy(value)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    sortBy === value
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/70'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar-light">
          {profileVideosLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
              <p className="text-slate-400 text-sm">Загружаем видео...</p>
            </div>
          ) : sortedProfileVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Radar className="w-14 h-14 text-slate-300" />
              <p className="text-slate-500 text-base font-medium">Нет видео от @{selectedProfile}</p>
              <p className="text-slate-400 text-sm text-center max-w-xs">
                Нажмите «Обновить всё» в радаре, чтобы загрузить видео из этого профиля
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {sortedProfileVideos.map((reel, idx) => {
                const profileStats = getProfileStats(selectedProfile) || null;
                const viralCoef = calculateViralCoefficient(reel.view_count, reel.taken_at as any);
                const viralMult = calculateViralMultiplier(reel.view_count || 0, profileStats);
                const finalViralCoef = applyViralMultiplierToCoefficient(viralCoef, viralMult);
                const thumb = proxyImageUrl(reel.thumbnail_url || reel.display_url, PLACEHOLDER_200x356);
                const dateText = formatVideoDate(reel.taken_at as any);
                const caption = typeof reel.caption === 'string' ? reel.caption : '';

                return (
                  <VideoGradientCard
                    key={`${reel.shortcode || reel.id}-${idx}`}
                    thumbnailUrl={thumb}
                    username={reel.owner?.username || selectedProfile}
                    caption={caption}
                    viewCount={reel.view_count}
                    likeCount={reel.like_count}
                    commentCount={reel.comment_count}
                    date={dateText}
                    viralCoef={finalViralCoef}
                    viralMultiplier={viralMult}
                    onClick={() => reel.url && window.open(reel.url, '_blank')}
                    onDragStart={() => {}}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Вид: главная радара ─────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card-xl bg-white/84 backdrop-blur-glass border border-white/60 shadow-glass-sm flex items-center justify-center relative">
              <Radar className="w-5 h-5 text-slate-600" />
              {radarProfiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-positive rounded-full flex items-center justify-center text-[9px] text-white font-bold border border-white">
                  {radarProfiles.length}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Радар профилей</h1>
              <p className="text-xs text-slate-500">
                Проект: <span className="font-medium text-slate-600">{projectName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Статистика обновления */}
            {(radarStats.newVideos > 0 || radarStats.updatedVideos > 0) && (
              <div className="flex items-center gap-1 text-xs">
                {radarStats.newVideos > 0 && (
                  <span className="text-accent-positive font-semibold">+{radarStats.newVideos} новых</span>
                )}
                {radarStats.updatedVideos > 0 && (
                  <span className="text-slate-500">{radarStats.updatedVideos} обн.</span>
                )}
              </div>
            )}
            {profilesDueCount > 0 && (
              <span className="text-xs text-amber-600 font-medium">Пора обновить ({profilesDueCount})</span>
            )}
            {radarProfiles.length > 0 && (
              <button
                onClick={async () => {
                  const cost = getTokenCost('radar_refresh_all', radarProfiles.length);
                  if (!canAfford(cost)) {
                    toast.error('Недостаточно коинов', { description: `Нужно ${cost}. Баланс: ${balance}` });
                    return;
                  }
                  await refreshRadar();
                  await deduct(cost, { action: 'radar_refresh_all', section: 'radar', label: 'Обновить все' });
                  toast.info('Обновляем профили...', {
                    description: 'Новые видео добавятся в «Все видео»',
                  });
                }}
                disabled={radarLoading || !canAfford(getTokenCost('radar_refresh_all', radarProfiles.length))}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                  'bg-white/82 border border-white/60 text-slate-600 hover:bg-white shadow-glass-sm',
                  radarLoading && 'opacity-50 cursor-not-allowed'
                )}
              >
                {radarLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Обновить всё
                <TokenBadge tokens={getTokenCost('radar_refresh_all', radarProfiles.length)} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar-light">
        {!currentProjectId ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Radar className="w-14 h-14 text-slate-300" />
            <p className="text-slate-500 text-sm">Выберите проект в боковом меню</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Как это работает */}
            <div className="p-4 rounded-card-xl bg-white/72 backdrop-blur-glass border border-white/60 shadow-glass-sm">
              <p className="text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-700">Как это работает:</span>{' '}
                Добавляй Instagram-профили — я буду автоматически собирать их видео в «Все видео» проекта «{projectName}».
                При обновлении новые видео добавятся, а статистика старых обновится.
              </p>
            </div>

            {/* Добавить профиль */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                  <input
                    type="text"
                    value={radarUsername}
                    onChange={(e) => setRadarUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && radarUsername.trim()) handleAddProfile(radarUsername);
                    }}
                    placeholder="username или ссылка на профиль"
                    className="w-full pl-9 pr-4 py-3 rounded-card-xl border border-white/60 bg-white/86 backdrop-blur-glass outline-none focus:ring-2 focus:ring-slate-300/50 text-sm shadow-glass-sm"
                  />
                </div>
                <button
                  onClick={() => radarUsername.trim() && handleAddProfile(radarUsername)}
                  disabled={!radarUsername.trim() || !canAfford(radarAddCost)}
                  className={cn(
                    'flex items-center gap-2 px-5 py-3 rounded-card-xl font-medium text-sm transition-all active:scale-95',
                    'bg-slate-800 hover:bg-slate-900 text-white shadow-glass',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  <UserPlus className="w-4 h-4" />
                  Добавить
                  <TokenBadge tokens={radarAddCost} />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Обновлять каждые:</span>
                {[1, 3, 7, 14].map((d) => (
                  <button
                    key={d}
                    onClick={() => setFrequencyDays(d)}
                    className={cn(
                      'px-2.5 py-1 rounded-xl text-xs font-medium transition-all border',
                      frequencyDays === d
                        ? 'bg-slate-800 border-slate-800 text-white'
                        : 'bg-white/72 border-white/60 text-slate-600 hover:bg-white'
                    )}
                  >
                    {d === 1 ? '1 день' : `${d} дней`}
                  </button>
                ))}
              </div>
            </div>

            {/* Отслеживаемые профили */}
            {radarProfiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Radar className="w-14 h-14 text-slate-300" />
                <p className="text-slate-500 text-sm font-medium">Радар пока пуст</p>
                <p className="text-slate-400 text-xs text-center max-w-xs">
                  Добавь Instagram-профили — я буду автоматически собирать видео
                </p>
              </div>
            ) : (
              <AnimatePresence>
                <div>
                  <p className="text-xs text-slate-500 mb-3 font-medium">
                    Отслеживаемые профили ({radarProfiles.length})
                  </p>
                  {/* Профили в виде карточек */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {radarProfiles.map((profile) => {
                      const count = getProfileVideoCount(profile.username);
                      const isLoading = radarLoadingUsername === profile.username;
                      return (
                        <motion.div
                          key={profile.username}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => !isLoading && setSelectedProfile(profile.username)}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-card-xl border cursor-pointer transition-all',
                            'bg-white/72 backdrop-blur-glass border-white/60 hover:bg-white hover:shadow-glass-sm',
                            isLoading && 'animate-pulse cursor-wait'
                          )}
                        >
                          {/* Аватар */}
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                            {profile.username[0].toUpperCase()}
                          </div>

                          {/* Имя + метаданные */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                @{profile.username}
                              </span>
                              {count > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">
                                  {count} видео
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isLoading ? (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Загружаем...
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Обновление каждые{' '}
                                  <select
                                    value={profile.updateFrequencyDays ?? 7}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      updateRadarProfileFrequency(profile.username, Number(e.target.value), profile.projectId);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs text-slate-500 bg-transparent border-none cursor-pointer focus:ring-0 focus:outline-none"
                                  >
                                    {[1, 3, 7, 14].map((d) => (
                                      <option key={d} value={d}>{d}д</option>
                                    ))}
                                  </select>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Удалить */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRadarProfile(profile.username);
                              if (selectedProfile === profile.username) setSelectedProfile(null);
                              toast.success(`@${profile.username} удалён из радара`);
                            }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-3 text-center">
                    Нажмите на профиль, чтобы посмотреть все его видео в проекте
                  </p>
                </div>
              </AnimatePresence>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
