import { useState, useCallback, useMemo } from 'react';
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

// Google Cloud Vision APIキー設定
interface VisionApiSettings {
  apiKey: string;
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
  const [settings, setSettings] = useState<VisionApiSettings>(() => {
    const saved = localStorage.getItem('visionApiSettings');
    return saved ? JSON.parse(saved) : { apiKey: '' };
  });
  const [tempApiKey, setTempApiKey] = useState(settings.apiKey);

  // 設定保存
  const saveSettings = () => {
    const newSettings = { apiKey: tempApiKey };
    setSettings(newSettings);
    localStorage.setItem('visionApiSettings', JSON.stringify(newSettings));
    setShowSettings(false);
  };

  // ファイルアップロード処理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!settings.apiKey) {
      alert('Google Cloud Vision APIキーを設定してください');
      setShowSettings(true);
      return;
    }

    // 最大10ファイル
    const fileArray = Array.from(files).slice(0, 10);

    // 新しいスキャン項目を追加
    const newNotes: ScannedNote[] = await Promise.all(
      fileArray.map(async (file) => {
        const imageData = await fileToBase64(file);
        return {
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          fileName: file.name,
          imageData,
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

    // ファイル入力をリセット
    event.target.value = '';
  }, [settings.apiKey]);

  // ファイルをBase64に変換
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // data:image/xxx;base64, の部分を除去
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
        const result = await performOCR(note.imageData);

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

  // Google Cloud Vision API呼び出し
  const performOCR = async (base64Image: string): Promise<string> => {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${settings.apiKey}`,
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
      throw new Error(errorData.error?.message || 'API呼び出しに失敗しました');
    }

    const data = await response.json();
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!fullText) {
      throw new Error('テキストを検出できませんでした');
    }

    return fullText;
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

      // 既存商品とのマッチング
      let matched = false;
      let matchedProductId: string | undefined;
      let confidence = 30; // 基本信頼度

      // 完全一致を検索
      const exactMatch = products.find(
        (p) => p.name === productName || p.id === productName
      );
      if (exactMatch) {
        matched = true;
        matchedProductId = exactMatch.id;
        productName = exactMatch.name;
        confidence = 100;
      } else {
        // 部分一致を検索
        const partialMatch = products.find(
          (p) =>
            p.name.includes(productName) ||
            productName.includes(p.name) ||
            p.id.includes(productName)
        );
        if (partialMatch) {
          matched = true;
          matchedProductId = partialMatch.id;
          confidence = 70;
        }
      }

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

    return {
      supplierName,
      matchedSupplierId,
      noteDate,
      noteNumber,
      items,
    };
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
              onClick={() => setShowSettings(true)}
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-4 py-3 border-b border-[#e5e5e5]">
              <h2 className="text-lg font-bold text-[#181818]">Google Cloud Vision API設定</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#181818] mb-1">
                  APIキー
                </label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="input-field w-full"
                />
                <p className="text-xs text-[#706e6b] mt-1">
                  Google Cloud Consoleで取得したVision APIキーを入力してください
                </p>
              </div>
              <div className="bg-[#fef1cd] border border-[#dd7a01]/30 rounded p-3">
                <p className="text-sm text-[#181818]">
                  <strong>APIキーの取得方法:</strong>
                </p>
                <ol className="text-xs text-[#706e6b] mt-1 list-decimal list-inside space-y-1">
                  <li>Google Cloud Consoleにアクセス</li>
                  <li>Vision APIを有効化</li>
                  <li>認証情報からAPIキーを作成</li>
                </ol>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e5e5] flex justify-end space-x-2">
              <button
                onClick={() => {
                  setTempApiKey(settings.apiKey);
                  setShowSettings(false);
                }}
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

      {/* アップロードエリア */}
      <div className="bg-white border-2 border-dashed border-[#c9c9c9] rounded-lg p-8 text-center hover:border-[#0176d3] transition-colors">
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*,.pdf"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isProcessing}
        />
        <label
          htmlFor="file-upload"
          className={`cursor-pointer ${isProcessing ? 'opacity-50' : ''}`}
        >
          <div className="flex flex-col items-center space-y-4">
            {isProcessing ? (
              <Loader2 className="w-12 h-12 text-[#0176d3] animate-spin" />
            ) : (
              <Upload className="w-12 h-12 text-[#706e6b]" />
            )}
            <div>
              <p className="text-lg font-medium text-[#181818]">
                {isProcessing ? 'OCR処理中...' : '納品書をアップロード'}
              </p>
              <p className="text-sm text-[#706e6b] mt-1">
                画像ファイルをドラッグ＆ドロップ、またはクリックして選択（最大10枚）
              </p>
            </div>
          </div>
        </label>
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
                        <strong>���品書番号:</strong> {note.noteNumber}
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
