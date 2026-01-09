import { useState, useMemo, useCallback } from 'react';
import { Edit2, Trash2, Save, X, QrCode, Package } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { useAISearch } from '../hooks/useAISearch';
import { AISearchBar } from './ai/AISearchBar';
import type { Product } from '../types';
import { formatCurrency, formatNumber } from '../utils/calculations';

export function ProductList() {
  const {
    products,
    suppliers,
    stocks,
    transactions,
    getStock,
    updateProduct,
    deleteProduct,
  } = useInventory();

  const [supplierFilter, setSupplierFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [aiFilteredProducts, setAiFilteredProducts] = useState<Product[] | null>(null);

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );

  const stockMap = useMemo(
    () => new Map(stocks.map((s) => [s.productId, s])),
    [stocks]
  );

  // 業者名を取得するヘルパー関数
  const getSupplierName = useCallback(
    (supplierId: string) => supplierMap.get(supplierId) || '',
    [supplierMap]
  );

  // AI検索フック
  const { search, isSearching, lastIntent, isAIAvailable } = useAISearch({
    products,
    transactions,
    getStock,
    getSupplierName,
  });

  // AI検索ハンドラ
  const handleAISearch = useCallback(
    async (query: string) => {
      const result = await search(query);
      setAiFilteredProducts(result.products);
      return result;
    },
    [search]
  );

  // 検索クリアハンドラ
  const handleClearSearch = useCallback(() => {
    setAiFilteredProducts(null);
  }, []);

  // フィルタリング（AI検索結果 or 全商品）
  const filteredProducts = useMemo(() => {
    const baseProducts = aiFilteredProducts !== null ? aiFilteredProducts : products;

    return baseProducts.filter((product) => {
      const matchesSupplier =
        !supplierFilter || product.supplierId === supplierFilter;
      return matchesSupplier;
    });
  }, [products, aiFilteredProducts, supplierFilter]);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      minStock: product.minStock,
      idealStock: product.idealStock,
      reorderQty: product.reorderQty,
      leadDays: product.leadDays,
      unitPrice: product.unitPrice,
      barcode: product.barcode,
    });
  };

  const handleSave = () => {
    if (editingId && editForm) {
      updateProduct(editingId, editForm);
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (productId: string) => {
    if (window.confirm('この商品を削除しますか？')) {
      deleteProduct(productId);
    }
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">商品管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">商品一覧</h1>
          </div>
          <div className="flex items-center space-x-2">
            <span className="slds-badge slds-badge-info">
              {formatNumber(filteredProducts.length)} / {formatNumber(products.length)} 件
            </span>
          </div>
        </div>
      </div>

      {/* SLDS Filter Card */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-bold text-[#181818]">フィルター</h2>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-4">
            {/* AI検索バー */}
            <AISearchBar
              onSearch={handleAISearch}
              onClear={handleClearSearch}
              isSearching={isSearching}
              lastIntent={lastIntent}
              isAIAvailable={isAIAvailable}
            />

            {/* 業者フィルター */}
            <div className="md:w-64">
              <label className="block text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-1">
                業者
              </label>
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
          </div>
        </div>
      </div>

      {/* SLDS Data Table */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="slds-table w-full">
            <thead>
              <tr>
                <th className="text-left">品名</th>
                <th className="text-left">業者</th>
                <th className="text-left">
                  <span className="flex items-center space-x-1">
                    <QrCode className="w-3 h-3" />
                    <span>バーコード</span>
                  </span>
                </th>
                <th className="text-right">単価</th>
                <th className="text-right">在庫数</th>
                <th className="text-right">最小在庫</th>
                <th className="text-right">理想在庫</th>
                <th className="text-right">補充量</th>
                <th className="text-right">入荷日数</th>
                <th className="text-center">最終発注日</th>
                <th className="text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const stock = getStock(product.id);
                const stockData = stockMap.get(product.id);
                const isLowStock = stock < product.minStock;
                const isEditing = editingId === product.id;
                const lastOrderedAt = stockData?.lastOrderedAt
                  ? new Date(stockData.lastOrderedAt).toLocaleDateString('ja-JP')
                  : '-';

                return (
                  <tr
                    key={product.id}
                    className={isLowStock ? 'bg-[#feded8]/30' : ''}
                  >
                    <td>
                      <div className="font-medium text-[#181818]">{product.name}</div>
                      <div className="text-xs text-[#706e6b]">{product.id}</div>
                    </td>
                    <td className="text-[#706e6b]">
                      {supplierMap.get(product.supplierId) || '-'}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="バーコード"
                          value={editForm.barcode ?? product.barcode ?? ''}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              barcode: e.target.value || undefined,
                            })
                          }
                          className="input-field w-28 text-sm"
                        />
                      ) : (
                        <span className="text-xs text-[#706e6b] font-mono">
                          {product.barcode || '-'}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.unitPrice ?? product.unitPrice}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              unitPrice: parseInt(e.target.value) || 0,
                            })
                          }
                          className="input-field w-20 text-right text-sm"
                        />
                      ) : (
                        formatCurrency(product.unitPrice)
                      )}
                    </td>
                    <td className="text-right">
                      {isLowStock ? (
                        <span className="slds-badge slds-badge-error font-semibold">
                          {formatNumber(stock)}
                        </span>
                      ) : (
                        <span className="font-semibold">{formatNumber(stock)}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.minStock ?? product.minStock}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              minStock: parseInt(e.target.value) || 0,
                            })
                          }
                          className="input-field w-16 text-right text-sm"
                        />
                      ) : (
                        formatNumber(product.minStock)
                      )}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.idealStock ?? product.idealStock ?? 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              idealStock: parseInt(e.target.value) || 0,
                            })
                          }
                          className="input-field w-16 text-right text-sm"
                        />
                      ) : (
                        formatNumber(product.idealStock ?? 0)
                      )}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.reorderQty ?? product.reorderQty ?? 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              reorderQty: parseInt(e.target.value) || 0,
                            })
                          }
                          className="input-field w-16 text-right text-sm"
                        />
                      ) : (
                        formatNumber(product.reorderQty ?? 0)
                      )}
                    </td>
                    <td className="text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.leadDays ?? product.leadDays ?? 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              leadDays: parseInt(e.target.value) || 0,
                            })
                          }
                          className="input-field w-14 text-right text-sm"
                        />
                      ) : (
                        <span>{product.leadDays ?? 0}日</span>
                      )}
                    </td>
                    <td className="text-center text-[#706e6b] text-xs">
                      {lastOrderedAt}
                    </td>
                    <td className="text-center">
                      {isEditing ? (
                        <div className="flex justify-center space-x-1">
                          <button
                            onClick={handleSave}
                            className="p-1.5 text-[#2e844a] hover:bg-[#cdefc4]/30 rounded transition-colors"
                            title="保存"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1.5 text-[#706e6b] hover:bg-[#f3f3f3] rounded transition-colors"
                            title="キャンセル"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center space-x-1">
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-1.5 text-[#0176d3] hover:bg-[#d8edff]/30 rounded transition-colors"
                            title="編集"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-1.5 text-[#c23934] hover:bg-[#feded8]/30 rounded transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">
              {products.length === 0
                ? '商品データがありません。CSV連携画面からインポートしてください。'
                : '検索条件に一致する商品がありません。'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
