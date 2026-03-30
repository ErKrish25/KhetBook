import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';

type DateRange = 'month' | 'year' | 'all' | 'custom';

export default function Reports() {
  const { user } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRange>('year');
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Custom date range
  const now = new Date();
  const [customFrom, setCustomFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [customTo, setCustomTo] = useState(now.toISOString().split('T')[0]);

  useEffect(() => { fetchData(); }, [dateRange, customFrom, customTo]);

  const getDateRange = (): { from: string; to: string } => {
    const today = new Date();
    if (dateRange === 'month') {
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      };
    }
    if (dateRange === 'year') {
      return {
        from: new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      };
    }
    if (dateRange === 'custom') {
      return { from: customFrom, to: customTo };
    }
    return { from: '1970-01-01', to: today.toISOString().split('T')[0] };
  };

  const fetchData = async () => {
    setIsLoading(true);
    const { from, to } = getDateRange();
    const [{ data: g }, { data: v }] = await Promise.all([
      supabase.from('ledger_groups').select('*').eq('user_id', user?.id).order('name'),
      supabase.from('vouchers').select('*').eq('user_id', user?.id).gte('date', from).lte('date', to).order('date', { ascending: false }),
    ]);
    if (g) setGroups(g);
    if (v) setVouchers(v);
    setIsLoading(false);
  };

  // Tree helpers
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

  // Computations
  const totalIncome = useMemo(() =>
    groups.filter(g => g.type === 'income' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0),
    [groups, vouchers]
  );
  const totalExpense = useMemo(() =>
    groups.filter(g => g.type === 'expense' && !g.parent_id).reduce((s, g) => s + getGroupTotal(g.id), 0),
    [groups, vouchers]
  );
  const netProfit = totalIncome - totalExpense;
  const totalEntries = vouchers.length;

  // Sorted groups
  const topExpenseGroups = useMemo(() =>
    groups.filter(g => g.type === 'expense' && !g.parent_id)
      .map(g => ({ ...g, total: getGroupTotal(g.id) }))
      .sort((a, b) => b.total - a.total),
    [groups, vouchers]
  );

  const topIncomeGroups = useMemo(() =>
    groups.filter(g => g.type === 'income' && !g.parent_id)
      .map(g => ({ ...g, total: getGroupTotal(g.id) }))
      .sort((a, b) => b.total - a.total),
    [groups, vouchers]
  );

  // CSS donut segments
  const buildDonut = (items: { name: string; total: number; color: string }[]) => {
    const total = items.reduce((s, i) => s + i.total, 0);
    if (total === 0) return { segments: 'conic-gradient(#e7e5e4 0deg 360deg)', items: [] };
    let acc = 0;
    const stops: string[] = [];
    const enhanced = items.map(item => {
      const pct = (item.total / total) * 100;
      const start = acc;
      acc += pct;
      stops.push(`${item.color} ${start}% ${acc}%`);
      return { ...item, pct };
    });
    return { segments: `conic-gradient(${stops.join(', ')})`, items: enhanced };
  };

  const EXPENSE_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#8b5cf6', '#ec4899', '#78716c'];
  const INCOME_COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6'];

  const expenseDonut = buildDonut(topExpenseGroups.map((g, i) => ({ name: g.name, total: g.total, color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] })));
  const incomeDonut = buildDonut(topIncomeGroups.map((g, i) => ({ name: g.name, total: g.total, color: INCOME_COLORS[i % INCOME_COLORS.length] })));

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

  const { from: rangeFrom, to: rangeTo } = getDateRange();
  const rangeLabel = dateRange === 'month' ? 'This Month' : dateRange === 'year' ? 'This Year' : dateRange === 'all' ? 'All Time' : `${formatDate(customFrom)} — ${formatDate(customTo)}`;

  return (
    <div className="space-y-5 pb-8">
      {/* Date Range */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-full">
        {([
          { id: 'month' as DateRange, label: 'Month' },
          { id: 'year' as DateRange, label: 'Year' },
          { id: 'all' as DateRange, label: 'All' },
          { id: 'custom' as DateRange, label: 'Custom' },
        ]).map(range => (
          <button key={range.id} onClick={() => setDateRange(range.id)} className={cn("flex-1 py-2 rounded-full text-xs font-bold transition-all", dateRange === range.id ? "bg-[#1b4332] text-white shadow-sm" : "text-stone-500")}>{range.label}</button>
        ))}
      </div>

      {/* Custom Date Pickers */}
      {dateRange === 'custom' && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="grid grid-cols-2 gap-3 overflow-hidden">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1 block">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1 block">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
        </motion.div>
      )}

      {/* P&L Summary */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Profit & Loss</p>
          <span className="text-[9px] font-semibold text-white/40 bg-white/10 px-2 py-0.5 rounded-full">{rangeLabel}</span>
        </div>
        <h2 className="text-[34px] font-headline font-extrabold leading-tight">
          <span className="text-white/60 text-2xl mr-0.5">₹</span>{Math.abs(netProfit).toLocaleString('en-IN')}
          {netProfit < 0 && <span className="text-red-300 text-sm ml-1">(Loss)</span>}
        </h2>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-emerald-800/50 p-2.5 rounded-xl text-center">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Income</p>
            <p className="text-sm font-headline font-extrabold">₹{totalIncome.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-emerald-800/50 p-2.5 rounded-xl text-center">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Expense</p>
            <p className="text-sm font-headline font-extrabold">₹{totalExpense.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-emerald-800/50 p-2.5 rounded-xl text-center">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Entries</p>
            <p className="text-sm font-headline font-extrabold">{totalEntries}</p>
          </div>
        </div>
      </motion.section>

      {/* Expense Donut + Drill-down */}
      <section className="bg-white rounded-2xl border border-stone-200/60 p-4 shadow-sm">
        <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-red-400">pie_chart</span>
          Expense Breakdown
        </h4>
        <div className="flex items-center gap-5">
          <div className="relative w-28 h-28 shrink-0">
            <div className="w-full h-full rounded-full" style={{ background: expenseDonut.segments }} />
            <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
              <p className="text-[8px] font-bold text-stone-400 uppercase">Total</p>
              <p className="text-xs font-headline font-extrabold text-red-600">{formatCurrency(totalExpense)}</p>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {expenseDonut.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-semibold text-stone-600 truncate max-w-[100px]">{item.name}</span>
                </div>
                <span className="text-[10px] font-bold text-stone-800">{Math.round(item.pct)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          {topExpenseGroups.map((group, i) => {
            const pct = totalExpense > 0 ? Math.round((group.total / totalExpense) * 100) : 0;
            const isExpanded = expandedSection === `exp-${group.id}`;
            const children = getChildren(group.id);

            return (
              <div key={group.id}>
                <div
                  onClick={() => setExpandedSection(isExpanded ? null : `exp-${group.id}`)}
                  className="flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer hover:bg-stone-50 active:bg-stone-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm" style={{ color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}>{group.icon || 'folder'}</span>
                    <span className="text-xs font-bold text-stone-700">{group.name}</span>
                    {(children.length > 0 || vouchers.some(v => v.ledger_group_id === group.id)) && (
                      <span className="material-symbols-outlined text-stone-300 text-xs">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                    </div>
                    <span className="text-xs font-bold text-red-600 min-w-[60px] text-right">{formatCurrency(group.total)}</span>
                  </div>
                </div>

                {isExpanded && children.length > 0 && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="ml-6 space-y-1 overflow-hidden">
                    {children.map(child => {
                      const childTotal = getGroupTotal(child.id);
                      const childPct = group.total > 0 ? Math.round((childTotal / group.total) * 100) : 0;
                      const isChildExpanded = expandedSection === `tx-${child.id}`;
                      const childTxs = vouchers.filter(v => v.ledger_group_id === child.id);

                      return (
                        <div key={child.id}>
                          <div
                            onClick={() => setExpandedSection(isChildExpanded ? `exp-${group.id}` : `tx-${child.id}`)}
                            className="flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-stone-400 text-xs">{child.icon || 'subdirectory_arrow_right'}</span>
                              <span className="text-[10px] font-semibold text-stone-600">{child.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-stone-400">{childPct}%</span>
                              <span className="text-[10px] font-bold text-red-600">{formatCurrency(childTotal)}</span>
                            </div>
                          </div>

                          {isChildExpanded && childTxs.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-5 space-y-0.5 mb-2">
                              {childTxs.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between py-1 px-2 text-[9px]">
                                  <span className="text-stone-500 truncate max-w-[120px]">{tx.notes || child.name} • {formatDate(tx.date)}</span>
                                  <span className="font-bold text-red-600">{formatCurrency(tx.amount)}</span>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {/* Direct transactions (no children) */}
                {isExpanded && children.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-6 space-y-0.5 mb-2">
                    {vouchers.filter(v => v.ledger_group_id === group.id).map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-1 px-2 text-[9px]">
                        <span className="text-stone-500 truncate max-w-[120px]">{tx.notes || group.name} • {formatDate(tx.date)}</span>
                        <span className="font-bold text-red-600">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Income Donut + Drill-down */}
      <section className="bg-white rounded-2xl border border-stone-200/60 p-4 shadow-sm">
        <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-emerald-400">pie_chart</span>
          Income Breakdown
        </h4>
        <div className="flex items-center gap-5">
          <div className="relative w-28 h-28 shrink-0">
            <div className="w-full h-full rounded-full" style={{ background: incomeDonut.segments }} />
            <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
              <p className="text-[8px] font-bold text-stone-400 uppercase">Total</p>
              <p className="text-xs font-headline font-extrabold text-emerald-700">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {incomeDonut.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-semibold text-stone-600 truncate max-w-[100px]">{item.name}</span>
                </div>
                <span className="text-[10px] font-bold text-stone-800">{Math.round(item.pct)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          {topIncomeGroups.map((group, i) => {
            const pct = totalIncome > 0 ? Math.round((group.total / totalIncome) * 100) : 0;
            const isExpanded = expandedSection === `inc-${group.id}`;
            const txs = vouchers.filter(v => getAllDescendantIds(group.id).includes(v.ledger_group_id));

            return (
              <div key={group.id}>
                <div
                  onClick={() => setExpandedSection(isExpanded ? null : `inc-${group.id}`)}
                  className="flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer hover:bg-stone-50 active:bg-stone-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm" style={{ color: INCOME_COLORS[i % INCOME_COLORS.length] }}>{group.icon || 'folder'}</span>
                    <span className="text-xs font-bold text-stone-700">{group.name}</span>
                    {txs.length > 0 && <span className="material-symbols-outlined text-stone-300 text-xs">{isExpanded ? 'expand_less' : 'expand_more'}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: INCOME_COLORS[i % INCOME_COLORS.length] }} />
                    </div>
                    <span className="text-xs font-bold text-emerald-700 min-w-[60px] text-right">{formatCurrency(group.total)}</span>
                  </div>
                </div>

                {isExpanded && txs.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-6 space-y-0.5 mb-2">
                    {txs.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-1 px-2 text-[9px]">
                        <span className="text-stone-500 truncate max-w-[120px]">{tx.notes || group.name} • {formatDate(tx.date)}</span>
                        <span className="font-bold text-emerald-700">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {totalEntries === 0 && !isLoading && (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-4xl text-stone-200 mb-2 block">analytics</span>
          <p className="text-sm text-stone-400">No transactions in this period.</p>
        </div>
      )}
    </div>
  );
}
