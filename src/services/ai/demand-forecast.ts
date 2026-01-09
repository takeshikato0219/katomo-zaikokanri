import { openai, aiConfig, withAIErrorHandling, isAIEnabled } from './openai-client';
import type { Product, Transaction, DemandForecastResult, Supplier } from '../../types';

// 週次使用量を計算
function calculateWeeklyUsage(
  productId: string,
  transactions: Transaction[],
  weeksBack: number = 12
): number[] {
  const now = new Date();
  const weeklyUsage: number[] = [];

  for (let i = 0; i < weeksBack; i++) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const usage = transactions
      .filter(
        (t) =>
          t.productId === productId &&
          t.type === 'out' &&
          t.subType === 'usage' &&
          new Date(t.date) >= weekStart &&
          new Date(t.date) < weekEnd
      )
      .reduce((sum, t) => sum + t.quantity, 0);

    weeklyUsage.unshift(usage); // 古い週から順に
  }

  return weeklyUsage;
}

// 需要予測プロンプト
const createForecastPrompt = (
  products: Array<{
    productId: string;
    productName: string;
    supplierName: string;
    weeklyUsage: number[];
    currentStock: number;
    minStock: number;
  }>
) => `
あなたは在庫管理の専門家です。以下の商品データを分析し、来週の需要予測を行ってください。

商品データ:
${products
  .map(
    (p) => `
商品: ${p.productName} (${p.productId})
業者: ${p.supplierName}
過去12週間の週次使用量: ${p.weeklyUsage.join(', ')}
現在在庫: ${p.currentStock}
最小在庫設定: ${p.minStock}
`
  )
  .join('\n---\n')}

以下のJSON形式で回答してください。配列で複数商品の予測を返してください:
{
  "forecasts": [
    {
      "productId": "商品ID",
      "predictedUsageNextWeek": 予測使用数（整数）,
      "confidenceLevel": "high" | "medium" | "low",
      "willRunOut": true | false（来週中に不足する可能性）,
      "daysUntilStockout": 在庫切れまでの日数（null可）,
      "suggestedOrderQuantity": 推奨発注数（整数）,
      "reason": "予測の根拠（日本語で簡潔に）"
    }
  ]
}

予測のガイドライン:
- 過去の使用パターン（増加/減少トレンド、週ごとの変動）を考慮
- 現在在庫と予測使用量から在庫切れリスクを評価
- confidenceLevel: データが安定していれば"high"、変動が大きければ"low"
- 在庫切れリスクがある商品を優先的に警告
`;

// 需要予測を実行
export async function runDemandForecast(
  products: Product[],
  transactions: Transaction[],
  suppliers: Supplier[],
  getStock: (productId: string) => number
): Promise<DemandForecastResult[]> {
  if (!isAIEnabled()) {
    // AIが無効の場合は簡易的な予測を返す
    return generateSimpleForecast(products, transactions, suppliers, getStock);
  }

  // 予測対象の商品データを準備
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const productsData = products.map((product) => ({
    productId: product.id,
    productName: product.name,
    supplierName: supplierMap.get(product.supplierId) || '不明',
    weeklyUsage: calculateWeeklyUsage(product.id, transactions),
    currentStock: getStock(product.id),
    minStock: product.minStock,
  }));

  // 使用履歴がある商品のみを対象にする
  const activeProducts = productsData.filter(
    (p) => p.weeklyUsage.some((u) => u > 0) || p.currentStock < p.minStock
  );

  if (activeProducts.length === 0) {
    return [];
  }

  // 大量の商品がある場合は分割処理（APIの制限を考慮）
  const batchSize = 20;
  const results: DemandForecastResult[] = [];

  for (let i = 0; i < activeProducts.length; i += batchSize) {
    const batch = activeProducts.slice(i, i + batchSize);

    const batchResults = await withAIErrorHandling(
      async () => {
        const response = await openai!.chat.completions.create({
          model: aiConfig.model,
          messages: [
            {
              role: 'system',
              content:
                'あなたは在庫管理の専門家です。需要予測を行い、必ずJSON形式で回答してください。',
            },
            {
              role: 'user',
              content: createForecastPrompt(batch),
            },
          ],
          max_tokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('AI応答が空です');
        }

        const parsed = JSON.parse(content) as {
          forecasts: Array<{
            productId: string;
            predictedUsageNextWeek: number;
            confidenceLevel: 'high' | 'medium' | 'low';
            willRunOut: boolean;
            daysUntilStockout: number | null;
            suggestedOrderQuantity: number;
            reason: string;
          }>;
        };

        // 結果を整形
        return parsed.forecasts.map((f) => {
          const productData = batch.find((p) => p.productId === f.productId);
          return {
            productId: f.productId,
            productName: productData?.productName || '',
            supplierName: productData?.supplierName || '',
            currentStock: productData?.currentStock || 0,
            predictedUsageNextWeek: f.predictedUsageNextWeek,
            confidenceLevel: f.confidenceLevel,
            willRunOut: f.willRunOut,
            daysUntilStockout: f.daysUntilStockout,
            suggestedOrderQuantity: f.suggestedOrderQuantity,
            reason: f.reason,
          };
        });
      },
      [] // エラー時は空配列を返す
    );

    results.push(...batchResults);
  }

  // 在庫切れリスクが高い順にソート
  return results.sort((a, b) => {
    if (a.willRunOut && !b.willRunOut) return -1;
    if (!a.willRunOut && b.willRunOut) return 1;
    if (a.daysUntilStockout !== null && b.daysUntilStockout !== null) {
      return a.daysUntilStockout - b.daysUntilStockout;
    }
    return 0;
  });
}

// AIが無効時の簡易予測
function generateSimpleForecast(
  products: Product[],
  transactions: Transaction[],
  suppliers: Supplier[],
  getStock: (productId: string) => number
): DemandForecastResult[] {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const results: DemandForecastResult[] = [];

  for (const product of products) {
    const weeklyUsage = calculateWeeklyUsage(product.id, transactions);
    const currentStock = getStock(product.id);

    // 過去4週間の平均使用量
    const recentUsage = weeklyUsage.slice(-4);
    const avgUsage = recentUsage.length > 0
      ? Math.ceil(recentUsage.reduce((a, b) => a + b, 0) / recentUsage.length)
      : 0;

    if (avgUsage === 0 && currentStock >= product.minStock) {
      continue; // 使用履歴がなく在庫が十分な場合はスキップ
    }

    const daysUntilStockout = avgUsage > 0
      ? Math.floor((currentStock / avgUsage) * 7)
      : null;

    const willRunOut = daysUntilStockout !== null && daysUntilStockout <= 7;

    results.push({
      productId: product.id,
      productName: product.name,
      supplierName: supplierMap.get(product.supplierId) || '不明',
      currentStock,
      predictedUsageNextWeek: avgUsage,
      confidenceLevel: 'medium',
      willRunOut,
      daysUntilStockout,
      suggestedOrderQuantity: Math.max(0, product.minStock - currentStock + avgUsage),
      reason: `過去4週間の平均使用量: ${avgUsage}個/週`,
    });
  }

  return results
    .filter((r) => r.willRunOut || r.currentStock < products.find((p) => p.id === r.productId)!.minStock)
    .sort((a, b) => {
      if (a.willRunOut && !b.willRunOut) return -1;
      if (!a.willRunOut && b.willRunOut) return 1;
      return 0;
    });
}
