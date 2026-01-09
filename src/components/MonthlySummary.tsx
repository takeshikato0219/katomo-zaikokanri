import { useState, useMemo } from 'react';
import { Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { formatCurrency, formatNumber } from '../utils/calculations';

export function MonthlySummary() {
  const { getSupplierMonthlySummary } = useInventory();

  // 現在の年月をデフォルトに
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const summaries = useMemo(
    () => getSupplierMonthlySummary(selectedMonth),
    [getSupplierMonthlySummary, selectedMonth]
  );

  // 全体の合計
  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => ({
        previousBalance: acc.previousBalance + s.previousBalance,
        monthlyPurchase: acc.monthlyPurchase + s.monthlyPurchase,
        monthlyUsage: acc.monthlyUsage + s.monthlyUsage,
        stockInPurchase: acc.stockInPurchase + s.stockInPurchase,
        change: acc.change + s.change,
        calculatedBalance: acc.calculatedBalance + s.calculatedBalance,
        displayStock: acc.displayStock + s.displayStock,
        actualStock: acc.actualStock + s.actualStock,
      }),
      {
        previousBalance: 0,
        monthlyPurchase: 0,
        monthlyUsage: 0,
        stockInPurchase: 0,
        change: 0,
        calculatedBalance: 0,
        displayStock: 0,
        actualStock: 0,
      }
    );
  }, [summaries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">仕入先別月次集計</h2>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field w-auto"
          />
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
            <p className="text-gray-500 text-sm">前月残高</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatCurrency(totals.previousBalance)}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <p className="text-gray-500 text-sm">当月仕入れ</p>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totals.monthlyPurchase)}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <p className="text-gray-500 text-sm">当月使用</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(totals.monthlyUsage)}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-purple-500" />
            <p className="text-gray-500 text-sm">当月残計算</p>
          </div>
          <p className="text-2xl font-bold text-purple-600">
            {formatCurrency(totals.calculatedBalance)}
          </p>
        </div>
      </div>

      {/* テーブル */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-2">仕入先</th>
              <th className="text-right py-3 px-2">前月残高</th>
              <th className="text-right py-3 px-2">当月仕入れ</th>
              <th className="text-right py-3 px-2">当月使用</th>
              <th className="text-right py-3 px-2">在庫分仕入</th>
              <th className="text-right py-3 px-2">増減</th>
              <th className="text-right py-3 px-2">当月残計算</th>
              <th className="text-right py-3 px-2">表在庫</th>
              <th className="text-right py-3 px-2">実質在庫</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.supplierId} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-medium">{summary.supplierName}</td>
                <td className="text-right py-2 px-2">
                  {formatCurrency(summary.previousBalance)}
                </td>
                <td className="text-right py-2 px-2 text-green-600">
                  {formatCurrency(summary.monthlyPurchase)}
                </td>
                <td className="text-right py-2 px-2 text-red-600">
                  {formatCurrency(summary.monthlyUsage)}
                </td>
                <td className="text-right py-2 px-2 text-blue-600">
                  {formatCurrency(summary.stockInPurchase)}
                </td>
                <td className={`text-right py-2 px-2 font-semibold ${
                  summary.change >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {summary.change >= 0 ? '+' : ''}{formatCurrency(summary.change)}
                </td>
                <td className="text-right py-2 px-2 font-semibold">
                  {formatCurrency(summary.calculatedBalance)}
                </td>
                <td className="text-right py-2 px-2">
                  {formatNumber(summary.displayStock)}
                </td>
                <td className="text-right py-2 px-2">
                  {formatNumber(summary.actualStock)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td className="py-3 px-2">合計</td>
              <td className="text-right py-3 px-2">
                {formatCurrency(totals.previousBalance)}
              </td>
              <td className="text-right py-3 px-2 text-green-600">
                {formatCurrency(totals.monthlyPurchase)}
              </td>
              <td className="text-right py-3 px-2 text-red-600">
                {formatCurrency(totals.monthlyUsage)}
              </td>
              <td className="text-right py-3 px-2 text-blue-600">
                {formatCurrency(totals.stockInPurchase)}
              </td>
              <td className={`text-right py-3 px-2 ${
                totals.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {totals.change >= 0 ? '+' : ''}{formatCurrency(totals.change)}
              </td>
              <td className="text-right py-3 px-2">
                {formatCurrency(totals.calculatedBalance)}
              </td>
              <td className="text-right py-3 px-2">
                {formatNumber(totals.displayStock)}
              </td>
              <td className="text-right py-3 px-2">
                {formatNumber(totals.actualStock)}
              </td>
            </tr>
          </tfoot>
        </table>

        {summaries.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            選択した月のデータがありません
          </div>
        )}
      </div>
    </div>
  );
}
