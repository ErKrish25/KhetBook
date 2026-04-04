import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Unit } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store';
import { getUnitLabel } from '../lib/itemUnits';
import AddItemModal from './AddItemModal';
import ConfirmModal from './ConfirmModal';
import EditTransactionModal from './EditTransactionModal';
import { logAction } from '../lib/auditLog';
import { toast } from '../lib/useToast';

type StockFilter = 'all' | 'crop' | 'inputs' | 'equipment';
type StockView = 'list' | 'detail' | 'stockAction';
type StockActionType = 'in' | 'out';

export default function Inventory() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Detail view state
  const [view, setView] = useState<StockView>('list');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemTransactions, setItemTransactions] = useState<any[]>([]);
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  // Edit item state
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', rate: 0, min_stock: 0 });

  // Stock action state
  const [stockAction, setStockAction] = useState<StockActionType>('in');
  const [stockQty, setStockQty] = useState(0);
  const [stockReason, setStockReason] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  // Harvest entry
  const [showHarvestForm, setShowHarvestForm] = useState(false);
  const [harvestData, setHarvestData] = useState({ item_id: '', qty: 0, source: '' });
  const [harvestSaving, setHarvestSaving] = useState(false);

  // Edit transaction state
  const [editingTx, setEditingTx] = useState<any | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', user?.id)
      .is('deleted_at', null)
      .order('name');

    if (data) {
      const sorted = [...data].sort((a, b) => {
        const valA = a.current_stock * (a.rate || 0);
        const valB = b.current_stock * (b.rate || 0);
        return valB - valA;
      });
      setItems(sorted);
    }
    setIsLoading(false);
  };

  // Open item detail view
  const openItemDetail = async (item: Item) => {
    setSelectedItem(item);
    setEditMode(false);
    setEditData({ name: item.name, rate: item.rate || 0, min_stock: item.min_stock || 0 });
    setView('detail');

    // Fetch voucher_lines for this item
    const { data: lines } = await supabase
      .from('voucher_lines')
      .select('*, vouchers(voucher_no, type, date, party_id, parties(name), payment_mode)')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setItemTransactions(lines || []);

    // Fetch inventory logs for this item
    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('*')
      .eq('item_id', item.id)
      .order('changed_at', { ascending: false })
      .limit(10);
    setItemLogs(logs || []);
  };

  // Open Stock In / Out action
  const openStockAction = (item: Item, action: StockActionType) => {
    setSelectedItem(item);
    setStockAction(action);
    setStockQty(0);
    setStockReason(action === 'out' ? 'sold' : 'purchased');
    setView('stockAction');
  };

  // Submit stock action
  const handleStockAction = async () => {
    if (!selectedItem || stockQty <= 0) return;
    setStockSaving(true);

    const oldStock = selectedItem.current_stock;
    const newStock = stockAction === 'in'
      ? oldStock + stockQty
      : Math.max(0, oldStock - stockQty);

    await supabase.from('items').update({ current_stock: newStock }).eq('id', selectedItem.id);

    await supabase.from('inventory_logs').insert({
      user_id: user?.id,
      item_id: selectedItem.id,
      action: 'update_stock',
      qty_before: oldStock,
      qty_after: newStock,
      note: stockAction === 'in'
        ? `Stock In: +${stockQty} ${selectedItem.unit} (${stockReason})`
        : `Stock Out: -${stockQty} ${selectedItem.unit} (${stockReason})`
    });

    setStockSaving(false);
    setView('list');
    fetchItems();
  };

  // Save edited item
  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    await supabase.from('items').update({
      name: editData.name,
      rate: editData.rate,
      min_stock: editData.min_stock,
    }).eq('id', selectedItem.id);

    setEditMode(false);
    fetchItems();
    // Update the selectedItem locally
    setSelectedItem({ ...selectedItem, name: editData.name, rate: editData.rate, min_stock: editData.min_stock });
  };

  // Harvest submit
  const handleHarvestSubmit = async () => {
    if (!harvestData.item_id || harvestData.qty <= 0) return;
    setHarvestSaving(true);
    const item = items.find(i => i.id === harvestData.item_id);
    if (!item) { setHarvestSaving(false); return; }

    const newStock = item.current_stock + harvestData.qty;
    await supabase.from('items').update({ current_stock: newStock }).eq('id', harvestData.item_id);
    await supabase.from('inventory_logs').insert({
      user_id: user?.id,
      item_id: harvestData.item_id,
      action: 'update_stock',
      qty_before: item.current_stock,
      qty_after: newStock,
      note: `Harvest: +${harvestData.qty} ${item.unit}${harvestData.source ? ` from ${harvestData.source}` : ''}`
    });

    setHarvestSaving(false);
    setShowHarvestForm(false);
    setHarvestData({ item_id: '', qty: 0, source: '' });
    fetchItems();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Soft delete: set deleted_at instead of removing the row
    const item = items.find(i => i.id === deleteId);
    const { error } = await supabase
      .from('items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteId);

    if (error) {
      toast.error('Failed to delete: ' + error.message);
      setDeleteId(null);
      return;
    }

    if (item) logAction('delete', 'items', deleteId, { name: item.name, category: item.category });
    toast.success(`"${item?.name || 'Item'}" moved to trash`);
    fetchItems();
    setDeleteId(null);
    if (selectedItem?.id === deleteId) setView('list');
  };

  // Helpers
  const getUnitDisplay = (unit: string) => {
    return getUnitLabel(unit);
  };

  const getItemIcon = (category: string) => {
    switch (category) {
      case 'crop': return { icon: 'eco', bg: 'bg-emerald-100', color: 'text-emerald-600' };
      case 'seed': return { icon: 'grass', bg: 'bg-lime-100', color: 'text-lime-600' };
      case 'fertilizer': return { icon: 'science', bg: 'bg-blue-100', color: 'text-blue-600' };
      case 'pesticide': return { icon: 'bug_report', bg: 'bg-red-100', color: 'text-red-600' };
      case 'fuel': return { icon: 'local_gas_station', bg: 'bg-amber-100', color: 'text-amber-600' };
      case 'equipment': return { icon: 'construction', bg: 'bg-stone-200', color: 'text-stone-600' };
      default: return { icon: 'package_2', bg: 'bg-purple-100', color: 'text-purple-600' };
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHrs < 1) return 'Just now';
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  const filteredItems = (() => {
    let filtered = items;
    if (stockFilter === 'crop') filtered = filtered.filter(i => i.category === 'crop' || i.category === 'seed');
    else if (stockFilter === 'inputs') filtered = filtered.filter(i => ['fertilizer', 'pesticide', 'fuel'].includes(i.category));
    else if (stockFilter === 'equipment') filtered = filtered.filter(i => i.category === 'equipment' || i.category === 'other');
    if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return filtered;
  })();

  const totalInventoryValue = items.reduce((sum, i) => sum + (i.current_stock * (i.rate || 0)), 0);
  const lowStockCount = items.filter(i => i.current_stock <= (i.min_stock || 0)).length;
  const cropItems = items.filter(i => i.category === 'crop' || i.category === 'seed');

  // ============================================
  // STOCK ACTION VIEW (Stock In / Stock Out)
  // ============================================
  if (view === 'stockAction' && selectedItem) {
    const isOut = stockAction === 'out';
    const reasons = isOut
      ? ['Sold', 'Damaged', 'Self Use', 'Given Away', 'Expired', 'Other']
      : ['Purchased', 'Harvested', 'Received', 'Returned', 'Other'];

    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center gap-3 -mt-2">
          <button onClick={() => setView('list')} className="text-stone-500 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h2 className="text-lg font-headline font-bold text-stone-800">
            {isOut ? 'Stock Out' : 'Stock In'} — {selectedItem.name}
          </h2>
        </div>

        {/* Current Stock */}
        <div className={cn(
          "text-center py-6 rounded-2xl border",
          isOut ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Current Stock</p>
          <p className="text-3xl font-headline font-extrabold text-stone-800">
            {selectedItem.current_stock} <span className="text-base text-stone-400">{getUnitDisplay(selectedItem.unit)}</span>
          </p>
        </div>

        {/* Qty */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">
              Quantity ({getUnitDisplay(selectedItem.unit)})
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={stockQty || ''}
              onChange={(e) => setStockQty(parseFloat(e.target.value) || 0)}
              className={cn(
                "w-full border-2 rounded-xl py-4 px-4 text-2xl font-extrabold text-center text-stone-800 focus:outline-none",
                isOut ? "border-red-200 focus:ring-2 focus:ring-red-400/30" : "border-emerald-200 focus:ring-2 focus:ring-emerald-400/30"
              )}
              placeholder="0"
              autoFocus
            />
            {isOut && stockQty > selectedItem.current_stock && (
              <p className="text-red-500 text-xs font-medium mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                Cannot remove more than current stock
              </p>
            )}
          </div>

          {/* Reason Chips */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Reason</label>
            <div className="flex gap-2 flex-wrap">
              {reasons.map(r => (
                <button
                  key={r}
                  onClick={() => setStockReason(r.toLowerCase())}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                    stockReason === r.toLowerCase()
                      ? isOut
                        ? "bg-red-100 border-2 border-red-400 text-red-700"
                        : "bg-emerald-100 border-2 border-emerald-400 text-emerald-700"
                      : "bg-white border border-stone-200 text-stone-500"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result Preview */}
        {stockQty > 0 && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-stone-500">New stock will be</span>
            <span className="text-lg font-headline font-bold text-stone-800">
              {isOut ? Math.max(0, selectedItem.current_stock - stockQty) : selectedItem.current_stock + stockQty}
              {' '}{getUnitDisplay(selectedItem.unit)}
            </span>
          </div>
        )}

        <button
          onClick={handleStockAction}
          disabled={stockSaving || stockQty <= 0 || (isOut && stockQty > selectedItem.current_stock)}
          className={cn(
            "w-full py-4 text-white rounded-2xl font-bold text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50",
            isOut ? "bg-red-500 shadow-red-900/20" : "bg-[#1b4332] shadow-emerald-900/20"
          )}
        >
          {stockSaving ? 'Saving...' : (isOut ? `Remove ${stockQty || 0} ${getUnitDisplay(selectedItem.unit)}` : `Add ${stockQty || 0} ${getUnitDisplay(selectedItem.unit)}`)}
        </button>
      </div>
    );
  }

  // ============================================
  // ITEM DETAIL VIEW
  // ============================================
  if (view === 'detail' && selectedItem) {
    const iconInfo = getItemIcon(selectedItem.category);
    const unitLabel = getUnitDisplay(selectedItem.unit);
    const value = selectedItem.current_stock * (selectedItem.rate || 0);

    return (
      <div className="space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between -mt-2">
          <button onClick={() => { setView('list'); fetchItems(); }} className="flex items-center gap-1 text-stone-500 active:scale-95 transition-transform">
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
              onClick={() => setDeleteId(selectedItem.id)}
              className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">delete</span>
            </button>
          </div>
        </div>

        {/* Item Hero */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 text-center">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3", iconInfo.bg)}>
            <span className={cn("material-symbols-outlined text-3xl", iconInfo.color)}>{iconInfo.icon}</span>
          </div>

          {editMode ? (
            <div className="space-y-3 text-left mt-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1 block">Name</label>
                <input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1 block">Rate (₹)</label>
                  <input
                    type="number"
                    value={editData.rate || ''}
                    onChange={(e) => setEditData({ ...editData, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1 block">Min Stock</label>
                  <input
                    type="number"
                    value={editData.min_stock || ''}
                    onChange={(e) => setEditData({ ...editData, min_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveEdit}
                className="w-full py-3 bg-[#1b4332] text-white rounded-xl font-bold text-sm active:scale-[0.98] transition-all"
              >
                Save Changes
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-headline font-bold text-stone-800">{selectedItem.name}</h2>
              <p className="text-xs text-stone-400 capitalize mt-1">{selectedItem.category} • {unitLabel}</p>
              {selectedItem.rate && selectedItem.rate > 0 && (
                <p className="text-xs text-stone-500 mt-0.5">₹{selectedItem.rate}/{unitLabel}</p>
              )}
            </>
          )}
        </div>

        {/* Stats */}
        {!editMode && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-stone-200/60 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Current Stock</p>
                <p className="text-2xl font-headline font-extrabold text-stone-800">
                  {selectedItem.current_stock}
                </p>
                <p className="text-xs text-stone-400">{unitLabel}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-stone-200/60 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Total Value</p>
                <p className="text-2xl font-headline font-extrabold text-stone-800">
                  <span className="text-stone-400 text-sm">₹</span>{value.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Stock In / Stock Out Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => openStockAction(selectedItem, 'in')}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-emerald-700 font-bold text-sm active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                Stock In
              </button>
              <button
                onClick={() => openStockAction(selectedItem, 'out')}
                className="flex items-center justify-center gap-2 py-3 bg-red-50 border-2 border-red-200 rounded-2xl text-red-600 font-bold text-sm active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-lg">remove_circle</span>
                Stock Out
              </button>
            </div>

            {/* Transaction History */}
            <section>
              <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider mb-3">Transaction History</h4>
              {itemTransactions.length > 0 ? (
                <div className="space-y-2">
                  {itemTransactions.map(tx => {
                    const v = tx.vouchers;
                    if (!v) return null;
                    const isSale = v.type === 'sale';
                    return (
                      <div
                        key={tx.id}
                        onClick={() => {
                          // Pass the voucher object (with id, voucher_no, type, etc.) to the modal
                          if (v) setEditingTx({ id: v.id || tx.voucher_id, voucher_no: v.voucher_no, type: v.type, date: v.date, amount: tx.amount, payment_mode: v.payment_mode, notes: '' });
                        }}
                        className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                            isSale ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                          )}>
                            <span className="material-symbols-outlined text-sm">{isSale ? 'trending_up' : 'trending_down'}</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-800">
                              {v.parties?.name || 'Cash'} — {tx.qty} {unitLabel}
                            </p>
                            <p className="text-[10px] text-stone-400">
                              {v.type?.toUpperCase()} • {new Date(v.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                              {v.payment_mode === 'Credit' && ' • UDHAR'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-bold", isSale ? "text-emerald-700" : "text-red-600")}>
                            ₹{tx.amount?.toLocaleString('en-IN')}
                          </span>
                          <span className="material-symbols-outlined text-stone-300 text-sm">edit</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-stone-400 bg-white rounded-xl border border-stone-200/60 p-4 text-center">No transactions for this item yet.</p>
              )}
            </section>

            {/* Activity Log */}
            {itemLogs.length > 0 && (
              <section>
                <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider mb-3">Stock Changes</h4>
                <div className="space-y-2">
                  {itemLogs.map(log => (
                    <div key={log.id} className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        log.note?.includes('Stock Out') || log.note?.includes('Removed') ? "bg-red-100" : "bg-emerald-100"
                      )}>
                        <span className={cn(
                          "material-symbols-outlined text-sm",
                          log.note?.includes('Stock Out') || log.note?.includes('Removed') ? "text-red-600" : "text-emerald-600"
                        )}>
                          {log.note?.includes('Harvest') ? 'agriculture' : log.note?.includes('Stock Out') || log.note?.includes('Removed') ? 'remove_circle' : 'add_circle'}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-stone-700">{log.note || log.action}</p>
                        <p className="text-[10px] text-stone-400">
                          {log.qty_before} → {log.qty_after} {unitLabel} • {getTimeAgo(log.changed_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <EditTransactionModal
          isOpen={!!editingTx}
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => { if (selectedItem) openItemDetail(selectedItem); }}
        />

        <ConfirmModal
          isOpen={!!deleteId}
          title="Delete Item"
          message="Are you sure? This item will be moved to trash and can be restored within 15 days."
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
        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/5 rounded-full"></div>
        <div className="absolute right-4 top-4 opacity-30">
          <span className="material-symbols-outlined text-4xl">inventory_2</span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Total Inventory Value</p>
        <h2 className="text-[34px] font-headline font-extrabold leading-tight mb-3">
          <span className="text-white/60 text-2xl mr-0.5">₹</span>{totalInventoryValue.toLocaleString('en-IN')}
        </h2>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white/15 backdrop-blur-sm rounded-full text-xs font-semibold text-white hover:bg-white/25 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Item
          </button>
          <button
            onClick={() => setShowHarvestForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/80 rounded-full text-xs font-semibold text-white hover:bg-amber-500 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">agriculture</span>
            Log Harvest
          </button>
        </div>
      </motion.section>

      {/* Harvest Form */}
      <AnimatePresence>
        {showHarvestForm && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-800 flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">agriculture</span>
                  Log Harvest
                </h4>
                <button onClick={() => setShowHarvestForm(false)} className="text-amber-400 hover:text-amber-600">
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
              <select
                value={harvestData.item_id}
                onChange={(e) => setHarvestData({ ...harvestData, item_id: e.target.value })}
                className="w-full bg-white border border-amber-300 rounded-xl px-4 py-3 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              >
                <option value="">Select Crop</option>
                {cropItems.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {getUnitDisplay(i.unit)})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Qty"
                  value={harvestData.qty || ''}
                  onChange={(e) => setHarvestData({ ...harvestData, qty: parseFloat(e.target.value) || 0 })}
                  className="bg-white border border-amber-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
                <input
                  type="text"
                  placeholder="Plot / Source"
                  value={harvestData.source}
                  onChange={(e) => setHarvestData({ ...harvestData, source: e.target.value })}
                  className="bg-white border border-amber-300 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>
              <button
                onClick={handleHarvestSubmit}
                disabled={harvestSaving || !harvestData.item_id || harvestData.qty <= 0}
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {harvestSaving ? 'Saving...' : 'Add to Stock'}
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <span className="material-symbols-outlined text-red-500 text-xl">warning</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-0.5 mt-1">Low Stock</p>
          <span className="text-3xl font-headline font-extrabold text-red-600">{lowStockCount.toString().padStart(2, '0')}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <span className="material-symbols-outlined text-emerald-600 text-xl">inventory_2</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-0.5 mt-1">Active Items</p>
          <span className="text-3xl font-headline font-extrabold text-stone-800">{items.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">search</span>
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 placeholder:text-stone-400"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {[
          { id: 'all' as StockFilter, label: 'All', icon: 'grid_view' },
          { id: 'crop' as StockFilter, label: 'Crops', icon: 'eco' },
          { id: 'inputs' as StockFilter, label: 'Inputs', icon: 'science' },
          { id: 'equipment' as StockFilter, label: 'Equipment', icon: 'construction' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setStockFilter(f.id)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5",
              stockFilter === f.id ? "bg-[#1b4332] text-white shadow-sm" : "bg-white text-stone-500 border border-stone-200"
            )}
          >
            <span className="material-symbols-outlined text-[14px]">{f.icon}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredItems.map((item, i) => {
            const iconInfo = getItemIcon(item.category);
            const value = item.current_stock * (item.rate || 0);
            const unitLabel = getUnitDisplay(item.unit);
            const isLow = item.current_stock <= (item.min_stock || 0);

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => openItemDetail(item)}
                className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconInfo.bg)}>
                      <span className={cn("material-symbols-outlined text-xl", iconInfo.color)}>{iconInfo.icon}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-800">{item.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isLow && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                            {item.current_stock === 0 ? 'OUT' : 'LOW'}
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 capitalize">{item.category}</span>
                        {item.rate && item.rate > 0 && (
                          <span className="text-[10px] text-stone-400">• ₹{item.rate}/{unitLabel}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="text-base font-headline font-extrabold text-stone-800">
                        {item.current_stock} <span className="text-xs text-stone-400 font-normal">{unitLabel}</span>
                      </p>
                      {value > 0 && (
                        <p className="text-[10px] text-stone-400">₹{value.toLocaleString('en-IN')}</p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredItems.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">inventory_2</span>
            </div>
            <p className="text-stone-400 text-sm font-medium">No items found.</p>
            <button onClick={() => setIsAddModalOpen(true)} className="mt-2 text-emerald-600 text-sm font-bold">
              Add your first item →
            </button>
          </div>
        )}
      </div>

      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchItems}
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Item"
        message="Are you sure? This item will be moved to trash and can be restored within 15 days."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete"
      />
    </div>
  );
}
