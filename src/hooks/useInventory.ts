import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type {
  Supplier,
  Product,
  Stock,
  Transaction,
  Order,
  ShortageItem,
  OrderItem,
  Customer,
  SupplierMonthlySummary,
  DailyReceiptSummary,
  CustomerUsageSummary,
} from '../types';

const STORAGE_KEYS = {
  SUPPLIERS: 'inventory_suppliers',
  PRODUCTS: 'inventory_products',
  STOCKS: 'inventory_stocks',
  TRANSACTIONS: 'inventory_transactions',
  ORDERS: 'inventory_orders',
  CUSTOMERS: 'inventory_customers',
};

export function useInventory() {
  const [suppliers, setSuppliers] = useLocalStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
  const [products, setProducts] = useLocalStorage<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  const [stocks, setStocks] = useLocalStorage<Stock[]>(STORAGE_KEYS.STOCKS, []);
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
  const [orders, setOrders] = useLocalStorage<Order[]>(STORAGE_KEYS.ORDERS, []);
  const [customers, setCustomers] = useLocalStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);

  // ===== 業者管理 =====
  const addSupplier = useCallback((supplier: Supplier) => {
    setSuppliers((prev) => {
      if (prev.find((s) => s.id === supplier.id)) {
        return prev.map((s) => (s.id === supplier.id ? supplier : s));
      }
      return [...prev, supplier];
    });
  }, [setSuppliers]);

  const getSupplierById = useCallback((id: string) => {
    return suppliers.find((s) => s.id === id);
  }, [suppliers]);

  // ===== 商品管理 =====
  const addProduct = useCallback((product: Product) => {
    setProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      if (exists) {
        return prev.map((p) => (p.id === product.id ? product : p));
      }
      return [...prev, product];
    });
  }, [setProducts]);

  const updateProduct = useCallback((productId: string, updates: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, ...updates } : p))
    );
  }, [setProducts]);

  // 複数商品を一括更新
  const updateProducts = useCallback((updates: { productId: string; updates: Partial<Product> }[]) => {
    setProducts((prev) => {
      const updateMap = new Map(updates.map((u) => [u.productId, u.updates]));
      return prev.map((p) => {
        const productUpdates = updateMap.get(p.id);
        return productUpdates ? { ...p, ...productUpdates } : p;
      });
    });
  }, [setProducts]);

  const deleteProduct = useCallback((productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setStocks((prev) => prev.filter((s) => s.productId !== productId));
  }, [setProducts, setStocks]);

  const getProductById = useCallback((id: string) => {
    return products.find((p) => p.id === id);
  }, [products]);

  const getProductsBySupplier = useCallback((supplierId: string) => {
    return products.filter((p) => p.supplierId === supplierId);
  }, [products]);

  // ===== 在庫管理 =====
  const getStock = useCallback((productId: string): number => {
    const stock = stocks.find((s) => s.productId === productId);
    return stock?.quantity ?? 0;
  }, [stocks]);

  const setStock = useCallback((productId: string, quantity: number) => {
    const now = new Date().toISOString();
    setStocks((prev) => {
      const exists = prev.find((s) => s.productId === productId);
      if (exists) {
        return prev.map((s) =>
          s.productId === productId
            ? { ...s, quantity, lastUpdated: now }
            : s
        );
      }
      return [...prev, { productId, quantity, lastUpdated: now }];
    });
  }, [setStocks]);

  const adjustStock = useCallback((
    productId: string,
    adjustment: number,
    type: 'in' | 'out',
    options?: {
      subType?: Transaction['subType'];
      customerId?: string;
      operator?: string;
      note?: string;
      date?: string;
    }
  ) => {
    const currentStock = getStock(productId);
    const newQuantity = type === 'in'
      ? currentStock + adjustment
      : currentStock - adjustment;

    setStock(productId, Math.max(0, newQuantity));

    // 履歴を記録
    const transaction: Transaction = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      productId,
      type,
      subType: options?.subType,
      quantity: adjustment,
      date: options?.date || new Date().toISOString(),
      customerId: options?.customerId,
      operator: options?.operator,
      note: options?.note,
    };
    setTransactions((prev) => [transaction, ...prev]);
  }, [getStock, setStock, setTransactions]);

  // バーコード/QRコードから商品を検索
  const getProductByBarcode = useCallback((barcode: string) => {
    return products.find((p) => p.barcode === barcode);
  }, [products]);

  // ===== 不足商品 =====
  const getShortageItems = useCallback((): ShortageItem[] => {
    const shortages: ShortageItem[] = [];

    products.forEach((product) => {
      const currentStock = getStock(product.id);
      if (currentStock < product.minStock) {
        const supplier = getSupplierById(product.supplierId);
        shortages.push({
          product,
          currentStock,
          shortage: product.minStock - currentStock,
          supplierName: supplier?.name ?? '不明',
        });
      }
    });

    return shortages.sort((a, b) => b.shortage - a.shortage);
  }, [products, getStock, getSupplierById]);

  // ===== 発注管理 =====
  const createOrder = useCallback((supplierId: string, items: OrderItem[]): Order => {
    const supplier = getSupplierById(supplierId);
    const order: Order = {
      id: `ORD-${Date.now()}`,
      supplierId,
      supplierName: supplier?.name ?? '不明',
      items,
      status: 'pending',
      createdAt: new Date().toISOString(),
      totalAmount: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    };

    setOrders((prev) => [order, ...prev]);
    return order;
  }, [getSupplierById, setOrders]);

  const updateOrderStatus = useCallback((
    orderId: string,
    status: Order['status']
  ) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const updates: Partial<Order> = { status };
        if (status === 'ordered') updates.orderedAt = new Date().toISOString();
        if (status === 'received') updates.receivedAt = new Date().toISOString();
        return { ...o, ...updates };
      })
    );
  }, [setOrders]);

  // 最終発注日を記録
  const recordOrderDate = useCallback((productIds: string[]) => {
    const now = new Date().toISOString();
    setStocks((prev) =>
      prev.map((s) =>
        productIds.includes(s.productId)
          ? { ...s, lastOrderedAt: now }
          : s
      )
    );
  }, [setStocks]);

  // ===== データ一括操作 =====
  const importData = useCallback((data: {
    suppliers?: Supplier[];
    products?: Product[];
    stocks?: Stock[];
  }) => {
    if (data.suppliers) {
      data.suppliers.forEach(addSupplier);
    }
    if (data.products) {
      data.products.forEach(addProduct);
    }
    if (data.stocks) {
      data.stocks.forEach((s) => setStock(s.productId, s.quantity));
    }
  }, [addSupplier, addProduct, setStock]);

  const clearAllData = useCallback(() => {
    setSuppliers([]);
    setProducts([]);
    setStocks([]);
    setTransactions([]);
    setOrders([]);
    setCustomers([]);
  }, [setSuppliers, setProducts, setStocks, setTransactions, setOrders, setCustomers]);

  // ===== 顧客管理 =====
  const addCustomer = useCallback((customer: Omit<Customer, 'id' | 'createdAt'>) => {
    const newCustomer: Customer = {
      ...customer,
      id: `C-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    setCustomers((prev) => [...prev, newCustomer]);
    return newCustomer;
  }, [setCustomers]);

  const updateCustomer = useCallback((customerId: string, updates: Partial<Customer>) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, ...updates } : c))
    );
  }, [setCustomers]);

  const deleteCustomer = useCallback((customerId: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  }, [setCustomers]);

  const getCustomerById = useCallback((id: string) => {
    return customers.find((c) => c.id === id);
  }, [customers]);

  // ===== 仕入先別月次集計 =====
  const getSupplierMonthlySummary = useCallback((yearMonth: string): SupplierMonthlySummary[] => {
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 前月の日付範囲
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1);
    const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59);

    // 商品を業者別にグループ化
    const productsBySupplier = new Map<string, Product[]>();
    products.forEach((p) => {
      const existing = productsBySupplier.get(p.supplierId) || [];
      existing.push(p);
      productsBySupplier.set(p.supplierId, existing);
    });

    const summaries: SupplierMonthlySummary[] = [];

    suppliers.forEach((supplier) => {
      const supplierProducts = productsBySupplier.get(supplier.id) || [];
      if (supplierProducts.length === 0) return;

      const productIds = new Set(supplierProducts.map((p) => p.id));
      const productPriceMap = new Map(supplierProducts.map((p) => [p.id, p.unitPrice]));

      // 該当期間のトランザクションをフィルタ
      const currentMonthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return productIds.has(t.productId) && txDate >= startDate && txDate <= endDate;
      });

      const prevMonthTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return productIds.has(t.productId) && txDate >= prevStartDate && txDate <= prevEndDate;
      });

      // 前月残高（前月の入荷 - 前月の使用）
      let previousBalance = 0;
      prevMonthTxns.forEach((t) => {
        const price = productPriceMap.get(t.productId) || 0;
        if (t.type === 'in') {
          previousBalance += t.quantity * price;
        } else {
          previousBalance -= t.quantity * price;
        }
      });

      // 当月仕入れ（subType = 'purchase'）
      let monthlyPurchase = 0;
      // 在庫分仕入（subType = 'stockIn'）
      let stockInPurchase = 0;
      // 当月使用
      let monthlyUsage = 0;

      currentMonthTxns.forEach((t) => {
        const price = productPriceMap.get(t.productId) || 0;
        const amount = t.quantity * price;

        if (t.type === 'in') {
          if (t.subType === 'stockIn') {
            stockInPurchase += amount;
          } else {
            monthlyPurchase += amount;
          }
        } else if (t.type === 'out' && t.subType === 'usage') {
          monthlyUsage += amount;
        }
      });

      // 増減 = 当月仕入れ + 在庫分仕入 - 当月使用
      const change = monthlyPurchase + stockInPurchase - monthlyUsage;

      // 当月残計算 = 前月残高 + 増減
      const calculatedBalance = previousBalance + change;

      // 表在庫（現在の在庫数量合計）
      let displayStock = 0;
      supplierProducts.forEach((p) => {
        displayStock += getStock(p.id);
      });

      // 実質在庫（調整後の数量）
      const actualStock = displayStock;

      summaries.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        yearMonth,
        previousBalance,
        monthlyPurchase,
        monthlyUsage,
        stockInPurchase,
        change,
        calculatedBalance,
        displayStock,
        actualStock,
      });
    });

    return summaries.sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'ja'));
  }, [suppliers, products, transactions, getStock]);

  // ===== 日別入荷集計 =====
  const getDailyReceiptSummary = useCallback((date: string): DailyReceiptSummary[] => {
    const targetDate = date.slice(0, 10); // YYYY-MM-DD

    // 該当日の入荷トランザクション
    const receipts = transactions.filter((t) => {
      return t.type === 'in' && t.date.slice(0, 10) === targetDate;
    });

    // 業者別にグループ化
    const bySupplier = new Map<string, typeof receipts>();
    receipts.forEach((t) => {
      const product = products.find((p) => p.id === t.productId);
      if (!product) return;
      const existing = bySupplier.get(product.supplierId) || [];
      existing.push(t);
      bySupplier.set(product.supplierId, existing);
    });

    const summaries: DailyReceiptSummary[] = [];

    bySupplier.forEach((txns, supplierId) => {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const items = txns.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        const unitPrice = product?.unitPrice || 0;
        return {
          productId: t.productId,
          productName: product?.name || '不明',
          quantity: t.quantity,
          unitPrice,
          amount: t.quantity * unitPrice,
        };
      });

      summaries.push({
        date: targetDate,
        supplierId,
        supplierName: supplier?.name || '不明',
        totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
        items,
      });
    });

    return summaries;
  }, [transactions, products, suppliers]);

  // ===== 顧客別使用集計 =====
  const getCustomerUsageSummary = useCallback((yearMonth: string): CustomerUsageSummary[] => {
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 該当期間の使用トランザクション
    const usages = transactions.filter((t) => {
      const txDate = new Date(t.date);
      return t.type === 'out' && t.subType === 'usage' && t.customerId && txDate >= startDate && txDate <= endDate;
    });

    // 顧客別にグループ化
    const byCustomer = new Map<string, typeof usages>();
    usages.forEach((t) => {
      if (!t.customerId) return;
      const existing = byCustomer.get(t.customerId) || [];
      existing.push(t);
      byCustomer.set(t.customerId, existing);
    });

    const summaries: CustomerUsageSummary[] = [];

    byCustomer.forEach((txns, customerId) => {
      const customer = customers.find((c) => c.id === customerId);
      const items = txns.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        const unitPrice = product?.unitPrice || 0;
        return {
          productId: t.productId,
          productName: product?.name || '不明',
          quantity: t.quantity,
          unitPrice,
          amount: t.quantity * unitPrice,
          date: t.date,
        };
      });

      summaries.push({
        customerId,
        customerName: customer?.name || '不明',
        yearMonth,
        totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
        items,
      });
    });

    return summaries.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [transactions, products, customers]);

  // 商品マップ（高速検索用）
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  return {
    // データ
    suppliers,
    products,
    stocks,
    transactions,
    orders,
    customers,
    productMap,

    // 業者
    addSupplier,
    getSupplierById,
    setSuppliers,

    // 商品
    addProduct,
    updateProduct,
    updateProducts,
    deleteProduct,
    getProductById,
    getProductsBySupplier,
    getProductByBarcode,
    setProducts,

    // 在庫
    getStock,
    setStock,
    adjustStock,
    setStocks,

    // 不足商品
    getShortageItems,

    // 発注
    createOrder,
    updateOrderStatus,
    recordOrderDate,
    setOrders,

    // 顧客
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerById,
    setCustomers,

    // 集計
    getSupplierMonthlySummary,
    getDailyReceiptSummary,
    getCustomerUsageSummary,

    // 一括操作
    importData,
    clearAllData,

    // トランザクション
    setTransactions,
  };
}
