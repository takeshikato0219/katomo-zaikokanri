import { useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, Save, X, Users, DollarSign } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import type { Customer } from '../types';
import { formatCurrency, formatNumber } from '../utils/calculations';

export function CustomerList() {
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerUsageSummary,
  } = useInventory();

  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', furigana: '', phone: '', note: '' });

  // 現在の年月
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // 当月の使用集計
  const usageSummaries = useMemo(
    () => getCustomerUsageSummary(currentMonth),
    [getCustomerUsageSummary, currentMonth]
  );

  // 顧客ごとの当月使用金額マップ
  const usageByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    usageSummaries.forEach((s) => {
      map.set(s.customerId, s.totalAmount);
    });
    return map;
  }, [usageSummaries]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const term = searchTerm.toLowerCase();
      return (
        !searchTerm ||
        customer.name.toLowerCase().includes(term) ||
        customer.furigana?.toLowerCase().includes(term) ||
        customer.phone?.includes(searchTerm)
      );
    });
  }, [customers, searchTerm]);

  const handleAdd = () => {
    if (!newCustomer.name.trim()) {
      alert('顧客名を入力してください');
      return;
    }
    addCustomer({
      name: newCustomer.name.trim(),
      furigana: newCustomer.furigana.trim() || undefined,
      phone: newCustomer.phone.trim() || undefined,
      note: newCustomer.note.trim() || undefined,
    });
    setNewCustomer({ name: '', furigana: '', phone: '', note: '' });
    setShowAddForm(false);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setEditForm({
      name: customer.name,
      furigana: customer.furigana,
      phone: customer.phone,
      note: customer.note,
    });
  };

  const handleSave = () => {
    if (editingId && editForm.name?.trim()) {
      updateCustomer(editingId, editForm);
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (customerId: string) => {
    if (window.confirm('この顧客を削除しますか？関連する使用履歴は残ります。')) {
      deleteCustomer(customerId);
    }
  };

  return (
    <div className="space-y-4">
      {/* SLDS Page Header */}
      <div className="bg-white border border-[#e5e5e5] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">マスタ管理</p>
            <h1 className="text-xl font-light text-[#181818] mt-1">顧客管理</h1>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>新規顧客</span>
          </button>
        </div>
      </div>

      {/* SLDS KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#0176d3]">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-[#0176d3]" />
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">登録顧客数</p>
          </div>
          <p className="text-2xl font-light text-[#181818] mt-1">
            {formatNumber(customers.length)} 人
          </p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#2e844a]">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-[#2e844a]" />
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">当月使用合計</p>
          </div>
          <p className="text-2xl font-light text-[#2e844a] mt-1">
            {formatCurrency(usageSummaries.reduce((sum, s) => sum + s.totalAmount, 0))}
          </p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded p-4 border-l-4 border-l-[#9050e9]">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-[#9050e9]" />
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider">当月利用顧客</p>
          </div>
          <p className="text-2xl font-light text-[#9050e9] mt-1">
            {formatNumber(usageSummaries.length)} 人
          </p>
        </div>
      </div>

      {/* SLDS Add Form Card */}
      {showAddForm && (
        <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
          <div className="px-4 py-3 border-b border-[#e5e5e5]">
            <h2 className="text-base font-bold text-[#181818]">新規顧客登録</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-1">
                  顧客名 *
                </label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="input-field"
                  placeholder="例: 山田太郎"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-1">
                  ふりがな
                </label>
                <input
                  type="text"
                  value={newCustomer.furigana}
                  onChange={(e) => setNewCustomer({ ...newCustomer, furigana: e.target.value })}
                  className="input-field"
                  placeholder="例: やまだたろう"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-1">
                  電話番号
                </label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="input-field"
                  placeholder="例: 090-1234-5678"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-1">
                  メモ
                </label>
                <input
                  type="text"
                  value={newCustomer.note}
                  onChange={(e) => setNewCustomer({ ...newCustomer, note: e.target.value })}
                  className="input-field"
                  placeholder="備考"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setShowAddForm(false)}
                className="btn-secondary"
              >
                キャンセル
              </button>
              <button
                onClick={handleAdd}
                className="btn-primary"
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLDS Search Card */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#706e6b] w-4 h-4" />
            <input
              type="text"
              placeholder="顧客名・電話番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>
      </div>

      {/* SLDS Data Table */}
      <div className="bg-white border border-[#e5e5e5] rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="slds-table w-full">
            <thead>
              <tr>
                <th className="text-left">顧客名</th>
                <th className="text-left">ふりがな</th>
                <th className="text-left">電話番号</th>
                <th className="text-left">メモ</th>
                <th className="text-right">当月使用金額</th>
                <th className="text-center">登録日</th>
                <th className="text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const isEditing = editingId === customer.id;
                const monthlyUsage = usageByCustomer.get(customer.id) || 0;

                return (
                  <tr key={customer.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                          className="input-field w-full text-sm"
                        />
                      ) : (
                        <span className="font-medium text-[#181818]">{customer.name}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.furigana || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, furigana: e.target.value })
                          }
                          className="input-field w-full text-sm"
                          placeholder="ふりがな"
                        />
                      ) : (
                        <span className="text-[#706e6b] text-sm">{customer.furigana || '-'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editForm.phone || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, phone: e.target.value })
                          }
                          className="input-field w-full text-sm"
                        />
                      ) : (
                        <span className="text-[#706e6b]">{customer.phone || '-'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.note || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, note: e.target.value })
                          }
                          className="input-field w-full text-sm"
                        />
                      ) : (
                        <span className="text-[#706e6b] text-xs">{customer.note || '-'}</span>
                      )}
                    </td>
                    <td className="text-right font-semibold">
                      {monthlyUsage > 0 ? (
                        <span className="text-[#2e844a]">{formatCurrency(monthlyUsage)}</span>
                      ) : (
                        <span className="text-[#706e6b]">-</span>
                      )}
                    </td>
                    <td className="text-center text-[#706e6b] text-xs">
                      {new Date(customer.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="text-center">
                      {isEditing ? (
                        <div className="flex justify-center space-x-1">
                          <button
                            onClick={handleSave}
                            className="p-1.5 text-[#2e844a] hover:bg-[#cdefc4]/30 rounded transition-colors"
                            title="保存"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1.5 text-[#706e6b] hover:bg-[#f3f3f3] rounded transition-colors"
                            title="キャンセル"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center space-x-1">
                          <button
                            onClick={() => handleEdit(customer)}
                            className="p-1.5 text-[#0176d3] hover:bg-[#d8edff]/30 rounded transition-colors"
                            title="編集"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            className="p-1.5 text-[#c23934] hover:bg-[#feded8]/30 rounded transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f3f3f3] flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-[#706e6b]" />
            </div>
            <p className="text-[#706e6b]">
              {customers.length === 0
                ? '顧客が登録されていません。「新規顧客」ボタンから登録してください。'
                : '検索条件に一致する顧客がありません。'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
