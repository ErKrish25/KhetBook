import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import khetbookIcon from '../assets/khetbook-icon.png';

export default function FamilyHome() {
  const { ownerId, logout } = useAuthStore();
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<LedgerGroup[]>([]);
  const [viewingTx, setViewingTx] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<LedgerGroup | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: g }, { data: v }] = await Promise.all([
      supabase.from('ledger_groups').select('*').eq('user_id', ownerId).order('name'),
      supabase.from('vouchers').select('*').eq('user_id', ownerId).order('date', { ascending: false }),
    ]);
    if (g) setGroups(g);
    if (v) setVouchers(v);
  };

  const handleLogout = async () => {
    localStorage.removeItem('khetbook_family_session');
    await supabase.auth.signOut();
    logout();
  };

  const getChildren = (parentId: string | null) => groups.filter(g => g.parent_id === parentId);

  const getAllDescendantIds = (groupId: string): string[] => {
    const ids = [groupId];
    for (const child of getChildren(groupId)) ids.push(...getAllDescendantIds(child.id));
    return ids;
  };

  const getGroupTotal = (groupId: string): number => {
    const allIds = getAllDescendantIds(groupId);
    return vouchers.filter(v => allIds.includes(v.ledger_group_id)).reduce((s, v) => s + v.amount, 0);
  };

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;
  const currentLevelGroups = getChildren(currentParentId);

  const handleGroupTap = (group: LedgerGroup) => {
    const children = getChildren(group.id);
    if (children.length > 0) {
      setBreadcrumb([...breadcrumb, group]);
    } else {
      setSelectedGroup(group);
      setViewingTx(true);
    }
  };

  const handleBack = () => {
    if (viewingTx) {
      setViewingTx(false);
      setSelectedGroup(null);
    } else if (breadcrumb.length > 0) {
      setBreadcrumb(breadcrumb.slice(0, -1));
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

  const totalIncome = groups.filter(g => g.type === 'income' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0);
  const totalExpense = groups.filter(g => g.type === 'expense' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0);

  // Transaction View
  if (viewingTx && selectedGroup) {
    const allIds = getAllDescendantIds(selectedGroup.id);
    const txList = vouchers.filter(v => allIds.includes(v.ledger_group_id));

    return (
      <div className="min-h-screen bg-[#fafaf9] font-body">
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-100 px-5 py-3">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <button onClick={handleBack} className="text-stone-500 active:scale-95"><span className="material-symbols-outlined text-xl">arrow_back</span></button>
            <h1 className="font-headline font-bold text-stone-800 text-lg">{selectedGroup.name}</h1>
          </div>
        </header>
        <div className="max-w-md mx-auto px-4 pt-4 pb-8 space-y-4">
          <div className={cn("p-4 rounded-2xl text-center", selectedGroup.type === 'income' ? "bg-emerald-50" : "bg-red-50")}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Total</p>
            <p className={cn("text-2xl font-headline font-extrabold", selectedGroup.type === 'income' ? "text-emerald-700" : "text-red-600")}>
              {formatCurrency(txList.reduce((s, v) => s + v.amount, 0))}
            </p>
          </div>
          {txList.map(tx => (
            <div key={tx.id} className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-stone-800">{tx.notes || selectedGroup.name}</p>
                <p className="text-[10px] text-stone-400">{formatDate(tx.date)}</p>
              </div>
              <span className={cn("text-sm font-bold", selectedGroup.type === 'income' ? "text-emerald-700" : "text-red-600")}>
                {formatCurrency(tx.amount)}
              </span>
            </div>
          ))}
          {txList.length === 0 && <p className="text-center text-sm text-stone-400 py-8">No entries.</p>}
        </div>
      </div>
    );
  }

  // Main View
  const incomeGroups = currentParentId === null ? currentLevelGroups.filter(g => g.type === 'income') : currentLevelGroups;
  const expenseGroups = currentParentId === null ? currentLevelGroups.filter(g => g.type === 'expense') : [];

  return (
    <div className="min-h-screen bg-[#fafaf9] font-body">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-100 px-5 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0"><img alt="Khetbook" className="w-full h-full object-contain" src={khetbookIcon} /></div>
            <div>
              <h1 className="font-headline font-extrabold text-[#1b4332] text-lg tracking-tight leading-tight">Khetbook</h1>
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Read-Only View</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-stone-400 hover:text-red-500 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
        {/* Summary */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Farm Summary</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-800/50 p-3 rounded-xl">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Income</p>
              <p className="text-lg font-headline font-extrabold"><span className="text-white/50 text-xs mr-0.5">₹</span>{totalIncome.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-emerald-800/50 p-3 rounded-xl">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Expense</p>
              <p className="text-lg font-headline font-extrabold"><span className="text-white/50 text-xs mr-0.5">₹</span>{totalExpense.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </motion.section>

        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setBreadcrumb([])} className="text-xs font-bold text-emerald-600">All</button>
            {breadcrumb.map((bc, i) => (
              <div key={bc.id} className="flex items-center gap-1">
                <span className="text-stone-300 text-xs">›</span>
                <button onClick={() => setBreadcrumb(breadcrumb.slice(0, i + 1))} className={cn("text-xs font-bold", i === breadcrumb.length - 1 ? "text-stone-700" : "text-emerald-600")}>{bc.name}</button>
              </div>
            ))}
          </div>
        )}

        {/* Groups */}
        {currentParentId === null ? (
          <>
            <section>
              <h4 className="font-headline font-bold text-emerald-700 text-[13px] uppercase tracking-wider mb-3">Income</h4>
              <div className="space-y-2">
                {incomeGroups.map((g, i) => (
                  <motion.div key={g.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => handleGroupTap(g)} className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><span className="material-symbols-outlined text-lg text-emerald-600">{g.icon || 'folder'}</span></div>
                      <span className="text-sm font-bold text-stone-800">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-700">{formatCurrency(getGroupTotal(g.id))}</span>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
            <section>
              <h4 className="font-headline font-bold text-red-600 text-[13px] uppercase tracking-wider mb-3">Expense</h4>
              <div className="space-y-2">
                {expenseGroups.map((g, i) => (
                  <motion.div key={g.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => handleGroupTap(g)} className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><span className="material-symbols-outlined text-lg text-red-500">{g.icon || 'folder'}</span></div>
                      <span className="text-sm font-bold text-stone-800">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-600">{formatCurrency(getGroupTotal(g.id))}</span>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="space-y-2">
            {currentLevelGroups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => handleGroupTap(g)} className="bg-white rounded-2xl border border-stone-200/60 p-3.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", g.type === 'income' ? "bg-emerald-100" : "bg-red-100")}>
                    <span className={cn("material-symbols-outlined text-lg", g.type === 'income' ? "text-emerald-600" : "text-red-500")}>{g.icon || 'folder'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-stone-800">{g.name}</span>
                    {getChildren(g.id).length > 0 && <p className="text-[10px] text-stone-400">{getChildren(g.id).length} sub-categories</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", g.type === 'income' ? "text-emerald-700" : "text-red-600")}>{formatCurrency(getGroupTotal(g.id))}</span>
                  <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
