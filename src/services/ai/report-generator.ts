import { openai, aiConfig, withAIErrorHandling, isAIEnabled } from './openai-client';
import type { SupplierMonthlySummary, AIReport, AIReportHighlight, Transaction, Product } from '../../types';

// レポート生成用プロンプト
const createReportPrompt = (data: {
  yearMonth: string;
  supplierSummaries: SupplierMonthlySummary[];
  totalInventoryValue: number;
  shortageCount: number;
  topUsedProducts: Array<{ name: string; usageCount: number; usageAmount: number }>;
  previousMonthData?: {
    totalPurchase: number;
    totalUsage: number;
  };
}) => `
あなたは在庫管理システムの経営分析アシスタントです。
以下の月次データを分析し、経営者向けのサマリーレポートを作成してください。

対象年月: ${data.yearMonth}

【仕入先別集計】
${data.supplierSummaries
  .map(
    (s) => `
- ${s.supplierName}:
  前月残高: ¥${s.previousBalance.toLocaleString()}
  当月仕入: ¥${s.monthlyPurchase.toLocaleString()}
  当月使用: ¥${s.monthlyUsage.toLocaleString()}
  増減: ¥${s.change.toLocaleString()}
  当月残: ¥${s.calculatedBalance.toLocaleString()}
`
  )
  .join('')}

【全体指標】
- 在庫金額合計: ¥${data.totalInventoryValue.toLocaleString()}
- 不足商品数: ${data.shortageCount}件

【よく使用された商品TOP5】
${data.topUsedProducts
  .slice(0, 5)
  .map((p, i) => `${i + 1}. ${p.name}: ${p.usageCount}個 (¥${p.usageAmount.toLocaleString()})`)
  .join('\n')}

${
  data.previousMonthData
    ? `
【前月比】
- 仕入れ: ${((data.supplierSummaries.reduce((s, x) => s + x.monthlyPurchase, 0) / data.previousMonthData.totalPurchase - 1) * 100).toFixed(1)}%
- 使用: ${((data.supplierSummaries.reduce((s, x) => s + x.monthlyUsage, 0) / data.previousMonthData.totalUsage - 1) * 100).toFixed(1)}%
`
    : ''
}

以下のJSON形式で回答してください:
{
  "executiveSummary": "経営者向けサマリー（2-3文で簡潔に）",
  "trendAnalysis": "トレンド分析コメント（傾向や特徴を説明）",
  "recommendations": ["推奨アクション1", "推奨アクション2", "推奨アクション3"],
  "highlights": [
    { "type": "positive" | "warning" | "info", "message": "ハイライト内容" }
  ]
}

注意:
- 日本語で回答
- 具体的な数値を含めて説明
- 経営判断に役立つ実用的な提案を含める
`;

// AIレポートを生成
export async function generateAIReport(
  yearMonth: string,
  supplierSummaries: SupplierMonthlySummary[],
  transactions: Transaction[],
  products: Product[],
  totalInventoryValue: number,
  shortageCount: number
): Promise<AIReport> {
  // よく使用された商品を集計
  const usageByProduct = new Map<string, { count: number; amount: number }>();
  const [year, month] = yearMonth.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  transactions
    .filter(
      (t) =>
        t.type === 'out' &&
        t.subType === 'usage' &&
        new Date(t.date) >= monthStart &&
        new Date(t.date) <= monthEnd
    )
    .forEach((t) => {
      const current = usageByProduct.get(t.productId) || { count: 0, amount: 0 };
      const product = products.find((p) => p.id === t.productId);
      current.count += t.quantity;
      current.amount += t.quantity * (product?.unitPrice || 0);
      usageByProduct.set(t.productId, current);
    });

  const topUsedProducts = Array.from(usageByProduct.entries())
    .map(([productId, data]) => {
      const product = products.find((p) => p.id === productId);
      return {
        name: product?.name || productId,
        usageCount: data.count,
        usageAmount: data.amount,
      };
    })
    .sort((a, b) => b.usageAmount - a.usageAmount)
    .slice(0, 5);

  if (!isAIEnabled()) {
    // AIが無効の場合は簡易レポートを生成
    return generateSimpleReport(
      yearMonth,
      supplierSummaries,
      totalInventoryValue,
      shortageCount,
      topUsedProducts
    );
  }

  return withAIErrorHandling(
    async () => {
      const response = await openai!.chat.completions.create({
        model: aiConfig.model,
        messages: [
          {
            role: 'system',
            content:
              '経営分析レポートを生成するアシスタントです。必ずJSON形式で回答してください。',
          },
          {
            role: 'user',
            content: createReportPrompt({
              yearMonth,
              supplierSummaries,
              totalInventoryValue,
              shortageCount,
              topUsedProducts,
            }),
          },
        ],
        max_tokens: aiConfig.maxTokens,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('AI応答が空です');
      }

      const parsed = JSON.parse(content) as Omit<AIReport, 'generatedAt'>;

      return {
        ...parsed,
        generatedAt: new Date().toISOString(),
      };
    },
    // フォールバック
    generateSimpleReport(
      yearMonth,
      supplierSummaries,
      totalInventoryValue,
      shortageCount,
      topUsedProducts
    )
  );
}

// AIが無効時の簡易レポート生成
function generateSimpleReport(
  yearMonth: string,
  supplierSummaries: SupplierMonthlySummary[],
  totalInventoryValue: number,
  shortageCount: number,
  topUsedProducts: Array<{ name: string; usageCount: number; usageAmount: number }>
): AIReport {
  const totalPurchase = supplierSummaries.reduce((s, x) => s + x.monthlyPurchase, 0);
  const totalUsage = supplierSummaries.reduce((s, x) => s + x.monthlyUsage, 0);

  const highlights: AIReportHighlight[] = [];

  if (shortageCount > 0) {
    highlights.push({
      type: 'warning',
      message: `${shortageCount}件の商品が在庫不足です。発注をご検討ください。`,
    });
  }

  if (totalUsage > totalPurchase) {
    highlights.push({
      type: 'info',
      message: `使用額が仕入れ額を上回っています（差額: ¥${(totalUsage - totalPurchase).toLocaleString()}）`,
    });
  }

  const topProduct = topUsedProducts[0];
  if (topProduct) {
    highlights.push({
      type: 'positive',
      message: `最も使用された商品: ${topProduct.name}（${topProduct.usageCount}個）`,
    });
  }

  return {
    executiveSummary: `${yearMonth}の仕入れ総額は¥${totalPurchase.toLocaleString()}、使用総額は¥${totalUsage.toLocaleString()}でした。在庫金額合計は¥${totalInventoryValue.toLocaleString()}です。`,
    trendAnalysis: `取引業者${supplierSummaries.length}社との取引があります。${
      shortageCount > 0
        ? `${shortageCount}件の商品が在庫不足となっており、発注対応が必要です。`
        : '現在、在庫不足の商品はありません。'
    }`,
    recommendations: shortageCount > 0
      ? ['在庫不足商品の発注を優先的に行ってください', '使用頻度の高い商品の安全在庫を見直してください']
      : ['現在の在庫水準を維持してください'],
    highlights,
    generatedAt: new Date().toISOString(),
  };
}
