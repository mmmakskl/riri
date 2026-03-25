import { createContext, useContext, ReactNode } from 'react';
import { useUserBalance } from '../hooks/useUserBalance';

interface TokenBalanceContextType {
  balance: number;
  loading: boolean;
  deduct: (amount: number, meta?: { action?: string; section?: string; label?: string }) => Promise<boolean>;
  canAfford: (cost: number) => boolean;
  refetch: () => Promise<void>;
  /** Последнее списание для анимации (сбрасывается через ~1.8s) */
  lastDeduct: number;
  /** Уникальный счётчик списаний — меняется при каждом deduct для key анимации */
  lastDeductId: number;
}

const TokenBalanceContext = createContext<TokenBalanceContextType | null>(null);

export function TokenBalanceProvider({ children }: { children: ReactNode }) {
  const value = useUserBalance();
  return (
    <TokenBalanceContext.Provider value={value}>
      {children}
    </TokenBalanceContext.Provider>
  );
}

export function useTokenBalance() {
  const ctx = useContext(TokenBalanceContext);
  if (!ctx) {
    return {
      balance: 0,
      loading: false,
      deduct: async (_amount?: number, _meta?: { action?: string; section?: string; label?: string }) => false,
      canAfford: () => false,
      refetch: async () => {},
      lastDeduct: 0,
      lastDeductId: 0,
    };
  }
  return ctx;
}
