import { useState, useCallback, useMemo, useRef } from 'react';
import {
  Upload,
  FileImage,
  Loader2,
  Check,
  X,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
  Eye,
  Calendar,
  User,
  Settings,
} from 'lucide-react';
import { useInventory } from '../hooks/useInventory';

// OCR結果から抽出した商品情報
interface ExtractedItem {
  rawText: string;        // 元のテキスト
  productName: string;    // 品名（推定）
  productId?: string;     // 品番（推定）
  quantity: number;       // 数量
  unitPrice?: number;     // 単価
  matched: boolean;       // 既存商品とマッチしたか
  matchedProductId?: string; // マッチした商品ID
  confidence: number;     // 信頼度 (0-100)
}

// スキャンした納品書
interface ScannedNote {
  id: string;
  fileName: string;
  imageData: string;      // base64
  imageDataUrl: string;   // data:image/xxx;base64,... 形式（プレビュー用）
  supplierName?: string;  // 仕入先名（推定）
  matchedSupplierId?: string;
  noteDate?: string;      // 納品日
  noteNumber?: string;    // 納品書番号
  items: ExtractedItem[];
  rawText: string;        // OCR生テキスト
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  expanded: boolean;
}

// API設定
type OcrApiType = 'google' | 'openai';

interface ApiSettings {
  ocrApiType: OcrApiType;
  googleApiKey: string;
  openaiApiKey: string;
}

