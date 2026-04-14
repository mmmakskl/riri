import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Play, Eye, Heart, MessageCircle, Calendar,
  Sparkles, FileText, Copy, ExternalLink, Loader2, Check,
  Languages, ChevronDown, Mic, Save, RefreshCw, Plus, Trash2, Wand2, BookOpen, Pencil, Radar, X, Link2, Film, PenLine, Send, Zap, TrendingUp, ArrowDownUp
} from 'lucide-react';
import { AnimatedCopyIcon } from './ui/animated-state-icons';
import { cn } from '../utils/cn';
import { proxyImageUrl, PLACEHOLDER_400x600 } from '../utils/imagePlaceholder';
import { proxyVideoUrl } from '../utils/videoProxy';
import { checkTranscriptionStatus, getVideoDownloadUrl } from '../services/transcriptionService';
import { getOrCreateGlobalVideo, extractShortcode, startGlobalTranscriptionWithVideoUrl } from '../services/globalVideoService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useInboxVideos } from '../hooks/useInboxVideos';
import { useProjectAnalytics } from '../hooks/useProjectAnalytics';
import { useRefsForLinking, reelsWithoutLinkedRef } from '../hooks/useRefsForLinking';
import { useAuth } from '../hooks/useAuth';
import { useRadar } from '../hooks/useRadar';
import { StyleTrainModal } from './StyleTrainModal';
import { CopyStylesToProjectModal } from './CopyStylesToProjectModal';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import type { ProjectTemplateItem, ProjectStyle, DescriptionTemplate } from '../hooks/useProjects';
import { useVideoComments } from '../hooks/useVideoComments';
import { useParticipantsForResponsibles } from '../hooks/useParticipantsForResponsibles';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { calculateViralMultiplier, getOrUpdateProfileStats, applyViralMultiplierToCoefficient } from '../services/profileStatsService';
import { isRussian } from '../utils/language';
import { TokenBadge } from './ui/TokenBadge';
import { getTokenCost } from '../constants/tokenCosts';
import { ResponsibleTimer } from './ui/ResponsibleTimer';

/** Сырые данные ссылок/ответственных из БД (по templateId или legacy label) */
type VideoLinkRow = { templateId?: string; label?: string; value: string };
type VideoResponsibleRow = { templateId?: string; label?: string; value: string };

interface VideoData {
  id: string;
  title?: string;
  /** Полное описание поста (часто совпадает с title, но может приходить отдельно из API) */
  caption?: string;
  preview_url?: string;
  url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  owner_username?: string;
  taken_at?: string | number;
  transcript_id?: string;
  transcript_status?: string;
  transcript_text?: string;
  translation_text?: string;
  script_text?: string;
  download_url?: string;
  storage_video_url?: string;
  folder_id?: string;
  shortcode?: string | null;
  is_manual?: boolean;
  draft_link?: string;
  final_link?: string;
  script_responsible?: string;
  editing_responsible?: string;
  links?: VideoLinkRow[];
  responsibles?: VideoResponsibleRow[];
  caption_translation?: string;
  post_description?: string;
  // Таймер ответственного
  responsible_assigned_at?: string;
  responsible_timer_done?: boolean;
  responsible_timer_done_at?: string;
  // ИИ-хуки (сохранённые в БД)
  ai_hooks?: Array<{
    original: string; adapted: string; explanation: string;
    views: string; niche: string; url: string | null; owner_username: string | null;
  }>;
}

interface VideoDetailPageProps {
  video: VideoData;
  onBack: () => void;
  onRefreshData?: () => Promise<void>;
  autoTranscribe?: boolean;
}

const DEFAULT_LINKS_TEMPLATE: ProjectTemplateItem[] = [
  { id: 'link-0', label: 'Заготовка' },
  { id: 'link-1', label: 'Готовое' },
];
const DEFAULT_RESPONSIBLES_TEMPLATE: ProjectTemplateItem[] = [
  { id: 'resp-0', label: 'За сценарий' },
  { id: 'resp-1', label: 'За монтаж' },
];

/** Строка для UI: id = templateId, label из шаблона проекта, value из видео */
type MergedLinkRow = { id: string; label: string; value: string };
type MergedResponsibleRow = { id: string; label: string; value: string };

function mergeLinksWithTemplate(
  template: ProjectTemplateItem[],
  videoLinks: VideoLinkRow[] | undefined,
  draftLink?: string,
  finalLink?: string
): MergedLinkRow[] {
  return template.map((t, i) => {
    const byId = videoLinks?.find((r) => r.templateId === t.id);
    const byIndex = videoLinks?.[i];
    const legacy = i === 0 ? draftLink : i === 1 ? finalLink : undefined;
    const value = byId?.value ?? byIndex?.value ?? legacy ?? '';
    return { id: t.id, label: t.label, value };
  });
}

function mergeResponsiblesWithTemplate(
  template: ProjectTemplateItem[],
  videoResponsibles: VideoResponsibleRow[] | undefined,
  scriptResponsible?: string,
  editingResponsible?: string
): MergedResponsibleRow[] {
  return template.map((t, i) => {
    const byId = videoResponsibles?.find((r) => r.templateId === t.id);
    const byIndex = videoResponsibles?.[i];
    const legacy = i === 0 ? scriptResponsible : i === 1 ? editingResponsible : undefined;
    const value = byId?.value ?? byIndex?.value ?? legacy ?? '';
    return { id: t.id, label: t.label, value };
  });
}

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function parseDate(dateValue?: string | number): Date | null {
  if (!dateValue) return null;
  
  // Если строка
  if (typeof dateValue === 'string') {
    // ISO формат или дата
    if (dateValue.includes('T') || dateValue.includes('-')) {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) return date;
    }
    // Числовой timestamp в строке
    const ts = Number(dateValue);
    if (!isNaN(ts)) {
      // Если > 1e12 - миллисекунды, иначе секунды
      return ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
    }
  }
  
  // Если число
  if (typeof dateValue === 'number') {
    return dateValue > 1e12 ? new Date(dateValue) : new Date(dateValue * 1000);
  }
  
  return null;
}

