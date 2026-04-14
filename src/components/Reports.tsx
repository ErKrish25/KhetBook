import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { LedgerGroup } from '../types';
import { buildLedgerTotals, getChildren as getChildrenFromMap } from '../lib/ledger';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { generateReport, type ReportScope } from '../lib/pdfReport';
import { toast } from '../lib/useToast';

type DateRange = 'month' | 'year' | 'all' | 'custom';

export default function Reports() {
  const { user } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRange>('year');
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // PDF modal state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [showLedgerPicker, setShowLedgerPicker] = useState(false);

  // Farm profile for PDF header
  const [farmProfile, setFarmProfile] = useState({
    name: 'Khetbook',
    owner_name: '',
    address: '',
    phone: '',
  });

  // Custom date range
  const now = new Date();
  const [customFrom, setCustomFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [customTo, setCustomTo] = useState(now.toISOString().split('T')[0]);

  useEffect(() => {
    if (!user?.id) {
      setGroups([]);
      setVouchers([]);
      setIsLoading(false);
      return;
    }

    fetchData();
    fetchFarmProfile();
  }, [dateRange, customFrom, customTo, user?.id]);

  const fetchFarmProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .maybeSingle();
    if (data) {
      setFarmProfile({
        name: data.farm_name || 'Khetbook',
        owner_name: data.owner_name || '',
        address: data.address || '',
        phone: data.phone || '',
      });
    }
  };

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
      supabase.from('ledger_groups').select('*').eq('user_id', user?.id).is('deleted_at', null).order('name'),
      supabase
        .from('vouchers')
        .select('id, type, amount, date, notes, ledger_group_id')
        .eq('user_id', user?.id)
        .is('deleted_at', null)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false }),
    ]);
    if (g) setGroups(g);
    if (v) setVouchers(v);
    setIsLoading(false);
  };

  const { childrenMap, totalsByGroupId, descendantIdsByGroupId } = useMemo(
    () => buildLedgerTotals(groups, vouchers),
    [groups, vouchers]
  );

  const getChildren = (parentId: string | null) => getChildrenFromMap(childrenMap, parentId);
  const getGroupTotal = (groupId: string) => totalsByGroupId.get(groupId) ?? 0;
  const getAllDescendantIds = (groupId: string) => descendantIdsByGroupId.get(groupId) ?? [groupId];

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

  // ============================================================================
  // PDF Generation Handlers
  // ============================================================================

  const handleGeneratePdf = async (scope: ReportScope, filteredGroupId?: string) => {
    setPdfGenerating(true);
    setShowPdfModal(false);
    setShowLedgerPicker(false);

    try {
      const { from, to } = getDateRange();

      // Fetch voucher_lines + items for quantity/unit display
      let voucherLines: any[] = [];
      let itemsData: any[] = [];

      if (vouchers.length > 0) {
        const voucherIds = vouchers.map(v => v.id);
        
        // Fetch voucher_lines for these vouchers
        const { data: lines } = await supabase
          .from('voucher_lines')
          .select('*')
          .in('voucher_id', voucherIds);

        if (lines) voucherLines = lines;

        // Fetch all items for this user
        const { data: items } = await supabase
          .from('items')
          .select('id, name, unit, category, rate')
          .eq('user_id', user?.id)
          .is('deleted_at', null);
        if (items) itemsData = items;
      }

      await generateReport({
        scope,
        dateRangeLabel: rangeLabel,
        dateFrom: from,
        dateTo: to,
        farmProfile,
        groups,
        vouchers,
        voucherLines,
        items: itemsData,
        filteredGroupId,
      });
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate PDF. Please try again.');
    }

    setPdfGenerating(false);
  };

  // All groups (parent + children) for the ledger picker
  const allGroupsForPicker = useMemo(() => {
    const result: { id: string; name: string; type: string; isChild: boolean; parentName?: string }[] = [];
    const topGroups = [...topExpenseGroups, ...topIncomeGroups];

    for (const group of topGroups) {
      result.push({ id: group.id, name: group.name, type: group.type, isChild: false });
      const children = getChildren(group.id);
      for (const child of children) {
        result.push({ id: child.id, name: child.name, type: child.type, isChild: true, parentName: group.name });
      }
    }

    return result;
  }, [topExpenseGroups, topIncomeGroups, childrenMap]);

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
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold text-white/40 bg-white/10 px-2 py-0.5 rounded-full">{rangeLabel}</span>
            {/* PDF Download Button */}
            <button
              id="pdf-download-btn"
              onClick={() => setShowPdfModal(true)}
              disabled={pdfGenerating || totalEntries === 0}
              className="flex items-center gap-1 bg-white/15 hover:bg-white/25 active:scale-95 px-2.5 py-1 rounded-full transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-sm text-white/90">picture_as_pdf</span>
              <span className="text-[9px] font-bold text-white/80">PDF</span>
            </button>
          </div>
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
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-red-400">pie_chart</span>
            Expense Breakdown
          </h4>
          {topExpenseGroups.length > 0 && (
            <button
              onClick={() => handleGeneratePdf('expense')}
              className="flex items-center gap-1 bg-red-50 hover:bg-red-100 active:scale-95 px-2 py-1 rounded-lg transition-all text-red-600"
              title="Download Expense PDF"
            >
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
              <span className="text-[9px] font-bold">PDF</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <div className="w-full h-full rounded-full" style={{ background: expenseDonut.segments }} />
            <div className="absolute inset-[18px] bg-white rounded-full flex items-center justify-center">
              <p className="text-[8px] font-bold text-stone-400 uppercase">Expense</p>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            {expenseDonut.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-medium text-stone-600 truncate">{item.name}</span>
                </div>
                <span className="text-[10px] font-bold text-stone-700 ml-2 shrink-0">{Math.round(item.pct)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 text-right">
          <span className="text-[10px] text-stone-400">Total: </span>
          <span className="text-sm font-headline font-extrabold text-red-600">{formatCurrency(totalExpense)}</span>
        </div>

        <div className="mt-4 space-y-1.5">
          {topExpenseGroups.map((group, i) => {
            const pct = totalExpense > 0 ? Math.round((group.total / totalExpense) * 100) : 0;
            const isExpanded = expandedSection === `exp-${group.id}`;
            const children = getChildren(group.id);

            return (
              <div key={group.id}>
                <div className="flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer hover:bg-stone-50 active:bg-stone-100 transition-colors group/row">
                  <div className="flex items-center gap-2 flex-1" onClick={() => setExpandedSection(isExpanded ? null : `exp-${group.id}`)}>
                    <span className="material-symbols-outlined text-sm" style={{ color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}>{group.icon || 'folder'}</span>
                    <span className="text-xs font-bold text-stone-700">{group.name}</span>
                    {(children.length > 0 || vouchers.some(v => v.ledger_group_id === group.id)) && (
                      <span className="material-symbols-outlined text-stone-300 text-xs">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Per-group PDF button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGeneratePdf('ledger', group.id); }}
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded hover:bg-stone-100 active:scale-90"
                      title={`Download ${group.name} report`}
                    >
                      <span className="material-symbols-outlined text-stone-400 text-xs">picture_as_pdf</span>
                    </button>
                    <span className="text-[9px] text-stone-400">{pct}%</span>
                    <span className="text-[10px] font-bold text-red-600 whitespace-nowrap">{formatCurrency(group.total)}</span>
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
                          <div className="flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors group/child">
                            <div className="flex items-center gap-2 flex-1" onClick={() => setExpandedSection(isChildExpanded ? `exp-${group.id}` : `tx-${child.id}`)}>
                              <span className="material-symbols-outlined text-stone-400 text-xs">{child.icon || 'subdirectory_arrow_right'}</span>
                              <span className="text-[10px] font-semibold text-stone-600">{child.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleGeneratePdf('ledger', child.id); }}
                                className="opacity-0 group-hover/child:opacity-100 transition-opacity p-0.5 rounded hover:bg-stone-100 active:scale-90"
                                title={`Download ${child.name} report`}
                              >
                                <span className="material-symbols-outlined text-stone-400 text-[10px]">picture_as_pdf</span>
                              </button>
                              <span className="text-[9px] text-stone-400">{childPct}%</span>
                              <span className="text-[10px] font-bold text-red-600 whitespace-nowrap">{formatCurrency(childTotal)}</span>
                            </div>
                          </div>

                          {isChildExpanded && childTxs.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-5 space-y-0.5 mb-2">
                              {childTxs.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between py-1 px-2 text-[9px]">
                                  <span className="text-stone-500 truncate max-w-[120px]">{tx.notes || child.name} • {formatDate(tx.date)}</span>
                                  <span className="font-bold text-red-600 whitespace-nowrap">{formatCurrency(tx.amount)}</span>
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
                        <span className="font-bold text-red-600 whitespace-nowrap">{formatCurrency(tx.amount)}</span>
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
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-headline font-bold text-stone-800 text-[13px] uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-emerald-400">pie_chart</span>
            Income Breakdown
          </h4>
          {topIncomeGroups.length > 0 && (
            <button
              onClick={() => handleGeneratePdf('income')}
              className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-2 py-1 rounded-lg transition-all text-emerald-700"
              title="Download Income PDF"
            >
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
              <span className="text-[9px] font-bold">PDF</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <div className="w-full h-full rounded-full" style={{ background: incomeDonut.segments }} />
            <div className="absolute inset-[18px] bg-white rounded-full flex items-center justify-center">
              <p className="text-[8px] font-bold text-stone-400 uppercase">Income</p>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            {incomeDonut.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-medium text-stone-600 truncate">{item.name}</span>
                </div>
                <span className="text-[10px] font-bold text-stone-700 ml-2 shrink-0">{Math.round(item.pct)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 text-right">
          <span className="text-[10px] text-stone-400">Total: </span>
          <span className="text-sm font-headline font-extrabold text-emerald-700">{formatCurrency(totalIncome)}</span>
        </div>

        <div className="mt-4 space-y-1.5">
          {topIncomeGroups.map((group, i) => {
            const pct = totalIncome > 0 ? Math.round((group.total / totalIncome) * 100) : 0;
            const isExpanded = expandedSection === `inc-${group.id}`;
            const txs = vouchers.filter(v => getAllDescendantIds(group.id).includes(v.ledger_group_id));

            return (
              <div key={group.id}>
                <div className="flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer hover:bg-stone-50 active:bg-stone-100 transition-colors group/row">
                  <div className="flex items-center gap-2 flex-1" onClick={() => setExpandedSection(isExpanded ? null : `inc-${group.id}`)}>
                    <span className="material-symbols-outlined text-sm" style={{ color: INCOME_COLORS[i % INCOME_COLORS.length] }}>{group.icon || 'folder'}</span>
                    <span className="text-xs font-bold text-stone-700">{group.name}</span>
                    {txs.length > 0 && <span className="material-symbols-outlined text-stone-300 text-xs">{isExpanded ? 'expand_less' : 'expand_more'}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGeneratePdf('ledger', group.id); }}
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded hover:bg-stone-100 active:scale-90"
                      title={`Download ${group.name} report`}
                    >
                      <span className="material-symbols-outlined text-stone-400 text-xs">picture_as_pdf</span>
                    </button>
                    <span className="text-[9px] text-stone-400">{pct}%</span>
                    <span className="text-[10px] font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(group.total)}</span>
                  </div>
                </div>

                {isExpanded && txs.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-6 space-y-0.5 mb-2">
                    {txs.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-1 px-2 text-[9px]">
                        <span className="text-stone-500 truncate max-w-[120px]">{tx.notes || group.name} • {formatDate(tx.date)}</span>
                        <span className="font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(tx.amount)}</span>
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

      {/* ============================================================================ */}
      {/* PDF Report Modal (Bottom Sheet) */}
      {/* ============================================================================ */}
      <AnimatePresence>
        {showPdfModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
              onClick={() => { setShowPdfModal(false); setShowLedgerPicker(false); }}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto pb-safe"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-stone-200 rounded-full" />
              </div>

              <div className="px-5 pb-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-headline font-bold text-stone-800">Download Report</h3>
                  <button
                    onClick={() => { setShowPdfModal(false); setShowLedgerPicker(false); }}
                    className="p-1 text-stone-400 hover:text-stone-600 active:scale-90 transition-all"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                </div>
                <p className="text-xs text-stone-400 mb-5">Choose a report type to generate a PDF for <strong>{rangeLabel}</strong></p>

                {/* Report Type Options */}
                {!showLedgerPicker ? (
                  <div className="space-y-2.5">
                    {/* Full P&L Report */}
                    <button
                      onClick={() => handleGeneratePdf('full')}
                      className="w-full flex items-center gap-3.5 p-4 bg-[#1b4332]/5 border-2 border-[#1b4332]/15 rounded-2xl active:scale-[0.98] transition-all text-left hover:border-[#1b4332]/30"
                    >
                      <div className="w-11 h-11 rounded-xl bg-[#1b4332] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-lg">summarize</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-stone-800">Full P&L Report</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">Income + Expense with complete ledger breakdown</p>
                      </div>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </button>

                    {/* Expense Report */}
                    <button
                      onClick={() => handleGeneratePdf('expense')}
                      className="w-full flex items-center gap-3.5 p-4 bg-red-50/60 border-2 border-red-100 rounded-2xl active:scale-[0.98] transition-all text-left hover:border-red-200"
                    >
                      <div className="w-11 h-11 rounded-xl bg-red-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-lg">trending_down</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-stone-800">Expense Report</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">All expenses grouped by category</p>
                      </div>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </button>

                    {/* Income Report */}
                    <button
                      onClick={() => handleGeneratePdf('income')}
                      className="w-full flex items-center gap-3.5 p-4 bg-emerald-50/60 border-2 border-emerald-100 rounded-2xl active:scale-[0.98] transition-all text-left hover:border-emerald-200"
                    >
                      <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-lg">trending_up</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-stone-800">Income Report</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">All income sources with details</p>
                      </div>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </button>

                    {/* Specific Ledger */}
                    <button
                      onClick={() => setShowLedgerPicker(true)}
                      className="w-full flex items-center gap-3.5 p-4 bg-blue-50/60 border-2 border-blue-100 rounded-2xl active:scale-[0.98] transition-all text-left hover:border-blue-200"
                    >
                      <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-lg">filter_list</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-stone-800">Specific Ledger</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">Pick a specific category or sub-category</p>
                      </div>
                      <span className="material-symbols-outlined text-stone-300">chevron_right</span>
                    </button>
                  </div>
                ) : (
                  /* ——— Ledger Picker ——— */
                  <div>
                    <button
                      onClick={() => setShowLedgerPicker(false)}
                      className="flex items-center gap-1 text-xs font-bold text-stone-500 mb-3 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                      Back
                    </button>

                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Select a ledger</p>

                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                      {allGroupsForPicker.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => handleGeneratePdf('ledger', g.id)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl active:scale-[0.98] transition-all text-left hover:bg-stone-50",
                            g.isChild ? "pl-8" : ""
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            g.type === 'expense' ? "bg-red-100" : "bg-emerald-100"
                          )}>
                            <span className={cn(
                              "material-symbols-outlined text-sm",
                              g.type === 'expense' ? "text-red-500" : "text-emerald-600"
                            )}>
                              {g.isChild ? 'subdirectory_arrow_right' : 'folder'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-stone-700">{g.name}</p>
                            {g.isChild && g.parentName && (
                              <p className="text-[9px] text-stone-400">under {g.parentName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "text-[10px] font-bold",
                              g.type === 'expense' ? "text-red-600" : "text-emerald-700"
                            )}>
                              {formatCurrency(getGroupTotal(g.id))}
                            </span>
                            <span className="material-symbols-outlined text-stone-300 text-sm">picture_as_pdf</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* PDF Generating Overlay */}
      <AnimatePresence>
        {pdfGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[80] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-[#1b4332] border-t-transparent rounded-full"
              />
              <p className="text-sm font-bold text-stone-700">Generating PDF...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
