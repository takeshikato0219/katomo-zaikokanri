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
import { VoiceUsageDialog, type VoiceUsageItem } from './VoiceUsageDialog';
import type { Product } from '../types';

interface UsageItem {
  product: Product;
  quantity: number;
  unit: string;
  customerId: string;
  customerName: string;
}

export function MobileUsageProcessing() {
  const {
    products,
    customers,
    stocks,
    suppliers,
    getStock,
    adjustStock,
    getSupplierById,
    getProductByBarcode,
    addCustomer,
  } = useInventory();

  // 基本設定
  const [usageDate, setUsageDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [operator, setOperator] = useState('');

  // 顧客選択
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // スキャン状態
  const [isScanning, setIsScanning] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 使用リスト
  const [usageItems, setUsageItems] = useState<UsageItem[]>([]);
  const [expandedItemIndex, setExpandedItemIndex] = useState<number | null>(null);

  // 確認モーダル
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // メッセージ
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // AI利用可能チェック
  const isAIAvailable = isAIEnabled();

  // 選択中の顧客
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop();
      }
    };
  }, []);

  // 顧客検索結果
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return customers;
    const term = customerSearchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.furigana?.toLowerCase().includes(term) ||
        c.phone?.includes(term)
    );
  }, [customers, customerSearchTerm]);

  // 合計金額
  const totalAmount = useMemo(() => {
    return usageItems.reduce((sum, item) => sum + item.quantity * item.product.unitPrice, 0);
  }, [usageItems]);

  // 選択されたメーカーの商品リスト（検索対応、在庫ありのみ）
  const filteredProductsBySupplier = useMemo(() => {
    if (!selectedSupplierId) return [];
    let filtered = products.filter(p => {
      if (p.supplierId !== selectedSupplierId) return false;
      const stock = getStock(p.id);
      return stock > 0;
    });
    if (productSearchQuery) {
      const query = productSearchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [products, selectedSupplierId, productSearchQuery, getStock]);

  // メーカーごとの商品数（在庫ありのみ）
  const productCountBySupplier = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(p => {
      const stock = getStock(p.id);
      if (stock > 0) {
        counts.set(p.supplierId, (counts.get(p.supplierId) || 0) + 1);
      }
    });
    return counts;
  }, [products, getStock]);

  // 新規顧客追加
  const handleAddNewCustomer = () => {
    if (!newCustomerName.trim()) {
      setError('顧客名を入力してください');
      return;
    }
    const customer = addCustomer({ name: newCustomerName.trim() });
    setSelectedCustomerId(customer.id);
    setNewCustomerName('');
    setShowNewCustomerForm(false);
    setCustomerSearchTerm('');
    setSuccess(`${customer.name}様を登録しました`);
    setTimeout(() => setSuccess(null), 2000);
  };

  // カメラスキャン開始
  const startCameraScanning = async () => {
    if (!selectedCustomerId) {
      setError('先に顧客を選択してください');
      return;
    }
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode('mobile-usage-qr-reader');
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
      const stock = getStock(foundProduct.id);
      if (stock <= 0) {
        setError(`${foundProduct.name} は在庫がありません`);
        return;
      }
      addProductToList(foundProduct);
      // 連続スキャンのため停止しない
    } else {
      setError(`商品が見つかりません: ${decodedText}`);
    }
  };

  // 商品をリストに追加（QRスキャン用）
  const addProductToList = (product: Product) => {
    if (!selectedCustomerId || !selectedCustomer) {
      setError('先に顧客を選択してください');
      return;
    }

    const stock = getStock(product.id);
    if (stock <= 0) {
      setError(`${product.name} は在庫がありません`);
      return;
    }

    setUsageItems((prev) => {
      const existingIndex = prev.findIndex((item) =>
        item.product.id === product.id && item.customerId === selectedCustomerId
      );
      if (existingIndex >= 0) {
        // 既存の商品の数量を+1（在庫上限チェック）
        const updated = [...prev];
        const newQty = updated[existingIndex].quantity + 1;
        if (newQty <= stock) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: newQty,
          };
        } else {
          setError(`${product.name} の在庫上限に達しています（在庫: ${stock}）`);
        }
        return updated;
      } else {
        // 新規追加
        return [
          ...prev,
          {
            product,
            quantity: 1,
            unit: '個',
            customerId: selectedCustomerId,
            customerName: selectedCustomer.name,
          },
        ];
      }
    });
    setSuccess(`${product.name} を追加しました`);
    setTimeout(() => setSuccess(null), 2000);
  };

  // 音声入力完了ハンドラー
  const handleVoiceComplete = (items: VoiceUsageItem[]) => {
    setShowVoiceDialog(false);

    if (items.length === 0) return;

    // 使用リストに追加
    const newItems: UsageItem[] = items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      customerId: item.customerId,
      customerName: item.customerName,
    }));

    setUsageItems((prev) => [...prev, ...newItems]);
    setSuccess(`${items.length}件の商品を追加しました`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // 数量変更（在庫上限あり）
  const updateQuantity = (index: number, delta: number) => {
    setUsageItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const stock = getStock(item.product.id);
      const newQty = Math.max(1, Math.min(item.quantity + delta, stock));
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  // 数量直接設定（在庫上限あり）
  const setQuantity = (index: number, quantity: number) => {
    setUsageItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const stock = getStock(item.product.id);
      updated[index] = { ...item, quantity: Math.max(1, Math.min(quantity, stock)) };
      return updated;
    });
  };

  // 顧客変更
  const updateCustomer = (index: number, customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    setUsageItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        customerId,
        customerName: customer.name,
      };
      return updated;
    });
  };

  // アイテム削除
  const removeItem = (index: number) => {
    setUsageItems((prev) => prev.filter((_, i) => i !== index));
    if (expandedItemIndex === index) {
      setExpandedItemIndex(null);
    }
  };

  // 全削除
  const clearAll = () => {
    setUsageItems([]);
    setExpandedItemIndex(null);
  };

  // 使用処理実行
  const processUsage = () => {
    if (usageItems.length === 0) {
      setError('使用商品がありません');
      return;
    }

    if (!operator.trim()) {
      setError('担当者名を入力してください');
      return;
    }

    const dateISO = new Date(usageDate).toISOString();

    usageItems.forEach((item) => {
      const unitInfo = item.unit !== '個' ? ` (${item.unit})` : '';
      const note = `${item.customerName}様使用${unitInfo} [スマホ使用]`;

      adjustStock(item.product.id, item.quantity, 'out', {
        subType: 'usage',
        date: dateISO,
        operator: operator.trim(),
        customerId: item.customerId,
        note,
      });
    });

    setSuccess(`${usageItems.length}件の使用を処理しました`);
    setUsageItems([]);
    setShowConfirmModal(false);
    setExpandedItemIndex(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* ヘッダー */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Smartphone className="w-5 h-5 text-[#dd7a01]" />
          <h1 className="text-lg font-bold text-[#181818]">使用（スマホ操作）</h1>
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
            <label className="block text-xs text-[#706e6b] mb-1">使用日</label>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-[#706e6b]" />
              <input
                type="date"
                value={usageDate}
                onChange={(e) => setUsageDate(e.target.value)}
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

      {/* 顧客選択カード */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5] bg-[#fef1cd]/30">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-[#dd7a01]" />
            <h2 className="text-sm font-bold text-[#181818]">顧客選択</h2>
          </div>
        </div>
        <div className="p-4">
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-4 bg-[#fef1cd]/30 border border-[#dd7a01]/20 rounded">
              <div>
                <div className="font-medium text-lg text-[#181818]">{selectedCustomer.name}様</div>
                {selectedCustomer.phone && (
                  <div className="text-sm text-[#706e6b]">{selectedCustomer.phone}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedCustomerId('')}
                className="btn-secondary"
              >
                変更
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#706e6b] w-4 h-4" />
                <input
                  type="text"
                  placeholder="顧客名または電話番号で検索..."
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setCustomerSearchTerm('');
                    }}
                    className="p-3 border border-[#e5e5e5] rounded hover:bg-[#fef1cd]/20 hover:border-[#dd7a01]/30 text-left transition-colors"
                  >
                    <div className="font-medium text-sm text-[#181818] truncate">{customer.name}</div>
                    {customer.phone && (
                      <div className="text-xs text-[#706e6b]">{customer.phone}</div>
                    )}
                  </button>
                ))}
              </div>

              {showNewCustomerForm ? (
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="新規顧客名"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button onClick={handleAddNewCustomer} className="bg-[#dd7a01] hover:bg-[#ba6700] text-white px-4 py-2 rounded">
                    登録
                  </button>
                  <button
                    onClick={() => setShowNewCustomerForm(false)}
                    className="btn-secondary"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCustomerForm(true)}
                  className="btn-secondary w-full flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>新規顧客を追加</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
                disabled={!selectedCustomerId}
                className={`w-full py-4 flex items-center justify-center space-x-3 text-lg rounded-lg transition-colors ${
                  selectedCustomerId
                    ? 'bg-[#dd7a01] hover:bg-[#ba6700] text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Camera className="w-6 h-6" />
                <span>QR/バーコードをスキャン</span>
              </button>

              {isAIAvailable ? (
                <button
                  onClick={() => setShowVoiceDialog(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white w-full py-4 rounded-lg flex items-center justify-center space-x-3 text-lg transition-colors"
                >
                  <Mic className="w-6 h-6" />
                  <span>音声で使用（一括入力）</span>
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
                onClick={() => {
                  if (!selectedCustomerId) {
                    setError('先に顧客を選択してください');
                    return;
                  }
                  setShowSupplierPicker(true);
                }}
                disabled={!selectedCustomerId}
                className={`w-full py-4 rounded-lg flex items-center justify-center space-x-3 text-lg transition-colors ${
                  selectedCustomerId
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Building2 className="w-6 h-6" />
                <span>メーカーから選ぶ</span>
              </button>

              {!selectedCustomerId && (
                <p className="text-center text-sm text-[#dd7a01]">
                  先に顧客を選択してください
                </p>
              )}
            </div>
          )}

          {/* カメラスキャン中 */}
          {isScanning && (
            <div>
              <div
                id="mobile-usage-qr-reader"
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

      {/* 音声使用ダイアログ */}
      {showVoiceDialog && (
        <VoiceUsageDialog
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
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-amber-500 text-white flex-shrink-0">
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
                    if (count === 0) return null;
                    return (
                      <button
                        key={supplier.id}
                        onClick={() => setSelectedSupplierId(supplier.id)}
                        className="w-full px-4 py-4 flex items-center justify-between hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <Building2 className="w-5 h-5 text-amber-500" />
                          <span className="font-medium text-[#181818]">{supplier.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-[#706e6b]">{count}品目</span>
                          <ChevronRight className="w-5 h-5 text-[#706e6b]" />
                        </div>
                      </button>
                    );
                  })}
                  {[...productCountBySupplier.values()].every(c => c === 0) && (
                    <div className="p-8 text-center text-[#706e6b]">
                      在庫のある商品がありません
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
                      className="flex items-center space-x-1 text-amber-600 text-sm font-medium"
                    >
                      <ChevronDown className="w-4 h-4 rotate-90" />
                      <span>メーカー一覧に戻る</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-amber-500" />
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
                          className="w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[#181818] truncate">{product.name}</p>
                              <p className="text-xs text-[#706e6b]">
                                品番: {product.id} / 在庫: <span className="font-bold text-blue-600">{formatNumber(stock)}</span>
                              </p>
                            </div>
                            <div className="ml-3 flex items-center space-x-2">
                              <span className="text-sm font-medium text-[#dd7a01]">
                                {formatCurrency(product.unitPrice)}
                              </span>
                              <Minus className="w-5 h-5 text-orange-500" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredProductsBySupplier.length === 0 && (
                      <div className="p-8 text-center text-[#706e6b]">
                        {productSearchQuery ? '該当する商品がありません' : '在庫のある商品がありません'}
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

      {/* 使用リスト */}
      {usageItems.length > 0 && (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
          <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-[#dd7a01]" />
              <h2 className="text-sm font-bold text-[#181818]">
                使用リスト ({usageItems.length}件)
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
            {usageItems.map((item, index) => {
              const stock = getStock(item.product.id);
              return (
                <div key={`${item.product.id}-${item.customerId}-${index}`} className="p-3">
                  {/* メイン行 */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-[#181818] truncate">{item.product.name}</p>
                        <span className="text-xs bg-[#fef1cd] text-[#dd7a01] px-1.5 py-0.5 rounded">
                          {item.customerName}様
                        </span>
                      </div>
                      <p className="text-xs text-[#706e6b]">
                        {getSupplierById(item.product.supplierId)?.name || '不明'} /
                        在庫: {formatNumber(stock)}
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
                        max={stock}
                        value={item.quantity}
                        onChange={(e) => setQuantity(index, parseInt(e.target.value) || 1)}
                        className="w-14 h-10 text-center text-lg font-bold border border-[#dd7a01] rounded-lg"
                      />
                      <button
                        onClick={() => updateQuantity(index, 1)}
                        disabled={item.quantity >= stock}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          item.quantity >= stock
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-200 active:bg-gray-300'
                        }`}
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
                      <div>
                        <label className="block text-xs text-[#706e6b] mb-1">顧客</label>
                        <select
                          value={item.customerId}
                          onChange={(e) => updateCustomer(index, e.target.value)}
                          className="input-field text-sm"
                        >
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#706e6b]">
                          単価: {formatCurrency(item.product.unitPrice)}
                        </span>
                        <span className="font-bold text-[#dd7a01]">
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
              );
            })}
          </div>
        </div>
      )}

      {/* 固定フッター */}
      {usageItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#fef1cd] border-t border-[#dd7a01]/30 p-4 shadow-lg z-50">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-[#dd7a01]/80">
                  {usageItems.length}件 /
                  合計数量: {usageItems.reduce((sum, i) => sum + i.quantity, 0)}個
                </p>
                <p className="text-xl font-bold text-[#dd7a01]">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <button
                onClick={() => setShowConfirmModal(true)}
                className="bg-[#dd7a01] hover:bg-[#ba6700] text-white py-3 px-6 text-lg rounded-lg flex items-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>使用処理</span>
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
              <h3 className="text-lg font-bold text-[#181818]">使用確認</h3>
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
                  <span className="text-[#706e6b]">使用日:</span>
                  <span className="font-medium">{usageDate}</span>
                </div>
              </div>

              <div className="border border-[#e5e5e5] rounded-lg divide-y divide-[#e5e5e5]">
                {usageItems.map((item, index) => (
                  <div key={`confirm-${item.product.id}-${index}`} className="p-3">
                    <div className="flex justify-between">
                      <span className="font-medium">{item.product.name}</span>
                      <span className="font-bold">{item.quantity}{item.unit}</span>
                    </div>
                    <div className="text-xs text-[#706e6b] mt-1">
                      {item.customerName}様
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-[#fef1cd] rounded-lg">
                <div className="flex justify-between">
                  <span className="text-[#dd7a01]">合計金額</span>
                  <span className="text-xl font-bold text-[#dd7a01]">
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
                onClick={processUsage}
                disabled={!operator.trim()}
                className="bg-[#dd7a01] hover:bg-[#ba6700] text-white flex-1 py-3 rounded-lg flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <li>担当者名と使用日を入力</li>
          <li>顧客を選択</li>
          <li>「QR/バーコードをスキャン」または「音声で使用」をタップ</li>
          <li>商品をスキャンまたは音声で指定</li>
          <li>必要に応じて数量を調整</li>
          <li>「使用処理」ボタンで確定</li>
        </ol>
        <div className="mt-3 p-3 bg-orange-50 rounded-lg">
          <p className="text-sm text-orange-700 mb-2">
            <strong>音声使用（一括入力）の例:</strong>
          </p>
          <ul className="list-disc list-inside text-sm text-orange-600 space-y-0.5">
            <li>「山田さん オイル2個 フィルター3個」</li>
            <li>「鈴木様分 マックスファン1個」</li>
            <li>複数の顧客も一度に言えます</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
