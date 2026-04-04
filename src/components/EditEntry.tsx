import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup, EntryType, Item } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getUnitLabel } from '../lib/itemUnits';
import { logAction } from '../lib/auditLog';
import { toast } from '../lib/useToast';

interface EditEntryProps {
  transaction: any;
  onSave: () => void;
  onCancel: () => void;
}

export default function EditEntry({ transaction, onSave, onCancel }: EditEntryProps) {
  const { user } = useAuthStore();
  const [entryType, setEntryType] = useState<EntryType>(
    (transaction.type === 'income' || transaction.type === 'sale') ? 'income' : 'expense'
  );
  const [amount, setAmount] = useState(String(transaction.amount || ''));
  const [date, setDate] = useState(
    transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [note, setNote] = useState(transaction.notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Ledger group
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(transaction.ledger_group_id || null);
  const [breadcrumb, setBreadcrumb] = useState<LedgerGroup[]>([]);
  const [categoryError, setCategoryError] = useState(false);

  // Item-based editing
  const [hasItemLine, setHasItemLine] = useState(false);
  const [voucherLine, setVoucherLine] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => { fetchGroups(); }, [entryType]);
  useEffect(() => { fetchVoucherLine(); fetchItems(); }, []);

  const fetchGroups = async () => {
    const { data } = await supabase.from('ledger_groups').select('*').eq('user_id', user?.id).eq('type', entryType).is('deleted_at', null).order('name');
    if (data) setGroups(data);
  };

  const fetchVoucherLine = async () => {
    const { data } = await supabase.from('voucher_lines').select('*').eq('voucher_id', transaction.id).maybeSingle();
    if (data) {
      setVoucherLine(data);
      setHasItemLine(true);
      setSelectedItemId(data.item_id);
      setQty(String(data.qty || ''));
      setRate(String(data.rate || ''));
    }
  };

  const fetchItems = async () => {
    const { data } = await supabase.from('items').select('*').eq('user_id', user?.id).is('deleted_at', null).order('name');
    if (data) setItems(data);
  };

  useEffect(() => {
    if (selectedGroupId) {
      const group = groups.find(g => g.id === selectedGroupId);
      if (group && group.type !== entryType) setSelectedGroupId(null);
    }
  }, [entryType, groups]);

  const sanitizeNumeric = (val: string): string => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
    return cleaned;
  };

  // Tree helpers
  const getChildren = (parentId: string | null) => groups.filter(g => g.parent_id === parentId);
  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;
  const currentLevelGroups = getChildren(currentParentId);

  const handleGroupTap = (group: LedgerGroup) => {
    setCategoryError(false);
    const children = getChildren(group.id);
    if (children.length > 0) { setBreadcrumb([...breadcrumb, group]); setSelectedGroupId(null); }
    else { setSelectedGroupId(group.id); }
  };

  const handleBreadcrumbTap = (index: number) => {
    if (index < 0) { setBreadcrumb([]); setSelectedGroupId(null); }
    else { setBreadcrumb(breadcrumb.slice(0, index + 1)); setSelectedGroupId(null); }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const selectedItem = items.find(i => i.id === selectedItemId);

  const qtyNum = parseFloat(qty) || 0;
  const rateNum = parseFloat(rate) || 0;
  const itemAmount = qtyNum * rateNum;
  const manualAmount = parseFloat(amount) || 0;
  const finalAmount = hasItemLine ? itemAmount : manualAmount;

  const filteredItems = itemSearch
    ? items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    : items;

  const getGroupPath = (groupId: string | null): string => {
    if (!groupId) return '';
    const group = groups.find(g => g.id === groupId);
    if (!group) return '';
    const parts: string[] = [group.name];
    let current = group;
    while (current.parent_id) {
      const parent = groups.find(g => g.id === current.parent_id);
      if (parent) { parts.unshift(parent.name); current = parent; } else break;
    }
    return parts.join(' › ');
  };

  const handleSelectItem = (item: Item) => {
    setSelectedItemId(item.id);
    setRate(item.rate ? String(item.rate) : rate);
    setItemSearch('');
  };

  const handleSave = async () => {
    if (finalAmount <= 0) return;
    if (!selectedGroupId) { setCategoryError(true); return; }
    setSaving(true);

    try {
      const oldData = { type: transaction.type, amount: transaction.amount, date: transaction.date, notes: transaction.notes, ledger_group_id: transaction.ledger_group_id };
      const newData = { type: entryType, amount: finalAmount, date, notes: note || (selectedItem && hasItemLine ? `${selectedItem.name} — ${qtyNum} × ₹${rateNum}` : null), ledger_group_id: selectedGroupId };

      const { error } = await supabase.from('vouchers').update(newData).eq('id', transaction.id);

      // Update or create voucher_line
      if (!error && hasItemLine && selectedItemId) {
        if (voucherLine) {
          await supabase.from('voucher_lines').update({
            item_id: selectedItemId, qty: qtyNum, rate: rateNum, amount: itemAmount,
          }).eq('id', voucherLine.id);
        } else {
          await supabase.from('voucher_lines').insert({
            voucher_id: transaction.id, item_id: selectedItemId, qty: qtyNum, rate: rateNum, amount: itemAmount,
          });
        }
      }
      // Remove voucher_line if user turned off item mode
      if (!error && !hasItemLine && voucherLine) {
        await supabase.from('voucher_lines').delete().eq('id', voucherLine.id);
      }

      setSaving(false);
      if (!error) {
        logAction('update', 'vouchers', transaction.id, oldData, newData);
        toast.success('Entry updated successfully');
        setSaved(true);
        setTimeout(() => onSave(), 600);
      } else {
        toast.error('Failed to save: ' + error.message);
      }
    } catch (err) {
      setSaving(false);
      toast.error('Something went wrong while saving');
    }
  };

  const handleDelete = async () => {
    try {
      // Soft delete: set deleted_at instead of removing the row
      const { error } = await supabase
        .from('vouchers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', transaction.id);

      if (error) {
        toast.error('Failed to delete: ' + error.message);
        return;
      }

      logAction('delete', 'vouchers', transaction.id, {
        type: transaction.type,
        amount: transaction.amount,
        date: transaction.date,
        notes: transaction.notes,
      });
      toast.success('Entry moved to trash (recoverable for 15 days)');
      onSave();
    } catch {
      toast.error('Something went wrong while deleting');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#fafaf9] overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-100 px-4 h-14 flex items-center justify-between pt-safe">
        <button onClick={onCancel} className="flex items-center gap-1 text-stone-500 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-xl">close</span>
          <span className="text-sm font-semibold">Cancel</span>
        </button>
        <h1 className="font-headline font-bold text-stone-800 text-base">Edit Entry</h1>
        <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 text-red-400 hover:text-red-600 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-xl">delete</span>
        </button>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
        {/* Type Toggle */}
        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button onClick={() => setEntryType('income')} className={cn("flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5", entryType === 'income' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400")}>
            <span className="material-symbols-outlined text-base">trending_up</span>Income
          </button>
          <button onClick={() => setEntryType('expense')} className={cn("flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5", entryType === 'expense' ? "bg-red-500 text-white shadow-sm" : "text-stone-400")}>
            <span className="material-symbols-outlined text-base">trending_down</span>Expense
          </button>
        </div>

        {/* Item Toggle */}
        <div
          onClick={() => { setHasItemLine(!hasItemLine); if (hasItemLine) { setSelectedItemId(null); setQty(''); setRate(''); } }}
          className={cn("flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.98]", hasItemLine ? "border-blue-400 bg-blue-50" : "border-stone-200 bg-white")}
        >
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", hasItemLine ? "bg-blue-100" : "bg-stone-100")}>
            <span className={cn("material-symbols-outlined text-lg", hasItemLine ? "text-blue-600" : "text-stone-400")}>inventory_2</span>
          </div>
          <div className="flex-1">
            <p className={cn("text-sm font-bold", hasItemLine ? "text-blue-700" : "text-stone-600")}>{entryType === 'income' ? 'Sell Item' : 'Purchase Item'}</p>
            <p className="text-[10px] text-stone-400">Item with quantity & rate</p>
          </div>
          <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", hasItemLine ? "border-blue-500 bg-blue-500" : "border-stone-300")}>
            {hasItemLine && <span className="material-symbols-outlined text-white text-sm">check</span>}
          </div>
        </div>

        {/* Item Picker */}
        <AnimatePresence>
          {hasItemLine && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Select Item</label>
                {selectedItem ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-blue-600 text-lg">inventory_2</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-800">{selectedItem.name}</p>
                        <p className="text-[10px] text-stone-400 capitalize">{selectedItem.category} • {getUnitLabel(selectedItem.unit)}</p>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedItemId(null); setQty(''); setRate(''); }} className="text-stone-400 active:scale-95">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">search</span>
                      <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search items..." className="w-full bg-white border border-stone-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-stone-200 bg-white p-1">
                      {filteredItems.map(item => (
                        <div key={item.id} onClick={() => handleSelectItem(item)} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-stone-50 active:bg-stone-100 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-stone-500 text-sm">eco</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-stone-700">{item.name}</p>
                            <p className="text-[10px] text-stone-400 capitalize">{item.category}</p>
                          </div>
                          <span className="text-[10px] text-stone-400">₹{item.rate || 0}/{getUnitLabel(item.unit)}</span>
                        </div>
                      ))}
                      {filteredItems.length === 0 && <p className="text-center text-xs text-stone-400 py-4">No items found.</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Qty & Rate */}
              {selectedItem && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Qty ({getUnitLabel(selectedItem.unit)})</label>
                      <input inputMode="decimal" pattern="[0-9]*" value={qty} onChange={e => setQty(sanitizeNumeric(e.target.value))} placeholder="0" className="w-full bg-white border-2 border-stone-200 rounded-xl py-3 px-4 text-lg font-bold text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Rate (₹/{getUnitLabel(selectedItem.unit)})</label>
                      <input inputMode="decimal" pattern="[0-9]*" value={rate} onChange={e => setRate(sanitizeNumeric(e.target.value))} placeholder="0" className="w-full bg-white border-2 border-stone-200 rounded-xl py-3 px-4 text-lg font-bold text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all" />
                    </div>
                  </div>
                  {qtyNum > 0 && rateNum > 0 && (
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-xs text-stone-500">{qtyNum} {getUnitLabel(selectedItem.unit)} × ₹{rateNum.toLocaleString('en-IN')}</span>
                      <span className="text-lg font-headline font-extrabold text-stone-800">= {formatCurrency(itemAmount)}</span>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Amount (only when NOT using item) */}
        {!hasItemLine && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-400 font-headline font-bold text-xl">₹</span>
              <input inputMode="decimal" pattern="[0-9]*" value={amount} onChange={e => setAmount(sanitizeNumeric(e.target.value))} placeholder="0" className="w-full bg-white border-2 border-stone-200 rounded-2xl py-5 pl-12 pr-5 text-3xl font-headline font-extrabold text-stone-800 text-center focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all placeholder:text-stone-200" />
            </div>
          </div>
        )}

        {/* Category Picker */}
        <div>
          <label className={cn("text-[10px] font-bold uppercase tracking-widest mb-2 block", categoryError ? "text-red-500" : "text-stone-400")}>
            Category {categoryError && '— Please select a category'}
          </label>

          {selectedGroupId && selectedGroup && breadcrumb.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={cn("mb-3 px-3 py-2.5 rounded-xl flex items-center justify-between", entryType === 'income' ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200")}>
              <div className="flex items-center gap-2">
                <span className={cn("material-symbols-outlined text-base", entryType === 'income' ? "text-emerald-600" : "text-red-500")}>{selectedGroup.icon || 'folder'}</span>
                <span className="text-xs font-bold text-stone-700">{getGroupPath(selectedGroupId)}</span>
              </div>
              <button onClick={() => { setSelectedGroupId(null); setBreadcrumb([]); }} className="text-stone-400 active:scale-95">
                <span className="material-symbols-outlined text-sm">edit</span>
              </button>
            </motion.div>
          )}

          {(breadcrumb.length > 0 || !selectedGroupId) && (
            <>
              {breadcrumb.length > 0 && (
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                  <button onClick={() => handleBreadcrumbTap(-1)} className="text-[10px] font-bold text-emerald-600 active:scale-95">All</button>
                  {breadcrumb.map((bc, i) => (
                    <div key={bc.id} className="flex items-center gap-1">
                      <span className="text-stone-300 text-[10px]">›</span>
                      <button onClick={() => handleBreadcrumbTap(i)} className={cn("text-[10px] font-bold active:scale-95", i === breadcrumb.length - 1 ? "text-stone-700" : "text-emerald-600")}>{bc.name}</button>
                    </div>
                  ))}
                </div>
              )}
              <div className={cn("grid grid-cols-3 gap-2 rounded-xl p-1", categoryError && "ring-2 ring-red-400/50")}>
                {currentLevelGroups.map(group => {
                  const hasChildren = getChildren(group.id).length > 0;
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <motion.button key={group.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onClick={() => handleGroupTap(group)} className={cn("flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all active:scale-95", isSelected ? (entryType === 'income' ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50") : "border-stone-200 bg-white")}>
                      <span className={cn("material-symbols-outlined text-xl mb-1", isSelected ? (entryType === 'income' ? "text-emerald-600" : "text-red-500") : "text-stone-400")}>{group.icon || 'folder'}</span>
                      <span className={cn("text-[10px] font-bold leading-tight text-center line-clamp-2", isSelected ? "text-stone-800" : "text-stone-500")}>{group.name}</span>
                      {hasChildren && <span className="text-[8px] text-stone-300 mt-0.5">▸ tap</span>}
                    </motion.button>
                  );
                })}
              </div>
              {selectedGroup && breadcrumb.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-3 px-3 py-2 rounded-xl flex items-center gap-2", entryType === 'income' ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200")}>
                  <span className="material-symbols-outlined text-sm text-stone-500">check_circle</span>
                  <span className="text-xs font-bold text-stone-700">{breadcrumb.map(b => b.name).concat(selectedGroup.name).join(' › ')}</span>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl py-3 px-4 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all" />
        </div>

        {/* Note */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Note (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid 3 workers" className="w-full bg-white border border-stone-200 rounded-xl py-3 px-4 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-stone-300" />
        </div>

        {/* Transaction Info */}
        <div className="bg-stone-50 rounded-xl p-3 space-y-1">
          <p className="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Transaction Info</p>
          <p className="text-[10px] text-stone-500">Voucher: <span className="font-bold text-stone-700">{transaction.voucher_no}</span></p>
          <p className="text-[10px] text-stone-500">Created: <span className="font-bold text-stone-700">{new Date(transaction.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving || finalAmount <= 0} className={cn("w-full py-4 rounded-2xl font-bold text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50", saved ? "bg-emerald-500 text-white" : "bg-[#1b4332] text-white shadow-emerald-900/20")}>
          {saved ? (
            <span className="flex items-center justify-center gap-2"><span className="material-symbols-outlined text-lg">check_circle</span>Saved!</span>
          ) : saving ? 'Saving...' : (
            <span className="flex items-center justify-center gap-2"><span className="material-symbols-outlined text-lg">save</span>Save Changes — {formatCurrency(finalAmount)}</span>
          )}
        </button>
      </div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-black/40 flex items-end justify-center" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-safe space-y-4">
              <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto" />
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-2xl text-red-500">delete_forever</span>
                </div>
                <h3 className="text-lg font-headline font-bold text-stone-800">Move to Trash?</h3>
                <p className="text-sm text-stone-500 mt-1">This {formatCurrency(transaction.amount)} entry will be moved to trash. You can restore it from Settings within 15 days.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold text-sm active:scale-[0.98]">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm active:scale-[0.98]">Move to Trash</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
