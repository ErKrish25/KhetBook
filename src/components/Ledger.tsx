import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup, EntryType } from '../types';
import { buildLedgerTotals, getChildren as getChildrenFromMap } from '../lib/ledger';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../lib/auditLog';
import { toast } from '../lib/useToast';
import ConfirmModal from './ConfirmModal';

type LedgerView = 'tree' | 'transactions' | 'addGroup' | 'editGroup';

interface LedgerProps {
  onEditTransaction: (tx: any) => void;
  refreshKey?: number;
}

export default function Ledger({ onEditTransaction, refreshKey }: LedgerProps) {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [view, setView] = useState<LedgerView>('tree');
  const [breadcrumb, setBreadcrumb] = useState<LedgerGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<LedgerGroup | null>(null);
  const [groupTransactions, setGroupTransactions] = useState<any[]>([]);

  // Add group form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<EntryType>('expense');
  const [newGroupParentId, setNewGroupParentId] = useState<string | null>(null);
  const [newGroupIcon, setNewGroupIcon] = useState('folder');
  const [addSaving, setAddSaving] = useState(false);

  // Edit group form
  const [editingGroup, setEditingGroup] = useState<LedgerGroup | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('folder');
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Context menu
  const [contextGroup, setContextGroup] = useState<LedgerGroup | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<LedgerGroup | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setGroups([]);
      setVouchers([]);
      return;
    }

    fetchGroups();
    fetchAllVouchers();
  }, [refreshKey, user?.id]);

  const fetchGroups = async () => {
    const { data } = await supabase.from('ledger_groups').select('*').eq('user_id', user?.id).is('deleted_at', null).order('name');
    if (data) setGroups(data);
  };

  const fetchAllVouchers = async () => {
    const { data } = await supabase
      .from('vouchers')
      .select('id, amount, date, type, notes, ledger_group_id')
      .eq('user_id', user?.id)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    if (data) setVouchers(data);
  };

  const { childrenMap, totalsByGroupId, descendantIdsByGroupId } = useMemo(
    () => buildLedgerTotals(groups, vouchers),
    [groups, vouchers]
  );

  const getChildren = (parentId: string | null) => getChildrenFromMap(childrenMap, parentId);
  const getGroupTotal = (groupId: string) => totalsByGroupId.get(groupId) ?? 0;
  const getAllDescendantIds = (groupId: string) => descendantIdsByGroupId.get(groupId) ?? [groupId];

  // ---- Search helpers ----
  const groupById = useMemo(() => {
    const map = new Map<string, LedgerGroup>();
    for (const g of groups) map.set(g.id, g);
    return map;
  }, [groups]);

  /** Build the ancestor chain for display: "Parent › Child" */
  const getGroupPath = (group: LedgerGroup): string => {
    const parts: string[] = [];
    let current: LedgerGroup | undefined = group;
    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? groupById.get(current.parent_id) : undefined;
    }
    return parts.join(' › ');
  };

  /** Build the breadcrumb chain for a group so we can navigate directly to it */
  const buildBreadcrumbTo = (group: LedgerGroup): LedgerGroup[] => {
    const chain: LedgerGroup[] = [];
    let current: LedgerGroup | undefined = group;
    while (current?.parent_id) {
      const parent = groupById.get(current.parent_id);
      if (parent) chain.unshift(parent);
      current = parent;
    }
    return chain;
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;
  const currentLevelGroups = getChildren(currentParentId);
  const incomeGroups = currentParentId === null ? currentLevelGroups.filter(g => g.type === 'income') : currentLevelGroups;
  const expenseGroups = currentParentId === null ? currentLevelGroups.filter(g => g.type === 'expense') : [];

  const handleGroupTap = (group: LedgerGroup) => {
    const children = getChildren(group.id);
    if (children.length > 0) {
      setBreadcrumb([...breadcrumb, group]);
    } else {
      setSelectedGroup(group);
      const allIds = new Set(getAllDescendantIds(group.id));
      setGroupTransactions(vouchers.filter(v => v.ledger_group_id && allIds.has(v.ledger_group_id)));
      setView('transactions');
    }
  };

  /** Handle tapping a search result — navigate breadcrumb to the group's parent, then open it */
  const handleSearchResultTap = (group: LedgerGroup) => {
    setSearchQuery('');
    const parentChain = buildBreadcrumbTo(group);
    const children = getChildren(group.id);
    if (children.length > 0) {
      setBreadcrumb([...parentChain, group]);
    } else {
      setBreadcrumb(parentChain);
      setSelectedGroup(group);
      const allIds = new Set(getAllDescendantIds(group.id));
      setGroupTransactions(vouchers.filter(v => v.ledger_group_id && allIds.has(v.ledger_group_id)));
      setView('transactions');
    }
  };

  const handleBreadcrumbTap = (index: number) => {
    if (index < 0) setBreadcrumb([]);
    else setBreadcrumb(breadcrumb.slice(0, index + 1));
    setContextGroup(null);
  };

  // ---- Group CRUD ----
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddSaving(true);
    const { data, error } = await supabase.from('ledger_groups').insert({
      user_id: user?.id, name: newGroupName.trim(), type: newGroupType, parent_id: newGroupParentId, icon: newGroupIcon,
    }).select('id').single();
    setAddSaving(false);
    if (error) {
      toast.error('Failed to create category: ' + error.message);
      return;
    }
    if (data) logAction('create', 'ledger_groups', data.id, null, { name: newGroupName.trim(), type: newGroupType });
    toast.success('Category created');
    setNewGroupName('');
    setView('tree');
    fetchGroups();
  };

  const handleOpenEdit = (group: LedgerGroup) => {
    setEditingGroup(group);
    setEditName(group.name);
    setEditIcon(group.icon || 'folder');
    setEditParentId(group.parent_id);
    setContextGroup(null);
    setView('editGroup');
  };

  const handleSaveEdit = async () => {
    if (!editingGroup || !editName.trim()) return;
    setEditSaving(true);
    const oldData = { name: editingGroup.name, icon: editingGroup.icon, parent_id: editingGroup.parent_id };
    const newData = { name: editName.trim(), icon: editIcon, parent_id: editParentId };
    const { error } = await supabase.from('ledger_groups').update(newData).eq('id', editingGroup.id);
    setEditSaving(false);
    if (error) {
      toast.error('Failed to save: ' + error.message);
      return;
    }
    logAction('update', 'ledger_groups', editingGroup.id, oldData, newData);
    toast.success('Category updated');
    setEditingGroup(null);
    setView('tree');
    fetchGroups();
  };

  const handleDeleteGroup = async (group: LedgerGroup) => {
    // Soft delete: set deleted_at instead of removing the row
    const { error } = await supabase
      .from('ledger_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', group.id);

    if (error) {
      toast.error('Failed to delete: ' + error.message);
      return;
    }

    logAction('delete', 'ledger_groups', group.id, { name: group.name, type: group.type });
    toast.success(`"${group.name}" moved to trash`);
    setDeleteTarget(null);
    setContextGroup(null);
    setBreadcrumb([]);
    fetchGroups();
  };

  const totalIncome = groups.filter(g => g.type === 'income' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0);
  const totalExpense = groups.filter(g => g.type === 'expense' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  const ICONS = ['folder', 'eco', 'engineering', 'content_cut', 'agriculture', 'grass', 'spa', 'local_gas_station', 'build', 'water_drop', 'landscape', 'receipt_long', 'more_horiz', 'shopping_cart', 'local_shipping', 'payments', 'home_repair_service', 'pest_control', 'storefront'];

  // ============================================
  // TRANSACTION VIEW — tap any entry to edit via EditEntry
  // ============================================
  if (view === 'transactions' && selectedGroup) {
    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center justify-between -mt-2">
          <button onClick={() => setView('tree')} className="flex items-center gap-1 text-stone-500 active:scale-95">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="text-sm font-semibold">Back</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 text-center">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3", selectedGroup.type === 'income' ? "bg-emerald-100" : "bg-red-100")}>
            <span className={cn("material-symbols-outlined text-2xl", selectedGroup.type === 'income' ? "text-emerald-600" : "text-red-500")}>{selectedGroup.icon || 'folder'}</span>
          </div>
          <h2 className="text-xl font-headline font-bold text-stone-800">{selectedGroup.name}</h2>
          <p className={cn("text-2xl font-headline font-extrabold mt-1", selectedGroup.type === 'income' ? "text-emerald-700" : "text-red-600")}>{formatCurrency(getGroupTotal(selectedGroup.id))}</p>
          <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">{groupTransactions.length} entries</p>
        </div>

        <div className="space-y-2">
          {groupTransactions.map(tx => {
            const isIncome = tx.type === 'income' || tx.type === 'sale';
            return (
              <div
                key={tx.id}
                onClick={() => onEditTransaction(tx)}
                className="bg-white rounded-xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
              >
                <div>
                  <p className="text-xs font-bold text-stone-800">{tx.notes || selectedGroup.name}</p>
                  <p className="text-[10px] text-stone-400">{formatDate(tx.date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", isIncome ? "text-emerald-700" : "text-red-600")}>{formatCurrency(tx.amount)}</span>
                  <span className="material-symbols-outlined text-stone-300 text-sm">edit</span>
                </div>
              </div>
            );
          })}
          {groupTransactions.length === 0 && (
            <p className="text-center text-sm text-stone-400 py-8 bg-white rounded-xl border border-stone-200/60">No entries in this category yet.</p>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // ADD GROUP VIEW
  // ============================================
  if (view === 'addGroup') {
    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center gap-3 -mt-2">
          <button onClick={() => setView('tree')} className="text-stone-500 active:scale-95"><span className="material-symbols-outlined text-xl">arrow_back</span></button>
          <h2 className="text-lg font-headline font-bold text-stone-800">New Category</h2>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Name</label>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Cutting Labour" className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Type</label>
            <div className="flex gap-2">
              <button onClick={() => setNewGroupType('expense')} className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all", newGroupType === 'expense' ? "border-red-400 bg-red-50 text-red-600" : "border-stone-200 text-stone-400")}>Expense</button>
              <button onClick={() => setNewGroupType('income')} className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all", newGroupType === 'income' ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-400")}>Income</button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Parent Group (optional)</label>
            <select value={newGroupParentId || ''} onChange={e => setNewGroupParentId(e.target.value || null)} className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
              <option value="">None (Top Level)</option>
              {groups.filter(g => g.type === newGroupType).map(g => <option key={g.id} value={g.id}>{g.parent_id ? '  ↳ ' : ''}{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Icon</label>
            <div className="flex flex-wrap gap-2">{ICONS.map(icon => (
              <button key={icon} onClick={() => setNewGroupIcon(icon)} className={cn("w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all", newGroupIcon === icon ? "border-emerald-400 bg-emerald-50" : "border-stone-200 bg-white")}>
                <span className="material-symbols-outlined text-lg text-stone-500">{icon}</span>
              </button>
            ))}</div>
          </div>
          <button onClick={handleAddGroup} disabled={addSaving || !newGroupName.trim()} className="w-full py-3.5 bg-[#1b4332] text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50">{addSaving ? 'Creating...' : 'Create Category'}</button>
        </div>
      </div>
    );
  }

  // ============================================
  // EDIT GROUP VIEW
  // ============================================
  if (view === 'editGroup' && editingGroup) {
    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center gap-3 -mt-2">
          <button onClick={() => { setView('tree'); setEditingGroup(null); }} className="text-stone-500 active:scale-95"><span className="material-symbols-outlined text-xl">arrow_back</span></button>
          <h2 className="text-lg font-headline font-bold text-stone-800">Edit Category</h2>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Parent Group</label>
            <select value={editParentId || ''} onChange={e => setEditParentId(e.target.value || null)} className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
              <option value="">None (Top Level)</option>
              {groups.filter(g => g.type === editingGroup.type && g.id !== editingGroup.id).map(g => <option key={g.id} value={g.id}>{g.parent_id ? '  ↳ ' : ''}{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Icon</label>
            <div className="flex flex-wrap gap-2">{ICONS.map(icon => (
              <button key={icon} onClick={() => setEditIcon(icon)} className={cn("w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all", editIcon === icon ? "border-emerald-400 bg-emerald-50" : "border-stone-200 bg-white")}>
                <span className="material-symbols-outlined text-lg text-stone-500">{icon}</span>
              </button>
            ))}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={editSaving || !editName.trim()} className="flex-1 py-3.5 bg-[#1b4332] text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50">{editSaving ? 'Saving...' : 'Save Changes'}</button>
            <button onClick={() => setDeleteTarget(editingGroup)} className="py-3.5 px-4 bg-red-50 text-red-500 border border-red-200 rounded-xl font-bold text-sm active:scale-[0.98]">
              <span className="material-symbols-outlined text-lg">delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // TREE VIEW (main)
  // ============================================
  const renderGroupCard = (group: LedgerGroup, i: number) => {
    const total = getGroupTotal(group.id);
    const children = getChildren(group.id);
    const hasChildren = children.length > 0;
    const isContextOpen = contextGroup?.id === group.id;

    return (
      <motion.div
        key={group.id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.03 }}
        className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden"
      >
        <div className="p-3.5 flex items-center justify-between">
          <div
            className="flex items-center gap-3 flex-1 cursor-pointer active:scale-[0.98] transition-all"
            onClick={() => handleGroupTap(group)}
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", group.type === 'income' ? "bg-emerald-100" : "bg-red-100")}>
              <span className={cn("material-symbols-outlined text-lg", group.type === 'income' ? "text-emerald-600" : "text-red-500")}>{group.icon || 'folder'}</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-800">{group.name}</h4>
              {hasChildren && <p className="text-[10px] text-stone-400">{children.length} sub-categories</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn("text-sm font-bold mr-1", group.type === 'income' ? "text-emerald-700" : total > 0 ? "text-red-600" : "text-stone-300")}>{formatCurrency(total)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setContextGroup(isContextOpen ? null : group); }}
              className="p-1 text-stone-300 hover:text-stone-500 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isContextOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-stone-100 overflow-hidden">
              <div className="flex gap-2 p-2.5 bg-stone-50">
                <button onClick={() => handleOpenEdit(group)} className="flex-1 py-2 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-600 flex items-center justify-center gap-1 active:scale-95">
                  <span className="material-symbols-outlined text-sm">edit</span>Edit
                </button>
                <button onClick={() => { setDeleteTarget(group); setContextGroup(null); }} className="flex-1 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-500 flex items-center justify-center gap-1 active:scale-95">
                  <span className="material-symbols-outlined text-sm">delete</span>Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const deleteMsg = deleteTarget
    ? (() => {
        const children = getChildren(deleteTarget.id);
        const total = getGroupTotal(deleteTarget.id);
        return children.length > 0
          ? `Move "${deleteTarget.name}" and its ${children.length} sub-categories to trash? (${formatCurrency(total)} in entries will be unlinked)`
          : `Move "${deleteTarget.name}" to trash? (${formatCurrency(total)} in entries will be unlinked). Recoverable for 15 days.`;
      })()
    : '';

  return (
    <>
      <div className="space-y-5 pb-8">
        {/* Hero */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Ledger Groups</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-800/50 p-3 rounded-xl">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Total Income</p>
              <p className="text-lg font-headline font-extrabold"><span className="text-white/50 text-xs mr-0.5">₹</span>{totalIncome.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-emerald-800/50 p-3 rounded-xl">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Total Expense</p>
              <p className="text-lg font-headline font-extrabold"><span className="text-white/50 text-xs mr-0.5">₹</span>{totalExpense.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </motion.section>

        {/* Search Box */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-lg pointer-events-none">search</span>
          <input
            id="ledger-search-input"
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); }}
            placeholder="Search ledgers & sub-ledgers…"
            className="w-full pl-10 pr-10 py-3 bg-white border border-stone-200/60 rounded-2xl text-sm font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-stone-400 hover:text-stone-600 active:scale-90 transition-all"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>

        {/* Search Results */}
        {isSearching ? (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {searchResults.map((group, i) => {
                const total = getGroupTotal(group.id);
                const children = getChildren(group.id);
                const hasChildren = children.length > 0;
                const path = getGroupPath(group);
                return (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    onClick={() => handleSearchResultTap(group)}
                    className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", group.type === 'income' ? 'bg-emerald-100' : 'bg-red-100')}>
                      <span className={cn("material-symbols-outlined text-lg", group.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>{group.icon || 'folder'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-stone-800 truncate">{group.name}</h4>
                      <p className="text-[10px] text-stone-400 truncate">{path}</p>
                      {hasChildren && <p className="text-[10px] text-stone-400">{children.length} sub-categories</p>}
                    </div>
                    <span className={cn("text-sm font-bold shrink-0", group.type === 'income' ? 'text-emerald-700' : total > 0 ? 'text-red-600' : 'text-stone-300')}>{formatCurrency(total)}</span>
                  </motion.div>
                );
              })}
              {searchResults.length === 0 && (
                <div className="text-center py-10 bg-white rounded-2xl border border-stone-200/60">
                  <span className="material-symbols-outlined text-4xl text-stone-300 mb-2 block">search_off</span>
                  <p className="text-sm text-stone-400">No ledgers found for "{searchQuery}"</p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            {/* Breadcrumb */}
            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => handleBreadcrumbTap(-1)} className="text-xs font-bold text-emerald-600 active:scale-95">All</button>
                {breadcrumb.map((bc, i) => (
                  <div key={bc.id} className="flex items-center gap-1">
                    <span className="text-stone-300 text-xs">›</span>
                    <button onClick={() => handleBreadcrumbTap(i)} className={cn("text-xs font-bold active:scale-95", i === breadcrumb.length - 1 ? "text-stone-700" : "text-emerald-600")}>{bc.name}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Groups */}
            {currentParentId === null ? (
              <>
                <section>
                  <h4 className="font-headline font-bold text-emerald-700 text-[13px] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">trending_up</span>Income
                  </h4>
                  <div className="space-y-2">{incomeGroups.map((g, i) => renderGroupCard(g, i))}</div>
                </section>
                <section>
                  <h4 className="font-headline font-bold text-red-600 text-[13px] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">trending_down</span>Expense
                  </h4>
                  <div className="space-y-2">{expenseGroups.map((g, i) => renderGroupCard(g, i))}</div>
                </section>
              </>
            ) : (
              <section>
                <div className="space-y-2">{currentLevelGroups.map((g, i) => renderGroupCard(g, i))}</div>
                {currentLevelGroups.length === 0 && <p className="text-xs text-stone-400 text-center py-3">No sub-categories.</p>}
              </section>
            )}
          </>
        )}

        {/* Add Group FAB */}
        <button
          onClick={() => {
            setNewGroupParentId(currentParentId);
            setNewGroupType(breadcrumb.length > 0 ? breadcrumb[0].type as EntryType : 'expense');
            setView('addGroup');
          }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-[#1b4332] text-white rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center active:scale-90 transition-all z-40"
        >
          <span className="material-symbols-outlined text-2xl">add</span>
        </button>
      </div>
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Move to Trash?"
        message={deleteMsg}
        onConfirm={() => { if (deleteTarget) handleDeleteGroup(deleteTarget); }}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Move to Trash"
      />
    </>
  );
}
