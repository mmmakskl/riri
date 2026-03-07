import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspaceZones, ZoneVideo } from '../hooks/useWorkspaceZones';
import { useInboxVideos } from '../hooks/useInboxVideos';
import { useProjectContext, ProjectFolder } from '../contexts/ProjectContext';
import { useActionHistory } from '../hooks/useActionHistory';
import { useProjectSync } from '../hooks/useProjectSync';
import { useProjectPresence } from '../hooks/useProjectPresence';
import { PresenceIndicator } from './ui/PresenceIndicator';
import { Sparkles, FileText, Trash2, ExternalLink, Plus, Inbox, FolderOpen, Settings, GripVertical, X, Palette, Eye, Heart, ChevronDown, ChevronRight, Undo2, Images, Link2, Loader2, MessageCircle, BookOpen, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { proxyImageUrl } from '../utils/imagePlaceholder';
import { VideoGradientCard } from './ui/VideoGradientCard';
import { VideoDetailPage } from './VideoDetailPage';
import { CarouselDetailPage } from './CarouselDetailPage';
import { useCarousels, type SavedCarousel } from '../hooks/useCarousels';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { calculateViralMultiplier, applyViralMultiplierToCoefficient, getProfileStats, calculateCarouselViralMultiplier } from '../services/profileStatsService';
import { dialogScale, dialogSlideUp, backdropFade, iosSpringSoft } from '../utils/motionPresets';
import { TokenBadge } from './ui/TokenBadge';
import { GlassFolderIcon } from './ui/GlassFolderIcons';
import { getTokenCost } from '../constants/tokenCosts';
import { DuplicateVideoModal } from './ui/DuplicateVideoModal';


function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

// Расчёт коэффициента виральности (K просмотров в день)
function calculateViralCoefficient(views?: number, takenAt?: string | number | Date): number {
  if (!views) return 0;
  
  let videoDate: Date | null = null;
  
  if (takenAt instanceof Date) {
    videoDate = takenAt;
  } else if (typeof takenAt === 'string') {
    if (takenAt.includes('T') || takenAt.includes('-')) {
      videoDate = new Date(takenAt);
    } else {
      const ts = Number(takenAt);
      if (!isNaN(ts)) {
        videoDate = new Date(ts * 1000);
      }
    }
  } else if (typeof takenAt === 'number') {
    videoDate = takenAt > 1e12 ? new Date(takenAt) : new Date(takenAt * 1000);
  }
  
  if (!videoDate || isNaN(videoDate.getTime())) {
    return Math.round((views / 30000) * 10) / 10;
  }
  
  const today = new Date();
  const diffTime = today.getTime() - videoDate.getTime();
  const diffDays = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  
  return Math.round((views / diffDays / 1000) * 10) / 10;
}

// Виральность карусели: лайки / (дни * 10) — х10 сила лайков (20 за 10k/50д, 100 за 10k/10д)
function calculateCarouselViralCoefficient(likes?: number, takenAt?: number | string | null): number {
  if (!likes || likes < 100 || takenAt == null) return 0;
  let postDate: Date;
  if (typeof takenAt === 'number') {
    postDate = takenAt > 1e12 ? new Date(takenAt) : new Date(takenAt * 1000);
  } else {
    postDate = new Date(takenAt);
  }
  if (isNaN(postDate.getTime())) return 0;
  const diffDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 0;
  return Math.round((likes / (diffDays * 10)) * 10) / 10;
}

// Дата публикации карусели для карточки
function formatCarouselDate(takenAt?: number | string | null): string {
  if (takenAt == null) return '';
  let date: Date;
  if (typeof takenAt === 'number') {
    date = takenAt > 1e12 ? new Date(takenAt) : new Date(takenAt * 1000);
  } else {
    date = new Date(takenAt);
  }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface FolderConfig {
  id: string | null;
  title: string;
  color: string;
  iconType: string;
}

// Цвета для папок
const FOLDER_COLORS = [
  '#64748b', '#94a3b8', '#475569', '#10b981', '#94a3b8', 
  '#334155', '#ef4444', '#ec4899', '#14b8a6', '#84cc16'
];

// Дефолтные папки
const defaultFolderConfigs: FolderConfig[] = [
  { id: 'ideas', title: 'Идеи', color: '#94a3b8', iconType: 'lightbulb' },
  { id: '1', title: 'Ожидает сценария', color: '#475569', iconType: 'file' },
  { id: '2', title: 'Ожидает съёмок', color: '#f59e0b', iconType: 'camera' },
  { id: '3', title: 'Ожидает монтажа', color: '#10b981', iconType: 'scissors' },
  { id: '4', title: 'Готовое', color: '#334155', iconType: 'check' },
  { id: 'rejected', title: 'Не подходит', color: '#ef4444', iconType: 'rejected' },
];

interface WorkspaceProps {
  externalFolderPanelOpen?: boolean;
  onExternalFolderPanelClose?: () => void;
}

export function Workspace(_props?: WorkspaceProps) {
  const { loading } = useWorkspaceZones();
  const [sortBy, setSortBy] = useState<'viral' | 'views' | 'likes' | 'date' | 'recent' | 'views_from_avg'>('viral');
  const [sortFilterMinViral, setSortFilterMinViral] = useState(() => {
    try {
      const v = localStorage.getItem('workspace_sortFilterMinViral');
      return v ? Math.max(0, parseFloat(v) || 0) : 0;
    } catch { return 0; }
  });
  const [sortFilterMinViews, setSortFilterMinViews] = useState(() => {
    try {
      const v = localStorage.getItem('workspace_sortFilterMinViews');
      return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    } catch { return 0; }
  });
  const [selectedFolderId, setSelectedFolderIdState] = useState<string | null>(null); // null = все видео (кроме "не подходит")
  
  useEffect(() => {
    try { localStorage.setItem('workspace_sortFilterMinViral', String(sortFilterMinViral)); } catch { /* ignore */ }
  }, [sortFilterMinViral]);
  useEffect(() => {
    try { localStorage.setItem('workspace_sortFilterMinViews', String(sortFilterMinViews)); } catch { /* ignore */ }
  }, [sortFilterMinViews]);
  
  const { 
    currentProject, 
    currentProjectId, 
    addFolder, 
    removeFolder,
    restoreFolder, 
    updateFolder, 
    reorderFolders,
    carouselFoldersList,
    addCarouselFolder,
    removeCarouselFolder,
    updateCarouselFolder,
    reorderCarouselFolders,
    refetch: refetchProjects,
  } = useProjectContext();

  // Восстановление выбранной папки при смене проекта или загрузке (если папка удалена — сбрасываем)
  useEffect(() => {
    if (!currentProjectId) return;
    try {
      const key = `app_last_folder_${currentProjectId}`;
      const saved = localStorage.getItem(key);
      let folderId = saved === '' || saved === null ? null : saved;
      if (folderId && currentProject?.folders && !currentProject.folders.some(f => f.id === folderId)) {
        folderId = null;
      }
      setSelectedFolderIdState(folderId);
    } catch { /* ignore */ }
  }, [currentProjectId, currentProject]);

  const setSelectedFolderId = useCallback((folderId: string | null) => {
    setSelectedFolderIdState(folderId);
    if (currentProjectId) {
      try {
        localStorage.setItem(`app_last_folder_${currentProjectId}`, folderId ?? '');
      } catch { /* ignore */ }
    }
  }, [currentProjectId]);
  
  const { videos: inboxVideos, folderCounts, removeVideo: removeInboxVideo, restoreVideo, updateVideoFolder, loadMore, hasMore, loadingMore, refetch: refetchInboxVideos, refreshThumbnail, saveThumbnailFromUrl, addVideoToInbox, duplicateVideoPrompt, resolveDuplicateVideoPrompt } = useInboxVideos({
    folderId: selectedFolderId,
    sortBy,
  });
  const { addAction, undoLastAction, canUndo } = useActionHistory();
  const { sendChange } = useProjectSync(currentProjectId);
  const { presence, getUsername } = useProjectPresence(currentProjectId);
  const [selectedVideo, setSelectedVideo] = useState<ZoneVideo | null>(null);
  const restoredOpenDetailRef = useRef(false);
  const [moveMenuVideoId, setMoveMenuVideoId] = useState<string | null>(null);
  const [cardMenuVideoId, setCardMenuVideoId] = useState<string | null>(null);
  const [showFolderSettings, setShowFolderSettings] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [draggedFolderIndex, setDraggedFolderIndex] = useState<number | null>(null);
  const [isFolderWidgetOpen, setIsFolderWidgetOpen] = useState(true);
  const [profileStatsCache, setProfileStatsCache] = useState<Map<string, any>>(new Map());
  // Раздел контента в проекте: рилсы или карусели (восстанавливаем при обновлении)
  const [contentSection, setContentSectionState] = useState<'reels' | 'carousels'>(() => {
    if (typeof window === 'undefined') return 'reels';
    try {
      const v = localStorage.getItem('app_workspace_content_section');
      return v === 'carousels' ? 'carousels' : 'reels';
    } catch { return 'reels'; }
  });
  const setContentSection = useCallback((section: 'reels' | 'carousels') => {
    setContentSectionState(section);
    try { localStorage.setItem('app_workspace_content_section', section); } catch { /* ignore */ }
  }, []);
  const [reelsGridKey, setReelsGridKey] = useState(0);
  const [carouselsGridKey, setCarouselsGridKey] = useState(0);
  const [selectedCarousel, setSelectedCarousel] = useState<SavedCarousel | null>(null);
  const [carouselLinkUrl, setCarouselLinkUrl] = useState('');
  const [isAddingCarouselByLink, setIsAddingCarouselByLink] = useState(false);
  const [carouselSortBy, setCarouselSortBy] = useState<'viral' | 'likes' | 'recent'>('viral');
  const [selectedCarouselFolderId, setSelectedCarouselFolderId] = useState<string | null>(null);
  const [reelLinkUrl, setReelLinkUrl] = useState('');
  const [isAddingReelByLink, setIsAddingReelByLink] = useState(false);
  const [descriptionModalText, setDescriptionModalText] = useState<string | null>(null);
  const { carousels, loading: carouselsLoading, addCarousel, refreshCarouselThumbnail, refetch: refetchCarousels } = useCarousels();
  const { canAfford, deduct } = useTokenBalance();

  // Сортировка каруселей: по виральности, по лайкам, по дате добавления
  const sortedCarousels = useMemo(() => {
    if (!carousels.length) return carousels;
    const copy = [...carousels];
    if (carouselSortBy === 'viral') {
      copy.sort((a, b) => {
        const va = calculateCarouselViralCoefficient(a.like_count, a.taken_at);
        const vb = calculateCarouselViralCoefficient(b.like_count, b.taken_at);
        return vb - va;
      });
    } else if (carouselSortBy === 'likes') {
      copy.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    } else {
      copy.sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')));
    }
    return copy;
  }, [carousels, carouselSortBy]);

  // Карусели с учётом выбранной папки (во вкладке «Карусели»). «Все карусели» = только без папки.
  const carouselsForFeed = useMemo(() => {
    if (!selectedCarouselFolderId) return sortedCarousels.filter(c => !c.folder_id);
    return sortedCarousels.filter(c => c.folder_id === selectedCarouselFolderId);
  }, [sortedCarousels, selectedCarouselFolderId]);

  // Форсируем ремаунт релс/карусель-сетки при показе — иначе превью не грузятся до смены вкладки
  const prevContentSectionRef = useRef<'reels' | 'carousels' | null>(null);
  const prevReelsCountRef = useRef(0);
  const prevCarouselsCountRef = useRef(0);
  useEffect(() => {
    if (contentSection === 'reels' && prevContentSectionRef.current !== 'reels') {
      const id = requestAnimationFrame(() => setReelsGridKey(k => k + 1));
      prevContentSectionRef.current = contentSection;
      return () => cancelAnimationFrame(id);
    }
    if (contentSection === 'carousels' && prevContentSectionRef.current !== 'carousels') {
      const id = requestAnimationFrame(() => setCarouselsGridKey(k => k + 1));
      prevContentSectionRef.current = contentSection;
      return () => cancelAnimationFrame(id);
    }
    prevContentSectionRef.current = contentSection;
  }, [contentSection]);

  // Проактивная подгрузка превью для каруселей с пустым thumbnail (добавлено другим юзером)
  useEffect(() => {
    if (contentSection !== 'carousels' || !refreshCarouselThumbnail) return;
    const needRefresh = carousels.filter(
      c => !c.thumbnail_url?.trim() && (!c.slide_urls?.length || c.slide_urls.length === 0) && c.shortcode
    ).slice(0, 8);
    needRefresh.forEach(c => refreshCarouselThumbnail(c.id, c.shortcode));
  }, [contentSection, carousels, refreshCarouselThumbnail]);

  // Рост списка каруселей — ремаунтим сетку (как для рилсов), чтобы превью грузились
  useEffect(() => {
    if (contentSection !== 'carousels') return;
    const n = carouselsForFeed.length;
    if (n > prevCarouselsCountRef.current) {
      prevCarouselsCountRef.current = n;
      const t = setTimeout(() => setCarouselsGridKey(k => k + 1), 120);
      return () => clearTimeout(t);
    }
  }, [contentSection, carouselsForFeed.length]);

  // Смена папки/сортировки каруселей — ремаунтим сетку
  const prevCarouselSortRef = useRef<string | null>(null);
  const prevCarouselFolderRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (contentSection !== 'carousels') return;
    const sortKey = carouselSortBy;
    const folderKey = selectedCarouselFolderId ?? '__all__';
    if (prevCarouselSortRef.current !== null && (prevCarouselSortRef.current !== sortKey || prevCarouselFolderRef.current !== folderKey)) {
      setCarouselsGridKey(k => k + 1);
    }
    prevCarouselSortRef.current = sortKey;
    prevCarouselFolderRef.current = folderKey;
  }, [contentSection, carouselSortBy, selectedCarouselFolderId]);

  // Проактивная подгрузка превью для рилсов — как у каруселей: пустое или битое превью (добавлено другим юзером)
  useEffect(() => {
    if (contentSection !== 'reels' || !refreshThumbnail) return;
    const needRefresh = inboxVideos.filter((v: any) => {
      const url = (v.previewUrl || v.preview_url || '').toLowerCase();
      const shortcode = v.shortcode ?? v.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];
      if (!shortcode || String(v.id).startsWith('local-')) return false;
      const empty = !url?.trim();
      const broken = empty || url?.includes('instagram.com') || url?.includes('wsrv.nl') || url?.includes('cdninstagram') || url?.includes('fbcdn.net');
      const hasStorage = url?.includes('supabase.co');
      return broken && !hasStorage;
    }).slice(0, 12);
    needRefresh.forEach((v: any) => {
      const shortcode = v.shortcode ?? v.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];
      if (shortcode) refreshThumbnail(v.id, shortcode, true);
    });
  }, [contentSection, inboxVideos, refreshThumbnail]);

  const [isMobileFolderPanelOpen, setIsMobileFolderPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const closeMobileFolderPanel = () => {
    setIsMobileFolderPanelOpen(false);
  };
  
  // Преобразуем папки проекта в FolderConfig формат
  const projectFolders: FolderConfig[] = currentProject?.folders
    ?.slice()
    .sort((a, b) => a.order - b.order)
    .filter(f => f.icon !== 'all') // Исключаем системную папку "Все видео"
    .map(f => ({
      id: f.id,
      title: f.name,
      color: f.color,
      iconType: f.icon,
    })) || [];
  
  // Папки для фильтрации (рилсы)
  const folderConfigs: FolderConfig[] = projectFolders.length > 0 ? projectFolders : defaultFolderConfigs;
  
  // Папки каруселей — отдельный список для вкладки «Карусели»
  const carouselFolderConfigs: FolderConfig[] = (currentProjectId ? carouselFoldersList(currentProjectId) : [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(f => ({ id: f.id, title: f.name, color: f.color, iconType: f.icon }));
  
  // Подсчёт каруселей в папке
  const getCarouselCountInFolder = useCallback((folderId: string | null): number => {
    if (folderId === null) return carousels.filter(c => !c.folder_id).length;
    return carousels.filter(c => c.folder_id === folderId).length;
  }, [carousels]);
  
  // ID папки "Не подходит"
  const rejectedFolderId = folderConfigs.find(f => f.iconType === 'rejected')?.id;

  // Перемещение видео в другую папку
  const handleMoveToFolder = async (video: ZoneVideo, targetFolderId: string) => {
    const targetFolder = folderConfigs.find(f => f.id === targetFolderId);
    const oldFolderId = (video as any).folder_id || null;
    
    try {
      const success = await updateVideoFolder(video.id, targetFolderId);
      if (success) {
        // Отправляем изменение для синхронизации
        if (currentProjectId) {
          await sendChange(
            'video_moved',
            'video',
            video.id,
            { folder_id: oldFolderId },
            { folder_id: targetFolderId }
          );
        }
        
        setMoveMenuVideoId(null);
        setCardMenuVideoId(null);
        toast.success(`Перемещено в "${targetFolder?.title || 'папку'}"`);
      } else {
        toast.error('Ошибка перемещения');
      }
    } catch (err) {
      console.error('Ошибка перемещения:', err);
      toast.error('Ошибка перемещения');
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    const video = inboxVideos.find(v => v.id === videoId);
    const videoData = await removeInboxVideo(videoId);
    
    if (videoData) {
      // Отправляем изменение для синхронизации
      if (currentProjectId && video) {
        await sendChange(
          'video_deleted',
          'video',
          videoId,
          { folder_id: (video as any).folder_id },
          null
        );
      }
      
      addAction('delete_video', videoData);
      toast.success('Видео удалено', {
        action: {
          label: 'Отменить',
          onClick: handleUndo,
        },
        duration: 5000,
      });
    }
  };

  const handleUndo = async () => {
    const lastAction = undoLastAction();
    if (!lastAction) return;
    
    if (lastAction.type === 'delete_video') {
      const success = await restoreVideo(lastAction.data);
      if (success) {
        toast.success('Видео восстановлено');
      } else {
        toast.error('Не удалось восстановить видео');
      }
    } else if (lastAction.type === 'delete_folder') {
      const success = await restoreFolder(lastAction.data);
      if (success) {
        toast.success('Папка восстановлена');
        await refetchProjects();
      } else {
        toast.error('Не удалось восстановить папку');
      }
    }
  };

  // Преобразование inbox видео в ZoneVideo формат
  const transformInboxVideo = (v: any, folderId: string | null): ZoneVideo => ({
    id: v.id,
    title: v.title,
    preview_url: v.previewUrl,
    url: v.url,
    shortcode: v.shortcode ?? v.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1],
    zone_id: folderId,
    folder_id: (v as any).folder_id || null,
    position_x: 0,
    position_y: 0,
    view_count: (v as any).view_count,
    like_count: (v as any).like_count,
    comment_count: (v as any).comment_count,
    owner_username: (v as any).owner_username,
    taken_at: (v as any).taken_at,
    created_at: v.receivedAt?.toISOString(),
    transcript_id: (v as any).transcript_id,
    transcript_status: (v as any).transcript_status,
    transcript_text: (v as any).transcript_text,
    translation_text: (v as any).translation_text,
    script_text: (v as any).script_text,
    download_url: (v as any).download_url,
    storage_video_url: (v as any).storage_video_url,
    script_responsible: (v as any).script_responsible,
    editing_responsible: (v as any).editing_responsible,
    draft_link: (v as any).draft_link,
    final_link: (v as any).final_link,
    links: (v as any).links,
    responsibles: (v as any).responsibles,
    status: 'active',
  });

  // Получаем видео для ленты — хук уже фильтрует по selectedFolderId
  const getVideosForFeed = (): ZoneVideo[] => {
    return inboxVideos.map(v => transformInboxVideo(v, (v as any).folder_id));
  };
  
  // Фильтрация и сортировка видео
  const getSortedVideos = (videos: ZoneVideo[]): ZoneVideo[] => {
    const withViral = (v: ZoneVideo) => {
      const coef = calculateViralCoefficient(v.view_count, v.taken_at || v.created_at);
      const profile = v.owner_username ? profileStatsCache.get(v.owner_username.toLowerCase()) : null;
      const mult = calculateViralMultiplier(v.view_count || 0, profile);
      return applyViralMultiplierToCoefficient(coef, mult);
    };
    
    let filtered = videos;
    if (sortBy === 'viral' && sortFilterMinViral > 0) {
      filtered = videos.filter(v => withViral(v) >= sortFilterMinViral);
    }
    if ((sortBy === 'views' || sortBy === 'views_from_avg') && sortFilterMinViews > 0) {
      filtered = filtered.filter(v => (v.view_count || 0) >= sortFilterMinViews);
    }
    
    const avgViews = sortBy === 'views_from_avg' && filtered.length > 0
      ? filtered.reduce((s, v) => s + (v.view_count || 0), 0) / filtered.length
      : 0;
    
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'viral': {
          return withViral(b) - withViral(a);
        }
        case 'views':
          return (b.view_count || 0) - (a.view_count || 0);
        case 'views_from_avg': {
          const deltaA = (a.view_count || 0) - avgViews;
          const deltaB = (b.view_count || 0) - avgViews;
          return deltaB - deltaA;
        }
        case 'likes':
          return (b.like_count || 0) - (a.like_count || 0);
        case 'date':
          return String(b.taken_at || b.created_at || '').localeCompare(String(a.taken_at || a.created_at || ''));
        case 'recent':
          return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        default:
          return 0;
      }
    });
  };
  
  // Получить название папки по ID
  const getFolderName = (folderId: string | null): string => {
    const folder = folderConfigs.find(f => f.id === folderId);
    return folder?.title || 'Без папки';
  };
  
  // Получить цвет папки по ID
  const getFolderColor = (folderId: string | null): string => {
    const folder = folderConfigs.find(f => f.id === folderId);
    return folder?.color || '#94a3b8';
  };
  
  // Подсчёт видео в папке (из отдельного запроса folderCounts)
  const getVideoCountInFolder = (folderId: string | null): number => {
    const key = folderId === null ? '__null__' : folderId;
    return folderCounts[key] ?? 0;
  };

  // ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО УСЛОВНЫХ ВОЗВРАТОВ!
  const videosForFeed = useMemo(() => getVideosForFeed(), [inboxVideos]);
  const feedVideos = useMemo(() => {
    return getSortedVideos(videosForFeed);
  }, [videosForFeed, sortBy, sortFilterMinViral, sortFilterMinViews, profileStatsCache]);

  // При росте списка (6→19→60 после нескольких fetch) ремаунтим сетку — иначе превью не грузятся у новых карточек
  useEffect(() => {
    if (contentSection !== 'reels') return;
    const n = feedVideos.length;
    if (n > prevReelsCountRef.current) {
      prevReelsCountRef.current = n;
      const t = setTimeout(() => setReelsGridKey(k => k + 1), 120);
      return () => clearTimeout(t);
    }
  }, [contentSection, feedVideos.length]);

  // При смене папки или сортировки ремаунтим сетку — превью тогда стабильно подгружаются
  const prevSortRef = useRef<string | null>(null);
  const prevFolderRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (contentSection !== 'reels') return;
    const sortKey = sortBy;
    const folderKey = selectedFolderId ?? '__all__';
    if (prevSortRef.current !== null && (prevSortRef.current !== sortKey || prevFolderRef.current !== folderKey)) {
      setReelsGridKey(k => k + 1);
    }
    prevSortRef.current = sortKey;
    prevFolderRef.current = folderKey;
  }, [contentSection, sortBy, selectedFolderId]);

  const totalVideos = Object.entries(folderCounts).reduce(
    (sum, [key, count]) => (key === rejectedFolderId ? sum : sum + count),
    0
  );
  
  // Создаем стабильную строку зависимостей для usernames
  const usernamesKey = useMemo(() => {
    const usernames = new Set<string>();
    videosForFeed.forEach(v => {
      if (v.owner_username) {
        usernames.add(v.owner_username.toLowerCase());
      }
    });
    return Array.from(usernames).sort().join(',');
  }, [videosForFeed]);
  
  // Загружаем статистику профилей для видео
  useEffect(() => {
    const loadProfileStats = async () => {
      const usernames = new Set<string>();
      videosForFeed.forEach(v => {
        if (v.owner_username) {
          usernames.add(v.owner_username.toLowerCase());
        }
      });
      
      for (const username of usernames) {
        if (!profileStatsCache.has(username)) {
          const stats = await getProfileStats(username);
          if (stats) {
            setProfileStatsCache(prev => new Map(prev).set(username, stats));
          }
        }
      }
    };
    
    if (videosForFeed.length > 0) {
      loadProfileStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernamesKey]);

  // Загружаем статистику профилей для авторов каруселей (для «x от мин» по лайкам)
  const carouselUsernamesKey = useMemo(() => {
    if (contentSection !== 'carousels' || carousels.length === 0) return '';
    const usernames = new Set<string>();
    carousels.forEach(c => {
      if (c.owner_username) usernames.add(c.owner_username.toLowerCase());
    });
    return Array.from(usernames).sort().join(',');
  }, [contentSection, carousels]);
  useEffect(() => {
    if (!carouselUsernamesKey) return;
    const loadCarouselProfileStats = async () => {
      const usernames = carouselUsernamesKey.split(',').filter(Boolean);
      for (const username of usernames) {
        if (!profileStatsCache.has(username)) {
          const stats = await getProfileStats(username);
          if (stats) {
            setProfileStatsCache(prev => new Map(prev).set(username, stats));
          }
        }
      }
    };
    loadCarouselProfileStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselUsernamesKey]);

  // Синхронизация выбранного видео с лентой после обновления данных (только при смене ссылки на объект)
  useEffect(() => {
    if (!selectedVideo) return;
    const updated = feedVideos.find(v => v.id === selectedVideo.id);
    if (updated && updated !== selectedVideo) setSelectedVideo(updated);
  }, [feedVideos, selectedVideo]);

  // Сохраняем открытую карточку (видео или карусель) для восстановления после обновления страницы
  useEffect(() => {
    try {
      if (selectedVideo) {
        localStorage.setItem('app_workspace_open_detail', JSON.stringify({ type: 'video', id: selectedVideo.id }));
      } else if (selectedCarousel) {
        localStorage.setItem('app_workspace_open_detail', JSON.stringify({ type: 'carousel', id: selectedCarousel.id }));
      } else {
        localStorage.removeItem('app_workspace_open_detail');
      }
    } catch { /* ignore */ }
  }, [selectedVideo, selectedCarousel]);

  // Восстанавливаем открытую карточку только после полной перезагрузки страницы (не при переходе Лента → Другое → Лента)
  useEffect(() => {
    if (restoredOpenDetailRef.current) return;
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem('workspace_restored')) return;
    try {
      const raw = localStorage.getItem('app_workspace_open_detail');
      if (!raw) {
        sessionStorage.setItem('workspace_restored', '1');
        return;
      }
      const d = JSON.parse(raw);
      if (d?.type === 'video' && d.id) {
        const v = feedVideos.find((x: ZoneVideo) => x.id === d.id);
        if (v) setSelectedVideo(v);
      } else if (d?.type === 'carousel' && d.id) {
        const c = carousels.find((x: SavedCarousel) => x.id === d.id);
        if (c) setSelectedCarousel(c);
      }
    } catch { /* ignore */ }
    restoredOpenDetailRef.current = true;
    try { sessionStorage.setItem('workspace_restored', '1'); } catch { /* ignore */ }
  }, [feedVideos, carousels]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400 text-lg">Загрузка...</div>
      </div>
    );
  }

  const videoDetailProps = selectedVideo ? {
    video: {
      id: selectedVideo.id,
      title: selectedVideo.title,
      preview_url: selectedVideo.preview_url,
      url: selectedVideo.url,
      view_count: selectedVideo.view_count,
      like_count: selectedVideo.like_count,
      comment_count: selectedVideo.comment_count,
      owner_username: selectedVideo.owner_username,
      taken_at: selectedVideo.taken_at,
      transcript_id: (selectedVideo as any).transcript_id,
      transcript_status: (selectedVideo as any).transcript_status,
      transcript_text: (selectedVideo as any).transcript_text,
      translation_text: (selectedVideo as any).translation_text,
      script_text: (selectedVideo as any).script_text,
      download_url: (selectedVideo as any).download_url,
      storage_video_url: (selectedVideo as any).storage_video_url,
      folder_id: selectedVideo.folder_id,
      script_responsible: (selectedVideo as any).script_responsible,
      editing_responsible: (selectedVideo as any).editing_responsible,
      draft_link: (selectedVideo as any).draft_link,
      final_link: (selectedVideo as any).final_link,
      links: (selectedVideo as any).links,
      responsibles: (selectedVideo as any).responsibles,
    },
    onBack: () => setSelectedVideo(null),
    onRefreshData: async () => { await refetchInboxVideos(); },
  } : null;

  // Обработчик создания папки (рилсы или карусели — в зависимости от вкладки)
  const handleCreateFolder = async () => {
    if (!currentProjectId || !newFolderName.trim()) return;
    const folderName = newFolderName.trim();
    if (contentSection === 'carousels') {
      await addCarouselFolder(currentProjectId, folderName);
    } else {
      await addFolder(currentProjectId, folderName);
      const updatedProject = currentProject;
      const newFolder = updatedProject?.folders?.find(f => f.name === folderName);
      if (newFolder) {
        await sendChange(
          'folder_created',
          'folder',
          newFolder.id,
          null,
          { name: newFolder.name, color: newFolder.color, icon: newFolder.icon, order: newFolder.order }
        );
      }
    }
    setNewFolderName('');
    await refetchProjects();
    toast.success('Папка создана');
  };
  
  // Обработчик удаления папки (рилсы или карусели)
  const handleDeleteFolder = async (folderId: string) => {
    if (!currentProjectId) return;
    const folderData = contentSection === 'carousels'
      ? await removeCarouselFolder(currentProjectId, folderId)
      : await removeFolder(currentProjectId, folderId);
    
    if (folderData) {
      if (contentSection !== 'carousels' && currentProjectId) {
        await sendChange(
          'folder_deleted',
          'folder',
          folderId,
          { name: folderData.name, color: folderData.color, icon: folderData.icon },
          null
        );
      }
      if (contentSection !== 'carousels') {
        addAction('delete_folder', folderData);
      }
      toast.success('Папка удалена', {
        ...(contentSection !== 'carousels' ? {
          action: { label: 'Отменить', onClick: handleUndo },
          duration: 5000,
        } : {}),
      });
    }
  };
  
  // Обработчик обновления папки (рилсы или карусели)
  const handleUpdateFolder = async (folderId: string, updates: Partial<Omit<ProjectFolder, 'id'>>) => {
    if (!currentProjectId) return;
    const list = contentSection === 'carousels'
      ? carouselFoldersList(currentProjectId)
      : (currentProject?.folders ?? []);
    const folder = list.find(f => f.id === folderId);
    const oldData = folder ? { name: folder.name, color: folder.color, icon: folder.icon } : null;
    
    if (contentSection === 'carousels') {
      await updateCarouselFolder(currentProjectId, folderId, updates);
    } else {
      await updateFolder(currentProjectId, folderId, updates);
      if (currentProjectId && oldData) {
        const changeType = updates.name ? 'folder_renamed' : 'project_updated';
        sendChange(changeType, 'folder', folderId, oldData, { ...oldData, ...updates }).catch(() => {});
      }
    }
    setEditingFolder(null);
  };
  
  // Drag & drop для перестановки папок
  const handleFolderDragStart = (index: number) => {
    setDraggedFolderIndex(index);
  };
  
  const handleFolderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedFolderIndex === null || draggedFolderIndex === index) return;
  };
  
  const handleFolderDrop = async (targetIndex: number) => {
    if (!currentProjectId || draggedFolderIndex === null) return;
    
    const list = contentSection === 'carousels'
      ? carouselFoldersList(currentProjectId).slice().sort((a, b) => a.order - b.order)
      : (currentProject?.folders?.slice().sort((a, b) => a.order - b.order) || []);
    if (draggedFolderIndex === targetIndex) {
      setDraggedFolderIndex(null);
      return;
    }
    
    const newOrder = [...list];
    const [moved] = newOrder.splice(draggedFolderIndex, 1);
    newOrder.splice(targetIndex, 0, moved);
    
    if (contentSection === 'carousels') {
      await reorderCarouselFolders(currentProjectId, newOrder.map(f => f.id));
    } else {
      await reorderFolders(currentProjectId, newOrder.map(f => f.id));
    }
    setDraggedFolderIndex(null);
    toast.success('Порядок папок изменён');
  };

  // Текущая выбранная папка для заголовка
  const currentFolderConfig = selectedFolderId 
    ? folderConfigs.find(f => f.id === selectedFolderId) 
    : null;

  return (
    <>
      <AnimatePresence>
        {selectedCarousel && (
          <motion.div
            key="carousel-detail-overlay"
            className={cn(
              "fixed inset-0 z-[100] flex overflow-y-auto",
              "justify-center items-end md:items-center",
              "p-0 md:p-6"
            )}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={backdropFade}
          >
            <div className="absolute inset-0 bg-black/25 backdrop-blur-glass-2xl" onClick={() => setSelectedCarousel(null)} aria-hidden />
            <motion.div
              className={cn(
                "relative w-full min-h-0 overflow-hidden shadow-float-lg bg-base-alt flex-shrink-0",
                "max-w-full md:max-w-6xl",
                "h-[95vh] md:h-[90vh] max-h-[900px]",
                "rounded-t-[20px] md:rounded-card-2xl",
                "border-0 md:border border-white/[0.35]",
                "my-0"
              )}
              variants={isMobile ? dialogSlideUp : dialogScale}
              transition={iosSpringSoft}
              onClick={e => e.stopPropagation()}
            >
              <CarouselDetailPage
                carousel={selectedCarousel}
                onBack={() => setSelectedCarousel(null)}
                onRefreshData={refetchCarousels}
              />
            </motion.div>
          </motion.div>
        )}
        {selectedVideo && videoDetailProps && (
          <motion.div
            key="video-detail-overlay"
            className={cn(
              "fixed inset-0 z-[100] flex overflow-y-auto",
              "justify-center items-end md:items-center",
              "p-0 md:p-6"
            )}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={backdropFade}
          >
            <div
              className="absolute inset-0 bg-black/25 backdrop-blur-glass-2xl"
              onClick={() => setSelectedVideo(null)}
              aria-hidden
            />
            <motion.div
              className={cn(
                "relative w-full min-h-0 overflow-hidden shadow-float-lg bg-base-alt flex-shrink-0",
                "max-w-full md:max-w-6xl",
                "h-[95vh] md:h-[90vh] max-h-[900px]",
                "rounded-t-[20px] md:rounded-card-2xl",
                "border-0 md:border border-white/[0.35]",
                "my-0"
              )}
              variants={isMobile ? dialogSlideUp : dialogScale}
              transition={iosSpringSoft}
              onClick={e => e.stopPropagation()}
            >
              <VideoDetailPage
                video={videoDetailProps.video}
                onBack={() => setSelectedVideo(null)}
                onRefreshData={videoDetailProps.onRefreshData}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-full min-h-0 overflow-hidden relative flex flex-col">
      {/* Floating Folder Widget - Desktop */}
      <div className={cn(
        "hidden md:block absolute top-4 right-4 z-40 bg-[#f8f8fa] rounded-card-xl shadow-[0_20px_48px_rgba(15,23,42,0.16)] border border-slate-200 transition-all duration-300 overflow-hidden isolate",
        isFolderWidgetOpen ? "w-56" : "w-auto"
      )}>
        {/* Widget Header */}
          <div 
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 rounded-t-card-xl transition-colors"
          onClick={() => setIsFolderWidgetOpen(!isFolderWidgetOpen)}
        >
          <div className="flex items-center gap-2">
            <GlassFolderIcon iconType="folder" color="#475569" size={22} simple />
            <span className="text-sm font-semibold text-slate-700">Папки</span>
          </div>
          {isFolderWidgetOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
        
        {/* Widget Content */}
        {isFolderWidgetOpen && (
          <div className="px-2 pb-3 flex flex-col max-h-[min(60vh,400px)] min-h-0 bg-[#f8f8fa] rounded-b-card-xl">
            {contentSection === 'carousels' ? (
              <>
                {/* Все карусели */}
                <button
                  onClick={() => setSelectedCarouselFolderId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-card transition-all text-left mb-2 shrink-0 border",
                    selectedCarouselFolderId === null 
                      ? "bg-white text-slate-900 border-slate-200 shadow-sm" 
                      : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <GlassFolderIcon iconType="inbox" color="#64748b" size={22} simple />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">Все карусели</span>
                    <span className="text-xs text-slate-600 tabular-nums">{carousels.length} каруселей</span>
                  </div>
                </button>
                <div className="my-3 shrink-0" aria-hidden />
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar-light -mx-1 px-1">
                  {carouselFolderConfigs.map(folder => {
                    const count = getCarouselCountInFolder(folder.id);
                    const isSelected = selectedCarouselFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedCarouselFolderId(folder.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left border",
                          isSelected ? "bg-white border-slate-200 shadow-sm" : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <GlassFolderIcon iconType={folder.iconType} color={folder.color} size={22} simple />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm font-medium block truncate text-slate-800", isSelected && "text-slate-900")}>{folder.title}</span>
                          <span className="text-xs text-slate-600 tabular-nums">{count} каруселей</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Все видео (лента рилсов) */}
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-card transition-all text-left mb-2 shrink-0 border",
                    selectedFolderId === null 
                      ? "bg-white text-slate-900 border-slate-200 shadow-sm" 
                      : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <GlassFolderIcon iconType="inbox" color="#64748b" size={22} simple />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">Все видео</span>
                    <span className="text-xs text-slate-600 tabular-nums">{totalVideos} видео</span>
                  </div>
                </button>
                <div className="my-3 shrink-0" aria-hidden />
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar-light -mx-1 px-1">
                  {folderConfigs.map(folder => {
                    const count = getVideoCountInFolder(folder.id);
                    const isSelected = selectedFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left border",
                          isSelected ? "bg-white border-slate-200 shadow-sm" : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <GlassFolderIcon iconType={folder.iconType} color={folder.color} size={22} simple />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm font-medium block truncate text-slate-800", isSelected && "text-slate-900")}>{folder.title}</span>
                          <span className="text-xs text-slate-600 tabular-nums">{count} видео</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="my-3 shrink-0 border-t border-slate-100" aria-hidden />
            <button
              onClick={() => setShowFolderSettings(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-medium transition-colors touch-manipulation shrink-0 border border-slate-200"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Settings className="w-4 h-4" />
              </div>
              {contentSection === 'carousels' ? 'Настроить папки каруселей' : 'Настроить папки'}
            </button>
          </div>
        )}
      </div>

      {/* Панель Папки на мобильных — выдвигается справа */}
      <>
        {/* Backdrop — всегда в DOM */}
        <motion.div
          initial={false}
          animate={{ opacity: isMobileFolderPanelOpen ? 1 : 0 }}
          transition={{ duration: isMobileFolderPanelOpen ? 0.22 : 0.18, ease: 'linear' }}
          className="md:hidden fixed inset-0 z-[200] bg-black/25 touch-none"
          style={{ pointerEvents: isMobileFolderPanelOpen ? 'auto' : 'none' }}
          onClick={closeMobileFolderPanel}
          aria-hidden
        />
        {/* Panel — всегда в DOM */}
        <motion.div
          initial={false}
          animate={{ x: isMobileFolderPanelOpen ? '0%' : '100%' }}
          transition={{
            type: 'tween',
            duration: isMobileFolderPanelOpen ? 0.34 : 0.22,
            ease: isMobileFolderPanelOpen ? [0.25, 0.46, 0.45, 0.94] : [0.55, 0, 1, 0.45],
          }}
          className="md:hidden fixed top-0 right-0 bottom-0 z-[201] w-[min(320px,85vw)] flex flex-col"
          style={{
            willChange: 'transform',
            backgroundColor: '#f8f8fa',
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
            boxShadow: '-8px 0 40px rgba(0,0,0,0.13)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
            <div
              className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#f8f8fa' }}
            >
              <span className="text-[15px] font-semibold text-slate-800">Папки</span>
              <button
                onClick={closeMobileFolderPanel}
                className="flex items-center justify-center rounded-full touch-manipulation"
                style={{ width: 32, height: 32, backgroundColor: 'rgba(0,0,0,0.07)' }}
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 text-slate-600" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
              <div className="grid grid-cols-2 gap-3">
                {contentSection === 'carousels' ? (
                  <>
                    <button
                      onClick={() => { setSelectedCarouselFolderId(null); closeMobileFolderPanel(); }}
                      className={cn(
                        "flex flex-col items-center rounded-2xl p-4 min-h-[120px] touch-manipulation",
                        "bg-white/50 backdrop-blur-md border border-white/60",
                        "shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
                        selectedCarouselFolderId === null && "ring-2 ring-slate-300/40 bg-white/70"
                      )}
                    >
                      <GlassFolderIcon iconType="inbox" color="#64748b" size={28} simple className="mb-2" />
                      <span className="text-sm font-semibold truncate w-full text-center text-slate-700">Все карусели</span>
                      <span className="text-xs text-slate-400 mt-0.5">{carousels.length}</span>
                    </button>
                    {carouselFolderConfigs.map(folder => {
                      const count = getCarouselCountInFolder(folder.id);
                      const isSelected = selectedCarouselFolderId === folder.id;
                      return (
                        <button
                          key={folder.id}
                          onClick={() => { setSelectedCarouselFolderId(folder.id); closeMobileFolderPanel(); }}
                          className={cn(
                            "flex flex-col items-center rounded-2xl p-4 min-h-[120px] touch-manipulation",
                            "bg-white/50 backdrop-blur-md border border-white/60",
                            "shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
                            isSelected && "ring-2 ring-slate-300/50 bg-white/70"
                          )}
                        >
                          <GlassFolderIcon iconType={folder.iconType} color={folder.color} size={28} simple className="mb-2" />
                          <span className={cn("text-sm font-semibold truncate w-full text-center", isSelected && "text-slate-800")}>{folder.title}</span>
                          <span className="text-xs text-slate-400 mt-0.5">{count}</span>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setSelectedFolderId(null); closeMobileFolderPanel(); }}
                      className={cn(
                        "flex flex-col items-center rounded-2xl p-4 min-h-[120px] touch-manipulation",
                        "bg-white/50 backdrop-blur-md border border-white/60",
                        "shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
                        selectedFolderId === null && "ring-2 ring-slate-300/40 bg-white/70"
                      )}
                    >
                      <GlassFolderIcon iconType="inbox" color="#64748b" size={28} simple className="mb-2" />
                      <span className={cn("text-sm font-semibold truncate w-full text-center", selectedFolderId === null ? "text-slate-700" : "text-slate-700")}>Все видео</span>
                      <span className="text-xs text-slate-400 mt-0.5">{totalVideos}</span>
                    </button>
                    {folderConfigs.map(folder => {
                      const count = getVideoCountInFolder(folder.id);
                      const isSelected = selectedFolderId === folder.id;
                      const isRejected = folder.iconType === 'rejected';
                      return (
                        <button
                          key={folder.id}
                          onClick={() => { setSelectedFolderId(folder.id); closeMobileFolderPanel(); }}
                          className={cn(
                            "flex flex-col items-center rounded-2xl p-4 min-h-[120px] touch-manipulation",
                            "bg-white/50 backdrop-blur-md border border-white/60",
                            "shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
                            isSelected && "ring-2 ring-slate-300/50 bg-white/70",
                            isRejected && "opacity-70"
                          )}
                        >
                          <GlassFolderIcon iconType={folder.iconType} color={folder.color} size={28} simple className="mb-2" />
                          <span className={cn("text-sm font-semibold truncate w-full text-center", isSelected && "text-slate-800")}>{folder.title}</span>
                          <span className="text-xs text-slate-400 mt-0.5">{count}</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {/* Карточка «Настроить папки» — на всю ширину */}
                <button
                  onClick={() => { setShowFolderSettings(true); closeMobileFolderPanel(); }}
                  className={cn(
                    "col-span-2 flex items-center justify-center gap-2 rounded-2xl py-3 px-4 mt-1 touch-manipulation",
                    "bg-white/40 backdrop-blur-md border border-white/50 text-slate-500",
                    "hover:bg-white/50 active:bg-white/60"
                  )}
                >
                  <Settings className="w-5 h-5" strokeWidth={2.5} />
                  <span className="text-sm font-medium">{contentSection === 'carousels' ? 'Настроить папки каруселей' : 'Настроить папки'}</span>
                </button>
              </div>
            </div>
        </motion.div>
      </>

      {/* Main Content - Video Feed or Carousels. overflow-scroll-touch для листания на мобильных */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-6 safe-left safe-right custom-scrollbar-light overflow-scroll-touch" 
        style={{ maxHeight: '100%' }}
      >
        <div className="max-w-6xl mx-auto py-4 md:py-8 pb-28 md:pb-8 safe-top safe-bottom">
          {/* Tabs: Рилсы | Карусели (в каждом проекте два раздела) */}
          <div className="flex gap-1.5 p-1.5 mb-4 md:mb-6 rounded-2xl md:rounded-card-xl bg-white/68 backdrop-blur-glass border border-white/55 shadow-glass-sm w-full md:w-fit">
            <button
              onClick={() => setContentSection('reels')}
              className={cn(
                'flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all touch-manipulation',
                contentSection === 'reels'
                  ? 'bg-white/88 text-slate-800 border border-white/60 shadow-glass-sm'
                  : 'text-slate-600 active:bg-white/50 hover:bg-white/45'
              )}
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              Рилсы
              <span className="tabular-nums text-slate-500">{totalVideos}</span>
            </button>
            <button
              onClick={() => setContentSection('carousels')}
              className={cn(
                'flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all touch-manipulation',
                contentSection === 'carousels'
                  ? 'bg-white/88 text-slate-800 border border-white/60 shadow-glass-sm'
                  : 'text-slate-600 active:bg-white/50 hover:bg-white/45'
              )}
            >
              <Images className="w-4 h-4" strokeWidth={2.5} />
              Карусели
              <span className="tabular-nums text-slate-500">{carousels.length}</span>
            </button>
          </div>

          {/* Рилсы: текущая лента */}
          {contentSection === 'reels' && (
          <>
          {/* Header — glass bar, на мобильных кнопка папок справа */}
          <div className="mb-6 md:mb-8 rounded-2xl md:rounded-card-xl bg-white/72 backdrop-blur-glass-xl shadow-glass border border-white/55 px-4 py-4 md:px-6 md:py-5 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-5">
              <div className="flex items-center justify-between md:justify-start gap-3 flex-shrink-0 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                {currentFolderConfig ? (
                  <>
                    <GlassFolderIcon iconType={currentFolderConfig.iconType} color={currentFolderConfig.color} size={28} invert />
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-slate-800">{currentFolderConfig.title}</h1>
                      <p className="text-slate-500 text-xs md:text-sm tabular-nums mt-1">{feedVideos.length} видео</p>
                    </div>
                  </>
                ) : (
                  <>
                    <GlassFolderIcon iconType="sparkles" color="#475569" size={28} simple />
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Все видео</h1>
                      <p className="text-slate-500 text-xs md:text-sm tabular-nums mt-1">
                        {feedVideos.length} видео
                        {' • '}
                        {sortBy === 'viral' && `виральность${sortFilterMinViral > 0 ? ` ≥${sortFilterMinViral}` : ''}`}
                        {sortBy === 'views' && `просмотры${sortFilterMinViews > 0 ? ` ≥${formatNumber(sortFilterMinViews)}` : ''}`}
                        {sortBy === 'views_from_avg' && `от среднего${sortFilterMinViews > 0 ? ` (≥${formatNumber(sortFilterMinViews)})` : ''}`}
                        {sortBy === 'likes' && 'лайки'}
                        {sortBy === 'recent' && 'недавно'}
                      </p>
                    </div>
                  </>
                )}
                </div>
                {/* Кнопка папок — мобильные, сверху справа */}
                <button
                  onClick={() => setIsMobileFolderPanelOpen(true)}
                  className="md:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-glass border border-white/60 text-slate-600 active:bg-white transition-colors touch-manipulation flex-shrink-0 shadow-glass-sm"
                  aria-label="Папки"
                >
                  <FolderOpen className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* Фильтры сортировки — всегда видны сверху, отдельно от кнопок */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-slate-500 font-medium">Фильтры:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-white/62 border border-white/55 rounded-pill px-3 py-1.5 backdrop-blur-glass shadow-glass-sm">
                  виральность ≥
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={sortFilterMinViral}
                    onChange={(e) => setSortFilterMinViral(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-14 px-2 py-1 rounded-lg border border-white/60 text-slate-800 text-sm bg-white/85 outline-none focus:ring-2 focus:ring-slate-200/70"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-white/62 border border-white/55 rounded-pill px-3 py-1.5 backdrop-blur-glass shadow-glass-sm">
                  просмотры ≥
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={sortFilterMinViews || ''}
                    onChange={(e) => setSortFilterMinViews(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="0"
                    className="w-20 px-2 py-1 rounded-lg border border-white/60 text-slate-800 text-sm bg-white/85 outline-none focus:ring-2 focus:ring-slate-200/70"
                  />
                </label>
              </div>

              {/* Сортировка и кнопка отмены */}
              <div className="flex items-center gap-2 min-w-0">
                {canUndo && (
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-2xl bg-white/72 backdrop-blur-glass border border-white/55 hover:bg-white/88 active:bg-white text-slate-700 text-xs font-medium transition-all shadow-glass-sm touch-manipulation flex-shrink-0"
                    title="Отменить последнее действие"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Отменить</span>
                  </button>
                )}
                <div className="sort-pill flex items-center gap-1.5 overflow-x-auto overflow-y-hidden flex-1 min-w-0 scrollbar-hide">
                {[
                  { value: 'viral', label: 'Виральность', icon: Sparkles, title: 'По коэффициенту виральности' },
                  { value: 'views', label: 'Просмотры', icon: Eye, title: 'По количеству просмотров' },
                  { value: 'views_from_avg', label: 'От среднего', icon: TrendingUp, title: 'По отклонению просмотров от среднего' },
                  { value: 'likes', label: 'Лайки', icon: Heart, title: 'По количеству лайков' },
                  { value: 'recent', label: 'Недавно', icon: Inbox, title: 'По дате добавления' },
                ].map(({ value, label, icon: Icon, title }) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value as typeof sortBy)}
                    title={title}
                    style={{ padding: "6px 12px" }}
                    className={cn(
                      "sort-pill flex items-center gap-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 touch-manipulation",
                      sortBy === value
                        ? "bg-slate-800 text-white shadow-glass-sm"
                        : "bg-white/68 backdrop-blur-glass border border-white/55 text-slate-500 hover:bg-white/84 hover:text-slate-700"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                    <span>{label}</span>
                  </button>
                ))}
                </div>
              </div>
            </div>
            {/* Добавить рилс по ссылке — как во вкладке Карусели */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4 pt-4 border-t border-white/55">
                <div className="flex gap-2 flex-1 sm:min-w-[280px]">
                  <input
                    type="url"
                    value={reelLinkUrl}
                    onChange={e => setReelLinkUrl(e.target.value)}
                    placeholder="Ссылка на рилс (instagram.com/reel/...)"
                    className="flex-1 min-w-0 px-4 py-2.5 rounded-2xl border border-white/60 bg-white/82 backdrop-blur-glass text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/70 focus:border-white/70 shadow-glass-sm"
                  />
                  <button
                    onClick={async () => {
                      const url = reelLinkUrl.trim();
                      if (!url || !url.includes('instagram.com')) {
                        toast.error('Вставь ссылку на рилс Instagram');
                        return;
                      }
                      setIsAddingReelByLink(true);
                      try {
                        const res = await fetch('/api/reel-info', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url }),
                        });
                        const data = await res.json();
                        if (data.success && !data.is_carousel) {
                          const captionText = typeof data.caption === 'string' ? data.caption : 'Видео из Instagram';
                          const savedVideo = await addVideoToInbox({
                            title: captionText,
                            previewUrl: data.thumbnail_url || '',
                            url: data.url,
                            viewCount: data.view_count,
                            likeCount: data.like_count,
                            commentCount: data.comment_count,
                            ownerUsername: data.owner?.username,
                            shortcode: data.shortcode,
                            projectId: currentProjectId || undefined,
                            folderId: undefined,
                            takenAt: data.taken_at,
                          });
                          if (!savedVideo) {
                            return;
                          }
                          setReelLinkUrl('');
                          toast.success(
                            savedVideo.saveAction === 'updated'
                              ? 'Рилс уже был в разделе'
                              : 'Рилс добавлен в раздел',
                            {
                              description: savedVideo.saveAction === 'updated'
                                ? 'Обновили данные существующего видео'
                                : undefined,
                            }
                          );
                        } else if (data.success && data.is_carousel) {
                          toast.error('Это карусель. Добавляй во вкладке «Карусели».');
                        } else {
                          toast.error(data.error || 'Не удалось загрузить рилс. Проверь ссылку.');
                        }
                      } catch (e) {
                        toast.error('Ошибка при добавлении рилса');
                      } finally {
                        setIsAddingReelByLink(false);
                      }
                    }}
                    disabled={isAddingReelByLink || !reelLinkUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-700 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium transition-colors shrink-0 shadow-glass-sm"
                  >
                    {isAddingReelByLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Добавить
                    <TokenBadge tokens={getTokenCost('link_add')} />
                  </button>
                </div>
              </div>
          </div>

          {/* Videos Grid */}
          {feedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Inbox className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">
                {selectedFolderId ? 'Папка пуста' : 'Нет видео'}
              </h3>
              <p className="text-slate-500 text-sm">
                {selectedFolderId ? 'Перетащи видео сюда' : 'Добавь видео по ссылке выше, через поиск или радар'}
              </p>
            </div>
          ) : (
            <div key={reelsGridKey} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 pb-20 md:pb-6 safe-bottom">
              {feedVideos.map((video, idx) => {
                const thumbnailUrl = video.preview_url;
                const viralCoef = calculateViralCoefficient(video.view_count, video.taken_at || video.created_at);
                
                // Получаем статистику профиля для расчёта множителя
                const profileStats = video.owner_username 
                  ? profileStatsCache.get(video.owner_username.toLowerCase()) 
                  : null;
                const viralMult = calculateViralMultiplier(video.view_count || 0, profileStats);
                const finalViralCoef = applyViralMultiplierToCoefficient(viralCoef, viralMult);
                
                // Бейдж папки - показываем если не выбрана конкретная папка
                const folderBadge = !selectedFolderId ? {
                  name: video.folder_id ? getFolderName(video.folder_id) : 'Без папки',
                  color: video.folder_id ? getFolderColor(video.folder_id) : '#94a3b8'
                } : undefined;
                
                return (
                  <div key={`wrap-${video.id}-${idx}`} className={cn("relative", cardMenuVideoId === video.id && "z-[60]")}>
                  <VideoGradientCard
                    key={`feed-${video.id}-${idx}`}
                    thumbnailUrl={thumbnailUrl}
                    priority={idx < 24}
                    username={video.owner_username || 'instagram'}
                    caption={video.title}
                    viewCount={video.view_count}
                    likeCount={video.like_count}
                    commentCount={video.comment_count}
                    viralCoef={finalViralCoef}
                    viralMultiplier={viralMult}
                    folderBadge={folderBadge}
                    transcriptStatus={video.transcript_status}
                    onClick={() => setSelectedVideo(video)}
                    showFolderMenu={cardMenuVideoId === video.id}
                    videoId={!String(video.id).startsWith('local-') ? video.id : undefined}
                    shortcode={video.shortcode ?? video.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1]}
                    onThumbnailError={refreshThumbnail}
                    onThumbnailLoad={saveThumbnailFromUrl}
                    onFolderMenuToggle={() => {
                      setCardMenuVideoId(cardMenuVideoId === video.id ? null : video.id);
                      setMoveMenuVideoId(null);
                    }}
                    onDescriptionClick={() => {
                      setDescriptionModalText(video.title || 'Нет описания');
                      setCardMenuVideoId(null);
                    }}
                    folderMenu={
                      <div className="bg-glass-white/90 backdrop-blur-glass-xl rounded-card-xl shadow-glass border border-white/[0.35] p-1.5 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedVideo(video); setCardMenuVideoId(null); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100/60 transition-colors text-left"
                        >
                          <FileText className="w-4 h-4 text-slate-600" />
                          <span className="text-sm text-slate-700">Работать</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDescriptionModalText(video.title || 'Нет описания');
                            setCardMenuVideoId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100/60 transition-colors text-left"
                        >
                          <BookOpen className="w-4 h-4 text-slate-600" />
                          <span className="text-sm text-slate-700">Описание</span>
                        </button>
                        
                        {/* Переместить в папку */}
                        <div className="relative">
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setMoveMenuVideoId(moveMenuVideoId === video.id ? null : video.id);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                          >
                            <FolderOpen className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-700">Переместить</span>
                          </button>
                          
                          {/* Подменю с папками — скролл при большом количестве */}
                          {moveMenuVideoId === video.id && (
                            <div className="absolute left-full top-0 ml-1 bg-glass-white/90 backdrop-blur-glass-xl rounded-card shadow-glass border border-white/[0.35] p-1.5 min-w-[140px] max-h-[min(50vh,280px)] overflow-y-auto z-[110] animate-in fade-in slide-in-from-left-2 duration-150 custom-scrollbar-light">
                              {folderConfigs.map(folder => (
                                <button
                                  key={folder.id}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    handleMoveToFolder(video, folder.id || 'inbox');
                                    setCardMenuVideoId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-50 transition-colors text-left"
                                >
                                  <GlassFolderIcon iconType={folder.iconType} color={folder.color} size={18} simple />
                                  <span className="text-xs text-slate-600">{folder.title}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-blue-50 transition-colors text-left"
                        >
                          <ExternalLink className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-slate-700">Открыть</span>
                        </a>
                        
                        <div className="h-px bg-slate-100 my-1" />
                        
                        <button
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleDeleteVideo(video.id); 
                            setCardMenuVideoId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-red-50 transition-colors text-left"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-600">Удалить</span>
                        </button>
                      </div>
                    }
                  />
                  </div>
                );
              })}
            </div>
          )}
          {feedVideos.length > 0 && hasMore && (
            <div className="flex justify-center py-6 pb-20 md:pb-6">
              <button
                type="button"
                onClick={() => loadMore()}
                disabled={loadingMore}
                className="px-5 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 disabled:opacity-60 flex items-center gap-2 transition-colors"
              >
                {loadingMore ? (
                  <>
                    <span className="animate-pulse">Загрузка...</span>
                  </>
                ) : (
                  'Загрузить ещё видео'
                )}
              </button>
            </div>
          )}
          </>
          )}

          {/* Карусели: список + добавление по ссылке */}
          {contentSection === 'carousels' && (
            <>
              <div className="mb-6 md:mb-8 rounded-card-xl bg-white/72 backdrop-blur-glass-xl shadow-glass border border-white/55 px-5 py-4 md:px-6 md:py-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-white/78 border border-white/60 shadow-glass-sm flex items-center justify-center flex-shrink-0">
                        <Images className="w-6 h-6 text-slate-600" strokeWidth={2.5} />
                      </div>
                      <div>
                        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Карусели</h1>
                        <p className="text-slate-500 text-xs md:text-sm">Посты с несколькими фото - транскрипт по слайдам (Gemini)</p>
                      </div>
                    </div>
                    {/* Папки — только мобильные */}
                    <button
                      onClick={() => setIsMobileFolderPanelOpen(true)}
                      className="md:hidden p-2.5 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-glass border border-white/60 text-slate-600 active:bg-white transition-colors touch-manipulation flex-shrink-0 shadow-glass-sm"
                      aria-label="Папки"
                    >
                      <FolderOpen className="w-5 h-5" strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <div className="flex gap-2 flex-1 sm:min-w-[280px]">
                      <input
                        type="url"
                        value={carouselLinkUrl}
                        onChange={e => setCarouselLinkUrl(e.target.value)}
                        placeholder="Ссылка на пост с каруселью (instagram.com/p/...)"
                        className="flex-1 min-w-0 px-4 py-2.5 rounded-2xl border border-white/60 bg-white/82 backdrop-blur-glass text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/70 focus:border-white/70 shadow-glass-sm"
                      />
                      <button
                        onClick={async () => {
                          const url = carouselLinkUrl.trim();
                          if (!url || !url.includes('instagram.com')) {
                            toast.error('Вставь ссылку на пост Instagram');
                            return;
                          }
                          const cost = getTokenCost('add_carousel');
                          if (!canAfford(cost)) {
                            toast.error('Недостаточно коинов');
                            return;
                          }
                          setIsAddingCarouselByLink(true);
                          try {
                            const res = await fetch('/api/reel-info', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url }),
                            });
                            const data = await res.json();
                            if (data.success && data.is_carousel && Array.isArray(data.carousel_slides) && data.carousel_slides.length > 0) {
                              const added = await addCarousel({
                                shortcode: data.shortcode,
                                url: data.url,
                                caption: data.caption,
                                owner_username: data.owner?.username,
                                like_count: data.like_count,
                                comment_count: data.comment_count,
                                taken_at: data.taken_at,
                                slide_count: data.slide_count ?? data.carousel_slides.length,
                                thumbnail_url: data.thumbnail_url ?? data.carousel_slides[0],
                                slide_urls: data.carousel_slides,
                              });
                              if (added) {
                                await deduct(cost);
                                setCarouselLinkUrl('');
                                toast.success('Карусель добавлена');
                              }
                            } else if (data.success && !data.is_carousel) {
                              toast.error('Это не карусель - один пост. Добавляй посты с несколькими фото.');
                            } else {
                              toast.error(data.error || 'Не удалось загрузить пост. Проверьте ссылку.');
                            }
                          } catch (e) {
                            toast.error('Ошибка при добавлении карусели');
                          } finally {
                            setIsAddingCarouselByLink(false);
                          }
                        }}
                        disabled={isAddingCarouselByLink || !carouselLinkUrl.trim() || !canAfford(getTokenCost('add_carousel'))}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-700 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium transition-colors shrink-0 shadow-glass-sm"
                      >
                        {isAddingCarouselByLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        Добавить
                        <TokenBadge tokens={getTokenCost('add_carousel')} />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Сортировка каруселей */}
                {carousels.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">Сортировка:</span>
                    {[
                      { value: 'viral' as const, label: 'Виральность', icon: Sparkles },
                      { value: 'likes' as const, label: 'Лайки', icon: Heart },
                      { value: 'recent' as const, label: 'Недавно', icon: Inbox },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setCarouselSortBy(value)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-medium transition-all',
                          carouselSortBy === value
                            ? 'bg-slate-800 text-white shadow-glass-sm'
                            : 'bg-white/68 backdrop-blur-glass border border-white/55 text-slate-600 hover:bg-white/84'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {carouselsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-slate-300 animate-spin" />
                  </div>
                ) : carousels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <Images className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-1">Пока каруселей нет</h3>
                    <p className="text-slate-500 text-sm max-w-sm mb-4">
                      Вставь ссылку на пост с каруселью (несколько фото) выше и нажми «Добавить». Транскрипт по слайдам - через Gemini.
                    </p>
                  </div>
                ) : carouselsForFeed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <FolderOpen className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-1">В этой папке пока нет каруселей</h3>
                    <p className="text-slate-500 text-sm max-w-sm">Выбери другую папку или «Все карусели».</p>
                  </div>
                ) : (
                  <div key={carouselsGridKey} className="grid grid-cols-3 gap-3 md:gap-4 pb-20 md:pb-6">
                    {carouselsForFeed.map(c => (
                      <div
                        key={c.id}
                        className="group rounded-2xl overflow-hidden bg-white/86 border border-white/65 shadow-[0_10px_26px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.65)] hover:shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition-all relative"
                      >
                        <button
                          onClick={() => setSelectedCarousel(c)}
                          className="w-full text-left"
                        >
                          <div className="aspect-[3/4] min-h-[140px] relative bg-slate-100 overflow-hidden">
                            <img
                              src={proxyImageUrl(c.thumbnail_url || c.slide_urls?.[0] || undefined)}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={() => {
                                if (c.shortcode && refreshCarouselThumbnail) {
                                  refreshCarouselThumbnail(c.id, c.shortcode);
                                }
                              }}
                            />
                            <div
                              className="absolute inset-0 pointer-events-none z-[1]"
                              style={{
                                background: 'linear-gradient(to top, rgba(10,12,18,0.9) 0%, rgba(22,26,36,0.58) 30%, rgba(30,34,42,0.2) 56%, rgba(255,255,255,0.04) 100%)',
                              }}
                            />
                            <div className="absolute inset-x-0 top-0 h-20 pointer-events-none z-[1] bg-gradient-to-b from-black/18 via-black/5 to-transparent" />
                            <div className="absolute bottom-1.5 right-1.5 z-[2] px-1.5 py-0.5 rounded-lg backdrop-blur-[20px] bg-black/34 border border-white/25 text-white text-[10px] font-medium flex items-center gap-0.5 shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                              <Images className="w-2.5 h-2.5" />
                              {c.slide_count || 0}
                            </div>
                            {c.transcript_status === 'completed' && (
                              <div className="absolute top-1.5 left-1.5 z-[2] px-1.5 py-0.5 rounded-lg bg-emerald-500/90 text-white text-[10px] font-medium backdrop-blur-sm border border-white/20">
                                Транскрипт
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setDescriptionModalText(c.caption ?? 'Нет описания');
                              }}
                              className="absolute top-1.5 right-1.5 z-[2] p-2 rounded-full backdrop-blur-[20px] bg-black/34 hover:bg-black/52 border border-white/25 text-white transition-colors touch-manipulation shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
                              title="Описание поста"
                            >
                              <BookOpen className="w-4 h-4" strokeWidth={2} />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 z-[2] p-2.5 pt-8 flex flex-col gap-1.5">
                              {c.caption && (
                                <p className="text-white/95 text-[10px] leading-snug line-clamp-2 break-words overflow-hidden drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                                  {c.caption}
                                </p>
                              )}
                              {formatCarouselDate(c.taken_at) && (
                                <p className="text-white/70 text-[9px] font-medium">
                                  {formatCarouselDate(c.taken_at)}
                                </p>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-1 rounded-pill backdrop-blur-[20px] backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.28)] bg-white/20 text-white">
                                  <Heart className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2} />
                                  <span className="text-[10px] font-semibold tabular-nums">{formatNumber(c.like_count)}</span>
                                </span>
                                <span className="px-2 py-1 rounded-pill backdrop-blur-[20px] backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.28)] bg-white/20 text-white">
                                  <MessageCircle className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2} />
                                  <span className="text-[10px] font-semibold tabular-nums">{formatNumber(c.comment_count)}</span>
                                </span>
                                {(() => {
                                  const viralCoef = calculateCarouselViralCoefficient(c.like_count, c.taken_at);
                                  const profileStats = c.owner_username ? profileStatsCache.get(c.owner_username.toLowerCase()) : null;
                                  const viralMult = calculateCarouselViralMultiplier(c.like_count, profileStats ?? null);
                                  return (
                                    <>
                                      {viralCoef > 0 && (
                                        <span className="px-2 py-1 rounded-pill backdrop-blur-[20px] backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.28)] bg-white/20 text-white" title="Виральность (лайки/день)">
                                          <Sparkles className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2} />
                                          <span className="text-[10px] font-semibold tabular-nums">{viralCoef.toFixed(1)}</span>
                                        </span>
                                      )}
                                      {viralMult !== null && viralMult !== undefined && (
                                        <span
                                          className={cn(
                                            'px-2 py-1 rounded-pill backdrop-blur-[20px] backdrop-saturate-[180%] flex items-center gap-1 border border-white/35 shadow-[0_4px_14px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.28)] text-white',
                                            viralMult >= 5 ? 'bg-amber-500/85' : viralMult >= 3 ? 'bg-emerald-500/82' : viralMult >= 2 ? 'bg-white/30' : 'bg-white/20'
                                          )}
                                          title={`В ${Math.round(viralMult)}x раз ${viralMult >= 1 ? 'больше' : 'меньше'} минимума по лайкам у автора`}
                                        >
                                          <TrendingUp className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2} />
                                          <span className="text-[10px] font-semibold tabular-nums">{Math.round(viralMult)}x</span>
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Folder Settings Modal */}
      <AnimatePresence>
      {showFolderSettings && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-[3px] flex items-end md:items-center justify-center z-50 p-0 md:p-4 safe-top safe-bottom safe-left safe-right"
        >
          <motion.div
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}
            className="bg-white rounded-t-[20px] md:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] md:max-h-[85vh] overflow-hidden safe-bottom"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-slate-800">{contentSection === 'carousels' ? 'Настройка папок каруселей' : 'Настройка папок'}</h2>
              <button
                onClick={() => {
                  setShowFolderSettings(false);
                  setEditingFolder(null);
                }}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {/* Add new folder */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Создать новую папку
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Название папки..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 outline-none transition-all text-slate-700"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 font-medium transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Folder list — прокручиваемая область при большом количестве папок */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-600 mb-3">
                  Папки проекта (перетащите для изменения порядка)
                </label>
                
                <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden pr-1 -mr-1 space-y-2">
                {(contentSection === 'carousels'
                  ? (currentProjectId ? carouselFoldersList(currentProjectId).slice().sort((a, b) => a.order - b.order) : [])
                  : (currentProject?.folders?.slice().sort((a, b) => a.order - b.order) || [])
                ).map((folder, index) => (
                  <div
                    key={folder.id}
                    draggable
                    onDragStart={() => handleFolderDragStart(index)}
                    onDragOver={(e) => handleFolderDragOver(e, index)}
                    onDrop={() => handleFolderDrop(index)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 cursor-move transition-all",
                      draggedFolderIndex === index && "opacity-50 scale-95"
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    
                    <div
                      className="w-4 h-4 rounded flex-shrink-0"
                      style={{ backgroundColor: folder.color }}
                    />
                    
                    {editingFolder?.id === folder.id ? (
                      <input
                        type="text"
                        value={editingFolder.name}
                        onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                        className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-sm outline-none focus:border-orange-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateFolder(folder.id, { name: editingFolder.name });
                          if (e.key === 'Escape') setEditingFolder(null);
                        }}
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium text-slate-700">{folder.name}</span>
                    )}
                    
                    <div className="flex items-center gap-1">
                      {/* Color picker */}
                      <div className="relative group">
                        <button className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                          <Palette className="w-4 h-4 text-slate-400" strokeWidth={2.5} />
                        </button>
                        <div className="absolute right-0 top-full mt-1 p-2 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 grid grid-cols-5 gap-1">
                          {FOLDER_COLORS.map(color => (
                            <button
                              key={color}
                              onClick={() => handleUpdateFolder(folder.id, { color })}
                              className={cn(
                                "w-6 h-6 rounded-lg transition-transform hover:scale-110",
                                folder.color === color && "ring-2 ring-offset-1 ring-slate-400"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      
                      {/* Edit name */}
                      <button
                        onClick={() => setEditingFolder(folder)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-slate-400" />
                      </button>
                      
                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {(!currentProject?.folders || currentProject.folders.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    Нет папок. Создайте первую папку выше.
                  </div>
                )}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setShowFolderSettings(false);
                  setEditingFolder(null);
                }}
                className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-medium transition-colors"
              >
                Готово
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      {/* Description Modal — портал в body, прокручиваемое */}
      {descriptionModalText !== null && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setDescriptionModalText(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-slate-600" />
                Описание
              </h3>
              <button
                onClick={() => setDescriptionModalText(null)}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-5 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-visible overflow-scroll-touch" style={{ maxHeight: 'calc(85vh - 5.5rem)' }}>
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {descriptionModalText || 'Нет описания'}
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      <DuplicateVideoModal
        prompt={duplicateVideoPrompt}
        onResolve={resolveDuplicateVideoPrompt}
      />
      {/* Presence Indicator */}
      <PresenceIndicator presence={presence} getUsername={getUsername} />
    </div>
    </>
  );
}
