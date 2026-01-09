import { openai, aiConfig, withAIErrorHandling, isAIEnabled } from './openai-client';
import type { Product, VoiceRecognitionResult, VoiceCommandResult } from '../../types';

// 音声コマンド解析プロンプト
const createCommandParsePrompt = (
  transcription: string,
  productNames: string[],
  context: 'receipt' | 'usage'
) => `
あなたは在庫管理システムの音声コマンド解析アシスタントです。
ユーザーの音声入力を解析し、適切なアクションを判定してください。

音声入力: "${transcription}"
操作コンテキスト: ${context === 'receipt' ? '入荷処理' : '使用処理'}

商品名リスト（参考、最大30件）:
${productNames.slice(0, 30).join(', ')}

以下のJSON形式で回答してください:
{
  "action": "${context}" | "quantity" | "unknown",
  "productName": "商品名（該当する場合）" | null,
  "quantity": 数量（整数、該当する場合）| null,
  "interpretation": "解釈の説明（日本語）"
}

解析ガイドライン:
- 「○○を△個入荷」→ action: "receipt", productName: "○○", quantity: △
- 「○○を△個使用」→ action: "usage", productName: "○○", quantity: △
- 「△個」のみ → action: "quantity", quantity: △
- 商品名は部分一致でも可（「オイルフィルター」→「オイルフィルター A-123」）
- 数量の読み方: 「5個」「五個」「5つ」「5」すべて quantity: 5
- 解釈できない場合は action: "unknown"
`;

// Whisper APIで音声をテキストに変換
export async function transcribeAudio(audioBlob: Blob): Promise<VoiceRecognitionResult> {
  if (!isAIEnabled()) {
    throw new Error('OpenAI APIキーが設定されていません');
  }

  return withAIErrorHandling(async () => {
    // BlobをFileに変換（Whisper APIはFile形式を要求）
    const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type });

    const response = await openai!.audio.transcriptions.create({
      file,
      model: aiConfig.whisperModel,
      language: 'ja',
      response_format: 'json',
    });

    return {
      transcription: response.text,
      confidence: 1.0, // Whisper APIはconfidenceを返さないので固定
    };
  });
}

// 音声コマンドを解析
export async function parseVoiceCommand(
  transcription: string,
  products: Product[],
  context: 'receipt' | 'usage'
): Promise<VoiceCommandResult> {
  // まず数量のみのパターンをローカルでチェック
  const quantityMatch = transcription.match(/^(\d+)(個|つ|こ)?$/);
  if (quantityMatch) {
    return {
      action: 'quantity',
      quantity: parseInt(quantityMatch[1], 10),
      interpretation: `数量: ${quantityMatch[1]}個`,
    };
  }

  // 日本語数字のパターン
  const japaneseNumbers: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '二十': 20, '三十': 30, '五十': 50, '百': 100,
  };

  for (const [jpNum, num] of Object.entries(japaneseNumbers)) {
    if (transcription === jpNum || transcription === `${jpNum}個` || transcription === `${jpNum}つ`) {
      return {
        action: 'quantity',
        quantity: num,
        interpretation: `数量: ${num}個`,
      };
    }
  }

  if (!isAIEnabled()) {
    // AIが無効の場合は簡易解析
    return parseCommandLocally(transcription, products, context);
  }

  const productNames = products.map((p) => p.name);

  return withAIErrorHandling(
    async () => {
      const response = await openai!.chat.completions.create({
        model: aiConfig.modelMini,
        messages: [
          {
            role: 'system',
            content: '音声コマンドを解析するアシスタントです。必ずJSON形式で回答してください。',
          },
          {
            role: 'user',
            content: createCommandParsePrompt(transcription, productNames, context),
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('AI応答が空です');
      }

      const parsed = JSON.parse(content) as VoiceCommandResult;

      // 商品名が返された場合、実際のProductを検索
      if (parsed.productName) {
        const matchedProduct = findProductByName(parsed.productName, products);
        if (matchedProduct) {
          parsed.productId = matchedProduct.id;
          parsed.productName = matchedProduct.name;
        }
      }

      return parsed;
    },
    // フォールバック
    parseCommandLocally(transcription, products, context)
  );
}

// ローカルでの簡易コマンド解析
function parseCommandLocally(
  transcription: string,
  products: Product[],
  context: 'receipt' | 'usage'
): VoiceCommandResult {
  // 「〇〇を△個入荷/使用」パターン
  const patterns = [
    /(.+?)を?(\d+)(個|つ|こ)?(入荷|仕入|使用|出庫)?/,
    /(\d+)(個|つ|こ)?の?(.+?)を?(入荷|仕入|使用|出庫)?/,
  ];

  for (const pattern of patterns) {
    const match = transcription.match(pattern);
    if (match) {
      // パターンに応じて商品名と数量を抽出
      let productName: string;
      let quantity: number;

      if (match[1] && !isNaN(parseInt(match[1], 10))) {
        // 数字が先のパターン
        quantity = parseInt(match[1], 10);
        productName = match[3] || '';
      } else {
        // 商品名が先のパターン
        productName = match[1] || '';
        quantity = parseInt(match[2], 10);
      }

      if (productName && quantity) {
        const matchedProduct = findProductByName(productName, products);
        if (matchedProduct) {
          return {
            action: context,
            productId: matchedProduct.id,
            productName: matchedProduct.name,
            quantity,
            interpretation: `「${matchedProduct.name}」を${quantity}個${context === 'receipt' ? '入荷' : '使用'}`,
          };
        }
      }
    }
  }

  return {
    action: 'unknown',
    interpretation: `認識できませんでした: "${transcription}"`,
  };
}

// 商品名で商品を検索（部分一致）
function findProductByName(name: string, products: Product[]): Product | null {
  const normalizedName = name.toLowerCase().trim();

  // 完全一致を優先
  const exactMatch = products.find(
    (p) => p.name.toLowerCase() === normalizedName
  );
  if (exactMatch) return exactMatch;

  // 部分一致
  const partialMatch = products.find(
    (p) => p.name.toLowerCase().includes(normalizedName) ||
           normalizedName.includes(p.name.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  return null;
}

// Web Audio APIで音声を録音
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.audioChunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // WebMまたはMP4形式を選択（ブラウザ互換性）
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // 100ms間隔でデータ収集
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('録音が開始されていません'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });

        // ストリームを停止
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
          this.stream = null;
        }

        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}
