import type { Product, Supplier, Stock, ShortageItem } from '../types';

// CSVテキストをパース
export function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const result: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    result.push(cells);
  }

  return result;
}

// 既存CSVから商品・業者・在庫を抽出
export function extractDataFromCSV(rows: string[][]): {
  suppliers: Supplier[];
  products: Product[];
  stocks: Stock[];
} {
  const suppliers: Map<string, Supplier> = new Map();
  const products: Product[] = [];
  const stocks: Stock[] = [];

  let currentSupplier: Supplier | null = null;
  let productIdCounter = 1;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.length < 8) continue;

    // 業者名は列1にある（例: "1   カーク産業"）
    const col1 = row[1]?.trim() || '';
    // 品名は列4にある
    const col4 = row[4]?.trim() || '';

    // 業者名を検出
    // パターン1: "数字 + スペース（半角/全角、1つ以上）+ 業者名"
    const supplierMatch = col1.match(/^(\d+)[\s\u3000]+(.+)$/);
    if (supplierMatch) {
      const supplierId = supplierMatch[1];
      const supplierName = supplierMatch[2].trim();
      currentSupplier = { id: supplierId, name: supplierName };
      if (!suppliers.has(supplierId)) {
        suppliers.set(supplierId, currentSupplier);
      }
    } else if (col1 && !col4 && !col1.match(/^(納期|ロット|発注表|優先度|\d+)$/)) {
      // パターン2: 番号なしの業者名（品名がない行で、特定のキーワード以外）
      const supplierName = col1;
      const supplierId = `S-${supplierName}`;
      currentSupplier = { id: supplierId, name: supplierName };
      if (!suppliers.has(supplierId)) {
        suppliers.set(supplierId, currentSupplier);
      }
    }

    // ヘッダー行をスキップ（納期、ロット、発注表などの行）
    if (col4 === 'キャンプ品名' || row[0] === '納期') {
      continue;
    }

    // 空行やゼロ行をスキップ
    if (!col4 || col4 === '0') {
      continue;
    }

    // 品名がある行 = 商品データ
    const productName = col4;
    if (!productName || productName.match(/^(送料|一般・整備|NO\d+)$/)) {
      continue;
    }

    // データの抽出
    const lot = row[1]?.trim() || '';
    // 当月棚卸は列5
    const currentStockStr = row[5]?.trim().replace(/,/g, '') || '0';
    const currentStock = parseInt(currentStockStr) || 0;
    // 標単価は列7
    const unitPriceStr = row[7]?.trim().replace(/[,"]/g, '') || '0';
    const unitPrice = parseInt(unitPriceStr) || 0;

    // 品番（IDがないので生成）
    const productId = `${currentSupplier?.id || '0'}-${productIdCounter++}`;

    if (currentSupplier) {
      const product: Product = {
        id: productId,
        name: productName,
        supplierId: currentSupplier.id,
        unitPrice,
        minStock: 1, // デフォルトの最小在庫数
        lot: lot || undefined,
        rowIndex,
      };
      products.push(product);

      // 在庫数が0でも登録（あとで在庫入力できるように）
      stocks.push({
        productId,
        quantity: currentStock,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  return {
    suppliers: Array.from(suppliers.values()),
    products,
    stocks,
  };
}

// 商品リストをCSVにエクスポート（縦一列フォーマット）
export function exportProductsToCSV(
  products: Product[],
  stocks: { productId: string; quantity: number }[],
  suppliers: Supplier[]
): string {
  const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const headers = ['品番', '品名', '業者', '単価', '在庫数', '最小在庫数'];
  const rows: string[][] = [headers];

  for (const product of products) {
    const quantity = stockMap.get(product.id) ?? 0;
    const supplierName = supplierMap.get(product.supplierId) ?? '';
    rows.push([
      product.id,
      product.name,
      supplierName,
      product.unitPrice.toString(),
      quantity.toString(),
      product.minStock.toString(),
    ]);
  }

  return rows.map((row) =>
    row.map((cell) => {
      // カンマや改行を含む場合はダブルクォートで囲む
      if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');
}

// 業者ごとの発注ファイルを生成
export function exportOrderToCSV(
  supplierId: string,
  _supplierName: string,
  items: ShortageItem[]
): string {
  const headers = ['品番', '品名', '現在庫', '不足数', '発注数', '単価', '金額'];
  const rows: string[][] = [headers];

  for (const item of items) {
    if (item.product.supplierId !== supplierId) continue;
    const orderQuantity = item.shortage;
    const amount = orderQuantity * item.product.unitPrice;
    rows.push([
      item.product.id,
      item.product.name,
      item.currentStock.toString(),
      item.shortage.toString(),
      orderQuantity.toString(),
      item.product.unitPrice.toString(),
      amount.toString(),
    ]);
  }

  // 合計行
  const totalAmount = items
    .filter((i) => i.product.supplierId === supplierId)
    .reduce((sum, i) => sum + i.shortage * i.product.unitPrice, 0);

  rows.push(['', '', '', '', '', '合計', totalAmount.toString()]);

  return rows.map((row) =>
    row.map((cell) => {
      if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');
}

// CSVをダウンロード
export function downloadCSV(content: string, filename: string) {
  // BOM付きUTF-8でExcelでも文字化けしないようにする
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
