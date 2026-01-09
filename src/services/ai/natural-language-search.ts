import { openai, aiConfig, withAIErrorHandling, isAIEnabled } from './openai-client';
import type { Product, Transaction, AISearchIntent } from '../../types';

// 検索クエリ解析用プロンプト
const createSearchPrompt = (query: string, productNames: string[]) => `
あなたは在庫管理システムの検索アシスタントです。
ユーザーの検索クエリを解析し、適切なフィルタ条件を生成してください。

検索クエリ: "${query}"

商品名リスト（参考、最大50件）:
${productNames.slice(0, 50).join(', ')}

以下のJSON形式で回答してください（日本語で）:
{
  "type": "product_name" | "category" | "supplier" | "usage_history" | "stock_status",
  "keywords": ["検索キーワード1", "検索キーワード2"],
  "correctedQuery": "typo補正後のクエリ（補正不要ならnull）",
  "dateFilter": { "type": "last_month" | "last_week" } | null,
  "interpretation": "検索意図の説明（日本語で簡潔に）"
}

検索タイプの判断基準:
- "product_name": 商品名や品番での検索
- "category": カテゴリや種類での検索（「ブレーキ関連」「オイル系」など）
- "supplier": 業者名での検索
- "usage_history": 使用履歴に基づく検索（「よく使う」「先月使った」など）
- "stock_status": 在庫状態での検索（「在庫少ない」「不足」など）

typo補正の例:
- 「ぶれーきぱっど」→「ブレーキパッド」
- 「おいるふぃるたー」→「オイルフィルター」
`;

// AI検索意図を解析
export async function parseSearchIntent(
  query: string,
  products: Product[]
): Promise<AISearchIntent> {
  if (!isAIEnabled()) {
    // AIが無効の場合はデフォルトの検索意図を返す
    return {
      type: 'product_name',
      keywords: [query],
      correctedQuery: null,
      dateFilter: null,
      interpretation: `「${query}」で検索`,
    };
  }

  const productNames = products.map((p) => p.name);

  return withAIErrorHandling(async () => {
    const response = await openai!.chat.completions.create({
      model: aiConfig.modelMini, // 検索解析は軽量モデルで十分
      messages: [
        {
          role: 'system',
          content: 'あなたは検索クエリを解析するアシスタントです。必ずJSON形式で回答してください。',
        },
        {
          role: 'user',
          content: createSearchPrompt(query, productNames),
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI応答が空です');
    }

    const parsed = JSON.parse(content) as AISearchIntent;
    return parsed;
  }, {
    type: 'product_name',
    keywords: [query],
    correctedQuery: null,
    dateFilter: null,
    interpretation: `「${query}」で検索`,
  });
}

// 検索意図に基づいて商品をフィルタリング
export function filterProductsByIntent(
  products: Product[],
  transactions: Transaction[],
  intent: AISearchIntent,
  getStock: (productId: string) => number,
  getSupplierName: (supplierId: string) => string
): Product[] {
  let filtered = [...products];
  const searchTerms = intent.correctedQuery
    ? [intent.correctedQuery, ...intent.keywords]
    : intent.keywords;

  switch (intent.type) {
    case 'product_name':
    case 'category':
      // 商品名、カテゴリでの部分一致検索
      filtered = filtered.filter((product) => {
        const searchTarget = `${product.name} ${product.id} ${product.category || ''} ${product.lot || ''}`.toLowerCase();
        return searchTerms.some((term) =>
          searchTarget.includes(term.toLowerCase())
        );
      });
      break;

    case 'supplier':
      // 業者名での検索
      filtered = filtered.filter((product) => {
        const supplierName = getSupplierName(product.supplierId).toLowerCase();
        return searchTerms.some((term) =>
          supplierName.includes(term.toLowerCase())
        );
      });
      break;

    case 'usage_history': {
      // 使用履歴に基づく検索
      const now = new Date();
      let startDate: Date;

      if (intent.dateFilter?.type === 'last_week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        // デフォルトは先月
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }

      // 期間内の使用回数をカウント
      const usageCount = new Map<string, number>();
      transactions
        .filter(
          (t) =>
            t.type === 'out' &&
            t.subType === 'usage' &&
            new Date(t.date) >= startDate
        )
        .forEach((t) => {
          usageCount.set(t.productId, (usageCount.get(t.productId) || 0) + t.quantity);
        });

      // 使用回数でソートして返す
      filtered = filtered
        .filter((p) => usageCount.has(p.id))
        .sort((a, b) => (usageCount.get(b.id) || 0) - (usageCount.get(a.id) || 0));
      break;
    }

    case 'stock_status': {
      // 在庫状態での検索
      const lowStockKeywords = ['不足', '少ない', '切れ', '要発注'];
      const isLowStockSearch = searchTerms.some((term) =>
        lowStockKeywords.some((kw) => term.includes(kw))
      );

      if (isLowStockSearch) {
        filtered = filtered.filter((product) => {
          const stock = getStock(product.id);
          return stock < product.minStock;
        });
      }
      break;
    }
  }

  return filtered;
}

// 検索サジェスションを生成
export function generateSearchSuggestions(
  query: string,
  products: Product[]
): string[] {
  const suggestions: string[] = [];

  // カテゴリ候補
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  categories.slice(0, 3).forEach((cat) => {
    if (cat && cat.toLowerCase().includes(query.toLowerCase())) {
      suggestions.push(`「${cat}」カテゴリで検索`);
    }
  });

  // 類似商品名
  const similarProducts = products
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 3);
  similarProducts.forEach((p) => {
    suggestions.push(`「${p.name}」を検索`);
  });

  return suggestions.slice(0, 5);
}
