import { useState } from 'react';
import { ArrowRight, ArrowLeft, Sparkles, TrendingUp, Video, Zap, Send, Loader2, Mail } from 'lucide-react';
import { cn } from '../utils/cn';
import { useAuth } from '../hooks/useAuth';
import ScrollMorphHero from './ui/ScrollMorphHero';
import { GlassCardStatic } from './ui/GlassCard';

export function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  const [showHero, setShowHero] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const {
    sendCode, verifyCode, sendingCode, verifying, error, codeSent, resetAuth,
    authMethod, setAuthMethod,
  } = useAuth();

  const identifier = authMethod === 'email' ? email : username;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendCode(identifier);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyCode(code);
  };

  const handleBack = () => {
    resetAuth();
    setShowAuth(false);
    setUsername('');
    setEmail('');
    setCode('');
  };

  // switchMethod сохранён для возможного включения Email в будущем
  const _switchMethod = (method: 'telegram' | 'email') => {
    if (method === authMethod) return;
    resetAuth();
    setCode('');
    setAuthMethod(method);
  };
  void _switchMethod; // предотвращаем unused warning

  if (showHero && !showAuth) {
    return (
      <div className="relative w-full h-screen">
        <ScrollMorphHero
          title="Найдите вирусный контент"
          subtitle="Прокрутите вниз"
          activeTitle="Riri AI"
          activeSubtitle="Платформа для поиска трендового контента из Instagram. Анализируйте, сохраняйте и создавайте свой контент."
        />
        <button
          onClick={() => setShowHero(false)}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-card-xl bg-slate-600 text-white font-medium shadow-glass hover:shadow-glass-hover transition-all flex items-center gap-2 group"
        >
          Начать
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-base">
      <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-bl from-slate-200/30 via-slate-100/15 to-transparent rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-tr from-slate-100/20 via-slate-50/10 to-transparent rounded-full blur-[120px]" />

      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
      }} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-16 safe-top safe-bottom safe-left safe-right">
        {!showAuth ? (
          <>
            <div className="mb-8 px-5 py-2 rounded-pill bg-glass-white/80 backdrop-blur-glass shadow-glass-sm border border-white/[0.4]">
              <span className="text-sm text-slate-600 font-semibold tracking-wide">
                AI-поиск контента
              </span>
            </div>

            <h1 className="text-center mb-5">
              <span className="block text-4xl md:text-5xl lg:text-7xl font-bold text-slate-800">Найди</span>
              <span className="block text-4xl md:text-5xl lg:text-7xl font-light text-slate-600 tracking-tight">свой контент</span>
            </h1>

            <p className="text-center text-slate-600 text-base md:text-lg max-w-lg mb-2">
              Я <span className="text-slate-800 font-semibold">Riri AI</span> - твой персональный ассистент, который сделает твои ролики вирусными
            </p>
            <p className="text-center text-slate-500 text-sm max-w-md mb-12">
              Нахожу трендовые видео, пишу вирусные сценарии, объединяю твою команду
            </p>

            <button
              onClick={() => setShowAuth(true)}
              className={cn(
                "group px-8 py-4 rounded-card-xl mb-14",
                "bg-slate-600 hover:bg-slate-700",
                "active:scale-95",
                "text-white font-semibold text-base",
                "transition-all duration-300",
                "shadow-glass hover:shadow-glass-hover",
                "flex items-center gap-3",
                "min-h-[44px]",
                "touch-manipulation"
              )}
            >
              Начать работу
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="flex flex-wrap justify-center gap-6 md:gap-8">
              <Feature icon={TrendingUp} label="Трендовые видео" />
              <Feature icon={Sparkles} label="AI рекомендации" />
              <Feature icon={Video} label="1M+ рилсов" />
              <Feature icon={Zap} label="Мгновенный поиск" />
            </div>
          </>
        ) : (
          <div className="w-full max-w-md">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Назад
            </button>

            <GlassCardStatic className="p-8 md:p-10">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-card-xl overflow-hidden flex items-center justify-center mx-auto mb-5 shadow-glass bg-slate-100 p-1">
                  <img src="/riri-logo.png" alt="Riri AI" className="w-full h-full object-contain" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  Рада тебя видеть!
                </h2>
                <p className="text-sm text-slate-500">
                  Выбери способ входа
                </p>
              </div>

              {/* Auth method tabs — Email скрыт, только Telegram */}
              {/* Email метод сохранён в коде, но скрыт для пользователей */}

              <div className="space-y-5">
                {!codeSent ? (
                  <form onSubmit={handleSendCode} className="space-y-5">
                    {authMethod === 'telegram' ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Telegram username
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 outline-none transition-all bg-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 outline-none transition-all bg-white"
                        />
                      </div>
                    )}

                    {error && (
                      <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                        <p className="text-sm text-orange-600 whitespace-pre-line">{error}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={sendingCode || !identifier.trim()}
                      className={cn(
                        "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                        sendingCode || !identifier.trim()
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-slate-600 hover:bg-slate-700 text-white shadow-glass hover:shadow-glass-hover"
                      )}
                    >
                      {sendingCode ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Отправляю...
                        </>
                      ) : (
                        <>
                          {authMethod === 'email' ? <Mail className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                          Получить код
                        </>
                      )}
                    </button>

                    {authMethod === 'telegram' && (
                      <div className="p-4 rounded-xl bg-slate-100/60 border border-slate-200/60">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">Впервые?</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              Напиши{' '}
                              <a
                                href="https://t.me/ririai_bot"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium underline"
                              >
                                @ririai_bot
                              </a>
                              {' '}/start - и нажми «Получить код»
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {authMethod === 'email' && (
                      <div className="p-4 rounded-xl bg-slate-100/60 border border-slate-200/60">
                        <div className="flex items-start gap-3">
                          <Mail className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">Есть Telegram аккаунт?</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              Привяжи его в настройках после входа, чтобы данные синхронизировались
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleVerifyCode} className="space-y-5">
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-4">
                      <p className="text-sm text-emerald-700">
                        {authMethod === 'email'
                          ? `Код отправлен на ${pendingEmailDisplay()}`
                          : 'Код отправлен в Telegram!'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Введи код
                      </label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 outline-none transition-all text-center text-2xl font-mono tracking-widest bg-white"
                      />
                    </div>

                    {error && (
                      <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                        <p className="text-sm text-orange-600 whitespace-pre-line">{error}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={verifying || code.length !== 6}
                      className={cn(
                        "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                        verifying || code.length !== 6
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-slate-600 hover:bg-slate-700 text-white shadow-glass hover:shadow-glass-hover"
                      )}
                    >
                      {verifying ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Проверяю...
                        </>
                      ) : (
                        'Войти'
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => resetAuth()}
                      className="w-full text-sm text-slate-500 hover:text-slate-700"
                    >
                      {authMethod === 'email' ? 'Другой email' : 'Другой username'}
                    </button>
                  </form>
                )}
              </div>
            </GlassCardStatic>
          </div>
        )}
      </div>
    </div>
  );

  function pendingEmailDisplay() {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    return local.slice(0, 2) + '***@' + domain;
  }
}

function Feature({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-600">
      <div className="p-2.5 rounded-pill bg-glass-white/80 backdrop-blur-glass shadow-glass-sm border border-white/[0.4]">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
