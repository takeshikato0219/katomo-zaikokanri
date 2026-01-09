import { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  X,
  Plus,
  Minus,
  Save,
  AlertCircle,
  Check,
  Mic,
  MicOff,
  Package,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  Smartphone,
  RotateCcw,
  Trash2,
  Search,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { decodeQRData } from '../utils/qrcode';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { isAIEnabled } from '../services/ai/openai-client';
import { VoiceReceiptDialog, type VoiceReceiptItem } from './VoiceReceiptDialog';
import type { Product } from '../types';

interface ReceiptItem {
  product: Product;
  quantity: number;
  unit: string;
  subType: 'purchase' | 'stockIn';
  customerId?: string;
  customerName?: string;
}

export function MobileReceiptProcessing() {
  const {
    products,
    customers,
    stocks,
    suppliers,
    getStock,
    adjustStock,
    getSupplierById,
    getCustomerById,
    getProductByBarcode,
  } = useInventory();

  // 基本設定
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [operator, setOperator] = useState('');

  // スキャン状態
  const [isScanning, setIsScanning] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 入荷リスト
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [expandedItemIndex, setExpandedItemIndex] = useState<number | null>(null);

  // 確認モーダル
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // メッセージ
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // AI利用可能チェック
  const isAIAvailable = isAIEnabled();

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop();
      }
    };
  }, []);

  // 合計金額
  const totalAmount = useMemo(() => {
    return receiptItems.reduce((sum, item) => sum + item.quantity * item.product.unitPrice, 0);
  }, [receiptItems]);

  // 選択されたメーカーの商品リスト（検索対応）
  const filteredProductsBySupplier = useMemo(() => {
    if (!selectedSupplierId) return [];
    let filtered = products.filter(p => p.supplierId === selectedSupplierId);
    if (productSearchQuery) {
      const query = productSearchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [products, selectedSupplierId, productSearchQuery]);

  // メーカーごとの商品数
  const productCountBySupplier = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(p => {
      counts.set(p.supplierId, (counts.get(p.supplierId) || 0) + 1);
    });
    return counts;
  }, [products]);

  // カメラスキャン開始
  const startCameraScanning = async () => {
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode('mobile-qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 280 },
        },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {
          // スキャンエラーは無視
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error('カメラの起動に失敗しました:', err);
      setError('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
  };

  // スキャン停止
  const stopScanning = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setIsScanning(false);
  };

  // スキャン結果処理
  const handleScanResult = (decodedText: string) => {
    // 振動フィードバック（対応デバイスの場合）
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }

    let foundProduct: Product | undefined;

    // 1. JSON形式のQRコードとして解析
    const qrData = decodeQRData(decodedText);
    if (qrData) {
      foundProduct = products.find((p) => p.id === qrData.productId);
    }

    // 2. 品番として検索
    if (!foundProduct) {
      foundProduct = products.find((p) => p.id === decodedText);
    }

    // 3. バーコードとして検索
    if (!foundProduct) {
      foundProduct = getProductByBarcode(decodedText);
    }

    if (foundProduct) {
      addProductToList(foundProduct);
      // 連続スキャンのため停止しない
    } else {
      setError(`商品が見つかりません: ${decodedText}`);
    }
  };

  // 商品をリストに追加（QRスキャン用）
  const addProductToList = (product: Product) => {
    setReceiptItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id && !item.customerId);
      if (existingIndex >= 0) {
        // 既存の商品の数量を+1
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      } else {
        // 新規追加
        return [
          ...prev,
          {
            product,
            quantity: 1,
            unit: '個',
            subType: 'purchase',
          },
        ];
      }
    });
    setSuccess(`${product.name} を追加しました`);
    setTimeout(() => setSuccess(null), 2000);
  };

  // 音声入力完了ハンドラー
  const handleVoiceComplete = (items: VoiceReceiptItem[]) => {
    setShowVoiceDialog(false);

    if (items.length === 0) return;

    // 入荷リストに追加
    const newItems: ReceiptItem[] = items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      subType: item.customerId ? 'stockIn' : 'purchase',
      customerId: item.customerId,
      customerName: item.customerName,
    }));

    setReceiptItems((prev) => [...prev, ...newItems]);
    setSuccess(`${items.length}件の商品を追加しました`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // 数量変更
  const updateQuantity = (index: number, delta: number) => {
    setReceiptItems((prev) => {
      const updated = [...prev];
      const newQty = Math.max(1, updated[index].quantity + delta);
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  // 数量直接設定
  const setQuantity = (index: number, quantity: number) => {
    setReceiptItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: Math.max(1, quantity) };
      return updated;
    });
  };

  // 区分変更
  const updateSubType = (index: number, subType: 'purchase' | 'stockIn') => {
    setReceiptItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], subType };
      return updated;
    });
  };

  // 顧客変更
  const updateCustomer = (index: number, customerId: string) => {
    setReceiptItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], customerId: customerId || undefined };
      return updated;
    });
  };

  // アイテム削除
  const removeItem = (index: number) => {
    setReceiptItems((prev) => prev.filter((_, i) => i !== index));
    if (expandedItemIndex === index) {
      setExpandedItemIndex(null);
    }
  };

  // 全削除
  const clearAll = () => {
    setReceiptItems([]);
    setExpandedItemIndex(null);
  };

  // 入荷処理実行
  const processReceipt = () => {
    if (receiptItems.length === 0) {
      setError('入荷商品がありません');
      return;
    }

    if (!operator.trim()) {
      setError('担当者名を入力してください');
      return;
    }

    const dateISO = new Date(receiptDate).toISOString();

    receiptItems.forEach((item) => {
      // 顧客名は customerName を優先、なければ getCustomerById で取得
      const customerName = item.customerName || (item.customerId ? getCustomerById(item.customerId)?.name : null);
      const notePrefix = item.subType === 'stockIn' ? '在庫分仕入' : '仕入';
      const unitInfo = item.unit !== '個' ? ` (${item.unit})` : '';
      const note = customerName
        ? `${notePrefix}（${customerName}分）${unitInfo}[スマホ入荷]`
        : `${notePrefix}${unitInfo} [スマホ入荷]`;

      adjustStock(item.product.id, item.quantity, 'in', {
        subType: item.subType,
        date: dateISO,
        operator: operator.trim(),
        customerId: item.customerId,
        note,
      });
    });

    setSuccess(`${receiptItems.length}件の入荷を処理しました`);
    setReceiptItems([]);
    setShowConfirmModal(false);
    setExpandedItemIndex(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* ヘッダー */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Smartphone className="w-5 h-5 text-[#0176d3]" />
          <h1 className="text-lg font-bold text-[#181818]">入荷（スマホ操作）</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#706e6b] mb-1">担当者</label>
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-[#706e6b]" />
              <input
                type="text"
                placeholder="名前"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#706e6b] mb-1">入荷日</label>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-[#706e6b]" />
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* メッセージ */}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-5 h-5" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* スキャンエリア */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e5e5] bg-[#f3f3f3]">
          <h2 className="text-sm font-bold text-[#181818]">商品スキャン</h2>
        </div>

        <div className="p-4">
          {/* スキャンボタン */}
          {!isScanning && (
            <div className="flex flex-col space-y-3">
              <button
                onClick={startCameraScanning}
                className="btn-primary w-full py-4 flex items-center justify-center space-x-3 text-lg"
              >
                <Camera className="w-6 h-6" />
                <span>QR/バーコードをスキャン</span>
              </button>

              {isAIAvailable ? (
                <button
                  onClick={() => setShowVoiceDialog(true)}
                  className="bg-purple-500 hover:bg-purple-600 text-white w-full py-4 rounded-lg flex items-center justify-center space-x-3 text-lg transition-colors"
                >
                  <Mic className="w-6 h-6" />
                  <span>音声で入荷（対話式）</span>
                </button>
              ) : (
                <button
                  disabled
                  className="bg-gray-200 text-gray-400 w-full py-4 rounded-lg flex items-center justify-center space-x-3 text-lg cursor-not-allowed"
                  title="音声入力を使用するにはOpenAI APIキーを設定してください"
                >
                  <MicOff className="w-6 h-6" />
                  <span>音声入力（API未設定）</span>
                </button>
              )}

              <button
                onClick={() => setShowSupplierPicker(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white w-full py-4 rounded-lg flex items-center justify-center space-x-3 text-lg transition-colors"
              >
                <Building2 className="w-6 h-6" />
                <span>メーカーから選ぶ</span>
              </button>
            </div>
          )}

          {/* カメラスキャン中 */}
          {isScanning && (
            <div>
              <div
                id="mobile-qr-reader"
                className="w-full max-w-sm mx-auto rounded-lg overflow-hidden"
              />
              <p className="text-center text-sm text-[#706e6b] mt-3">
                QRコードまたはバーコードをカメラにかざしてください
              </p>
              <button
                onClick={stopScanning}
                className="btn-secondary w-full mt-4 py-3"
              >
                スキャン停止
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 音声入荷ダイアログ */}
      {showVoiceDialog && (
        <VoiceReceiptDialog
          products={products}
          customers={customers}
          stocks={stocks}
          suppliers={suppliers}
          onComplete={handleVoiceComplete}
          onClose={() => setShowVoiceDialog(false)}
        />
      )}

      {/* メーカーから選ぶダイアログ */}
      {showSupplierPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-orange-500 text-white flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5" />
                <h3 className="text-lg font-bold">
                  {selectedSupplierId ? 'メーカーから選ぶ' : 'メーカー選択'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowSupplierPicker(false);
                  setSelectedSupplierId(null);
                  setProductSearchQuery('');
                }}
                className="p-1 hover:bg-white/20 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              {/* メーカー選択画面 */}
              {!selectedSupplierId && (
                <div className="divide-y divide-[#e5e5e5]">
                  {suppliers.map(supplier => {
                    const count = productCountBySupplier.get(supplier.id) || 0;
                    return (
                      <button
                        key={supplier.id}
                        onClick={() => setSelectedSupplierId(supplier.id)}
                        className="w-full px-4 py-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <Building2 className="w-5 h-5 text-orange-500" />
                          <span className="font-medium text-[#181818]">{supplier.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-[#706e6b]">{count}品目</span>
                          <ChevronRight className="w-5 h-5 text-[#706e6b]" />
                        </div>
                      </button>
                    );
                  })}
                  {suppliers.length === 0 && (
                    <div className="p-8 text-center text-[#706e6b]">
                      メーカーが登録されていません
                    </div>
                  )}
                </div>
              )}

              {/* 商品選択画面 */}
              {selectedSupplierId && (
                <>
                  {/* 戻るボタン＋検索 */}
                  <div className="sticky top-0 bg-white border-b border-[#e5e5e5] p-3 space-y-2">
                    <button
                      onClick={() => {
                        setSelectedSupplierId(null);
                        setProductSearchQuery('');
                      }}
                      className="flex items-center space-x-1 text-orange-600 text-sm font-medium"
                    >
                      <ChevronDown className="w-4 h-4 rotate-90" />
                      <span>メーカー一覧に戻る</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-orange-500" />
                      <span className="font-bold text-[#181818]">
                        {getSupplierById(selectedSupplierId)?.name}
                      </span>
                      <span className="text-sm text-[#706e6b]">
                        ({filteredProductsBySupplier.length}品目)
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#706e6b]" />
                      <input
                        type="text"
                        placeholder="商品名で絞り込み..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-[#c9c9c9] rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  {/* 商品リスト */}
                  <div className="divide-y divide-[#e5e5e5]">
                    {filteredProductsBySupplier.map(product => {
                      const stock = getStock(product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => {
                            addProductToList(product);
                            // ダイアログは閉じずに続けて選択できる
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-green-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[#181818] truncate">{product.name}</p>
                              <p className="text-xs text-[#706e6b]">
                                品番: {product.id} / 在庫: {formatNumber(stock)}
                              </p>
                            </div>
                            <div className="ml-3 flex items-center space-x-2">
                              <span className="text-sm font-medium text-[#2e844a]">
                                {formatCurrency(product.unitPrice)}
                              </span>
                              <Plus className="w-5 h-5 text-green-500" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredProductsBySupplier.length === 0 && (
                      <div className="p-8 text-center text-[#706e6b]">
                        {productSearchQuery ? '該当する商品がありません' : '商品がありません'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* フッター */}
            <div className="px-4 py-3 border-t border-[#e5e5e5] bg-gray-50 flex-shrink-0">
              <button
                onClick={() => {
                  setShowSupplierPicker(false);
                  setSelectedSupplierId(null);
                  setProductSearchQuery('');
                }}
                className="w-full btn-secondary py-3"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 入荷リスト */}
      {receiptItems.length > 0 && (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
          <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-[#0176d3]" />
              <h2 className="text-sm font-bold text-[#181818]">
                入荷リスト ({receiptItems.length}件)
              </h2>
            </div>
            <button
              onClick={clearAll}
              className="text-sm text-red-500 hover:text-red-700 flex items-center space-x-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span>全削除</span>
            </button>
          </div>

          <div className="divide-y divide-[#e5e5e5]">
            {receiptItems.map((item, index) => (
              <div key={`${item.product.id}-${index}`} className="p-3">
                {/* メイン行 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-[#181818] truncate">{item.product.name}</p>
                      {item.customerName && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                          {item.customerName}分
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#706e6b]">
                      {getSupplierById(item.product.supplierId)?.name || '不明'} /
                      現在庫: {formatNumber(getStock(item.product.id))}
                      {item.unit !== '個' && ` / 単位: ${item.unit}`}
                    </p>
                  </div>

                  {/* 数量調整 */}
                  <div className="flex items-center space-x-2 ml-3">
                    <button
                      onClick={() => updateQuantity(index, -1)}
                      className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center active:bg-gray-300"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => setQuantity(index, parseInt(e.target.value) || 1)}
                      className="w-14 h-10 text-center text-lg font-bold border border-[#c9c9c9] rounded-lg"
                    />
                    <button
                      onClick={() => updateQuantity(index, 1)}
                      className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center active:bg-gray-300"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* 展開ボタン */}
                  <button
                    onClick={() => setExpandedItemIndex(expandedItemIndex === index ? null : index)}
                    className="ml-2 p-2 text-[#706e6b]"
                  >
                    {expandedItemIndex === index ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* 展開エリア */}
                {expandedItemIndex === index && (
                  <div className="mt-3 pt-3 border-t border-[#e5e5e5] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#706e6b] mb-1">区分</label>
                        <select
                          value={item.subType}
                          onChange={(e) => updateSubType(index, e.target.value as 'purchase' | 'stockIn')}
                          className="input-field text-sm"
                        >
                          <option value="purchase">仕入</option>
                          <option value="stockIn">在庫分仕入</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[#706e6b] mb-1">誰分</label>
                        <select
                          value={item.customerId || ''}
                          onChange={(e) => updateCustomer(index, e.target.value)}
                          className="input-field text-sm"
                        >
                          <option value="">-- 選択 --</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#706e6b]">
                        単価: {formatCurrency(item.product.unitPrice)}
                      </span>
                      <span className="font-bold text-[#2e844a]">
                        小計: {formatCurrency(item.quantity * item.product.unitPrice)}
                      </span>
                    </div>

                    <button
                      onClick={() => removeItem(index)}
                      className="w-full py-2 text-red-500 border border-red-300 rounded-lg flex items-center justify-center space-x-2 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>削除</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 固定フッター */}
      {receiptItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#cdefc4] border-t border-[#2e844a]/30 p-4 shadow-lg z-50">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-[#2e844a]/80">
                  {receiptItems.length}件 /
                  合計数量: {receiptItems.reduce((sum, i) => sum + i.quantity, 0)}個
                </p>
                <p className="text-xl font-bold text-[#2e844a]">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <button
                onClick={() => setShowConfirmModal(true)}
                className="btn-success py-3 px-6 text-lg flex items-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>入荷処理</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確認モーダル */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#181818]">入荷確認</h3>
              <button onClick={() => setShowConfirmModal(false)}>
                <X className="w-5 h-5 text-[#706e6b]" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#706e6b]">担当者:</span>
                  <span className="font-medium">{operator || '未入力'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#706e6b]">入荷日:</span>
                  <span className="font-medium">{receiptDate}</span>
                </div>
              </div>

              <div className="border border-[#e5e5e5] rounded-lg divide-y divide-[#e5e5e5]">
                {receiptItems.map((item, index) => (
                  <div key={`confirm-${item.product.id}-${index}`} className="p-3">
                    <div className="flex justify-between">
                      <span className="font-medium">{item.product.name}</span>
                      <span className="font-bold">{item.quantity}{item.unit}</span>
                    </div>
                    <div className="text-xs text-[#706e6b] mt-1">
                      {item.subType === 'stockIn' ? '在庫分仕入' : '仕入'}
                      {(item.customerName || item.customerId) &&
                        ` / ${item.customerName || getCustomerById(item.customerId!)?.name}分`}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-[#cdefc4] rounded-lg">
                <div className="flex justify-between">
                  <span className="text-[#2e844a]">合計金額</span>
                  <span className="text-xl font-bold text-[#2e844a]">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#e5e5e5] flex space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary flex-1 py-3"
              >
                キャンセル
              </button>
              <button
                onClick={processReceipt}
                disabled={!operator.trim()}
                className="btn-success flex-1 py-3 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
                <span>確定</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使い方 */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <h3 className="font-semibold text-[#181818] mb-2">使い方</h3>
        <ol className="list-decimal list-inside text-sm text-[#706e6b] space-y-1">
          <li>担当者名と入荷日を入力</li>
          <li>「QR/バーコードをスキャン」または「音声で入荷」をタップ</li>
          <li>商品をスキャンまたは音声で指定</li>
          <li>必要に応じて数量・区分を調整</li>
          <li>「入荷処理」ボタンで確定</li>
        </ol>
        <div className="mt-3 p-3 bg-purple-50 rounded-lg">
          <p className="text-sm text-purple-700 mb-2">
            <strong>音声入荷（対話式）の流れ:</strong>
          </p>
          <ol className="list-decimal list-inside text-sm text-purple-600 space-y-0.5">
            <li>「誰の分ですか？」→「山田さん」など</li>
            <li>「商品名は？」→「オイルフィルター」など</li>
            <li>「数量は？」→「5個」「10メートル」など</li>
            <li>確認後、続けて入荷できます</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
