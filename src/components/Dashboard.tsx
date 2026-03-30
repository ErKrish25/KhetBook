import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuthStore } from '../store';
import { LedgerGroup } from '../types';
import type { Tab } from '../App';

interface DashboardProps {
  onNavigate: (tab: Tab) => void;
  onEditTransaction: (tx: any) => void;
  onSetAddType: (type: 'income' | 'expense') => void;
  refreshKey?: number;
}

// Default ledger groups to seed for new users
const DEFAULT_GROUPS = [
  // Income
  { name: 'Crop Sales', type: 'income', icon: 'eco', parent: null },
  { name: 'Labour Income', type: 'income', icon: 'engineering', parent: null },
  { name: 'Other Income', type: 'income', icon: 'more_horiz', parent: null },
  // Expense top-level
  { name: 'Labour', type: 'expense', icon: 'engineering', parent: null, children: [
    { name: 'Cutting Labour', icon: 'content_cut' },
    { name: 'Plowing Labour', icon: 'agriculture' },
    { name: 'Harvest Labour', icon: 'grass' },
  ]},
  { name: 'Seeds & Fertilizer', type: 'expense', icon: 'spa', parent: null },
  { name: 'Fuel & Transport', type: 'expense', icon: 'local_gas_station', parent: null },
  { name: 'Equipment Repair', type: 'expense', icon: 'build', parent: null },
  { name: 'Irrigation', type: 'expense', icon: 'water_drop', parent: null },
  { name: 'Rent & Land', type: 'expense', icon: 'landscape', parent: null },
  { name: 'Other Expense', type: 'expense', icon: 'receipt_long', parent: null },
];

export default function Dashboard({ onNavigate, onEditTransaction, onSetAddType, refreshKey }: DashboardProps) {
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    thisMonthIncome: 0,
    thisMonthExpense: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    seedDefaultGroupsIfNeeded().then(() => {
      fetchDashboardData();
    });
  }, [refreshKey]);

  const seedDefaultGroupsIfNeeded = async () => {
    const { data: existing } = await supabase
      .from('ledger_groups')
      .select('id')
      .eq('user_id', user?.id)
      .limit(1);

    if (existing && existing.length > 0) return; // Already seeded

    // Seed top-level groups
    for (const group of DEFAULT_GROUPS) {
      const { data: parent } = await supabase
        .from('ledger_groups')
        .insert({
          user_id: user?.id,
          name: group.name,
          type: group.type,
          parent_id: null,
          icon: group.icon,
        })
        .select('id')
        .single();

      // Seed children if any
      if (parent && 'children' in group && group.children) {
        for (const child of group.children) {
          await supabase.from('ledger_groups').insert({
            user_id: user?.id,
            name: child.name,
            type: group.type,
            parent_id: parent.id,
            icon: child.icon,
          });
        }
      }
    }
    setSeeded(true);
  };

  const fetchDashboardData = async () => {
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select('*, ledger_groups(name)')
      .eq('user_id', user?.id)
      .order('date', { ascending: false });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalIncome = 0, totalExpense = 0;
    let thisMonthIncome = 0, thisMonthExpense = 0;

    if (vouchers) {
      vouchers.forEach(v => {
        const vDate = new Date(v.date);
        const isThisMonth = vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear;

        if (v.type === 'income' || v.type === 'sale') {
          totalIncome += v.amount;
          if (isThisMonth) thisMonthIncome += v.amount;
        } else {
          totalExpense += v.amount;
          if (isThisMonth) thisMonthExpense += v.amount;
        }
      });

      setRecentTransactions(vouchers.slice(0, 8));
    }

    setMetrics({
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      thisMonthIncome,
      thisMonthExpense,
    });
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-5 pb-8">
      {/* Net Profit Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
        <div className="absolute right-4 top-4 opacity-20">
          <span className="material-symbols-outlined text-4xl">monitoring</span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Net Profit</p>
        <h2 className="text-[34px] font-headline font-extrabold leading-tight mb-4">
          <span className="text-white/60 text-2xl mr-0.5">₹</span>
          {Math.abs(metrics.netProfit).toLocaleString('en-IN')}
          {metrics.netProfit < 0 && <span className="text-red-300 text-sm ml-1">(Loss)</span>}
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-800/50 backdrop-blur-sm p-3 rounded-xl">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Income</p>
            <p className="text-lg font-headline font-extrabold">
              <span className="text-white/50 text-xs mr-0.5">₹</span>{metrics.totalIncome.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-emerald-800/50 backdrop-blur-sm p-3 rounded-xl">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60 mb-1">Expense</p>
            <p className="text-lg font-headline font-extrabold">
              <span className="text-white/50 text-xs mr-0.5">₹</span>{metrics.totalExpense.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </motion.section>

      {/* This Month */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">This Month Income</p>
          <p className="text-lg font-headline font-extrabold text-stone-800">{formatCurrency(metrics.thisMonthIncome)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">This Month Expense</p>
          <p className="text-lg font-headline font-extrabold text-stone-800">{formatCurrency(metrics.thisMonthExpense)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <section>
        <h4 className="font-headline font-bold text-stone-800 text-[15px] mb-3">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSetAddType('income')}
            className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.97] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-700">trending_up</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-emerald-800">+ Income</p>
              <p className="text-[10px] text-emerald-600">Add Sale</p>
            </div>
          </button>
          <button
            onClick={() => onSetAddType('expense')}
            className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.97] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-600">trending_down</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-red-700">+ Expense</p>
              <p className="text-[10px] text-red-500">Add Cost</p>
            </div>
          </button>
        </div>
      </section>

      {/* Recent Transactions */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-headline font-bold text-stone-800 text-[15px]">Recent Entries</h4>
          {recentTransactions.length > 0 && (
            <button onClick={() => onNavigate('reports')} className="text-xs font-bold text-emerald-600">View All →</button>
          )}
        </div>
        {recentTransactions.length > 0 ? (
          <div className="space-y-2">
            {recentTransactions.map(tx => {
              const isIncome = tx.type === 'income' || tx.type === 'sale';
              return (
                <div key={tx.id} onClick={() => onEditTransaction(tx)} className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      isIncome ? "bg-emerald-100" : "bg-red-100"
                    )}>
                      <span className={cn(
                        "material-symbols-outlined text-lg",
                        isIncome ? "text-emerald-700" : "text-red-600"
                      )}>
                        {isIncome ? 'trending_up' : 'trending_down'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-800">
                        {tx.notes || (tx.ledger_groups ? tx.ledger_groups.name : (isIncome ? 'Income' : 'Expense'))}
                      </p>
                      <p className="text-[10px] text-stone-400">{formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-sm font-bold",
                    isIncome ? "text-emerald-700" : "text-red-600"
                  )}>
                    {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-white rounded-2xl border border-stone-200/60">
            <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">receipt_long</span>
            </div>
            <p className="text-stone-400 text-sm font-medium">No entries yet.</p>
            <button onClick={() => onSetAddType('expense')} className="mt-2 text-emerald-600 text-sm font-bold">
              Add your first entry →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
