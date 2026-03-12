import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, FileText, Copy, ExternalLink, Loader2, Check,
  Languages, ChevronDown, Save, Plus, Trash2, Wand2, Images, Heart, MessageCircle, RefreshCw, BookOpen, Pencil, Sparkles, Radar, X
} from 'lucide-react';
import { AnimatedCopyIcon } from './ui/animated-state-icons';
import { cn } from '../utils/cn';
import { proxyImageUrl } from '../utils/imagePlaceholder';
import { toast } from 'sonner';
import { useCarousels, type SavedCarousel } from '../hooks/useCarousels';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { useAuth } from '../hooks/useAuth';
import { useRadar } from '../hooks/useRadar';
import type { ProjectTemplateItem, ProjectStyle } from '../hooks/useProjects';
import { transcribeCarouselByUrls } from '../services/carouselTranscriptionService';
import { isRussian } from '../utils/language';
import { StyleTrainModal } from './StyleTrainModal';
import { CopyStylesToProjectModal } from './CopyStylesToProjectModal';
import { TokenBadge } from './ui/TokenBadge';
import { getTokenCost } from '../constants/tokenCosts';

const DEFAULT_LINKS: ProjectTemplateItem[] = [
  { id: 'link-0', label: 'Заготовка' },
  { id: 'link-1', label: 'Готовое' },
];
const DEFAULT_RESPONSIBLES: ProjectTemplateItem[] = [
  { id: 'resp-0', label: 'За сценарий' },
  { id: 'resp-1', label: 'За монтаж' },
];

type MergedRow = { id: string; label: string; value: string };

function mergeLinks(template: ProjectTemplateItem[], carouselLinks: any[] | null, draft?: string, final?: string): MergedRow[] {
  return template.map((t, i) => {
    const byId = carouselLinks?.find((r: any) => r.templateId === t.id);
    const legacy = i === 0 ? draft : i === 1 ? final : undefined;
    return { id: t.id, label: t.label, value: byId?.value ?? legacy ?? '' };
  });
}
function mergeResponsibles(template: ProjectTemplateItem[], carouselResp: any[] | null, script?: string, edit?: string): MergedRow[] {
  return template.map((t, i) => {
    const byId = carouselResp?.find((r: any) => r.templateId === t.id);
    const legacy = i === 0 ? script : i === 1 ? edit : undefined;
    return { id: t.id, label: t.label, value: byId?.value ?? legacy ?? '' };
  });
}

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Виральность карусели: лайки / (дни * 10) — х10 сила лайков
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

interface CarouselDetailPageProps {
  carousel: SavedCarousel;
  onBack: () => void;
  onRefreshData?: () => Promise<void>;
}

