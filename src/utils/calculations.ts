import type { Product, Stock, ShortageItem, Supplier, Transaction } from '../types';

// 商品の現在在庫を取得
export function getCurrentStock(
  productId: string,
  stocks: Stock[]
): number {
  const stock = stocks.find((s) => s.productId === productId);
  return stock?.quantity ?? 0;
}

// 不足商品の一覧を取得
export function calculateShortages(
  products: Product[],
  stocks: Stock[],
  suppliers: Supplier[]
): ShortageItem[] {
  const shortages: ShortageItem[] = [];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  for (const product of products) {
    const currentStock = getCurrentStock(product.id, stocks);
    if (currentStock < product.minStock) {
      shortages.push({
        product,
        currentStock,
        shortage: product.minStock - currentStock,
        supplierName: supplierMap.get(product.supplierId) ?? '不明',
      });
    }
  }

  return shortages.sort((a, b) => b.shortage - a.shortage);
}

// 業者別の不足商品をグループ化
export function groupShortagesBySupplier(
  shortages: ShortageItem[]
): Map<string, ShortageItem[]> {
  const grouped = new Map<string, ShortageItem[]>();

  for (const item of shortages) {
    const supplierId = item.product.supplierId;
    const existing = grouped.get(supplierId) || [];
    existing.push(item);
    grouped.set(supplierId, existing);
  }

  return grouped;
}

// 月間の入出庫サマリーを計算
export function calculateMonthlyTransactions(
  transactions: Transaction[],
  year: number,
  month: number
): { totalIn: number; totalOut: number; netChange: number } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const monthlyTransactions = transactions.filter((t) => {
    const date = new Date(t.date);
    return date >= startDate && date <= endDate;
  });

  const totalIn = monthlyTransactions
    .filter((t) => t.type === 'in')
    .reduce((sum, t) => sum + t.quantity, 0);

  const totalOut = monthlyTransactions
    .filter((t) => t.type === 'out')
    .reduce((sum, t) => sum + t.quantity, 0);

  return {
    totalIn,
    totalOut,
    netChange: totalIn - totalOut,
  };
}

// 在庫金額合計を計算
export function calculateTotalInventoryValue(
  products: Product[],
  stocks: Stock[]
): number {
  let total = 0;

  for (const product of products) {
    const stock = getCurrentStock(product.id, stocks);
    total += stock * product.unitPrice;
  }

  return total;
}

// 発注金額合計を計算
export function calculateOrderTotal(shortages: ShortageItem[]): number {
  return shortages.reduce(
    (sum, item) => sum + item.shortage * item.product.unitPrice,
    0
  );
}

// 業者別の発注金額を計算
export function calculateOrderTotalBySupplier(
  shortages: ShortageItem[]
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of shortages) {
    const supplierId = item.product.supplierId;
    const amount = item.shortage * item.product.unitPrice;
    const existing = totals.get(supplierId) || 0;
    totals.set(supplierId, existing + amount);
  }

  return totals;
}

// 数値のフォーマット（カンマ区切り）
export function formatNumber(num: number): string {
  return num.toLocaleString('ja-JP');
}

// 金額のフォーマット
export function formatCurrency(amount: number): string {
  return `¥${formatNumber(amount)}`;
}

// 日付のフォーマット
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// 日時のフォーマット
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
