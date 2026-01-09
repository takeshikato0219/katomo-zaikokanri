import { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Search, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { encodeQRData } from '../utils/qrcode';

const ITEMS_PER_PAGE = 12;

export function ProductQRList() {
  const { products, suppliers } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSupplier =
        !supplierFilter || product.supplierId === supplierFilter;

      return matchesSearch && matchesSupplier;
    });
  }, [products, searchTerm, supplierFilter]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentProducts = paginatedProducts;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>商品一覧・QRコード</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif;
              margin: 0;
              padding: 15px;
              background: white;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 2px solid #333;
            }
            .header h1 {
              font-size: 18px;
              margin: 0 0 5px 0;
            }
            .header p {
              font-size: 11px;
              color: #666;
              margin: 0;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              grid-template-rows: repeat(4, 1fr);
              gap: 10px;
              height: calc(100vh - 100px);
            }
            .item {
              border: 1px solid #ddd;
              border-radius: 6px;
              padding: 8px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              background: #fafafa;
              page-break-inside: avoid;
            }
            .qr-container {
              flex-shrink: 0;
            }
            .qr-container img {
              width: 90px;
              height: 90px;
            }
            .info {
              text-align: center;
              width: 100%;
              margin-top: 6px;
            }
            .product-name {
              font-size: 11px;
              font-weight: bold;
              line-height: 1.3;
              margin-bottom: 3px;
              word-break: break-all;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .supplier-name {
              font-size: 9px;
              color: #666;
              margin-bottom: 2px;
            }
            .product-id {
              font-size: 8px;
              color: #999;
            }
            .price {
              font-size: 10px;
              color: #333;
              font-weight: bold;
              margin-top: 2px;
            }
            .footer {
              margin-top: 10px;
              text-align: center;
              font-size: 10px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>商品一覧・QRコード表</h1>
            <p>katomotor在庫管理システム - 印刷日: ${new Date().toLocaleDateString('ja-JP')}</p>
          </div>
          <div class="grid">
            ${currentProducts
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                return `
                  <div class="item">
                    <div class="qr-container">
                      <svg id="qr-${product.id}"></svg>
                    </div>
                    <div class="info">
                      <div class="product-name">${product.name}</div>
                      <div class="supplier-name">${supplierName}</div>
                      <div class="product-id">ID: ${product.id}</div>
                      <div class="price">¥${product.unitPrice.toLocaleString()}</div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
          <div class="footer">
            ページ ${currentPage + 1} / ${totalPages} - 全${filteredProducts.length}件中 ${currentPage * ITEMS_PER_PAGE + 1}〜${Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredProducts.length)}件
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
          <script>
            ${currentProducts
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                const qrData = encodeQRData(product, supplierName);
                return `
                  QRCode.toCanvas(document.createElement('canvas'), '${qrData.replace(/'/g, "\\'")}', { width: 90 }, function(error, canvas) {
                    if (error) console.error(error);
                    const svg = document.getElementById('qr-${product.id}');
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL();
                    img.style.width = '90px';
                    img.style.height = '90px';
                    svg.parentNode.replaceChild(img, svg);
                  });
                `;
              })
              .join('')}
            setTimeout(function() { window.print(); }, 1000);
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintAll = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // 全ページ分のHTMLを生成
    const pages: string[] = [];
    for (let i = 0; i < totalPages; i++) {
      const pageProducts = filteredProducts.slice(
        i * ITEMS_PER_PAGE,
        (i + 1) * ITEMS_PER_PAGE
      );

      pages.push(`
        <div class="page">
          <div class="header">
            <h1>商品一覧・QRコード表</h1>
            <p>katomotor在庫管理システム - 印刷日: ${new Date().toLocaleDateString('ja-JP')}</p>
          </div>
          <div class="grid">
            ${pageProducts
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                return `
                  <div class="item">
                    <div class="qr-container">
                      <svg id="qr-${product.id}"></svg>
                    </div>
                    <div class="info">
                      <div class="product-name">${product.name}</div>
                      <div class="supplier-name">${supplierName}</div>
                      <div class="product-id">ID: ${product.id}</div>
                      <div class="price">¥${product.unitPrice.toLocaleString()}</div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
          <div class="footer">
            ページ ${i + 1} / ${totalPages} - 全${filteredProducts.length}件中 ${i * ITEMS_PER_PAGE + 1}〜${Math.min((i + 1) * ITEMS_PER_PAGE, filteredProducts.length)}件
          </div>
        </div>
      `);
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>商品一覧・QRコード（全ページ）</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
              .page {
                page-break-after: always;
              }
              .page:last-child {
                page-break-after: auto;
              }
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif;
              margin: 0;
              padding: 0;
              background: white;
            }
            .page {
              padding: 15px;
              height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 2px solid #333;
            }
            .header h1 {
              font-size: 18px;
              margin: 0 0 5px 0;
            }
            .header p {
              font-size: 11px;
              color: #666;
              margin: 0;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              grid-template-rows: repeat(4, 1fr);
              gap: 10px;
              flex: 1;
            }
            .item {
              border: 1px solid #ddd;
              border-radius: 6px;
              padding: 8px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              background: #fafafa;
            }
            .qr-container {
              flex-shrink: 0;
            }
            .qr-container img {
              width: 90px;
              height: 90px;
            }
            .info {
              text-align: center;
              width: 100%;
              margin-top: 6px;
            }
            .product-name {
              font-size: 11px;
              font-weight: bold;
              line-height: 1.3;
              margin-bottom: 3px;
              word-break: break-all;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .supplier-name {
              font-size: 9px;
              color: #666;
              margin-bottom: 2px;
            }
            .product-id {
              font-size: 8px;
              color: #999;
            }
            .price {
              font-size: 10px;
              color: #333;
              font-weight: bold;
              margin-top: 2px;
            }
            .footer {
              margin-top: 10px;
              text-align: center;
              font-size: 10px;
              color: #999;
            }
          </style>
        </head>
        <body>
          ${pages.join('')}
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
          <script>
            ${filteredProducts
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                const qrData = encodeQRData(product, supplierName);
                return `
                  QRCode.toCanvas(document.createElement('canvas'), '${qrData.replace(/'/g, "\\'")}', { width: 90 }, function(error, canvas) {
                    if (error) console.error(error);
                    const svg = document.getElementById('qr-${product.id}');
                    if (svg) {
                      const img = document.createElement('img');
                      img.src = canvas.toDataURL();
                      img.style.width = '90px';
                      img.style.height = '90px';
                      svg.parentNode.replaceChild(img, svg);
                    }
                  });
                `;
              })
              .join('')}
            setTimeout(function() { window.print(); }, 2000);
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">商品一覧・QRコード表</h2>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            disabled={paginatedProducts.length === 0}
            className="btn-secondary flex items-center space-x-2"
          >
            <Printer className="w-4 h-4" />
            <span>現在のページを印刷</span>
          </button>
          <button
            onClick={handlePrintAll}
            disabled={filteredProducts.length === 0}
            className="btn-primary flex items-center space-x-2"
          >
            <Printer className="w-4 h-4" />
            <span>全ページ印刷 ({totalPages}ページ)</span>
          </button>
        </div>
      </div>

      {/* フィルター */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="品名・品番で検索..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="md:w-48">
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setCurrentPage(0);
              }}
              className="input-field"
            >
              <option value="">すべての業者</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          全 {filteredProducts.length} 件 / {totalPages} ページ（1ページ12件）
        </div>
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="btn-secondary flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            前へ
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (currentPage < 3) {
                pageNum = i;
              } else if (currentPage > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-lg ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="btn-secondary flex items-center gap-1"
          >
            次へ
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 商品一覧（3列×4行 = 12件） */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedProducts.map((product) => {
            const supplierName = supplierMap.get(product.supplierId) || '';
            const qrData = encodeQRData(product, supplierName);

            return (
              <div
                key={product.id}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col items-center">
                  <QRCodeSVG value={qrData} size={100} />
                  <div className="mt-3 text-center w-full">
                    <p className="font-bold text-sm line-clamp-2">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{supplierName}</p>
                    <p className="text-xs text-gray-400">ID: {product.id}</p>
                    <p className="text-sm font-bold text-gray-700 mt-1">
                      ¥{product.unitPrice.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {paginatedProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {products.length === 0
              ? '商品データがありません。'
              : '検索条件に一致する商品がありません。'}
          </div>
        )}
      </div>

      {/* ページネーション（下部） */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="btn-secondary flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            前へ
          </button>
          <span className="text-gray-600">
            {currentPage + 1} / {totalPages} ページ
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="btn-secondary flex items-center gap-1"
          >
            次へ
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
