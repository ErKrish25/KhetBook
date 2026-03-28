import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { Item } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import khetbookIcon from '../assets/khetbook-icon.png';
import ConfirmModal from './ConfirmModal';

type FamilyView = 'list' | 'detail' | 'stockAction';
type StockActionType = 'in' | 'out';

export default function FamilyHome() {
  const { ownerId, logout } = useAuthStore();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Detail view
  const [view, setView] = useState<FamilyView>('list');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  // Stock action
  const [stockAction, setStockAction] = useState<StockActionType>('in');
  const [stockQty, setStockQty] = useState(0);
  const [stockReason, setStockReason] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  // Edit item
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', rate: 0, min_stock: 0 });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', ownerId)
      .order('name');
    if (data) setItems(data);
    setIsLoading(false);
  };

  const openItemDetail = async (item: Item) => {
    setSelectedItem(item);
    setEditMode(false);
    setEditData({ name: item.name, rate: item.rate || 0, min_stock: item.min_stock || 0 });
    setView('detail');

    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('*')
      .eq('item_id', item.id)
      .order('changed_at', { ascending: false })
      .limit(20);
    setItemLogs(logs || []);
  };

  const handleStockAction = async () => {
    if (!selectedItem || stockQty <= 0) return;
    setStockSaving(true);

    const oldStock = selectedItem.current_stock;
    const newStock = stockAction === 'in'
      ? oldStock + stockQty
      : Math.max(0, oldStock - stockQty);

    await supabase.from('items').update({ current_stock: newStock }).eq('id', selectedItem.id);
    await supabase.from('inventory_logs').insert({
      user_id: ownerId,
      item_id: selectedItem.id,
      action: 'update_stock',
      qty_before: oldStock,
      qty_after: newStock,
      note: stockAction === 'in'
        ? `Stock In: +${stockQty} ${selectedItem.unit} (${stockReason}) [Family]`
        : `Stock Out: -${stockQty} ${selectedItem.unit} (${stockReason}) [Family]`
    });

    setStockSaving(false);
    setView('list');
    fetchItems();
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    await supabase.from('items').update({
      name: editData.name,
      rate: editData.rate,
      min_stock: editData.min_stock,
    }).eq('id', selectedItem.id);
    setEditMode(false);
    fetchItems();
    setSelectedItem({ ...selectedItem, name: editData.name, rate: editData.rate, min_stock: editData.min_stock });
  };

  const handleLogout = async () => {
    localStorage.removeItem('khetbook_family_session');
    await supabase.auth.signOut();
    logout();
  };

  const getUnitDisplay = (unit: string) => {
    const map: Record<string, string> = {
      kg: 'Kg', mun: 'Mun', quintal: 'Qtl', bag: 'Bag',
      ton: 'Ton', litre: 'Ltr', unit: 'Pcs', bigha: 'Bigha'
    };
    return map[unit?.toLowerCase()] || unit;
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

  const filteredItems = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const totalItems = items.length;
  const lowStockCount = items.filter(i => i.current_stock <= (i.min_stock || 0)).length;

  // ============================================
  // STOCK ACTION VIEW
  // ============================================
  if (view === 'stockAction' && selectedItem) {
    const isOut = stockAction === 'out';
    const reasons = isOut
      ? ['Sold', 'Damaged', 'Self Use', 'Given Away', 'Expired', 'Other']
      : ['Purchased', 'Harvested', 'Received', 'Returned', 'Other'];

    return (
      <div className="min-h-screen bg-[#fafaf9] font-body">
        <div className="max-w-md mx-auto px-4 pt-6 pb-8 space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('detail')} className="text-stone-500 active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <h2 className="text-lg font-headline font-bold text-stone-800">
              {isOut ? 'Stock Out' : 'Stock In'} — {selectedItem.name}
            </h2>
          </div>

          <div className={cn(
            "text-center py-6 rounded-2xl border",
            isOut ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
          )}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Current Stock</p>
            <p className="text-3xl font-headline font-extrabold text-stone-800">
              {selectedItem.current_stock} <span className="text-lg text-stone-400">{getUnitDisplay(selectedItem.unit)}</span>
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Reason</label>
            <div className="flex flex-wrap gap-2">
              {reasons.map(r => (
                <button
                  key={r}
                  onClick={() => setStockReason(r.toLowerCase())}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold border-2 transition-all active:scale-95",
                    stockReason === r.toLowerCase()
                      ? isOut ? "border-red-400 bg-red-50 text-red-600" : "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-white text-stone-500"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Quantity ({getUnitDisplay(selectedItem.unit)})</label>
            <input
              type="number"
              value={stockQty || ''}
              onChange={e => setStockQty(parseFloat(e.target.value) || 0)}
              className="w-full bg-white border-2 border-stone-200 rounded-2xl py-4 px-5 text-2xl font-bold text-center font-headline focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all"
              placeholder="0"
            />
          </div>

          {stockQty > 0 && (
            <div className="bg-stone-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-stone-400">New stock will be</span>
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
      </div>
    );
  }

  // ============================================
  // ITEM DETAIL VIEW
  // ============================================
  if (view === 'detail' && selectedItem) {
    const iconInfo = getItemIcon(selectedItem.category);
    const unitLabel = getUnitDisplay(selectedItem.unit);

    return (
      <div className="min-h-screen bg-[#fafaf9] font-body">
        <div className="max-w-md mx-auto px-4 pt-6 pb-8 space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={() => { setView('list'); fetchItems(); }} className="flex items-center gap-1 text-stone-500 active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
              <span className="text-sm font-semibold">Back</span>
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className="px-3 py-1.5 bg-stone-100 rounded-full text-xs font-bold text-stone-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">{editMode ? 'close' : 'edit'}</span>
              {editMode ? 'Cancel' : 'Edit'}
            </button>
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
              </>
            )}
          </div>

          {/* Stats & Actions */}
          {!editMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-stone-200/60 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Current Stock</p>
                  <p className="text-2xl font-headline font-extrabold text-stone-800">{selectedItem.current_stock}</p>
                  <p className="text-xs text-stone-400">{unitLabel}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-200/60 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Rate</p>
                  <p className="text-2xl font-headline font-extrabold text-stone-800">
                    <span className="text-stone-400 text-sm">₹</span>{(selectedItem.rate || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-stone-400">per {unitLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setStockAction('in'); setStockQty(0); setStockReason('purchased'); setView('stockAction'); }}
                  className="flex items-center justify-center gap-2 py-3.5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-emerald-700 font-bold text-sm active:scale-[0.98] transition-all"
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  Stock In
                </button>
                <button
                  onClick={() => { setStockAction('out'); setStockQty(0); setStockReason('sold'); setView('stockAction'); }}
                  className="flex items-center justify-center gap-2 py-3.5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-600 font-bold text-sm active:scale-[0.98] transition-all"
                >
                  <span className="material-symbols-outlined text-lg">remove_circle</span>
                  Stock Out
                </button>
              </div>

              {/* Stock Changes Log */}
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
        </div>
      </div>
    );
  }

  // ============================================
  // LIST VIEW (Family Home)
  // ============================================
  return (
    <div className="min-h-screen bg-[#fafaf9] font-body">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-100 px-5 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0">
              <img alt="Khetbook" className="w-full h-full object-contain" src={khetbookIcon} />
            </div>
            <div>
              <h1 className="font-headline font-extrabold text-[#1b4332] text-lg tracking-tight leading-tight">Khetbook</h1>
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Family Access</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-stone-400 hover:text-red-500 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
        {/* Inventory Hero */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden"
        >
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full"></div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">inventory_2</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Farm Inventory</p>
              <h2 className="text-2xl font-headline font-extrabold">{totalItems} Items</h2>
            </div>
          </div>
          {lowStockCount > 0 && (
            <div className="bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-red-300 text-sm">warning</span>
              <span className="text-xs font-semibold text-red-200">{lowStockCount} items running low</span>
            </div>
          )}
        </motion.section>

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-xl">search</span>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-stone-100 border border-stone-200 rounded-full py-3 pl-12 pr-4 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* Items */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-headline font-bold text-stone-800 text-[15px]">Stock Items</h4>
            <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">{filteredItems.length} Items</span>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {filteredItems.map((item, i) => {
                const iconInfo = getItemIcon(item.category);
                const isLow = item.current_stock <= (item.min_stock || 0);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => openItemDetail(item)}
                    className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", iconInfo.bg)}>
                        <span className={cn("material-symbols-outlined text-xl", iconInfo.color)}>{iconInfo.icon}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-stone-800">{item.name}</h4>
                        <p className="text-[10px] text-stone-400 capitalize">{item.category}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className={cn(
                          "text-sm font-bold",
                          isLow ? "text-red-500" : "text-stone-800"
                        )}>
                          {item.current_stock} <span className="text-stone-400 text-xs">{getUnitDisplay(item.unit)}</span>
                        </p>
                        {isLow && (
                          <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">LOW</span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
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
                <p className="text-stone-400 text-sm font-medium">No items in inventory.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
