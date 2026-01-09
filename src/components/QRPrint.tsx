import { useState, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Search, Printer, Check } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { encodeQRData } from '../utils/qrcode';

export function QRPrint() {
  const { products, suppliers } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);

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

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const selectedProductsList = products.filter((p) => selectedProducts.has(p.id));

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QRコードラベル</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
            }
            body {
              font-family: 'Hiragino Kaku Gothic ProN', sans-serif;
              margin: 0;
              padding: 20px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
            }
            .label {
              border: 1px solid #ccc;
              padding: 10px;
              text-align: center;
              page-break-inside: avoid;
            }
            .label svg {
              max-width: 100%;
              height: auto;
            }
            .product-name {
              font-size: 11px;
              font-weight: bold;
              margin-top: 8px;
              word-break: break-all;
              line-height: 1.3;
            }
            .supplier-name {
              font-size: 9px;
              color: #666;
              margin-top: 4px;
            }
            .product-id {
              font-size: 8px;
              color: #999;
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${selectedProductsList
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                return `
                  <div class="label">
                    <svg id="qr-${product.id}"></svg>
                    <div class="product-name">${product.name}</div>
                    <div class="supplier-name">${supplierName}</div>
                    <div class="product-id">${product.id}</div>
                  </div>
                `;
              })
              .join('')}
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
          <script>
            ${selectedProductsList
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                const qrData = encodeQRData(product, supplierName);
                return `
                  QRCode.toCanvas(document.createElement('canvas'), '${qrData.replace(/'/g, "\\'")}', { width: 120 }, function(error, canvas) {
                    if (error) console.error(error);
                    const svg = document.getElementById('qr-${product.id}');
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL();
                    img.style.width = '120px';
                    img.style.height = '120px';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">QRコード印刷</h2>
        <button
          onClick={handlePrint}
          disabled={selectedProducts.size === 0}
          className="btn-primary flex items-center space-x-2"
        >
          <Printer className="w-4 h-4" />
          <span>印刷 ({selectedProducts.size}件)</span>
        </button>
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
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="md:w-48">
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
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
          <div className="flex space-x-2">
            <button onClick={selectAll} className="btn-secondary text-sm">
              すべて選択
            </button>
            <button onClick={deselectAll} className="btn-secondary text-sm">
              選択解除
            </button>
          </div>
        </div>
      </div>

      {/* 商品リスト */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const isSelected = selectedProducts.has(product.id);
            const supplierName = supplierMap.get(product.supplierId) || '';
            const qrData = encodeQRData(product, supplierName);

            return (
              <div
                key={product.id}
                onClick={() => toggleProduct(product.id)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <QRCodeSVG value={qrData} size={80} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm truncate">{product.name}</p>
                      {isSelected && (
                        <Check className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{supplierName}</p>
                    <p className="text-xs text-gray-400">{product.id}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {products.length === 0
              ? '商品データがありません。'
              : '検索条件に一致する商品がありません。'}
          </div>
        )}
      </div>

      {/* プレビュー */}
      {selectedProducts.size > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">印刷プレビュー</h3>
          <div
            ref={printRef}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {products
              .filter((p) => selectedProducts.has(p.id))
              .map((product) => {
                const supplierName = supplierMap.get(product.supplierId) || '';
                const qrData = encodeQRData(product, supplierName);

                return (
                  <div
                    key={product.id}
                    className="border p-3 text-center bg-white"
                  >
                    <QRCodeSVG value={qrData} size={100} className="mx-auto" />
                    <p className="text-xs font-bold mt-2 break-all">
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500">{supplierName}</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
