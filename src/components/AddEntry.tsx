import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup, EntryType, Item } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getUnitInsertCandidates, getUnitLabel, ITEM_UNIT_OPTIONS, normalizeItemUnit, VALID_ITEM_UNITS } from '../lib/itemUnits';
import { logAction } from '../lib/auditLog';
import { toast } from '../lib/useToast';

interface AddEntryProps {
  onDone: () => void;
  initialType?: 'income' | 'expense';
}

export default function AddEntry({ onDone, initialType = 'expense' }: AddEntryProps) {
  const { user } = useAuthStore();
  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [categoryError, setCategoryError] = useState(false);

  // Ledger group
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<LedgerGroup[]>([]);

  // Item-based entry
  const [useItem, setUseItem] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Add new item inline
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('kg');
  const [newItemRate, setNewItemRate] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newItemParentLedgerId, setNewItemParentLedgerId] = useState<string | null>(null);
  const [addItemError, setAddItemError] = useState('');

  useEffect(() => {
    fetchGroups();
    fetchItems();
  }, [entryType]);

  const fetchGroups = async () => {
    const { data } = await supabase.from('ledger_groups').select('*').eq('user_id', user?.id).eq('type', entryType).is('deleted_at', null).order('name');
    if (data) setGroups(data);
    setSelectedGroupId(null);
    setBreadcrumb([]);
  };

  // Refresh groups without resetting selection (used after creating new items/groups)
  const refreshGroups = async (): Promise<LedgerGroup[]> => {
    const { data } = await supabase.from('ledger_groups').select('*').eq('user_id', user?.id).eq('type', entryType).is('deleted_at', null).order('name');
    if (data) setGroups(data);
    return data || [];
  };

  const fetchItems = async () => {
    const { data } = await supabase.from('items').select('*').eq('user_id', user?.id).is('deleted_at', null).order('name');
    if (data) setItems(data);
  };

  // Computed amount from item
  const qtyNum = parseFloat(qty) || 0;
  const rateNum = parseFloat(rate) || 0;
  const itemAmount = qtyNum * rateNum;
  const manualAmount = parseFloat(amount) || 0;
  const finalAmount = useItem ? itemAmount : manualAmount;

  const handleSelectItem = (item: Item) => {
    setSelectedItemId(item.id);
    setRate(item.rate ? String(item.rate) : '');
    setItemSearch('');
  };

  // Sanitize numeric input: only positive numbers
  const sanitizeNumeric = (val: string): string => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    // Allow only one decimal point
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
    if (children.length > 0) {
      setBreadcrumb([...breadcrumb, group]);
      setSelectedGroupId(null);
    } else {
      setSelectedGroupId(group.id);
    }
  };

  const handleBreadcrumbTap = (index: number) => {
    if (index < 0) { setBreadcrumb([]); setSelectedGroupId(null); }
    else { setBreadcrumb(breadcrumb.slice(0, index + 1)); setSelectedGroupId(null); }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const selectedItem = items.find(i => i.id === selectedItemId);

  const filteredItems = itemSearch
    ? items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    : items;

  // Get top-level (root) ledger groups for the parent dropdown
  const parentLedgerOptions = groups.filter(g => g.parent_id === null);

  // Add new item + auto-create ledger group
  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      setAddItemError('Item name is required');
      return;
    }

    const categoryVal = 'other';

    // Validate unit
    const normalizedUnit = normalizeItemUnit(newItemUnit);

    if (!VALID_ITEM_UNITS.includes(normalizedUnit as (typeof VALID_ITEM_UNITS)[number])) {
      setAddItemError(`Invalid unit "${newItemUnit}".`);
      return;
    }

    setAddItemError('');
    setAddingItem(true);

    let data = null;
    let error = null;

    for (const unit of getUnitInsertCandidates(normalizedUnit)) {
      const result = await supabase.from('items').insert({
        user_id: user?.id,
        name: newItemName.trim(),
        category: categoryVal,
        unit,
        rate: parseFloat(newItemRate) || 0,
        current_stock: 0,
        min_stock: 0,
      }).select().single();

      if (!result.error) {
        data = result.data;
        error = null;
        break;
      }

      error = result.error;

      if (!result.error.message.toLowerCase().includes('unit_check')) {
        break;
      }
    }

    if (error || !data) {
      setAddingItem(false);
      setAddItemError('Failed to save item: ' + (error?.message || 'Unknown error'));
      return;
    }

    // Auto-create a ledger group under the selected parent
    let autoLedgerGroupId: string | null = null;
    const parentId = newItemParentLedgerId || null;
    const { data: ledgerData, error: ledgerError } = await supabase.from('ledger_groups').insert({
      user_id: user?.id,
      name: newItemName.trim(),
      type: entryType,
      parent_id: parentId,
      icon: 'folder',
    }).select('id').single();

    if (ledgerError) {
      console.error('Ledger group creation failed:', ledgerError.message);
      // Item was created, but ledger group failed — still continue
    }
    if (ledgerData) {
      autoLedgerGroupId = ledgerData.id;
    }

    await fetchItems();
    // Refresh groups WITHOUT resetting selection
    const freshGroups = await refreshGroups();

    setSelectedItemId(data.id);
    setRate(newItemRate || '');

    // Auto-select the newly created ledger group
    if (autoLedgerGroupId) {
      setSelectedGroupId(autoLedgerGroupId);
      setCategoryError(false);
      // Set breadcrumb to the parent if one was selected (use fresh data)
      if (parentId) {
        const parent = freshGroups.find(g => g.id === parentId);
        if (parent) setBreadcrumb([parent]);
      } else {
        setBreadcrumb([]);
      }
    }

    setShowAddItem(false);
    setNewItemName('');
    setNewItemRate('');
    setNewItemParentLedgerId(null);
    setAddingItem(false);
  };

  const handleSubmit = async () => {
    if (finalAmount <= 0) return;
    if (!selectedGroupId) {
      setCategoryError(true);
      return;
    }
    setSaving(true);

    const voucherNo = `KB-${new Date().getFullYear().toString().slice(-2)}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;

    const { data: voucher, error } = await supabase.from('vouchers').insert({
      user_id: user?.id,
      voucher_no: voucherNo,
      type: entryType,
      date,
      amount: finalAmount,
      notes: note || (selectedItem ? `${selectedItem.name} — ${qtyNum} × ₹${rateNum}` : null),
      ledger_group_id: selectedGroupId,
      payment_mode: 'Cash',
    }).select('id').single();

    if (!error && voucher && useItem && selectedItemId) {
      await supabase.from('voucher_lines').insert({
        voucher_id: voucher.id,
        item_id: selectedItemId,
        qty: qtyNum,
        rate: rateNum,
        amount: itemAmount,
      });
    }

    setSaving(false);
    if (!error && voucher) {
      logAction('create', 'vouchers', voucher.id, null, { type: entryType, amount: finalAmount, date, notes: note || null });
      toast.success(`${entryType === 'income' ? 'Income' : 'Expense'} of ${formatCurrency(finalAmount)} added`);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setAmount('');
        setNote('');
        setQty('');
        setRate('');
        setSelectedGroupId(null);
        setSelectedItemId(null);
        setBreadcrumb([]);
        setUseItem(false);
        onDone();
      }, 800);
    } else if (error) {
      toast.error('Failed to save: ' + error.message);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Type Toggle */}
      <div className="flex bg-stone-100 p-1 rounded-xl">
        <button
          onClick={() => { setEntryType('income'); setUseItem(false); setSelectedItemId(null); }}
          className={cn("flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5", entryType === 'income' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400")}
        >
          <span className="material-symbols-outlined text-base">trending_up</span>Income
        </button>
        <button
          onClick={() => { setEntryType('expense'); setUseItem(false); setSelectedItemId(null); }}
          className={cn("flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5", entryType === 'expense' ? "bg-red-500 text-white shadow-sm" : "text-stone-400")}
        >
          <span className="material-symbols-outlined text-base">trending_down</span>Expense
        </button>
      </div>

      {/* Item Toggle */}
      <div
        onClick={() => { setUseItem(!useItem); setSelectedItemId(null); setQty(''); setRate(''); }}
        className={cn("flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.98]", useItem ? "border-blue-400 bg-blue-50" : "border-stone-200 bg-white")}
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", useItem ? "bg-blue-100" : "bg-stone-100")}>
          <span className={cn("material-symbols-outlined text-lg", useItem ? "text-blue-600" : "text-stone-400")}>inventory_2</span>
        </div>
        <div className="flex-1">
          <p className={cn("text-sm font-bold", useItem ? "text-blue-700" : "text-stone-600")}>{entryType === 'income' ? 'Sell Item' : 'Purchase Item'}</p>
          <p className="text-[10px] text-stone-400">Choose item with quantity & rate</p>
        </div>
        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", useItem ? "border-blue-500 bg-blue-500" : "border-stone-300")}>
          {useItem && <span className="material-symbols-outlined text-white text-sm">check</span>}
        </div>
      </div>

      {/* Item Picker (when useItem is ON) */}
      <AnimatePresence>
        {useItem && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Select Item</label>
                <button onClick={() => setShowAddItem(!showAddItem)} className="text-[10px] font-bold text-blue-600 flex items-center gap-0.5 active:scale-95">
                  <span className="material-symbols-outlined text-xs">{showAddItem ? 'close' : 'add'}</span>
                  {showAddItem ? 'Cancel' : 'New Item'}
                </button>
              </div>

              {/* Add New Item Form */}
              <AnimatePresence>
                {showAddItem && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 space-y-3 overflow-hidden">
                    {/* Error Message */}
                    {addItemError && (
                      <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {addItemError}
                      </div>
                    )}
                    <input
                      value={newItemName}
                      onChange={e => { setNewItemName(e.target.value); setAddItemError(''); }}
                      placeholder="Item name (e.g. Wheat, DAP)"
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={newItemUnit} onChange={e => setNewItemUnit(normalizeItemUnit(e.target.value))} className="border border-stone-200 rounded-lg px-3 py-2.5 text-sm font-medium bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                        {ITEM_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <input
                        inputMode="decimal"
                        pattern="[0-9]*"
                        value={newItemRate}
                        onChange={e => setNewItemRate(sanitizeNumeric(e.target.value))}
                        placeholder="Rate ₹"
                        className="border border-stone-200 rounded-lg px-3 py-2.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    {/* Parent Ledger Group Selector */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1 block">
                        Ledger Category (Parent) — {entryType === 'income' ? '📈 Income' : '📉 Expense'} groups
                      </label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 text-sm">account_tree</span>
                        <select
                          value={newItemParentLedgerId || ''}
                          onChange={e => setNewItemParentLedgerId(e.target.value || null)}
                          className="w-full border border-blue-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-medium bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                          <option value="">None (Top Level)</option>
                          {parentLedgerOptions.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[9px] text-blue-400 mt-1">
                        A ledger sub-category will be auto-created under this parent ({entryType} type)
                      </p>
                    </div>
                    <button onClick={handleAddItem} disabled={addingItem || !newItemName.trim()} className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold active:scale-[0.98] disabled:opacity-50">
                      {addingItem ? 'Adding...' : '+ Add Item & Create Ledger'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Selected Item Display */}
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
              ) : !showAddItem && (
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
                    {filteredItems.length === 0 && <p className="text-center text-xs text-stone-400 py-4">No items. Tap "+ New Item" above.</p>}
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
                    <input
                      inputMode="decimal"
                      pattern="[0-9]*"
                      value={qty}
                      onChange={e => setQty(sanitizeNumeric(e.target.value))}
                      placeholder="0"
                      className="w-full bg-white border-2 border-stone-200 rounded-xl py-3 px-4 text-lg font-bold text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Rate (₹/{getUnitLabel(selectedItem.unit)})</label>
                    <input
                      inputMode="decimal"
                      pattern="[0-9]*"
                      value={rate}
                      onChange={e => setRate(sanitizeNumeric(e.target.value))}
                      placeholder="0"
                      className="w-full bg-white border-2 border-stone-200 rounded-xl py-3 px-4 text-lg font-bold text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                    />
                  </div>
                </div>

                {/* Calculated Total */}
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

      {/* Amount (ONLY shown when NOT using item) */}
      {!useItem && (
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-400 font-headline font-bold text-xl">₹</span>
            <input
              inputMode="decimal"
              pattern="[0-9]*"
              value={amount}
              onChange={e => setAmount(sanitizeNumeric(e.target.value))}
              placeholder="0"
              className="w-full bg-white border-2 border-stone-200 rounded-2xl py-5 pl-12 pr-5 text-3xl font-headline font-extrabold text-stone-800 text-center focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all placeholder:text-stone-200"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Ledger Group Picker */}
      <div>
        <label className={cn("text-[10px] font-bold uppercase tracking-widest mb-2 block", categoryError ? "text-red-500" : "text-stone-400")}>
          Category {categoryError && '— Please select a category'}
        </label>
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
        {selectedGroup && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-3 px-3 py-2 rounded-xl flex items-center gap-2", entryType === 'income' ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200")}>
            <span className="material-symbols-outlined text-sm text-stone-500">check_circle</span>
            <span className="text-xs font-bold text-stone-700">{breadcrumb.map(b => b.name).concat(selectedGroup.name).join(' › ')}</span>
          </motion.div>
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
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid 3 workers for wheat cutting" className="w-full bg-white border border-stone-200 rounded-xl py-3 px-4 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-stone-300" />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || finalAmount <= 0}
        className={cn(
          "w-full py-4 rounded-2xl font-bold text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50",
          saved ? "bg-emerald-500 text-white" : entryType === 'income' ? "bg-emerald-600 text-white shadow-emerald-900/20" : "bg-red-500 text-white shadow-red-900/20"
        )}
      >
        {saved ? (
          <span className="flex items-center justify-center gap-2"><span className="material-symbols-outlined text-lg">check_circle</span>Saved!</span>
        ) : saving ? 'Saving...' : (
          <span className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-lg">add_circle</span>
            {entryType === 'income' ? 'Add Income' : 'Add Expense'} — {formatCurrency(finalAmount)}
          </span>
        )}
      </button>
    </div>
  );
}