function formatDate(dateValue?: string | number): string {
  const date = parseDate(dateValue);
  if (!date || isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calculateViralCoefficient(views?: number, takenAt?: string | number): number {
  if (!views) return 0;
  
  const videoDate = parseDate(takenAt);
  
  // Если нет даты - используем 30 дней по умолчанию
  if (!videoDate || isNaN(videoDate.getTime())) {
    return Math.round((views / 30 / 1000) * 10) / 10;
  }
  
  const daysOld = Math.max(1, Math.floor((Date.now() - videoDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  // K просмотров в день
  return Math.round((views / daysOld / 1000) * 10) / 10;
}

export function VideoDetailPage({ video, onBack, onRefreshData, autoTranscribe }: VideoDetailPageProps) {
  const [transcriptTab, setTranscriptTab] = useState<'original' | 'translation'>('original');
  const [transcript, setTranscript] = useState(video.transcript_text || '');
  const [translation, setTranslation] = useState(video.translation_text || ''); // Загружаем из БД
  const [transcriptStatus, setTranscriptStatus] = useState(video.transcript_status || 'pending');
  const [script, setScript] = useState(video.script_text || '');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showVideo, setShowVideo] = useState(!!(video.storage_video_url || video.download_url));
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(video.folder_id || null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [localTranscriptId, setLocalTranscriptId] = useState(video.transcript_id);
  const [directVideoUrl, setDirectVideoUrl] = useState<string | null>(
    video.storage_video_url || video.download_url || null
  );
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [viralMultiplier, setViralMultiplier] = useState<number | null>(null);
  const [isCalculatingViral, setIsCalculatingViral] = useState(false);
  const [profileStats, setProfileStats] = useState<import('../services/profileStatsService').InstagramProfileStats | null>(null);
  const { currentProject, currentProjectId, updateProject, updateProjectStyle, addProjectStyle, refetch: refetchProjects } = useProjectContext();
  const { user } = useAuth();
  const radarUserId = user?.id || 'anonymous';
  const { profiles: radarProfiles, addProfile: addRadarProfile } = useRadar(currentProjectId, radarUserId);
  const { members: projectMembersList } = useProjectMembers(currentProjectId);
  const participants = useParticipantsForResponsibles(currentProjectId, currentProject?.owner_id);
  const isAdminOrOwner = !!user?.id && (
    user.id === currentProject?.owner_id ||
    projectMembersList.some(m => m.user_id === user.id && m.role === 'admin' && m.status === 'active')
  );

  // Стиль сценария проекта: обучение по примерам + генерация по стилю + просмотр/редактирование промта
  const [showStyleTrainModal, setShowStyleTrainModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [scriptGeneratedByStyle, setScriptGeneratedByStyle] = useState(false);
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showEditScriptModal, setShowEditScriptModal] = useState(false);
  const [scriptAiForRefine, setScriptAiForRefine] = useState('');
  const [scriptHumanForRefine, setScriptHumanForRefine] = useState('');
  const [editScriptFeedback, setEditScriptFeedback] = useState('');
  const [editScriptLeftTab, setEditScriptLeftTab] = useState<'original' | 'translation' | 'ai'>('ai');
  const [feedbackText, setFeedbackText] = useState('');
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);
  const [clarifyingIndex, setClarifyingIndex] = useState(0);
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [lastRefinedPrompt, setLastRefinedPrompt] = useState('');
  const [showPromptChat, setShowPromptChat] = useState(false);
  const [promptChatMessages, setPromptChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [promptChatInput, setPromptChatInput] = useState('');
  const [isPromptChatLoading, setIsPromptChatLoading] = useState(false);
  const [pendingSuggestedPrompt, setPendingSuggestedPrompt] = useState<string | null>(null);
  const [showStylePickerPopover, setShowStylePickerPopover] = useState(false);
  const stylePickerRef = useRef<HTMLDivElement>(null);
  const [editingStyle, setEditingStyle] = useState<ProjectStyle | null>(null);
  const [creatingNewStyle, setCreatingNewStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [lastGeneratedStyleId, setLastGeneratedStyleId] = useState<string | null>(null);
  const [isRenamingStyle, setIsRenamingStyle] = useState(false);
  const [renamingStyleName, setRenamingStyleName] = useState('');
  const [showCopyStylesModal, setShowCopyStylesModal] = useState(false);
  const [showAiHooksPanel, setShowAiHooksPanel] = useState(false);
  const [isGeneratingAiHook, setIsGeneratingAiHook] = useState(false);
  const [aiHookResults, setAiHookResults] = useState<Array<{
    original: string; adapted: string; explanation: string;
    views: string; niche: string; url: string | null; owner_username: string | null;
  }>>(() => video.ai_hooks || []);
  const [copiedAiHookIdx, setCopiedAiHookIdx] = useState<number | null>(null);
  const [aiHookSortBy, setAiHookSortBy] = useState<'relevance' | 'views'>('relevance');
  const [aiHookLangFilter, setAiHookLangFilter] = useState<'all' | 'ru' | 'en'>('all');
  const aiHooksBtnRef = useRef<HTMLButtonElement>(null);
  const [aiHooksPanelAnchor, setAiHooksPanelAnchor] = useState<{ top: number; left: number } | null>(null);

  const projectStyles = currentProject?.projectStyles || [];
  const currentPromptStyle = editingStyle || (projectStyles.length === 1 ? projectStyles[0] : null);
  const linksTemplate = currentProject?.linksTemplate ?? DEFAULT_LINKS_TEMPLATE;
  const responsiblesTemplate = currentProject?.responsiblesTemplate ?? DEFAULT_RESPONSIBLES_TEMPLATE;
  const descriptionTemplates: DescriptionTemplate[] = currentProject?.descriptionTemplates ?? [];

  const buildMergedLinks = () => mergeLinksWithTemplate(
    linksTemplate,
    video.links,
    video.draft_link,
    video.final_link
  );
  const buildMergedResponsibles = () => mergeResponsiblesWithTemplate(
    responsiblesTemplate,
    video.responsibles,
    video.script_responsible,
    video.editing_responsible
  );

  const [links, setLinks] = useState<MergedLinkRow[]>(() => buildMergedLinks());
  const [responsibles, setResponsibles] = useState<MergedResponsibleRow[]>(() => buildMergedResponsibles());
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [isSavingResponsible, setIsSavingResponsible] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);

  // ── Перевод описания (caption) ─────────────────────────────────────────────
  const [captionTab, setCaptionTab] = useState<'original' | 'translation' | 'ours'>('original');
  const [captionTranslation, setCaptionTranslation] = useState(video.caption_translation || '');
  const [isCaptionTranslating, setIsCaptionTranslating] = useState(false);

  // ── Описание к видео (шаблоны описаний) ────────────────────────────────────
  const [postDescription, setPostDescription] = useState(video.post_description || '');
  const [isSavingPostDescription, setIsSavingPostDescription] = useState(false);
  const [showDescTemplates, setShowDescTemplates] = useState(false);
  const [copiedPostDesc, setCopiedPostDesc] = useState(false);

  // ── Модалки ─────────────────────────────────────────────────────────────────
  const [showCommentsModal, setShowCommentsModal] = useState(false);

  // ── Комментарии ─────────────────────────────────────────────────────────────
  const [commentInput, setCommentInput] = useState('');
  const { comments, isAdding: isAddingComment, addComment, deleteComment } = useVideoComments(video.id);

  useEffect(() => {
    setLinks(buildMergedLinks());
    setResponsibles(buildMergedResponsibles());
  }, [video.id, video.links, video.responsibles, video.draft_link, video.final_link, video.script_responsible, video.editing_responsible, linksTemplate, responsiblesTemplate]);

  useEffect(() => {
    setScriptGeneratedByStyle(false);
  }, [video.id]);

  // Синхронизация видео при обновлении данных (refresh)
  useEffect(() => {
    setVideoLoadError(false);
    const url = video.storage_video_url || video.download_url;
    if (url) {
      setDirectVideoUrl(url);
      setShowVideo(true);
    }
  }, [video.id, video.storage_video_url, video.download_url]);

  const { updateVideoFolder, updateVideoScript, updateVideoTranscript, updateVideoTranslation, updateVideoResponsible, updateVideoLinks, updateVideoShortcode, updateVideoCaptionTranslation, updateVideoPostDescription, markVideoTimerDone } = useInboxVideos();
  const { canAfford, deduct } = useTokenBalance();
  const { reels } = useProjectAnalytics(currentProjectId);
  const refFolderIds = (currentProject?.folders ?? []).map(f => f.id);
  const { linkedShortcodes, refetch: refetchRefs } = useRefsForLinking(currentProjectId, refFolderIds);
  const reelsToOffer = reelsWithoutLinkedRef(reels, linkedShortcodes);
  const [showReelPicker, setShowReelPicker] = useState(false);
  const hasNoShortcode = !video.shortcode || String(video.shortcode).trim() === '';

  const handleLinkReel = async (shortcode: string) => {
    const ok = await updateVideoShortcode(video.id, shortcode);
    setShowReelPicker(false);
    if (ok) {
      toast.success('Привязано к выложенному ролику');
      refetchRefs();
      await onRefreshData?.();
    } else toast.error('Не удалось привязать');
  };

  const addLinkRow = () => setLinks(prev => [...prev, { id: `link-${Date.now()}`, label: '', value: '' }]);
  const removeLinkRow = (id: string) => setLinks(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateLinkRow = (id: string, field: 'label' | 'value', value: string) =>
    setLinks(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addResponsibleRow = () => setResponsibles(prev => [...prev, { id: `resp-${Date.now()}`, label: '', value: '' }]);
  const removeResponsibleRow = (id: string) => setResponsibles(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateResponsibleRow = (id: string, field: 'label' | 'value', value: string) =>
    setResponsibles(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const [openResponsibleDropdown, setOpenResponsibleDropdown] = useState<string | null>(null);

  const handleSaveLinks = async () => {
    if (!currentProject?.id) {
      toast.error('Выберите проект для сохранения шаблона ссылок');
      return;
    }
    setIsSavingLinks(true);
    const newTemplate = links.map(({ id, label }) => ({ id, label }));
    await updateProject(currentProject.id, { linksTemplate: newTemplate });
    const success = await updateVideoLinks(video.id, links.map(({ id, value }) => ({ templateId: id, value })));
    setIsSavingLinks(false);
    if (success) toast.success('Ссылки сохранены');
    else toast.error('Ошибка сохранения ссылок. Примените миграцию add_video_links_responsibles_json.sql.');
  };

  const handleSaveResponsible = async () => {
    if (!currentProject?.id) {
      toast.error('Выберите проект для сохранения шаблона ответственных');
      return;
    }
    setIsSavingResponsible(true);
    const newTemplate = responsibles.map(({ id, label }) => ({ id, label }));
    await updateProject(currentProject.id, { responsiblesTemplate: newTemplate });
    const success = await updateVideoResponsible(video.id, responsibles.map(({ id, value }) => ({ templateId: id, value })));
    setIsSavingResponsible(false);
    if (success) {
      toast.success('Ответственные сохранены');
      // Обновляем данные чтобы таймер появился
      if (onRefreshData) await onRefreshData();
    } else {
      toast.error('Ошибка сохранения ответственных. Примените миграцию add_video_links_responsibles_json.sql.');
    }
  };

  // Обновить данные видео (перезагрузка из БД / API)
  const handleRefreshData = async () => {
    if (!onRefreshData) return;
    setIsRefreshingData(true);
    try {
      await onRefreshData();
      toast.success('Данные обновлены');
    } catch {
      toast.error('Не удалось обновить данные');
    } finally {
      setIsRefreshingData(false);
    }
  };

  // ── Перевод описания (caption) ─────────────────────────────────────────────
  const handleTranslateCaption = async () => {
    const caption = video.caption || video.title || '';
    if (!caption.trim()) {
      toast.error('Нет описания для перевода');
      return;
    }
    if (captionTranslation) {
      setCaptionTab('translation');
      return;
    }
    const cost = getTokenCost('translate');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsCaptionTranslating(true);
    toast.info('Перевожу описание...');
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: caption, to: 'ru' }),
      });
      const data = await response.json();
      if (data.success && data.translated) {
        await deduct(cost, { action: 'translate', section: 'lenta', label: 'Перевести описание' });
        setCaptionTranslation(data.translated);
        setCaptionTab('translation');
        await updateVideoCaptionTranslation(video.id, data.translated);
        toast.success('Перевод сохранён');
      } else {
        toast.error('Ошибка перевода', { description: data.error || 'Попробуйте позже' });
      }
    } catch {
      toast.error('Ошибка перевода');
    } finally {
      setIsCaptionTranslating(false);
    }
  };

  // ── Описание к видео ────────────────────────────────────────────────────────
  const handleSavePostDescription = async () => {
    setIsSavingPostDescription(true);
    const ok = await updateVideoPostDescription(video.id, postDescription);
    setIsSavingPostDescription(false);
    if (ok) toast.success('Описание к видео сохранено');
    else toast.error('Ошибка сохранения');
  };

  const handleApplyDescTemplate = (tpl: DescriptionTemplate) => {
    setPostDescription(tpl.content);
    setShowDescTemplates(false);
  };

  const handleCopyPostDesc = async () => {
    if (!postDescription) return;
    await navigator.clipboard.writeText(postDescription);
    setCopiedPostDesc(true);
    setTimeout(() => setCopiedPostDesc(false), 2000);
  };

  // ── Отправить комментарий ───────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!commentInput.trim()) return;
    const ok = await addComment(commentInput, currentProjectId || undefined);
    if (ok) setCommentInput('');
    else toast.error('Не удалось добавить комментарий');
  };

  const viralCoef = calculateViralCoefficient(video.view_count, video.taken_at);
  
  // Применяем множитель к коэффициенту виральности
  const finalViralCoef = applyViralMultiplierToCoefficient(viralCoef, viralMultiplier);
  
  // Получить папки из проекта
  const folderConfigs = currentProject?.folders
    ?.slice()
    .sort((a, b) => a.order - b.order)
    .map(f => ({ id: f.id, title: f.name, color: f.color })) || [];
  
  // Получить текущую папку
  const currentFolder = currentFolderId 
    ? folderConfigs.find(f => f.id === currentFolderId) 
    : null;
  
  // Перемещение в папку (folderId: 'inbox' = без папки)
  const handleMoveToFolder = async (folderId: string | null) => {
    const value = folderId === null || folderId === 'inbox' ? 'inbox' : folderId;
    const success = await updateVideoFolder(video.id, value);
    if (success) {
      setCurrentFolderId(value === 'inbox' ? null : value);
      const folder = folderConfigs.find(f => (f.id ?? 'inbox') === value);
      toast.success(`Перемещено в "${folder?.title || 'папку'}"`);
    }
    setShowFolderMenu(false);
  };
  
  /**
   * Загрузка видео + транскрибация одним действием.
   * Один запрос к reel-info — получаем video_url, показываем видео и запускаем транскрибацию.
   */
  const handleLoadAndTranscribe = async () => {
    setVideoLoadError(false);
    if (!video.url) {
      toast.error('URL видео не найден');
      return;
    }

    // Уже загружено — просто показать или запустить транскрибацию
    if (directVideoUrl) {
      setShowVideo(true);
      const needsTranscription = !transcript && transcriptStatus !== 'completed' && transcriptStatus !== 'processing';
      if (needsTranscription) {
        const cost = getTokenCost('transcribe_video');
        if (!canAfford(cost)) {
          toast.error('Недостаточно коинов');
          return;
        }
        await runTranscription(directVideoUrl, cost);
      }
      return;
    }

    const loadCost = getTokenCost('load_video');
    const transcribeCost = getTokenCost('transcribe_video');
    if (!canAfford(loadCost + transcribeCost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsLoadingVideo(true);
    setTranscriptStatus('downloading');
    toast.info('Загружаю видео...', { description: 'Одновременно запускаю транскрибацию' });

    try {
      const videoUrl = await getVideoDownloadUrl(video.url);

      if (!videoUrl) {
        setTranscriptStatus('error');
        toast.error('Не удалось получить видео', { description: 'Проверьте ссылку или попробуйте позже' });
        return;
      }

      let finalVideoUrl = videoUrl;
      const shortcode = extractShortcode(video.url || '');
      if (shortcode) {
        try {
          const saveRes = await fetch('/api/save-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'video', shortcode, url: videoUrl }),
          });
          const saveData = await saveRes.json();
          if (saveData.success && saveData.storageUrl) {
            finalVideoUrl = saveData.storageUrl;
            if (onRefreshData) onRefreshData();
          }
        } catch {
          // Supabase upload failed — fall back to CDN URL with proxy
        }
      }

      setDirectVideoUrl(finalVideoUrl);
      setShowVideo(true);

      await supabase
        .from('saved_videos')
        .update({
          download_url: videoUrl,
          ...(finalVideoUrl !== videoUrl && { storage_video_url: finalVideoUrl }),
          transcript_status: 'downloading',
        })
        .eq('id', video.id);

      await deduct(loadCost, { action: 'load_video', section: 'lenta', label: 'Загрузить видео' });
      await runTranscription(finalVideoUrl, transcribeCost);
    } catch (err) {
      console.error('Load/transcribe error:', err);
      setTranscriptStatus('error');
      toast.error('Ошибка загрузки видео');
    } finally {
      setIsLoadingVideo(false);
    }
  };

  /** Запускает транскрибацию в фоне — polling продолжается даже если пользователь ушёл */
  const runTranscription = async (videoUrl: string, transcribeCost?: number) => {
    setIsStartingTranscription(true);
    try {
      const shortcode = extractShortcode(video.url || '');
      const globalVideo = shortcode ? await getOrCreateGlobalVideo({ shortcode, url: video.url }) : null;

      const transcriptId = await startGlobalTranscriptionWithVideoUrl(
        video.id, globalVideo?.id ?? undefined, shortcode, videoUrl
      );
      if (transcriptId) {
        if (transcribeCost != null) await deduct(transcribeCost, { action: 'transcribe_video', section: 'lenta', label: 'Транскрибировать' });
        setLocalTranscriptId(transcriptId);
        setTranscriptStatus('processing');
        toast.success('Транскрибация запущена', { description: 'Можно уйти - результат подгрузится сам' });
      } else {
        setTranscriptStatus('error');
        toast.error('Ошибка запуска транскрибации');
      }
    } catch (err) {
      setTranscriptStatus('error');
      toast.error('Ошибка запуска транскрибации');
      await supabase.from('saved_videos').update({ transcript_status: 'error' }).eq('id', video.id);
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // При autoTranscribe — автоматически стартуем транскрибацию
  const autoTranscribeCalledRef = React.useRef(false);
  useEffect(() => {
    if (autoTranscribe && !autoTranscribeCalledRef.current) {
      autoTranscribeCalledRef.current = true;
      // Небольшая задержка чтобы модал успел открыться
      const t = setTimeout(() => { handleLoadAndTranscribe(); }, 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranscribe]);

  // При открытии - проверяем есть ли транскрибация и перевод в глобальной таблице
  useEffect(() => {
    const checkGlobalData = async () => {
      // Извлекаем shortcode из URL (reel, reels, p, tv)
      const match = video.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
      const shortcode = match ? match[1] : null;
      
      if (!shortcode) return;
      
      // Проверяем глобальную таблицу
      const { data: globalVideo } = await supabase
        .from('videos')
        .select('transcript_status, transcript_text, translation_text')
        .eq('shortcode', shortcode)
        .maybeSingle();
      
      if (!globalVideo) return;
      
      // Загружаем транскрипцию если нет локально
      if (!transcript && !video.transcript_text && globalVideo.transcript_status === 'completed' && globalVideo.transcript_text) {
        setTranscript(globalVideo.transcript_text);
        setTranscriptStatus('completed');
        
        // Сохраняем в saved_videos
        await supabase
          .from('saved_videos')
          .update({ 
            transcript_text: globalVideo.transcript_text, 
            transcript_status: 'completed' 
          })
          .eq('id', video.id);
        
        toast.success('Транскрибация загружена', { description: 'Найдена в общей базе' });
      } else if (globalVideo.transcript_status && globalVideo.transcript_status !== 'completed' && globalVideo.transcript_status !== 'error') {
        setTranscriptStatus(globalVideo.transcript_status);
      }
      
      // Загружаем перевод если нет локально
      if (!translation && !video.translation_text && globalVideo.translation_text) {
        setTranslation(globalVideo.translation_text);
        
        // Сохраняем в saved_videos
        await supabase
          .from('saved_videos')
          .update({ translation_text: globalVideo.translation_text })
          .eq('id', video.id);
      }
    };
    
    checkGlobalData();
  }, [video.id, video.url, video.transcript_text, video.translation_text, transcript, translation]);
  
  // Загружаем статистику профиля при открытии
  useEffect(() => {
    const loadProfileStats = async () => {
      if (!video.owner_username) return;
      
      const stats = await getOrUpdateProfileStats(video.owner_username, false);
      if (stats) {
        const mult = calculateViralMultiplier(video.view_count || 0, stats);
        setViralMultiplier(mult);
        setProfileStats(stats);
      }
    };

    loadProfileStats();
  }, [video.owner_username, video.view_count]);
  
  // Расчет точной виральности (принудительное обновление статистики)
  const handleCalculateViral = async () => {
    if (!video.owner_username) {
      toast.error('Нет информации об авторе видео');
      return;
    }
    const cost = getTokenCost('calculate_viral');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsCalculatingViral(true);
    try {
      const stats = await getOrUpdateProfileStats(video.owner_username, true);
      if (stats) {
        await deduct(cost, { action: 'calculate_viral', section: 'lenta', label: 'Рассчитать виральность' });
        const mult = calculateViralMultiplier(video.view_count || 0, stats);
        setViralMultiplier(mult);
        setProfileStats(stats);
        toast.success('Виральность рассчитана', {
          description: mult ? `В ${mult.toFixed(1)}x раз ${mult >= 1 ? 'больше' : 'меньше'} среднего` : 'Нет данных для сравнения',
        });
      } else {
        toast.error('Не удалось получить статистику профиля');
      }
    } catch (err) {
      console.error('Error calculating viral:', err);
      toast.error('Ошибка расчета виральности');
    } finally {
      setIsCalculatingViral(false);
    }
  };
  
  // Автосохранение сценария при изменении (с debounce)
  useEffect(() => {
    if (!script || script === video.script_text) return;
    
    const timer = setTimeout(async () => {
      await supabase
        .from('saved_videos')
        .update({ script_text: script })
        .eq('id', video.id);
      console.log('[VideoDetail] Script auto-saved');
    }, 2000); // Сохраняем через 2 секунды после последнего изменения
    
    return () => clearTimeout(timer);
  }, [script, video.id, video.script_text]);

  // Polling для статуса транскрибации
  useEffect(() => {
    const transcriptId = localTranscriptId || video.transcript_id;
    if (transcriptId && transcriptStatus !== 'completed' && transcriptStatus !== 'error') {
      const interval = setInterval(async () => {
        const result = await checkTranscriptionStatus(transcriptId);
        setTranscriptStatus(result.status);
        
        if (result.status === 'completed' && result.text) {
          setTranscript(result.text);
          await supabase
            .from('saved_videos')
            .update({ transcript_text: result.text, transcript_status: 'completed' })
            .eq('id', video.id);
          clearInterval(interval);
        } else if (result.status === 'error') {
          clearInterval(interval);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [localTranscriptId, video.transcript_id, video.id, transcriptStatus]);

  const handleCopyTranscript = () => {
    const textToCopy = transcriptTab === 'original' ? transcript : translation;
    navigator.clipboard.writeText(textToCopy);
    setCopiedTranscript(true);
    toast.success('Скопировано');
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    toast.success('Сценарий скопирован');
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleTranslate = async () => {
    if (!transcript) {
      toast.error('Сначала дождитесь транскрибации');
      return;
    }
    
    // Если уже есть перевод - просто переключаем таб
    if (translation) {
      setTranscriptTab('translation');
      return;
    }
    
    const cost = getTokenCost('translate');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsTranslating(true);
    toast.info('Перевожу текст...', { description: 'Это займёт несколько секунд' });
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          to: 'ru',
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.translated) {
        await deduct(cost, { action: 'translate', section: 'lenta', label: 'Перевести' });
        setTranslation(data.translated);
        setTranscriptTab('translation');

        // Сохраняем перевод в saved_videos (с проверкой ошибок и обновлением списка)
        const saved = await updateVideoTranslation(video.id, data.translated);
        if (!saved) {
          toast.error('Не удалось сохранить перевод в БД. Примените миграцию add_saved_videos_translation_text.sql.');
          return;
        }

        // Также сохраняем в глобальную таблицу по shortcode
        const match = video.url?.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
        const shortcode = match ? match[1] : null;
        if (shortcode) {
          await supabase
            .from('videos')
            .update({ translation_text: data.translated })
            .eq('shortcode', shortcode);
        }

        toast.success('Перевод сохранён');
      } else {
        toast.error('Ошибка перевода', { description: data.error || 'Попробуйте позже' });
      }
    } catch (err) {
      console.error('Translation error:', err);
      toast.error('Ошибка при переводе');
    } finally {
      setIsTranslating(false);
    }
  };

  // Сохранение сценария
  const handleSaveScript = async () => {
    setIsSavingScript(true);
    const success = await updateVideoScript(video.id, script);
    setIsSavingScript(false);
    if (success) {
      toast.success('Сценарий сохранён');
    } else {
      toast.error('Ошибка сохранения');
    }
  };

  // Генерация сценария по выбранному стилю (Gemini). При отсутствии перевода — авто-перевод (если транскрипт не на русском).
  const handleGenerateByStyle = async (style: ProjectStyle) => {
    if (!style?.prompt?.trim() || !transcript?.trim()) {
      toast.error('Нужен подчерк с промтом и транскрипция');
      return;
    }
    const cost = getTokenCost('generate_script');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setShowStylePickerPopover(false);
    setIsGeneratingScript(true);
    try {
      let translationToUse: string | undefined;
      if (isRussian(transcript)) {
        translationToUse = undefined;
      } else {
        translationToUse = translation?.trim() || undefined;
        if (!translationToUse) {
          try {
            const trRes = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: transcript, to: 'ru' }),
            });
            const trData = await trRes.json();
            if (trData.success && trData.translated) {
              setTranslation(trData.translated);
              await updateVideoTranslation(video.id, trData.translated);
              translationToUse = trData.translated;
              toast.success('Перевод сохранён');
            }
          } catch (e) {
            console.error('Auto translate on По подчерку:', e);
            toast.error('Не удалось перевести');
          }
        }
      }
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: style.prompt,
          transcript_text: transcript,
          translation_text: translationToUse,
        }),
      });
      const data = await res.json();
      if (data.success && data.script) {
        await deduct(cost, { action: 'generate_script', section: 'lenta', label: 'Генерировать сценарий' });
        setScript(data.script);
        setScriptGeneratedByStyle(true);
        setLastGeneratedStyleId(style.id);
        toast.success(`Сценарий сгенерирован по подчерку «${style.name}»`);
      } else {
        toast.error(data.error || 'Ошибка генерации');
      }
    } catch (err) {
      console.error('Generate by style error:', err);
      toast.error('Ошибка генерации сценария');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateAiHook = async () => {
    const queryText = script?.trim() || translation?.trim() || transcript?.trim();
    if (!queryText) {
      toast.error('Добавьте транскрипцию или сценарий для поиска хуков');
      return;
    }
    const cost = getTokenCost('ai_hook');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setAiHookResults([]);
    setIsGeneratingAiHook(true);

    const funMessages = [
      'Роюсь среди тысяч вирусных видео...',
      'Происходит магия — подбираю хуки, от которых невозможно пролистать',
      'RiRi думает. Очень серьёзно думает.',
      'Ищу лучшие хуки во вселенной (ну, почти)',
    ];
    toast(funMessages[Math.floor(Math.random() * funMessages.length)], {
      description: 'Семантический поиск + адаптация под ваш сценарий',
      duration: 6000,
    });

    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-ai-hook',
          script: script?.trim() || undefined,
          reference_transcript: (translation?.trim() || transcript?.trim()) || undefined,
          min_views: 50000,
        }),
      });
      const data = await res.json();
      if (data.success && data.hooks?.length) {
        await deduct(cost, { action: 'ai_hook', section: 'lenta', label: 'ИИ-хук' });
        setAiHookResults(data.hooks);
        setShowAiHooksPanel(true);
        // Сохраняем в БД
        await supabase.from('saved_videos').update({ ai_hooks: data.hooks }).eq('id', video.id);
        toast.success(`Найдено ${data.hooks.length} хуков — выбирайте лучший`);
      } else {
        toast.error(data.error || 'Хуки не найдены');
      }
    } catch {
      toast.error('Ошибка генерации хуков');
    } finally {
      setIsGeneratingAiHook(false);
    }
  };

  const openPromptModal = (style?: ProjectStyle | null) => {
    const s = style || (projectStyles.length === 1 ? projectStyles[0] : null);
    setEditingStyle(s);
    setEditedPromptText(s?.prompt || currentProject?.stylePrompt || '');
    setIsEditingPrompt(false);
    setShowPromptModal(true);
  };
  const styleForRefine = lastGeneratedStyleId
    ? projectStyles.find((s) => s.id === lastGeneratedStyleId)
    : projectStyles[0];
  const promptForRefine = styleForRefine?.prompt || currentProject?.stylePrompt || '';

  // Дообучение промта по обратной связи (текст)
  const handleRefinePrompt = async () => {
    if (!currentProject?.id || !feedbackText.trim() || !script?.trim() || !promptForRefine) return;
    const cost = getTokenCost('refine_prompt');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsRefiningPrompt(true);
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: feedbackText.trim(),
          prompt: promptForRefine,
          transcript_text: transcript,
          translation_text: translation || undefined,
          script_text: script,
        }),
      });
      const data = await res.json();
      if (data.success && data.prompt) {
        await deduct(cost, { action: 'refine_prompt', section: 'lenta', label: 'Дообучить промт' });
        if (styleForRefine) {
          await updateProjectStyle(currentProject.id, styleForRefine.id, { prompt: data.prompt, meta: data.meta });
        } else {
          await updateProject(currentProject.id, { stylePrompt: data.prompt, styleMeta: data.meta });
        }
        setLastRefinedPrompt(data.prompt);
        setShowFeedbackModal(false);
        setFeedbackText('');
        setScriptGeneratedByStyle(false);
        toast.success('Промт обновлён');
        if (data.clarifying_questions?.length) {
          setClarifyingQuestions(data.clarifying_questions);
          setClarifyingIndex(0);
          setClarifyAnswer('');
          setShowClarifyModal(true);
        }
      } else {
        toast.error(data.error || 'Ошибка дообучения');
      }
    } catch (err) {
      console.error('Refine prompt error:', err);
      toast.error('Ошибка дообучения промта');
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  // Дообучение по diff: сценарий ИИ vs ваш идеальный
  const handleRefineByDiff = async () => {
    if (!currentProject?.id || scriptAiForRefine.trim() === '' || scriptHumanForRefine.trim() === '') return;
    const cost = getTokenCost('refine_prompt');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsRefiningPrompt(true);
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptForRefine,
          transcript_text: transcript,
          translation_text: translation || undefined,
          script_ai: scriptAiForRefine.trim(),
          script_human: scriptHumanForRefine.trim(),
          feedback: editScriptFeedback.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.prompt) {
        await deduct(cost, { action: 'train_style', section: 'lenta', label: 'Дообучить на правках' });
        if (styleForRefine) {
          await updateProjectStyle(currentProject.id, styleForRefine.id, { prompt: data.prompt, meta: data.meta });
        } else {
          await updateProject(currentProject.id, { stylePrompt: data.prompt, styleMeta: data.meta });
        }
        setScript(scriptHumanForRefine.trim());
        setLastRefinedPrompt(data.prompt);
        setShowEditScriptModal(false);
        setScriptAiForRefine('');
        setScriptHumanForRefine('');
        setEditScriptFeedback('');
        setScriptGeneratedByStyle(false);
        toast.success('Промт дообучен на ваших правках');
        if (data.clarifying_questions?.length) {
          setClarifyingQuestions(data.clarifying_questions);
          setClarifyingIndex(0);
          setClarifyAnswer('');
          setShowClarifyModal(true);
        }
      } else {
        toast.error(data.error || 'Ошибка дообучения');
      }
    } catch (err) {
      console.error('Refine by diff error:', err);
      toast.error('Ошибка дообучения промта');
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  // Ответ на уточняющий вопрос нейросети — ещё один раунд refine
  const handleClarifySubmit = async () => {
    const question = clarifyingQuestions[clarifyingIndex];
    if (!currentProject?.id || !question || !clarifyAnswer.trim() || !lastRefinedPrompt) return;
    const cost = getTokenCost('refine_prompt');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsRefiningPrompt(true);
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: `Уточняющий вопрос: ${question}\nОтвет: ${clarifyAnswer.trim()}`,
          prompt: lastRefinedPrompt,
          transcript_text: transcript,
          translation_text: translation || undefined,
          script_text: script,
        }),
      });
      const data = await res.json();
      if (data.success && data.prompt) {
        await deduct(cost, { action: 'refine_prompt', section: 'lenta', label: 'Дообучить промт' });
        if (styleForRefine) {
          await updateProjectStyle(currentProject.id, styleForRefine.id, { prompt: data.prompt, meta: data.meta });
        } else {
          await updateProject(currentProject.id, { stylePrompt: data.prompt, styleMeta: data.meta });
        }
        setLastRefinedPrompt(data.prompt);
        setClarifyAnswer('');
        if (data.clarifying_questions?.length) {
          setClarifyingQuestions(data.clarifying_questions);
          setClarifyingIndex(0);
        } else {
          setShowClarifyModal(false);
          setClarifyingQuestions([]);
          toast.success('Промт уточнён по вашим ответам');
        }
      } else {
        toast.error(data.error || 'Ошибка');
      }
    } catch (err) {
      console.error('Clarify submit error:', err);
      toast.error('Ошибка отправки');
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  const handleSaveEditedPrompt = async () => {
    const currentVal = editingStyle ? editingStyle.prompt : currentProject?.stylePrompt;
    if (!currentProject?.id || editedPromptText.trim() === currentVal) {
      setIsEditingPrompt(false);
      return;
    }
    setIsSavingPrompt(true);
    try {
      if (editingStyle) {
        await updateProjectStyle(currentProject.id, editingStyle.id, { prompt: editedPromptText.trim() });
      } else {
        await updateProject(currentProject.id, { stylePrompt: editedPromptText.trim() });
      }
      toast.success('Промт сохранён');
      setIsEditingPrompt(false);
    } catch (e) {
      toast.error('Не удалось сохранить промт');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handlePromptChatSend = async () => {
    const text = promptChatInput.trim();
    const promptToUse = editingStyle?.prompt || currentProject?.stylePrompt;
    if (!text || !promptToUse || isPromptChatLoading) return;
    const cost = getTokenCost('chat_with_prompt');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    const userMsg = { role: 'user' as const, content: text };
    const newMessages = [...promptChatMessages, userMsg];
    setPromptChatMessages(newMessages);
    setPromptChatInput('');
    setIsPromptChatLoading(true);
    setPendingSuggestedPrompt(null);
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          messages: newMessages,
          prompt: promptToUse,
          transcript_text: transcript || undefined,
          translation_text: translation || undefined,
          script_text: script || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.reply) {
        await deduct(cost, { action: 'chat_with_prompt', section: 'lenta', label: 'Чат с промтом' });
        setPromptChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        if (data.suggested_prompt) setPendingSuggestedPrompt(data.suggested_prompt);
      } else {
        toast.error(data.error || 'Ошибка');
      }
    } catch (err) {
      console.error('Prompt chat error:', err);
      toast.error('Ошибка отправки');
    } finally {
      setIsPromptChatLoading(false);
    }
  };

  const handleApplySuggestedPrompt = async () => {
    if (!currentProject?.id || !pendingSuggestedPrompt) return;
    setIsSavingPrompt(true);
    try {
      if (editingStyle) {
        await updateProjectStyle(currentProject.id, editingStyle.id, { prompt: pendingSuggestedPrompt });
      } else {
        await updateProject(currentProject.id, { stylePrompt: pendingSuggestedPrompt });
      }
      setEditedPromptText(pendingSuggestedPrompt);
      setPendingSuggestedPrompt(null);
      toast.success('Промт применён');
    } catch (e) {
      toast.error('Не удалось применить промт');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const openPromptChat = () => {
    setShowPromptChat(true);
    setPromptChatMessages([]);
    setPromptChatInput('');
    setPendingSuggestedPrompt(null);
  };

  // Сохранение транскрипции (если редактировали вручную)
  const handleSaveTranscript = async () => {
    setIsSavingTranscript(true);
    const success = await updateVideoTranscript(video.id, transcript);
    setIsSavingTranscript(false);
    if (success) {
      toast.success('Транскрипция сохранена');
    } else {
      toast.error('Ошибка сохранения');
    }
  };

  const thumbnailUrl = proxyImageUrl(video.preview_url, PLACEHOLDER_400x600);

  // ИИ-хуки: сортировка + фильтр по языку
  const parseHookViews = (v: string) => {
    if (!v) return 0;
    const n = parseFloat(v.replace(',', '.'));
    if (v.includes('М') || v.includes('M')) return n * 1_000_000;
    if (v.includes('К') || v.includes('K')) return n * 1_000;
    return n || 0;
  };
  const detectHookLang = (text: string) => (/[а-яёА-ЯЁ]/.test(text) ? 'ru' : 'en');
  const sortedFilteredHooks = aiHookResults
    .filter(h => aiHookLangFilter === 'all' || detectHookLang(h.original) === aiHookLangFilter)
    .sort((a, b) => aiHookSortBy === 'views' ? parseHookViews(b.views) - parseHookViews(a.views) : 0);

  return (
    <div className="h-full overflow-hidden flex flex-col bg-[#f5f6f8]">
      {/* Header — вне скролла, всегда видна кнопка Назад */}
      <div className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0 rounded-card-xl bg-white/78 backdrop-blur-glass-xl border border-white/65 shadow-glass p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 min-h-[44px] min-w-[44px] pr-2 -ml-2 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-white/82 transition-colors active:scale-95 touch-manipulation"
            >
              <ChevronLeft className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Назад</span>
            </button>
            
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">
                Работа с видео
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-neutral-500 text-sm">
                  {video.is_manual ? '✏️ Сценарий без ссылки' : `@${video.owner_username || 'instagram'}`}
                </p>
                {!video.is_manual && video.owner_username && video.owner_username.toLowerCase() !== 'instagram' && currentProjectId && (() => {
                  const isInRadar = radarProfiles.some(p => p.username.toLowerCase() === video.owner_username!.toLowerCase());
                  return (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isInRadar) return;
                        const added = await addRadarProfile(video.owner_username!, currentProjectId);
                        if (added) {
                          toast.success(`@${video.owner_username} добавлен в радар`);
                        } else {
                          toast.info(`@${video.owner_username} уже в радаре`);
                        }
                      }}
                      disabled={isInRadar}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                        isInRadar
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-default"
                          : "bg-white/78 border border-white/70 hover:bg-white text-slate-700 shadow-glass-sm"
                      )}
                    >
                      <Radar className="w-3.5 h-3.5" strokeWidth={2} />
                      {isInRadar ? 'В радаре' : 'Добавить в радар'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Actions: Описание, Refresh data + Status badge */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDescriptionModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium transition-colors shadow-glass-sm"
              title="Описание поста"
            >
              <BookOpen className="w-4 h-4" />
              Описание
            </button>
            <button
              type="button"
              onClick={() => setShowCommentsModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium transition-colors shadow-glass-sm"
              title="Комментарии команды"
            >
              <MessageCircle className="w-4 h-4" />
              Чат{comments.length > 0 ? ` · ${comments.length}` : ''}
            </button>
            {onRefreshData && (
              <button
                onClick={handleRefreshData}
                disabled={isRefreshingData}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium transition-colors disabled:opacity-50 shadow-glass-sm"
              >
                {isRefreshingData ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Обновить данные
              </button>
            )}
            {transcriptStatus === 'processing' || transcriptStatus === 'downloading' ? (
              <div className="px-4 py-2 rounded-pill bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Обработка видео...
              </div>
            ) : transcriptStatus === 'completed' ? (
              <div className="px-4 py-2 rounded-pill bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2">
                <Check className="w-4 h-4" />
                Транскрибация готова
              </div>
            ) : transcriptStatus === 'error' ? (
              <div className="px-4 py-2 rounded-pill bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                Ошибка обработки
              </div>
            ) : (
              <div className="px-4 py-2 rounded-pill bg-white/78 border border-white/70 text-slate-600 text-sm font-medium shadow-glass-sm">
                Ожидает обработки
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content — на мобильных скролит всё, на десктопе колонки скролят сами себя */}
      <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden px-4 md:px-6 pt-4 pb-28 md:pb-6">
        {/* Main content — на мобильных колонка, на десктопе 3 колонки */}
        <div className="flex flex-col md:flex-row md:h-full gap-4 md:min-h-0 md:overflow-hidden">
          {/* Left: видео 9:16 + папка + статистика */}
          <div className="flex-shrink-0 flex flex-col gap-3 md:overflow-y-auto custom-scrollbar-light w-full md:w-auto md:min-w-[256px] md:max-w-[min(256px,28vw)]">
            {/* Видео 9:16 — для сценария без ссылки: тот же стиль фона, что в ленте */}
            <div className="flex justify-center flex-shrink-0">
              <div 
                className="relative rounded-2xl overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.18)] border border-white/65 bg-black"
                style={{ aspectRatio: '9/16', width: 'min(100%, 220px)' }}
              >
              {video.is_manual ? (
                <div className="absolute inset-0 overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `
                        radial-gradient(ellipse 120% 80% at 20% 15%, rgba(255,255,255,0.38) 0%, transparent 55%),
                        radial-gradient(ellipse 90% 70% at 85% 75%, rgba(148,163,184,0.45) 0%, transparent 50%),
                        linear-gradient(155deg, #94a3b8 0%, #64748b 38%, #475569 72%, #334155 100%)
                      `,
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-[0.18]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-3 py-6 z-[1]">
                    <span className="mb-2 px-2 py-0.5 rounded-pill text-[9px] font-bold uppercase tracking-widest text-white/85 border border-white/25 bg-black/22 backdrop-blur-md">
                      Сценарий
                    </span>
                    <p className="text-center text-sm font-bold text-white leading-snug line-clamp-5 break-words px-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
                      {video.title?.trim() || video.caption?.trim() || 'Без названия'}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-white/50">
                      <PenLine className="w-3 h-3" strokeWidth={2} />
                      <span className="text-[9px] font-medium">Без ссылки</span>
                    </div>
                  </div>
                </div>
              ) : showVideo && directVideoUrl && !videoLoadError ? (
                <video
                  src={proxyVideoUrl(directVideoUrl) || directVideoUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  playsInline
                  onError={() => {
                    setVideoLoadError(true);
                    setDirectVideoUrl(null);
                    setShowVideo(false);
                    toast.error('Видео не загружается. Нажмите для повторной загрузки.');
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLoadAndTranscribe(); }}
                  disabled={isLoadingVideo || isStartingTranscription || !canAfford(directVideoUrl ? getTokenCost('transcribe_video') : getTokenCost('load_video') + getTokenCost('transcribe_video'))}
                  title={videoLoadError ? 'Повторить загрузку' : `Загрузить и транскрибировать (${getTokenCost('load_video')} коинов)`}
                  className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group cursor-pointer z-10 touch-manipulation"
                >
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover absolute inset-0 pointer-events-none"
                  />
                  <div className="absolute bottom-1 right-1">
                    <TokenBadge tokens={getTokenCost('load_video')} size="sm" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      {(isLoadingVideo || isStartingTranscription) ? (
                        <Loader2 className="w-5 h-5 text-slate-800 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5 text-slate-800 ml-0.5" fill="currentColor" />
                      )}
                    </div>
                  </div>
</button>
            )}
              </div>
            </div>

            {/* Current folder + move — z-[60] чтобы дропдаун был поверх раздела параметров */}
            <div className={cn(
              "rounded-card-xl p-3 shadow-glass bg-white/82 backdrop-blur-glass-xl border border-white/70 relative",
              showFolderMenu && "z-[60]"
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-medium">Папка</span>
              </div>
                <button
                type="button"
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className="w-full flex items-center justify-between px-3 py-2 min-h-[44px] rounded-xl border border-slate-200/80 bg-white/60 hover:bg-slate-50/80 active:bg-slate-100 transition-colors touch-manipulation"
              >
                <div className="flex items-center gap-2">
                  {currentFolder ? (
                    <>
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: currentFolder.color }}
                      />
                      <span className="text-sm font-medium text-slate-700">{currentFolder.title}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 rounded bg-slate-300" />
                      <span className="text-sm font-medium text-slate-400">Ожидает</span>
                    </>
                  )}
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 text-slate-400 transition-transform",
                  showFolderMenu && "rotate-180"
                )} />
              </button>
              
              {/* Folder dropdown — на мобильных bottom sheet (надёжный тап), на десктопе — выпадающий список */}
              {showFolderMenu && folderConfigs.length > 0 && (
                isMobile ? createPortal(
                  <div className="fixed inset-0 z-[25000] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Выбор папки">
                    <div 
                      className="absolute inset-0 bg-black/40" 
                      onClick={() => setShowFolderMenu(false)}
                      aria-hidden="true"
                    />
                    <div className="relative bg-white rounded-t-2xl shadow-2xl p-4 pb-safe max-h-[70vh] overflow-y-auto">
                      <div className="text-xs text-slate-400 font-medium mb-3">Переместить в папку</div>
                      {folderConfigs.map(folder => (
                        <button
                          key={folder.id ?? 'inbox'}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMoveToFolder(folder.id ?? 'inbox'); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors text-left touch-manipulation active:scale-[0.98]",
                            (folder.id ?? null) === currentFolderId ? "bg-slate-100" : "active:bg-slate-50"
                          )}
                        >
                          <div 
                            className="w-4 h-4 rounded flex-shrink-0"
                            style={{ backgroundColor: folder.color || '#94a3b8' }}
                          />
                          <span className="text-sm font-medium text-slate-700 flex-1">{folder.title}</span>
                          {(folder.id ?? null) === currentFolderId && (
                            <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                ) : (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-card-xl shadow-glass-lg bg-glass-white/95 backdrop-blur-glass-xl border border-white/[0.35] p-1.5 z-[70] shadow-xl max-h-[min(50vh,280px)] overflow-y-auto custom-scrollbar-light">
                  {folderConfigs.map(folder => (
                    <button
                      key={folder.id ?? 'inbox'}
                      type="button"
                      onClick={() => handleMoveToFolder(folder.id ?? 'inbox')}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg transition-colors text-left touch-manipulation",
                        (folder.id ?? null) === currentFolderId ? "bg-slate-100" : "hover:bg-slate-50"
                      )}
                    >
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: folder.color || '#94a3b8' }}
                      />
                      <span className="text-sm text-slate-700">{folder.title}</span>
                      {(folder.id ?? null) === currentFolderId && (
                        <Check className="w-4 h-4 text-emerald-500 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )
              )}
            </div>

            {/* Quick stats */}
            <div className="rounded-card-xl p-3 shadow-glass bg-white/82 backdrop-blur-glass-xl border border-white/70">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-slate-600">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium">{formatNumber(video.view_count)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Heart className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium">{formatNumber(video.like_count)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <MessageCircle className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium">{formatNumber(video.comment_count)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium">{formatDate(video.taken_at)}</span>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-sm">Виральность</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold",
                      finalViralCoef > 10 ? "text-emerald-600" : finalViralCoef > 5 ? "text-amber-600" : "text-slate-600"
                    )}>
                      {Math.round(finalViralCoef)}K/день
                    </span>
                    {viralMultiplier !== null && viralMultiplier !== undefined && (
                      <span 
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-semibold",
                          viralMultiplier >= 4 ? "bg-red-100 text-red-700" :
                          viralMultiplier >= 3 ? "bg-amber-100 text-amber-700" :
                          viralMultiplier >= 2 ? "bg-lime-100 text-lime-700" :
                          viralMultiplier >= 1.5 ? "bg-green-100 text-green-700" :
                          "bg-slate-100 text-slate-600"
                        )}
                        title={`В ${Math.round(viralMultiplier)}x раз ${viralMultiplier >= 1 ? 'больше' : 'меньше'} среднего у автора`}
                      >
                        {Math.round(viralMultiplier)}x
                      </span>
                    )}
                  </div>
                </div>
                {video.owner_username && (
                  <button
                    onClick={handleCalculateViral}
                    disabled={isCalculatingViral || !canAfford(getTokenCost('calculate_viral'))}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/60",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {isCalculatingViral ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Расчёт...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Полный расчёт виральности
                        <TokenBadge tokens={getTokenCost('calculate_viral')} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Совет от Рири */}
            {!video.is_manual && (() => {
              const videoDate = parseDate(video.taken_at);
              const isOlderThanMonth = videoDate
                ? (Date.now() - videoDate.getTime()) > 30 * 24 * 60 * 60 * 1000
                : false;
              const isWeakRef = viralMultiplier !== null && viralMultiplier < 10;
              if (!isOlderThanMonth && !isWeakRef) return null;
              return (
                <div className="rounded-card-xl p-3 shadow-glass bg-amber-50/80 backdrop-blur-glass-xl border border-amber-200/60 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">✨</span>
                    <span className="text-xs font-semibold text-amber-800">Совет от Рири</span>
                  </div>
                  {isWeakRef && profileStats && (
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Этот референс — несильный залёт. В среднем у{' '}
                      <span className="font-semibold">@{video.owner_username}</span> набирают{' '}
                      <span className="font-semibold">{formatNumber(profileStats.avg_views)}</span> просм.,
                      а этот ролик набрал{' '}
                      <span className="font-semibold">{formatNumber(video.view_count)}</span> — это всего{' '}
                      <span className="font-semibold">{viralMultiplier !== null ? `${Math.round(viralMultiplier * 10) / 10}x` : '—'}</span> от среднего.
                      Возможно, слабый референс.
                    </p>
                  )}
                  {isWeakRef && !profileStats && (
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Этот ролик набрал в {viralMultiplier !== null ? `${Math.round(viralMultiplier)}x` : 'меньше'} раз меньше 10x от минимального у автора —
                      возможно, не лучший референс. Нажми «Полный расчёт» для деталей.
                    </p>
                  )}
                  {isOlderThanMonth && (
                    <p className="text-xs text-amber-700 leading-relaxed">
                      📅 Это видео вышло больше месяца назад — тренд мог уйти. Если ролик не связан с трендом, всё ок.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Actions — скрываем "Открыть" для ручных видео */}
            {!video.is_manual && video.url && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-card-xl bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] shadow-glass hover:shadow-glass-hover text-slate-700 text-sm font-medium transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Открыть в Instagram
            </a>
            )}
            
            {/* Links section — динамические пункты с переименованием и добавлением */}
            <div className="rounded-card-xl p-3 shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-medium">Ссылки</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={addLinkRow}
                    className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center touch-manipulation"
                    title="Добавить пункт"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSaveLinks}
                    disabled={isSavingLinks}
                    className="px-3 py-2 min-h-[44px] rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-50 touch-manipulation"
                  >
                    {isSavingLinks ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {links.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl p-2 space-y-1.5"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      border: '1px solid rgba(255,255,255,0.75)',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
                    }}
                  >
                    {/* Inputs */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateLinkRow(row.id, 'label', e.target.value)}
                        placeholder="Название"
                        className="flex-shrink-0 w-24 px-2 py-1.5 rounded-xl border border-slate-200/70 bg-white/80 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200/50 focus:border-slate-400/50"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateLinkRow(row.id, 'value', e.target.value)}
                        placeholder="URL"
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-xl border border-slate-200/70 bg-white/80 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200/50 focus:border-slate-400/50"
                      />
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => row.value && window.open(row.value, '_blank')}
                        disabled={!row.value?.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 min-h-[36px] rounded-xl bg-white/78 border border-white/70 hover:bg-white text-slate-600 text-[11px] font-medium shadow-glass-sm transition-all touch-manipulation disabled:opacity-35 disabled:pointer-events-none"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        Открыть
                      </button>
                      {isAdminOrOwner && (
                        <button
                          type="button"
                          onClick={() => removeLinkRow(row.id)}
                          disabled={links.length <= 1}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 min-h-[36px] rounded-xl bg-white/78 border border-white/70 hover:bg-red-50 hover:border-red-200/60 text-slate-500 hover:text-red-500 text-[11px] font-medium shadow-glass-sm transition-all touch-manipulation disabled:opacity-35 disabled:pointer-events-none"
                        >
                          <Trash2 className="w-3 h-3" />
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ответственные — динамические пункты с переименованием и добавлением */}
            <div className="rounded-card-xl p-3 shadow-glass bg-glass-white/80 border border-white/[0.35] space-y-3 relative z-10 overflow-visible">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-medium">Ответственные</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={addResponsibleRow}
                    className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center touch-manipulation"
                    title="Добавить пункт"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSaveResponsible}
                    disabled={isSavingResponsible}
                    className="px-3 py-2 min-h-[44px] rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-50 touch-manipulation"
                  >
                    {isSavingResponsible ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {responsibles.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl p-2 space-y-1.5"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      border: '1px solid rgba(255,255,255,0.75)',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
                    }}
                  >
                    {/* Таймер для конкретного ответственного */}
                    {row.value.trim() !== '' && video.responsible_assigned_at && (
                      <ResponsibleTimer
                        assignedAt={video.responsible_assigned_at ?? null}
                        timerDone={video.responsible_timer_done}
                        hasResponsible={true}
                        canComplete={(() => {
                          const userId = user?.id || '';
                          const v = row.value.trim().toLowerCase().replace(/^@/, '');
                          const u = userId.toLowerCase().replace(/^tg-/, '').replace(/^@/, '');
                          const isThisResp = v && u && v === u;
                          const isPM = currentProject?.project_manager_id
                            ? userId.toLowerCase() === currentProject.project_manager_id.toLowerCase()
                            : false;
                          return isThisResp || isPM || isAdminOrOwner;
                        })()}
                        onComplete={async () => {
                          const userId = user?.id || '';
                          const ok = await markVideoTimerDone(video.id);
                          if (ok) {
                            toast.success('Видео отмечено как готовое');
                            if (currentProjectId) {
                              try {
                                await fetch('/api/project', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'timer-completed',
                                    videoId: video.id,
                                    projectId: currentProjectId,
                                    completedBy: userId,
                                    videoTitle: video.caption || video.title || 'Без названия',
                                  }),
                                });
                              } catch {}
                            }
                          } else {
                            toast.error('Ошибка');
                          }
                        }}
                        compact={false}
                      />
                    )}
                    {/* Label + person picker */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateResponsibleRow(row.id, 'label', e.target.value)}
                        placeholder="Роль"
                        className="flex-shrink-0 w-24 px-2 py-1.5 rounded-xl border border-slate-200/70 bg-white/80 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200/50 focus:border-slate-400/50"
                      />
                      <div className="relative flex-1 min-w-0">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => {
                            updateResponsibleRow(row.id, 'value', e.target.value);
                            setOpenResponsibleDropdown(row.id);
                          }}
                          onFocus={() => participants.length > 0 && setOpenResponsibleDropdown(row.id)}
                          onBlur={() => setTimeout(() => setOpenResponsibleDropdown(null), 150)}
                          placeholder={participants.length > 0 ? 'Выбери из команды' : 'Имя / @логин'}
                          className="w-full px-2 py-1.5 rounded-xl border border-slate-200/70 bg-white/80 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200/50 focus:border-slate-400/50"
                        />
                        {openResponsibleDropdown === row.id && (() => {
                          const filter = row.value.trim().toLowerCase();
                          const filtered = filter
                            ? participants.filter(p => p.toLowerCase().includes(filter))
                            : participants;
                          return filtered.length > 0 ? (
                            <div className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-card-xl bg-glass-white/95 backdrop-blur-glass-xl border border-white/[0.35] shadow-glass-lg overflow-hidden max-h-[180px] overflow-y-auto custom-scrollbar-light">
                              <div className="p-1 space-y-0.5">
                                {filtered.map(p => (
                                  <button
                                    key={p}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      updateResponsibleRow(row.id, 'value', p);
                                      setOpenResponsibleDropdown(null);
                                    }}
                                    className="w-full text-left flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-xl hover:bg-slate-100/70 active:bg-slate-200/70 transition-colors touch-manipulation"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-slate-200/80 flex items-center justify-center text-[9px] font-bold text-slate-500 flex-shrink-0">
                                      {p.replace('@', '').slice(0, 1).toUpperCase()}
                                    </div>
                                    <span className="text-xs text-slate-700 truncate">{p}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    {/* Delete button — only for admin/owner */}
                    {isAdminOrOwner && (
                      <button
                        type="button"
                        onClick={() => removeResponsibleRow(row.id)}
                        disabled={responsibles.length <= 1}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 min-h-[36px] rounded-xl bg-white/78 border border-white/70 hover:bg-red-50 hover:border-red-200/60 text-slate-500 hover:text-red-500 text-[11px] font-medium shadow-glass-sm transition-all touch-manipulation disabled:opacity-35 disabled:pointer-events-none"
                      >
                        <Trash2 className="w-3 h-3" />
                        Удалить
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Привязка к выложенному ролику — под ответственными */}
            {currentProject && hasNoShortcode && (
              <div className="rounded-card-xl p-3 shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] space-y-3">
                <p className="text-xs text-slate-400 font-medium">Привязка к выложенному</p>
                <p className="text-[11px] text-slate-500">Свяжи этот исходник с роликом из аналитики — просмотры попадут в отчёт по ответственным.</p>
                <button
                  type="button"
                  onClick={() => setShowReelPicker(!showReelPicker)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-2xl bg-white/78 backdrop-blur-glass border border-white/70 hover:bg-white text-slate-700 text-sm font-medium shadow-glass-sm transition-all touch-manipulation"
                >
                  <Link2 className="w-4 h-4" />
                  Привязать к выложенному ролику
                </button>
                {showReelPicker && (
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {reelsToOffer.length === 0 ? (
                      <p className="text-[11px] text-slate-400 px-1">Нет роликов без привязки. Обнови аналитику или привяжи исходники в разделе «По ответственным».</p>
                    ) : (
                      reelsToOffer.map((reel) => (
                        <button
                          key={reel.id}
                          type="button"
                          onClick={() => handleLinkReel(reel.shortcode)}
                          className="w-full text-left px-3 py-2 rounded-xl bg-white/80 border border-slate-100 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors touch-manipulation flex items-center gap-2"
                        >
                          {reel.thumbnail_url ? (
                            <img src={reel.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-200 shrink-0 flex items-center justify-center">
                              <Film className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                          <span className="truncate flex-1">{reel.caption?.slice(0, 45) || reel.shortcode}{(reel.caption?.length ?? 0) > 45 ? '…' : ''}</span>
                        </button>
                      ))
                    )}
                    <button type="button" onClick={() => setShowReelPicker(false)} className="w-full text-center py-1.5 text-[11px] text-slate-400 hover:text-slate-600">Закрыть</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Middle: Transcript — на мобильных с мин. высотой для скролла */}
          <div className="flex-1 flex flex-col min-w-0 min-h-[320px] md:min-h-0 rounded-card-xl shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] overflow-hidden">
            {/* Transcript header — 2 ряда как в каруселях */}
            <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
              {/* Ряд 1: заголовок + табы + Перевести */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <h3 className="font-semibold text-slate-800">Транскрибация</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setTranscriptTab('original')}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center",
                        transcriptTab === 'original'
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-600 hover:text-slate-800"
                      )}
                    >
                      Оригинал
                    </button>
                    <button
                      onClick={() => setTranscriptTab('translation')}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center",
                        transcriptTab === 'translation'
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-600 hover:text-slate-800"
                      )}
                    >
                      Перевод
                    </button>
                  </div>
                  <button
                    onClick={handleTranslate}
                    disabled={!transcript || isTranslating || !canAfford(getTokenCost('translate'))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium disabled:opacity-50"
                    title="Перевести"
                  >
                    {isTranslating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Languages className="w-3.5 h-3.5" />
                    )}
                    Перевести
                    <TokenBadge tokens={getTokenCost('translate')} />
                  </button>
                </div>
              </div>
              {/* Ряд 2: Сохранить, Копировать */}
              {transcript && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveTranscript}
                    disabled={isSavingTranscript}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium disabled:opacity-50"
                    title="Сохранить транскрипцию"
                  >
                    {isSavingTranscript ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Сохранить
                  </button>
                  <button
                    onClick={handleCopyTranscript}
                    className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-700"
                    title="Копировать"
                  >
                    <AnimatedCopyIcon size={16} active={copiedTranscript} />
                  </button>
                </div>
              )}
            </div>
            
            {/* Transcript content */}
            <div className="flex-1 overflow-y-auto p-4">
              {transcriptStatus === 'processing' || transcriptStatus === 'downloading' ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
                  <p className="text-slate-600 font-medium">Транскрибация в процессе...</p>
                  <p className="text-slate-400 text-sm">Это займёт несколько минут</p>
                </div>
              ) : transcriptTab === 'original' && transcript ? (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="w-full h-full resize-none text-slate-700 text-sm leading-relaxed focus:outline-none border border-slate-200 rounded-xl p-4 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all"
                  placeholder="Текст транскрипции..."
                />
              ) : transcriptTab === 'translation' && translation ? (
                <textarea
                  value={translation}
                  onChange={(e) => setTranslation(e.target.value)}
                  className="w-full h-full resize-none text-slate-700 text-sm leading-relaxed focus:outline-none border border-slate-200 rounded-xl p-4 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all"
                  placeholder="Перевод..."
                />
              ) : transcriptTab === 'translation' && !translation ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Languages className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium">Перевод не выполнен</p>
                  <button
                    onClick={handleTranslate}
                    disabled={!transcript || isTranslating}
                    className="mt-3 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    Перевести текст
                    <TokenBadge tokens={getTokenCost('translate')} />
                  </button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Mic className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium">
                    {transcriptStatus === 'error' 
                      ? 'Ошибка транскрибации'
                      : 'Транскрибация не запущена'
                    }
                  </p>
                  <p className="text-slate-400 text-sm mb-4">
                    {transcriptStatus === 'error' 
                      ? 'Попробуйте запустить заново'
                      : 'Запустите для получения текста из видео'
                    }
                  </p>
                  <button
                    onClick={handleLoadAndTranscribe}
                    disabled={isStartingTranscription || isLoadingVideo || !canAfford(getTokenCost('load_video') + getTokenCost('transcribe_video'))}
                    className="px-4 py-2.5 rounded-card-xl bg-slate-600 hover:bg-slate-700 text-white font-medium transition-all shadow-glass flex items-center gap-2 disabled:opacity-50"
                  >
                    {isStartingTranscription ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Запускаю...
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Запустить транскрибацию
                        <TokenBadge tokens={getTokenCost('transcribe_video')} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Script — на мобильных с мин. высотой */}
          <div className="flex-1 flex flex-col min-w-0 min-h-[320px] md:min-h-0 rounded-card-xl shadow-glass bg-glass-white/80 backdrop-blur-glass-xl border border-white/[0.35] overflow-hidden">
            {/* Script header — 2 ряда как в каруселях */}
            <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
              {/* Ряд 1: заголовок + подчерк · Промт + сохранён + По подчерку */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  <h3 className="font-semibold text-slate-800">Мой сценарий</h3>
                  {(projectStyles.length > 0 || currentProject?.stylePrompt) && (
                    <button
                      type="button"
                      onClick={() => openPromptModal(projectStyles[0] || null)}
                      className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium hover:bg-slate-200 transition-colors"
                      title="Промт подчерка"
                    >
                      {projectStyles.length || 1} подчерк{projectStyles.length === 1 || !projectStyles.length ? '' : projectStyles.length < 5 ? 'а' : 'ов'} · Промт
                    </button>
                  )}
                  {video.script_text && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-medium">
                      сохранён
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  ref={aiHooksBtnRef}
                  onClick={() => {
                    const btn = aiHooksBtnRef.current;
                    if (btn) {
                      const rect = btn.getBoundingClientRect();
                      const panelWidth = Math.min(400, window.innerWidth - 16);
                      setAiHooksPanelAnchor({
                        top: rect.bottom + 6,
                        left: Math.max(8, rect.right - panelWidth),
                      });
                    }
                    if (!isGeneratingAiHook && aiHookResults.length > 0) {
                      setShowAiHooksPanel(v => !v);
                    } else if (!isGeneratingAiHook) {
                      handleGenerateAiHook();
                    }
                  }}
                  disabled={isGeneratingScript || (!transcript?.trim() && !script?.trim())}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    (transcript?.trim() || script?.trim())
                      ? 'bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50'
                      : 'bg-slate-300 cursor-not-allowed text-slate-500'
                  )}
                  title="Найти топ-10 вирусных хуков из базы и адаптировать под ваш сценарий"
                >
                  {isGeneratingAiHook ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  ИИ-хуки
                  <TokenBadge tokens={getTokenCost('ai_hook')} variant="dark" />
                  <ChevronDown className={cn(
                    'w-3 h-3 transition-transform duration-200',
                    aiHookResults.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
                    showAiHooksPanel && 'rotate-180'
                  )} />
                </button>
                {(projectStyles.length > 0 || currentProject?.stylePrompt) && (
                  <div className="relative" ref={stylePickerRef}>
                    <button
                      onClick={() => !transcript?.trim() ? toast.error('Сначала добавьте транскрипцию') : setShowStylePickerPopover(!showStylePickerPopover)}
                      disabled={isGeneratingScript || !transcript?.trim() || !canAfford(getTokenCost('generate_script'))}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium',
                        transcript?.trim() ? 'bg-slate-600 hover:bg-slate-700 disabled:opacity-50' : 'bg-slate-400/70 cursor-not-allowed'
                      )}
                      title={transcript?.trim() ? 'Выбрать подчерк и сгенерировать' : 'Добавьте транскрипцию для генерации по подчерку'}
                    >
                      {isGeneratingScript ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5" />
                      )}
                      По подчерку
                      <TokenBadge tokens={getTokenCost('generate_script')} variant="dark" />
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showStylePickerPopover && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowStylePickerPopover(false)} aria-hidden />
                        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                          {projectStyles.map((s) => (
                            <div key={s.id} className="flex items-center gap-1 group">
                              <button
                                type="button"
                                onClick={() => handleGenerateByStyle(s)}
                                className="flex-1 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 truncate"
                              >
                                {s.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setShowStylePickerPopover(false); setEditingStyle(s); setCreatingNewStyle(false); setShowStyleTrainModal(true); }}
                                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400"
                                title="Переобучить по примерам"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setShowStylePickerPopover(false); openPromptModal(s); }}
                                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400"
                                title="Редактировать промт"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {currentProject?.stylePrompt && projectStyles.length === 0 && (
                            <button
                              type="button"
                              onClick={() => handleGenerateByStyle({
                                id: 'legacy',
                                name: 'Подчерк по умолчанию',
                                prompt: currentProject.stylePrompt!,
                                meta: currentProject.styleMeta,
                                examplesCount: currentProject.styleExamplesCount,
                              })}
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              Подчерк по умолчанию
                            </button>
                          )}
                          <div className="h-px bg-slate-100 my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setShowStylePickerPopover(false);
                              setCreatingNewStyle(true);
                              setNewStyleName('');
                              setShowStyleTrainModal(true);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Создать новый подчерк
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                </div>{/* /flex группа кнопок */}
              </div>
              {/* Ряд 2: Обучить подчерк, Сохранить, Копировать, Что не так сделал? */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setCreatingNewStyle(true); setEditingStyle(null); setNewStyleName(''); setShowStyleTrainModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                  title="Создать новый подчерк по 1–5 примерам"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Обучить подчерк
                </button>
                {(projectStyles.length > 0 || currentProject?.stylePrompt) && (
                  <button
                    type="button"
                    onClick={() => setShowCopyStylesModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                    title="Скопировать все подчерки в другой проект"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    В другой проект
                  </button>
                )}
                {scriptGeneratedByStyle && script?.trim() && (
                  <button
                    type="button"
                    onClick={() => setShowChoiceModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium"
                    title="Дать обратную связь - промт дообучится"
                  >
                    Что не так сделал?
                  </button>
                )}
                {script && (
                  <>
                    <button
                      onClick={handleSaveScript}
                      disabled={isSavingScript}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                    >
                      {isSavingScript ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Сохранить
                    </button>
                    <button
                      onClick={handleCopyScript}
                      className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-700"
                      title="Копировать"
                    >
                      <AnimatedCopyIcon size={16} active={copiedScript} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Script content - всегда textarea */}
            <div className="flex-1 md:overflow-hidden p-4">
              <textarea
                value={script}
                onChange={(e) => { setScript(e.target.value); setScriptGeneratedByStyle(false); }}
                className="w-full h-full min-h-[240px] resize-none text-slate-700 text-sm leading-relaxed focus:outline-none border border-slate-200 rounded-xl p-4 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
                placeholder="Напишите ваш сценарий здесь...

# Хук (0-3 сек)
Что зацепит внимание?

# Основная часть
Главный контент видео

# Призыв к действию (CTA)
Что должен сделать зритель?"
              />
            </div>
          </div>
        </div>
      </div>

      <CopyStylesToProjectModal
        open={showCopyStylesModal}
        onClose={() => setShowCopyStylesModal(false)}
        sourceProject={currentProject}
      />

      {/* ИИ-хуки — floating dropdown panel */}
      {showAiHooksPanel && aiHooksPanelAnchor && createPortal(
        <>
          {/* Закрыть по клику вне панели */}
          <div
            className="fixed inset-0 z-[34900]"
            onClick={() => !isGeneratingAiHook && setShowAiHooksPanel(false)}
          />
          <div
            className="fixed z-[35000] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            style={{
              top: aiHooksPanelAnchor.top,
              left: aiHooksPanelAnchor.left,
              width: Math.min(400, window.innerWidth - 16),
              maxHeight: Math.min(580, window.innerHeight - aiHooksPanelAnchor.top - 12),
            }}
          >
            {/* Заголовок */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                ИИ-хуки
              </span>
              {!isGeneratingAiHook && (
                <button
                  onClick={() => setShowAiHooksPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isGeneratingAiHook ? (
              <div className="flex items-center gap-3 px-4 py-5 flex-shrink-0">
                <div className="relative flex-shrink-0 w-9 h-9">
                  <div className="w-9 h-9 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
                  <Zap className="w-4 h-4 text-slate-500 absolute inset-0 m-auto" />
                </div>
                <div>
                  <p className="text-slate-700 text-sm font-medium">Анализируем вирусные хуки...</p>
                  <p className="text-slate-400 text-xs mt-0.5">Семантический поиск + адаптация под ваш сценарий</p>
                </div>
              </div>
            ) : sortedFilteredHooks.length > 0 ? (
              <>
                {/* Контролы */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0 flex-wrap gap-2">
                  <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {aiHookResults.length} хуков
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 bg-slate-200/70 rounded-md p-0.5">
                      {(['all', 'ru', 'en'] as const).map(lang => (
                        <button
                          key={lang}
                          onClick={() => setAiHookLangFilter(lang)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                            aiHookLangFilter === lang ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                          )}
                        >
                          {lang === 'all' ? 'Все' : lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setAiHookSortBy(v => v === 'relevance' ? 'views' : 'relevance')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                      <ArrowDownUp className="w-3 h-3" />
                      {aiHookSortBy === 'relevance' ? 'По релевантности' : 'По просмотрам'}
                    </button>
                  </div>
                </div>
                {/* Список хуков */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {sortedFilteredHooks.map((hook, idx) => {
                    const lang = detectHookLang(hook.original);
                    return (
                      <div key={idx} className="p-4 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-400 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                <Eye className="w-2.5 h-2.5" />{hook.views}
                              </span>
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{hook.niche}</span>
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold tracking-wide',
                                lang === 'ru' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-600'
                              )}>
                                {lang.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-slate-800 text-sm leading-relaxed font-medium">{hook.adapted}</p>
                            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed italic">{hook.explanation}</p>
                            <div className="mt-2.5 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-slate-400 mb-1 font-semibold">Оригинал</p>
                              <p className="text-[11px] text-slate-500 leading-relaxed">{hook.original}</p>
                              {hook.url && (
                                <a href={hook.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  {hook.owner_username ? `@${hook.owner_username}` : 'Видео'}
                                </a>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(hook.adapted);
                              setCopiedAiHookIdx(idx);
                              setTimeout(() => setCopiedAiHookIdx(null), 2000);
                            }}
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
                          >
                            {copiedAiHookIdx === idx
                              ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="px-4 py-5 text-center text-sm text-slate-400">
                Нет хуков по выбранному фильтру
              </div>
            )}
          </div>
        </>,
        document.body
      )}

      <StyleTrainModal
        open={showStyleTrainModal}
        onClose={() => {
          setShowStyleTrainModal(false);
          setCreatingNewStyle(false);
          setEditingStyle(null);
          setNewStyleName('');
        }}
        creatingNewStyle={creatingNewStyle}
        newStyleName={newStyleName}
        setNewStyleName={setNewStyleName}
        editingStyle={editingStyle}
        onSuccess={async (prompt) => { setEditedPromptText(prompt); await refetchProjects(); }}
      />

      {/* Модальное окно: просмотр и редактирование промта подчерка */}
      {showPromptModal && (currentPromptStyle || currentProject?.stylePrompt) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => { if (!isSavingPrompt && !isPromptChatLoading) { setShowPromptModal(false); setShowPromptChat(false); } }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {projectStyles.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={editingStyle?.id || projectStyles[0]?.id}
                      onChange={(e) => {
                        const s = projectStyles.find((x) => x.id === e.target.value);
                        if (s) { setEditingStyle(s); setEditedPromptText(s.prompt); setIsRenamingStyle(false); }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 bg-white"
                    >
                      {projectStyles.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {currentPromptStyle && (
                      isRenamingStyle ? (
                        <input
                          value={renamingStyleName}
                          onChange={(e) => setRenamingStyleName(e.target.value)}
                          onBlur={async () => {
                            if (!currentProject?.id || !currentPromptStyle || !renamingStyleName.trim() || renamingStyleName.trim() === currentPromptStyle.name) {
                              setIsRenamingStyle(false);
                              return;
                            }
                            const newName = renamingStyleName.trim();
                            if (currentPromptStyle.id === 'legacy') {
                              const created = await addProjectStyle(currentProject.id, {
                                name: newName,
                                prompt: currentPromptStyle.prompt,
                                meta: currentPromptStyle.meta,
                                examplesCount: currentPromptStyle.examplesCount ?? 0,
                              });
                              await updateProject(currentProject.id, { stylePrompt: undefined, styleMeta: undefined, styleExamplesCount: 0 });
                              await refetchProjects();
                              if (created) setEditingStyle(created);
                            } else {
                              await updateProjectStyle(currentProject.id, currentPromptStyle.id, { name: newName });
                              setEditingStyle({ ...currentPromptStyle, name: newName });
                            }
                            toast.success('Подчерк переименован');
                            setIsRenamingStyle(false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          autoFocus
                          className="px-2 py-1 rounded-lg border border-slate-200 text-sm w-32 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setIsRenamingStyle(true); setRenamingStyleName(currentPromptStyle.name); }}
                          className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-500 text-xs font-medium flex items-center gap-1"
                          title="Переименовать подчерк"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Переименовать
                        </button>
                      )
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">
                      {currentPromptStyle ? `Промт: ${currentPromptStyle.name}` : 'Промт подчерка проекта'}
                    </h3>
                    {currentPromptStyle && (
                      isRenamingStyle ? (
                        <input
                          value={renamingStyleName}
                          onChange={(e) => setRenamingStyleName(e.target.value)}
                          onBlur={async () => {
                            if (!currentProject?.id || !currentPromptStyle || !renamingStyleName.trim() || renamingStyleName.trim() === currentPromptStyle.name) {
                              setIsRenamingStyle(false);
                              return;
                            }
                            const newName = renamingStyleName.trim();
                            if (currentPromptStyle.id === 'legacy') {
                              const created = await addProjectStyle(currentProject.id, {
                                name: newName,
                                prompt: currentPromptStyle.prompt,
                                meta: currentPromptStyle.meta,
                                examplesCount: currentPromptStyle.examplesCount ?? 0,
                              });
                              await updateProject(currentProject.id, { stylePrompt: undefined, styleMeta: undefined, styleExamplesCount: 0 });
                              await refetchProjects();
                              if (created) setEditingStyle(created);
                            } else {
                              await updateProjectStyle(currentProject.id, currentPromptStyle.id, { name: newName });
                              setEditingStyle({ ...currentPromptStyle, name: newName });
                            }
                            toast.success('Подчерк переименован');
                            setIsRenamingStyle(false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          autoFocus
                          className="px-2 py-1 rounded-lg border border-slate-200 text-sm w-40 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setIsRenamingStyle(true); setRenamingStyleName(currentPromptStyle.name); }}
                          className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-500 text-xs font-medium flex items-center gap-1"
                          title="Переименовать подчерк"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Переименовать
                        </button>
                      )
                    )}
                  </div>
                )}
                {showPromptChat && (
                  <button type="button" onClick={() => setShowPromptChat(false)} className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-sm">К промту</span>
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { setShowPromptModal(false); setShowPromptChat(false); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">×</button>
            </div>
            {showPromptChat ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {promptChatMessages.length === 0 && (
                    <p className="text-slate-500 text-sm">Напишите, что хотите изменить в промте. Например: «сделай короче», «добавь больше хуков в начале», «убери воду».</p>
                  )}
                  {promptChatMessages.map((m, i) => (
                    <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                        m.role === 'user' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-800'
                      )}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ))}
                  {isPromptChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                        <span className="text-sm text-slate-600">Думаю...</span>
                      </div>
                    </div>
                  )}
                </div>
                {pendingSuggestedPrompt && (
                  <div className="px-4 pb-2">
                    <button
                      type="button"
                      onClick={handleApplySuggestedPrompt}
                      disabled={isSavingPrompt}
                      className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2"
                    >
                      {isSavingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Применить предложенный промт
                    </button>
                  </div>
                )}
                <div className="p-4 border-t border-slate-100">
                  <div className="flex gap-2">
                    <textarea
                      value={promptChatInput}
                      onChange={(e) => setPromptChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePromptChatSend(); } }}
                      placeholder="Что изменить в промте?"
                      rows={2}
                      disabled={isPromptChatLoading}
                      className="flex-1 p-3 rounded-xl border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handlePromptChatSend}
                      disabled={isPromptChatLoading || !promptChatInput.trim() || !canAfford(getTokenCost('chat_with_prompt'))}
                      className="self-end px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {isPromptChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      Отправить
                      <TokenBadge tokens={getTokenCost('chat_with_prompt')} variant="dark" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Текст промта (используется при генерации «По подчерку»)</label>
                {isEditingPrompt ? (
                  <textarea
                    value={editedPromptText}
                    onChange={(e) => setEditedPromptText(e.target.value)}
                    className="w-full min-h-[200px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 resize-y"
                    placeholder="Промт..."
                  />
                ) : (
                  <pre className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap font-sans max-h-[300px] overflow-y-auto">{currentPromptStyle?.prompt || currentProject?.stylePrompt}</pre>
                )}
              </div>
              {((currentPromptStyle?.meta || currentProject?.styleMeta) && ((currentPromptStyle?.meta || currentProject?.styleMeta)?.rules?.length || (currentPromptStyle?.meta || currentProject?.styleMeta)?.doNot?.length || (currentPromptStyle?.meta || currentProject?.styleMeta)?.summary)) && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                  {(currentPromptStyle?.meta || currentProject?.styleMeta)?.summary && (
                    <p className="text-sm text-slate-600"><span className="font-medium text-slate-700">Кратко:</span> {(currentPromptStyle?.meta || currentProject?.styleMeta)?.summary}</p>
                  )}
                  {((currentPromptStyle?.meta || currentProject?.styleMeta)?.rules?.length) ? (
                    <div>
                      <span className="text-xs font-medium text-slate-500">Правила:</span>
                      <ul className="list-disc list-inside text-sm text-slate-600 mt-1">{(currentPromptStyle?.meta || currentProject?.styleMeta)?.rules?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  ) : null}
                  {((currentPromptStyle?.meta || currentProject?.styleMeta)?.doNot?.length) ? (
                    <div>
                      <span className="text-xs font-medium text-slate-500">Избегать:</span>
                      <ul className="list-disc list-inside text-sm text-slate-600 mt-1">{(currentPromptStyle?.meta || currentProject?.styleMeta)?.doNot?.map((d, i) => <li key={i}>{d}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            )}
            <div className="p-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
              {!showPromptChat ? (
                <>
                  <button
                    type="button"
                    onClick={openPromptChat}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4" /> Пообщаться с нейронкой
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(isEditingPrompt ? editedPromptText : (currentPromptStyle?.prompt || currentProject?.stylePrompt || ''))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Copy className="w-4 h-4" /> Копировать промт
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCopyStylesModal(true)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
                    title="Скопировать все подчерки в другой проект"
                  >
                    <Copy className="w-4 h-4" /> В другой проект
                  </button>
              {isEditingPrompt ? (
                <>
                  <button type="button" onClick={handleSaveEditedPrompt} disabled={isSavingPrompt} className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                    {isSavingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить
                  </button>
                  <button type="button" onClick={() => { setIsEditingPrompt(false); setEditedPromptText(currentPromptStyle?.prompt || currentProject?.stylePrompt || ''); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                    Отмена
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => { setIsEditingPrompt(true); setEditedPromptText(currentPromptStyle?.prompt || currentProject?.stylePrompt || ''); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                  Редактировать промт
                </button>
              )}
                </>
              ) : null}
              <button type="button" onClick={() => { setShowPromptModal(false); setShowPromptChat(false); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 ml-auto">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: выбор способа обратной связи */}
      {showChoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowChoiceModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Как хотите дать обратную связь?</h3>
            <p className="text-slate-500 text-sm mb-4">Нейросеть дообучится на ваших правках или пояснениях.</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setShowChoiceModal(false); setShowFeedbackModal(true); }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="font-medium">Написать текстом</span> - что не так и что отлично
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChoiceModal(false);
                  setScriptAiForRefine(script || '');
                  setScriptHumanForRefine(script || '');
                  setEditScriptFeedback('');
                  setEditScriptLeftTab('ai');
                  setShowEditScriptModal(true);
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="font-medium">Сам допилю сценарий</span> - отредактировать сценарий ИИ, нейросеть дообучится на ваших правках
              </button>
            </div>
            <button type="button" onClick={() => setShowChoiceModal(false)} className="mt-4 w-full py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Модальное окно: обратная связь по сгенерированному сценарию — дообучение промта */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !isRefiningPrompt && setShowFeedbackModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Что не так сделал сценарий?</h3>
              <p className="text-slate-500 text-sm mt-1">
                Опишите, что не так и что хорошо. Промт проекта обновится, и в следующий раз генерация учтёт вашу обратную связь.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Например: слишком длинные предложения, не хватало хука в начале, хорошо что сохранил структуру по пунктам..."
                className="w-full min-h-[120px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 resize-y"
                disabled={isRefiningPrompt}
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button type="button" onClick={() => setShowFeedbackModal(false)} disabled={isRefiningPrompt} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Отмена
              </button>
              <button type="button" onClick={handleRefinePrompt} disabled={isRefiningPrompt || !feedbackText.trim() || !canAfford(getTokenCost('refine_prompt'))} className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                {isRefiningPrompt ? <><Loader2 className="w-4 h-4 animate-spin" /> Дообучение...</> : <>Отправить и дообучить промт <TokenBadge tokens={getTokenCost('refine_prompt')} variant="dark" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: сценарий ИИ → ваш идеальный — дообучение на правках */}
      {showEditScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !isRefiningPrompt && setShowEditScriptModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Сценарий ИИ-помощник → ваш идеальный</h3>
              <p className="text-slate-500 text-sm mt-1">
                Слева - переключайте вкладки (исходник, перевод, сценарий ИИ). Справа - ваш идеальный сценарий. Промт дообучится на ваших правках.
              </p>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-4 p-4 min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex rounded-lg p-0.5 bg-slate-100 mb-2">
                  {(['original', 'translation', 'ai'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setEditScriptLeftTab(tab)}
                      className={cn(
                        'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        editScriptLeftTab === tab
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      )}
                    >
                      {tab === 'original' ? 'Изначальный' : tab === 'translation' ? 'Перевод' : 'Сценарий ИИ'}
                    </button>
                  ))}
                </div>
                <pre className="flex-1 min-h-[200px] p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 overflow-auto whitespace-pre-wrap font-sans">
                  {editScriptLeftTab === 'original'
                    ? (transcript || '-')
                    : editScriptLeftTab === 'translation'
                    ? (translation || '-')
                    : (scriptAiForRefine || '-')}
                </pre>
              </div>
              <div className="flex-1 flex flex-col min-h-0 gap-2">
                <label className="text-xs font-medium text-slate-500">Ваш идеальный сценарий</label>
                <textarea
                  value={scriptHumanForRefine}
                  onChange={(e) => setScriptHumanForRefine(e.target.value)}
                  className="flex-1 min-h-[200px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 resize-none"
                  placeholder="Отредактируйте сценарий..."
                  disabled={isRefiningPrompt}
                />
                <div>
                  <label className="text-xs font-medium text-slate-500">Дополнительный комментарий (опционально)</label>
                  <input
                    type="text"
                    value={editScriptFeedback}
                    onChange={(e) => setEditScriptFeedback(e.target.value)}
                    placeholder="Например: хук слишком длинный, убери воду, добавь CTA"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                    disabled={isRefiningPrompt}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button type="button" onClick={() => setShowEditScriptModal(false)} disabled={isRefiningPrompt} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Отмена
              </button>
              <button
                type="button"
                onClick={handleRefineByDiff}
                disabled={isRefiningPrompt || scriptHumanForRefine.trim() === scriptAiForRefine.trim() || !canAfford(getTokenCost('refine_prompt'))}
                className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {isRefiningPrompt ? <><Loader2 className="w-4 h-4 animate-spin" /> Дообучение...</> : <>Дообучить промт на этом примере <TokenBadge tokens={getTokenCost('refine_prompt')} variant="dark" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: уточняющий вопрос нейросети */}
      {showClarifyModal && clarifyingQuestions[clarifyingIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !isRefiningPrompt && setShowClarifyModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Нейросеть уточняет</h3>
            <p className="text-slate-600 text-sm mb-4">{clarifyingQuestions[clarifyingIndex]}</p>
            <textarea
              value={clarifyAnswer}
              onChange={(e) => setClarifyAnswer(e.target.value)}
              placeholder="Ваш ответ..."
              className="w-full min-h-[80px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 resize-y mb-4"
              disabled={isRefiningPrompt}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">
                {clarifyingIndex + 1} из {clarifyingQuestions.length}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowClarifyModal(false)} disabled={isRefiningPrompt} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                  Пропустить
                </button>
                <button
                  type="button"
                  onClick={handleClarifySubmit}
                  disabled={isRefiningPrompt || !clarifyAnswer.trim()}
                  className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {isRefiningPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Description Modal — портал в body, высокий z-index, непрозрачный фон */}
      {showDescriptionModal && createPortal(
        <div
          className="fixed inset-0 z-[30000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowDescriptionModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="description-modal-title"
        >
          <div
            className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="description-modal-title" className="text-base font-semibold text-slate-800">Описание</h3>
                {/* 3 вкладки */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => setCaptionTab('original')} className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition-all", captionTab === 'original' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                    Референс
                  </button>
                  <button onClick={() => setCaptionTab('translation')} className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition-all", captionTab === 'translation' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                    Перевод
                  </button>
                  <button onClick={() => setCaptionTab('ours')} className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1", captionTab === 'ours' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                    Наше
                    {postDescription && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {captionTab !== 'ours' && (
                  <button onClick={handleTranslateCaption} disabled={isCaptionTranslating || !canAfford(getTokenCost('translate'))} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium disabled:opacity-50 transition-colors">
                    {isCaptionTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                    Перевести
                    <TokenBadge tokens={getTokenCost('translate')} />
                  </button>
                )}
                <button onClick={() => setShowDescriptionModal(false)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="p-5 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(85vh - 5.5rem)' }}>
                {captionTab === 'original' && (
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {(video.caption ?? video.title) || 'Нет описания'}
                  </p>
                )}
                {captionTab === 'translation' && (
                  captionTranslation ? (
                    <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">{captionTranslation}</p>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Languages className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-600 font-medium mb-1">Перевод не выполнен</p>
                      <button onClick={handleTranslateCaption} disabled={isCaptionTranslating} className="mt-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                        {isCaptionTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                        Перевести описание
                        <TokenBadge tokens={getTokenCost('translate')} />
                      </button>
                    </div>
                  )
                )}
                {captionTab === 'ours' && (
                  <div className="space-y-3">
                    {/* Шаблоны */}
                    {descriptionTemplates.length > 0 && (
                      <div className="relative">
                        <button type="button" onClick={() => setShowDescTemplates(!showDescTemplates)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors">
                          <BookOpen className="w-3.5 h-3.5" />
                          Шаблоны проекта
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showDescTemplates && (
                          <>
                            <div className="fixed inset-0 z-[31000]" onClick={() => setShowDescTemplates(false)} aria-hidden />
                            <div className="absolute top-full left-0 mt-1 z-[31001] min-w-[240px] rounded-xl border border-slate-200 bg-white shadow-xl py-1.5">
                              {descriptionTemplates.map((tpl) => (
                                <button key={tpl.id} type="button" onClick={() => handleApplyDescTemplate(tpl)} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex flex-col gap-0.5">
                                  <span className="font-medium text-slate-800">{tpl.name}</span>
                                  <span className="text-[11px] text-slate-400 truncate">{tpl.content.slice(0, 60)}{tpl.content.length > 60 ? '…' : ''}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {/* Кнопка создать шаблон */}
                    {currentProject && (
                      <button type="button" onClick={async () => {
                        const name = window.prompt('Название шаблона:');
                        if (!name?.trim()) return;
                        const content = postDescription.trim() || '';
                        const newTpl: DescriptionTemplate = { id: `desc-${Date.now()}`, name: name.trim(), content };
                        await updateProject(currentProject.id, { descriptionTemplates: [...descriptionTemplates, newTpl] });
                        await refetchProjects();
                        toast.success('Шаблон создан');
                      }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 text-xs font-medium transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Сохранить как шаблон
                      </button>
                    )}
                    {/* Textarea */}
                    <textarea
                      value={postDescription}
                      onChange={(e) => setPostDescription(e.target.value)}
                      rows={8}
                      className="w-full resize-none text-slate-700 text-sm leading-relaxed focus:outline-none border border-slate-200 rounded-xl p-4 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
                      placeholder="Описание, которое пойдёт под видео при выкладке..."
                    />
                    {/* Кнопки */}
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={handleCopyPostDesc} disabled={!postDescription} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors">
                        {copiedPostDesc ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        Копировать
                      </button>
                      <button onClick={handleSavePostDescription} disabled={isSavingPostDescription} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium disabled:opacity-50 transition-all">
                        {isSavingPostDescription ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Сохранить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Модал комментариев команды */}
      {showCommentsModal && createPortal(
        <div className="fixed inset-0 z-[30000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCommentsModal(false)}>
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-slate-500" />
                <h3 className="text-base font-semibold text-slate-800">Чат команды</h3>
                {comments.length > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium">{comments.length}</span>}
              </div>
              <button onClick={() => setShowCommentsModal(false)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MessageCircle className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-slate-500 font-medium">Пока нет комментариев</p>
                  <p className="text-slate-400 text-sm mt-1">Напишите первым — коллеги увидят в реальном времени</p>
                </div>
              ) : comments.map((c) => (
                <div key={c.id} className="flex gap-3 group">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(c.username || 'А').replace('@', '').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-700">{c.username || 'Аноним'}</span>
                      <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed mt-0.5 break-words">{c.content}</p>
                  </div>
                  <button type="button" onClick={() => deleteComment(c.id)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex-shrink-0 self-start">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Input */}
            <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                placeholder="Напишите комментарий..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                disabled={isAddingComment}
              />
              <button type="button" onClick={handleAddComment} disabled={!commentInput.trim() || isAddingComment} className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50 transition-all">
                {isAddingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
