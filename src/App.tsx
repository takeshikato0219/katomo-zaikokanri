import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { InventoryTable } from './components/InventoryTable';
import { ProductList } from './components/ProductList';
import { InventoryInput } from './components/InventoryInput';
import { QRScanner } from './components/QRScanner';
import { OrderList } from './components/OrderList';
import { QRPrint } from './components/QRPrint';
import { ProductQRList } from './components/ProductQRList';
import { ImportExport } from './components/ImportExport';
import { MonthlySummary } from './components/MonthlySummary';
import { CustomerList } from './components/CustomerList';
import { ReceiptProcessing } from './components/ReceiptProcessing';
import { UsageProcessing } from './components/UsageProcessing';
import { MobileReceiptProcessing } from './components/MobileReceiptProcessing';
import { MobileUsageProcessing } from './components/MobileUsageProcessing';
import { ReceiptStockHistory } from './components/ReceiptStockHistory';
import { DeliveryNoteScanner } from './components/DeliveryNoteScanner';
import { Login } from './components/Login';
import type { Page, User } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 起動時にログイン状態を確認
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('currentUser');
      }
    }
    setIsCheckingAuth(false);
  }, []);

  // ログアウト処理
  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    setCurrentPage('dashboard');
  };

  // 認証チェック中はローディング表示
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f3f3f3' }}>
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  // 未ログインの場合はログイン画面を表示
  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'inventory-table':
        return <InventoryTable />;
      case 'products':
        return <ProductList />;
      case 'inventory':
        return <InventoryInput />;
      case 'scanner':
        return <QRScanner />;
      case 'orders':
        return <OrderList />;
      case 'qr-print':
        return <QRPrint />;
      case 'qr-list':
        return <ProductQRList />;
      case 'import-export':
        return <ImportExport />;
      case 'monthly-summary':
        return <MonthlySummary />;
      case 'customers':
        return <CustomerList />;
      case 'receipt':
        return <ReceiptProcessing />;
      case 'usage':
        return <UsageProcessing />;
      case 'mobile-receipt':
        return <MobileReceiptProcessing />;
      case 'mobile-usage':
        return <MobileUsageProcessing />;
      case 'receipt-stock-history':
        return <ReceiptStockHistory />;
      case 'delivery-note-scanner':
        return <DeliveryNoteScanner />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f3f3f3' }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        userName={currentUser.displayName}
        onLogout={handleLogout}
      />
      {/* Main Content Area - SLDS Layout */}
      <main className="md:ml-56 pt-12 md:pt-0 min-h-screen">
        <div className="p-4 md:p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default App;
