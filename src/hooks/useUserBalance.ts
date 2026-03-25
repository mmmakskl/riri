import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './useAuth';

const DEFAULT_BALANCE = 20;
const DEDUCT_ANIMATION_MS = 1800;

export function useUserBalance() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(DEFAULT_BALANCE);
  const [loading, setLoading] = useState(true);
  const [lastDeduct, setLastDeduct] = useState<number>(0);
  const [lastDeductId, setLastDeductId] = useState<number>(0);
  const deductTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) {
      setBalance(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Try user_id column first (new schema), fall back to telegram_username (old schema)
      let data: { token_balance?: number } | null = null;
      let error: unknown = null;

      const res1 = await supabase
        .from('users')
        .select('token_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      data = res1.data;
      error = res1.error;

      if (!data && user.telegram_username) {
        const res2 = await supabase
          .from('users')
          .select('token_balance')
          .eq('telegram_username', user.telegram_username)
          .maybeSingle();
        data = res2.data;
        error = res2.error;
      }

      if (error) {
        console.error('useUserBalance fetch:', error);
        setBalance(DEFAULT_BALANCE);
      } else {
        const val = data?.token_balance;
        setBalance(typeof val === 'number' ? val : DEFAULT_BALANCE);
      }
    } catch (e) {
      console.error('useUserBalance:', e);
      setBalance(DEFAULT_BALANCE);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.telegram_username]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const deduct = useCallback(async (
    amount: number,
    meta?: { action?: string; section?: string; label?: string }
  ): Promise<boolean> => {
    if (!user?.id || amount <= 0) return false;
    try {
      // Find the row by user_id or telegram_username
      const eqCol = user.telegram_username ? 'telegram_username' : 'user_id';
      const eqVal = user.telegram_username || user.id;

      const { data: row, error } = await supabase
        .from('users')
        .select('token_balance')
        .eq(eqCol, eqVal)
        .single();
      if (error || !row) return false;
      const current = (row as { token_balance: number }).token_balance ?? 0;
      if (current < amount) return false;
      const newBalance = current - amount;
      const { error: updateError } = await supabase
        .from('users')
        .update({ token_balance: newBalance })
        .eq(eqCol, eqVal)
        .gte('token_balance', amount);
      if (updateError) return false;
      setBalance(newBalance);
      setLastDeduct(amount);
      setLastDeductId(prev => prev + 1);
      if (deductTimeoutRef.current) clearTimeout(deductTimeoutRef.current);
      deductTimeoutRef.current = setTimeout(() => {
        setLastDeduct(0);
        deductTimeoutRef.current = null;
      }, DEDUCT_ANIMATION_MS);

      // Логируем транзакцию в token_transactions (fire-and-forget)
      if (meta?.action) {
        supabase.from('token_transactions').insert({
          user_id: user.id,
          tg_username: user.telegram_username || null,
          amount,
          action: meta.action,
          section: meta.section || null,
          label: meta.label || null,
        }).then(({ error: logErr }) => {
          if (logErr) console.warn('token_transactions log:', logErr.message);
        });
      }

      return true;
    } catch (e) {
      console.error('useUserBalance deduct:', e);
      return false;
    }
  }, [user?.id, user?.telegram_username]);

  const canAfford = useCallback((cost: number) => balance >= cost && cost >= 0, [balance]);

  return { balance, loading, deduct, canAfford, refetch: fetchBalance, lastDeduct, lastDeductId };
}
