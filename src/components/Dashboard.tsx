import { useState, useMemo, useCallback } from 'react';
import { Package, AlertTriangle, TrendingUp, Truck, Calendar, Building2 } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { useAIDemandForecast } from '../hooks/useAIDemandForecast';
import { useAIReport } from '../hooks/useAIReport';
import { DemandForecastWidget } from './ai/DemandForecastWidget';
import { AIReportSection } from './ai/AIReportSection';
import { formatCurrency, formatNumber } from '../utils/calculations';
import type { Page } from '../types';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

// 週の開始日を取得（月曜日始まり）
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// 週の終了日を取得
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

// 日付をYYYY-MM-DD形式に
function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// 月の週リストを取得
function getWeeksInMonth(year: number, month: number): { start: Date; end: Date; label: string }[] {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let current = getWeekStart(firstDay);

  while (current <= lastDay) {
    const weekEnd = getWeekEnd(current);
    const displayStart = current < firstDay ? firstDay : current;
    const displayEnd = weekEnd > lastDay ? lastDay : weekEnd;

    weeks.push({
      start: new Date(displayStart),
      end: new Date(displayEnd),
      label: `${displayStart.getMonth() + 1}/${displayStart.getDate()}`,
    });

    current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return weeks;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const {
    products,
    suppliers,
    transactions,
    getShortageItems,
    getStock,
  } = useInventory();

  // AI需要予測フック
  const {
    forecastResults,
    isLoading: isForecastLoading,
    error: forecastError,
    refreshForecast,
    lastUpdated: forecastLastUpdated,
    isAIAvailable,
  } = useAIDemandForecast({
    products,
    transactions,
    suppliers,
    getStock,
  });

  // AIレポートフック
  const {
    report: aiReport,
    isGenerating: isReportGenerating,
    error: reportError,
    generateReport,
    isAIAvailable: isReportAIAvailable,
  } = useAIReport({
    transactions,
    products,
  });

  // 選択中の年月
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [year, month] = selectedMonth.split('-').map(Number);
  const weeks = useMemo(() => getWeeksInMonth(year, month), [year, month]);

  // 月の日付リスト
  const daysInMonth = useMemo(() => {
    const days: Date[] = [];
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month - 1, d));
    }
    return days;
  }, [year, month]);

  // 商品ごとの集計データを計算
  const productData = useMemo(() => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 前月最終日
    const prevMonthEnd = new Date(year, month - 1, 0);
    const prevMonthStart = new Date(year, month - 2, 1);

    return products.map((product) => {
      const currentStock = getStock(product.id);
      const supplier = suppliers.find((s) => s.id === product.supplierId);

      // 該当月のトランザクション
      const monthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return t.productId === product.id && txDate >= startDate && txDate <= endDate;
      });

      // 前月のトランザクション（前月棚卸計算用）
      const prevMonthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return t.productId === product.id && txDate >= prevMonthStart && txDate <= prevMonthEnd;
      });

      // 前月棚卸（前月末の在庫）
      let prevMonthStock = 0;
      prevMonthTxns.forEach((t) => {
        if (t.type === 'in') prevMonthStock += t.quantity;
        else prevMonthStock -= t.quantity;
      });

      // 週別集計
      const weeklyData = weeks.map((week) => {
        const weekTxns = monthTxns.filter((t) => {
          const txDate = new Date(t.date);
          return txDate >= week.start && txDate <= week.end;
        });

        const purchases = weekTxns
          .filter((t) => t.type === 'in' && t.subType !== 'stockIn')
          .reduce((sum, t) => sum + t.quantity, 0);
        const stockIn = weekTxns
          .filter((t) => t.type === 'in' && t.subType === 'stockIn')
          .reduce((sum, t) => sum + t.quantity, 0);
        const usage = weekTxns
          .filter((t) => t.type === 'out' && t.subType === 'usage')
          .reduce((sum, t) => sum + t.quantity, 0);

        return {
          purchases,
          stockIn,
          usage,
          subtotal: purchases + stockIn - usage,
        };
      });

      // 日別集計
      const dailyData = daysInMonth.map((day) => {
        const dayKey = formatDateKey(day);
        const dayTxns = monthTxns.filter((t) => t.date.slice(0, 10) === dayKey);

        const purchases = dayTxns
          .filter((t) => t.type === 'in' && t.subType !== 'stockIn')
          .reduce((sum, t) => sum + t.quantity, 0);
        const stockIn = dayTxns
          .filter((t) => t.type === 'in' && t.subType === 'stockIn')
          .reduce((sum, t) => sum + t.quantity, 0);
        const usage = dayTxns
          .filter((t) => t.type === 'out' && t.subType === 'usage')
          .reduce((sum, t) => sum + t.quantity, 0);

        return { day, purchases, stockIn, usage };
      });

      // 月間合計
      const totalPurchases = monthTxns
        .filter((t) => t.type === 'in' && t.subType !== 'stockIn')
        .reduce((sum, t) => sum + t.quantity, 0);
      const totalStockIn = monthTxns
        .filter((t) => t.type === 'in' && t.subType === 'stockIn')
        .reduce((sum, t) => sum + t.quantity, 0);
      const totalUsage = monthTxns
        .filter((t) => t.type === 'out' && t.subType === 'usage')
        .reduce((sum, t) => sum + t.quantity, 0);

      // 顧客別使用
      const customerUsage = new Map<string, { qty: number; amount: number }>();
      monthTxns
        .filter((t) => t.type === 'out' && t.subType === 'usage' && t.customerId)
        .forEach((t) => {
          const existing = customerUsage.get(t.customerId!) || { qty: 0, amount: 0 };
          existing.qty += t.quantity;
          existing.amount += t.quantity * product.unitPrice;
          customerUsage.set(t.customerId!, existing);
        });

      // クレーム・工場使用（メモで判定）
      const claimQty = monthTxns
        .filter((t) => t.type === 'out' && t.note?.includes('クレーム'))
        .reduce((sum, t) => sum + t.quantity, 0);
      const factoryQty = monthTxns
        .filter((t) => t.type === 'out' && (t.note?.includes('工場') || t.note?.includes('調整')))
        .reduce((sum, t) => sum + t.quantity, 0);

      // 今月残高数
      const thisMonthBalance = prevMonthStock + totalPurchases + totalStockIn - totalUsage;

      // 在庫金額合計
      const inventoryValue = currentStock * product.unitPrice;

      // 差（実在庫 - 計算在庫）
      const diff = currentStock - thisMonthBalance;

      // 不足数・発注金額
      const shortage = Math.max(0, product.minStock - currentStock);
      const orderAmount = shortage * product.unitPrice;

      return {
        product,
        supplierName: supplier?.name || '不明',
        prevMonthStock,
        currentStock,
        weeklyData,
        dailyData,
        totalPurchases,
        totalStockIn,
        totalUsage,
        customerUsage,
        claimQty,
        claimAmount: claimQty * product.unitPrice,
        factoryQty,
        factoryAmount: factoryQty * product.unitPrice,
        thisMonthBalance,
        inventoryValue,
        prevInventoryValue: prevMonthStock * product.unitPrice,
        diff,
        shortage,
        orderAmount,
        purchaseAmount: totalPurchases * product.unitPrice,
        purchaseAmountWithTax: totalPurchases * product.unitPrice * 1.1,
        usageAmount: totalUsage * product.unitPrice,
      };
    });
  }, [products, suppliers, transactions, getStock, year, month, weeks, daysInMonth]);

  const shortageItems = getShortageItems();
  const totalProducts = products.length;
  const totalSuppliers = suppliers.length;
  const totalInventoryValue = productData.reduce((sum, p) => sum + p.inventoryValue, 0);

  // 仕入先別月次集計（前月残高、当月仕入れ、当月使用、在庫分仕入、増減、当月残計算、表在庫、実質在庫）
  const supplierMonthlySummary = useMemo(() => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59);

    return suppliers.map((supplier) => {
      // この仕入先の商品
      const supplierProducts = products.filter((p) => p.supplierId === supplier.id);
      if (supplierProducts.length === 0) {
        return {
          supplier,
          previousBalance: 0,
          monthlyPurchase: 0,
          monthlyUsage: 0,
          stockInPurchase: 0,
          change: 0,
          calculatedBalance: 0,
          displayStock: 0,
          actualStock: 0,
          productCount: 0,
        };
      }

      const productIds = new Set(supplierProducts.map((p) => p.id));
      const productPriceMap = new Map(supplierProducts.map((p) => [p.id, p.unitPrice]));

      // 前月末までの全トランザクションで前月残高を計算
      let previousBalance = 0;
      transactions
        .filter((t) => productIds.has(t.productId) && new Date(t.date) <= prevMonthEnd)
        .forEach((t) => {
          const price = productPriceMap.get(t.productId) || 0;
          if (t.type === 'in') {
            previousBalance += t.quantity * price;
          } else {
            previousBalance -= t.quantity * price;
          }
        });

      // 当月のトランザクション
      const currentMonthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return productIds.has(t.productId) && txDate >= startDate && txDate <= endDate;
      });

      // 当月仕入れ（subType = 'purchase' または subTypeがない入庫）
      let monthlyPurchase = 0;
      // 在庫分仕入（subType = 'stockIn'）
      let stockInPurchase = 0;
      // 当月使用
      let monthlyUsage = 0;

      currentMonthTxns.forEach((t) => {
        const price = productPriceMap.get(t.productId) || 0;
        const amount = t.quantity * price;

        if (t.type === 'in') {
          if (t.subType === 'stockIn') {
            stockInPurchase += amount;
          } else {
            monthlyPurchase += amount;
          }
        } else if (t.type === 'out' && t.subType === 'usage') {
          monthlyUsage += amount;
        }
      });

      // 増減 = 当月仕入れ + 在庫分仕入 - 当月使用
      const change = monthlyPurchase + stockInPurchase - monthlyUsage;

      // 当月残計算 = 前月残高 + 増減
      const calculatedBalance = previousBalance + change;

      // 表在庫（現在の在庫数量合計 × 単価）
      let displayStock = 0;
      let displayStockQty = 0;
      supplierProducts.forEach((p) => {
        const qty = getStock(p.id);
        displayStockQty += qty;
        displayStock += qty * p.unitPrice;
      });

      // 実質在庫（調整後、ここでは表在庫と同じ）
      const actualStock = displayStock;

      return {
        supplier,
        previousBalance,
        monthlyPurchase,
        monthlyUsage,
        stockInPurchase,
        change,
        calculatedBalance,
        displayStock,
        displayStockQty,
        actualStock,
        productCount: supplierProducts.length,
      };
    }).filter((s) => s.productCount > 0);
  }, [suppliers, products, transactions, getStock, year, month]);

  // 仕入先別集計の合計
  const supplierSummaryTotals = useMemo(() => {
    return supplierMonthlySummary.reduce(
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
  }, [supplierMonthlySummary]);

  // レポート用のサマリーデータを変換
  const reportSummaries = useMemo(() => {
    return supplierMonthlySummary.map((s) => ({
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      yearMonth: selectedMonth,
      previousBalance: s.previousBalance,
      monthlyPurchase: s.monthlyPurchase,
      monthlyUsage: s.monthlyUsage,
      stockInPurchase: s.stockInPurchase,
      change: s.change,
      calculatedBalance: s.calculatedBalance,
      displayStock: s.displayStock,
      actualStock: s.actualStock,
    }));
  }, [supplierMonthlySummary, selectedMonth]);

  // レポート生成ハンドラ
  const handleGenerateReport = useCallback(() => {
    generateReport(
      selectedMonth,
      reportSummaries,
      totalInventoryValue,
      shortageItems.length
    );
  }, [generateReport, selectedMonth, reportSummaries, totalInventoryValue, shortageItems.length]);

  return (
    <div className="space-y-6">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">ホーム</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">ダッシュボード</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Calendar className="w-4 h-4 text-[#706e6b]" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-field w-auto"
            />
          </div>
        </div>
      </div>

      {/* SLDS KPI Cards - Stat Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#0176d3]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">登録商品数</p>
              <p className="text-2xl font-light text-[#181818] mt-1">{formatNumber(totalProducts)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#d8edff] flex items-center justify-center">
              <Package className="w-5 h-5 text-[#0176d3]" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#2e844a]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫金額合計</p>
              <p className="text-2xl font-light text-[#181818] mt-1">{formatCurrency(totalInventoryValue)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#cdefc4] flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#2e844a]" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#c23934]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">不足商品</p>
              <p className="text-2xl font-light text-[#c23934] mt-1">{formatNumber(shortageItems.length)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#feded8] flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#c23934]" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#9050e9]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">取引業者数</p>
              <p className="text-2xl font-light text-[#181818] mt-1">{formatNumber(totalSuppliers)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#ece1f9] flex items-center justify-center">
              <Truck className="w-5 h-5 text-[#9050e9]" />
            </div>
          </div>
        </div>
      </div>

      {/* SLDS Quick Actions Card */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-base font-bold text-[#181818]">クイックアクション</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => onNavigate('receipt')} className="btn-primary py-2.5">
              入荷処理
            </button>
            <button onClick={() => onNavigate('usage')} className="btn-primary py-2.5">
              使用処理
            </button>
            <button onClick={() => onNavigate('orders')} className="btn-secondary py-2.5">
              発注管理
            </button>
            <button onClick={() => onNavigate('monthly-summary')} className="btn-secondary py-2.5">
              月次集計
            </button>
          </div>
        </div>
      </div>

      {/* AI機能セクション（2カラム） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI需要予測ウィジェット */}
        <DemandForecastWidget
          forecastResults={forecastResults}
          isLoading={isForecastLoading}
          error={forecastError}
          onRefresh={refreshForecast}
          lastUpdated={forecastLastUpdated}
          isAIAvailable={isAIAvailable}
          onNavigate={onNavigate}
        />

        {/* AI経営サマリー */}
        <AIReportSection
          report={aiReport}
          isGenerating={isReportGenerating}
          error={reportError}
          onGenerate={handleGenerateReport}
          yearMonth={selectedMonth}
          isAIAvailable={isReportAIAvailable}
        />
      </div>

      {/* SLDS Data Table - 仕入先別月次集計 */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-[#0176d3]" />
            <h2 className="text-base font-bold text-[#181818]">
              {year}年{month}月 仕入先別月次集計
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="slds-table w-full">
            <thead>
              <tr>
                <th className="text-left">仕入先（メーカー）</th>
                <th className="text-right bg-[#fafaf9]">前月残高</th>
                <th className="text-right bg-[#cdefc4]/30">当月仕入れ</th>
                <th className="text-right bg-[#feded8]/30">当月使用</th>
                <th className="text-right bg-[#d8edff]/30">在庫分仕入</th>
                <th className="text-right bg-[#fef1cd]/30">増減</th>
                <th className="text-right bg-[#ece1f9]/30">当月残 計算</th>
                <th className="text-right bg-[#fef1cd]/30">表在庫</th>
                <th className="text-right bg-[#d8edff]/30">実質在庫</th>
              </tr>
            </thead>
            <tbody>
              {supplierMonthlySummary.map((data) => (
                <tr key={data.supplier.id}>
                  <td className="font-medium">
                    <div className="flex items-center justify-between">
                      <span>{data.supplier.name}</span>
                      <span className="slds-badge slds-badge-info ml-2">{data.productCount}品</span>
                    </div>
                  </td>
                  <td className="text-right bg-[#fafaf9]">
                    {formatCurrency(data.previousBalance)}
                  </td>
                  <td className="text-right bg-[#cdefc4]/20 text-[#2e844a]">
                    {data.monthlyPurchase > 0 ? `+${formatCurrency(data.monthlyPurchase)}` : '-'}
                  </td>
                  <td className="text-right bg-[#feded8]/20 text-[#c23934]">
                    {data.monthlyUsage > 0 ? `-${formatCurrency(data.monthlyUsage)}` : '-'}
                  </td>
                  <td className="text-right bg-[#d8edff]/20 text-[#0176d3]">
                    {data.stockInPurchase > 0 ? `+${formatCurrency(data.stockInPurchase)}` : '-'}
                  </td>
                  <td className={`text-right bg-[#fef1cd]/20 font-semibold ${
                    data.change > 0 ? 'text-[#2e844a]' : data.change < 0 ? 'text-[#c23934]' : ''
                  }`}>
                    {data.change !== 0 ? (data.change > 0 ? '+' : '') + formatCurrency(data.change) : '-'}
                  </td>
                  <td className="text-right bg-[#ece1f9]/20 font-semibold">
                    {formatCurrency(data.calculatedBalance)}
                  </td>
                  <td className="text-right bg-[#fef1cd]/20">
                    {formatCurrency(data.displayStock)}
                  </td>
                  <td className="text-right bg-[#d8edff]/20">
                    {formatCurrency(data.actualStock)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#fafaf9] font-bold">
                <td>合計</td>
                <td className="text-right">
                  {formatCurrency(supplierSummaryTotals.previousBalance)}
                </td>
                <td className="text-right text-[#2e844a]">
                  {supplierSummaryTotals.monthlyPurchase > 0
                    ? `+${formatCurrency(supplierSummaryTotals.monthlyPurchase)}`
                    : '-'}
                </td>
                <td className="text-right text-[#c23934]">
                  {supplierSummaryTotals.monthlyUsage > 0
                    ? `-${formatCurrency(supplierSummaryTotals.monthlyUsage)}`
                    : '-'}
                </td>
                <td className="text-right text-[#0176d3]">
                  {supplierSummaryTotals.stockInPurchase > 0
                    ? `+${formatCurrency(supplierSummaryTotals.stockInPurchase)}`
                    : '-'}
                </td>
                <td className={`text-right ${
                  supplierSummaryTotals.change > 0 ? 'text-[#2e844a]' :
                  supplierSummaryTotals.change < 0 ? 'text-[#c23934]' : ''
                }`}>
                  {supplierSummaryTotals.change !== 0
                    ? (supplierSummaryTotals.change > 0 ? '+' : '') + formatCurrency(supplierSummaryTotals.change)
                    : '-'}
                </td>
                <td className="text-right">
                  {formatCurrency(supplierSummaryTotals.calculatedBalance)}
                </td>
                <td className="text-right">
                  {formatCurrency(supplierSummaryTotals.displayStock)}
                </td>
                <td className="text-right">
                  {formatCurrency(supplierSummaryTotals.actualStock)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {supplierMonthlySummary.length === 0 && (
          <div className="text-center py-8 text-[#706e6b]">
            仕入先データがありません
          </div>
        )}
      </div>

      {/* SLDS Alert Table - 発注が必要な商品リスト */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-[#c23934]" />
            <h2 className="text-base font-bold text-[#181818]">
              発注が必要な商品一覧
            </h2>
            <span className="slds-badge slds-badge-error">{productData.filter(p => p.shortage > 0).length}件</span>
          </div>
        </div>
        {productData.filter(p => p.shortage > 0).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th className="text-left">品名</th>
                  <th className="text-left">仕入先</th>
                  <th className="text-right">現在庫</th>
                  <th className="text-right">最小在庫</th>
                  <th className="text-right bg-[#feded8]/30">不足数</th>
                  <th className="text-right">単価</th>
                  <th className="text-right bg-[#feded8]/30">発注金額</th>
                </tr>
              </thead>
              <tbody>
                {productData
                  .filter(p => p.shortage > 0)
                  .sort((a, b) => b.shortage - a.shortage)
                  .map((data) => (
                    <tr key={data.product.id}>
                      <td className="font-medium">{data.product.name}</td>
                      <td className="text-[#706e6b]">{data.supplierName}</td>
                      <td className="text-right">{formatNumber(data.currentStock)}</td>
                      <td className="text-right">{formatNumber(data.product.minStock)}</td>
                      <td className="text-right bg-[#feded8]/20 text-[#c23934] font-bold">
                        {formatNumber(data.shortage)}
                      </td>
                      <td className="text-right">{formatCurrency(data.product.unitPrice)}</td>
                      <td className="text-right bg-[#feded8]/20 text-[#c23934] font-bold">
                        {formatCurrency(data.orderAmount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#feded8]/30 font-bold">
                  <td colSpan={4}>合計</td>
                  <td className="text-right text-[#c23934]">
                    {formatNumber(productData.filter(p => p.shortage > 0).reduce((s, p) => s + p.shortage, 0))}
                  </td>
                  <td></td>
                  <td className="text-right text-[#c23934]">
                    {formatCurrency(productData.filter(p => p.shortage > 0).reduce((s, p) => s + p.orderAmount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-[#706e6b]">
            発注が必要な商品はありません
          </div>
        )}
      </div>

      {/* SLDS Empty State */}
      {totalProducts === 0 && (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-[#706e6b]" />
          </div>
          <h3 className="text-lg font-bold text-[#181818] mb-2">商品データがありません</h3>
          <p className="text-[#706e6b] mb-4">CSV連携画面から既存のデータをインポートしてください</p>
        </div>
      )}
    </div>
  );
}
