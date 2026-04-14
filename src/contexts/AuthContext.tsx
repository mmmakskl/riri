import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../utils/supabase';

export interface User {
  id: string;
  telegram_username?: string;
  email?: string;
  auth_method: 'telegram' | 'email';
  first_name?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  sendingCode: boolean;
  verifying: boolean;
  error: string | null;
  codeSent: boolean;
  authMethod: 'telegram' | 'email';
  setAuthMethod: (method: 'telegram' | 'email') => void;
  sendCode: (identifier: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  resetAuth: () => void;
  logout: () => void;
  getUserId: () => string | null;
  linkTelegram: (username: string) => Promise<boolean>;
  linkEmail: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'riri-session';
const BOT_TOKEN = '8183756206:AAGo-jl6BMBfAzejVt1MNVUD5TQPegxQOhc';

const saveSession = (token: string) => {
  setCookie(SESSION_KEY, token, 30);
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch (e) {
    console.log('[Auth] localStorage not available');
  }
};

const getSession = (): string | null => {
  let token = getCookie(SESSION_KEY);
  if (token) return token;

  try {
    token = localStorage.getItem(SESSION_KEY);
    if (token) {
      setCookie(SESSION_KEY, token, 30);
      return token;
    }
  } catch (e) {
    console.log('[Auth] localStorage not available');
  }

  return null;
};

const clearSession = () => {
  deleteCookie(SESSION_KEY);
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.log('[Auth] localStorage not available');
  }
};

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// FALLBACK FOR HTTP (non-secure context) where crypto.randomUUID might be missing
const generateSessionToken = () => {
  try {
    // Check if crypto exists AND has randomUUID (it's often missing in HTTP)
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID() + '-' + Date.now();
    }
  } catch (e) {
    console.warn('[Auth] crypto.randomUUID failed, using fallback');
  }
  // Universal fallback that works in any browser/context
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4() + '-' + Date.now();
};

