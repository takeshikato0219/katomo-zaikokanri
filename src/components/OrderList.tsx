import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, CheckCircle, Clock, ShoppingCart } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { exportOrderToCSV, downloadCSV } from '../utils/csv';
import { formatCurrency, formatNumber } from '../utils/calculations';
import * as XLSX from 'xlsx';

export function OrderList() {
  const { suppliers, stocks, getShortageItems, recordOrderDate } = useInventory();
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');

  // 在庫データのマップ（最終発注日を取得するため）
  const stockMap = useMemo(
    () => new Map(stocks.map((s) => [s.productId, s])),
    [stocks]
  );

  const shortageItems = getShortageItems();

  // 業者別にグループ化
  const shortagesBySupplier = useMemo(() => {
    const grouped = new Map<string, typeof shortageItems>();

    shortageItems.forEach((item) => {
      const supplierId = item.product.supplierId;
      const existing = grouped.get(supplierId) || [];
      existing.push(item);
      grouped.set(supplierId, existing);
    });

    return grouped;
  }, [shortageItems]);

  // 表示する不足商品
  const displayItems = selectedSupplier
    ? shortagesBySupplier.get(selectedSupplier) || []
    : shortageItems;

  // 合計金額
  const totalAmount = displayItems.reduce(
    (sum, item) => sum + item.shortage * item.product.unitPrice,
    0
  );

  // CSVダウンロード
  const handleDownloadCSV = (supplierId?: string) => {
    const items = supplierId
      ? shortagesBySupplier.get(supplierId) || []
      : shortageItems;

    if (items.length === 0) return;

    const supplierName = supplierId
      ? suppliers.find((s) => s.id === supplierId)?.name || '不明'
      : '全業者';

    const csv = exportOrderToCSV(
      supplierId || '',
      supplierName,
      supplierId ? items : shortageItems
    );

    const date = new Date().toISOString().slice(0, 10);
    const filename = `発注書_${supplierName}_${date}.csv`;
    downloadCSV(csv, filename);
  };

  // Excelダウンロード
  const handleDownloadExcel = (supplierId?: string) => {
    const items = supplierId
      ? shortagesBySupplier.get(supplierId) || []
      : shortageItems;

    if (items.length === 0) return;

    const supplierName = supplierId
      ? suppliers.find((s) => s.id === supplierId)?.name || '不明'
      : '全業者';

    // データを作成
    const data = [
      ['発注書', '', '', '', '', '', ''],
      ['業者名:', supplierName, '', '発注日:', new Date().toLocaleDateString('ja-JP'), '', ''],
      ['', '', '', '', '', '', ''],
      ['品番', '品名', '現在庫', '最小在庫', '不足数', '単価', '金額'],
      ...items.map((item) => [
        item.product.id,
        item.product.name,
        item.currentStock,
        item.product.minStock,
        item.shortage,
        item.product.unitPrice,
        item.shortage * item.product.unitPrice,
      ]),
      ['', '', '', '', '', '合計', items.reduce((sum, i) => sum + i.shortage * i.product.unitPrice, 0)],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // 列幅を設定
    ws['!cols'] = [
      { wch: 15 },
      { wch: 30 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '発注書');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `発注書_${supplierName}_${date}.xlsx`);
  };

  // 全業者の発注書を一括ダウンロード
  const handleDownloadAllExcel = () => {
    if (shortageItems.length === 0) return;

    const wb = XLSX.utils.book_new();

    shortagesBySupplier.forEach((items, supplierId) => {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const supplierName = supplier?.name || '不明';

      const data = [
        ['発注書', '', '', '', '', '', ''],
        ['業者名:', supplierName, '', '発注日:', new Date().toLocaleDateString('ja-JP'), '', ''],
        ['', '', '', '', '', '', ''],
        ['品番', '品名', '現在庫', '最小在庫', '不足数', '単価', '金額'],
        ...items.map((item) => [
          item.product.id,
          item.product.name,
          item.currentStock,
          item.product.minStock,
          item.shortage,
          item.product.unitPrice,
          item.shortage * item.product.unitPrice,
        ]),
        ['', '', '', '', '', '合計', items.reduce((sum, i) => sum + i.shortage * i.product.unitPrice, 0)],
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [
        { wch: 15 },
        { wch: 30 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 15 },
      ];

      // シート名は31文字以内、特殊文字を除去
      const sheetName = supplierName.slice(0, 31).replace(/[\\/*?[\]]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `発注書_全業者_${date}.xlsx`);
  };

  // 発注済みにする（最終発注日を記録）
  const handleMarkAsOrdered = (supplierId?: string) => {
    const items = supplierId
      ? shortagesBySupplier.get(supplierId) || []
      : shortageItems;

    if (items.length === 0) return;

    const productIds = items.map((item) => item.product.id);
    recordOrderDate(productIds);

    const supplierName = supplierId
      ? suppliers.find((s) => s.id === supplierId)?.name || '不明'
      : '全業者';

    alert(`${supplierName}の${productIds.length}件を発注済みにしました`);
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">発注管理</h1>
          </div>
          {shortageItems.length > 0 && (
            <button
              onClick={handleDownloadAllExcel}
              className="btn-primary flex items-center space-x-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>全業者の発注書をダウンロード</span>
            </button>
          )}
        </div>
      </div>

      {/* SLDS KPI Cards */}
      {shortageItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#c23934]">
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">不足商品数</p>
            <p className="text-2xl font-light text-[#c23934] mt-1">
              {formatNumber(shortageItems.length)} 件
            </p>
          </div>
          <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#0176d3]">
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">発注対象業者</p>
            <p className="text-2xl font-light text-[#181818] mt-1">
              {formatNumber(shortagesBySupplier.size)} 社
            </p>
          </div>
          <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#2e844a]">
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">発注予定金額（税抜）</p>
            <p className="text-2xl font-light text-[#181818] mt-1">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>
      )}

      {/* SLDS Filter Card */}
      {shortageItems.length > 0 && (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
          <div className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <div className="flex-1">
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="input-field"
                >
                  <option value="">すべての業者</option>
                  {Array.from(shortagesBySupplier.keys()).map((supplierId) => {
                    const supplier = suppliers.find((s) => s.id === supplierId);
                    const items = shortagesBySupplier.get(supplierId) || [];
                    return (
                      <option key={supplierId} value={supplierId}>
                        {supplier?.name || '不明'} ({items.length}件)
                      </option>
                    );
                  })}
                </select>
              </div>
              {selectedSupplier && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleDownloadCSV(selectedSupplier)}
                    className="btn-secondary flex items-center space-x-1"
                  >
                    <Download className="w-4 h-4" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={() => handleDownloadExcel(selectedSupplier)}
                    className="btn-primary flex items-center space-x-1"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={() => handleMarkAsOrdered(selectedSupplier)}
                    className="btn-success flex items-center space-x-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>発注済み</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SLDS Data Table */}
      {displayItems.length > 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th className="text-left">品名</th>
                  <th className="text-left">業者</th>
                  <th className="text-right">現在庫</th>
                  <th className="text-right">最小在庫</th>
                  <th className="text-right bg-[#feded8]/30">不足数</th>
                  <th className="text-right">単価</th>
                  <th className="text-right bg-[#feded8]/30">金額</th>
                  <th className="text-center">入荷日数</th>
                  <th className="text-center">最終発注日</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const stockData = stockMap.get(item.product.id);
                  const lastOrderedAt = stockData?.lastOrderedAt
                    ? new Date(stockData.lastOrderedAt).toLocaleDateString('ja-JP')
                    : '-';

                  return (
                    <tr key={item.product.id}>
                      <td className="font-medium text-[#181818]">{item.product.name}</td>
                      <td className="text-[#706e6b]">{item.supplierName}</td>
                      <td className="text-right text-[#c23934] font-semibold">
                        {formatNumber(item.currentStock)}
                      </td>
                      <td className="text-right">
                        {formatNumber(item.product.minStock)}
                      </td>
                      <td className="text-right bg-[#feded8]/20 text-[#c23934] font-bold">
                        {formatNumber(item.shortage)}
                      </td>
                      <td className="text-right">
                        {formatCurrency(item.product.unitPrice)}
                      </td>
                      <td className="text-right bg-[#feded8]/20 font-semibold">
                        {formatCurrency(item.shortage * item.product.unitPrice)}
                      </td>
                      <td className="text-center">
                        {item.product.leadDays ? (
                          <span className="inline-flex items-center text-[#706e6b]">
                            <Clock className="w-3 h-3 mr-1" />
                            {item.product.leadDays}日
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-center text-[#706e6b] text-xs">
                        {lastOrderedAt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#fafaf9] font-bold">
                  <td colSpan={6} className="text-right">
                    合計
                  </td>
                  <td className="text-right text-[#c23934]">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[#cdefc4] flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-[#2e844a]" />
          </div>
          <h3 className="text-lg font-bold text-[#181818] mb-2">
            不足商品はありません
          </h3>
          <p className="text-[#706e6b]">
            すべての商品の在庫が最小在庫数以上あります
          </p>
        </div>
      )}
    </div>
  );
}
