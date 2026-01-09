import { useState, useMemo } from 'react';
import { Search, Plus, Minus, Save } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { formatNumber } from '../utils/calculations';

export function InventoryInput() {
  const {
    products,
    suppliers,
    getStock,
    adjustStock,
    setStock,
  } = useInventory();

  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out' | 'set'>('set');

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSupplier =
        !supplierFilter || product.supplierId === supplierFilter;

      return matchesSearch && matchesSupplier;
    });
  }, [products, searchTerm, supplierFilter]);

  const handleAdjustmentChange = (productId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setAdjustments((prev) => ({
      ...prev,
      [productId]: numValue,
    }));
  };

  const handleQuickAdjust = (productId: string, delta: number) => {
    const currentAdjustment = adjustments[productId] || 0;
    const newValue = Math.max(0, currentAdjustment + delta);
    setAdjustments((prev) => ({
      ...prev,
      [productId]: newValue,
    }));
  };

  const handleSave = (productId: string) => {
    const adjustment = adjustments[productId];
    if (adjustment === undefined) return;

    if (adjustmentType === 'set') {
      setStock(productId, adjustment);
    } else {
      adjustStock(productId, adjustment, adjustmentType);
    }

    // 入力をクリア
    setAdjustments((prev) => {
      const newAdjustments = { ...prev };
      delete newAdjustments[productId];
      return newAdjustments;
    });
  };

  const handleSaveAll = () => {
    Object.entries(adjustments).forEach(([productId, adjustment]) => {
      if (adjustment !== undefined) {
        if (adjustmentType === 'set') {
          setStock(productId, adjustment);
        } else {
          adjustStock(productId, adjustment, adjustmentType);
        }
      }
    });
    setAdjustments({});
  };

  const hasChanges = Object.keys(adjustments).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">在庫入力</h2>
        {hasChanges && (
          <button onClick={handleSaveAll} className="btn-primary flex items-center space-x-2">
            <Save className="w-4 h-4" />
            <span>すべて保存 ({Object.keys(adjustments).length}件)</span>
          </button>
        )}
      </div>

      {/* フィルターと操作タイプ */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="品名・品番で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="md:w-48">
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="input-field"
            >
              <option value="">すべての業者</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:w-48">
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as 'in' | 'out' | 'set')}
              className="input-field"
            >
              <option value="set">在庫数を設定</option>
              <option value="in">入庫（追加）</option>
              <option value="out">出庫（減少）</option>
            </select>
          </div>
        </div>
      </div>

      {/* 入力テーブル */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-2">品名</th>
              <th className="text-left py-3 px-2">業者</th>
              <th className="text-right py-3 px-2">現在庫</th>
              <th className="text-right py-3 px-2">最小在庫</th>
              <th className="text-center py-3 px-2 w-48">
                {adjustmentType === 'set'
                  ? '新しい在庫数'
                  : adjustmentType === 'in'
                  ? '入庫数'
                  : '出庫数'}
              </th>
              <th className="text-center py-3 px-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const stock = getStock(product.id);
              const isLowStock = stock < product.minStock;
              const adjustment = adjustments[product.id];
              const hasAdjustment = adjustment !== undefined;

              return (
                <tr
                  key={product.id}
                  className={`border-b hover:bg-gray-50 ${
                    isLowStock ? 'bg-red-50' : ''
                  } ${hasAdjustment ? 'bg-yellow-50' : ''}`}
                >
                  <td className="py-2 px-2 font-medium">{product.name}</td>
                  <td className="py-2 px-2 text-gray-600">
                    {supplierMap.get(product.supplierId) || '-'}
                  </td>
                  <td
                    className={`text-right py-2 px-2 font-semibold ${
                      isLowStock ? 'text-red-600' : ''
                    }`}
                  >
                    {formatNumber(stock)}
                  </td>
                  <td className="text-right py-2 px-2">{product.minStock}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => handleQuickAdjust(product.id, -1)}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded"
                        disabled={adjustmentType === 'set' && (adjustment || 0) <= 0}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={adjustment ?? ''}
                        onChange={(e) =>
                          handleAdjustmentChange(product.id, e.target.value)
                        }
                        placeholder={adjustmentType === 'set' ? String(stock) : '0'}
                        className="w-20 px-2 py-1 border rounded text-center"
                      />
                      <button
                        onClick={() => handleQuickAdjust(product.id, 1)}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="text-center py-2 px-2">
                    <button
                      onClick={() => handleSave(product.id)}
                      disabled={!hasAdjustment}
                      className={`px-3 py-1 rounded text-sm ${
                        hasAdjustment
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      保存
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {products.length === 0
              ? '商品データがありません。'
              : '検索条件に一致する商品がありません。'}
          </div>
        )}
      </div>
    </div>
  );
}
