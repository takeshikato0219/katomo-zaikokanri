import { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, Trash2, AlertCircle, CheckCircle, Database, Info } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { parseCSV, extractDataFromCSV, exportProductsToCSV, downloadCSV } from '../utils/csv';
import * as XLSX from 'xlsx';
import { formatNumber } from '../utils/calculations';

export function ImportExport() {
  const {
    products,
    suppliers,
    stocks,
    importData,
    clearAllData,
  } = useInventory();

  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    try {
      let text: string;

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Excelファイルを読み込み
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(firstSheet);
      } else {
        // CSVファイルをテキストとして読み込み
        text = await file.text();
      }

      const rows = parseCSV(text);
      const { suppliers: newSuppliers, products: newProducts, stocks: newStocks } = extractDataFromCSV(rows);

      importData({
        suppliers: newSuppliers,
        products: newProducts,
        stocks: newStocks,
      });

      setMessage({
        type: 'success',
        text: `インポート完了: ${newSuppliers.length}業者、${newProducts.length}商品、${newStocks.length}件の在庫データ`,
      });
    } catch (error) {
      console.error('インポートエラー:', error);
      setMessage({
        type: 'error',
        text: 'ファイルの読み込みに失敗しました。形式を確認してください。',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      setMessage({ type: 'error', text: 'エクスポートする商品がありません' });
      return;
    }

    const csv = exportProductsToCSV(products, stocks, suppliers);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `在庫一覧_${date}.csv`);

    setMessage({ type: 'success', text: 'CSVファイルをダウンロードしました' });
  };

  const handleExportExcel = () => {
    if (products.length === 0) {
      setMessage({ type: 'error', text: 'エクスポートする商品がありません' });
      return;
    }

    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const data = [
      ['品番', '品名', '業者', '単価', '在庫数', '最小在庫数', '在庫金額'],
      ...products.map((p) => {
        const qty = stockMap.get(p.id) ?? 0;
        return [
          p.id,
          p.name,
          supplierMap.get(p.supplierId) ?? '',
          p.unitPrice,
          qty,
          p.minStock,
          qty * p.unitPrice,
        ];
      }),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
      { wch: 15 },
      { wch: 35 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '在庫一覧');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `在庫一覧_${date}.xlsx`);

    setMessage({ type: 'success', text: 'Excelファイルをダウンロードしました' });
  };

  const handleClearData = () => {
    if (window.confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
      clearAllData();
      setMessage({ type: 'success', text: 'すべてのデータを削除しました' });
    }
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">データ管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">CSV連携</h1>
          </div>
        </div>
      </div>

      {/* SLDS Alert - メッセージ表示 */}
      {message && (
        <div
          className={`flex items-center space-x-2 p-4 rounded border ${
            message.type === 'success'
              ? 'bg-[#cdefc4] border-[#2e844a]/20 text-[#2e844a]'
              : 'bg-[#feded8] border-[#c23934]/20 text-[#c23934]'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* SLDS KPI Cards - 現在のデータ状況 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#0176d3]">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-[#0176d3]" />
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">業者数</p>
          </div>
          <p className="text-2xl font-light text-[#181818] mt-1">{formatNumber(suppliers.length)}</p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#2e844a]">
          <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">商品数</p>
          <p className="text-2xl font-light text-[#181818] mt-1">{formatNumber(products.length)}</p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#9050e9]">
          <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">在庫レコード数</p>
          <p className="text-2xl font-light text-[#181818] mt-1">{formatNumber(stocks.length)}</p>
        </div>
      </div>

      {/* SLDS Card - インポート */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-base font-bold text-[#181818]">データのインポート</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#706e6b] mb-4">
            既存のCSVまたはExcelファイルから商品・在庫データをインポートします。
            現在のデータに追加されます（重複する商品は上書きされます）。
          </p>
          <div className="flex flex-col md:flex-row gap-4">
            <label className="btn-primary flex items-center justify-center space-x-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{importing ? 'インポート中...' : 'ファイルを選択'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                disabled={importing}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-[#706e6b] mt-3">
            対応形式: CSV, Excel (.xlsx, .xls)
          </p>
        </div>
      </div>

      {/* SLDS Card - エクスポート */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-base font-bold text-[#181818]">データのエクスポート</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#706e6b] mb-4">
            現在の商品・在庫データをファイルに出力します。
            縦一列のフォーマットで、既存のExcelシステムに取り込めます。
          </p>
          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={handleExportCSV}
              disabled={products.length === 0}
              className="btn-secondary flex items-center justify-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>CSV形式でダウンロード</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={products.length === 0}
              className="btn-primary flex items-center justify-center space-x-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel形式でダウンロード</span>
            </button>
          </div>
        </div>
      </div>

      {/* SLDS Card - データ削除 */}
      <div className="bg-white border border-[#c23934]/30 rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#c23934]/30">
          <h2 className="text-base font-bold text-[#c23934]">データの削除</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#706e6b] mb-4">
            すべての商品・在庫・発注データを削除します。この操作は取り消せません。
          </p>
          <button
            onClick={handleClearData}
            className="btn-danger flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>すべてのデータを削除</span>
          </button>
        </div>
      </div>

      {/* SLDS Card - 使い方 */}
      <div className="bg-[#d8edff]/30 border border-[#0176d3]/20 rounded shadow-sm">
        <div className="px-4 py-3 border-b border-[#0176d3]/20">
          <div className="flex items-center space-x-2">
            <Info className="w-5 h-5 text-[#0176d3]" />
            <h2 className="text-base font-bold text-[#181818]">使い方</h2>
          </div>
        </div>
        <div className="p-4">
          <ol className="list-decimal list-inside text-sm text-[#706e6b] space-y-2">
            <li>
              <strong className="text-[#181818]">既存データの取込:</strong> 現在使用しているExcel/CSVファイルを「ファイルを選択」からインポート
            </li>
            <li>
              <strong className="text-[#181818]">日々の在庫更新:</strong> スキャン画面または在庫入力画面で在庫数を更新
            </li>
            <li>
              <strong className="text-[#181818]">Excelへの反映:</strong> 「CSV形式でダウンロード」でエクスポートし、既存のExcelシステムに取り込み
            </li>
            <li>
              <strong className="text-[#181818]">発注処理:</strong> 発注画面で不足商品を確認し、業者ごとの発注書をダウンロード
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
