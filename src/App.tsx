import { useState } from 'react';
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
import type { Page } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

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
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f3f3f3' }}>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
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
