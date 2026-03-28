import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Party, PartyType, BalanceType } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import AddPartyModal from './AddPartyModal';
import ConfirmModal from './ConfirmModal';
import EditTransactionModal from './EditTransactionModal';
import { useAuthStore } from '../store';

type LedgerView = 'list' | 'detail';

export default function Ledger() {
  const { user } = useAuthStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Detail view
  const [view, setView] = useState<LedgerView>('list');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partyTransactions, setPartyTransactions] = useState<any[]>([]);

  // Edit transaction
  const [editingTx, setEditingTx] = useState<any | null>(null);

  // Edit party
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', type: 'customer' as PartyType, opening_balance: 0, balance_type: 'dr' as BalanceType });

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('parties')
      .select('*')
      .eq('user_id', user?.id)
      .order('name');
    if (data) setParties(data);
    setIsLoading(false);
  };

  // Open party detail
  const openPartyDetail = async (party: Party) => {
    setSelectedParty(party);
    setEditMode(false);
    setEditData({
      name: party.name,
      phone: party.phone || '',
      type: party.type,
      opening_balance: party.opening_balance,
      balance_type: party.balance_type,
    });
    setView('detail');

    // Fetch ALL transactions for this party
    const { data } = await supabase
      .from('vouchers')
      .select('*')
      .eq('user_id', user?.id)
      .eq('party_id', party.id)
      .order('date', { ascending: false });
    setPartyTransactions(data || []);
  };

  // Save edited party
  const handleSaveEdit = async () => {
    if (!selectedParty) return;
    await supabase.from('parties').update({
      name: editData.name,
      phone: editData.phone || null,
      type: editData.type,
      opening_balance: editData.opening_balance,
      balance_type: editData.balance_type,
    }).eq('id', selectedParty.id);

    setEditMode(false);
    fetchParties();
    setSelectedParty({
      ...selectedParty,
      name: editData.name,
      phone: editData.phone,
      type: editData.type,
      opening_balance: editData.opening_balance,
      balance_type: editData.balance_type,
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('parties').delete().eq('id', deleteId);
    fetchParties();
    setDeleteId(null);
    if (selectedParty?.id === deleteId) setView('list');
  };

  const filteredParties = parties.filter(party => {
    const matchesSearch = party.name.toLowerCase().includes(search.toLowerCase()) ||
      (party.phone && party.phone.includes(search));
    const matchesType = typeFilter === 'all' || party.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalReceivable = parties.filter(p => p.balance_type === 'dr').reduce((sum, p) => sum + p.opening_balance, 0);
  const totalPayable = parties.filter(p => p.balance_type === 'cr').reduce((sum, p) => sum + p.opening_balance, 0);
  const netBalance = totalReceivable - totalPayable;

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  const getPartyColor = (type: string) => {
    switch (type) {
      case 'bank': return { bg: 'bg-blue-100', text: 'text-blue-600' };
      case 'cash': return { bg: 'bg-amber-100', text: 'text-amber-600' };
      case 'supplier': return { bg: 'bg-purple-100', text: 'text-purple-600' };
      case 'expense': return { bg: 'bg-red-100', text: 'text-red-600' };
      default: return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
    }
  };

  // ============================================
  // PARTY DETAIL VIEW
  // ============================================
  if (view === 'detail' && selectedParty) {
    const color = getPartyColor(selectedParty.type);

    // Compute running balance from transactions (reverse chronological → calculate from bottom up)
    const txWithBalance = (() => {
      let runningBalance = selectedParty.opening_balance;
      let runningType = selectedParty.balance_type;
      // We display in reverse chrono, so just show amount per transaction
      return partyTransactions.map(tx => {
        const isIncoming = tx.type === 'sale' || tx.type === 'receipt';
        return { ...tx, isIncoming };
      });
    })();

    // Totals
    const totalSales = partyTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.amount, 0);
    const totalPurchases = partyTransactions.filter(t => t.type === 'purchase').reduce((s, t) => s + t.amount, 0);
    const totalReceipts = partyTransactions.filter(t => t.type === 'receipt').reduce((s, t) => s + t.amount, 0);
    const totalPayments = partyTransactions.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0);

    return (
      <div className="space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between -mt-2">
          <button onClick={() => { setView('list'); fetchParties(); }} className="flex items-center gap-1 text-stone-500 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="text-sm font-semibold">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className="px-3 py-1.5 bg-stone-100 rounded-full text-xs font-bold text-stone-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">{editMode ? 'close' : 'edit'}</span>
              {editMode ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => setDeleteId(selectedParty.id)}
              className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">delete</span>
            </button>
          </div>
        </div>

        {/* Party Hero */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className={cn("w-14 h-14 rounded-full flex items-center justify-center text-xl font-headline font-bold", color.bg, color.text)}>
              {selectedParty.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              {editMode ? (
                <div className="space-y-2">
                  <input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={editData.phone}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      placeholder="Phone"
                      className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <select
                      value={editData.type}
                      onChange={(e) => setEditData({ ...editData, type: e.target.value as PartyType })}
                      className="border border-stone-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="bank">Bank</option>
                      <option value="cash">Cash</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={editData.opening_balance || ''}
                      onChange={(e) => setEditData({ ...editData, opening_balance: parseFloat(e.target.value) || 0 })}
                      placeholder="Balance"
                      className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <select
                      value={editData.balance_type}
                      onChange={(e) => setEditData({ ...editData, balance_type: e.target.value as BalanceType })}
                      className="border border-stone-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <option value="dr">Receivable (Dr)</option>
                      <option value="cr">Payable (Cr)</option>
                    </select>
                  </div>
                  <button
                    onClick={handleSaveEdit}
                    className="w-full py-2.5 bg-[#1b4332] text-white rounded-lg font-bold text-sm active:scale-[0.98] transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-headline font-bold text-stone-800">{selectedParty.name}</h2>
                  <p className="text-xs text-stone-400 capitalize">
                    {selectedParty.type}
                    {selectedParty.phone && ` • ${selectedParty.phone}`}
                  </p>
                </>
              )}
            </div>
          </div>

          {!editMode && (
            <div className={cn(
              "p-4 rounded-xl text-center",
              selectedParty.opening_balance === 0 ? "bg-stone-50" :
              selectedParty.balance_type === 'dr' ? "bg-emerald-50" : "bg-red-50"
            )}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">
                {selectedParty.opening_balance === 0 ? 'Balance Cleared' :
                 selectedParty.balance_type === 'dr' ? 'They Owe You' : 'You Owe Them'}
              </p>
              <p className={cn(
                "text-3xl font-headline font-extrabold",
                selectedParty.opening_balance === 0 ? "text-stone-400" :
                selectedParty.balance_type === 'dr' ? "text-emerald-700" : "text-red-600"
              )}>
                <span className="text-lg mr-0.5">₹</span>{selectedParty.opening_balance.toLocaleString('en-IN')}
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {!editMode && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-xl border border-stone-200/60 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Sales</p>
              <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalSales)}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200/60 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Purchases</p>
              <p className="text-sm font-bold text-red-600">{formatCurrency(totalPurchases)}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200/60 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Received</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(totalReceipts)}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200/60 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Paid</p>
              <p className="text-sm font-bold text-amber-700">{formatCurrency(totalPayments)}</p>
            </div>
          </div>
        )}

        {/* All Transactions */}
        {!editMode && (
          <section>
            <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider mb-3">
              All Transactions ({partyTransactions.length})
            </h4>
            {partyTransactions.length > 0 ? (
              <div className="space-y-2">
                {txWithBalance.map(tx => {
                  const isCreditVoucher = tx.payment_mode === 'Credit';
                  const statusMap: Record<string, { label: string; icon: string; color: string }> = {
                    sale: { label: 'SALE', icon: 'trending_up', color: 'bg-emerald-100 text-emerald-700' },
                    purchase: { label: 'PURCHASE', icon: 'trending_down', color: 'bg-red-100 text-red-600' },
                    receipt: { label: 'RECEIVED', icon: 'call_received', color: 'bg-blue-100 text-blue-700' },
                    payment: { label: 'PAID', icon: 'call_made', color: 'bg-amber-100 text-amber-700' },
                  };
                  const st = statusMap[tx.type] || statusMap.sale;

                  return (
                    <div
                      key={tx.id}
                      onClick={() => setEditingTx(tx)}
                      className="bg-white rounded-xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", st.color.split(' ')[0])}>
                          <span className={cn("material-symbols-outlined text-lg", st.color.split(' ')[1])}>{st.icon}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", st.color)}>{st.label}</span>
                            {isCreditVoucher && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">UDHAR</span>
                            )}
                          </div>
                          <p className="text-[10px] text-stone-400 mt-0.5">
                            #{tx.voucher_no} • {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {tx.payment_mode && tx.payment_mode !== 'Credit' && ` • ${tx.payment_mode}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-bold",
                          tx.isIncoming ? "text-emerald-700" : "text-red-600"
                        )}>
                          {tx.isIncoming ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                        <span className="material-symbols-outlined text-stone-300 text-sm">edit</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-stone-400 bg-white rounded-xl border border-stone-200/60 p-4 text-center">
                No transactions with this party yet.
              </p>
            )}
          </section>
        )}

        <EditTransactionModal
          isOpen={!!editingTx}
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => { if (selectedParty) openPartyDetail(selectedParty); }}
        />

        <ConfirmModal
          isOpen={!!deleteId}
          title="Delete Party"
          message="Are you sure? All transactions with this party will remain but the party will be removed."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          confirmText="Delete"
        />
      </div>
    );
  }

  // ============================================
  // LIST VIEW
  // ============================================
  return (
    <div className="space-y-5 pb-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full"></div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Total Net Balance</p>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[34px] font-headline font-extrabold leading-tight">
            <span className="text-white/60 text-2xl mr-0.5">₹</span>{Math.abs(netBalance).toLocaleString('en-IN')}
          </h2>
          <span className={cn(
            "px-2 py-0.5 text-white text-[10px] font-bold rounded-full",
            netBalance >= 0 ? "bg-emerald-500" : "bg-red-500"
          )}>
            {netBalance >= 0 ? 'Cr' : 'Dr'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-800/50 backdrop-blur-sm p-3 rounded-xl">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Receivable</p>
            <p className="text-lg font-headline font-extrabold">
              <span className="text-white/50 text-xs mr-0.5">₹</span>{totalReceivable.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-emerald-800/50 backdrop-blur-sm p-3 rounded-xl">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Payable</p>
            <p className="text-lg font-headline font-extrabold">
              <span className="text-white/50 text-xs mr-0.5">₹</span>{totalPayable.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </motion.section>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-xl">search</span>
        <input
          type="text"
          placeholder="Search Party, Phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-stone-100 border border-stone-200 rounded-full py-3 pl-12 pr-4 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {['all', 'customer', 'supplier', 'bank', 'cash', 'expense'].map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all",
              typeFilter === type
                ? "bg-[#1b4332] text-white shadow-sm"
                : "bg-white text-stone-500 border border-stone-200"
            )}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Parties */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-headline font-bold text-stone-800 text-[15px]">Parties</h4>
          <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">{filteredParties.length} Records</span>
        </div>
        <div className="space-y-2">
          <AnimatePresence>
            {filteredParties.map((party, i) => {
              const color = getPartyColor(party.type);
              return (
                <motion.div
                  key={party.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openPartyDetail(party)}
                  className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-11 h-11 rounded-full flex items-center justify-center font-headline font-bold text-sm shrink-0", color.bg, color.text)}>
                      {party.type === 'bank' ? (
                        <span className="material-symbols-outlined text-xl">account_balance</span>
                      ) : party.type === 'cash' ? (
                        <span className="material-symbols-outlined text-xl">payments</span>
                      ) : party.type === 'expense' ? (
                        <span className="material-symbols-outlined text-xl">receipt</span>
                      ) : (
                        party.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-800">{party.name}</h4>
                      <p className="text-[10px] text-stone-400">
                        <span className="capitalize">{party.type}</span>
                        {party.phone && ` • ${party.phone}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <p className="text-sm font-bold text-stone-800">
                          <span className="text-stone-400 text-xs mr-0.5">₹</span>{party.opening_balance.toLocaleString('en-IN')}
                        </p>
                        {party.opening_balance > 0 && (
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded",
                            party.balance_type === 'dr' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                          )}>
                            {party.balance_type === 'dr' ? 'DR' : 'CR'}
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-[10px] font-medium mt-0.5",
                        party.opening_balance === 0 ? "text-stone-400" :
                        party.balance_type === 'dr' ? "text-emerald-600" : "text-red-500"
                      )}>
                        {party.opening_balance === 0 ? 'Cleared' : party.balance_type === 'dr' ? 'Receivable' : 'Payable'}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredParties.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-2xl">person_search</span>
              </div>
              <p className="text-stone-400 text-sm font-medium">No parties found.</p>
              <button onClick={() => setIsModalOpen(true)} className="mt-2 text-emerald-600 text-sm font-bold">
                Add your first party →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAB */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-5 w-14 h-14 bg-[#1b4332] text-white rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center hover:bg-emerald-900 active:scale-90 transition-all z-40"
      >
        <span className="material-symbols-outlined text-2xl">person_add</span>
      </button>

      <AddPartyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchParties}
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Party"
        message="Are you sure? All transactions with this party will remain but the party will be removed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete"
      />
    </div>
  );
}
