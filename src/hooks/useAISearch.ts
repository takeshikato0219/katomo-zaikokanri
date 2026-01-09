import { useState, useCallback } from 'react';
import { parseSearchIntent, filterProductsByIntent, generateSearchSuggestions } from '../services/ai/natural-language-search';
import { isAIEnabled } from '../services/ai/openai-client';
import type { Product, Transaction, AISearchResult, AISearchIntent } from '../types';

interface UseAISearchProps {
  products: Product[];
  transactions: Transaction[];
  getStock: (productId: string) => number;
  getSupplierName: (supplierId: string) => string;
}

interface UseAISearchReturn {
  search: (query: string) => Promise<AISearchResult>;
  isSearching: boolean;
  lastResult: AISearchResult | null;
  lastIntent: AISearchIntent | null;
  error: string | null;
  isAIAvailable: boolean;
}

export function useAISearch({
  products,
  transactions,
  getStock,
  getSupplierName,
}: UseAISearchProps): UseAISearchReturn {
  const [isSearching, setIsSearching] = useState(false);
  const [lastResult, setLastResult] = useState<AISearchResult | null>(null);
  const [lastIntent, setLastIntent] = useState<AISearchIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string): Promise<AISearchResult> => {
      if (!query.trim()) {
        const result: AISearchResult = {
          products: [],
          interpretation: '',
          suggestions: [],
        };
        setLastResult(result);
        setLastIntent(null);
        return result;
      }

      setIsSearching(true);
      setError(null);

      try {
        // AIで検索意図を解析
        const intent = await parseSearchIntent(query, products);
        setLastIntent(intent);

        // 意図に基づいてフィルタリング
        const filteredProducts = filterProductsByIntent(
          products,
          transactions,
          intent,
          getStock,
          getSupplierName
        );

        // サジェスションを生成
        const suggestions = generateSearchSuggestions(query, products);

        const result: AISearchResult = {
          products: filteredProducts,
          interpretation: intent.interpretation,
          suggestions,
        };

        setLastResult(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '検索中にエラーが発生しました';
        setError(errorMessage);

        // フォールバック: 単純な部分一致検索
        const fallbackProducts = products.filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.id.toLowerCase().includes(query.toLowerCase())
        );

        const result: AISearchResult = {
          products: fallbackProducts,
          interpretation: `「${query}」で検索（通常検索）`,
          suggestions: [],
        };

        setLastResult(result);
        return result;
      } finally {
        setIsSearching(false);
      }
    },
    [products, transactions, getStock, getSupplierName]
  );

  return {
    search,
    isSearching,
    lastResult,
    lastIntent,
    error,
    isAIAvailable: isAIEnabled(),
  };
}
