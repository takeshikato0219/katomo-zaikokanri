import type { QRCodeData, Product, Supplier } from '../types';

// QRコードにエンコードするデータを生成
export function encodeQRData(
  product: Product,
  supplierName: string
): string {
  const data: QRCodeData = {
    productId: product.id,
    productName: product.name,
    supplierName,
  };
  return JSON.stringify(data);
}

// QRコードからデータをデコード
export function decodeQRData(qrString: string): QRCodeData | null {
  try {
    const data = JSON.parse(qrString) as QRCodeData;
    if (data.productId && data.productName) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// 複数商品のQRコードラベル用データを生成
export function generateQRLabels(
  products: Product[],
  suppliers: Supplier[]
): Array<{
  product: Product;
  supplierName: string;
  qrData: string;
}> {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  return products.map((product) => {
    const supplierName = supplierMap.get(product.supplierId) ?? '不明';
    return {
      product,
      supplierName,
      qrData: encodeQRData(product, supplierName),
    };
  });
}
