import { useState, useCallback } from 'react';
import { generateAIReport } from '../services/ai/report-generator';
import { isAIEnabled } from '../services/ai/openai-client';
import type { SupplierMonthlySummary, Transaction, Product, AIReport } from '../types';

interface UseAIReportProps {
  transactions: Transaction[];
  products: Product[];
}

interface UseAIReportReturn {
  report: AIReport | null;
  isGenerating: boolean;
  error: string | null;
  generateReport: (
    yearMonth: string,
    supplierSummaries: SupplierMonthlySummary[],
    totalInventoryValue: number,
    shortageCount: number
  ) => Promise<AIReport | null>;
  clearReport: () => void;
  isAIAvailable: boolean;
}

export function useAIReport({
  transactions,
  products,
}: UseAIReportProps): UseAIReportReturn {
  const [report, setReport] = useState<AIReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReportHandler = useCallback(
    async (
      yearMonth: string,
      supplierSummaries: SupplierMonthlySummary[],
      totalInventoryValue: number,
      shortageCount: number
    ): Promise<AIReport | null> => {
      setIsGenerating(true);
      setError(null);

      try {
        const result = await generateAIReport(
          yearMonth,
          supplierSummaries,
          transactions,
          products,
          totalInventoryValue,
          shortageCount
        );
        setReport(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'レポート生成中にエラーが発生しました';
        setError(errorMessage);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [transactions, products]
  );

  const clearReport = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  return {
    report,
    isGenerating,
    error,
    generateReport: generateReportHandler,
    clearReport,
    isAIAvailable: isAIEnabled(),
  };
}
