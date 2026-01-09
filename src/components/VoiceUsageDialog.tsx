import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, X, Loader2, Check, RotateCcw, AlertCircle, AlertTriangle, Search, Package, HelpCircle, Trash2, Edit2, User } from 'lucide-react';
import { openai } from '../services/ai/openai-client';
import type { Product, Customer, Stock, Supplier } from '../types';

interface VoiceUsageDialogProps {
  products: Product[];
  customers: Customer[];
  stocks: Stock[];
  suppliers: Supplier[];
  onComplete: (items: VoiceUsageItem[]) => void;
  onClose: () => void;
}

export interface VoiceUsageItem {
  product: Product;
  quantity: number;
  unit: string;
  customerId: string;
  customerName: string;
}

// 解析結果の型（複数アイテム用、編集可能）
interface ParsedItem {
  id: string;
  productName: string;
  matchedProduct: Product | null;
  customerName: string;
  selectedCustomer: Customer | null;
  quantity: number | null;
  unit: string;
}

// Web Speech API の型定義
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function VoiceUsageDialog({
  products,
  customers,
  stocks,
  suppliers,
  onComplete,
  onClose,
}: VoiceUsageDialogProps) {
  // ステート
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // 解析された複数アイテム（編集リスト）
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);

  // 入力モード: 'initial' = 最初の一括入力, 'edit' = 編集画面
  const [mode, setMode] = useState<'initial' | 'edit'>('initial');

  // 編集中のアイテムID
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // 商品検索用ステート（編集中アイテム用）
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // 音声認識
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // 商品の在庫数を取得
  const getStockQuantity = useCallback((productId: string): number => {
    const stock = stocks.find(s => s.productId === productId);
    return stock?.quantity ?? 0;
  }, [stocks]);

  // 商品のメーカー名を取得
  const getSupplierName = useCallback((supplierId: string): string => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name ?? '不明';
  }, [suppliers]);

  // フィルター済み商品リスト（編集中アイテム用）- 在庫ありのみ
  const filteredProducts = useMemo(() => {
    if (!productSearchQuery) return [];
    return products.filter(p => {
      const stock = getStockQuantity(p.id);
      if (stock <= 0) return false;
      return p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(productSearchQuery.toLowerCase());
    }).slice(0, 10);
  }, [productSearchQuery, products, getStockQuantity]);

  // フィルター済み顧客リスト
  const filteredCustomers = useMemo(() => {
    const editingItem = parsedItems.find(item => item.id === editingItemId);
    const searchTerm = editingItem?.customerName || '';
    if (!searchTerm) return customers.slice(0, 10);
    return customers.filter(c => {
      const term = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(term) ||
             c.furigana?.toLowerCase().includes(term);
    }).slice(0, 10);
  }, [editingItemId, parsedItems, customers]);

  // 類似商品を取得
  const getSimilarProducts = useCallback((item: ParsedItem) => {
    if (!item.productName || item.productName.length < 2) return [];
    const searchLower = item.productName.toLowerCase();
    const matchedId = item.matchedProduct?.id;

    return products
      .filter(p => {
        if (p.id === matchedId) return false;
        const stock = getStockQuantity(p.id);
        if (stock <= 0) return false;
        const nameLower = p.name.toLowerCase();
        const idLower = p.id.toLowerCase();
        return nameLower.includes(searchLower) ||
               searchLower.includes(nameLower.slice(0, 3)) ||
               idLower.includes(searchLower);
      })
      .slice(0, 3);
  }, [products, getStockQuantity]);

  // Web Speech API の初期化
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(interim);
        if (final) {
          setTranscription(prev => (prev || '') + final);
        }
      };

      recognition.onerror = () => {
        setError('音声認識でエラーが発生しました');
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // 録音開始
  const startRecording = useCallback(() => {
    setError(null);
    setApiError(null);
    setTranscription(null);
    setInterimTranscript('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch {
        setError('音声認識の開始に失敗しました');
      }
    } else {
      setError('お使いのブラウザは音声認識に対応していません');
    }
  }, []);

  // 録音停止＆処理
  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setInterimTranscript('');

    setTimeout(async () => {
      const finalText = transcription || interimTranscript;
      if (finalText) {
        setTranscription(finalText);
        setIsProcessing(true);
        await processMultipleItems(finalText);
        setIsProcessing(false);
      }
    }, 300);
  }, [transcription, interimTranscript]);

  // 商品を検索
  const findProduct = useCallback((name: string): Product | null => {
    const lowerName = name.toLowerCase();
    return products.find(p => {
      const stock = getStockQuantity(p.id);
      if (stock <= 0) return false;
      return p.name.toLowerCase().includes(lowerName) ||
        lowerName.includes(p.name.toLowerCase()) ||
        p.id.toLowerCase() === lowerName;
    }) || null;
  }, [products, getStockQuantity]);

  // 顧客を検索
  const findCustomer = useCallback((name: string): Customer | null => {
    const cleanName = name.replace(/さん|様|分/g, '').trim().toLowerCase();
    return customers.find(c =>
      c.name.toLowerCase().includes(cleanName) ||
      cleanName.includes(c.name.toLowerCase()) ||
      c.furigana?.toLowerCase().includes(cleanName) ||
      (c.furigana && cleanName.includes(c.furigana.toLowerCase()))
    ) || null;
  }, [customers]);

  // 複数アイテムを解析
  const processMultipleItems = async (text: string) => {
    try {
      const items = await parseMultipleItems(text);
      setParsedItems(items);
      setMode('edit');
    } catch {
      setError('解析に失敗しました。もう一度お試しください。');
    }
  };

  // 複数アイテムを解析（OpenAI APIまたはローカル）
  const parseMultipleItems = async (text: string): Promise<ParsedItem[]> => {
    // OpenAI APIで複数アイテム解析
    if (openai) {
      try {
        const productList = products.slice(0, 100).map(p => `${p.id}: ${p.name}`).join('\n');
        const customerList = customers.map(c => c.name).join(', ');

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `ユーザーが複数の使用（出庫）情報を一度に言いました。各アイテムを抽出してください。
これは「使用」処理なので、顧客名が必須です。

商品リスト:
${productList}

顧客リスト: ${customerList}

JSON形式で返答してください:
{
  "items": [
    {
      "productName": "商品名（商品リストから最も近いもの）",
      "customerName": "顧客名（顧客リストから最も近いもの）",
      "quantity": 数値 or null,
      "unit": "個" or "本" or "メートル" etc.
    }
  ]
}

例: 「山田さん オイル 2個 田中さん フィルター 3個」
→ 2つのアイテムを返す（それぞれ顧客が異なる）

例: 「鈴木さん分 マックスファン2個 インバーター1個」
→ 2つのアイテムを返す（同じ顧客・鈴木さん）

聞き取れなかった項目はnullにしてください。`
            },
            { role: 'user', content: text }
          ],
          response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(response.choices[0].message.content || '{}');

        if (parsed.items && Array.isArray(parsed.items)) {
          return parsed.items.map((item: {
            productName?: string;
            customerName?: string;
            quantity?: number;
            unit?: string;
          }, index: number) => {
            const matchedProduct = item.productName ? findProduct(item.productName) : null;
            const selectedCustomer = item.customerName ? findCustomer(item.customerName) : null;

            return {
              id: `item-${Date.now()}-${index}`,
              productName: item.productName || '',
              matchedProduct,
              customerName: item.customerName || '',
              selectedCustomer,
              quantity: item.quantity || null,
              unit: item.unit || '個',
            };
          });
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('429')) {
          setApiError('API制限中。ローカル解析のみ使用します。');
        }
      }
    }

    // ローカル解析（フォールバック）
    return parseMultipleItemsLocal(text);
  };

  // ローカルで複数アイテムを解析
  const parseMultipleItemsLocal = (text: string): ParsedItem[] => {
    const items: ParsedItem[] = [];

    // 「、」や空白で区切って解析を試みる
    // 数量パターンで分割
    const segments = text.split(/(?=\d+\s*(?:個|本|メートル|m|枚|セット|箱|リットル|L|つ|こ))/);

    if (segments.length <= 1) {
      // 分割できなかった場合は1アイテムとして処理
      const item = parseSingleItemLocal(text);
      if (item.productName) {
        items.push(item);
      }
    } else {
      // 各セグメントを処理
      let currentProductName = '';
      let lastCustomerName = '';

      for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        // 数量を抽出
        const qtyMatch = trimmed.match(/^(\d+)\s*(個|本|メートル|m|枚|セット|箱|リットル|L|つ|こ)?/);

        if (qtyMatch) {
          // 数量が見つかった → 前の商品名と組み合わせる
          const item = parseSingleItemLocal(currentProductName + ' ' + trimmed);
          if (item.productName || currentProductName) {
            // 顧客名が見つかっていなければ前の顧客名を引き継ぐ
            if (!item.customerName && lastCustomerName) {
              item.customerName = lastCustomerName;
              item.selectedCustomer = findCustomer(lastCustomerName);
            }
            if (item.customerName) {
              lastCustomerName = item.customerName;
            }
            items.push({
              ...item,
              productName: item.productName || currentProductName,
            });
          }
          currentProductName = trimmed.replace(/^\d+\s*(個|本|メートル|m|枚|セット|箱|リットル|L|つ|こ)?/, '').trim();
        } else {
          currentProductName = trimmed;
        }
      }
    }

    // アイテムが見つからなかった場合は1アイテムとして処理
    if (items.length === 0) {
      const item = parseSingleItemLocal(text);
      items.push(item);
    }

    return items;
  };

  // 単一アイテムをローカルで解析
  const parseSingleItemLocal = (text: string): ParsedItem => {
    let quantity: number | null = null;
    let unit = '個';
    const qtyMatch = text.match(/(\d+)\s*(個|本|メートル|m|枚|セット|箱|リットル|L|つ|こ)?/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      if (qtyMatch[2]) {
        unit = qtyMatch[2] === 'つ' || qtyMatch[2] === 'こ' ? '個' : qtyMatch[2];
      }
    }

    // 漢数字チェック
    if (!quantity) {
      const kanjiNums: { [key: string]: number } = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      };
      for (const [kanji, num] of Object.entries(kanjiNums)) {
        if (text.includes(kanji + '個') || text.includes(kanji + '本') || text.includes(kanji + 'つ')) {
          quantity = num;
          break;
        }
      }
    }

    // 顧客名を抽出（〜さん、〜様、〜分）
    let customerName = '';
    const customerMatch = text.match(/([^\s]+?)(?:さん|様|分)/);
    if (customerMatch) {
      customerName = customerMatch[1];
    }
    const selectedCustomer = customerName ? findCustomer(customerName) : null;

    // 商品名を抽出
    let productName = text
      .replace(/\d+\s*(個|本|メートル|m|枚|セット|箱|リットル|L|つ|こ)?/g, '')
      .replace(/[^\s]+?(?:さん|様|分)/g, '')
      .replace(/、|,/g, ' ')
      .trim();

    const matchedProduct = findProduct(productName);
    if (matchedProduct) {
      productName = matchedProduct.name;
    }

    return {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      productName,
      matchedProduct,
      customerName: selectedCustomer?.name || customerName,
      selectedCustomer,
      quantity,
      unit,
    };
  };

  // アイテムを更新
  const updateItem = (itemId: string, updates: Partial<ParsedItem>) => {
    setParsedItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  // 商品を選択
  const selectProductForItem = (itemId: string, product: Product) => {
    updateItem(itemId, {
      matchedProduct: product,
      productName: product.name,
    });
    setShowProductDropdown(false);
    setProductSearchQuery('');
  };

  // 顧客を選択
  const selectCustomerForItem = (itemId: string, customer: Customer) => {
    updateItem(itemId, {
      selectedCustomer: customer,
      customerName: customer.name,
    });
    setShowCustomerDropdown(false);
  };

  // アイテムを削除
  const removeItem = (itemId: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== itemId));
  };

  // 編集モードに入る
  const startEditing = (itemId: string) => {
    const item = parsedItems.find(i => i.id === itemId);
    if (item) {
      setEditingItemId(itemId);
      setProductSearchQuery(item.productName);
    }
  };

  // 編集を完了
  const finishEditing = () => {
    setEditingItemId(null);
    setProductSearchQuery('');
    setShowProductDropdown(false);
    setShowCustomerDropdown(false);
  };

  // 全アイテムが有効かチェック（使用では顧客が必須）
  const allItemsValid = useMemo(() => {
    return parsedItems.length > 0 && parsedItems.every(item => {
      if (!item.matchedProduct || !item.quantity || item.quantity <= 0) return false;
      if (!item.selectedCustomer && !item.customerName) return false;
      // 在庫チェック
      const stock = getStockQuantity(item.matchedProduct.id);
      if (item.quantity > stock) return false;
      return true;
    });
  }, [parsedItems, getStockQuantity]);

  // 完了処理
  const handleComplete = () => {
    const items: VoiceUsageItem[] = parsedItems
      .filter(item => item.matchedProduct && item.quantity && (item.selectedCustomer || item.customerName))
      .map(item => ({
        product: item.matchedProduct!,
        quantity: item.quantity!,
        unit: item.unit,
        customerId: item.selectedCustomer?.id || '',
        customerName: item.selectedCustomer?.name || item.customerName,
      }));
    onComplete(items);
  };

  // やり直し
  const retry = () => {
    setTranscription(null);
    setInterimTranscript('');
    setError(null);
    setParsedItems([]);
    setMode('initial');
  };

  // 現在の表示テキスト
  const displayText = transcription || interimTranscript;

  // リアルタイムで不足情報をチェック
  const getMissingInfo = useMemo(() => {
    if (!displayText) return [];

    const missing: string[] = [];
    const text = displayText.toLowerCase();

    const hasQuantity = /\d+/.test(text) || /[一二三四五六七八九十]/.test(text);
    if (!hasQuantity) {
      missing.push('数量');
    }

    const hasCustomer = /さん|様|分/.test(text);
    if (!hasCustomer) {
      missing.push('顧客名');
    }

    return missing;
  }, [displayText]);

  // 単位オプション
  const unitOptions = ['個', '本', 'メートル', '枚', 'セット', '箱', 'リットル'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-orange-500 text-white flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Mic className="w-5 h-5" />
            <h3 className="text-lg font-bold">音声使用</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* API エラー警告 */}
        {apiError && (
          <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center space-x-2 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-700">{apiError}</p>
            <button onClick={() => setApiError(null)} className="ml-auto text-yellow-600 hover:text-yellow-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* メインコンテンツ */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* 初期入力モード */}
          {mode === 'initial' && (
            <>
              <div className="text-center mb-4">
                <p className="text-lg font-medium text-[#181818] mb-2">
                  使用情報を話してください
                </p>
                <p className="text-sm text-gray-500">
                  例：「山田さん オイル 2個 フィルター 3個」
                </p>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-lg font-bold text-orange-800 mb-2">
                  伝える内容
                </p>
                <div className="flex flex-wrap gap-2 text-base font-medium">
                  <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full">顧客名</span>
                  <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full">商品名</span>
                  <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full">数量</span>
                </div>
                <p className="text-sm text-orange-600 mt-3">
                  複数商品を一度に言えます！
                </p>
              </div>

              {/* エラー */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* リアルタイム認識結果 */}
              {(isRecording || displayText) && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  isRecording ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className="text-xs text-orange-600 mb-1">
                    {isRecording ? '認識中...' : '認識結果:'}
                  </p>
                  <p className={`text-[#181818] min-h-[1.5rem] text-lg ${isRecording && !displayText ? 'text-gray-400' : ''}`}>
                    {displayText ? `「${displayText}」` : '話してください...'}
                  </p>

                  {displayText && getMissingInfo.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-orange-200">
                      <p className="text-sm font-bold text-red-600 mb-1">
                        まだ聞き取れていません：
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {getMissingInfo.map((info, i) => (
                          <span
                            key={i}
                            className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium animate-pulse"
                          >
                            {info}は？
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 録音ボタン */}
              <div className="flex justify-center mb-4">
                {isRecording ? (
                  <div className="relative">
                    <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-50" />
                    <button
                      onClick={stopRecording}
                      className="relative w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                    >
                      <Mic className="w-8 h-8" />
                    </button>
                  </div>
                ) : isProcessing ? (
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  </div>
                ) : (
                  <button
                    onClick={startRecording}
                    className="w-20 h-20 bg-orange-500 hover:bg-orange-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <Mic className="w-8 h-8" />
                  </button>
                )}
              </div>

              {isRecording && (
                <p className="text-center text-sm text-gray-500">
                  話し終わったらボタンをタップ
                </p>
              )}
              {isProcessing && (
                <p className="text-center text-sm text-gray-500">
                  処理中...
                </p>
              )}
            </>
          )}

          {/* 編集モード - 複数アイテムリスト */}
          {mode === 'edit' && (
            <>
              <div className="mb-4">
                <p className="text-base font-medium text-[#181818] mb-1">
                  認識結果を確認・修正
                </p>
                {transcription && (
                  <p className="text-xs text-gray-500">
                    認識: 「{transcription}」
                  </p>
                )}
              </div>

              {/* エラー */}
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* アイテムリスト */}
              <div className="space-y-3">
                {parsedItems.map((item, index) => {
                  const isEditing = editingItemId === item.id;
                  const similarProducts = getSimilarProducts(item);
                  const stock = item.matchedProduct ? getStockQuantity(item.matchedProduct.id) : 0;
                  const hasStockError = item.matchedProduct && item.quantity && item.quantity > stock;
                  const hasError = !item.matchedProduct || !item.quantity || (!item.selectedCustomer && !item.customerName) || hasStockError;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        hasError ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'
                      }`}
                    >
                      {/* アイテムヘッダー */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-500">
                          #{index + 1}
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => isEditing ? finishEditing() : startEditing(item.id)}
                            className="p-1 text-gray-500 hover:text-blue-600 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-gray-500 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        /* 編集フォーム */
                        <div className="space-y-2">
                          {/* 顧客検索 */}
                          <div className="relative">
                            <User className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={item.customerName}
                              onChange={(e) => {
                                updateItem(item.id, { customerName: e.target.value, selectedCustomer: null });
                                setShowCustomerDropdown(true);
                              }}
                              onFocus={() => setShowCustomerDropdown(true)}
                              placeholder="顧客名..."
                              className="w-full pl-8 pr-3 py-2 border rounded text-sm"
                            />
                            {showCustomerDropdown && filteredCustomers.length > 0 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                                {filteredCustomers.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => selectCustomerForItem(item.id, c)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50 border-b last:border-0"
                                  >
                                    {c.name}
                                    {c.furigana && <span className="text-gray-400 text-xs ml-1">({c.furigana})</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 商品検索 */}
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={productSearchQuery}
                              onChange={(e) => {
                                setProductSearchQuery(e.target.value);
                                setShowProductDropdown(true);
                              }}
                              onFocus={() => setShowProductDropdown(true)}
                              placeholder="商品名で検索..."
                              className="w-full pl-8 pr-3 py-2 border rounded text-sm"
                            />
                            {showProductDropdown && filteredProducts.length > 0 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                {filteredProducts.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => selectProductForItem(item.id, p)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50 border-b last:border-0"
                                  >
                                    <span className="font-medium">{p.name}</span>
                                    <span className="text-gray-400 ml-2 text-xs">
                                      在庫: {getStockQuantity(p.id)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 数量 */}
                          <div className="flex space-x-2 items-center">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={item.quantity || ''}
                              onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || null })}
                              placeholder="数量"
                              className="flex-1 px-3 py-2 border rounded text-sm text-center font-bold"
                            />
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                              className="px-2 py-2 border rounded text-sm"
                            >
                              {unitOptions.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>

                          {/* 在庫警告 */}
                          {item.matchedProduct && (
                            <div className="text-xs text-gray-500">
                              在庫: {getStockQuantity(item.matchedProduct.id)}
                              {item.quantity && item.quantity > getStockQuantity(item.matchedProduct.id) && (
                                <span className="text-red-600 ml-2">
                                  在庫不足！
                                </span>
                              )}
                            </div>
                          )}

                          <button
                            onClick={finishEditing}
                            className="w-full py-2 bg-green-500 text-white rounded text-sm font-medium"
                          >
                            <Check className="w-4 h-4 inline mr-1" />
                            完了
                          </button>
                        </div>
                      ) : (
                        /* 表示モード */
                        <div>
                          {/* 顧客情報 */}
                          <div className="mb-2">
                            {(item.selectedCustomer || item.customerName) ? (
                              <div className="flex items-center space-x-2">
                                <User className="w-4 h-4 text-orange-600" />
                                <span className="font-bold text-orange-700">
                                  {item.selectedCustomer?.name || item.customerName}様
                                </span>
                              </div>
                            ) : (
                              <div className="text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 inline mr-1" />
                                顧客未選択
                              </div>
                            )}
                          </div>

                          {/* 商品情報 */}
                          {item.matchedProduct ? (
                            <div className="mb-2">
                              <div className="flex items-center space-x-2">
                                <Package className="w-4 h-4 text-green-600" />
                                <span className="font-bold text-[#181818]">{item.matchedProduct.name}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600">
                                <span>{getSupplierName(item.matchedProduct.supplierId)}</span>
                                <span>在庫: <span className={`font-bold ${stock <= 0 ? 'text-red-600' : 'text-blue-600'}`}>{stock}</span></span>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-2 text-red-600 text-sm">
                              <AlertCircle className="w-4 h-4 inline mr-1" />
                              商品未選択: {item.productName || '(空)'}
                            </div>
                          )}

                          {/* 数量 */}
                          <div className="flex items-center space-x-3 text-sm">
                            {item.quantity ? (
                              <span className={`font-bold text-lg ${hasStockError ? 'text-red-600' : ''}`}>
                                {item.quantity}{item.unit}
                                {hasStockError && <span className="text-xs ml-1">(在庫不足)</span>}
                              </span>
                            ) : (
                              <span className="text-red-600">数量未入力</span>
                            )}
                          </div>

                          {/* 類似商品の候補（マッチしていても表示） */}
                          {similarProducts.length > 0 && (
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                              <div className="flex items-center space-x-1 text-yellow-700 text-xs mb-1">
                                <HelpCircle className="w-3 h-3" />
                                <span>こちらではないですか？</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {similarProducts.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => selectProductForItem(item.id, p)}
                                    className="text-xs bg-white border border-yellow-300 px-2 py-1 rounded hover:bg-yellow-100"
                                  >
                                    {p.name}
                                    <span className="text-gray-400 ml-1">({getStockQuantity(p.id)})</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {parsedItems.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  アイテムがありません
                </div>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-[#e5e5e5] bg-gray-50 flex-shrink-0">
          {mode === 'initial' && (transcription || error) && (
            <button
              onClick={retry}
              className="w-full btn-secondary py-3 flex items-center justify-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>やり直す</span>
            </button>
          )}

          {mode === 'edit' && (
            <div className="flex space-x-3">
              <button
                onClick={retry}
                className="btn-secondary flex-1 py-3"
              >
                やり直す
              </button>
              <button
                onClick={handleComplete}
                disabled={!allItemsValid}
                className={`flex-1 py-3 flex items-center justify-center space-x-2 rounded-lg font-medium ${
                  allItemsValid
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Check className="w-5 h-5" />
                <span>確定 ({parsedItems.filter(i => i.matchedProduct && i.quantity && (i.selectedCustomer || i.customerName)).length}件)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
