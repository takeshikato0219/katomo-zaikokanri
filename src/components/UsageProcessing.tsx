import { useState, useMemo, useEffect } from 'react';
import { Package, Calendar, Save, Search, User, Filter, CheckSquare, Square, Plus, DollarSign, RotateCcw } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { formatCurrency, formatNumber } from '../utils/calculations';

interface UsageTableItem {
  productId: string;
  productName: string;
  supplierName: string;
  supplierId: string;
  currentStock: number;
  unitPrice: number;
  quantity: number;
  selected: boolean;
}

export function UsageProcessing() {
  const {
    products,
    suppliers,
    customers,
    adjustStock,
    getStock,
    getSupplierById,
    addCustomer,
  } = useInventory();

  const [usageDate, setUsageDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [tableItems, setTableItems] = useState<UsageTableItem[]>([]);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [showOnlyInStock, setShowOnlyInStock] = useState(true);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // 商品一覧を初期化
  useEffect(() => {
    const items: UsageTableItem[] = products.map((product) => {
      const supplier = getSupplierById(product.supplierId);
      return {
        productId: product.id,
        productName: product.name,
        supplierName: supplier?.name || '不明',
        supplierId: product.supplierId,
        currentStock: getStock(product.id),
        unitPrice: product.unitPrice,
        quantity: 0,
        selected: false,
      };
    });
    setTableItems(items);
  }, [products, getSupplierById, getStock]);

  // 顧客検索結果
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return customers;
    const term = customerSearchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone?.includes(term)
    );
  }, [customers, customerSearchTerm]);

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

    // 在庫ありのみ表示
    if (showOnlyInStock) {
      result = result.filter((item) => item.currentStock > 0);
    }

    // 選択済みのみ表示
    if (showOnlySelected) {
      result = result.filter((item) => item.selected || item.quantity > 0);
    }

    return result;
  }, [tableItems, searchTerm, selectedSupplierId, showOnlySelected, showOnlyInStock]);

  // 使用対象の商品（数量が1以上）
  const itemsToProcess = useMemo(() => {
    return tableItems.filter((item) => item.quantity > 0);
  }, [tableItems]);

  // 合計金額
  const totalAmount = useMemo(() => {
    return itemsToProcess.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [itemsToProcess]);

  // 選択中の顧客
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // 数量変更（在庫上限あり）
  const updateQuantity = (productId: string, quantity: number) => {
    setTableItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const maxQty = Math.min(quantity, item.currentStock);
        return {
          ...item,
          quantity: Math.max(0, maxQty),
          selected: maxQty > 0,
        };
      })
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
    const selectableItems = filteredItems.filter((item) => item.currentStock > 0);
    const allSelected = selectableItems.every((item) => item.selected);
    const filteredIds = new Set(selectableItems.map((item) => item.productId));
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
      prev.map((item) => {
        if (!item.selected) return item;
        const maxQty = Math.min(quantity, item.currentStock);
        return { ...item, quantity: Math.max(0, maxQty) };
      })
    );
  };

  // 新規顧客追加
  const handleAddNewCustomer = () => {
    if (!newCustomerName.trim()) {
      alert('顧客名を入力してください');
      return;
    }
    const customer = addCustomer({ name: newCustomerName.trim() });
    setSelectedCustomerId(customer.id);
    setNewCustomerName('');
    setShowNewCustomerForm(false);
    setCustomerSearchTerm('');
  };

  // 使用処理実行
  const processUsage = () => {
    if (!selectedCustomerId) {
      alert('顧客を選択してください');
      return;
    }

    if (itemsToProcess.length === 0) {
      alert('使用数量を入力してください');
      return;
    }

    const dateISO = new Date(usageDate).toISOString();

    itemsToProcess.forEach((item) => {
      adjustStock(item.productId, item.quantity, 'out', {
        subType: 'usage',
        customerId: selectedCustomerId,
        date: dateISO,
        note: '顧客使用',
      });
    });

    const customerName = selectedCustomer?.name || '不明';
    alert(`${customerName}様の使用を処理しました（${itemsToProcess.length}件）`);

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
            <h1 className="text-xl font-light text-[#181818] mt-1">使用処理</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#706e6b]" />
            <input
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              className="input-field w-auto"
            />
          </div>
        </div>
      </div>

      {/* SLDS Customer Selection Card */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-[#0176d3]" />
            <h2 className="text-base font-bold text-[#181818]">顧客選択</h2>
          </div>
        </div>
        <div className="p-4">
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-4 bg-[#d8edff]/30 border border-[#0176d3]/20 rounded">
              <div>
                <div className="font-medium text-lg text-[#181818]">{selectedCustomer.name}</div>
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setCustomerSearchTerm('');
                    }}
                    className="p-2 border border-[#e5e5e5] rounded hover:bg-[#d8edff]/20 hover:border-[#0176d3]/30 text-left transition-colors"
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
                  <button onClick={handleAddNewCustomer} className="btn-primary">
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
                disabled={!selectedCustomerId}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-[#706e6b]" />
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="input-field w-auto"
                disabled={!selectedCustomerId}
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
                checked={showOnlyInStock}
                onChange={(e) => setShowOnlyInStock(e.target.checked)}
                className="w-4 h-4 rounded border-[#c9c9c9] text-[#0176d3] focus:ring-[#0176d3]"
                disabled={!selectedCustomerId}
              />
              <span className="text-sm text-[#181818]">在庫ありのみ</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlySelected}
                onChange={(e) => setShowOnlySelected(e.target.checked)}
                className="w-4 h-4 rounded border-[#c9c9c9] text-[#0176d3] focus:ring-[#0176d3]"
                disabled={!selectedCustomerId}
              />
              <span className="text-sm text-[#181818]">使用対象のみ表示</span>
            </label>
          </div>
        </div>
      </div>

      {/* SLDS Bulk Actions */}
      {selectedCustomerId && (
        <div className="bg-[#fef1cd]/30 border border-[#dd7a01]/20 rounded p-4">
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
              {[1, 2, 5].map((qty) => (
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
      )}

      {/* SLDS Data Table */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-[#0176d3]" />
              <h2 className="text-base font-bold text-[#181818]">商品一覧</h2>
              <span className="slds-badge slds-badge-info">{filteredItems.length}件</span>
            </div>
            {itemsToProcess.length > 0 && selectedCustomerId && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-[#706e6b]">
                  使用対象: <span className="font-bold text-[#181818]">{itemsToProcess.length}件</span> /
                  合計: <span className="font-bold text-[#dd7a01]">{formatCurrency(totalAmount)}</span>
                </span>
                <button
                  onClick={processUsage}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>使用処理実行</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {!selectedCustomerId ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">先に顧客を選択してください</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="slds-table w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="text-center w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-[#f3f3f3] rounded">
                      {filteredItems.filter((i) => i.currentStock > 0).every((item) => item.selected) ? (
                        <CheckSquare className="w-4 h-4 text-[#0176d3]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#706e6b]" />
                      )}
                    </button>
                  </th>
                  <th className="text-left">品名</th>
                  <th className="text-left">業者</th>
                  <th className="text-right">在庫</th>
                  <th className="text-center bg-[#fef1cd]/30">使用数</th>
                  <th className="text-right">単価</th>
                  <th className="text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.productId}
                    className={`${item.quantity > 0 ? 'bg-[#fef1cd]/20' : ''} ${item.currentStock <= 0 ? 'opacity-50' : ''}`}
                  >
                    <td className="text-center">
                      <button
                        onClick={() => toggleSelect(item.productId)}
                        className="p-1 hover:bg-[#f3f3f3] rounded"
                        disabled={item.currentStock <= 0}
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
                      <span className={item.currentStock <= 0 ? 'text-[#c23934] font-bold' : ''}>
                        {formatNumber(item.currentStock)}
                      </span>
                    </td>
                    <td className="bg-[#fef1cd]/20">
                      <input
                        type="number"
                        min="0"
                        max={item.currentStock}
                        value={item.quantity || ''}
                        onChange={(e) =>
                          updateQuantity(item.productId, parseInt(e.target.value) || 0)
                        }
                        placeholder="0"
                        disabled={item.currentStock <= 0}
                        className="w-20 px-2 py-1 border-2 border-[#dd7a01] rounded text-right font-bold focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3] focus:outline-none disabled:bg-[#e5e5e5] disabled:border-[#c9c9c9]"
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
        )}

        {selectedCustomerId && filteredItems.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">該当する商品がありません</p>
          </div>
        )}
      </div>

      {/* SLDS Sticky Footer - 使用サマリー */}
      {itemsToProcess.length > 0 && selectedCustomer && (
        <div className="bg-[#fef1cd] border border-[#dd7a01]/30 rounded p-4 sticky bottom-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[#dd7a01]">
                {selectedCustomer.name}様 使用予定
              </div>
              <div className="text-sm text-[#dd7a01]/80">
                {itemsToProcess.length}件 /
                合計数量: {itemsToProcess.reduce((sum, i) => sum + i.quantity, 0)}個
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-6 h-6 text-[#dd7a01]" />
                <span className="text-2xl font-light text-[#dd7a01]">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              <button
                onClick={processUsage}
                className="btn-primary flex items-center space-x-2 h-10 px-6"
              >
                <Save className="w-5 h-5" />
                <span>使用処理実行</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
