import {
  LayoutDashboard,
  Package,
  FileSpreadsheet,
  ShoppingCart,
  Printer,
  Menu,
  X,
  Calendar,
  Users,
  PackagePlus,
  PackageMinus,
  QrCode,
  Cloud,
  Table,
  Smartphone,
  LogOut,
  User,
  History,
} from 'lucide-react';
import { useState } from 'react';
import type { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  userName?: string;
  onLogout?: () => void;
}

const navItems: { page: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { page: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { page: 'inventory-table', label: '在庫表', icon: Table },
  { page: 'products', label: '商品一覧', icon: Package },
  { page: 'receipt', label: '入荷', icon: PackagePlus },
  { page: 'mobile-receipt', label: '入荷（スマホ）', icon: Smartphone },
  { page: 'usage', label: '使用', icon: PackageMinus },
  { page: 'mobile-usage', label: '使用（スマホ）', icon: Smartphone },
  { page: 'receipt-stock-history', label: '入荷在庫履歴', icon: History },
  { page: 'customers', label: '顧客', icon: Users },
  { page: 'monthly-summary', label: '月次集計', icon: Calendar },
  { page: 'orders', label: '発注', icon: ShoppingCart },
  { page: 'qr-print', label: 'QR印刷', icon: Printer },
  { page: 'qr-list', label: 'QR一覧表', icon: QrCode },
  { page: 'import-export', label: 'CSV', icon: FileSpreadsheet },
];

export function Sidebar({ currentPage, onNavigate, userName, onLogout }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* SLDS Global Header - Mobile */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20" style={{ backgroundColor: '#032d60' }}>
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center space-x-2">
            <Cloud className="w-6 h-6 text-white" />
            <h1 className="text-base font-normal text-white">在庫管理</h1>
          </div>
          <button
            className="p-2 text-white hover:bg-white/10 rounded"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar - SLDS Vertical Navigation */}
      <aside
        className={`md:hidden fixed top-12 left-0 bottom-0 w-64 bg-white z-40 transform transition-transform duration-200 shadow-lg ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* User Info - Mobile */}
        {userName && (
          <div className="px-4 py-3 border-b border-[#e5e5e5] bg-[#f3f3f3]">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-[#706e6b]" />
              <span className="text-sm font-medium text-[#181818]">{userName}</span>
            </div>
          </div>
        )}
        <nav className="p-2 overflow-y-auto h-full">
          <ul className="space-y-0.5">
            {navItems.map(({ page, label, icon: Icon }) => (
              <li key={page}>
                <button
                  onClick={() => {
                    onNavigate(page);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded text-sm transition-colors ${
                    currentPage === page
                      ? 'bg-[#e5e5e5] text-[#0176d3] font-medium'
                      : 'text-[#181818] hover:bg-[#f3f3f3]'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${currentPage === page ? 'text-[#0176d3]' : 'text-[#706e6b]'}`} />
                  <span>{label}</span>
                </button>
              </li>
            ))}
            {/* Logout Button - Mobile */}
            {onLogout && (
              <li className="pt-2 border-t border-[#e5e5e5] mt-2">
                <button
                  onClick={() => {
                    onLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 w-full px-3 py-2 rounded text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>ログアウト</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      </aside>

      {/* Desktop Sidebar - SLDS Style */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-56 bg-white border-r border-[#e5e5e5] z-10">
        {/* SLDS Global Header */}
        <div className="h-12 flex items-center px-4" style={{ backgroundColor: '#032d60' }}>
          <div className="flex items-center space-x-2">
            <Cloud className="w-6 h-6 text-white" />
            <h1 className="text-base font-normal text-white tracking-tight">在庫管理</h1>
          </div>
        </div>

        {/* App Launcher Section */}
        <div className="px-3 py-3 border-b border-[#e5e5e5]">
          <div className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">
            アプリケーション
          </div>
          <div className="mt-1 text-sm font-medium text-[#181818]">
            katomotor 在庫管理
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto">
          <ul className="space-y-0.5">
            {navItems.map(({ page, label, icon: Icon }) => (
              <li key={page}>
                <button
                  onClick={() => onNavigate(page)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded text-sm transition-all duration-100 ${
                    currentPage === page
                      ? 'bg-[#e5e5e5] text-[#0176d3] font-medium'
                      : 'text-[#181818] hover:bg-[#f3f3f3]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${currentPage === page ? 'text-[#0176d3]' : 'text-[#706e6b]'}`} />
                  <span>{label}</span>
                  {currentPage === page && (
                    <div className="ml-auto w-1 h-4 bg-[#0176d3] rounded-full" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Info & Logout - Desktop */}
        <div className="p-3 border-t border-[#e5e5e5]">
          {userName && (
            <div className="flex items-center space-x-2 mb-2 px-1">
              <User className="w-4 h-4 text-[#706e6b]" />
              <span className="text-sm text-[#181818]">{userName}</span>
            </div>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center space-x-2 w-full px-3 py-2 rounded text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>ログアウト</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
