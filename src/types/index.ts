// 業者（仕入先）
export interface Supplier {
  id: string;
  name: string;
}

// 商品
export interface Product {
  id: string;           // 品番（一意のID）
  name: string;         // 品名
  supplierId: string;   // 業者ID
  unitPrice: number;    // 単価
  minStock: number;     // 最小在庫数（これを下回ると発注対象）
  idealStock?: number;  // 理想在庫数（目標在庫数）
  reorderQty?: number;  // 補充在庫量（発注時の補充数量）
  leadDays?: number;    // 入荷日数（発注から入荷までのおおよその日数）
  lot?: string;         // ロット情報
  category?: string;    // カテゴリ
  rowIndex?: number;    // CSVでの行番号（元データ参照用）
  barcode?: string;     // バーコード/QRコード
}

// 在庫
export interface Stock {
  productId: string;
  quantity: number;      // 現在庫数
  lastUpdated: string;   // 最終更新日（ISO形式）
  lastOrderedAt?: string; // 最終発注日（ISO形式）
}

// 顧客
export interface Customer {
  id: string;
  name: string;
  furigana?: string;  // ふりがな
  phone?: string;
  note?: string;
  createdAt: string;
}

// 入出庫履歴
export interface Transaction {
  id: string;
  productId: string;
  type: 'in' | 'out';    // 入庫/出庫
  subType?: 'purchase' | 'stockIn' | 'usage' | 'adjustment';  // 仕入/在庫分仕入/使用/調整
  quantity: number;
  date: string;          // ISO形式
  customerId?: string;   // 使用時の顧客ID
  operator?: string;     // 担当者名
  note?: string;
}

// 発注アイテム
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

// 発注
export interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  items: OrderItem[];
  status: 'pending' | 'ordered' | 'received';
  createdAt: string;
  orderedAt?: string;
  receivedAt?: string;
  totalAmount: number;
}

// 不足商品情報
export interface ShortageItem {
  product: Product;
  currentStock: number;
  shortage: number;       // 不足数（最小在庫数 - 現在庫数）
  supplierName: string;
}

// 仕入先別月次集計
export interface SupplierMonthlySummary {
  supplierId: string;
  supplierName: string;
  yearMonth: string;         // YYYY-MM形式
  previousBalance: number;   // 前月残高（金額）
  monthlyPurchase: number;   // 当月仕入れ（金額）
  monthlyUsage: number;      // 当月使用（金額）
  stockInPurchase: number;   // 在庫分仕入（金額）
  change: number;            // 増減（金額）
  calculatedBalance: number; // 当月残計算（金額）
  displayStock: number;      // 表在庫（数量）
  actualStock: number;       // 実質在庫（数量）
}

// 日別入荷集計
export interface DailyReceiptSummary {
  date: string;              // YYYY-MM-DD形式
  supplierId: string;
  supplierName: string;
  totalQuantity: number;
  totalAmount: number;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
}

// 顧客別使用集計
export interface CustomerUsageSummary {
  customerId: string;
  customerName: string;
  yearMonth: string;
  totalAmount: number;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    date: string;
  }[];
}

// アプリの状態
export interface AppState {
  suppliers: Supplier[];
  products: Product[];
  stocks: Stock[];
  transactions: Transaction[];
  orders: Order[];
  customers: Customer[];
}

// CSVインポート時の生データ行
export interface RawCSVRow {
  [key: string]: string;
}

// QRコードデータ
export interface QRCodeData {
  productId: string;
  productName: string;
  supplierName: string;
}

// ナビゲーションページ
export type Page =
  | 'dashboard'
  | 'inventory-table'
  | 'products'
  | 'inventory'
  | 'scanner'
  | 'orders'
  | 'qr-print'
  | 'qr-list'
  | 'import-export'
  | 'monthly-summary'
  | 'customers'
  | 'receipt'
  | 'usage'
  | 'mobile-receipt'
  | 'mobile-usage';

// ===== AI関連型定義 =====

// 需要予測結果
export interface DemandForecastResult {
  productId: string;
  productName: string;
  supplierName: string;
  currentStock: number;
  predictedUsageNextWeek: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  willRunOut: boolean;
  daysUntilStockout: number | null;
  suggestedOrderQuantity: number;
  reason: string;
}

// 最小在庫最適化提案
export interface MinStockOptimization {
  productId: string;
  productName: string;
  currentMinStock: number;
  suggestedMinStock: number;
  reason: string;
  averageWeeklyUsage: number;
}

// AI検索意図
export interface AISearchIntent {
  type: 'product_name' | 'category' | 'supplier' | 'usage_history' | 'stock_status';
  keywords: string[];
  correctedQuery: string | null;
  dateFilter: { type: 'last_month' | 'last_week' } | null;
  interpretation: string;
}

// AI検索結果
export interface AISearchResult {
  products: Product[];
  interpretation: string;
  suggestions: string[];
}

// 音声認識結果
export interface VoiceRecognitionResult {
  transcription: string;
  confidence: number;
}

// 音声コマンド解析結果
export interface VoiceCommandResult {
  action: 'receipt' | 'usage' | 'search' | 'quantity' | 'unknown';
  productName?: string;
  productId?: string;
  quantity?: number;
  interpretation: string;
}

// AIレポート
export interface AIReport {
  executiveSummary: string;
  trendAnalysis: string;
  recommendations: string[];
  highlights: AIReportHighlight[];
  generatedAt: string;
}

// AIレポートハイライト
export interface AIReportHighlight {
  type: 'positive' | 'warning' | 'info';
  message: string;
}
