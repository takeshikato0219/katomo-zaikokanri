import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Plus, Minus, Save, AlertCircle } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { decodeQRData } from '../utils/qrcode';
import type { Product } from '../types';
import { formatNumber } from '../utils/calculations';

export function QRScanner() {
  const { products, suppliers, getStock, adjustStock, setStock, getProductByBarcode } = useInventory();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState<'set' | 'in' | 'out'>('set');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop();
      }
    };
  }, []);

  const startScanning = async () => {
    setError(null);
    setSuccess(null);

    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScan(decodedText);
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

  const stopScanning = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setIsScanning(false);
  };

  const handleScan = (decodedText: string) => {
    // 1. まずJSON形式のQRコードとして解析
    const qrData = decodeQRData(decodedText);
    if (qrData) {
      const product = products.find((p) => p.id === qrData.productId);
      if (product) {
        setScannedProduct(product);
        setQuantity(getStock(product.id));
        stopScanning();
        return;
      }
    }

    // 2. 品番として検索
    const productById = products.find((p) => p.id === decodedText);
    if (productById) {
      setScannedProduct(productById);
      setQuantity(getStock(productById.id));
      stopScanning();
      return;
    }

    // 3. 商品に登録されたバーコードとして検索
    const productByBarcode = getProductByBarcode(decodedText);
    if (productByBarcode) {
      setScannedProduct(productByBarcode);
      setQuantity(getStock(productByBarcode.id));
      stopScanning();
      return;
    }

    setError('商品が見つかりません: ' + decodedText);
  };

  const handleSave = () => {
    if (!scannedProduct) return;

    if (adjustmentType === 'set') {
      setStock(scannedProduct.id, quantity);
    } else {
      adjustStock(scannedProduct.id, quantity, adjustmentType);
    }

    setSuccess(
      `${scannedProduct.name} の在庫を更新しました`
    );
    setScannedProduct(null);
    setQuantity(0);
  };

  const handleClose = () => {
    setScannedProduct(null);
    setQuantity(0);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">QRスキャン</h2>

      {/* 成功メッセージ */}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
          <span>{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="absolute top-0 right-0 p-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="absolute top-0 right-0 p-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* スキャナー */}
      {!scannedProduct && (
        <div className="card">
          <div
            id="qr-reader"
            className={`w-full max-w-md mx-auto ${isScanning ? '' : 'hidden'}`}
          />

          {!isScanning && (
            <div className="text-center py-12">
              <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                QRコードをスキャンして在庫を入力
              </p>
              <button onClick={startScanning} className="btn-primary">
                スキャン開始
              </button>
            </div>
          )}

          {isScanning && (
            <div className="text-center mt-4">
              <button onClick={stopScanning} className="btn-secondary">
                スキャン停止
              </button>
            </div>
          )}
        </div>
      )}

      {/* 商品詳細と数量入力 */}
      {scannedProduct && (
        <div className="card">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">商品を検出しました</h3>
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">品名</p>
              <p className="text-lg font-semibold">{scannedProduct.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">業者</p>
                <p className="font-medium">
                  {supplierMap.get(scannedProduct.supplierId) || '-'}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">現在庫</p>
                <p className="font-medium text-xl">
                  {formatNumber(getStock(scannedProduct.id))}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                操作タイプ
              </label>
              <select
                value={adjustmentType}
                onChange={(e) => setAdjustmentType(e.target.value as 'set' | 'in' | 'out')}
                className="input-field"
              >
                <option value="set">在庫数を設定</option>
                <option value="in">入庫（追加）</option>
                <option value="out">出庫（減少）</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {adjustmentType === 'set'
                  ? '新しい在庫数'
                  : adjustmentType === 'in'
                  ? '入庫数'
                  : '出庫数'}
              </label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setQuantity(Math.max(0, quantity - 1))}
                  className="p-3 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  <Minus className="w-6 h-6" />
                </button>
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  className="input-field text-center text-2xl font-bold flex-1"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-3 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex space-x-3">
              <button onClick={handleClose} className="btn-secondary flex-1">
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="btn-primary flex-1 flex items-center justify-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使い方 */}
      <div className="card">
        <h3 className="font-semibold mb-2">使い方</h3>
        <ol className="list-decimal list-inside text-gray-600 space-y-1 text-sm">
          <li>「スキャン開始」ボタンを押してカメラを起動</li>
          <li>商品のQRコードをカメラにかざす</li>
          <li>商品が検出されたら数量を入力</li>
          <li>「保存」ボタンで在庫を更新</li>
        </ol>
      </div>
    </div>
  );
}
