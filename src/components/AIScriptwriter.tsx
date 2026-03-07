import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '../contexts/ProjectContext';
import { useScriptDrafts, type ScriptDraft } from '../hooks/useScriptDrafts';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import type { ScriptStructureAnalysis } from '../hooks/useProjects';
import {
  getOrUpdateProfileStats,
  calculateViralMultiplier,
  getViralMultiplierColor,
} from '../services/profileStatsService';
import { uploadScriptCover } from '../utils/generateScriptCover';
import { getTokenCost } from '../constants/tokenCosts';
import { TokenBadge } from './ui/TokenBadge';
import { cn } from '../utils/cn';
import { iosSpringSoft } from '../utils/motionPresets';
import { toast } from 'sonner';
import {
  Sparkles, Plus, ArrowLeft, Loader2, Trash2,
  FileText, MessageSquare, Pencil, LayoutGrid,
  AlertTriangle, Link as LinkIcon, Type,
  Check, FolderOpen, ChevronRight, ChevronDown,
  Zap, Send, Eye,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'styles' | 'drafts';
type GenStep = 'idle' | 'mode-select' | 'topic' | 'reference' | 'transcribing' | 'clarify' | 'hooks' | 'body' | 'final' | 'retrain';

interface ChatMsg {
  id: string;
  role: 'riri' | 'user';
  text: string;
}

interface ClarifyQuestion {
  question: string;
  options: string[];
}

interface HookVariant {
  text: string;
  approach: string;
}

interface BodyVariant {
  text: string;
  approach: string;
}

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

// Train screens (within styles tab)
type TrainScreen = 'list' | 'mode-select' | 'reels' | 'scripts' | 'format-select' | 'verify';

// Generation state for auto-save
interface GenState {
  mode: 'topic' | 'reference' | 'quick';
  topic: string;
  referenceUrl?: string;
  referenceTranscript?: string;
  answers: string[];
  questions: ClarifyQuestion[];
  hooks: HookVariant[];
  hookTexts: string[];
  selectedHookIdx: number;
  bodies: BodyVariant[];
  bodyTexts: string[];
  selectedBodyIdx: number;
  finalScript: string;
  step: GenStep;
  messages: ChatMsg[];
}

const msgAnim = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: iosSpringSoft,
};

// ─── Shared UI ───────────────────────────────────────────────────────────────

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-card-xl bg-white/72 backdrop-blur-glass-xl border border-white/55 shadow-glass', className)}>{children}</div>;
}

function CostBtn({ onClick, disabled, loading, cost, children, variant = 'primary', className }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; cost?: number; children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading} className={cn(
      'flex items-center justify-center gap-2 min-h-[44px] rounded-2xl font-medium text-sm transition-all active:scale-[0.97] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed px-4',
      variant === 'primary' && 'bg-slate-600 hover:bg-slate-700 text-white shadow-glass',
      variant === 'secondary' && 'border border-slate-200 text-slate-600 hover:bg-slate-50',
      variant === 'ghost' && 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
      className
    )}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
      {cost != null && cost > 0 && <TokenBadge tokens={cost} size="sm" variant={variant === 'primary' ? 'dark' : 'default'} />}
    </button>
  );
}