const setCookie = (name: string, value: string, days: number = 30) => {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const secureFlag = isLocalhost ? '' : '; Secure';
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax${secureFlag}`;
};

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

// ---------------------------------------------------------------------------
// Resolve user_id from Telegram username or email+supabase_uid.
// Checks user_links to see if email is linked to a TG account.
// ---------------------------------------------------------------------------
async function resolveUserId(opts: {
  telegram_username?: string;
  email?: string;
  supabase_uid?: string;
}): Promise<{ userId: string; telegramUsername?: string; email?: string }> {
  if (opts.telegram_username) {
    return {
      userId: `tg-${opts.telegram_username}`,
      telegramUsername: opts.telegram_username,
    };
  }

  if (opts.email) {
    const { data: link } = await supabase
      .from('user_links')
      .select('telegram_username')
      .eq('email', opts.email)
      .maybeSingle();

    if (link?.telegram_username) {
      return {
        userId: `tg-${link.telegram_username}`,
        telegramUsername: link.telegram_username,
        email: opts.email,
      };
    }

    return {
      userId: `email-${opts.supabase_uid || opts.email}`,
      email: opts.email,
    };
  }

  return { userId: 'anonymous' };
}

// ---------------------------------------------------------------------------
// Ensure user_links entry exists for the identity
// ---------------------------------------------------------------------------
async function ensureUserLink(opts: {
  telegram_username?: string;
  email?: string;
  supabase_uid?: string;
}) {
  if (opts.telegram_username) {
    await supabase.from('user_links').upsert(
      { telegram_username: opts.telegram_username, updated_at: new Date().toISOString() },
      { onConflict: 'telegram_username' }
    );
  }
  if (opts.email) {
    const payload: Record<string, unknown> = {
      email: opts.email,
      updated_at: new Date().toISOString(),
    };
    if (opts.supabase_uid) payload.supabase_uid = opts.supabase_uid;
    await supabase.from('user_links').upsert(payload, { onConflict: 'email' });
  }
}

// ---------------------------------------------------------------------------
// Ensure a row in the users table (for token_balance etc.)
// ---------------------------------------------------------------------------
async function ensureUsersRow(userId: string, tgUsername?: string, email?: string) {
  const pk = tgUsername || `email:${email}`;
  const { data: existing } = await supabase
    .from('users')
    .select('telegram_username')
    .eq('telegram_username', pk)
    .maybeSingle();
  const isNew = !existing;
  await supabase.from('users').upsert(
    {
      telegram_username: pk,
      user_id: userId,
      email: email || null,
      last_login: new Date().toISOString(),
      ...(isNew ? { token_balance: 20 } : {}),
    },
    { onConflict: 'telegram_username' }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [authMethod, setAuthMethod] = useState<'telegram' | 'email'>('telegram');
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const SESSION_CHECK_TIMEOUT_MS = 6000;

  // ------- Session check on load -------
  useEffect(() => {
    const checkSession = async () => {
      const sessionToken = getSession();
      if (!sessionToken) { setLoading(false); return; }

      try {
        const sessionPromise = supabase
          .from('sessions')
          .select('token, telegram_username, email, auth_method, user_id, expires_at, created_at')
          .eq('token', sessionToken)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session check timeout')), SESSION_CHECK_TIMEOUT_MS)
        );

        const { data, error: sessionError } = await Promise.race([sessionPromise, timeoutPromise]);

        if (sessionError || !data) {
          clearSession();
          setLoading(false);
          return;
        }

        // Update last_active (fire-and-forget)
        supabase.from('sessions').update({ last_active: new Date().toISOString() }).eq('token', sessionToken).then(() => {});

        const method = (data.auth_method as 'telegram' | 'email') || 'telegram';

        if (method === 'email' && data.email) {
          const resolved = await resolveUserId({ email: data.email });
          setUser({
            id: data.user_id || resolved.userId,
            telegram_username: resolved.telegramUsername,
            email: data.email,
            auth_method: 'email',
            created_at: data.created_at,
          });
        } else {
          setUser({
            id: data.user_id || `tg-${data.telegram_username}`,
            telegram_username: data.telegram_username,
            email: data.email || undefined,
            auth_method: 'telegram',
            created_at: data.created_at,
          });
        }
      } catch (err) {
        console.error('[Auth] Session check error:', err);
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  // ------- TELEGRAM: send code -------
  const sendTelegramCode = useCallback(async (username: string): Promise<boolean> => {
    const cleanUsername = username.replace('@', '').trim().toLowerCase();
    if (!cleanUsername) {
      setError('Напиши свой username в поле выше');
      return false;
    }

    try {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: dbError } = await supabase
        .from('auth_codes')
        .insert({ 
          telegram_username: cleanUsername, 
          code,
          expires_at: expiresAt
        });

      if (dbError) {
        console.error('[Auth] sendTelegramCode DB error:', dbError);
        setError('Что-то пошло не так. Попробуй ещё раз');
        return false;
      }

      // 1) Look up chat_id from permanent storage
      let chatId: number | null = null;

      const { data: chatRow } = await supabase
        .from('telegram_chats')
        .select('chat_id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (chatRow?.chat_id) {
        chatId = chatRow.chat_id;
      }

      // 2) Fallback: getUpdates (and persist if found)
      if (!chatId) {
        try {
          const updatesResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`
          );
          const updatesData = await updatesResponse.json();

          if (updatesData.ok && updatesData.result) {
            for (const update of updatesData.result) {
              const from = update.message?.from;
              if (from?.username?.toLowerCase() === cleanUsername) {
                chatId = from.id;
                // Persist for future logins
                await supabase.from('telegram_chats').upsert(
                  {
                    username: cleanUsername,
                    chat_id: chatId,
                    first_name: from.first_name || null,
                    last_name: from.last_name || null,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'username' }
                );
                break;
              }
            }
          }
        } catch (e) {
          console.warn('[Auth] getUpdates fallback failed:', e);
        }
      }

      if (!chatId) {
        setError(
          'Я не могу найти тебя :(\n' +
          'Напиши @ririai_bot - /start\n' +
          'И нажми «Получить код» заново'
        );
        return false;
      }

      const message = `🔐 Привет! Вот твой код для входа:\n\n<b>${code}</b>\n\nОн действует 10 минут.`;
      const sendResponse = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
        }
      );
      const sendData = await sendResponse.json();

      if (!sendData.ok) {
        setError('Не получилось отправить код. Попробуй ещё раз');
        return false;
      }

      setPendingUsername(cleanUsername);
      setCodeSent(true);
      return true;
    } catch (err) {
      console.error('[Auth] sendTelegramCode error:', err);
      setError('Что-то пошло не так. Попробуй ещё раз');
      return false;
    }
  }, []);

  // ------- EMAIL: send code (Supabase Auth OTP) -------
  const sendEmailCode = useCallback(async (email: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Введи корректный email');
      return false;
    }

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });

      if (otpError) {
        console.error('[Auth] Email OTP error:', otpError);
        setError('Не удалось отправить код на почту. Попробуй ещё раз');
        return false;
      }

      setPendingEmail(cleanEmail);
      setCodeSent(true);
      return true;
    } catch (err) {
      console.error('[Auth] sendEmailCode error:', err);
      setError('Что-то пошло не так. Попробуй ещё раз');
      return false;
    }
  }, []);

  // ------- Unified sendCode dispatcher -------
  const sendCode = useCallback(async (identifier: string): Promise<boolean> => {
    setSendingCode(true);
    setError(null);
    try {
      const result = authMethod === 'email'
        ? await sendEmailCode(identifier)
        : await sendTelegramCode(identifier);
      return result;
    } finally {
      setSendingCode(false);
    }
  }, [authMethod, sendTelegramCode, sendEmailCode]);

  // ------- TELEGRAM: verify code -------
  const verifyTelegramCode = useCallback(async (code: string): Promise<boolean> => {
    if (!pendingUsername) {
      setError('Сначала нажми «Получить код»');
      return false;
    }

    console.log('[Auth] Verifying code for:', pendingUsername, 'Code:', code.trim());
    const now = new Date();

    try {
      // Step 1: Just find the code regardless of time first to see if it exists
      const { data, error: dbError } = await supabase
        .from('auth_codes')
        .select('*')
        .eq('telegram_username', pendingUsername)
        .eq('code', code.trim())
        .eq('used', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (dbError) {
        console.error('[Auth] Supabase error during verification:', dbError);
        setError('Ошибка базы данных. Попробуй ещё раз');
        return false;
      }

      console.log('[Auth] Supabase found code record:', data);

      if (!data || data.length === 0) {
        setError('Код не подходит. Запроси новый');
        return false;
      }

      // Step 2: Manual expiry check with 1-hour drift tolerance
      const expiryDate = new Date(data[0].expires_at);
      console.log('[Auth] Client time:', now.toISOString());
      console.log('[Auth] Code expiry:', expiryDate.toISOString());

      // If code is older than now AND the difference is more than 1 hour (drift protection)
      if (expiryDate.getTime() < now.getTime() - (60 * 60 * 1000)) {
        setError('Код истёк. Запроси новый');
        return false;
      }

      await supabase.from('auth_codes').update({ used: true }).eq('id', data[0].id);

      const resolved = await resolveUserId({ telegram_username: pendingUsername });
      await ensureUserLink({ telegram_username: pendingUsername });
      await ensureUsersRow(resolved.userId, pendingUsername);

      const sessionToken = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from('sessions').insert({
        token: sessionToken,
        telegram_username: pendingUsername,
        auth_method: 'telegram',
        user_id: resolved.userId,
        expires_at: expiresAt.toISOString(),
        user_agent: navigator.userAgent,
      });

      saveSession(sessionToken);

      setUser({
        id: resolved.userId,
        telegram_username: pendingUsername,
        auth_method: 'telegram',
        created_at: new Date().toISOString(),
      });

      setCodeSent(false);
      setPendingUsername(null);
      return true;
    } catch (err) {
      console.error('[Auth] verifyTelegramCode error:', err);
      setError('Ошибка проверки. Попробуй ещё раз');
      return false;
    }
  }, [pendingUsername]);

  // ------- EMAIL: verify code (Supabase Auth OTP) -------
  const verifyEmailCode = useCallback(async (code: string): Promise<boolean> => {
    if (!pendingEmail) {
      setError('Сначала запроси код на почту');
      return false;
    }

    try {
      const { data: authData, error: otpError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code.trim(),
        type: 'email',
      });

      if (otpError || !authData?.user) {
        console.error('[Auth] Email verify error:', otpError);
        setError('Код не подходит или истёк. Запроси новый');
        return false;
      }

      const supabaseUid = authData.user.id;
      const email = authData.user.email || pendingEmail;

      await ensureUserLink({ email, supabase_uid: supabaseUid });

      const resolved = await resolveUserId({ email, supabase_uid: supabaseUid });
      await ensureUsersRow(resolved.userId, resolved.telegramUsername, email);

      const sessionToken = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from('sessions').insert({
        token: sessionToken,
        telegram_username: resolved.telegramUsername || null,
        email,
        auth_method: 'email',
        user_id: resolved.userId,
        expires_at: expiresAt.toISOString(),
        user_agent: navigator.userAgent,
      });

      saveSession(sessionToken);

      setUser({
        id: resolved.userId,
        telegram_username: resolved.telegramUsername,
        email,
        auth_method: 'email',
        created_at: new Date().toISOString(),
      });

      setCodeSent(false);
      setPendingEmail(null);
      return true;
    } catch (err) {
      console.error('[Auth] verifyEmailCode error:', err);
      setError('Ошибка проверки. Попробуй ещё раз');
      return false;
    }
  }, [pendingEmail]);

  // ------- Unified verifyCode dispatcher -------
  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setVerifying(true);
    setError(null);
    try {
      const result = authMethod === 'email'
        ? await verifyEmailCode(code)
        : await verifyTelegramCode(code);
      return result;
    } finally {
      setVerifying(false);
    }
  }, [authMethod, verifyTelegramCode, verifyEmailCode]);

  // ------- Link a Telegram username to current email account -------
  const linkTelegram = useCallback(async (username: string): Promise<boolean> => {
    if (!user?.email) return false;
    const clean = username.replace('@', '').trim().toLowerCase();
    if (!clean) return false;

    try {
      // Update user_links: set telegram_username where email matches
      const { error: linkError } = await supabase
        .from('user_links')
        .update({ telegram_username: clean, updated_at: new Date().toISOString() })
        .eq('email', user.email);

      if (linkError) {
        console.error('[Auth] linkTelegram error:', linkError);
        return false;
      }

      // Migrate data: update all rows referencing old user_id to new tg-based id
      const oldUserId = user.id;
      const newUserId = `tg-${clean}`;

      if (oldUserId !== newUserId) {
        const tables = ['projects', 'saved_videos', 'tracked_accounts', 'saved_carousels'];
        for (const table of tables) {
          await supabase.from(table).update({ user_id: newUserId }).eq('user_id', oldUserId);
        }

        // Update users table
        await supabase.from('users').update({ user_id: newUserId, telegram_username: clean }).eq('user_id', oldUserId);
      }

      // Update session
      const sessionToken = getSession();
      if (sessionToken) {
        await supabase.from('sessions').update({
          telegram_username: clean,
          user_id: newUserId,
        }).eq('token', sessionToken);
      }

      setUser(prev => prev ? {
        ...prev,
        id: newUserId,
        telegram_username: clean,
      } : null);

      return true;
    } catch (err) {
      console.error('[Auth] linkTelegram error:', err);
      return false;
    }
  }, [user]);

  // ------- Link an email to current Telegram account -------
  const linkEmail = useCallback(async (email: string): Promise<boolean> => {
    if (!user?.telegram_username) return false;
    const clean = email.trim().toLowerCase();
    if (!clean) return false;

    try {
      const { error: linkError } = await supabase
        .from('user_links')
        .update({ email: clean, updated_at: new Date().toISOString() })
        .eq('telegram_username', user.telegram_username);

      if (linkError) {
        console.error('[Auth] linkEmail error:', linkError);
        return false;
      }

      await supabase.from('users').update({ email: clean }).eq('telegram_username', user.telegram_username);

      setUser(prev => prev ? { ...prev, email: clean } : null);
      return true;
    } catch (err) {
      console.error('[Auth] linkEmail error:', err);
      return false;
    }
  }, [user]);

  const resetAuth = useCallback(() => {
    setCodeSent(false);
    setPendingUsername(null);
    setPendingEmail(null);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    const sessionToken = getSession();
    if (sessionToken) {
      await supabase.from('sessions').delete().eq('token', sessionToken);
    }
    clearSession();
    // Sign out from Supabase Auth too (clears any cached auth state)
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setCodeSent(false);
    setPendingUsername(null);
    setPendingEmail(null);
  }, []);

  const getUserId = useCallback(() => {
    return user?.id || null;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated: !!user,
      sendingCode,
      verifying,
      error,
      codeSent,
      authMethod,
      setAuthMethod,
      sendCode,
      verifyCode,
      resetAuth,
      logout,
      getUserId,
      linkTelegram,
      linkEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
