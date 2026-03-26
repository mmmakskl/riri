import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const iosSpringSoft = { type: 'spring' as const, stiffness: 340, damping: 32 };

const msgAnim = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: iosSpringSoft,
};

// ─── Riri Orb ─────────────────────────────────────────────────────────────────

function RiriOrb({ size = 48, floating = false, className }: { size?: number; floating?: boolean; className?: string }) {
  const s = size;
  return (
    <motion.div
      className={`rounded-full flex-shrink-0 select-none ${className || ''}`}
      animate={floating ? { y: [-6, 6, -6], scale: [1, 1.016, 1] } : undefined}
      transition={floating ? { duration: 5.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{
        width: s,
        height: s,
        background: `radial-gradient(circle at 36% 28%, #ffffff 0%, #eceef4 20%, #d0d4e2 44%, #a8aec0 68%, #787e92 88%, #5a6070 100%)`,
        boxShadow: `
          inset ${-s * 0.07}px ${-s * 0.07}px ${s * 0.18}px rgba(40,44,60,0.28),
          inset ${s * 0.07}px ${s * 0.055}px ${s * 0.16}px rgba(255,255,255,0.72),
          0 ${s * 0.1}px ${s * 0.42}px rgba(80,88,120,0.16),
          0 ${s * 0.04}px ${s * 0.1}px rgba(60,68,90,0.1)
        `,
      }}
    />
  );
}

// ─── Bubbles ──────────────────────────────────────────────────────────────────

function RiriBubble({ text }: { text: string }) {
  return (
    <motion.div {...msgAnim} className="flex gap-2.5 items-start max-w-[85%]">
      <RiriOrb size={26} className="mt-0.5 flex-shrink-0" />
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <p className="text-[15px] text-[#1a1a18] leading-[1.55] whitespace-pre-wrap">{text}</p>
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div {...msgAnim} className="flex justify-end">
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tr-[6px] max-w-[80%]"
        style={{
          background: '#1a1a18',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <p className="text-[15px] text-white/90 leading-[1.55] whitespace-pre-wrap">{text}</p>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div {...msgAnim} className="flex gap-2.5 items-start">
      <RiriOrb size={26} className="mt-0.5 flex-shrink-0" />
      <div
        className="px-4 py-3 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex gap-1.5">
          {[0, 0.22, 0.44].map((delay, i) => (
            <motion.span
              key={i}
              className="w-[5px] h-[5px] bg-slate-300 rounded-full"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.2, repeat: Infinity, delay }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Как создать проект?',
  'Как добавить видео?',
  'Что такое Лента?',
  'Где смотреть аналитику?',
  'Как пригласить команду?',
];

export function RiriChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || !user?.id) return;

    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/riri-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          message: msg,
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || data.error || 'Ой, не получилось ответить. Попробуй ещё раз!',
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Что-то пошло не так. Попробуй ещё раз!' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, user?.id, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isWelcome = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#f5f6f8' }}>

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-5 pb-4 safe-top flex-shrink-0"
        style={{ background: '#f5f6f8' }}
      >
        <RiriOrb size={34} />
        <div>
          <p className="text-[17px] font-semibold text-[#1a1a18] leading-tight">RiRi</p>
          <p className="text-[12px] text-[#1a1a18]/40">твоя подруга-ассистент</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: '#4ade80', boxShadow: '0 0 6px rgba(74,222,128,0.5)' }}
          />
          <span className="text-[12px] text-[#1a1a18]/40">онлайн</span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 custom-scrollbar-light"
      >
        <AnimatePresence>
          {isWelcome ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="flex flex-col items-center justify-center min-h-full text-center px-4 pb-8 gap-5"
            >
              <RiriOrb size={120} floating />
              <div className="space-y-1.5">
                <p className="text-[22px] font-semibold text-[#1a1a18]">Привет! Я RiRi</p>
                <p className="text-[14px] text-[#1a1a18]/45 leading-relaxed max-w-[260px]">
                  Спрашивай про приложение —<br />подскажу что где и как сделать
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-[13px] px-3.5 py-2 rounded-2xl font-medium text-[#1a1a18] transition-all touch-manipulation active:scale-95"
                    style={{
                      background: '#ffffff',
                      border: '1px solid rgba(0,0,0,0.07)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="py-4 space-y-3">
              {messages.map((msg, i) =>
                msg.role === 'user'
                  ? <UserBubble key={i} text={msg.content} />
                  : <RiriBubble key={i} text={msg.content} />
              )}
              {loading && <TypingIndicator />}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Input — как в AIScriptwriter */}
      <div className="px-4 pb-4 pt-2 safe-bottom flex-shrink-0">
        <div
          className="rounded-3xl transition-all"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спроси что-нибудь..."
            rows={1}
            disabled={loading}
            className="w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] text-[#1a1a18] placeholder:text-[#1a1a18]/35 focus:outline-none min-h-[50px] max-h-32 leading-relaxed"
          />
          <div className="flex items-center px-3 pb-3 pt-1">
            <span className="text-[11px] text-[#1a1a18]/25">Gemini 2.5 Flash</span>
            <div className="ml-auto">
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                style={{
                  background: input.trim() && !loading
                    ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)'
                    : 'rgba(15,23,42,0.12)',
                  boxShadow: input.trim() && !loading
                    ? '0 4px 12px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : 'none',
                }}
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  : <Send className="w-4 h-4 text-white" strokeWidth={2} />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
