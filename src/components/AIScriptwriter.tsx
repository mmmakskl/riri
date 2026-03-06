import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useScriptDrafts, type ScriptDraft, type ChatMessage } from '../hooks/useScriptDrafts';
import type { ScriptStructureAnalysis } from '../hooks/useProjects';
import {
  getOrUpdateProfileStats,
  calculateViralMultiplier,
  getViralMultiplierColor,
} from '../services/profileStatsService';
import { uploadScriptCover } from '../utils/generateScriptCover';
import { cn } from '../utils/cn';
import { toast } from 'sonner';
import {
  Sparkles, Plus, ArrowLeft, Send, Loader2, Trash2,
  FileText, MessageSquare, Pencil, LayoutGrid,
  AlertTriangle, Link as LinkIcon, Type,
  RotateCcw, Check, FolderOpen,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen =
  | 'styles-list'
  | 'train-mode-select'
  | 'train-reels'
  | 'train-scripts'
  | 'train-format-select'
  | 'train-analyzing'
  | 'train-verify'
  | 'chat'
  | 'drafts';

interface ReelInput {
  url: string;
  loading: boolean;
  views: number | null;
  ownerUsername: string | null;
  viralMultiplier: number | null;
  error: string | null;
  transcriptText: string | null;
  transcriptLoading: boolean;
}

interface ScriptInput {
  text: string;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AIScriptwriter() {
  const { currentProject, currentProjectId, addProjectStyle, updateProjectStyle } = useProjectContext();
  const { drafts, loading: draftsLoading, createDraft, updateDraft, deleteDraft, addDraftToFeed } = useScriptDrafts();

  const [screen, setScreen] = useState<Screen>('styles-list');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);

  // Training state
  const [trainStyleName, setTrainStyleName] = useState('');
  const [trainMode, setTrainMode] = useState<'reels' | 'scripts'>('reels');
  const [reelInputs, setReelInputs] = useState<ReelInput[]>(
    Array.from({ length: 5 }, () => ({
      url: '', loading: false, views: null, ownerUsername: null,
      viralMultiplier: null, error: null, transcriptText: null, transcriptLoading: false,
    }))
  );
  const [scriptInputs, setScriptInputs] = useState<ScriptInput[]>(
    Array.from({ length: 5 }, () => ({ text: '' }))
  );
  const [preferredFormat, setPreferredFormat] = useState<'short' | 'long' | null>(null);
  const [trainAnalyzing, setTrainAnalyzing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftMeta, setDraftMeta] = useState<{ rules?: string[]; doNot?: string[]; summary?: string }>({});
  const [draftStructure, setDraftStructure] = useState<ScriptStructureAnalysis | null>(null);
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});
  const [isRefining, setIsRefining] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSourceType, setChatSourceType] = useState<'topic' | 'reference'>('topic');
  const [chatReferenceUrl, setChatReferenceUrl] = useState('');
  const [currentScript, setCurrentScript] = useState('');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showEditScriptModal, setShowEditScriptModal] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [showAddToFeedModal, setShowAddToFeedModal] = useState(false);
  const [addToFeedDraftId, setAddToFeedDraftId] = useState<string | null>(null);
  const [addToFeedFolder, setAddToFeedFolder] = useState<string | null>(null);
  const [addingToFeed, setAddingToFeed] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentDraftIdRef = useRef<string | null>(null);

  const styles = currentProject?.projectStyles || [];
  const selectedStyle = styles.find(s => s.id === selectedStyleId) || null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ─── Reel Validation ────────────────────────────────────────────────────────

  const validateReelUrl = useCallback(async (index: number, url: string) => {
    if (!url.trim()) return;
    setReelInputs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], url, loading: true, error: null, views: null, viralMultiplier: null };
      return next;
    });

    try {
      const res = await fetch('/api/reel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!data || data.error) {
        setReelInputs(prev => {
          const next = [...prev];
          next[index] = { ...next[index], loading: false, error: data?.error || 'Не удалось получить данные' };
          return next;
        });
        return;
      }

      const views = data.view_count || 0;
      const ownerUsername = data.owner?.username || data.owner_username || '';

      let viralMultiplier: number | null = null;
      if (ownerUsername) {
        try {
          const profileStats = await getOrUpdateProfileStats(ownerUsername);
          viralMultiplier = calculateViralMultiplier(views, profileStats);
        } catch { /* no stats */ }
      }

      setReelInputs(prev => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          loading: false,
          views,
          ownerUsername,
          viralMultiplier,
          error: viralMultiplier !== null && viralMultiplier < 10
            ? `x${viralMultiplier.toFixed(1)} — не залёт (нужен x10+)`
            : null,
        };
        return next;
      });
    } catch (err) {
      setReelInputs(prev => {
        const next = [...prev];
        next[index] = { ...next[index], loading: false, error: 'Ошибка загрузки' };
        return next;
      });
    }
  }, []);

  // ─── Transcribe all reels ──────────────────────────────────────────────────

  const transcribeReels = useCallback(async () => {
    const validReels = reelInputs.filter(r => r.url.trim() && r.views !== null);
    for (let i = 0; i < validReels.length; i++) {
      const reel = validReels[i];
      const idx = reelInputs.indexOf(reel);
      if (reel.transcriptText) continue;

      setReelInputs(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], transcriptLoading: true };
        return next;
      });

      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: reel.url }),
        });
        const data = await res.json();
        setReelInputs(prev => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            transcriptLoading: false,
            transcriptText: data.transcript || data.text || '',
          };
          return next;
        });
      } catch {
        setReelInputs(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], transcriptLoading: false, error: 'Ошибка транскрибации' };
          return next;
        });
      }
    }
  }, [reelInputs]);

  // ─── Check lengths & analyze ───────────────────────────────────────────────

  const startTraining = useCallback(async () => {
    setTrainAnalyzing(true);

    let scripts: { transcript_text?: string; script_text?: string }[] = [];

    if (trainMode === 'reels') {
      await transcribeReels();
      const validReels = reelInputs.filter(r => r.url.trim() && (r.transcriptText || r.views !== null));
      scripts = validReels.map(r => ({
        transcript_text: r.transcriptText || '',
        script_text: r.transcriptText || '',
      }));
    } else {
      scripts = scriptInputs.filter(s => s.text.trim()).map(s => ({
        transcript_text: s.text,
        script_text: s.text,
      }));
    }

    if (scripts.length < 2) {
      toast.error('Нужно минимум 2 примера');
      setTrainAnalyzing(false);
      return;
    }

    // Check lengths for format selection
    const lengths = scripts.map(s => (s.script_text || s.transcript_text || '').split(/\s+/).length);
    const minLen = Math.min(...lengths);
    const maxLen = Math.max(...lengths);
    const ratio = maxLen / Math.max(minLen, 1);

    if (ratio > 2 && !preferredFormat) {
      setTrainAnalyzing(false);
      setScreen('train-format-select');
      return;
    }

    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze-structure',
          scripts,
          training_mode: trainMode,
          preferred_format: preferredFormat,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Ошибка анализа');
        setTrainAnalyzing(false);
        return;
      }

      setDraftPrompt(data.prompt);
      setDraftMeta(data.meta || {});
      setDraftStructure(data.structure_analysis || null);

      if (data.clarifying_questions?.length) {
        setClarifyQuestions(data.clarifying_questions);
        setClarifyAnswers({});
        setTrainAnalyzing(false);
        setScreen('train-verify');
      } else {
        await saveStyle(data.prompt, data.meta, data.structure_analysis);
        setTrainAnalyzing(false);
        setScreen('styles-list');
        toast.success('Подчерк создан!');
      }
    } catch (err) {
      console.error('Training error:', err);
      toast.error('Ошибка обучения');
      setTrainAnalyzing(false);
    }
  }, [trainMode, reelInputs, scriptInputs, preferredFormat, transcribeReels]);

  // ─── Save style ────────────────────────────────────────────────────────────

  const saveStyle = useCallback(async (
    prompt: string,
    meta: { rules?: string[]; doNot?: string[]; summary?: string },
    structureAnalysis?: ScriptStructureAnalysis | null,
  ) => {
    if (!currentProjectId) return;

    const examplesCount = trainMode === 'reels'
      ? reelInputs.filter(r => r.url.trim()).length
      : scriptInputs.filter(s => s.text.trim()).length;

    const trainingExamples = trainMode === 'reels'
      ? reelInputs.filter(r => r.url.trim()).map(r => ({
          url: r.url,
          viralMultiplier: r.viralMultiplier ?? undefined,
          scriptLength: (r.transcriptText || '').split(/\s+/).length,
        }))
      : scriptInputs.filter(s => s.text.trim()).map(s => ({
          scriptLength: s.text.split(/\s+/).length,
        }));

    await addProjectStyle(currentProjectId, {
      name: trainStyleName || 'Новый подчерк',
      prompt,
      meta,
      examplesCount,
      trainingMode: trainMode,
      preferredFormat: preferredFormat || undefined,
      structureAnalysis: structureAnalysis || undefined,
      trainingExamples,
    });
  }, [currentProjectId, trainMode, trainStyleName, reelInputs, scriptInputs, preferredFormat, addProjectStyle]);

  // ─── Verify (clarifying questions) ─────────────────────────────────────────

  const handleClarifySubmit = useCallback(async () => {
    const allAnswers = Object.entries(clarifyAnswers)
      .map(([i, a]) => `Уточняющий вопрос: ${clarifyQuestions[Number(i)]}\nОтвет: ${a}`)
      .join('\n\n');

    setIsRefining(true);
    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine',
          prompt: draftPrompt,
          feedback: `Ответы на уточняющие вопросы по обучению:\n${allAnswers}`,
          structure_analysis: draftStructure,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const finalPrompt = data.prompt || draftPrompt;
        const finalMeta = data.meta || draftMeta;
        await saveStyle(finalPrompt, finalMeta, draftStructure);
        toast.success('Подчерк создан!');
        setScreen('styles-list');
      } else {
        toast.error('Ошибка верификации');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsRefining(false);
    }
  }, [clarifyAnswers, clarifyQuestions, draftPrompt, draftMeta, draftStructure, saveStyle]);

  // ─── Chat: send message ────────────────────────────────────────────────────

  const sendChatMessage = useCallback(async (text?: string) => {
    const msgText = text || chatInput.trim();
    if (!msgText || !selectedStyle) return;

    const newMsg: ChatMessage = { role: 'user', content: msgText, timestamp: new Date().toISOString() };
    const updatedMessages = [...chatMessages, newMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);

    const isFirstMessage = chatMessages.length === 0;

    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      if (isFirstMessage && chatSourceType === 'topic') {
        endpoint = '/api/scriptwriter';
        body = {
          action: 'generate-from-topic',
          prompt: selectedStyle.prompt,
          topic: msgText,
          structure_analysis: selectedStyle.structureAnalysis,
        };
      } else if (isFirstMessage && chatSourceType === 'reference') {
        // First transcribe, then generate
        const transcribeRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: chatReferenceUrl || msgText }),
        });
        const transcribeData = await transcribeRes.json();
        const transcript = transcribeData.transcript || transcribeData.text || msgText;

        endpoint = '/api/scriptwriter';
        body = {
          action: 'generate-from-reference',
          prompt: selectedStyle.prompt,
          transcript_text: transcript,
          structure_analysis: selectedStyle.structureAnalysis,
        };
      } else {
        endpoint = '/api/scriptwriter';
        body = {
          action: 'chat',
          messages: updatedMessages,
          prompt: selectedStyle.prompt,
          script_text: currentScript,
          structure_analysis: selectedStyle.structureAnalysis,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        const script = data.script || data.suggested_script || '';
        const reply = data.reply || (script ? 'Вот сценарий:' : 'Ошибка генерации');

        if (script) setCurrentScript(script);

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: script || reply,
          suggested_script: script || undefined,
          timestamp: new Date().toISOString(),
        };
        const allMessages = [...updatedMessages, assistantMsg];
        setChatMessages(allMessages);

        // Auto-save draft
        if (!currentDraftIdRef.current) {
          const title = msgText.slice(0, 50) || 'Сценарий';
          const draft = await createDraft({
            title,
            script_text: script || '',
            style_id: selectedStyle.id,
            source_type: chatSourceType,
            source_data: { topic: msgText },
            chat_history: allMessages,
          });
          if (draft) currentDraftIdRef.current = draft.id;
        } else {
          await updateDraft(currentDraftIdRef.current, {
            script_text: script || currentScript,
            chat_history: allMessages,
          });
        }
      } else {
        toast.error(data.error || 'Ошибка');
        const errMsg: ChatMessage = { role: 'assistant', content: `Ошибка: ${data.error || 'Попробуйте ещё раз'}` };
        setChatMessages([...updatedMessages, errMsg]);
      }
    } catch (err) {
      toast.error('Ошибка сети');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, selectedStyle, chatSourceType, chatReferenceUrl, currentScript, createDraft, updateDraft]);

  // ─── Feedback: refine style ────────────────────────────────────────────────

  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackText.trim() || !selectedStyle) return;
    setIsRefining(true);

    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine',
          prompt: selectedStyle.prompt,
          script_text: currentScript,
          feedback: feedbackText,
          structure_analysis: selectedStyle.structureAnalysis,
        }),
      });
      const data = await res.json();

      if (data.success && data.prompt) {
        await updateProjectStyle(currentProjectId!, selectedStyle.id, {
          prompt: data.prompt,
          meta: data.meta,
        });
        toast.success('Подчерк дообучен!');

        if (data.clarifying_questions?.length) {
          setClarifyQuestions(data.clarifying_questions);
          setClarifyAnswers({});
          setShowFeedbackModal(false);
          setScreen('train-verify');
        } else {
          setShowFeedbackModal(false);
        }
      } else {
        toast.error('Ошибка дообучения');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsRefining(false);
      setFeedbackText('');
    }
  }, [feedbackText, selectedStyle, currentScript, currentProjectId, updateProjectStyle]);

  // ─── Feedback by diff ──────────────────────────────────────────────────────

  const handleDiffSubmit = useCallback(async () => {
    if (!selectedStyle) return;
    setIsRefining(true);

    try {
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine-by-diff',
          prompt: selectedStyle.prompt,
          script_ai: currentScript,
          script_human: editedScript,
          structure_analysis: selectedStyle.structureAnalysis,
        }),
      });
      const data = await res.json();

      if (data.success && data.prompt) {
        await updateProjectStyle(currentProjectId!, selectedStyle.id, {
          prompt: data.prompt,
          meta: data.meta,
        });
        setCurrentScript(editedScript);
        toast.success('Подчерк дообучен по правкам!');
        setShowEditScriptModal(false);
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsRefining(false);
    }
  }, [selectedStyle, currentScript, editedScript, currentProjectId, updateProjectStyle]);

  // ─── Add to feed ───────────────────────────────────────────────────────────

  const handleAddToFeed = useCallback(async () => {
    if (!addToFeedDraftId) return;
    setAddingToFeed(true);

    try {
      const draft = drafts.find(d => d.id === addToFeedDraftId);
      const coverUrl = await uploadScriptCover(draft?.title || 'Сценарий', addToFeedDraftId);
      const success = await addDraftToFeed(addToFeedDraftId, addToFeedFolder, coverUrl || undefined);

      if (success) {
        toast.success('Сценарий добавлен в Ленту!');
        setShowAddToFeedModal(false);
        setAddToFeedDraftId(null);
      } else {
        toast.error('Ошибка добавления');
      }
    } catch {
      toast.error('Ошибка');
    } finally {
      setAddingToFeed(false);
    }
  }, [addToFeedDraftId, addToFeedFolder, drafts, addDraftToFeed]);

  // ─── Open chat with style ──────────────────────────────────────────────────

  const openChat = useCallback((styleId: string, draft?: ScriptDraft) => {
    setSelectedStyleId(styleId);
    if (draft) {
      currentDraftIdRef.current = draft.id;
      setChatMessages(draft.chat_history || []);
      setCurrentScript(draft.script_text || '');
    } else {
      currentDraftIdRef.current = null;
      setChatMessages([]);
      setCurrentScript('');
    }
    setChatInput('');
    setChatSourceType('topic');
    setScreen('chat');
  }, []);

  // ─── Reset training state ─────────────────────────────────────────────────

  const resetTraining = useCallback(() => {
    setTrainStyleName('');
    setTrainMode('reels');
    setReelInputs(Array.from({ length: 5 }, () => ({
      url: '', loading: false, views: null, ownerUsername: null,
      viralMultiplier: null, error: null, transcriptText: null, transcriptLoading: false,
    })));
    setScriptInputs(Array.from({ length: 5 }, () => ({ text: '' })));
    setPreferredFormat(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-slate-400 text-sm">Выберите проект</p>
      </div>
    );
  }

  // ── Styles List ──────────────────────────────────────────────────────────
  if (screen === 'styles-list') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 font-heading tracking-tight">ИИ-сценарист</h1>
                <p className="text-xs text-slate-500">Создавай сценарии в стиле залётных видео</p>
              </div>
            </div>
          </div>

          {/* Tabs: Подчерки / Черновики */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl bg-slate-100/80">
            <button
              onClick={() => setScreen('styles-list')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all bg-white shadow-sm text-slate-800"
            >
              Подчерки ({styles.length})
            </button>
            <button
              onClick={() => setScreen('drafts')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all text-slate-500 hover:text-slate-700"
            >
              Черновики ({drafts.length})
            </button>
          </div>

          {/* Styles Grid */}
          <div className="space-y-3">
            {styles.map(style => (
              <div
                key={style.id}
                className="p-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 hover:border-slate-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 text-sm truncate">{style.name}</h3>
                    {style.meta?.summary && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{style.meta.summary}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {style.trainingMode && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                        {style.trainingMode === 'reels' ? 'Рилсы' : 'Сценарии'}
                      </span>
                    )}
                    {style.examplesCount && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-600">
                        {style.examplesCount} прим.
                      </span>
                    )}
                  </div>
                </div>

                {style.structureAnalysis && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {style.structureAnalysis.hookDescription && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-50 text-amber-700">
                        Хук: {style.structureAnalysis.hookDuration || '?'}
                      </span>
                    )}
                    {style.structureAnalysis.ctaType && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] bg-blue-50 text-blue-700">
                        CTA: {style.structureAnalysis.ctaType}
                      </span>
                    )}
                    {style.structureAnalysis.bodyPhases?.length ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] bg-emerald-50 text-emerald-700">
                        {style.structureAnalysis.bodyPhases.length} фаз
                      </span>
                    ) : null}
                  </div>
                )}

                <button
                  onClick={() => openChat(style.id)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:from-violet-600 hover:to-purple-700 active:scale-[0.98] transition-all shadow-md shadow-violet-500/20"
                >
                  <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
                  Создать сценарий
                </button>
              </div>
            ))}

            {/* Add new style */}
            <button
              onClick={() => {
                resetTraining();
                setScreen('train-mode-select');
              }}
              className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-200/60 text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium">Создать подчерк</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Drafts ───────────────────────────────────────────────────────────────
  if (screen === 'drafts') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 font-heading tracking-tight">ИИ-сценарист</h1>
                <p className="text-xs text-slate-500">Создавай сценарии в стиле залётных видео</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl bg-slate-100/80">
            <button
              onClick={() => setScreen('styles-list')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all text-slate-500 hover:text-slate-700"
            >
              Подчерки ({styles.length})
            </button>
            <button
              onClick={() => setScreen('drafts')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all bg-white shadow-sm text-slate-800"
            >
              Черновики ({drafts.length})
            </button>
          </div>

          {draftsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Черновиков пока нет</p>
              <p className="text-xs text-slate-400 mt-1">Создайте сценарий через один из подчерков</p>
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map(draft => {
                const styleName = styles.find(s => s.id === draft.style_id)?.name || '';
                return (
                  <div key={draft.id} className="p-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 hover:border-slate-200 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 text-sm truncate">{draft.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {styleName && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 font-medium">{styleName}</span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(draft.updated_at).toLocaleDateString('ru-RU')}
                          </span>
                          {draft.status === 'done' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-medium">В Ленте</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {draft.script_text && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{draft.script_text}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => openChat(draft.style_id || '', draft)}
                        className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Продолжить
                      </button>
                      {draft.status !== 'done' && (
                        <button
                          onClick={() => {
                            setAddToFeedDraftId(draft.id);
                            setAddToFeedFolder(null);
                            setShowAddToFeedModal(true);
                          }}
                          className="flex-1 py-2 rounded-xl bg-violet-100 text-violet-700 text-xs font-medium hover:bg-violet-200 transition-all flex items-center justify-center gap-1.5"
                        >
                          <LayoutGrid className="w-3 h-3" />
                          В Ленту
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (confirm('Удалить черновик?')) {
                            await deleteDraft(draft.id);
                            toast.success('Черновик удалён');
                          }
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add to Feed Modal */}
        {showAddToFeedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddToFeedModal(false)}>
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Добавить в Ленту</h3>
              <p className="text-xs text-slate-500 mb-4">Выберите папку для сценария</p>

              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {(currentProject.folders || []).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => setAddToFeedFolder(folder.id)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-xl text-left text-sm transition-all flex items-center gap-2',
                      addToFeedFolder === folder.id
                        ? 'bg-violet-100 text-violet-800 border border-violet-200'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                    )}
                  >
                    <FolderOpen className="w-4 h-4" style={{ color: folder.color }} />
                    {folder.name}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddToFeedModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddToFeed}
                  disabled={addingToFeed}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {addingToFeed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Добавить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Training: Mode Select ────────────────────────────────────────────────
  if (screen === 'train-mode-select') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-lg mx-auto px-4 py-8 md:py-12">
          <button onClick={() => setScreen('styles-list')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <h2 className="text-lg font-bold text-slate-800 mb-1">Создать подчерк</h2>
          <p className="text-sm text-slate-500 mb-6">Обучите ИИ на примерах залётных видео</p>

          {/* Style name */}
          <div className="mb-6">
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Название подчерка</label>
            <input
              type="text"
              value={trainStyleName}
              onChange={e => setTrainStyleName(e.target.value)}
              placeholder="Например: Мотивация 30с"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { setTrainMode('reels'); setScreen('train-reels'); }}
              className="w-full p-4 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                  <LinkIcon className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">5 залётных рилсов</h3>
                  <p className="text-xs text-slate-500">Ссылки на Instagram рилсы одного формата</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 ml-12">ИИ проанализирует структуру, хук, CTA и стиль</p>
            </button>

            <button
              onClick={() => { setTrainMode('scripts'); setScreen('train-scripts'); }}
              className="w-full p-4 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <Type className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">5 своих сценариев</h3>
                  <p className="text-xs text-slate-500">Вставьте тексты своих лучших сценариев</p>
                </div>
              </div>
              <div className="ml-12 mt-1 px-2 py-1 rounded-md bg-amber-50 inline-block">
                <p className="text-[10px] text-amber-700 font-medium">⚠ ИИ будет опираться только на ваш опыт</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Training: Reels Input ────────────────────────────────────────────────
  if (screen === 'train-reels') {
    const validCount = reelInputs.filter(r => r.url.trim() && r.views !== null && !r.error).length;
    const anyLoading = reelInputs.some(r => r.loading || r.transcriptLoading);

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-lg mx-auto px-4 py-8 md:py-12">
          <button onClick={() => setScreen('train-mode-select')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <h2 className="text-lg font-bold text-slate-800 mb-1">Загрузите 5 залётных рилсов</h2>

          {/* Important notice */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 mb-6">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Важно!</p>
                <p>Все видео должны быть <strong>залётами (x10+)</strong> — в 10 раз больше просмотров, чем средний ролик аккаунта.</p>
                <p>Все видео должны иметь <strong>одну суть и схожую структуру</strong>.</p>
              </div>
            </div>
          </div>

          {/* URL inputs */}
          <div className="space-y-3 mb-6">
            {reelInputs.map((reel, i) => (
              <div key={i}>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={reel.url}
                    onChange={e => {
                      const url = e.target.value;
                      setReelInputs(prev => {
                        const next = [...prev];
                        next[i] = { ...next[i], url };
                        return next;
                      });
                    }}
                    onBlur={() => reel.url.trim() && !reel.views && validateReelUrl(i, reel.url)}
                    placeholder={`Ссылка на рилс ${i + 1}`}
                    className={cn(
                      'flex-1 px-3 py-2.5 rounded-xl bg-white border text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all',
                      reel.error ? 'border-red-200 focus:border-red-300' : 'border-slate-200 focus:border-violet-300'
                    )}
                  />
                  {reel.loading && <div className="flex items-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>}
                  {reel.viralMultiplier !== null && !reel.error && (
                    <div className="flex items-center">
                      <span
                        className="px-2 py-1 rounded-lg text-xs font-bold"
                        style={{ color: getViralMultiplierColor(reel.viralMultiplier), backgroundColor: `${getViralMultiplierColor(reel.viralMultiplier)}15` }}
                      >
                        x{reel.viralMultiplier.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
                {reel.error && (
                  <p className="text-[11px] text-red-500 mt-1 ml-1">{reel.error}</p>
                )}
                {reel.transcriptLoading && (
                  <p className="text-[11px] text-slate-400 mt-1 ml-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Транскрибация...
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={startTraining}
            disabled={validCount < 2 || anyLoading || trainAnalyzing}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium text-sm hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {trainAnalyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Анализирую...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Обучить подчерк ({validCount}/5)</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Training: Scripts Input ──────────────────────────────────────────────
  if (screen === 'train-scripts') {
    const validCount = scriptInputs.filter(s => s.text.trim()).length;

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-lg mx-auto px-4 py-8 md:py-12">
          <button onClick={() => setScreen('train-mode-select')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <h2 className="text-lg font-bold text-slate-800 mb-1">Загрузите 5 своих сценариев</h2>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 mb-6">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                ИИ-сценарист может <strong>не идеально делать залёты</strong>, так как будет опираться лишь на ваш опыт. Для лучших результатов используйте залётные рилсы.
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {scriptInputs.map((s, i) => (
              <div key={i}>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Сценарий {i + 1}</label>
                <textarea
                  value={s.text}
                  onChange={e => {
                    const text = e.target.value;
                    setScriptInputs(prev => {
                      const next = [...prev];
                      next[i] = { text };
                      return next;
                    });
                  }}
                  placeholder="Вставьте текст сценария..."
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all resize-none"
                />
              </div>
            ))}
          </div>

          <button
            onClick={startTraining}
            disabled={validCount < 2 || trainAnalyzing}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium text-sm hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {trainAnalyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Анализирую...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Обучить подчерк ({validCount}/5)</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Training: Format Select ──────────────────────────────────────────────
  if (screen === 'train-format-select') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-lg mx-auto px-4 py-8 md:py-12">
          <button onClick={() => setScreen(trainMode === 'reels' ? 'train-reels' : 'train-scripts')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <h2 className="text-lg font-bold text-slate-800 mb-2">Сценарии разной длины</h2>
          <p className="text-sm text-slate-500 mb-6">
            Загруженные примеры сильно различаются по длине. Выберите, какой формат взять за основу:
          </p>

          <div className="space-y-3 mb-6">
            <button
              onClick={() => { setPreferredFormat('short'); setScreen(trainMode === 'reels' ? 'train-reels' : 'train-scripts'); setTimeout(() => startTraining(), 100); }}
              className="w-full p-4 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 transition-all text-left"
            >
              <h3 className="font-semibold text-sm text-slate-800 mb-1">Короткий формат</h3>
              <p className="text-xs text-slate-500">Ориентироваться на короткие сценарии</p>
            </button>
            <button
              onClick={() => { setPreferredFormat('long'); setScreen(trainMode === 'reels' ? 'train-reels' : 'train-scripts'); setTimeout(() => startTraining(), 100); }}
              className="w-full p-4 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 transition-all text-left"
            >
              <h3 className="font-semibold text-sm text-slate-800 mb-1">Длинный формат</h3>
              <p className="text-xs text-slate-500">Ориентироваться на длинные сценарии</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Training: Verify (Clarifying Questions) ──────────────────────────────
  if (screen === 'train-verify') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar-light">
        <div className="max-w-lg mx-auto px-4 py-8 md:py-12">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Уточняющие вопросы</h2>
          <p className="text-sm text-slate-500 mb-6">Подтвердите или скорректируйте понимание ИИ</p>

          <div className="space-y-4 mb-6">
            {clarifyQuestions.map((q, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white border border-slate-100">
                <p className="text-sm text-slate-700 mb-2">{q}</p>
                <input
                  type="text"
                  value={clarifyAnswers[i] || ''}
                  onChange={e => setClarifyAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Ваш ответ (Да / Нет / Уточнение)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                await saveStyle(draftPrompt, draftMeta, draftStructure);
                toast.success('Подчерк создан (без уточнений)');
                setScreen('styles-list');
              }}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
            >
              Пропустить
            </button>
            <button
              onClick={handleClarifySubmit}
              disabled={isRefining}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Подтвердить
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  if (screen === 'chat') {
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <button
              onClick={() => { setScreen('styles-list'); currentDraftIdRef.current = null; }}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 truncate">
                {selectedStyle?.name || 'Сценарий'}
              </h3>
              <p className="text-[11px] text-slate-400">ИИ-сценарист</p>
            </div>
            {currentScript && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setShowFeedbackModal(true);
                    setFeedbackText('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-medium hover:bg-amber-100 transition-all"
                >
                  Что не так?
                </button>
                <button
                  onClick={() => {
                    setEditedScript(currentScript);
                    setShowEditScriptModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-medium hover:bg-slate-200 transition-all"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={async () => {
                    if (!currentDraftIdRef.current) {
                      const draft = await createDraft({
                        title: chatMessages[0]?.content?.slice(0, 50) || 'Сценарий',
                        script_text: currentScript,
                        style_id: selectedStyleId || undefined,
                        chat_history: chatMessages,
                      });
                      if (draft) {
                        currentDraftIdRef.current = draft.id;
                        setAddToFeedDraftId(draft.id);
                      }
                    } else {
                      setAddToFeedDraftId(currentDraftIdRef.current);
                    }
                    setAddToFeedFolder(null);
                    setShowAddToFeedModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-medium hover:bg-violet-100 transition-all"
                >
                  <LayoutGrid className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar-light px-4">
          <div className="max-w-2xl mx-auto py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="py-12 text-center">
                <Sparkles className="w-10 h-10 text-violet-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 mb-4">Опишите тему или вставьте ссылку на референс</p>

                {/* Source type toggle */}
                <div className="inline-flex gap-1 p-1 rounded-xl bg-slate-100/80 mb-4">
                  <button
                    onClick={() => setChatSourceType('topic')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      chatSourceType === 'topic' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                    )}
                  >
                    По теме
                  </button>
                  <button
                    onClick={() => setChatSourceType('reference')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      chatSourceType === 'reference' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                    )}
                  >
                    По референсу
                  </button>
                </div>

                {chatSourceType === 'reference' && (
                  <div className="max-w-xs mx-auto">
                    <input
                      type="url"
                      value={chatReferenceUrl}
                      onChange={e => setChatReferenceUrl(e.target.value)}
                      placeholder="Ссылка на Instagram рилс"
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 text-center focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                    />
                  </div>
                )}
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'ml-auto bg-violet-600 text-white rounded-br-md'
                    : 'mr-auto bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
                )}
              >
                {msg.content}
              </div>
            ))}

            {chatLoading && (
              <div className="mr-auto bg-white border border-slate-100 rounded-2xl rounded-bl-md p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Генерирую...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100 bg-white/80 backdrop-blur-sm safe-bottom">
          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
              placeholder={chatMessages.length === 0
                ? (chatSourceType === 'topic' ? 'Тема или идея для сценария...' : 'Опишите что нужно...')
                : 'Сообщение...'}
              disabled={chatLoading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all disabled:opacity-50"
            />
            <button
              onClick={() => sendChatMessage()}
              disabled={chatLoading || !chatInput.trim()}
              className="p-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Modal */}
        {showFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowFeedbackModal(false)}>
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Что не так?</h3>
              <p className="text-xs text-slate-500 mb-4">Опишите проблему — ИИ скорректирует подчерк</p>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Например: хук слишком длинный, нет CTA..."
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all resize-none mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || isRefining}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Дообучить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Script Modal */}
        {showEditScriptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowEditScriptModal(false)}>
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Ваш идеальный вариант</h3>
              <p className="text-xs text-slate-500 mb-4">Отредактируйте сценарий — ИИ выучит ваши правки</p>
              <textarea
                value={editedScript}
                onChange={e => setEditedScript(e.target.value)}
                rows={12}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all resize-none flex-1 mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditScriptModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDiffSubmit}
                  disabled={isRefining || editedScript === currentScript}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Дообучить по правкам
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add to Feed Modal */}
        {showAddToFeedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddToFeedModal(false)}>
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Добавить в Ленту</h3>
              <p className="text-xs text-slate-500 mb-4">Выберите папку для сценария</p>

              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {(currentProject?.folders || []).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => setAddToFeedFolder(folder.id)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-xl text-left text-sm transition-all flex items-center gap-2',
                      addToFeedFolder === folder.id
                        ? 'bg-violet-100 text-violet-800 border border-violet-200'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                    )}
                  >
                    <FolderOpen className="w-4 h-4" style={{ color: folder.color }} />
                    {folder.name}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddToFeedModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddToFeed}
                  disabled={addingToFeed}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {addingToFeed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Добавить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
