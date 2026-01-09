import { useState, useRef } from 'react';
import { X, Printer, FileText, Check, Minus, Plus } from 'lucide-react';
import type { Product } from '../types';

interface OrderItem {
  product: Product;
  currentStock: number;
  shortage: number; // 補充トリガー（minStock）に対する不足数
  orderQuantity: number; // 実際の発注数（編集可能）
}

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierName: string;
  supplierId: string;
  items: OrderItem[];
  onConfirm: (items: OrderItem[]) => void;
}

// 会社情報
const COMPANY_INFO = {
  name: '有限会社 加藤モーター',
  representative: '代表取締役　加藤 健資',
  address: '新潟県燕市小高6245-1',
  tel: '0256-62-6516',
  fax: '0256-66-3327',
};

export function PurchaseOrderModal({
  isOpen,
  onClose,
  supplierName,
  items: initialItems,
  onConfirm,
}: PurchaseOrderModalProps) {
  const [step, setStep] = useState<'confirm' | 'preview'>('confirm');
  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // 発注数を変更
  const handleQuantityChange = (productId: string, newQuantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, orderQuantity: Math.max(0, newQuantity) }
          : item
      )
    );
  };

  // 発注数を増減
  const handleQuantityAdjust = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, orderQuantity: Math.max(0, item.orderQuantity + delta) }
          : item
      )
    );
  };

  // 発注対象のアイテム（発注数が0より大きいもの）
  const orderItems = items.filter((item) => item.orderQuantity > 0);

  // 合計金額
  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.product.unitPrice * item.orderQuantity,
    0
  );
  const totalAmountWithTax = Math.round(totalAmount * 1.1);

  // 印刷
  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>発注書 - ${supplierName}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            body {
              font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif;
              font-size: 12px;
              line-height: 1.5;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .header h1 {
              font-size: 24px;
              font-weight: bold;
              margin: 0;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .info-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
            }
            .supplier-info {
              text-align: left;
            }
            .supplier-info h2 {
              font-size: 18px;
              margin: 0 0 5px 0;
              border-bottom: 1px solid #333;
              display: inline-block;
              padding-bottom: 3px;
            }
            .company-info {
              text-align: right;
              font-size: 11px;
            }
            .company-info .company-name {
              font-size: 14px;
              font-weight: bold;
            }
            .date {
              text-align: right;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #333;
              padding: 8px;
              text-align: center;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            td.name {
              text-align: left;
            }
            td.price, td.amount {
              text-align: right;
            }
            .total-section {
              text-align: right;
              margin-top: 20px;
            }
            .total-row {
              display: flex;
              justify-content: flex-end;
              margin: 5px 0;
            }
            .total-label {
              width: 100px;
              text-align: right;
              margin-right: 20px;
            }
            .total-value {
              width: 120px;
              text-align: right;
              font-weight: bold;
            }
            .total-grand {
              font-size: 16px;
              border-top: 2px solid #333;
              padding-top: 10px;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // 確認画面
  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="bg-[#fef1cd]/30 border border-[#fef1cd] rounded p-3">
        <p className="text-sm text-[#706e6b]">
          以下の商品の発注数を確認・調整してください。
        </p>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-[#fafaf9] sticky top-0">
            <tr>
              <th className="border border-[#e5e5e5] px-3 py-2 text-left">品名</th>
              <th className="border border-[#e5e5e5] px-3 py-2 text-right w-20">現在庫</th>
              <th className="border border-[#e5e5e5] px-3 py-2 text-right w-20">不足数</th>
              <th className="border border-[#e5e5e5] px-3 py-2 text-right w-20">単価</th>
              <th className="border border-[#e5e5e5] px-3 py-2 text-center w-32">発注数</th>
              <th className="border border-[#e5e5e5] px-3 py-2 text-right w-24">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.product.id} className="hover:bg-[#f3f3f3]">
                <td className="border border-[#e5e5e5] px-3 py-2">{item.product.name}</td>
                <td className="border border-[#e5e5e5] px-3 py-2 text-right">{item.currentStock}</td>
                <td className="border border-[#e5e5e5] px-3 py-2 text-right text-[#c23934] font-medium">
                  {item.shortage}
                </td>
                <td className="border border-[#e5e5e5] px-3 py-2 text-right">
                  {item.product.unitPrice.toLocaleString()}円
                </td>
                <td className="border border-[#e5e5e5] px-3 py-2">
                  <div className="flex items-center justify-center space-x-1">
                    <button
                      onClick={() => handleQuantityAdjust(item.product.id, -1)}
                      className="p-1 rounded hover:bg-[#e5e5e5]"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={item.orderQuantity}
                      onChange={(e) =>
                        handleQuantityChange(item.product.id, parseInt(e.target.value) || 0)
                      }
                      className="w-16 px-2 py-1 text-center border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#0176d3]"
                    />
                    <button
                      onClick={() => handleQuantityAdjust(item.product.id, 1)}
                      className="p-1 rounded hover:bg-[#e5e5e5]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                <td className="border border-[#e5e5e5] px-3 py-2 text-right">
                  {(item.product.unitPrice * item.orderQuantity).toLocaleString()}円
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[#fafaf9] border border-[#e5e5e5] rounded p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#706e6b]">発注合計金額（税抜）</span>
          <span className="text-lg font-bold">{totalAmount.toLocaleString()}円</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-[#706e6b]">発注合計金額（税込）</span>
          <span className="text-xl font-bold text-[#0176d3]">{totalAmountWithTax.toLocaleString()}円</span>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm border border-[#e5e5e5] rounded hover:bg-[#f3f3f3]"
        >
          キャンセル
        </button>
        <button
          onClick={() => setStep('preview')}
          disabled={orderItems.length === 0}
          className="flex items-center space-x-2 px-4 py-2 text-sm bg-[#0176d3] text-white rounded hover:bg-[#015ba5] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="w-4 h-4" />
          <span>発注書プレビュー</span>
        </button>
      </div>
    </div>
  );

  // 発注書プレビュー
  const renderPreviewStep = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    return (
      <div className="space-y-4">
        {/* 印刷用コンテンツ */}
        <div
          ref={printRef}
          className="bg-white border border-[#e5e5e5] rounded p-6 max-h-[500px] overflow-y-auto"
        >
          <div className="header text-center mb-6">
            <h1 className="text-2xl font-bold border-b-2 border-[#333] pb-2 inline-block">
              発 注 書
            </h1>
          </div>

          <div className="date text-right mb-4">
            <p>{dateStr}</p>
          </div>

          <div className="flex justify-between mb-6">
            <div className="supplier-info">
              <h2 className="text-lg font-bold border-b border-[#333] inline-block pb-1 mb-2">
                {supplierName} 御中
              </h2>
              <p className="text-sm text-[#706e6b] mt-2">下記の通り発注いたします。</p>
            </div>
            <div className="company-info text-right text-sm">
              <p className="company-name font-bold text-base">{COMPANY_INFO.name}</p>
              <p>{COMPANY_INFO.representative}</p>
              <p>{COMPANY_INFO.address}</p>
              <p>TEL: {COMPANY_INFO.tel}</p>
              <p>FAX: {COMPANY_INFO.fax}</p>
            </div>
          </div>

          <table className="w-full border-collapse text-sm mb-4">
            <thead>
              <tr className="bg-[#f5f5f5]">
                <th className="border border-[#333] px-3 py-2 text-center w-12">No.</th>
                <th className="border border-[#333] px-3 py-2 text-left">品名</th>
                <th className="border border-[#333] px-3 py-2 text-right w-20">数量</th>
                <th className="border border-[#333] px-3 py-2 text-right w-24">単価</th>
                <th className="border border-[#333] px-3 py-2 text-right w-28">金額</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr key={item.product.id}>
                  <td className="border border-[#333] px-3 py-2 text-center">{index + 1}</td>
                  <td className="border border-[#333] px-3 py-2">{item.product.name}</td>
                  <td className="border border-[#333] px-3 py-2 text-right">{item.orderQuantity}</td>
                  <td className="border border-[#333] px-3 py-2 text-right">
                    {item.product.unitPrice.toLocaleString()}円
                  </td>
                  <td className="border border-[#333] px-3 py-2 text-right">
                    {(item.product.unitPrice * item.orderQuantity).toLocaleString()}円
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-right space-y-2 mt-6">
            <div className="flex justify-end">
              <span className="w-24 text-right mr-4">小計</span>
              <span className="w-32 text-right font-bold">{totalAmount.toLocaleString()}円</span>
            </div>
            <div className="flex justify-end">
              <span className="w-24 text-right mr-4">消費税（10%）</span>
              <span className="w-32 text-right font-bold">
                {Math.round(totalAmount * 0.1).toLocaleString()}円
              </span>
            </div>
            <div className="flex justify-end border-t-2 border-[#333] pt-2 mt-2">
              <span className="w-24 text-right mr-4 text-lg">合計</span>
              <span className="w-32 text-right font-bold text-lg">{totalAmountWithTax.toLocaleString()}円</span>
            </div>
          </div>

          <div className="footer mt-8 text-center text-xs text-[#666]">
            <p>本発注書は {COMPANY_INFO.name} が発行いたしました。</p>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => setStep('confirm')}
            className="px-4 py-2 text-sm border border-[#e5e5e5] rounded hover:bg-[#f3f3f3]"
          >
            戻る
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-[#e5e5e5] rounded hover:bg-[#f3f3f3]"
            >
              キャンセル
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-4 py-2 text-sm bg-[#0176d3] text-white rounded hover:bg-[#015ba5]"
            >
              <Printer className="w-4 h-4" />
              <span>印刷</span>
            </button>
            <button
              onClick={() => {
                onConfirm(orderItems);
                onClose();
              }}
              className="flex items-center space-x-2 px-4 py-2 text-sm bg-[#2e844a] text-white rounded hover:bg-[#236b3a]"
            >
              <Check className="w-4 h-4" />
              <span>発注確定</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5] bg-[#fafaf9]">
          <div>
            <h2 className="text-lg font-bold text-[#181818]">発注書発行</h2>
            <p className="text-sm text-[#706e6b]">{supplierName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-[#e5e5e5] transition-colors"
          >
            <X className="w-5 h-5 text-[#706e6b]" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {step === 'confirm' ? renderConfirmStep() : renderPreviewStep()}
        </div>
      </div>
    </div>
  );
}
