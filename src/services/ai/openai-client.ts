import OpenAI from 'openai';

// OpenAI クライアントの初期化
// 注意: フロントエンド直接呼び出しはローカル開発用
// 本番環境ではバックエンド経由を推奨
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

export const openai = apiKey
  ? new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    })
  : null;

// AI設定
export const aiConfig = {
  model: 'gpt-4o' as const,
  modelMini: 'gpt-4o-mini' as const,
  whisperModel: 'whisper-1' as const,
  maxTokens: 2000,
  temperature: 0.3, // 予測系は低めに設定
};

// APIキーが設定されているかチェック
export const isAIEnabled = (): boolean => {
  return !!apiKey && apiKey.startsWith('sk-');
};

// エラーハンドリング用ラッパー
export async function withAIErrorHandling<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  if (!isAIEnabled()) {
    if (fallback !== undefined) return fallback;
    throw new Error('OpenAI APIキーが設定されていません。.envファイルにVITE_OPENAI_API_KEYを設定してください。');
  }

  try {
    return await operation();
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', error.message);
      if (error.status === 401) {
        throw new Error('OpenAI APIキーが無効です。');
      }
      if (error.status === 429) {
        throw new Error('API利用制限に達しました。しばらく待ってから再試行してください。');
      }
    }
    if (fallback !== undefined) return fallback;
    throw error;
  }
}
