import { useState, useCallback } from 'react';
import { runDemandForecast } from '../services/ai/demand-forecast';
import { isAIEnabled } from '../services/ai/openai-client';
import type { Product, Transaction, Supplier, DemandForecastResult } from '../types';

interface UseAIDemandForecastProps {
  products: Product[];
  transactions: Transaction[];
  suppliers: Supplier[];
  getStock: (productId: string) => number;
}

interface UseAIDemandForecastReturn {
  forecastResults: DemandForecastResult[];
  isLoading: boolean;
  error: string | null;
  refreshForecast: () => Promise<void>;
  lastUpdated: Date | null;
  isAIAvailable: boolean;
}

export function useAIDemandForecast({
  products,
  transactions,
  suppliers,
  getStock,
}: UseAIDemandForecastProps): UseAIDemandForecastReturn {
  const [forecastResults, setForecastResults] = useState<DemandForecastResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await runDemandForecast(
        products,
        transactions,
        suppliers,
        getStock
      );
      setForecastResults(results);
      setLastUpdated(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '予測中にエラーが発生しました';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [products, transactions, suppliers, getStock]);

  return {
    forecastResults,
    isLoading,
    error,
    refreshForecast,
    lastUpdated,
    isAIAvailable: isAIEnabled(),
  };
}
