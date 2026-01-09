import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, Calendar, Table, Edit3, Save, X, FileText } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import type { Product } from '../types';

// 編集中のデータ型
type EditableFields = Pick<Product, 'idealStock' | 'minStock'>;
type EditData = Map<string, Partial<EditableFields>>;

// 週の開始日を取得（月曜日始まり）
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// 月の週リストを取得
function getWeeksInMonth(year: number, month: number): { start: Date; end: Date; label: string; days: Date[] }[] {
  const weeks: { start: Date; end: Date; label: string; days: Date[] }[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let current = getWeekStart(firstDay);

  while (current <= lastDay) {
    const weekEnd = new Date(current.getTime() + 6 * 24 * 60 * 60 * 1000);
    const displayStart = current < firstDay ? firstDay : current;
    const displayEnd = weekEnd > lastDay ? lastDay : weekEnd;

    const days: Date[] = [];
    const dayIterator = new Date(displayStart);
    while (dayIterator <= displayEnd) {
      days.push(new Date(dayIterator));
      dayIterator.setDate(dayIterator.getDate() + 1);
    }

    weeks.push({
      start: new Date(displayStart),
      end: new Date(displayEnd),
      label: `${displayStart.getMonth() + 1}/${displayStart.getDate()}`,
      days,
    });

    current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return weeks;
}

export function InventoryTable() {
  const {
    suppliers,
    products,
    customers,
    transactions,
    getStock,
    updateProducts,
  } = useInventory();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // 編集モード
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<EditData>(new Map());

  // 編集モード開始
  const handleStartEdit = useCallback(() => {
    setIsEditMode(true);
    setEditData(new Map());
  }, []);

  // 編集モードキャンセル
  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false);
    setEditData(new Map());
  }, []);

  // セルの値を更新
  const handleEditChange = useCallback((productId: string, field: keyof EditableFields, value: number | undefined) => {
    setEditData((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(productId) || {};
      newMap.set(productId, { ...existing, [field]: value });
      return newMap;
    });
  }, []);

  // 一括保存
  const handleSave = useCallback(() => {
    const updates = Array.from(editData.entries())
      .filter(([, changes]) => Object.keys(changes).length > 0)
      .map(([productId, changes]) => ({
        productId,
        updates: changes,
      }));

    if (updates.length > 0) {
      updateProducts(updates);
    }

    setIsEditMode(false);
    setEditData(new Map());
  }, [editData, updateProducts]);

  // 編集中の値を取得（編集中は編集データ、そうでなければ元の値）
  const getEditValue = useCallback((productId: string, field: keyof EditableFields, originalValue: number | undefined) => {
    const edits = editData.get(productId);
    if (edits && field in edits) {
      return edits[field];
    }
    return originalValue;
  }, [editData]);

  const [year, month] = selectedMonth.split('-').map(Number);
  const weeks = useMemo(() => getWeeksInMonth(year, month), [year, month]);

  const toggleWeek = (weekLabel: string) => {
    setExpandedWeeks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(weekLabel)) {
        newSet.delete(weekLabel);
      } else {
        newSet.add(weekLabel);
      }
      return newSet;
    });
  };

  // 商品ごとの集計データを計算（業者でソート）
  const productData = useMemo(() => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59);

    // 業者でソートした商品リスト
    const sortedProducts = [...products].sort((a, b) => {
      const supplierA = suppliers.find((s) => s.id === a.supplierId)?.name || '';
      const supplierB = suppliers.find((s) => s.id === b.supplierId)?.name || '';
      return supplierA.localeCompare(supplierB, 'ja');
    });

    return sortedProducts.map((product) => {
      const currentStock = getStock(product.id);
      const supplier = suppliers.find((s) => s.id === product.supplierId);

      // 当月棚卸（前月末までの在庫）
      let prevMonthStock = 0;
      transactions
        .filter((t) => t.productId === product.id && new Date(t.date) <= prevMonthEnd)
        .forEach((t) => {
          if (t.type === 'in') prevMonthStock += t.quantity;
          else prevMonthStock -= t.quantity;
        });

      // 該当月のトランザクション
      const monthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return t.productId === product.id && txDate >= startDate && txDate <= endDate;
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

        const dailyData = week.days.map((day) => {
          const dayKey = day.toISOString().slice(0, 10);
          const dayTxns = weekTxns.filter((t) => t.date.slice(0, 10) === dayKey);

          return {
            day,
            purchases: dayTxns.filter((t) => t.type === 'in' && t.subType !== 'stockIn').reduce((sum, t) => sum + t.quantity, 0),
            stockIn: dayTxns.filter((t) => t.type === 'in' && t.subType === 'stockIn').reduce((sum, t) => sum + t.quantity, 0),
            usage: dayTxns.filter((t) => t.type === 'out' && t.subType === 'usage').reduce((sum, t) => sum + t.quantity, 0),
          };
        });

        return { week, purchases, stockIn, usage, dailyData };
      });

      // 月間合計
      const totalPurchases = monthTxns.filter((t) => t.type === 'in' && t.subType !== 'stockIn').reduce((sum, t) => sum + t.quantity, 0);
      const totalStockIn = monthTxns.filter((t) => t.type === 'in' && t.subType === 'stockIn').reduce((sum, t) => sum + t.quantity, 0);
      const totalUsage = monthTxns.filter((t) => t.type === 'out' && t.subType === 'usage').reduce((sum, t) => sum + t.quantity, 0);

      // 顧客別使用量
      const customerUsage = new Map<string, number>();
      monthTxns
        .filter((t) => t.type === 'out' && t.subType === 'usage' && t.customerId)
        .forEach((t) => {
          const current = customerUsage.get(t.customerId!) || 0;
          customerUsage.set(t.customerId!, current + t.quantity);
        });

      // クレーム数量
      const claimQty = monthTxns
        .filter((t) => t.type === 'out' && t.note?.includes('クレーム'))
        .reduce((sum, t) => sum + t.quantity, 0);

      // 工場使用・調整
      const factoryQty = monthTxns
        .filter((t) => t.type === 'out' && (t.note?.includes('工場') || t.note?.includes('調整')))
        .reduce((sum, t) => sum + t.quantity, 0);

      // 在庫より一般へ（在庫分から通常使用への移動）
      const stockToGeneralQty = monthTxns
        .filter((t) => t.type === 'out' && t.note?.includes('在庫より'))
        .reduce((sum, t) => sum + t.quantity, 0);

      // 使用発注数
      const usageOrderQty = totalUsage;
      // 在庫発注数
      const stockOrderQty = totalStockIn;
      // 在庫使用数
      const stockUsageQty = monthTxns
        .filter((t) => t.type === 'out' && t.note?.includes('在庫'))
        .reduce((sum, t) => sum + t.quantity, 0);

      // 今月残高数
      const thisMonthBalance = prevMonthStock + totalPurchases + totalStockIn - totalUsage;

      // 差（実在庫 - 計算在庫）
      const diff = currentStock - thisMonthBalance;

      // 不足数・発注金額
      const shortage = Math.max(0, product.minStock - currentStock);

      return {
        product,
        supplierName: supplier?.name || '不明',
        prevMonthStock,
        currentStock,
        weeklyData,
        totalPurchases,
        totalStockIn,
        totalUsage,
        customerUsage,
        claimQty,
        factoryQty,
        stockToGeneralQty,
        usageOrderQty,
        stockOrderQty,
        stockUsageQty,
        thisMonthBalance,
        diff,
        shortage,
        // 金額計算
        totalAmount: currentStock * product.unitPrice,
        purchaseAmount: totalPurchases * product.unitPrice,
        purchaseAmountWithTax: totalPurchases * product.unitPrice * 1.1,
        stockInAmount: totalStockIn * product.unitPrice,
        usageAmount: totalUsage * product.unitPrice,
        claimAmount: claimQty * product.unitPrice,
        factoryAmount: factoryQty * product.unitPrice,
        orderAmount: shortage * product.unitPrice,
        prevInventoryValue: prevMonthStock * product.unitPrice,
        // 合計A
        totalA: totalPurchases + totalStockIn,
        // 在庫増減
        stockChange: totalPurchases + totalStockIn - totalUsage,
      };
    });
  }, [products, suppliers, transactions, getStock, year, month, weeks]);

  // 全体の合計
  const totals = useMemo(() => {
    return {
      prevMonthStock: productData.reduce((sum, p) => sum + p.prevMonthStock, 0),
      currentStock: productData.reduce((sum, p) => sum + p.currentStock, 0),
      totalAmount: productData.reduce((sum, p) => sum + p.totalAmount, 0),
      totalPurchases: productData.reduce((sum, p) => sum + p.totalPurchases, 0),
      purchaseAmount: productData.reduce((sum, p) => sum + p.purchaseAmount, 0),
      purchaseAmountWithTax: productData.reduce((sum, p) => sum + p.purchaseAmountWithTax, 0),
      totalStockIn: productData.reduce((sum, p) => sum + p.totalStockIn, 0),
      stockInAmount: productData.reduce((sum, p) => sum + p.stockInAmount, 0),
      totalUsage: productData.reduce((sum, p) => sum + p.totalUsage, 0),
      usageAmount: productData.reduce((sum, p) => sum + p.usageAmount, 0),
      claimQty: productData.reduce((sum, p) => sum + p.claimQty, 0),
      claimAmount: productData.reduce((sum, p) => sum + p.claimAmount, 0),
      factoryQty: productData.reduce((sum, p) => sum + p.factoryQty, 0),
      factoryAmount: productData.reduce((sum, p) => sum + p.factoryAmount, 0),
      totalA: productData.reduce((sum, p) => sum + p.totalA, 0),
      stockChange: productData.reduce((sum, p) => sum + p.stockChange, 0),
      usageOrderQty: productData.reduce((sum, p) => sum + p.usageOrderQty, 0),
      stockOrderQty: productData.reduce((sum, p) => sum + p.stockOrderQty, 0),
      stockUsageQty: productData.reduce((sum, p) => sum + p.stockUsageQty, 0),
      stockToGeneralQty: productData.reduce((sum, p) => sum + p.stockToGeneralQty, 0),
      thisMonthBalance: productData.reduce((sum, p) => sum + p.thisMonthBalance, 0),
      diff: productData.reduce((sum, p) => sum + p.diff, 0),
      shortage: productData.reduce((sum, p) => sum + p.shortage, 0),
      orderAmount: productData.reduce((sum, p) => sum + p.orderAmount, 0),
      prevInventoryValue: productData.reduce((sum, p) => sum + p.prevInventoryValue, 0),
    };
  }, [productData]);

  // 顧客別合計
  const customerTotals = useMemo(() => {
    const qtyTotals = new Map<string, number>();
    const amountTotals = new Map<string, number>();
    productData.forEach((p) => {
      p.customerUsage.forEach((qty, customerId) => {
        qtyTotals.set(customerId, (qtyTotals.get(customerId) || 0) + qty);
        amountTotals.set(customerId, (amountTotals.get(customerId) || 0) + qty * p.product.unitPrice);
      });
    });
    return { qtyTotals, amountTotals };
  }, [productData]);

  // 業者別合計金額
  const supplierTotals = useMemo(() => {
    const totals = new Map<string, number>();
    productData.forEach((p) => {
      const supplierId = p.product.supplierId;
      totals.set(supplierId, (totals.get(supplierId) || 0) + p.totalAmount);
    });
    return totals;
  }, [productData]);

  // 発注書モーダル用のstate
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedSupplierForOrder, setSelectedSupplierForOrder] = useState<{
    supplierId: string;
    supplierName: string;
  } | null>(null);

  // 業者ごとの発注対象商品を取得
  const getOrderItemsForSupplier = useCallback((supplierId: string) => {
    return productData
      .filter((p) => p.product.supplierId === supplierId && p.shortage > 0)
      .map((p) => ({
        product: p.product,
        currentStock: p.currentStock,
        shortage: p.shortage,
        orderQuantity: p.shortage, // 初期値は不足数
      }));
  }, [productData]);

  // 発注書発行ボタンクリック
  const handleOpenOrderModal = useCallback((supplierId: string, supplierName: string) => {
    setSelectedSupplierForOrder({ supplierId, supplierName });
    setOrderModalOpen(true);
  }, []);

  // 発注確定処理（必要に応じて発注履歴への保存などを追加可能）
  const handleConfirmOrder = useCallback((items: { product: Product; orderQuantity: number }[]) => {
    // TODO: 発注履歴への保存処理を追加
    console.log('発注確定:', items);
  }, []);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">
              {year}年{month}月 詳細集計表
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-[#706e6b]" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input-field w-auto"
              />
            </div>
            <div className="flex border border-[#e5e5e5] rounded overflow-hidden">
              <button
                onClick={() => setViewMode('weekly')}
                className={`px-3 py-1.5 text-sm ${viewMode === 'weekly' ? 'bg-[#0176d3] text-white' : 'bg-white text-[#181818] hover:bg-[#f3f3f3]'}`}
              >
                週別
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1.5 text-sm ${viewMode === 'daily' ? 'bg-[#0176d3] text-white' : 'bg-white text-[#181818] hover:bg-[#f3f3f3]'}`}
              >
                日別
              </button>
            </div>
            {/* 編集モードボタン */}
            {isEditMode ? (
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-[#2e844a] text-white rounded hover:bg-[#236b3a] transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>保存</span>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-[#706e6b] text-white rounded hover:bg-[#5c5a58] transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>キャンセル</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartEdit}
                className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-[#0176d3] text-white rounded hover:bg-[#015ba5] transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                <span>編集モード</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse whitespace-nowrap">
            <thead className="bg-[#fafaf9] sticky top-0 z-10">
              <tr className="border-b border-[#e5e5e5]">
                {/* 基本情報 - 固定列 */}
                <th className="sticky left-0 z-20 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-left font-bold w-[120px] min-w-[120px]">品名</th>
                <th className="sticky left-[120px] z-20 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-left font-bold w-[80px] min-w-[80px]">業者</th>
                <th className="sticky left-[200px] z-20 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-right font-bold w-[60px] min-w-[60px]">当月棚卸</th>
                <th className="sticky left-[260px] z-20 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-right font-bold w-[70px] min-w-[70px]">合計金額</th>
                <th className="sticky left-[330px] z-20 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-right font-bold w-[60px] min-w-[60px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">標単価</th>

                {/* 週別/日別カラム */}
                {weeks.map((week) => {
                  const isExpanded = expandedWeeks.has(week.label) || viewMode === 'daily';
                  if (isExpanded) {
                    return week.days.map((day) => (
                      <th
                        key={day.toISOString()}
                        className="border-r border-[#e5e5e5] px-1 py-2 text-center font-medium min-w-[35px] cursor-pointer hover:bg-[#f3f3f3]"
                        onClick={() => viewMode === 'weekly' && toggleWeek(week.label)}
                      >
                        {day.getDate()}
                      </th>
                    ));
                  }
                  return (
                    <th
                      key={week.label}
                      className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold text-[#0176d3] min-w-[45px] cursor-pointer hover:bg-[#d8edff]/30"
                      onClick={() => toggleWeek(week.label)}
                    >
                      <div className="flex items-center justify-center">
                        <ChevronRight className="w-3 h-3" />
                        <span>{week.label}</span>
                      </div>
                    </th>
                  );
                })}

                {/* 仕入集計 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#cdefc4]/30">仕入合計数</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[60px] bg-[#cdefc4]/30">仕入金額</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[60px] bg-[#cdefc4]/30">税込</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#cdefc4]/30">合計A</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">在庫増減</th>

                {/* キャンプ品名（仮） */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold min-w-[60px] bg-[#ece1f9]/20">キャンプ</th>

                {/* 発注・在庫系 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#d8edff]/30">使用発注</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#d8edff]/30">在庫発注</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#d8edff]/30">在庫使用</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[55px] bg-[#d8edff]/30">在庫→一般</th>

                {/* 使用系 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[35px] bg-[#feded8]/30">数</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[60px] bg-[#feded8]/30">使用金額</th>

                {/* クレーム */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[35px] bg-[#feded8]/20">クレ数</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[55px] bg-[#feded8]/20">クレ金額</th>

                {/* 工場使用 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#706e6b]/10">工場調整</th>

                {/* 顧客別使用数 */}
                {customers.map((customer) => (
                  <th
                    key={`qty-${customer.id}`}
                    className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold min-w-[35px] bg-[#ece1f9]/30"
                    title={customer.name}
                  >
                    {customer.name.slice(0, 2)}数
                  </th>
                ))}

                {/* 顧客別使用金額 */}
                {customers.map((customer) => (
                  <th
                    key={`amt-${customer.id}`}
                    className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold min-w-[50px] bg-[#ece1f9]/20"
                    title={`${customer.name}金額`}
                  >
                    {customer.name.slice(0, 2)}額
                  </th>
                ))}

                {/* 備考 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold min-w-[50px]">備考</th>

                {/* 月末集計 */}
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">当月棚卸</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">使用発注</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">在庫発注</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">仕入合計</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fef1cd]/30">在庫使用</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[55px] bg-[#2e844a]/20">今月残高数</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[70px] bg-[#2e844a]/20">在庫金額合計</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[50px] bg-[#fafaf9]">当月棚卸</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[70px] bg-[#fafaf9]">在庫金額合計</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[55px] bg-[#0176d3]/10">理想在庫</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[55px] bg-[#0176d3]/10">補充トリガー</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[40px] bg-[#c23934]/10">差</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[45px] bg-[#c23934]/20">発注数</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-right font-bold min-w-[60px] bg-[#c23934]/20">発注金額</th>
                <th className="border-r border-[#e5e5e5] px-1 py-2 text-center font-bold min-w-[80px] bg-[#c23934]/30">発注書</th>
              </tr>
            </thead>
            <tbody>
              {productData.map((data, index) => {
                const isLowStock = data.currentStock < data.product.minStock;
                const prevData = index > 0 ? productData[index - 1] : null;
                const nextData = index < productData.length - 1 ? productData[index + 1] : null;
                const isNewSupplier = prevData && prevData.product.supplierId !== data.product.supplierId;
                const isLastOfSupplier = !nextData || nextData.product.supplierId !== data.product.supplierId;

                // 全カラム数を計算（動的）
                const baseColumns = 5; // 品名、業者、当月棚卸、合計金額、標単価
                const weekColumns = weeks.reduce((sum, week) => {
                  const isExpanded = expandedWeeks.has(week.label) || viewMode === 'daily';
                  return sum + (isExpanded ? week.days.length : 1);
                }, 0);
                const fixedColumns = 25; // 仕入集計〜発注金額 + 発注書
                const customerColumns = customers.length * 2; // 顧客別使用数 + 使用金額
                const totalColumns = baseColumns + weekColumns + fixedColumns + customerColumns;

                // 最初の商品 or 業者が変わった時にヘッダーを表示
                const showSupplierHeader = index === 0 || isNewSupplier;

                return (
                  <React.Fragment key={data.product.id}>
                    {/* 業者が変わった時に空行を2行挿入 */}
                    {isNewSupplier && (
                      <>
                        <tr className="h-4 bg-[#f3f3f3]">
                          <td colSpan={totalColumns} className="border-b border-[#e5e5e5]"></td>
                        </tr>
                        <tr className="h-4 bg-[#f3f3f3]">
                          <td colSpan={totalColumns} className="border-b border-[#e5e5e5]"></td>
                        </tr>
                      </>
                    )}
                    {/* 業者名ヘッダー行 */}
                    {showSupplierHeader && (
                      <tr className="bg-[#032d60]">
                        <td
                          colSpan={totalColumns}
                          className="px-3 py-2 text-white font-bold text-sm border-b border-[#032d60]"
                        >
                          {data.supplierName}
                        </td>
                      </tr>
                    )}
                    <tr
                      className={`border-b border-[#e5e5e5] hover:bg-[#f3f3f3] ${isLowStock ? 'bg-[#feded8]/10' : ''}`}
                    >
                    <td className="sticky left-0 z-10 bg-white border-r border-[#e5e5e5] px-2 py-1 font-medium w-[120px] min-w-[120px]">{data.product.name}</td>
                    <td className="sticky left-[120px] z-10 bg-white border-r border-[#e5e5e5] px-2 py-1 text-[#706e6b] w-[80px] min-w-[80px]">{data.supplierName}</td>
                    <td className="sticky left-[200px] z-10 bg-white border-r border-[#e5e5e5] px-2 py-1 text-right w-[60px] min-w-[60px]">{data.prevMonthStock}</td>
                    <td className="sticky left-[260px] z-10 bg-white border-r border-[#e5e5e5] px-2 py-1 text-right w-[70px] min-w-[70px]">{formatCurrency(data.totalAmount)}</td>
                    <td className="sticky left-[330px] z-10 bg-white border-r border-[#e5e5e5] px-2 py-1 text-right w-[60px] min-w-[60px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{formatCurrency(data.product.unitPrice)}</td>

                    {/* 週別/日別データ */}
                    {data.weeklyData.map((weekData) => {
                      const isExpanded = expandedWeeks.has(weekData.week.label) || viewMode === 'daily';
                      if (isExpanded) {
                        return weekData.dailyData.map((dayData) => {
                          const total = dayData.purchases + dayData.stockIn - dayData.usage;
                          return (
                            <td key={dayData.day.toISOString()} className="border-r border-[#e5e5e5] px-1 py-1 text-center">
                              {total !== 0 ? (
                                <span className={total > 0 ? 'text-[#2e844a]' : 'text-[#c23934]'}>{total > 0 ? '+' : ''}{total}</span>
                              ) : <span className="text-[#c9c9c9]">-</span>}
                            </td>
                          );
                        });
                      }
                      const weekTotal = weekData.purchases + weekData.stockIn - weekData.usage;
                      return (
                        <td key={weekData.week.label} className="border-r border-[#e5e5e5] px-1 py-1 text-center cursor-pointer" onClick={() => toggleWeek(weekData.week.label)}>
                          {weekTotal !== 0 ? (
                            <span className={weekTotal > 0 ? 'text-[#2e844a]' : 'text-[#c23934]'}>{weekTotal > 0 ? '+' : ''}{weekTotal}</span>
                          ) : <span className="text-[#c9c9c9]">-</span>}
                        </td>
                      );
                    })}

                    {/* 仕入集計 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#cdefc4]/10">{data.totalPurchases || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#cdefc4]/10">{data.purchaseAmount > 0 ? formatCurrency(data.purchaseAmount) : '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#cdefc4]/10">{data.purchaseAmountWithTax > 0 ? formatCurrency(Math.round(data.purchaseAmountWithTax)) : '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#cdefc4]/10">{data.totalA || '-'}</td>
                    <td className={`border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10 ${data.stockChange > 0 ? 'text-[#2e844a]' : data.stockChange < 0 ? 'text-[#c23934]' : ''}`}>
                      {data.stockChange !== 0 ? (data.stockChange > 0 ? '+' : '') + data.stockChange : '-'}
                    </td>

                    {/* キャンプ */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-center bg-[#ece1f9]/10">-</td>

                    {/* 発注・在庫系 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#d8edff]/10">{data.usageOrderQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#d8edff]/10">{data.stockOrderQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#d8edff]/10">{data.stockUsageQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#d8edff]/10">{data.stockToGeneralQty || '-'}</td>

                    {/* 使用系 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#feded8]/10">{data.totalUsage || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#feded8]/10">{data.usageAmount > 0 ? formatCurrency(data.usageAmount) : '-'}</td>

                    {/* クレーム */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#feded8]/5">{data.claimQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#feded8]/5">{data.claimAmount > 0 ? formatCurrency(data.claimAmount) : '-'}</td>

                    {/* 工場使用 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#706e6b]/5">{data.factoryQty || '-'}</td>

                    {/* 顧客別使用数 */}
                    {customers.map((customer) => (
                      <td key={`qty-${customer.id}`} className="border-r border-[#e5e5e5] px-1 py-1 text-center bg-[#ece1f9]/10">
                        {data.customerUsage.get(customer.id) || '-'}
                      </td>
                    ))}

                    {/* 顧客別使用金額 */}
                    {customers.map((customer) => {
                      const qty = data.customerUsage.get(customer.id) || 0;
                      const amount = qty * data.product.unitPrice;
                      return (
                        <td key={`amt-${customer.id}`} className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#ece1f9]/5">
                          {amount > 0 ? formatCurrency(amount) : '-'}
                        </td>
                      );
                    })}

                    {/* 備考 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-center">-</td>

                    {/* 月末集計 */}
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10">{data.prevMonthStock}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10">{data.usageOrderQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10">{data.stockOrderQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10">{data.totalA || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#fef1cd]/10">{data.stockUsageQty || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#2e844a]/10 font-semibold">{data.thisMonthBalance}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#2e844a]/10">{formatCurrency(data.thisMonthBalance * data.product.unitPrice)}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right">{data.currentStock}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right">{formatCurrency(data.totalAmount)}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#0176d3]/5">
                      {isEditMode ? (
                        <input
                          type="number"
                          min="0"
                          value={getEditValue(data.product.id, 'idealStock', data.product.idealStock) ?? ''}
                          onChange={(e) => handleEditChange(data.product.id, 'idealStock', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-14 px-1 py-0.5 text-right text-xs border border-[#0176d3] rounded focus:outline-none focus:ring-1 focus:ring-[#0176d3]"
                          placeholder="-"
                        />
                      ) : (
                        data.product.idealStock ?? '-'
                      )}
                    </td>
                    <td className={`border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#0176d3]/5 ${!isEditMode && data.currentStock <= data.product.minStock ? 'text-[#c23934] font-bold' : ''}`}>
                      {isEditMode ? (
                        <input
                          type="number"
                          min="0"
                          value={getEditValue(data.product.id, 'minStock', data.product.minStock) ?? ''}
                          onChange={(e) => handleEditChange(data.product.id, 'minStock', e.target.value ? Number(e.target.value) : 0)}
                          className="w-14 px-1 py-0.5 text-right text-xs border border-[#0176d3] rounded focus:outline-none focus:ring-1 focus:ring-[#0176d3]"
                        />
                      ) : (
                        data.product.minStock
                      )}
                    </td>
                    <td className={`border-r border-[#e5e5e5] px-1 py-1 text-right ${data.diff !== 0 ? 'text-[#c23934] font-bold' : ''}`}>{data.diff !== 0 ? data.diff : '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#c23934]/10">{data.shortage || '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-right bg-[#c23934]/10">{data.orderAmount > 0 ? formatCurrency(data.orderAmount) : '-'}</td>
                    <td className="border-r border-[#e5e5e5] px-1 py-1 text-center bg-[#c23934]/5"></td>
                    </tr>
                    {/* 業者の最後の商品の後に合計行を表示 */}
                    {isLastOfSupplier && (
                      <tr className="bg-[#f0f7ff] border-b-2 border-[#0176d3]">
                        <td colSpan={totalColumns - 2} className="px-3 py-2 text-right text-sm font-medium text-[#706e6b]">
                          {data.supplierName} 合計
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-[#0176d3]">
                          {formatCurrency(supplierTotals.get(data.product.supplierId) || 0)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleOpenOrderModal(data.product.supplierId, data.supplierName)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs bg-[#c23934] text-white rounded hover:bg-[#a82e2a] transition-colors"
                            title="発注書を発行"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>発注書発行</span>
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-[#fafaf9] font-bold">
              <tr className="border-t-2 border-[#e5e5e5]">
                <td className="sticky left-0 z-10 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 w-[120px] min-w-[120px]">合計</td>
                <td className="sticky left-[120px] z-10 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 w-[80px] min-w-[80px]"></td>
                <td className="sticky left-[200px] z-10 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-right w-[60px] min-w-[60px]">{formatNumber(totals.prevMonthStock)}</td>
                <td className="sticky left-[260px] z-10 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 text-right w-[70px] min-w-[70px]">{formatCurrency(totals.totalAmount)}</td>
                <td className="sticky left-[330px] z-10 bg-[#fafaf9] border-r border-[#e5e5e5] px-2 py-2 w-[60px] min-w-[60px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"></td>

                {/* 週別合計 */}
                {weeks.map((week) => {
                  const isExpanded = expandedWeeks.has(week.label) || viewMode === 'daily';
                  if (isExpanded) {
                    return week.days.map((day) => {
                      let total = 0;
                      productData.forEach((p) => {
                        const weekData = p.weeklyData.find((w) => w.week.label === week.label);
                        if (weekData) {
                          const dayData = weekData.dailyData.find((d) => d.day.toISOString().slice(0, 10) === day.toISOString().slice(0, 10));
                          if (dayData) total += dayData.purchases + dayData.stockIn - dayData.usage;
                        }
                      });
                      return (
                        <td key={day.toISOString()} className="border-r border-[#e5e5e5] px-1 py-2 text-center">
                          {total !== 0 ? <span className={total > 0 ? 'text-[#2e844a]' : 'text-[#c23934]'}>{total > 0 ? '+' : ''}{total}</span> : '-'}
                        </td>
                      );
                    });
                  }
                  let weekTotal = 0;
                  productData.forEach((p) => {
                    const weekData = p.weeklyData.find((w) => w.week.label === week.label);
                    if (weekData) weekTotal += weekData.purchases + weekData.stockIn - weekData.usage;
                  });
                  return (
                    <td key={week.label} className="border-r border-[#e5e5e5] px-1 py-2 text-center">
                      {weekTotal !== 0 ? <span className={weekTotal > 0 ? 'text-[#2e844a]' : 'text-[#c23934]'}>{weekTotal > 0 ? '+' : ''}{weekTotal}</span> : '-'}
                    </td>
                  );
                })}

                {/* 集計合計 */}
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#cdefc4]/20">{formatNumber(totals.totalPurchases)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#cdefc4]/20">{formatCurrency(totals.purchaseAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#cdefc4]/20">{formatCurrency(Math.round(totals.purchaseAmountWithTax))}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#cdefc4]/20">{formatNumber(totals.totalA)}</td>
                <td className={`border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20 ${totals.stockChange > 0 ? 'text-[#2e844a]' : totals.stockChange < 0 ? 'text-[#c23934]' : ''}`}>
                  {totals.stockChange !== 0 ? (totals.stockChange > 0 ? '+' : '') + totals.stockChange : '-'}
                </td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-center bg-[#ece1f9]/20">-</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#d8edff]/20">{formatNumber(totals.usageOrderQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#d8edff]/20">{formatNumber(totals.stockOrderQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#d8edff]/20">{formatNumber(totals.stockUsageQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#d8edff]/20">{formatNumber(totals.stockToGeneralQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#feded8]/20">{formatNumber(totals.totalUsage)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#feded8]/20">{formatCurrency(totals.usageAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#feded8]/10">{formatNumber(totals.claimQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#feded8]/10">{formatCurrency(totals.claimAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#706e6b]/10">{formatNumber(totals.factoryQty)}</td>

                {/* 顧客別合計 */}
                {customers.map((customer) => (
                  <td key={`qty-${customer.id}`} className="border-r border-[#e5e5e5] px-1 py-2 text-center bg-[#ece1f9]/20">
                    {customerTotals.qtyTotals.get(customer.id) || '-'}
                  </td>
                ))}
                {customers.map((customer) => (
                  <td key={`amt-${customer.id}`} className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#ece1f9]/10">
                    {customerTotals.amountTotals.get(customer.id) ? formatCurrency(customerTotals.amountTotals.get(customer.id)!) : '-'}
                  </td>
                ))}

                <td className="border-r border-[#e5e5e5] px-1 py-2"></td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20">{formatNumber(totals.prevMonthStock)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20">{formatNumber(totals.usageOrderQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20">{formatNumber(totals.stockOrderQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20">{formatNumber(totals.totalA)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#fef1cd]/20">{formatNumber(totals.stockUsageQty)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#2e844a]/20">{formatNumber(totals.thisMonthBalance)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#2e844a]/20">{formatCurrency(totals.totalAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right">{formatNumber(totals.currentStock)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#0176d3]/10">-</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#0176d3]/10">-</td>
                <td className={`border-r border-[#e5e5e5] px-1 py-2 text-right ${totals.diff !== 0 ? 'text-[#c23934]' : ''}`}>{totals.diff || '-'}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#c23934]/20">{formatNumber(totals.shortage)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-right bg-[#c23934]/20">{formatCurrency(totals.orderAmount)}</td>
                <td className="border-r border-[#e5e5e5] px-1 py-2 text-center bg-[#c23934]/10"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 凡例 */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Table className="w-4 h-4 text-[#706e6b]" />
            <span className="text-[#706e6b]">凡例:</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-[#2e844a] font-medium">+数</span>
            <span className="text-[#706e6b]">= 入荷</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-[#c23934] font-medium">-数</span>
            <span className="text-[#706e6b]">= 使用</span>
          </div>
          <div className="flex items-center space-x-1">
            <ChevronRight className="w-4 h-4 text-[#0176d3]" />
            <span className="text-[#706e6b]">週ヘッダーをクリックで日別展開</span>
          </div>
        </div>
      </div>

      {/* 発注書モーダル */}
      {selectedSupplierForOrder && (
        <PurchaseOrderModal
          isOpen={orderModalOpen}
          onClose={() => {
            setOrderModalOpen(false);
            setSelectedSupplierForOrder(null);
          }}
          supplierName={selectedSupplierForOrder.supplierName}
          supplierId={selectedSupplierForOrder.supplierId}
          items={getOrderItemsForSupplier(selectedSupplierForOrder.supplierId)}
          onConfirm={handleConfirmOrder}
        />
      )}
    </div>
  );
}
