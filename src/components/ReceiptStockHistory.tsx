import { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory';
import { History, Filter, Calendar, User, Package, ArrowUpCircle, ArrowDownCircle, Search, X } from 'lucide-react';
import { users } from '../data/users';

export function ReceiptStockHistory() {
  const { transactions, productMap, customers, getSupplierById } = useInventory();
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'all' | 'in' | 'out'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 担当者一覧（transactionsから取得 + usersから取得）
  const operators = useMemo(() => {
    const operatorSet = new Set<string>();

    // transactionsから担当者を取得
    transactions.forEach((t) => {
      if (t.operator) {
        operatorSet.add(t.operator);
      }
    });

    // usersからも担当者名を取得
    users.forEach((u) => {
      operatorSet.add(u.displayName);
    });

    return Array.from(operatorSet).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [transactions]);

  // フィルタリングされた履歴
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 担当者フィルタ
      if (selectedOperator && t.operator !== selectedOperator) {
        return false;
      }

      // タイプフィルタ（入荷/使用）
      if (selectedType !== 'all' && t.type !== selectedType) {
        return false;
      }

      // 日付範囲フィルタ
      if (dateFrom) {
        const txDate = t.date.slice(0, 10);
        if (txDate < dateFrom) return false;
      }
      if (dateTo) {
        const txDate = t.date.slice(0, 10);
        if (txDate > dateTo) return false;
      }

      // 商品名検索
      if (searchQuery) {
        const product = productMap.get(t.productId);
        const productName = product?.name || '';
        const productId = t.productId;
        const query = searchQuery.toLowerCase();
        if (!productName.toLowerCase().includes(query) && !productId.toLowerCase().includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, selectedOperator, selectedType, dateFrom, dateTo, searchQuery, productMap]);

  // サブタイプの日本語表示
  const getSubTypeLabel = (subType?: string) => {
    switch (subType) {
      case 'purchase':
        return '仕入';
      case 'stockIn':
        return '在庫分仕入';
      case 'usage':
        return '使用';
      case 'adjustment':
        return '調整';
      default:
        return '';
    }
  };

  // 日付フォーマット
  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // フィルタをクリア
  const clearFilters = () => {
    setSelectedOperator('');
    setSelectedType('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = selectedOperator || selectedType !== 'all' || searchQuery || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-[#e5e5e5] p-4">
        <div className="flex items-center space-x-3">
          <History className="w-6 h-6 text-[#0176d3]" />
          <div>
            <h1 className="text-xl font-bold text-[#181818]">入荷在庫履歴</h1>
            <p className="text-sm text-[#706e6b]">入荷と使用の履歴を担当者ごとに確認できます</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-[#e5e5e5] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-[#706e6b]" />
            <span className="font-medium text-[#181818]">フィルタ</span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center space-x-1 text-sm text-[#0176d3] hover:text-[#014486]"
            >
              <X className="w-4 h-4" />
              <span>クリア</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 担当者フィルタ */}
          <div>
            <label className="block text-sm font-medium text-[#181818] mb-1">
              <User className="w-4 h-4 inline mr-1" />
              担当者
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full px-3 py-2 border border-[#c9c9c9] rounded focus:ring-2 focus:ring-[#0176d3] focus:border-[#0176d3] outline-none text-sm"
            >
              <option value="">すべての担当者</option>
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>

          {/* タイプフィルタ */}
          <div>
            <label className="block text-sm font-medium text-[#181818] mb-1">
              <Package className="w-4 h-4 inline mr-1" />
              種類
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'all' | 'in' | 'out')}
              className="w-full px-3 py-2 border border-[#c9c9c9] rounded focus:ring-2 focus:ring-[#0176d3] focus:border-[#0176d3] outline-none text-sm"
            >
              <option value="all">すべて</option>
              <option value="in">入荷のみ</option>
              <option value="out">使用のみ</option>
            </select>
          </div>

          {/* 日付範囲（開始） */}
          <div>
            <label className="block text-sm font-medium text-[#181818] mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              開始日
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-[#c9c9c9] rounded focus:ring-2 focus:ring-[#0176d3] focus:border-[#0176d3] outline-none text-sm"
            />
          </div>

          {/* 日付範囲（終了） */}
          <div>
            <label className="block text-sm font-medium text-[#181818] mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              終了日
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-[#c9c9c9] rounded focus:ring-2 focus:ring-[#0176d3] focus:border-[#0176d3] outline-none text-sm"
            />
          </div>

          {/* 商品検索 */}
          <div>
            <label className="block text-sm font-medium text-[#181818] mb-1">
              <Search className="w-4 h-4 inline mr-1" />
              商品検索
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="品番または品名"
              className="w-full px-3 py-2 border border-[#c9c9c9] rounded focus:ring-2 focus:ring-[#0176d3] focus:border-[#0176d3] outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="bg-[#f3f3f3] rounded-lg px-4 py-2 text-sm text-[#706e6b]">
        {filteredTransactions.length}件の履歴
        {hasActiveFilters && <span className="ml-2">（フィルタ適用中）</span>}
      </div>

      {/* History Table */}
      <div className="bg-white rounded-lg shadow-sm border border-[#e5e5e5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f3f3f3] border-b border-[#e5e5e5]">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">日時</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">種類</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">品番</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">品名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">業者</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-[#181818]">数量</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">担当者</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">顧客</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#181818]">備考</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-[#706e6b]">
                    履歴がありません
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => {
                  const product = productMap.get(t.productId);
                  const supplier = product ? getSupplierById(product.supplierId) : null;
                  const customer = t.customerId
                    ? customers.find((c) => c.id === t.customerId)
                    : null;

                  return (
                    <tr key={t.id} className="border-b border-[#e5e5e5] hover:bg-[#f3f3f3]">
                      <td className="px-4 py-3 text-sm text-[#181818] whitespace-nowrap">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                            t.type === 'in'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {t.type === 'in' ? (
                            <ArrowUpCircle className="w-3 h-3" />
                          ) : (
                            <ArrowDownCircle className="w-3 h-3" />
                          )}
                          <span>
                            {t.type === 'in' ? '入荷' : '出庫'}
                            {t.subType && ` (${getSubTypeLabel(t.subType)})`}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#181818] font-mono">
                        {t.productId}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#181818]">
                        {product?.name || '不明'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#181818]">
                        {supplier?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-[#181818]">
                        {t.type === 'in' ? '+' : '-'}{t.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#181818]">
                        {t.operator || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#181818]">
                        {customer?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#706e6b]">
                        {t.note || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats by Operator */}
      {selectedOperator && filteredTransactions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-[#e5e5e5] p-4">
          <h2 className="text-lg font-medium text-[#181818] mb-4">
            {selectedOperator}さんの集計
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600">入荷件数</div>
              <div className="text-2xl font-bold text-green-800">
                {filteredTransactions.filter((t) => t.type === 'in').length}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600">入荷数量合計</div>
              <div className="text-2xl font-bold text-green-800">
                {filteredTransactions
                  .filter((t) => t.type === 'in')
                  .reduce((sum, t) => sum + t.quantity, 0)}
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm text-orange-600">使用件数</div>
              <div className="text-2xl font-bold text-orange-800">
                {filteredTransactions.filter((t) => t.type === 'out').length}
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm text-orange-600">使用数量合計</div>
              <div className="text-2xl font-bold text-orange-800">
                {filteredTransactions
                  .filter((t) => t.type === 'out')
                  .reduce((sum, t) => sum + t.quantity, 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