function RiriBubble({ text }: { text: string }) {
  return (
    <motion.div {...msgAnim} className="flex gap-2.5 items-start max-w-[85%]">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-glass-sm">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-white/80 backdrop-blur-glass border border-white/50 shadow-glass-sm">
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div {...msgAnim} className="flex justify-end">
      <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-md bg-slate-600 text-white shadow-glass-sm max-w-[80%]">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div {...msgAnim} className="flex gap-2.5 items-start">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center flex-shrink-0 shadow-glass-sm">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white/80 backdrop-blur-glass border border-white/50 shadow-glass-sm">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-2 h-2 rounded-full bg-slate-400"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Word count helper
function estimateDuration(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const seconds = Math.round(words / 2.5);
  return `${words} слов · ~${seconds} сек`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AIScriptwriter() {
  const { currentProject, currentProjectId, addProjectStyle, updateProjectStyle } = useProjectContext();
  const { drafts, loading: draftsLoading, createDraft, updateDraft, deleteDraft, addDraftToFeed } = useScriptDrafts();
  const { canAfford, deduct } = useTokenBalance();

  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [genStep, setGenStep] = useState<GenStep>('idle');
  const [genMode, setGenMode] = useState<'topic' | 'reference' | 'quick'>('topic');
  const [genTopic, setGenTopic] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceTranscript, setReferenceTranscript] = useState('');
  const [genQuestions, setGenQuestions] = useState<ClarifyQuestion[]>([]);
  const [genAnswers, setGenAnswers] = useState<string[]>([]);
  const [genHooks, setGenHooks] = useState<HookVariant[]>([]);
  const [hookTexts, setHookTexts] = useState<string[]>([]);
  const [selectedHookIdx, setSelectedHookIdx] = useState(0);
  const [genBodies, setGenBodies] = useState<BodyVariant[]>([]);
  const [bodyTexts, setBodyTexts] = useState<string[]>([]);
  const [selectedBodyIdx, setSelectedBodyIdx] = useState(0);
  const [genFinalScript, setGenFinalScript] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const currentDraftIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [editingHookIdx, setEditingHookIdx] = useState<number | null>(null);
  const [editingBodyIdx, setEditingBodyIdx] = useState<number | null>(null);

  // ── Training state (styles tab) ──
  const [trainScreen, setTrainScreen] = useState<TrainScreen>('list');
  const [trainStyleName, setTrainStyleName] = useState('');
  const [trainMode, setTrainMode] = useState<'reels' | 'scripts'>('reels');
  const [reelInputs, setReelInputs] = useState<ReelInput[]>(Array.from({ length: 5 }, () => ({ url: '', loading: false, views: null, ownerUsername: null, viralMultiplier: null, error: null, transcriptText: null, transcriptLoading: false })));
  const [scriptInputs, setScriptInputs] = useState<ScriptInput[]>(Array.from({ length: 5 }, () => ({ text: '' })));
  const [preferredFormat, setPreferredFormat] = useState<'short' | 'long' | null>(null);
  const [trainAnalyzing, setTrainAnalyzing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftMeta, setDraftMeta] = useState<{ rules?: string[]; doNot?: string[]; summary?: string }>({});
  const [draftStructure, setDraftStructure] = useState<ScriptStructureAnalysis | null>(null);
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});
  const [isRefining, setIsRefining] = useState(false);

  // ── Prompt box ──
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);

  // ── Add-to-feed modal ──
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedDraftId, setFeedDraftId] = useState<string | null>(null);
  const [feedFolder, setFeedFolder] = useState<string | null>(null);
  const [feedSaving, setFeedSaving] = useState(false);

  const styles = currentProject?.projectStyles || [];
  const selectedStyle = styles.find(s => s.id === selectedStyleId) || null;

  // Auto-select first style if none selected
  useEffect(() => {
    if (!selectedStyleId && styles.length > 0) setSelectedStyleId(styles[0].id);
  }, [styles, selectedStyleId]);

  // Unified prompt value helpers
  const getPromptValue = () => {
    if (genStep === 'topic' || genStep === 'mode-select') return genTopic;
    if (genStep === 'reference') return referenceUrl;
    if (genStep === 'hooks' || genStep === 'body' || genStep === 'final') return feedbackText;
    return '';
  };
  const setPromptValue = (val: string) => {
    if (genStep === 'topic' || genStep === 'mode-select') setGenTopic(val);
    else if (genStep === 'reference') setReferenceUrl(val);
    else setFeedbackText(val);
  };
  const getPlaceholder = () => {
    if (genStep === 'mode-select' || genStep === 'topic') return 'Введи тему или идею сценария...';
    if (genStep === 'reference') return 'https://instagram.com/reel/...';
    if (genStep === 'hooks') return 'Что не так с хуками?';
    if (genStep === 'body') return 'Что не так с телом?';
    if (genStep === 'final') return 'Что улучшить в сценарии?';
    return 'Сообщение...';
  };
  const handlePromptSend = () => {
    const val = getPromptValue();
    if (!val.trim()) return;
    if (genStep === 'topic' || genStep === 'mode-select') handleTopicSubmit();
    else if (genStep === 'reference') handleReferenceSubmit();
    else if (genStep === 'hooks' && feedbackText.trim()) handleRegenerateHooks();
    else if (genStep === 'body' && feedbackText.trim()) handleRegenerateBody();
    else if (genStep === 'final' && feedbackText.trim()) handleImprove();
  };
  const promptSendCost = () => {
    if (genStep === 'mode-select' || genStep === 'topic') return genMode === 'quick' ? getTokenCost('sw_quick') : getTokenCost('sw_clarify');
    if (genStep === 'reference') return getTokenCost('transcribe_video') + getTokenCost('sw_clarify');
    if (genStep === 'hooks') return getTokenCost('sw_hooks');
    if (genStep === 'body') return getTokenCost('sw_body');
    if (genStep === 'final') return getTokenCost('sw_improve');
    return 0;
  };

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = promptRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px'; }
  }, [getPromptValue()]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, genStep, genLoading]);

  // Initialize chat
  useEffect(() => {
    if (messages.length === 0 && genStep === 'idle') {
      const greeting = styles.length > 0
        ? 'Привет! Я Riri - твоя AI-ассистент. Давай напишем сценарий вместе, как ты хочешь начать работу сегодня?'
        : 'Привет! Я Riri - твоя AI-ассистент. Для начала создай подчерк - перейди на вкладку «Подчерки».';
      setMessages([{ id: 'init', role: 'riri', text: greeting }]);
      if (styles.length > 0) setGenStep('mode-select');
    }
  }, [styles.length, messages.length, genStep]);

  // ── Helpers ──
  const addMsg = useCallback((role: 'riri' | 'user', text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text }]);
  }, []);

  const autoSaveDraft = useCallback(async (overrides?: Partial<GenState>) => {
    if (!currentProjectId) return;
    const state: GenState = {
      mode: overrides?.mode ?? genMode,
      topic: overrides?.topic ?? genTopic,
      referenceUrl: overrides?.referenceUrl ?? referenceUrl,
      referenceTranscript: overrides?.referenceTranscript ?? referenceTranscript,
      answers: overrides?.answers ?? genAnswers,
      questions: overrides?.questions ?? genQuestions,
      hooks: overrides?.hooks ?? genHooks,
      hookTexts: overrides?.hookTexts ?? hookTexts,
      selectedHookIdx: overrides?.selectedHookIdx ?? selectedHookIdx,
      bodies: overrides?.bodies ?? genBodies,
      bodyTexts: overrides?.bodyTexts ?? bodyTexts,
      selectedBodyIdx: overrides?.selectedBodyIdx ?? selectedBodyIdx,
      finalScript: overrides?.finalScript ?? genFinalScript,
      step: overrides?.step ?? genStep,
      messages: overrides?.messages ?? messages,
    };
    const title = state.topic.slice(0, 60) || 'Сценарий';
    if (currentDraftIdRef.current) {
      await updateDraft(currentDraftIdRef.current, { title, script_text: state.finalScript, source_data: state as unknown as Record<string, unknown> });
    } else {
      const d = await createDraft({ title, script_text: state.finalScript, style_id: selectedStyleId || undefined, source_type: state.mode, source_data: state as unknown as Record<string, unknown> });
      if (d) currentDraftIdRef.current = d.id;
    }
  }, [currentProjectId, genMode, genTopic, referenceUrl, referenceTranscript, genAnswers, genQuestions, genHooks, hookTexts, selectedHookIdx, genBodies, bodyTexts, selectedBodyIdx, genFinalScript, genStep, messages, selectedStyleId, updateDraft, createDraft]);

  // ── Reset chat for new generation ──
  const resetChat = useCallback(() => {
    currentDraftIdRef.current = null;
    setGenStep('mode-select');
    setGenMode('topic');
    setGenTopic('');
    setReferenceUrl('');
    setReferenceTranscript('');
    setGenQuestions([]);
    setGenAnswers([]);
    setGenHooks([]);
    setHookTexts([]);
    setSelectedHookIdx(0);
    setGenBodies([]);
    setBodyTexts([]);
    setSelectedBodyIdx(0);
    setGenFinalScript('');
    setFeedbackText('');
    setEditingHookIdx(null);
    setEditingBodyIdx(null);
    setMessages([{ id: 'init', role: 'riri', text: 'Привет! Я Riri - твоя AI-ассистент. Давай напишем сценарий вместе, как ты хочешь начать работу сегодня?' }]);
  }, []);

  // ── Resume draft ──
  const resumeDraft = useCallback((draft: ScriptDraft) => {
    const data = draft.source_data as unknown as GenState | null;
    if (!data) {
      setGenFinalScript(draft.script_text || '');
      setGenStep('final');
      currentDraftIdRef.current = draft.id;
      setSelectedStyleId(draft.style_id);
      setMessages([
        { id: 'init', role: 'riri', text: 'Продолжаем работу над сценарием.' },
        { id: 'final', role: 'riri', text: 'Вот текущий сценарий. Можешь улучшить или добавить в Ленту.' },
      ]);
      setActiveTab('chat');
      return;
    }
    currentDraftIdRef.current = draft.id;
    setSelectedStyleId(draft.style_id);
    setGenMode(data.mode || 'topic');
    setGenTopic(data.topic || '');
    setReferenceUrl(data.referenceUrl || '');
    setReferenceTranscript(data.referenceTranscript || '');
    setGenAnswers(data.answers || []);
    setGenQuestions(data.questions || []);
    setGenHooks(data.hooks || []);
    setHookTexts(data.hookTexts || []);
    setSelectedHookIdx(data.selectedHookIdx || 0);
    setGenBodies(data.bodies || []);
    setBodyTexts(data.bodyTexts || []);
    setSelectedBodyIdx(data.selectedBodyIdx || 0);
    setGenFinalScript(data.finalScript || draft.script_text || '');
    setGenStep(data.step || 'final');
    setMessages(data.messages?.length ? data.messages : [{ id: 'init', role: 'riri', text: 'Продолжаем.' }]);
    setActiveTab('chat');
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT FLOW HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  // Mode selection
  const handleModeSelect = useCallback((mode: 'topic' | 'reference' | 'quick') => {
    if (!selectedStyle) { toast.error('Сначала выбери подчерк'); return; }
    setGenMode(mode);
    if (mode === 'topic') {
      addMsg('user', 'Написать по теме');
      addMsg('riri', 'Отлично! Введи тему или идею для сценария.');
      setGenStep('topic');
    } else if (mode === 'reference') {
      addMsg('user', 'Переписать по референсу');
      addMsg('riri', 'Вставь ссылку на Instagram рилс - я транскрибирую и использую как основу.');
      setGenStep('reference');
    } else {
      addMsg('user', 'Быстрая генерация');
      addMsg('riri', 'Введи тему - я сразу напишу готовый сценарий.');
      setGenStep('topic');
    }
  }, [selectedStyle, addMsg]);

  // Submit topic → clarify (or quick → final)
  const handleTopicSubmit = useCallback(async () => {
    if (!genTopic.trim() || !selectedStyle) return;
    addMsg('user', genTopic.trim());

    if (genMode === 'quick') {
      const cost = getTokenCost('sw_quick');
      if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
      setGenLoading(true);
      try {
        await deduct(cost);
        const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quick-generate', prompt: selectedStyle.prompt, topic: genTopic, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined }) });
        const data = await res.json();
        if (data.success && data.script) {
          setGenFinalScript(data.script);
          addMsg('riri', 'Готово! Вот твой сценарий.');
          setGenStep('final');
          await autoSaveDraft({ finalScript: data.script, step: 'final' });
        } else { toast.error(data.error || 'Ошибка'); }
      } catch { toast.error('Ошибка сети'); }
      finally { setGenLoading(false); }
      return;
    }

    // Normal flow: clarify
    const cost = getTokenCost('sw_clarify');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clarify-topic', prompt: selectedStyle.prompt, topic: genTopic, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined }) });
      const data = await res.json();
      if (data.success && data.questions?.length) {
        setGenQuestions(data.questions);
        setGenAnswers(data.questions.map((q: ClarifyQuestion) => q.options[0] || ''));
        addMsg('riri', 'Уточним пару деталей, чтобы сценарий был точнее.');
        setGenStep('clarify');
        await autoSaveDraft({ step: 'clarify', questions: data.questions });
      } else { toast.error('Ошибка уточнения'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [genTopic, selectedStyle, genMode, referenceTranscript, canAfford, deduct, addMsg, autoSaveDraft]);

  // Submit reference URL → transcribe → clarify
  const handleReferenceSubmit = useCallback(async () => {
    if (!referenceUrl.trim() || !selectedStyle) return;
    addMsg('user', referenceUrl.trim());
    setGenStep('transcribing');
    setGenLoading(true);
    try {
      const cost = getTokenCost('transcribe_video');
      if (!canAfford(cost)) { toast.error('Недостаточно коинов'); setGenLoading(false); return; }
      await deduct(cost);
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: referenceUrl }) });
      const data = await res.json();
      const transcript = data.transcript || data.text || '';
      if (!transcript) { toast.error('Не удалось транскрибировать'); setGenStep('reference'); setGenLoading(false); return; }
      setReferenceTranscript(transcript);
      setGenTopic(transcript.slice(0, 200));
      addMsg('riri', `Транскрипт получен (${transcript.split(/\s+/).length} слов). Уточним детали.`);

      // Now clarify
      const clCost = getTokenCost('sw_clarify');
      if (!canAfford(clCost)) { toast.error('Недостаточно коинов'); setGenStep('topic'); setGenLoading(false); return; }
      await deduct(clCost);
      const clRes = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clarify-topic', prompt: selectedStyle.prompt, topic: transcript.slice(0, 500), structure_analysis: selectedStyle.structureAnalysis, reference_transcript: transcript }) });
      const clData = await clRes.json();
      if (clData.success && clData.questions?.length) {
        setGenQuestions(clData.questions);
        setGenAnswers(clData.questions.map((q: ClarifyQuestion) => q.options[0] || ''));
        setGenStep('clarify');
        await autoSaveDraft({ step: 'clarify', referenceTranscript: transcript });
      } else { setGenStep('topic'); toast.error('Ошибка уточнения'); }
    } catch { toast.error('Ошибка сети'); setGenStep('reference'); }
    finally { setGenLoading(false); }
  }, [referenceUrl, selectedStyle, canAfford, deduct, addMsg, autoSaveDraft]);

  // Clarify → hooks
  const handleClarifyDone = useCallback(async () => {
    if (!selectedStyle) return;
    const summary = genAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n');
    addMsg('user', summary);
    const cost = getTokenCost('sw_hooks');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-hooks', prompt: selectedStyle.prompt, topic: genTopic, answers: genAnswers, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined }) });
      const data = await res.json();
      if (data.success && data.hooks?.length) {
        setGenHooks(data.hooks);
        setHookTexts(data.hooks.map((h: HookVariant) => h.text));
        setSelectedHookIdx(0);
        addMsg('riri', 'Готово! Вот 5 вариантов хука - выбери, отредактируй или попроси перегенерировать.');
        setGenStep('hooks');
        await autoSaveDraft({ step: 'hooks', hooks: data.hooks, hookTexts: data.hooks.map((h: HookVariant) => h.text) });
      } else { toast.error('Ошибка генерации хуков'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, genTopic, genAnswers, referenceTranscript, canAfford, deduct, addMsg, autoSaveDraft]);

  // Regenerate hooks with feedback
  const handleRegenerateHooks = useCallback(async () => {
    if (!selectedStyle || !feedbackText.trim()) return;
    const cost = getTokenCost('sw_hooks');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    addMsg('user', `Что не так: ${feedbackText}`);
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-hooks', prompt: selectedStyle.prompt, topic: genTopic, answers: genAnswers, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined, feedback: feedbackText, previous_hooks: genHooks }) });
      const data = await res.json();
      if (data.success && data.hooks?.length) {
        setGenHooks(data.hooks);
        setHookTexts(data.hooks.map((h: HookVariant) => h.text));
        setSelectedHookIdx(0);
        setEditingHookIdx(null);
        setFeedbackText('');
        addMsg('riri', 'Новые 5 хуков с учётом твоего фидбека.');
        await autoSaveDraft({ hooks: data.hooks, hookTexts: data.hooks.map((h: HookVariant) => h.text) });
      } else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, feedbackText, genTopic, genAnswers, referenceTranscript, genHooks, canAfford, deduct, addMsg, autoSaveDraft]);

  // Hooks → body
  const handleHookConfirm = useCallback(async () => {
    if (!selectedStyle) return;
    const hookText = hookTexts[selectedHookIdx] || '';
    const wasEdited = hookText !== genHooks[selectedHookIdx]?.text;
    addMsg('user', `Хук${wasEdited ? ' (отредактирован)' : ''}: ${hookText.slice(0, 80)}...`);
    const cost = getTokenCost('sw_body');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-body', prompt: selectedStyle.prompt, topic: genTopic, answers: genAnswers, selected_hook: hookText, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined }) });
      const data = await res.json();
      if (data.success && data.bodies?.length) {
        setGenBodies(data.bodies);
        setBodyTexts(data.bodies.map((b: BodyVariant) => b.text));
        setSelectedBodyIdx(0);
        setFeedbackText('');
        addMsg('riri', 'Теперь 3 варианта тела - выбери, отредактируй или перегенерируй.');
        setGenStep('body');
        await autoSaveDraft({ step: 'body', bodies: data.bodies, bodyTexts: data.bodies.map((b: BodyVariant) => b.text) });
      } else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, hookTexts, selectedHookIdx, genHooks, genTopic, genAnswers, referenceTranscript, canAfford, deduct, addMsg, autoSaveDraft]);

  // Regenerate body with feedback
  const handleRegenerateBody = useCallback(async () => {
    if (!selectedStyle || !feedbackText.trim()) return;
    const cost = getTokenCost('sw_body');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    addMsg('user', `Что не так: ${feedbackText}`);
    setGenLoading(true);
    try {
      await deduct(cost);
      const hookText = hookTexts[selectedHookIdx] || '';
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-body', prompt: selectedStyle.prompt, topic: genTopic, answers: genAnswers, selected_hook: hookText, structure_analysis: selectedStyle.structureAnalysis, reference_transcript: referenceTranscript || undefined, feedback: feedbackText, previous_bodies: genBodies }) });
      const data = await res.json();
      if (data.success && data.bodies?.length) {
        setGenBodies(data.bodies);
        setBodyTexts(data.bodies.map((b: BodyVariant) => b.text));
        setSelectedBodyIdx(0);
        setEditingBodyIdx(null);
        setFeedbackText('');
        addMsg('riri', 'Новые варианты тела с учётом фидбека.');
        await autoSaveDraft({ bodies: data.bodies, bodyTexts: data.bodies.map((b: BodyVariant) => b.text) });
      } else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, feedbackText, hookTexts, selectedHookIdx, genTopic, genAnswers, referenceTranscript, genBodies, canAfford, deduct, addMsg, autoSaveDraft]);

  // Body → assemble
  const handleBodyConfirm = useCallback(async () => {
    if (!selectedStyle) return;
    const bodyText = bodyTexts[selectedBodyIdx] || '';
    const hookText = hookTexts[selectedHookIdx] || '';
    const wasEdited = bodyText !== genBodies[selectedBodyIdx]?.text;
    addMsg('user', `Тело${wasEdited ? ' (отредактировано)' : ''}: ${bodyText.slice(0, 80)}...`);
    const cost = getTokenCost('sw_assemble');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assemble-script', prompt: selectedStyle.prompt, topic: genTopic, answers: genAnswers, selected_hook: hookText, selected_body: bodyText, structure_analysis: selectedStyle.structureAnalysis }) });
      const data = await res.json();
      if (data.success && data.script) {
        setGenFinalScript(data.script);
        addMsg('riri', 'Финальный сценарий готов! Можешь улучшить, добавить в Ленту или дообучить подчерк.');
        setGenStep('final');
        await autoSaveDraft({ finalScript: data.script, step: 'final' });
      } else { toast.error('Ошибка сборки'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, bodyTexts, selectedBodyIdx, hookTexts, selectedHookIdx, genBodies, genTopic, genAnswers, canAfford, deduct, addMsg, autoSaveDraft]);

  // Improve final script
  const handleImprove = useCallback(async () => {
    if (!selectedStyle || !feedbackText.trim()) return;
    const cost = getTokenCost('sw_improve');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    addMsg('user', feedbackText);
    setGenLoading(true);
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'improve-script', prompt: selectedStyle.prompt, script_text: genFinalScript, feedback: feedbackText, structure_analysis: selectedStyle.structureAnalysis }) });
      const data = await res.json();
      if (data.success && data.script) {
        setGenFinalScript(data.script);
        setFeedbackText('');
        addMsg('riri', 'Сценарий улучшен!');
        await autoSaveDraft({ finalScript: data.script });
      } else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, feedbackText, genFinalScript, canAfford, deduct, addMsg, autoSaveDraft]);

  // Retrain style
  const handleRetrain = useCallback(async () => {
    if (!selectedStyle || !currentProjectId) return;
    const cost = getTokenCost('refine_prompt');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setGenLoading(true);
    try {
      await deduct(cost);
      const parts: string[] = [];
      const hookEdited = hookTexts[selectedHookIdx] !== genHooks[selectedHookIdx]?.text;
      const bodyEdited = bodyTexts[selectedBodyIdx] !== genBodies[selectedBodyIdx]?.text;
      if (hookEdited) parts.push(`Пользователь отредактировал хук: «${hookTexts[selectedHookIdx]}»`);
      if (bodyEdited) parts.push(`Пользователь отредактировал тело.`);
      parts.push(`Финальный сценарий:\n${genFinalScript}`);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refine', prompt: selectedStyle.prompt, feedback: parts.join('\n\n'), script_text: genFinalScript, structure_analysis: selectedStyle.structureAnalysis }) });
      const data = await res.json();
      if (data.success && data.prompt) {
        await updateProjectStyle(currentProjectId, selectedStyle.id, { prompt: data.prompt, meta: data.meta });
        toast.success('Подчерк дообучен!');
        addMsg('riri', 'Подчерк обновлён на основе твоих выборов и правок.');
      } else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setGenLoading(false); }
  }, [selectedStyle, currentProjectId, hookTexts, selectedHookIdx, genHooks, bodyTexts, selectedBodyIdx, genBodies, genFinalScript, canAfford, deduct, updateProjectStyle, addMsg]);

  // ══════════════════════════════════════════════════════════════════════════
  // TRAINING HANDLERS (styles tab)
  // ══════════════════════════════════════════════════════════════════════════

  const validateReelUrl = useCallback(async (index: number, url: string) => {
    if (!url.trim()) return;
    const cost = getTokenCost('sw_validate_reel');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setReelInputs(prev => { const n = [...prev]; n[index] = { ...n[index], url, loading: true, error: null }; return n; });
    try {
      const res = await fetch('/api/reel-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!data || data.error) { setReelInputs(prev => { const n = [...prev]; n[index] = { ...n[index], loading: false, error: data?.error || 'Ошибка' }; return n; }); return; }
      await deduct(cost);
      const views = data.view_count || 0;
      const ownerUsername = data.owner?.username || data.owner_username || '';
      let vm: number | null = null;
      if (ownerUsername) { try { const ps = await getOrUpdateProfileStats(ownerUsername); vm = calculateViralMultiplier(views, ps); } catch { /* */ } }
      setReelInputs(prev => { const n = [...prev]; n[index] = { ...n[index], loading: false, views, ownerUsername, viralMultiplier: vm, error: vm !== null && vm < 10 ? `x${vm.toFixed(1)} - не залёт (нужен x10+)` : null }; return n; });
    } catch { setReelInputs(prev => { const n = [...prev]; n[index] = { ...n[index], loading: false, error: 'Ошибка' }; return n; }); }
  }, [canAfford, deduct]);

  const startTraining = useCallback(async () => {
    const cost = getTokenCost('train_style');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setTrainAnalyzing(true);
    let scripts: { transcript_text?: string; script_text?: string }[] = [];
    if (trainMode === 'reels') {
      for (let i = 0; i < reelInputs.length; i++) {
        const r = reelInputs[i];
        if (!r.url.trim() || r.views === null) continue;
        if (!r.transcriptText) {
          setReelInputs(prev => { const n = [...prev]; n[i] = { ...n[i], transcriptLoading: true }; return n; });
          try {
            const tc = getTokenCost('transcribe_video');
            if (!canAfford(tc)) continue;
            const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: r.url }) });
            const d = await res.json();
            await deduct(tc);
            setReelInputs(prev => { const n = [...prev]; n[i] = { ...n[i], transcriptLoading: false, transcriptText: d.transcript || d.text || '' }; return n; });
            scripts.push({ transcript_text: d.transcript || d.text || '' });
          } catch { setReelInputs(prev => { const n = [...prev]; n[i] = { ...n[i], transcriptLoading: false }; return n; }); }
        } else { scripts.push({ transcript_text: r.transcriptText }); }
      }
    } else {
      scripts = scriptInputs.filter(s => s.text.trim()).map(s => ({ transcript_text: s.text, script_text: s.text }));
    }
    if (scripts.length < 2) { toast.error('Нужно минимум 2 примера'); setTrainAnalyzing(false); return; }
    const lengths = scripts.map(s => (s.transcript_text || '').split(/\s+/).length);
    const ratio = Math.max(...lengths) / Math.max(Math.min(...lengths), 1);
    if (ratio > 2 && !preferredFormat) { setTrainAnalyzing(false); setTrainScreen('format-select'); return; }
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze-structure', scripts, training_mode: trainMode, preferred_format: preferredFormat }) });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || 'Ошибка'); setTrainAnalyzing(false); return; }
      setDraftPrompt(data.prompt); setDraftMeta(data.meta || {}); setDraftStructure(data.structure_analysis || null);
      if (data.clarifying_questions?.length) { setClarifyQuestions(data.clarifying_questions); setClarifyAnswers({}); setTrainAnalyzing(false); setTrainScreen('verify'); }
      else { await saveStyle(data.prompt, data.meta, data.structure_analysis); setTrainAnalyzing(false); setTrainScreen('list'); toast.success('Подчерк создан!'); }
    } catch { toast.error('Ошибка'); setTrainAnalyzing(false); }
  }, [trainMode, reelInputs, scriptInputs, preferredFormat, canAfford, deduct]);

  const saveStyle = useCallback(async (prompt: string, meta: { rules?: string[]; doNot?: string[]; summary?: string }, sa?: ScriptStructureAnalysis | null) => {
    if (!currentProjectId) return;
    const ec = trainMode === 'reels' ? reelInputs.filter(r => r.url.trim()).length : scriptInputs.filter(s => s.text.trim()).length;
    await addProjectStyle(currentProjectId, { name: trainStyleName || 'Новый подчерк', prompt, meta, examplesCount: ec, trainingMode: trainMode, preferredFormat: preferredFormat || undefined, structureAnalysis: sa || undefined });
  }, [currentProjectId, trainMode, trainStyleName, reelInputs, scriptInputs, preferredFormat, addProjectStyle]);

  const handleTrainClarifySubmit = useCallback(async () => {
    const cost = getTokenCost('refine_prompt');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    setIsRefining(true);
    const allAnswers = Object.entries(clarifyAnswers).map(([i, a]) => `Вопрос: ${clarifyQuestions[Number(i)]}\nОтвет: ${a}`).join('\n\n');
    try {
      await deduct(cost);
      const res = await fetch('/api/scriptwriter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refine', prompt: draftPrompt, feedback: `Ответы на уточняющие вопросы:\n${allAnswers}`, structure_analysis: draftStructure }) });
      const data = await res.json();
      if (data.success) { await saveStyle(data.prompt || draftPrompt, data.meta || draftMeta, draftStructure); toast.success('Подчерк создан!'); setTrainScreen('list'); }
      else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка сети'); }
    finally { setIsRefining(false); }
  }, [clarifyAnswers, clarifyQuestions, draftPrompt, draftMeta, draftStructure, saveStyle, canAfford, deduct]);

  // Add to feed
  const handleAddToFeed = useCallback(async () => {
    if (!feedDraftId) return;
    setFeedSaving(true);
    try {
      const draft = drafts.find(d => d.id === feedDraftId);
      const coverUrl = await uploadScriptCover(draft?.title || 'Сценарий', feedDraftId);
      const ok = await addDraftToFeed(feedDraftId, feedFolder, coverUrl || undefined);
      if (ok) { toast.success('Добавлено в Ленту!'); setShowFeedModal(false); }
      else { toast.error('Ошибка'); }
    } catch { toast.error('Ошибка'); }
    finally { setFeedSaving(false); }
  }, [feedDraftId, feedFolder, drafts, addDraftToFeed]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  if (!currentProject) {
    return <div className="flex-1 flex items-center justify-center p-8"><p className="text-slate-400 text-sm">Выберите проект</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fafafa] overflow-hidden">
      {/* ── Header + Tabs ── */}
      <div className="px-4 pt-6 pb-0 safe-top">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-glass">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-800 font-heading tracking-tight">Riri · ИИ-сценарист</h1>
            </div>
          </div>
          <div
            className="flex gap-1 p-1 mb-3 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 2px 8px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            {(['chat', 'styles', 'drafts'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 py-2 px-2 rounded-xl text-xs font-medium transition-all min-h-[36px] touch-manipulation',
                  activeTab === tab
                    ? 'text-slate-800'
                    : 'text-slate-500 hover:text-slate-700'
                )}
                style={activeTab === tab ? {
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.05)',
                  border: '1px solid rgba(255,255,255,0.7)',
                } : {}}
              >
                {tab === 'chat' ? 'Чат' : tab === 'styles' ? `Подчерки (${styles.length})` : `Черновики (${drafts.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ════════════════════ CHAT TAB ════════════════════ */}
        {activeTab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
            {/* Style selector */}
            {styles.length > 0 && (
              <div className="px-4 pb-2">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {styles.map(s => (
                      <button key={s.id} onClick={() => setSelectedStyleId(s.id)} className={cn('px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition-all border flex-shrink-0 touch-manipulation', selectedStyleId === s.id ? 'bg-slate-600 text-white border-slate-600 shadow-glass-sm' : 'bg-white/70 text-slate-500 border-slate-200 hover:border-slate-400')}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 custom-scrollbar-light">
              <div className="max-w-2xl mx-auto space-y-3 py-3">
                {messages.map(msg => msg.role === 'riri' ? <RiriBubble key={msg.id} text={msg.text} /> : <UserBubble key={msg.id} text={msg.text} />)}
                {genLoading && <TypingIndicator />}

                {/* ── Inline interactive areas ── */}

                {/* Mode select is rendered as chips above the prompt box */}

                {/* Clarify questions */}
                {genStep === 'clarify' && !genLoading && (
                  <motion.div {...msgAnim} className="space-y-3 pl-9">
                    {genQuestions.map((q, qi) => (
                      <GlassCard key={qi} className="p-3">
                        <p className="text-xs font-medium text-slate-700 mb-2">{q.question}</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {q.options.map((opt, oi) => (
                            <button key={oi} onClick={() => setGenAnswers(prev => { const n = [...prev]; n[qi] = opt; return n; })} className={cn('px-2.5 py-1.5 rounded-xl text-xs transition-all border touch-manipulation', genAnswers[qi] === opt ? 'bg-slate-600 text-white border-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400')}>
                              {opt}
                            </button>
                          ))}
                        </div>
                        <input type="text" value={!q.options.includes(genAnswers[qi] || '') ? genAnswers[qi] || '' : ''} onChange={e => setGenAnswers(prev => { const n = [...prev]; n[qi] = e.target.value; return n; })} placeholder="Свой вариант..." className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300" />
                      </GlassCard>
                    ))}
                  </motion.div>
                )}

                {/* Hooks selection */}
                {genStep === 'hooks' && !genLoading && (
                  <motion.div {...msgAnim} className="space-y-2 pl-9">
                    {genHooks.map((hook, i) => (
                      <div key={i} className={cn('rounded-2xl border p-3 transition-all cursor-pointer touch-manipulation', selectedHookIdx === i ? 'bg-slate-50 border-slate-300 shadow-glass-sm' : 'bg-white/70 border-white/50 hover:bg-white/90')} onClick={() => { setSelectedHookIdx(i); setEditingHookIdx(null); }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors', selectedHookIdx === i ? 'border-slate-600 bg-slate-600' : 'border-slate-300')}>
                              {selectedHookIdx === i && <Check className="w-3 h-3 text-white" />}
                            </div>
                            {editingHookIdx === i ? (
                              <textarea value={hookTexts[i]} onChange={e => setHookTexts(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} rows={3} className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none" autoFocus />
                            ) : (
                              <p className="text-xs text-slate-700 whitespace-pre-wrap">{hookTexts[i]}</p>
                            )}
                          </div>
                          <button onClick={e => { e.stopPropagation(); setEditingHookIdx(editingHookIdx === i ? null : i); setSelectedHookIdx(i); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 ml-7">{hook.approach}</p>
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-400 mt-2 pl-7">Напиши в чат, что не так - перегенерирую с учётом фидбека</p>
                  </motion.div>
                )}

                {/* Body selection */}
                {genStep === 'body' && !genLoading && (
                  <motion.div {...msgAnim} className="space-y-2 pl-9">
                    <div className="px-3 py-2 rounded-xl bg-slate-100/60 border border-slate-200/50 mb-2">
                      <p className="text-[10px] text-slate-400 mb-0.5">Хук:</p>
                      <p className="text-xs text-slate-600 line-clamp-2">{hookTexts[selectedHookIdx]}</p>
                    </div>
                    {genBodies.map((body, i) => (
                      <div key={i} className={cn('rounded-2xl border p-3 transition-all cursor-pointer touch-manipulation', selectedBodyIdx === i ? 'bg-slate-50 border-slate-300 shadow-glass-sm' : 'bg-white/70 border-white/50 hover:bg-white/90')} onClick={() => { setSelectedBodyIdx(i); setEditingBodyIdx(null); }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors', selectedBodyIdx === i ? 'border-slate-600 bg-slate-600' : 'border-slate-300')}>
                              {selectedBodyIdx === i && <Check className="w-3 h-3 text-white" />}
                            </div>
                            {editingBodyIdx === i ? (
                              <textarea value={bodyTexts[i]} onChange={e => setBodyTexts(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} rows={5} className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none" autoFocus />
                            ) : (
                              <p className="text-xs text-slate-700 whitespace-pre-wrap line-clamp-5">{bodyTexts[i]}</p>
                            )}
                          </div>
                          <button onClick={e => { e.stopPropagation(); setEditingBodyIdx(editingBodyIdx === i ? null : i); setSelectedBodyIdx(i); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 ml-7">{body.approach}</p>
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-400 mt-2 pl-7">Напиши в чат, что не так - перегенерирую</p>
                  </motion.div>
                )}

                {/* Final script */}
                {genStep === 'final' && !genLoading && genFinalScript && (
                  <motion.div {...msgAnim} className="space-y-3 pl-9">
                    <GlassCard className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-medium text-slate-500">Финальный сценарий</p>
                        <div className="flex gap-1.5">
                          <span className="text-[10px] text-slate-400">{estimateDuration(genFinalScript)}</span>
                          <button onClick={() => { navigator.clipboard.writeText(genFinalScript); toast.success('Скопировано'); }} className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-500 hover:bg-slate-200 transition-all">Копировать</button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{genFinalScript}</p>
                    </GlassCard>
                    {/* Action buttons rendered as chips above prompt */}
                  </motion.div>
                )}

                {/* Retrain info */}
                {genStep === 'retrain' && !genLoading && (
                  <motion.div {...msgAnim} className="pl-9">
                    <GlassCard className="p-3">
                      <p className="text-xs font-medium text-slate-600 mb-2">Что будет учтено при дообучении:</p>
                      <div className="space-y-1.5">
                        {hookTexts[selectedHookIdx] !== genHooks[selectedHookIdx]?.text && <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /><p className="text-[11px] text-slate-600">Правки хука</p></div>}
                        {bodyTexts[selectedBodyIdx] !== genBodies[selectedBodyIdx]?.text && <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /><p className="text-[11px] text-slate-600">Правки тела</p></div>}
                        <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /><p className="text-[11px] text-slate-600">Выборы и финальный сценарий</p></div>
                      </div>
                    </GlassCard>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* ── ChatGPT-style prompt box ── */}
            <div className="px-4 pb-4 pt-2 safe-bottom">
              <div className="max-w-2xl mx-auto">
                {/* Suggestion chips above the prompt */}
                <AnimatePresence mode="wait">
                  {genStep === 'mode-select' && !genLoading && styles.length > 0 && (
                    <motion.div key="mode-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex flex-wrap gap-2 mb-3">
                      <button onClick={() => handleModeSelect('topic')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-700 hover:text-slate-900 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><Type className="w-3.5 h-3.5 text-slate-500" /> По теме <TokenBadge tokens={getTokenCost('sw_clarify')} size="sm" /></button>
                      <button onClick={() => handleModeSelect('reference')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-700 hover:text-slate-900 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><LinkIcon className="w-3.5 h-3.5 text-slate-500" /> По референсу <TokenBadge tokens={getTokenCost('transcribe_video') + getTokenCost('sw_clarify')} size="sm" /></button>
                      <button onClick={() => handleModeSelect('quick')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-700 hover:text-slate-900 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><Zap className="w-3.5 h-3.5 text-amber-500" /> Быстрая <TokenBadge tokens={getTokenCost('sw_quick')} size="sm" /></button>
                    </motion.div>
                  )}
                  {genStep === 'clarify' && !genLoading && (
                    <motion.div key="clarify-chip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex gap-2 mb-3">
                      <CostBtn onClick={handleClarifyDone} disabled={genAnswers.some(a => !a?.trim())} cost={getTokenCost('sw_hooks')} className="text-xs">Подтвердить и далее <ChevronRight className="w-3.5 h-3.5" /></CostBtn>
                    </motion.div>
                  )}
                  {genStep === 'hooks' && !genLoading && (
                    <motion.div key="hooks-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex gap-2 mb-3">
                      <CostBtn onClick={handleHookConfirm} cost={getTokenCost('sw_body')} className="text-xs">Далее: тело <ChevronRight className="w-3.5 h-3.5" /></CostBtn>
                    </motion.div>
                  )}
                  {genStep === 'body' && !genLoading && (
                    <motion.div key="body-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex gap-2 mb-3">
                      <CostBtn onClick={handleBodyConfirm} cost={getTokenCost('sw_assemble')} className="text-xs">Собрать сценарий <ChevronRight className="w-3.5 h-3.5" /></CostBtn>
                    </motion.div>
                  )}
                  {genStep === 'final' && !genLoading && (
                    <motion.div key="final-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex flex-wrap gap-2 mb-3">
                      <button onClick={() => { if (currentDraftIdRef.current) { setFeedDraftId(currentDraftIdRef.current); setFeedFolder(null); setShowFeedModal(true); } }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-700 hover:text-slate-900 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><LayoutGrid className="w-3.5 h-3.5 text-slate-500" /> В Ленту</button>
                      <button onClick={() => setGenStep('retrain')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-700 hover:text-slate-900 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><Sparkles className="w-3.5 h-3.5 text-violet-500" /> Дообучить <TokenBadge tokens={getTokenCost('refine_prompt')} size="sm" /></button>
                      <button onClick={resetChat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-500 hover:text-slate-700 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}><Plus className="w-3.5 h-3.5" /> Новый</button>
                    </motion.div>
                  )}
                  {genStep === 'retrain' && !genLoading && (
                    <motion.div key="retrain-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={iosSpringSoft} className="flex gap-2 mb-3">
                      <CostBtn onClick={handleRetrain} cost={getTokenCost('refine_prompt')} className="text-xs"><Sparkles className="w-3.5 h-3.5" /> Да, дообучить</CostBtn>
                      <button onClick={() => { setGenStep('final'); toast.info('Подчерк не изменён'); }} className="px-3.5 py-2 rounded-2xl text-xs font-medium text-slate-500 hover:text-slate-700 transition-all touch-manipulation active:scale-95" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}>Нет, не стоит</button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Prompt box */}
                {!(['idle', 'transcribing'] as GenStep[]).includes(genStep) && (
                  <div
                    className="rounded-3xl transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.88)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                      border: '1px solid rgba(255,255,255,0.7)',
                      boxShadow: '0 4px 24px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.95)',
                    }}
                  >
                    <textarea
                      ref={promptRef}
                      value={getPromptValue()}
                      onChange={e => setPromptValue(e.target.value)}
                      placeholder={getPlaceholder()}
                      rows={1}
                      className="w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none min-h-[50px] leading-relaxed"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && getPromptValue().trim()) { e.preventDefault(); handlePromptSend(); } }}
                      disabled={genLoading}
                    />
                    <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                      {selectedStyle && (
                        <span
                          className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full truncate max-w-[120px]"
                          style={{ background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.07)' }}
                        >
                          {selectedStyle.name}
                        </span>
                      )}
                      {promptSendCost() > 0 && getPromptValue().trim() && (
                        <TokenBadge tokens={promptSendCost()} size="sm" className="opacity-60" />
                      )}
                      <div className="ml-auto">
                        <button
                          onClick={handlePromptSend}
                          disabled={!getPromptValue().trim() || genLoading}
                          className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                          style={{
                            background: getPromptValue().trim() && !genLoading
                              ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)'
                              : 'rgba(15,23,42,0.12)',
                            boxShadow: getPromptValue().trim() && !genLoading
                              ? '0 4px 12px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.1)'
                              : 'none',
                          }}
                        >
                          {genLoading
                            ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            : <Send className="w-4 h-4 text-white" strokeWidth={2} />
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {genStep === 'transcribing' && (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Транскрибирую видео...</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════════════ STYLES TAB ════════════════════ */}
        {activeTab === 'styles' && (
          <motion.div key="styles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto px-4 custom-scrollbar-light">
            <div className="max-w-lg mx-auto py-4 safe-bottom">
              {trainScreen !== 'list' && (
                <button onClick={() => setTrainScreen(trainScreen === 'verify' ? 'list' : trainScreen === 'format-select' ? (trainMode === 'reels' ? 'reels' : 'scripts') : trainScreen === 'reels' || trainScreen === 'scripts' ? 'mode-select' : 'list')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mb-4 transition-colors min-h-[44px] touch-manipulation"><ArrowLeft className="w-3.5 h-3.5" /> Назад</button>
              )}

              {trainScreen === 'list' && (
                <div className="space-y-2.5">
                  {styles.map(style => {
                    const isExpanded = expandedStyleId === style.id;
                    const sa = style.structureAnalysis;
                    return (
                      <GlassCard key={style.id} className="p-3.5">
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex-1 min-w-0"><h3 className="font-semibold text-slate-800 text-sm truncate">{style.name}</h3>{style.meta?.summary && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{style.meta.summary}</p>}</div>
                          <div className="flex gap-1 ml-2">{style.trainingMode && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-slate-100 text-slate-500">{style.trainingMode === 'reels' ? 'Рилсы' : 'Тексты'}</span>}</div>
                        </div>
                        {sa && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {sa.hookDuration && <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-50 text-slate-500 border border-slate-100">Хук: {sa.hookDuration}</span>}
                            {sa.ctaType && <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-50 text-slate-500 border border-slate-100">CTA: {sa.ctaType}</span>}
                            {sa.bodyPhases?.length ? <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-50 text-slate-500 border border-slate-100">{sa.bodyPhases.length} фаз</span> : null}
                          </div>
                        )}

                        {/* Expand/collapse details */}
                        <button onClick={() => setExpandedStyleId(isExpanded ? null : style.id)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors mb-2 touch-manipulation">
                          <Eye className="w-3 h-3" />
                          {isExpanded ? 'Скрыть детали' : 'Посмотреть под капот'}
                          <ChevronDown className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-180')} />
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mb-3">
                              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                                {/* Structure */}
                                {sa && (
                                  <div className="mt-2">
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Структура</p>
                                    {sa.hookDescription && <div className="text-[11px] text-slate-600 mb-1"><span className="text-slate-400">Хук:</span> {sa.hookDescription}{sa.hookDuration ? ` (${sa.hookDuration})` : ''}</div>}
                                    {sa.bodyPhases?.length ? <div className="text-[11px] text-slate-600 mb-1"><span className="text-slate-400">Фазы тела:</span> {sa.bodyPhases.join(' → ')}</div> : null}
                                    {sa.ctaType && <div className="text-[11px] text-slate-600 mb-1"><span className="text-slate-400">CTA:</span> {sa.ctaType}</div>}
                                    {sa.avgLengthSeconds ? <div className="text-[11px] text-slate-600 mb-1"><span className="text-slate-400">Длительность:</span> ~{sa.avgLengthSeconds} сек</div> : null}
                                    {sa.specialFeatures?.length ? <div className="text-[11px] text-slate-600"><span className="text-slate-400">Особенности:</span> {sa.specialFeatures.join(', ')}</div> : null}
                                  </div>
                                )}
                                {/* Rules */}
                                {style.meta?.rules?.length ? (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Правила</p>
                                    <ul className="space-y-0.5">{style.meta.rules.map((r, i) => <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-emerald-500 flex-shrink-0">+</span>{r}</li>)}</ul>
                                  </div>
                                ) : null}
                                {/* Do not */}
                                {style.meta?.doNot?.length ? (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Избегать</p>
                                    <ul className="space-y-0.5">{style.meta.doNot.map((r, i) => <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-red-400 flex-shrink-0">−</span>{r}</li>)}</ul>
                                  </div>
                                ) : null}
                                {/* Prompt (raw) */}
                                {style.prompt && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Промт модели</p>
                                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 max-h-32 overflow-y-auto">
                                      <p className="text-[10px] text-slate-500 whitespace-pre-wrap leading-relaxed font-mono">{style.prompt}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <button onClick={() => { setSelectedStyleId(style.id); setActiveTab('chat'); resetChat(); }} className="w-full py-2 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium active:scale-[0.97] transition-all shadow-glass min-h-[40px] flex items-center justify-center gap-1.5 touch-manipulation">
                          <MessageSquare className="w-3.5 h-3.5" /> Начать чат
                        </button>
                      </GlassCard>
                    );
                  })}
                  <button onClick={() => { setTrainStyleName(''); setTrainMode('reels'); setPreferredFormat(null); setReelInputs(Array.from({ length: 5 }, () => ({ url: '', loading: false, views: null, ownerUsername: null, viralMultiplier: null, error: null, transcriptText: null, transcriptLoading: false }))); setScriptInputs(Array.from({ length: 5 }, () => ({ text: '' }))); setTrainScreen('mode-select'); }} className="w-full p-3 rounded-card-xl border-2 border-dashed border-slate-200/60 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-all flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation">
                    <Plus className="w-4 h-4" /> <span className="text-xs font-medium">Создать подчерк</span>
                  </button>
                </div>
              )}

              {trainScreen === 'mode-select' && (
                <div className="space-y-3">
                  <div className="mb-4"><label className="text-xs font-medium text-slate-600 mb-1.5 block">Название подчерка</label><input type="text" value={trainStyleName} onChange={e => setTrainStyleName(e.target.value)} placeholder="Мотивация 30с" className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400" /></div>
                  <button onClick={() => { setTrainMode('reels'); setTrainScreen('reels'); }} className="w-full p-3.5 rounded-card-xl bg-white/72 backdrop-blur-glass-xl border border-white/55 shadow-glass hover:bg-white/85 transition-all text-left group touch-manipulation flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center"><LinkIcon className="w-4 h-4 text-slate-600" /></div>
                    <div className="flex-1"><h3 className="font-semibold text-sm text-slate-800">5 залётных рилсов</h3><p className="text-[11px] text-slate-500">Ссылки на Instagram рилсы</p></div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                  <button onClick={() => { setTrainMode('scripts'); setTrainScreen('scripts'); }} className="w-full p-3.5 rounded-card-xl bg-white/72 backdrop-blur-glass-xl border border-white/55 shadow-glass hover:bg-white/85 transition-all text-left group touch-manipulation flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center"><Type className="w-4 h-4 text-slate-600" /></div>
                    <div className="flex-1"><h3 className="font-semibold text-sm text-slate-800">5 своих сценариев</h3><p className="text-[11px] text-slate-500">Тексты ваших сценариев</p></div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              )}

              {trainScreen === 'reels' && (
                <div>
                  <h2 className="text-base font-bold text-slate-800 mb-1 font-heading">5 залётных рилсов</h2>
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-100 mb-4 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><p className="text-[11px] text-amber-800">Все видео должны быть <strong>залётами (x10+)</strong> с одной сутью.</p></div>
                  <div className="space-y-2.5 mb-4">
                    {reelInputs.map((r, i) => (
                      <div key={i}>
                        <div className="flex gap-2">
                          <input type="url" value={r.url} onChange={e => { const url = e.target.value; setReelInputs(prev => { const n = [...prev]; n[i] = { ...n[i], url }; return n; }); }} onBlur={() => r.url.trim() && !r.views && validateReelUrl(i, r.url)} placeholder={`Ссылка ${i + 1}`} className={cn('flex-1 px-3 py-2 rounded-xl bg-white border text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300', r.error ? 'border-red-200' : 'border-slate-200')} />
                          {r.loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
                          {r.viralMultiplier != null && !r.error && <span className="px-1.5 py-1 rounded-lg text-[11px] font-bold self-center" style={{ color: getViralMultiplierColor(r.viralMultiplier), backgroundColor: `${getViralMultiplierColor(r.viralMultiplier)}15` }}>x{r.viralMultiplier.toFixed(0)}</span>}
                        </div>
                        {r.error && <p className="text-[10px] text-red-500 mt-0.5 ml-1">{r.error}</p>}
                        {r.transcriptLoading && <p className="text-[10px] text-slate-400 mt-0.5 ml-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Транскрибация...</p>}
                      </div>
                    ))}
                  </div>
                  <CostBtn onClick={startTraining} disabled={reelInputs.filter(r => r.url.trim() && r.views != null && !r.error).length < 2 || trainAnalyzing} loading={trainAnalyzing} cost={getTokenCost('train_style')} className="w-full"><Sparkles className="w-4 h-4" /> Обучить</CostBtn>
                </div>
              )}

              {trainScreen === 'scripts' && (
                <div>
                  <h2 className="text-base font-bold text-slate-800 mb-1 font-heading">5 своих сценариев</h2>
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-100 mb-4 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" /><p className="text-[11px] text-amber-800">ИИ будет опираться <strong>только на ваш опыт</strong>.</p></div>
                  <div className="space-y-3 mb-4">
                    {scriptInputs.map((s, i) => (
                      <div key={i}><label className="text-[10px] font-medium text-slate-500 mb-1 block">Сценарий {i + 1}</label><textarea value={s.text} onChange={e => { const text = e.target.value; setScriptInputs(prev => { const n = [...prev]; n[i] = { text }; return n; }); }} placeholder="Текст сценария..." rows={3} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none" /></div>
                    ))}
                  </div>
                  <CostBtn onClick={startTraining} disabled={scriptInputs.filter(s => s.text.trim()).length < 2 || trainAnalyzing} loading={trainAnalyzing} cost={getTokenCost('train_style')} className="w-full"><Sparkles className="w-4 h-4" /> Обучить</CostBtn>
                </div>
              )}

              {trainScreen === 'format-select' && (
                <div className="space-y-3">
                  <h2 className="text-base font-bold text-slate-800 mb-1 font-heading">Разная длина сценариев</h2>
                  <p className="text-xs text-slate-500 mb-3">Какой формат взять за основу?</p>
                  <button onClick={() => { setPreferredFormat('short'); setTrainScreen(trainMode === 'reels' ? 'reels' : 'scripts'); setTimeout(startTraining, 100); }} className="w-full p-3.5 rounded-card-xl bg-white/72 backdrop-blur-glass-xl border border-white/55 shadow-glass hover:bg-white/85 transition-all text-left touch-manipulation"><h3 className="font-semibold text-sm text-slate-800">Короткий</h3><p className="text-[11px] text-slate-500">Ориентир на короткие сценарии</p></button>
                  <button onClick={() => { setPreferredFormat('long'); setTrainScreen(trainMode === 'reels' ? 'reels' : 'scripts'); setTimeout(startTraining, 100); }} className="w-full p-3.5 rounded-card-xl bg-white/72 backdrop-blur-glass-xl border border-white/55 shadow-glass hover:bg-white/85 transition-all text-left touch-manipulation"><h3 className="font-semibold text-sm text-slate-800">Длинный</h3><p className="text-[11px] text-slate-500">Ориентир на длинные сценарии</p></button>
                </div>
              )}

              {trainScreen === 'verify' && (
                <div className="space-y-3">
                  <h2 className="text-base font-bold text-slate-800 mb-1 font-heading">Уточнения</h2>
                  {clarifyQuestions.map((q, i) => (
                    <GlassCard key={i} className="p-3"><p className="text-xs text-slate-700 mb-2">{q}</p><input type="text" value={clarifyAnswers[i] || ''} onChange={e => setClarifyAnswers(prev => ({ ...prev, [i]: e.target.value }))} placeholder="Ваш ответ" className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300" /></GlassCard>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={async () => { await saveStyle(draftPrompt, draftMeta, draftStructure); toast.success('Создан'); setTrainScreen('list'); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 min-h-[40px]">Пропустить</button>
                    <CostBtn onClick={handleTrainClarifySubmit} disabled={isRefining} loading={isRefining} cost={getTokenCost('refine_prompt')} className="flex-1 text-xs"><Check className="w-3.5 h-3.5" /> Подтвердить</CostBtn>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ════════════════════ DRAFTS TAB ════════════════════ */}
        {activeTab === 'drafts' && (
          <motion.div key="drafts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto px-4 custom-scrollbar-light">
            <div className="max-w-lg mx-auto py-4 safe-bottom">
              {draftsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-12"><FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Черновиков пока нет</p></div>
              ) : (
                <div className="space-y-2">
                  {drafts.map(draft => (
                    <GlassCard key={draft.id} className="p-3.5">
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-800 text-sm truncate">{draft.title}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {styles.find(s => s.id === draft.style_id)?.name && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{styles.find(s => s.id === draft.style_id)?.name}</span>}
                            <span className="text-[9px] text-slate-400">{new Date(draft.updated_at).toLocaleDateString('ru-RU')}</span>
                            {draft.status === 'done' && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-medium">В Ленте</span>}
                          </div>
                        </div>
                      </div>
                      {draft.script_text && <p className="text-[11px] text-slate-500 line-clamp-2 mb-2.5">{draft.script_text}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => resumeDraft(draft)} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-medium hover:bg-slate-200 transition-all flex items-center justify-center gap-1 min-h-[38px] touch-manipulation"><MessageSquare className="w-3 h-3" /> Продолжить</button>
                        {draft.status !== 'done' && <button onClick={() => { setFeedDraftId(draft.id); setFeedFolder(null); setShowFeedModal(true); }} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-medium hover:bg-slate-50 transition-all flex items-center justify-center gap-1 min-h-[38px] touch-manipulation"><LayoutGrid className="w-3 h-3" /> В Ленту</button>}
                        <button onClick={async () => { if (confirm('Удалить?')) { await deleteDraft(draft.id); toast.success('Удалён'); } }} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all touch-manipulation"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add-to-feed modal ── */}
      {showFeedModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowFeedModal(false)}>
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={iosSpringSoft} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 mb-1">В Ленту</h3>
            <p className="text-[11px] text-slate-500 mb-3">Выберите папку</p>
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
              {(currentProject?.folders || []).map(f => (
                <button key={f.id} onClick={() => setFeedFolder(f.id)} className={cn('w-full px-3 py-2 rounded-xl text-left text-xs transition-all flex items-center gap-2 min-h-[40px] touch-manipulation border', feedFolder === f.id ? 'bg-slate-100 border-slate-300' : 'bg-slate-50 border-transparent hover:bg-slate-100')}>
                  <FolderOpen className="w-3.5 h-3.5" style={{ color: f.color }} /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFeedModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 min-h-[40px]">Отмена</button>
              <button onClick={handleAddToFeed} disabled={feedSaving} className="flex-1 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium transition-all disabled:opacity-50 min-h-[40px] flex items-center justify-center gap-1.5">
                {feedSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Добавить
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
