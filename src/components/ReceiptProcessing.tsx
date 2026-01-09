import { useState, useMemo, useEffect } from 'react';
import { Package, Calendar, Save, Search, User, Users, Filter, CheckSquare, Square, RotateCcw } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { formatCurrency, formatNumber } from '../utils/calculations';

interface ReceiptTableItem {
  productId: string;
  productName: string;
  supplierName: string;
  supplierId: string;
  currentStock: number;
  unitPrice: number;
  quantity: number;
  subType: 'purchase' | 'stockIn';
  customerId?: string;
  selected: boolean;
}

export function ReceiptProcessing() {
  const {
    products,
    suppliers,
    adjustStock,
    getStock,
    getSupplierById,
    customers,
    getCustomerById,
  } = useInventory();

  const [receiptDate, setReceiptDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [operator, setOperator] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [tableItems, setTableItems] = useState<ReceiptTableItem[]>([]);
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // 商品一覧を初期化
  useEffect(() => {
    const items: ReceiptTableItem[] = products.map((product) => {
      const supplier = getSupplierById(product.supplierId);
      return {
        productId: product.id,
        productName: product.name,
        supplierName: supplier?.name || '不明',
        supplierId: product.supplierId,
        currentStock: getStock(product.id),
        unitPrice: product.unitPrice,
        quantity: 0,
        subType: 'purchase' as const,
        customerId: undefined,
        selected: false,
      };
    });
    setTableItems(items);
  }, [products, getSupplierById, getStock]);

  // フィルター済みの商品リスト
  const filteredItems = useMemo(() => {
    let result = tableItems;

    // 検索フィルター
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (item) =>
          item.productName.toLowerCase().includes(term) ||
          item.productId.toLowerCase().includes(term)
      );
    }

    // 業者フィルター
    if (selectedSupplierId) {
      result = result.filter((item) => item.supplierId === selectedSupplierId);
    }

    // 選択済みのみ表示
    if (showOnlySelected) {
      result = result.filter((item) => item.selected || item.quantity > 0);
    }

    return result;
  }, [tableItems, searchTerm, selectedSupplierId, showOnlySelected]);

  // 入荷対象の商品（数量が1以上）
  const itemsToProcess = useMemo(() => {
    return tableItems.filter((item) => item.quantity > 0);
  }, [tableItems]);

  // 合計金額
  const totalAmount = useMemo(() => {
    return itemsToProcess.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [itemsToProcess]);

  // 数量変更
  const updateQuantity = (productId: string, quantity: number) => {
    setTableItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(0, quantity), selected: quantity > 0 }
          : item
      )
    );
  };

  // 区分変更
  const updateSubType = (productId: string, subType: 'purchase' | 'stockIn') => {
    setTableItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, subType } : item
      )
    );
  };

  // 顧客変更
  const updateCustomer = (productId: string, customerId: string) => {
    setTableItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, customerId: customerId || undefined }
          : item
      )
    );
  };

  // 選択切り替え
  const toggleSelect = (productId: string) => {
    setTableItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // 全選択/解除
  const toggleSelectAll = () => {
    const allSelected = filteredItems.every((item) => item.selected);
    const filteredIds = new Set(filteredItems.map((item) => item.productId));
    setTableItems((prev) =>
      prev.map((item) =>
        filteredIds.has(item.productId)
          ? { ...item, selected: !allSelected }
          : item
      )
    );
  };

  // 選択した商品に一括で数量を設定
  const setQuantityToSelected = (quantity: number) => {
    setTableItems((prev) =>
      prev.map((item) =>
        item.selected ? { ...item, quantity: Math.max(0, quantity) } : item
      )
    );
  };

  // 入荷処理実行
  const processReceipt = () => {
    if (itemsToProcess.length === 0) {
      alert('入荷数量を入力してください');
      return;
    }

    if (!operator.trim()) {
      alert('担当者名を入力してください');
      return;
    }

    const dateISO = new Date(receiptDate).toISOString();

    itemsToProcess.forEach((item) => {
      const customer = item.customerId ? getCustomerById(item.customerId) : null;
      const notePrefix = item.subType === 'stockIn' ? '在庫分仕入' : '仕入';
      const note = customer ? `${notePrefix}（${customer.name}分）` : notePrefix;

      adjustStock(item.productId, item.quantity, 'in', {
        subType: item.subType,
        date: dateISO,
        operator: operator.trim(),
        customerId: item.customerId,
        note,
      });
    });

    alert(`${itemsToProcess.length}件の入荷を処理しました（担当: ${operator}）`);

    // 数量をリセット
    setTableItems((prev) =>
      prev.map((item) => ({
        ...item,
        quantity: 0,
        selected: false,
        currentStock: getStock(item.productId),
      }))
    );
  };

  // リセット
  const resetAll = () => {
    setTableItems((prev) =>
      prev.map((item) => ({
        ...item,
        quantity: 0,
        selected: false,
        subType: 'purchase' as const,
        customerId: undefined,
      }))
    );
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">入荷処理</h1>
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
          </div>
        </div>
      </div>

      {/* SLDS Filter Card */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-bold text-[#181818]">フィルター</h2>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#706e6b]" />
              <input
                type="text"
                placeholder="品名・品番で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-[#706e6b]" />
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="input-field w-auto"
              >
                <option value="">全ての業者</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlySelected}
                onChange={(e) => setShowOnlySelected(e.target.checked)}
                className="w-4 h-4 rounded border-[#c9c9c9] text-[#0176d3] focus:ring-[#0176d3]"
              />
              <span className="text-sm text-[#181818]">入荷対象のみ表示</span>
            </label>
          </div>
        </div>
      </div>

      {/* SLDS Bulk Actions */}
      <div className="bg-[#d8edff]/30 border border-[#0176d3]/20 rounded p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-bold text-[#181818]">一括操作:</span>
          <button
            onClick={toggleSelectAll}
            className="btn-secondary text-sm flex items-center space-x-1"
          >
            <CheckSquare className="w-4 h-4" />
            <span>全選択/解除</span>
          </button>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-[#706e6b]">選択商品に数量設定:</span>
            {[1, 5, 10].map((qty) => (
              <button
                key={qty}
                onClick={() => setQuantityToSelected(qty)}
                className="btn-secondary text-sm px-3"
              >
                {qty}
              </button>
            ))}
          </div>
          <button onClick={resetAll} className="btn-secondary text-sm ml-auto flex items-center space-x-1">
            <RotateCcw className="w-4 h-4" />
            <span>リセット</span>
          </button>
        </div>
      </div>

      {/* SLDS Data Table */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-[#0176d3]" />
              <h2 className="text-base font-bold text-[#181818]">商品一覧</h2>
              <span className="slds-badge slds-badge-info">{filteredItems.length}件</span>
            </div>
            {itemsToProcess.length > 0 && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-[#706e6b]">
                  入荷対象: <span className="font-bold text-[#181818]">{itemsToProcess.length}件</span> /
                  合計: <span className="font-bold text-[#2e844a]">{formatCurrency(totalAmount)}</span>
                </span>
                <button
                  onClick={processReceipt}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>入荷処理実行</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="slds-table w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="text-center w-10">
                  <button onClick={toggleSelectAll} className="p-1 hover:bg-[#f3f3f3] rounded">
                    {filteredItems.every((item) => item.selected) ? (
                      <CheckSquare className="w-4 h-4 text-[#0176d3]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#706e6b]" />
                    )}
                  </button>
                </th>
                <th className="text-left">品名</th>
                <th className="text-left">業者</th>
                <th className="text-right">現在庫</th>
                <th className="text-center">区分</th>
                <th className="text-left">
                  <span className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>誰分</span>
                  </span>
                </th>
                <th className="text-center bg-[#fef1cd]/30">入荷数</th>
                <th className="text-right">単価</th>
                <th className="text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.productId}
                  className={item.quantity > 0 ? 'bg-[#cdefc4]/20' : ''}
                >
                  <td className="text-center">
                    <button
                      onClick={() => toggleSelect(item.productId)}
                      className="p-1 hover:bg-[#f3f3f3] rounded"
                    >
                      {item.selected ? (
                        <CheckSquare className="w-4 h-4 text-[#0176d3]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#706e6b]" />
                      )}
                    </button>
                  </td>
                  <td>
                    <div className="font-medium text-[#181818]">{item.productName}</div>
                    <div className="text-xs text-[#706e6b]">{item.productId}</div>
                  </td>
                  <td className="text-[#706e6b]">{item.supplierName}</td>
                  <td className="text-right">
                    <span className={item.currentStock <= 0 ? 'text-[#c23934]' : ''}>
                      {formatNumber(item.currentStock)}
                    </span>
                  </td>
                  <td>
                    <select
                      value={item.subType}
                      onChange={(e) =>
                        updateSubType(item.productId, e.target.value as 'purchase' | 'stockIn')
                      }
                      className="input-field w-full text-sm"
                    >
                      <option value="purchase">仕入</option>
                      <option value="stockIn">在庫分仕入</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={item.customerId || ''}
                      onChange={(e) => updateCustomer(item.productId, e.target.value)}
                      className="input-field w-full text-sm min-w-[100px]"
                    >
                      <option value="">-- 選択 --</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="bg-[#fef1cd]/20">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity || ''}
                      onChange={(e) =>
                        updateQuantity(item.productId, parseInt(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="w-20 px-2 py-1 border-2 border-[#dd7a01] rounded text-right font-bold focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3] focus:outline-none"
                    />
                  </td>
                  <td className="text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right font-semibold">
                    {item.quantity > 0 ? formatCurrency(item.quantity * item.unitPrice) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">該当する商品がありません</p>
          </div>
        )}
      </div>

      {/* SLDS Sticky Footer - 入荷サマリー */}
      {itemsToProcess.length > 0 && (
        <div className="bg-[#cdefc4] border border-[#2e844a]/30 rounded p-4 sticky bottom-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[#2e844a]">入荷予定</div>
              <div className="text-sm text-[#2e844a]/80">
                {itemsToProcess.length}件 /
                合計数量: {itemsToProcess.reduce((sum, i) => sum + i.quantity, 0)}個
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-2xl font-light text-[#2e844a]">
                {formatCurrency(totalAmount)}
              </span>
              <button
                onClick={processReceipt}
                className="btn-success flex items-center space-x-2 h-10 px-6"
              >
                <Save className="w-5 h-5" />
                <span>入荷処理実行</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