export function DeliveryNoteScanner() {
  const {
    products,
    suppliers,
    adjustStock,
  } = useInventory();

  // 状態
  const [scannedNotes, setScannedNotes] = useState<ScannedNote[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [operator, setOperator] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [settings, setSettings] = useState<ApiSettings>(() => {
    const saved = localStorage.getItem('deliveryNoteScannerSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fall through
      }
    }
    // OpenAI APIキーがlocalStorageにあれば使用
    const openaiKey = localStorage.getItem('openai_api_key') || '';
    return {
      ocrApiType: openaiKey ? 'openai' : 'google',
      googleApiKey: '',
      openaiApiKey: openaiKey,
    };
  });
  const [tempSettings, setTempSettings] = useState<ApiSettings>(settings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 設定保存
  const saveSettings = () => {
    setSettings(tempSettings);
    localStorage.setItem('deliveryNoteScannerSettings', JSON.stringify(tempSettings));
    // OpenAI APIキーは他の機能でも使うので別途保存
    if (tempSettings.openaiApiKey) {
      localStorage.setItem('openai_api_key', tempSettings.openaiApiKey);
    }
    setShowSettings(false);
  };

  // ファイルをBase64に変換
  const fileToBase64 = (file: File): Promise<{ base64: string; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // data:image/xxx;base64, の部分を除去
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ファイル処理（共通）
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const currentApiKey = settings.ocrApiType === 'google'
      ? settings.googleApiKey
      : settings.openaiApiKey;

    if (!currentApiKey) {
      alert(`${settings.ocrApiType === 'google' ? 'Google Cloud Vision' : 'OpenAI'} APIキーを設定してください`);
      setShowSettings(true);
      return;
    }

    // 最大10ファイル
    const fileArray = Array.from(files).slice(0, 10);

    // 画像ファイルのみフィルタ
    const imageFiles = fileArray.filter(file =>
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );

    if (imageFiles.length === 0) {
      alert('画像ファイルを選択してください');
      return;
    }

    // 新しいスキャン項目を追加
    const newNotes: ScannedNote[] = await Promise.all(
      imageFiles.map(async (file) => {
        const { base64, dataUrl } = await fileToBase64(file);
        return {
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          fileName: file.name,
          imageData: base64,
          imageDataUrl: dataUrl,
          items: [],
          rawText: '',
          status: 'pending' as const,
          expanded: true,
        };
      })
    );

    setScannedNotes((prev) => [...prev, ...newNotes]);

    // 順次OCR処理
    processNotesSequentially(newNotes);
  }, [settings]);

  // ファイルアップロード処理
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
    // ファイル入力をリセット
    event.target.value = '';
  }, [processFiles]);

  // ドラッグ＆ドロップハンドラー
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ドロップゾーンから完全に出た場合のみ
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // 順次OCR処理
  const processNotesSequentially = async (notes: ScannedNote[]) => {
    setIsProcessing(true);

    for (const note of notes) {
      try {
        // ステータスを処理中に更新
        setScannedNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, status: 'processing' } : n))
        );

        // OCR実行
        const result = await performOCR(note.imageData, note.imageDataUrl);

        // テキストを解析して商品情報を抽出
        const extracted = parseOCRResult(result);

        // ステータスを完了に更新
        setScannedNotes((prev) =>
          prev.map((n) =>
            n.id === note.id
              ? {
                  ...n,
                  status: 'completed',
                  rawText: result,
                  ...extracted,
                }
              : n
          )
        );
      } catch (error) {
        setScannedNotes((prev) =>
          prev.map((n) =>
            n.id === note.id
              ? {
                  ...n,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'OCR処理に失敗しました',
                }
              : n
          )
        );
      }
    }

    setIsProcessing(false);
  };

  // OCR実行
  const performOCR = async (base64Image: string, dataUrl: string): Promise<string> => {
    if (settings.ocrApiType === 'google') {
      return performGoogleVisionOCR(base64Image);
    } else {
      return performOpenAIOCR(dataUrl);
    }
  };

  // Google Cloud Vision API呼び出し
  const performGoogleVisionOCR = async (base64Image: string): Promise<string> => {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${settings.googleApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
              imageContext: {
                languageHints: ['ja', 'en'],
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Google Vision API呼び出しに失敗しました');
    }

    const data = await response.json();
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!fullText) {
      throw new Error('テキストを検出できませんでした');
    }

    return fullText;
  };

  // OpenAI GPT-4o Vision API呼び出し
  const performOpenAIOCR = async (dataUrl: string): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `この納品書の画像からテキストを読み取ってください。
以下の情報を抽出してください：
- 仕入先名/会社名
- 納品書番号
- 日付
- 商品名と数量（すべての商品行）

商品行は以下の形式で出力してください：
商品名: [商品名] / 数量: [数量]

できるだけ正確に読み取ってください。`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'OpenAI API呼び出しに失敗しました');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('テキストを検出できませんでした');
    }

    return content;
  };

  // OCR結果を解析して商品情報を抽出
  const parseOCRResult = (
    rawText: string
  ): {
    supplierName?: string;
    matchedSupplierId?: string;
    noteDate?: string;
    noteNumber?: string;
    items: ExtractedItem[];
  } => {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

    // 仕入先名を検出
    let supplierName: string | undefined;
    let matchedSupplierId: string | undefined;

    // 仕入先名の検出パターン
    for (const supplier of suppliers) {
      if (rawText.includes(supplier.name)) {
        supplierName = supplier.name;
        matchedSupplierId = supplier.id;
        break;
      }
    }

    // 納品書番号を検出
    let noteNumber: string | undefined;
    const noteNumberMatch = rawText.match(/納品書(?:番号)?[：:\s]*([A-Za-z0-9\-]+)/);
    if (noteNumberMatch) {
      noteNumber = noteNumberMatch[1];
    }

    // 日付を検出
    let noteDate: string | undefined;
    const datePatterns = [
      /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
      /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
      /令和(\d+)年(\d{1,2})月(\d{1,2})日/,
    ];

    for (const pattern of datePatterns) {
      const match = rawText.match(pattern);
      if (match) {
        if (pattern.source.includes('令和')) {
          const year = 2018 + parseInt(match[1]);
          noteDate = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else if (match[1].length === 4) {
          noteDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          noteDate = `20${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        break;
      }
    }

    // 商品行を検出して解析
    const items: ExtractedItem[] = [];

    // GPT形式の商品行を検出（「商品名: xxx / 数量: yyy」）
    const gptProductPattern = /商品名[：:]\s*(.+?)\s*[\/|]\s*数量[：:]\s*(\d+)/g;
    let gptMatch;
    while ((gptMatch = gptProductPattern.exec(rawText)) !== null) {
      const productName = gptMatch[1].trim();
      const quantity = parseInt(gptMatch[2]);

      if (productName && quantity > 0) {
        const { matched, matchedProductId, confidence } = matchProduct(productName);
        items.push({
          rawText: gptMatch[0],
          productName,
          quantity,
          matched,
          matchedProductId,
          confidence,
        });
      }
    }

    // GPT形式で見つからなかった場合は従来の解析
    if (items.length === 0) {
      // 数量パターン（例: "10個", "5本", "3", "×10"）
      const quantityPattern = /[×x]?\s*(\d+)\s*(個|本|枚|箱|セット|kg|g|m|cm|mm)?/gi;

      // 金額パターン（例: "¥1,000", "1000円", "1,000"）
      const pricePattern = /[¥￥]?\s*([\d,]+)\s*円?/g;

      for (const line of lines) {
        // 空行やヘッダー行をスキップ
        if (line.length < 3) continue;
        if (/^(品名|商品名|数量|単価|金額|合計|小計|納品書|御中|様|TEL|FAX|〒)/.test(line)) continue;

        // 商品名っぽい行を検出
        const quantities: number[] = [];
        let match;

        while ((match = quantityPattern.exec(line)) !== null) {
          const qty = parseInt(match[1]);
          if (qty > 0 && qty < 10000) {
            quantities.push(qty);
          }
        }

        if (quantities.length === 0) continue;

        // 商品名を推定（数量や金額を除いた部分）
        let productName = line
          .replace(quantityPattern, '')
          .replace(pricePattern, '')
          .replace(/[¥￥]/g, '')
          .replace(/[\d,]+/g, ' ')
          .trim();

        if (productName.length < 2) continue;

        // 単価を検出
        let unitPrice: number | undefined;
        const priceMatches = [...line.matchAll(pricePattern)];
        if (priceMatches.length > 0) {
          const prices = priceMatches.map((m) => parseInt(m[1].replace(/,/g, '')));
          // 最小の金額を単価と推定
          unitPrice = Math.min(...prices);
        }

        const { matched, matchedProductId, confidence } = matchProduct(productName);

        items.push({
          rawText: line,
          productName,
          quantity: quantities[0],
          unitPrice,
          matched,
          matchedProductId,
          confidence,
        });
      }
    }

    return {
      supplierName,
      matchedSupplierId,
      noteDate,
      noteNumber,
      items,
    };
  };

  // 商品名から既存商品をマッチング
  const matchProduct = (productName: string): { matched: boolean; matchedProductId?: string; confidence: number } => {
    // 完全一致を検索
    const exactMatch = products.find(
      (p) => p.name === productName || p.id === productName
    );
    if (exactMatch) {
      return { matched: true, matchedProductId: exactMatch.id, confidence: 100 };
    }

    // 部分一致を検索
    const partialMatch = products.find(
      (p) =>
        p.name.includes(productName) ||
        productName.includes(p.name) ||
        p.id.includes(productName)
    );
    if (partialMatch) {
      return { matched: true, matchedProductId: partialMatch.id, confidence: 70 };
    }

    return { matched: false, confidence: 30 };
  };

  // 商品マッチングを手動で変更
  const updateItemMatch = (noteId: string, itemIndex: number, productId: string) => {
    setScannedNotes((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) return note;

        const newItems = [...note.items];
        const product = products.find((p) => p.id === productId);

        newItems[itemIndex] = {
          ...newItems[itemIndex],
          matched: !!product,
          matchedProductId: product?.id,
          confidence: product ? 100 : 0,
        };

        return { ...note, items: newItems };
      })
    );
  };

  // 数量を手動で変更
  const updateItemQuantity = (noteId: string, itemIndex: number, quantity: number) => {
    setScannedNotes((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) return note;

        const newItems = [...note.items];
        newItems[itemIndex] = {
          ...newItems[itemIndex],
          quantity: Math.max(0, quantity),
        };

        return { ...note, items: newItems };
      })
    );
  };

  // 商品を削除
  const removeItem = (noteId: string, itemIndex: number) => {
    setScannedNotes((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) return note;
        return {
          ...note,
          items: note.items.filter((_, i) => i !== itemIndex),
        };
      })
    );
  };

  // 納品書を削除
  const removeNote = (noteId: string) => {
    setScannedNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // 納品書の展開/折りたたみ
  const toggleExpanded = (noteId: string) => {
    setScannedNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, expanded: !n.expanded } : n))
    );
  };

  // 入荷確認済みの商品数
  const confirmedItems = useMemo(() => {
    return scannedNotes
      .filter((n) => n.status === 'completed')
      .flatMap((n) => n.items)
      .filter((item) => item.matched && item.quantity > 0);
  }, [scannedNotes]);

  // 入荷処理実行
  const processReceipt = () => {
    if (confirmedItems.length === 0) {
      alert('入荷確認できる商品がありません');
      return;
    }

    if (!operator.trim()) {
      alert('担当者名を入力してください');
      return;
    }

    const dateISO = new Date(receiptDate).toISOString();

    confirmedItems.forEach((item) => {
      if (item.matchedProductId) {
        adjustStock(item.matchedProductId, item.quantity, 'in', {
          subType: 'purchase',
          date: dateISO,
          operator: operator.trim(),
          note: '納品書スキャン入荷',
        });
      }
    });

    alert(`${confirmedItems.length}件の入荷を処理しました（担当: ${operator}）`);

    // スキャン結果をクリア
    setScannedNotes([]);
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">納品書スキャン入荷</h1>
          </div>
          <div className="flex items-center space-x-4 flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-[#706e6b]" />
              <input
                type="text"
                placeholder="担当者名"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="input-field w-32"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-[#706e6b]" />
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="input-field w-auto"
              />
            </div>
            <button
              onClick={() => {
                setTempSettings(settings);
                setShowSettings(true);
              }}
              className="btn-secondary flex items-center space-x-1"
            >
              <Settings className="w-4 h-4" />
              <span>API設定</span>
            </button>
          </div>
        </div>
      </div>

      {/* API設定モーダル */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b border-[#e5e5e5]">
              <h2 className="text-lg font-bold text-[#181818]">OCR API設定</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* API選択 */}
              <div>
                <label className="block text-sm font-medium text-[#181818] mb-2">
                  使用するOCR API
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ocrApi"
                      checked={tempSettings.ocrApiType === 'openai'}
                      onChange={() => setTempSettings({ ...tempSettings, ocrApiType: 'openai' })}
                      className="w-4 h-4 text-[#0176d3]"
                    />
                    <span className="text-sm">OpenAI GPT-4o Vision</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ocrApi"
                      checked={tempSettings.ocrApiType === 'google'}
                      onChange={() => setTempSettings({ ...tempSettings, ocrApiType: 'google' })}
                      className="w-4 h-4 text-[#0176d3]"
                    />
                    <span className="text-sm">Google Cloud Vision</span>
                  </label>
                </div>
              </div>

              {/* OpenAI設定 */}
              <div className={`p-3 rounded border ${tempSettings.ocrApiType === 'openai' ? 'border-[#0176d3] bg-blue-50/30' : 'border-[#e5e5e5]'}`}>
                <label className="block text-sm font-medium text-[#181818] mb-1">
                  OpenAI APIキー
                  {tempSettings.ocrApiType === 'openai' && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="password"
                  value={tempSettings.openaiApiKey}
                  onChange={(e) => setTempSettings({ ...tempSettings, openaiApiKey: e.target.value })}
                  placeholder="sk-..."
                  className="input-field w-full"
                />
                <p className="text-xs text-[#706e6b] mt-1">
                  GPT-4o Visionを使用。高精度な読み取りと構造化が可能
                </p>
              </div>

              {/* Google設定 */}
              <div className={`p-3 rounded border ${tempSettings.ocrApiType === 'google' ? 'border-[#0176d3] bg-blue-50/30' : 'border-[#e5e5e5]'}`}>
                <label className="block text-sm font-medium text-[#181818] mb-1">
                  Google Cloud Vision APIキー
                  {tempSettings.ocrApiType === 'google' && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="password"
                  value={tempSettings.googleApiKey}
                  onChange={(e) => setTempSettings({ ...tempSettings, googleApiKey: e.target.value })}
                  placeholder="AIza..."
                  className="input-field w-full"
                />
                <p className="text-xs text-[#706e6b] mt-1">
                  月1,000回まで無料。日本語認識が高精度
                </p>
              </div>

              <div className="bg-[#f3f3f3] rounded p-3">
                <p className="text-sm font-medium text-[#181818] mb-2">API比較</p>
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-1"></th>
                      <th className="pb-1">OpenAI</th>
                      <th className="pb-1">Google</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#706e6b]">
                    <tr>
                      <td className="py-0.5">精度</td>
                      <td className="py-0.5">高（構造理解）</td>
                      <td className="py-0.5">高（文字認識）</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">料金</td>
                      <td className="py-0.5">従量課金</td>
                      <td className="py-0.5">月1000回無料</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">特徴</td>
                      <td className="py-0.5">商品行を自動抽出</td>
                      <td className="py-0.5">生テキスト取得</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e5e5] flex justify-end space-x-2">
              <button
                onClick={() => setShowSettings(false)}
                className="btn-secondary"
              >
                キャンセル
              </button>
              <button onClick={saveSettings} className="btn-primary">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ドラッグ＆ドロップ アップロードエリア */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`
          bg-white border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-[#0176d3] bg-blue-50 scale-[1.02]'
            : 'border-[#c9c9c9] hover:border-[#0176d3]'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isProcessing}
        />
        <div className="flex flex-col items-center space-y-4">
          {isProcessing ? (
            <Loader2 className="w-12 h-12 text-[#0176d3] animate-spin" />
          ) : isDragging ? (
            <Upload className="w-12 h-12 text-[#0176d3] animate-bounce" />
          ) : (
            <Upload className="w-12 h-12 text-[#706e6b]" />
          )}
          <div>
            <p className="text-lg font-medium text-[#181818]">
              {isProcessing
                ? 'OCR処理中...'
                : isDragging
                  ? 'ここにドロップ'
                  : '納品書をアップロード'}
            </p>
            <p className="text-sm text-[#706e6b] mt-1">
              画像ファイルをドラッグ＆ドロップ、またはクリックして選択（最大10枚）
            </p>
            <p className="text-xs text-[#0176d3] mt-2">
              使用API: {settings.ocrApiType === 'openai' ? 'OpenAI GPT-4o Vision' : 'Google Cloud Vision'}
            </p>
          </div>
        </div>
      </div>

      {/* スキャン結果一覧 */}
      {scannedNotes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#181818]">
              スキャン結果 ({scannedNotes.length}枚)
            </h2>
            {confirmedItems.length > 0 && (
              <button
                onClick={processReceipt}
                className="btn-success flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>{confirmedItems.length}件を入荷処理</span>
              </button>
            )}
          </div>

          {scannedNotes.map((note, noteIndex) => (
            <div
              key={note.id}
              className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden"
            >
              {/* ヘッダー */}
              <div
                className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#f3f3f3] ${
                  note.status === 'error' ? 'bg-red-50' : note.status === 'completed' ? 'bg-green-50' : ''
                }`}
                onClick={() => toggleExpanded(note.id)}
              >
                <div className="flex items-center space-x-3">
                  <FileImage className="w-5 h-5 text-[#706e6b]" />
                  <div>
                    <div className="font-medium text-[#181818]">
                      {noteIndex + 1}. {note.fileName}
                    </div>
                    <div className="text-sm text-[#706e6b]">
                      {note.status === 'pending' && '待機中...'}
                      {note.status === 'processing' && (
                        <span className="flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>OCR処理中...</span>
                        </span>
                      )}
                      {note.status === 'completed' && (
                        <span className="text-green-600">
                          {note.supplierName && `${note.supplierName} / `}
                          {note.items.length}件検出 /
                          {note.items.filter((i) => i.matched).length}件マッチ
                        </span>
                      )}
                      {note.status === 'error' && (
                        <span className="text-red-600">{note.error}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {note.status === 'completed' && (
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        note.items.filter((i) => i.matched).length === note.items.length
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {note.items.filter((i) => i.matched).length}/{note.items.length}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNote(note.id);
                    }}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {note.expanded ? (
                    <ChevronUp className="w-5 h-5 text-[#706e6b]" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[#706e6b]" />
                  )}
                </div>
              </div>

              {/* 詳細 */}
              {note.expanded && note.status === 'completed' && (
                <div className="border-t border-[#e5e5e5]">
                  {/* 納品書情報 */}
                  <div className="px-4 py-2 bg-[#f3f3f3] flex items-center space-x-4 text-sm">
                    {note.supplierName && (
                      <span>
                        <strong>仕入先:</strong> {note.supplierName}
                      </span>
                    )}
                    {note.noteDate && (
                      <span>
                        <strong>納品日:</strong> {note.noteDate}
                      </span>
                    )}
                    {note.noteNumber && (
                      <span>
                        <strong>納品書番号:</strong> {note.noteNumber}
                      </span>
                    )}
                  </div>

                  {/* 商品一覧 */}
                  <div className="overflow-x-auto">
                    <table className="slds-table w-full">
                      <thead>
                        <tr>
                          <th className="text-left">状態</th>
                          <th className="text-left">読み取り結果</th>
                          <th className="text-left">マッチ商品</th>
                          <th className="text-center">数量</th>
                          <th className="text-center">信頼度</th>
                          <th className="text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {note.items.map((item, itemIndex) => (
                          <tr
                            key={itemIndex}
                            className={item.matched ? 'bg-green-50/50' : 'bg-yellow-50/50'}
                          >
                            <td>
                              {item.matched ? (
                                <Check className="w-5 h-5 text-green-600" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                              )}
                            </td>
                            <td>
                              <div className="text-sm">{item.productName}</div>
                              <div className="text-xs text-[#706e6b] truncate max-w-xs">
                                {item.rawText}
                              </div>
                            </td>
                            <td>
                              <select
                                value={item.matchedProductId || ''}
                                onChange={(e) =>
                                  updateItemMatch(note.id, itemIndex, e.target.value)
                                }
                                className={`input-field w-full text-sm ${
                                  !item.matched ? 'border-yellow-400' : ''
                                }`}
                              >
                                <option value="">-- 選択 --</option>
                                {products.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name} ({product.id})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItemQuantity(
                                    note.id,
                                    itemIndex,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20 px-2 py-1 border border-[#c9c9c9] rounded text-right focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3] focus:outline-none"
                              />
                            </td>
                            <td className="text-center">
                              <div
                                className={`inline-block px-2 py-1 text-xs rounded-full ${
                                  item.confidence >= 80
                                    ? 'bg-green-100 text-green-700'
                                    : item.confidence >= 50
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {item.confidence}%
                              </div>
                            </td>
                            <td className="text-center">
                              <button
                                onClick={() => removeItem(note.id, itemIndex)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 生テキスト表示 */}
                  <details className="border-t border-[#e5e5e5]">
                    <summary className="px-4 py-2 cursor-pointer text-sm text-[#706e6b] hover:bg-[#f3f3f3]">
                      <Eye className="w-4 h-4 inline mr-1" />
                      OCR生テキストを表示
                    </summary>
                    <pre className="px-4 py-2 text-xs bg-[#f3f3f3] whitespace-pre-wrap overflow-x-auto max-h-60">
                      {note.rawText}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 入荷サマリー */}
      {confirmedItems.length > 0 && (
        <div className="bg-[#cdefc4] border border-[#2e844a]/30 rounded p-4 sticky bottom-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[#2e844a]">入荷確認済み</div>
              <div className="text-sm text-[#2e844a]/80">
                {confirmedItems.length}件 /
                合計数量: {confirmedItems.reduce((sum, i) => sum + i.quantity, 0)}個
              </div>
            </div>
            <button
              onClick={processReceipt}
              className="btn-success flex items-center space-x-2 h-10 px-6"
            >
              <Save className="w-5 h-5" />
              <span>入荷処理実行</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {scannedNotes.length === 0 && (
        <div className="bg-white border border-[#e5e5e5] rounded p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-[#706e6b]" />
          </div>
          <p className="text-[#706e6b]">
            納品書の画像をアップロードすると、自動で商品と数量を読み取ります
          </p>
          <p className="text-sm text-[#706e6b] mt-2">
            複数の納品書を一度にアップロードできます（最大10枚）
          </p>
        </div>
      )}
    </div>
  );
}