export function CarouselDetailPage({ carousel, onBack, onRefreshData }: CarouselDetailPageProps) {
  const [transcriptTab, setTranscriptTab] = useState<'original' | 'translation'>('original');
  const [transcript, setTranscript] = useState(carousel.transcript_text || '');
  const [translation, setTranslation] = useState(carousel.translation_text || '');
  const [transcriptStatus, setTranscriptStatus] = useState(carousel.transcript_status || null);
  const [script, setScript] = useState(carousel.script_text || '');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(carousel.folder_id);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [isSavingResponsible, setIsSavingResponsible] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [showStylePickerPopover, setShowStylePickerPopover] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [mainImageError, setMainImageError] = useState(false);
  const [localSlideUrls, setLocalSlideUrls] = useState<string[]>(() => (carousel.slide_urls && carousel.slide_urls.length > 0 ? carousel.slide_urls : carousel.thumbnail_url ? [carousel.thumbnail_url] : []));
  const [isRefreshingSlides, setIsRefreshingSlides] = useState(false);
  const stylePickerButtonRef = useRef<HTMLButtonElement>(null);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [showStyleTrainModal, setShowStyleTrainModal] = useState(false);
  const [creatingNewStyle, setCreatingNewStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [editingStyle, setEditingStyle] = useState<ProjectStyle | null>(null);
  const [showPromptChat, setShowPromptChat] = useState(false);
  const [promptChatMessages, setPromptChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [promptChatInput, setPromptChatInput] = useState('');
  const [isPromptChatLoading, setIsPromptChatLoading] = useState(false);
  const [pendingSuggestedPrompt, setPendingSuggestedPrompt] = useState<string | null>(null);
  const [lastGeneratedStyleId, setLastGeneratedStyleId] = useState<string | null>(null);
  const [isRenamingStyle, setIsRenamingStyle] = useState(false);
  const [renamingStyleName, setRenamingStyleName] = useState('');
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
  const [showCopyStylesModal, setShowCopyStylesModal] = useState(false);

  const { currentProject, currentProjectId, updateProject, updateProjectStyle, addProjectStyle, refetch: refetchProjects, selectProject, carouselFoldersList } = useProjectContext();
  const { user } = useAuth();
  const { canAfford, deduct } = useTokenBalance();
  const radarUserId = user?.id || 'anonymous';
  const { profiles: radarProfiles, addProfile: addRadarProfile } = useRadar(currentProjectId, radarUserId);
  const {
    updateCarouselTranscript,
    updateCarouselTranslation,
    updateCarouselScript,
    updateCarouselFolder,
    updateCarouselSlideUrls,
    updateCarouselLinks,
    updateCarouselResponsibles,
  } = useCarousels();

  const projectStyles = currentProject?.projectStyles || [];
  const linksTemplate = currentProject?.linksTemplate ?? DEFAULT_LINKS;
  const responsiblesTemplate = currentProject?.responsiblesTemplate ?? DEFAULT_RESPONSIBLES;

  const buildLinks = () => mergeLinks(linksTemplate, carousel.links, carousel.draft_link ?? undefined, carousel.final_link ?? undefined);
  const buildResponsibles = () => mergeResponsibles(responsiblesTemplate, carousel.responsibles, carousel.script_responsible ?? undefined, carousel.editing_responsible ?? undefined);

  const [links, setLinks] = useState<MergedRow[]>(buildLinks);
  const [responsibles, setResponsibles] = useState<MergedRow[]>(buildResponsibles);

  useEffect(() => {
    setLinks(buildLinks());
    setResponsibles(buildResponsibles());
  }, [carousel.id, carousel.links, carousel.responsibles, carousel.draft_link, carousel.final_link, carousel.script_responsible, carousel.editing_responsible]);


  useEffect(() => {
    const urls = carousel.slide_urls?.length ? carousel.slide_urls : carousel.thumbnail_url ? [carousel.thumbnail_url] : [];
    setLocalSlideUrls(urls);
  }, [carousel.id, carousel.slide_urls, carousel.thumbnail_url]);

  useEffect(() => {
    if (showStylePickerPopover && stylePickerButtonRef.current) {
      const rect = stylePickerButtonRef.current.getBoundingClientRect();
      setPopoverRect({ top: rect.bottom + 4, left: rect.left });
    } else {
      setPopoverRect(null);
    }
  }, [showStylePickerPopover]);

  // Папки каруселей — отдельные от папок рилсов; для старых каруселей folder_id мог быть из папок рилсов — показываем по нему имя из folders
  const folderConfigs = (currentProjectId ? carouselFoldersList(currentProjectId) : [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(f => ({ id: f.id, title: f.name, color: f.color }));
  const resolveFolder = (folderId: string) => {
    const fromCarousel = folderConfigs.find(f => f.id === folderId);
    if (fromCarousel) return fromCarousel;
    const fromReels = currentProject?.folders?.find(f => f.id === folderId);
    return fromReels ? { id: folderId, title: fromReels.name, color: fromReels.color } : null;
  };
  const currentFolder = currentFolderId ? resolveFolder(currentFolderId) : null;

  const slideUrls = localSlideUrls.length > 0 ? localSlideUrls : (carousel.thumbnail_url ? [carousel.thumbnail_url] : []);
  const displayUrl = slideUrls[slideIndex] || carousel.thumbnail_url || '';

  const handleRefreshSlides = async () => {
    const url = carousel.url || `https://www.instagram.com/p/${carousel.shortcode}/`;
    setIsRefreshingSlides(true);
    setMainImageError(false);
    try {
      const res = await fetch('/api/reel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, source: 'carousel' }),
      });
      const data = await res.json();
      if (data.success && data.is_carousel && Array.isArray(data.carousel_slides) && data.carousel_slides.length > 0) {
        await updateCarouselSlideUrls(carousel.id, data.carousel_slides, data.thumbnail_url || data.carousel_slides[0]);
        setLocalSlideUrls(data.carousel_slides);
        setSlideIndex(0);
        toast.success(`Загружено ${data.carousel_slides.length} слайдов`);
      } else {
        toast.error('Не удалось загрузить слайды. Проверьте ссылку.');
      }
    } catch (e) {
      toast.error('Ошибка при загрузке слайдов');
    } finally {
      setIsRefreshingSlides(false);
    }
  };

  const handleTranscribe = async () => {
    if (slideUrls.length === 0) {
      toast.error('Нет URL слайдов для транскрибации. Добавьте карусель по ссылке с поста.');
      return;
    }
    const cost = getTokenCost('transcribe_carousel');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsTranscribing(true);
    setTranscriptStatus('processing');
    try {
      const result = await transcribeCarouselByUrls(slideUrls);
      if (result?.success && result.transcript_text) {
        await deduct(cost);
        setTranscript(result.transcript_text);
        setTranscriptTab('original');
        setTranscriptStatus('completed');
        await updateCarouselTranscript(carousel.id, result.transcript_text, result.transcript_slides);
        toast.success('Транскрибация по слайдам готова');
      } else {
        setTranscriptStatus('error');
        toast.error('Ошибка транскрибации');
      }
    } catch (e) {
      setTranscriptStatus('error');
      toast.error('Ошибка транскрибации');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranslate = async () => {
    if (!transcript.trim()) {
      toast.error('Сначала получите транскрипт по слайдам');
      return;
    }
    const cost = getTokenCost('translate');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setIsTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, to: 'ru' }),
      });
      const data = await res.json();
      if (data.success && data.translated) {
        await deduct(cost);
        setTranslation(data.translated);
        setTranscriptTab('translation');
        await updateCarouselTranslation(carousel.id, data.translated);
        toast.success('Перевод сохранён');
      } else {
        toast.error(data.error || 'Ошибка перевода');
      }
    } catch (e) {
      toast.error('Ошибка перевода');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateByStyle = async (style: ProjectStyle) => {
    if (!style?.prompt?.trim() || !transcript?.trim()) {
      toast.error('Нужен подчерк и транскрипция');
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
        translationToUse = translation.trim() || undefined;
        if (!translationToUse) {
          try {
            const trRes = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: transcript, to: 'ru' }) });
            const trData = await trRes.json();
            if (trData.success && trData.translated) {
              setTranslation(trData.translated);
              await updateCarouselTranslation(carousel.id, trData.translated);
              translationToUse = trData.translated;
            }
          } catch (_) {}
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
        await deduct(cost);
        setScript(data.script);
        setLastGeneratedStyleId(style.id);
        toast.success(`Сценарий по подчерку «${style.name}»`);
      } else {
        toast.error(data.error || 'Ошибка генерации');
      }
    } catch (err) {
      toast.error('Ошибка генерации');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const currentPromptStyle = editingStyle || (projectStyles.length === 1 ? projectStyles[0] : null);

  const styleForRefine = lastGeneratedStyleId
    ? projectStyles.find((s) => s.id === lastGeneratedStyleId)
    : projectStyles[0];
  const promptForRefine = styleForRefine?.prompt || currentProject?.stylePrompt || '';

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
        await deduct(cost);
        if (styleForRefine) {
          await updateProjectStyle(currentProject.id, styleForRefine.id, { prompt: data.prompt, meta: data.meta });
        } else {
          await updateProject(currentProject.id, { stylePrompt: data.prompt, styleMeta: data.meta });
        }
        setLastRefinedPrompt(data.prompt);
        setShowFeedbackModal(false);
        setFeedbackText('');
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
        await deduct(cost);
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
        await deduct(cost);
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

  const openPromptModal = (style?: ProjectStyle | null) => {
    const s = style || (projectStyles.length === 1 ? projectStyles[0] : null);
    setEditingStyle(s);
    setEditedPromptText(s?.prompt || currentProject?.stylePrompt || '');
    setIsEditingPrompt(false);
    setShowPromptModal(true);
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

  const handleSaveScript = async () => {
    setIsSavingScript(true);
    const ok = await updateCarouselScript(carousel.id, script);
    setIsSavingScript(false);
    if (ok) toast.success('Сценарий сохранён'); else toast.error('Ошибка сохранения');
  };

  const handleMoveToFolder = async (folderId: string) => {
    const ok = await updateCarouselFolder(carousel.id, folderId);
    if (ok) {
      setCurrentFolderId(folderId);
      toast.success('Папка обновлена');
    }
    setShowFolderMenu(false);
  };

  const handleSaveLinks = async () => {
    if (!currentProject?.id) {
      toast.error('Выберите проект для сохранения ссылок');
      return;
    }
    setIsSavingLinks(true);
    await updateProject(currentProject.id, { linksTemplate: links.map(({ id, label }) => ({ id, label })) });
    const ok = await updateCarouselLinks(carousel.id, links.map(({ id, value }) => ({ templateId: id, value })));
    setIsSavingLinks(false);
    if (ok) toast.success('Ссылки сохранены'); else toast.error('Ошибка сохранения ссылок');
  };

  const handleSaveResponsible = async () => {
    if (!currentProject?.id) {
      toast.error('Выберите проект для сохранения ответственных');
      return;
    }
    setIsSavingResponsible(true);
    await updateProject(currentProject.id, { responsiblesTemplate: responsibles.map(({ id, label }) => ({ id, label })) });
    const ok = await updateCarouselResponsibles(carousel.id, responsibles.map(({ id, value }) => ({ templateId: id, value })));
    setIsSavingResponsible(false);
    if (ok) toast.success('Ответственные сохранены'); else toast.error('Ошибка сохранения ответственных');
  };

  const addLinkRow = () => setLinks(prev => [...prev, { id: `link-${Date.now()}`, label: '', value: '' }]);
  const removeLinkRow = (id: string) => setLinks(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateLinkRow = (id: string, field: 'label' | 'value', value: string) =>
    setLinks(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const addResponsibleRow = () => setResponsibles(prev => [...prev, { id: `resp-${Date.now()}`, label: '', value: '' }]);
  const removeResponsibleRow = (id: string) => setResponsibles(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateResponsibleRow = (id: string, field: 'label' | 'value', value: string) =>
    setResponsibles(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleRefreshData = async () => {
    if (onRefreshData) {
      await onRefreshData();
      toast.success('Данные обновлены');
    }
  };

  const thumbnailUrl = displayUrl ? proxyImageUrl(displayUrl) : '';
  const hasMainImage = Boolean(thumbnailUrl);

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 p-4 border-b border-white/65 bg-white/78 backdrop-blur-glass-xl shadow-glass">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 -m-2 min-w-[44px] min-h-[44px] rounded-2xl hover:bg-white/82 text-slate-600 touch-manipulation flex items-center justify-center active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/84 border border-white/65 shadow-glass-sm flex items-center justify-center flex-shrink-0">
              <Images className="w-5 h-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-slate-800 truncate">
                {carousel.caption?.slice(0, 50) || `Карусель · ${carousel.slide_count || 0} слайдов`}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-slate-500">
                  @{carousel.owner_username || 'instagram'} · {formatNumber(carousel.like_count)} лайков
                </p>
                {carousel.owner_username && carousel.owner_username.toLowerCase() !== 'instagram' && currentProjectId && (() => {
                  const isInRadar = radarProfiles.some(p => p.username.toLowerCase() === carousel.owner_username!.toLowerCase());
                  return (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isInRadar) return;
                        const added = await addRadarProfile(carousel.owner_username!, currentProjectId);
                        if (added) {
                          toast.success(`@${carousel.owner_username} добавлен в радар`);
                        } else {
                          toast.info(`@${carousel.owner_username} уже в радаре`);
                        }
                      }}
                      disabled={isInRadar}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg text-[10px] font-medium transition-colors touch-manipulation",
                        isInRadar
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-default"
                          : "bg-white/78 border border-white/70 hover:bg-white text-slate-700 shadow-glass-sm"
                      )}
                    >
                      <Radar className="w-3 h-3" strokeWidth={2} />
                      {isInRadar ? 'В радаре' : 'Добавить в радар'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowDescriptionModal(true)}
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium touch-manipulation shadow-glass-sm"
            title="Описание поста"
          >
            <BookOpen className="w-4 h-4" />
            Описание
          </button>
          {onRefreshData && (
            <button onClick={handleRefreshData} className="p-2 min-w-[44px] min-h-[44px] rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-600 touch-manipulation flex items-center justify-center shadow-glass-sm">
              Обновить
            </button>
          )}
          <a
            href={carousel.url || `https://www.instagram.com/p/${carousel.shortcode}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium touch-manipulation shadow-glass-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Instagram
          </a>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-y-auto md:overflow-hidden p-4 pb-28 md:pb-4">
        {/* Left: slides + folder + stats + links + responsibles — узкая колонка с собственным скроллом */}
        <div className="flex-shrink-0 flex flex-col gap-3 w-full md:w-[240px] lg:w-[260px] min-h-0 overflow-y-auto rounded-xl">
          <div className="relative flex-shrink-0 rounded-2xl overflow-hidden shadow-[0_18px_40px_rgba(15,23,42,0.18)] bg-slate-200 w-full aspect-[3/4] max-w-full mx-auto md:mx-0 border border-white/65">
            {hasMainImage && !mainImageError ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setMainImageError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-slate-400">
                <Images className="w-12 h-12" />
              </div>
            )}
            {slideUrls.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {slideUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlideIndex(i)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      i === slideIndex ? 'bg-white' : 'bg-white/50'
                    )}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefreshSlides}
            disabled={isRefreshingSlides}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-2xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-sm font-medium disabled:opacity-60 transition-colors shadow-glass-sm"
          >
            {isRefreshingSlides ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Обновить слайды
            <TokenBadge tokens={getTokenCost('add_carousel')} />
          </button>
          {slideUrls.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 min-h-[52px]">
              {slideUrls.slice(0, 10).map((url, i) => {
                const thumbSrc = proxyImageUrl(url);
                return (
                  <button
                    key={i}
                    onClick={() => { setSlideIndex(i); setMainImageError(false); }}
                    className={cn(
                      'flex-shrink-0 w-12 h-12 min-w-12 min-h-12 rounded-lg overflow-hidden border-2 bg-slate-100',
                      i === slideIndex ? 'border-slate-600' : 'border-transparent'
                    )}
                  >
                    {thumbSrc ? (
                      <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Images className="w-5 h-5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-card-xl p-3 bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Heart className="w-4 h-4 text-slate-400" />
                {formatNumber(carousel.like_count)}
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <MessageCircle className="w-4 h-4 text-slate-400" />
                {formatNumber(carousel.comment_count)}
              </div>
              <div className="col-span-2 flex items-center gap-1.5 text-slate-600">
                <Sparkles className="w-4 h-4 text-slate-400" />
                Виральность: <span className="font-medium">{calculateCarouselViralCoefficient(carousel.like_count, carousel.taken_at).toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className={cn('rounded-card-xl p-3 bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass relative', showFolderMenu && 'z-10')}>
            <span className="text-xs text-slate-400 font-medium">Папка</span>
            <button
              type="button"
              onClick={() => setShowFolderMenu(!showFolderMenu)}
              className="w-full flex items-center justify-between px-3 py-2 min-h-[44px] rounded-lg border border-slate-200/80 mt-1 touch-manipulation active:bg-slate-50"
            >
              <span className="text-sm text-slate-700">{currentFolder ? currentFolder.title : 'Ожидает'}</span>
              <ChevronDown className={cn('w-4 h-4', showFolderMenu && 'rotate-180')} />
            </button>
            {showFolderMenu && folderConfigs.length > 0 && (
              isMobile ? createPortal(
                <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Выбор папки">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setShowFolderMenu(false)} aria-hidden="true" />
                  <div className="relative bg-white rounded-t-2xl shadow-2xl p-4 pb-safe max-h-[70vh] overflow-y-auto">
                    <div className="text-xs text-slate-400 font-medium mb-3">Переместить в папку</div>
                    {folderConfigs.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMoveToFolder(f.id); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors text-left touch-manipulation active:scale-[0.98]",
                          f.id === currentFolderId ? "bg-slate-100" : "active:bg-slate-50"
                        )}
                      >
                        <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: f.color }} />
                        <span className="text-sm font-medium text-slate-700 flex-1">{f.title}</span>
                        {f.id === currentFolderId && <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              ) : (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-20">
                {folderConfigs.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleMoveToFolder(f.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 min-h-[44px] text-left text-sm touch-manipulation",
                      f.id === currentFolderId ? "bg-slate-100" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: f.color }} />
                    {f.title}
                  </button>
                ))}
              </div>
            )
            )}
          </div>

          <div className="rounded-card-xl p-3 bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Ссылки</span>
              <div className="flex gap-1">
                <button type="button" onClick={addLinkRow} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center touch-manipulation"><Plus className="w-4 h-4" /></button>
                <button onClick={handleSaveLinks} disabled={isSavingLinks} className="px-3 py-2 min-h-[44px] rounded-lg bg-emerald-500 text-white text-xs disabled:opacity-50 flex items-center justify-center touch-manipulation">
                  {isSavingLinks ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {links.map(row => (
              <div key={row.id} className="flex gap-2 items-center">
                <input value={row.label} onChange={e => updateLinkRow(row.id, 'label', e.target.value)} placeholder="Название" className="w-20 px-2 py-1 rounded border text-xs" />
                <input value={row.value} onChange={e => updateLinkRow(row.id, 'value', e.target.value)} placeholder="URL" className="flex-1 min-w-0 px-2 py-1 rounded border text-xs" />
                <button type="button" onClick={() => removeLinkRow(row.id)} disabled={links.length <= 1} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-red-100 text-slate-400 flex items-center justify-center touch-manipulation"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div className="rounded-card-xl p-3 bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Ответственные</span>
              <div className="flex gap-1">
                <button type="button" onClick={addResponsibleRow} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center touch-manipulation"><Plus className="w-4 h-4" /></button>
                <button onClick={handleSaveResponsible} disabled={isSavingResponsible} className="px-3 py-2 min-h-[44px] rounded-lg bg-emerald-500 text-white text-xs disabled:opacity-50 flex items-center justify-center touch-manipulation">
                  {isSavingResponsible ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {responsibles.map(row => (
              <div key={row.id} className="flex gap-2 items-center">
                <input value={row.label} onChange={e => updateResponsibleRow(row.id, 'label', e.target.value)} placeholder="Роль" className="w-24 px-2 py-1 rounded border text-xs" />
                <input value={row.value} onChange={e => updateResponsibleRow(row.id, 'value', e.target.value)} placeholder="Имя" className="flex-1 min-w-0 px-2 py-1 rounded border text-xs" />
                <button type="button" onClick={() => removeResponsibleRow(row.id)} disabled={responsibles.length <= 1} className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-red-100 text-slate-400 flex items-center justify-center touch-manipulation"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Middle: Transcript — высота шапки как у Сценария для одного уровня текста */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-card-xl bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass overflow-hidden">
          <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/55 min-h-[72px]">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <h3 className="font-semibold text-slate-800">Транскрипт по слайдам</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-white/76 border border-white/65 rounded-xl p-0.5 shadow-glass-sm">
                <button
                  onClick={() => setTranscriptTab('original')}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', transcriptTab === 'original' ? 'bg-white text-slate-800 shadow-glass-sm' : 'text-slate-600')}
                >
                  Оригинал
                </button>
                <button
                  onClick={() => setTranscriptTab('translation')}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', transcriptTab === 'translation' ? 'bg-white text-slate-800 shadow-glass-sm' : 'text-slate-600')}
                >
                  Перевод
                </button>
              </div>
              <button
                onClick={handleTranslate}
                disabled={!transcript.trim() || isTranslating || !canAfford(getTokenCost('translate'))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/78 border border-white/70 hover:bg-white text-slate-700 text-xs font-medium disabled:opacity-50 shadow-glass-sm"
              >
                {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                Перевести
                <TokenBadge tokens={getTokenCost('translate')} />
              </button>
              <button
                onClick={handleTranscribe}
                disabled={slideUrls.length === 0 || isTranscribing || !canAfford(getTokenCost('transcribe_carousel'))}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-medium transition-colors shadow-glass-sm',
                  slideUrls.length === 0 || isTranscribing || !canAfford(getTokenCost('transcribe_carousel'))
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-slate-600 hover:bg-slate-700'
                )}
              >
                {isTranscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
                Транскрибировать
                <TokenBadge tokens={getTokenCost('transcribe_carousel')} variant="dark" />
              </button>
              {(transcriptTab === 'original' ? transcript : translation) && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(transcriptTab === 'original' ? transcript : translation);
                    setCopiedTranscript(true);
                    setTimeout(() => setCopiedTranscript(false), 2000);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <AnimatedCopyIcon size={16} active={copiedTranscript} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col p-4">
            {transcriptStatus === 'processing' && !transcript && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Анализ слайдов...
              </div>
            )}
            {transcriptTab === 'original' && (
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                className="w-full flex-1 min-h-[120px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Нажмите «Транскрибировать» - текст будет извлечён из слайдов через Gemini."
              />
            )}
            {transcriptTab === 'translation' && (
              <textarea
                value={translation}
                onChange={e => setTranslation(e.target.value)}
                className="w-full flex-1 min-h-[120px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Нажмите «Перевести» для перевода на русский."
              />
            )}
          </div>
        </div>

        {/* Right: Script — высота шапки как у Транскрипта */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-card-xl bg-white/82 backdrop-blur-glass border border-white/70 shadow-glass overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <h3 className="font-semibold text-slate-800">Сценарий</h3>
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
              <button
                type="button"
                onClick={() => { setCreatingNewStyle(true); setEditingStyle(null); setNewStyleName(''); setShowStyleTrainModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium whitespace-nowrap"
                title="Обучить подчерк по 1–5 примерам (рилсы или карусели)"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Обучить подчерк
              </button>
              {(projectStyles.length > 0 || currentProject?.stylePrompt) && (
                <button
                  type="button"
                  onClick={() => setShowCopyStylesModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium whitespace-nowrap"
                  title="Скопировать все подчерки в другой проект"
                >
                  <Copy className="w-3.5 h-3.5" />
                  В другой проект
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {script?.trim() && (projectStyles.length > 0 || currentProject?.stylePrompt) && (
                <button
                  type="button"
                  onClick={() => setShowChoiceModal(true)}
                  className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap"
                  title="Дать обратную связь - промт дообучится"
                >
                  Что не так сделал?
                </button>
              )}
              <div className="relative">
                <button
                  ref={stylePickerButtonRef}
                  onClick={() => {
                    if (!(projectStyles.length > 0 || currentProject?.stylePrompt)) {
                      toast.error('Нажмите «Обучить подчерк» слева или задайте промт в настройках проекта');
                      return;
                    }
                    setShowStylePickerPopover(!showStylePickerPopover);
                  }}
                  disabled={Boolean(isGeneratingScript || ((projectStyles.length > 0 || currentProject?.stylePrompt) && !transcript.trim()) || !canAfford(getTokenCost('generate_script')))}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors whitespace-nowrap',
                    projectStyles.length > 0 || currentProject?.stylePrompt
                      ? 'bg-slate-600 hover:bg-slate-700 disabled:opacity-50'
                      : 'bg-slate-400/70 cursor-not-allowed'
                  )}
                  title={!(projectStyles.length > 0 || currentProject?.stylePrompt) ? 'Нажмите «Обучить подчерк» рядом или задайте промт в настройках проекта' : undefined}
                >
                  {isGeneratingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  По подчерку
                  <TokenBadge tokens={getTokenCost('generate_script')} variant="dark" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showStylePickerPopover && popoverRect && (projectStyles.length > 0 || currentProject?.stylePrompt) && createPortal(
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setShowStylePickerPopover(false)} aria-hidden />
                    <div
                      className="fixed z-[9999] min-w-[200px] rounded-xl border border-slate-200 bg-white shadow-xl py-1.5"
                      style={{ top: popoverRect.top, left: popoverRect.left }}
                    >
                      {projectStyles.map(s => (
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
                        onClick={() => { setShowStylePickerPopover(false); setCreatingNewStyle(true); setEditingStyle(null); setNewStyleName(''); setShowStyleTrainModal(true); }}
                        className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Создать новый подчерк
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </div>
              {script && (
                <>
                  <button onClick={handleSaveScript} disabled={isSavingScript} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-medium disabled:opacity-50">
                    {isSavingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Сохранить
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(script); setCopiedScript(true); setTimeout(() => setCopiedScript(false), 2000); }}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <AnimatedCopyIcon size={16} active={copiedScript} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col p-4">
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              className="w-full flex-1 min-h-[120px] p-3 rounded-xl border border-slate-200 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Сгенерируйте сценарий по подчерку или напишите вручную."
            />
          </div>
        </div>
      </div>

      <CopyStylesToProjectModal
        open={showCopyStylesModal}
        onClose={() => setShowCopyStylesModal(false)}
        sourceProject={currentProject}
      />
      <StyleTrainModal
        open={showStyleTrainModal}
        onClose={() => { setShowStyleTrainModal(false); setCreatingNewStyle(false); setEditingStyle(null); setNewStyleName(''); }}
        creatingNewStyle={creatingNewStyle}
        newStyleName={newStyleName}
        setNewStyleName={setNewStyleName}
        editingStyle={editingStyle}
        onSuccess={async (prompt) => {
          setEditedPromptText(prompt);
          const targetId = carousel.project_id ?? currentProjectId;
          if (targetId && targetId !== currentProjectId) selectProject(targetId);
          await refetchProjects();
        }}
        fromCarousel
        targetProjectId={carousel.project_id ?? currentProjectId}
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
                      disabled={isPromptChatLoading || !promptChatInput.trim()}
                      className="self-end px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {isPromptChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      Отправить
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

      {/* Модальное окно: сценарий ИИ → ваш идеальный - дообучение на правках */}
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
      {/* Description Modal — портал в body, чтобы скролл не обрезался */}
      {showDescriptionModal && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/32 backdrop-blur-sm"
          onClick={() => setShowDescriptionModal(false)}
        >
          <div
            className="bg-white/82 backdrop-blur-glass-xl rounded-3xl shadow-glass-lg max-w-lg w-full max-h-[85vh] flex flex-col border border-white/65 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/55 shrink-0">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-slate-600" />
                Описание
              </h3>
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="p-2 rounded-2xl hover:bg-white transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-5 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-visible overflow-scroll-touch" style={{ maxHeight: 'calc(85vh - 5.5rem)' }}>
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {carousel.caption || 'Нет описания'}
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
