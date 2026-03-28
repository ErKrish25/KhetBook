import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuthStore } from '../store';
import type { Tab } from '../App';

interface DashboardProps {
  onNavigate: (tab: Tab) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState({
    sales: 0,
    purchases: 0,
    receivable: 0,
    payable: 0,
    prevMonthSales: 0,
    totalItems: 0,
    lowStockCount: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    // Fetch all vouchers
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select('*')
      .eq('user_id', user?.id);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let sales = 0, purchases = 0, currentMonthSales = 0, prevMonthSales = 0;

    if (vouchers) {
      vouchers.forEach(v => {
        const vDate = new Date(v.date);
        if (v.type === 'sale') {
          sales += v.amount;
          if (vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear) {
            currentMonthSales += v.amount;
          }
          if (
            (currentMonth === 0 && vDate.getMonth() === 11 && vDate.getFullYear() === currentYear - 1) ||
            (currentMonth > 0 && vDate.getMonth() === currentMonth - 1 && vDate.getFullYear() === currentYear)
          ) {
            prevMonthSales += v.amount;
          }
        }
        if (v.type === 'purchase') purchases += v.amount;
      });
    }

    // Parties for receivable/payable
    const { data: parties } = await supabase.from('parties').select('*').eq('user_id', user?.id);
    let receivable = 0, payable = 0;
    if (parties) {
      parties.forEach(p => {
        if (p.balance_type === 'dr') receivable += p.opening_balance;
        if (p.balance_type === 'cr') payable += p.opening_balance;
      });
    }

    // Items for stock
    const { data: items } = await supabase.from('items').select('*').eq('user_id', user?.id);
    let totalItems = 0, lowStockCount = 0;
    const alerts: any[] = [];
    if (items) {
      totalItems = items.length;
      items.forEach(i => {
        if (i.current_stock <= (i.min_stock || 0)) {
          lowStockCount++;
          alerts.push(i);
        }
      });
    }
    setStockAlerts(alerts);

    setMetrics({
      sales: currentMonthSales || sales,
      purchases,
      receivable,
      payable,
      prevMonthSales,
      totalItems,
      lowStockCount,
    });

    // Recent transactions
    const { data: recent } = await supabase.from('vouchers')
      .select('*, parties(name)')
      .eq('user_id', user?.id)
      .order('date', { ascending: false })
      .limit(5);
    if (recent) setRecentTransactions(recent);
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

  const growthPercent = metrics.prevMonthSales > 0
    ? Math.round(((metrics.sales - metrics.prevMonthSales) / metrics.prevMonthSales) * 100)
    : 0;

  return (
    <div className="space-y-5 pb-8">
      {/* Hero: Total Sales (Monthly) */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/5 rounded-full"></div>
        <div className="absolute right-4 top-4 opacity-20">
          <span className="material-symbols-outlined text-5xl">monitoring</span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70 mb-1">Total Sales (This Month)</p>
        <h2 className="text-[34px] font-headline font-extrabold leading-tight">
          <span className="text-white/60 text-2xl mr-0.5">₹</span>{metrics.sales.toLocaleString('en-IN')}
        </h2>
        {growthPercent !== 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className={cn("material-symbols-outlined text-sm", growthPercent > 0 ? "text-emerald-300" : "text-red-300")}>
              {growthPercent > 0 ? 'trending_up' : 'trending_down'}
            </span>
            <span className={cn("text-xs font-medium", growthPercent > 0 ? "text-emerald-300" : "text-red-300")}>
              {Math.abs(growthPercent)}% from last month
            </span>
          </div>
        )}
      </motion.section>

      {/* Key Metrics — 2x2 Bento Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Purchases</p>
          <h3 className="text-xl font-headline font-extrabold text-stone-800">
            <span className="text-stone-400 text-sm mr-0.5">₹</span>{metrics.purchases.toLocaleString('en-IN')}
          </h3>
        </div>
        <div
          className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
          onClick={() => onNavigate('ledger')}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1.5">Receivable</p>
          <h3 className="text-xl font-headline font-extrabold text-emerald-700">
            <span className="text-emerald-400 text-sm mr-0.5">₹</span>{metrics.receivable.toLocaleString('en-IN')}
          </h3>
        </div>
      </div>

      {/* Payable Banner */}
      <div
        className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
        onClick={() => onNavigate('ledger')}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Total Payable</p>
          <h3 className="text-xl font-headline font-extrabold text-red-600">
            <span className="text-red-400 text-sm mr-0.5">₹</span>{metrics.payable.toLocaleString('en-IN')}
          </h3>
        </div>
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
          <span className="material-symbols-outlined text-red-400">content_paste</span>
        </div>
      </div>

      {/* Quick Actions — Farmer-focused */}
      <section>
        <h4 className="font-headline font-bold text-stone-700 text-sm mb-3">Quick Actions</h4>
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: 'point_of_sale', label: 'New Sale', action: () => onNavigate('billing'), bg: 'bg-emerald-900', iconColor: 'text-white' },
            { icon: 'call_received', label: 'Collect Payment', action: () => onNavigate('billing'), bg: 'bg-blue-100', iconColor: 'text-blue-600' },
            { icon: 'agriculture', label: 'Log Harvest', action: () => onNavigate('inventory'), bg: 'bg-amber-100', iconColor: 'text-amber-700' },
            { icon: 'assessment', label: 'Reports', action: () => onNavigate('reports'), bg: 'bg-stone-100', iconColor: 'text-stone-600' },
          ].map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", action.bg)}>
                <span className={cn("material-symbols-outlined text-xl", action.iconColor)}>{action.icon}</span>
              </div>
              <span className="text-[10px] font-semibold text-stone-500 text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Stock Overview Card */}
      <section
        className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
        onClick={() => onNavigate('inventory')}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-700 text-xl">inventory_2</span>
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">Stock Items</p>
            <p className="text-[10px] text-stone-400">{metrics.totalItems} items tracked</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {metrics.lowStockCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 bg-red-100 text-red-600 rounded-full">
              {metrics.lowStockCount} LOW
            </span>
          )}
          <span className="material-symbols-outlined text-stone-400">chevron_right</span>
        </div>
      </section>

      {/* Low Stock Alert */}
      {stockAlerts.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#2d2d2d] text-white p-5 rounded-2xl relative overflow-hidden"
        >
          <div className="absolute right-4 top-4">
            <span className="material-symbols-outlined text-amber-400 text-2xl">warning</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">Low Stock Alert</p>
          <div className="space-y-1.5">
            {stockAlerts.slice(0, 3).map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <span className="text-sm text-white/80">{item.name}</span>
                <span className="text-xs font-bold text-amber-400">{item.current_stock} {item.unit}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate('inventory')}
            className="mt-3 px-4 py-1.5 bg-red-500 text-white text-[11px] font-bold uppercase tracking-wider rounded-full active:scale-95 transition-transform"
          >
            Manage Stock
          </button>
        </motion.section>
      )}

      {/* Recent Transactions */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-headline font-bold text-stone-800 text-[15px]">Recent Transactions</h4>
          <button
            onClick={() => onNavigate('ledger')}
            className="text-xs text-emerald-600 font-bold active:scale-95 transition-transform"
          >
            See All →
          </button>
        </div>
        <div className="space-y-2">
          {recentTransactions.map((tx) => {
            const isIncoming = tx.type === 'sale' || tx.type === 'receipt';
            const isCreditVoucher = tx.payment_mode === 'Credit';
            const statusMap: Record<string, { label: string; color: string }> = {
              sale: { label: 'SALE', color: 'bg-emerald-100 text-emerald-700' },
              receipt: { label: 'RECEIVED', color: 'bg-blue-100 text-blue-700' },
              purchase: { label: 'PURCHASE', color: 'bg-amber-100 text-amber-700' },
              payment: { label: 'PAID', color: 'bg-red-100 text-red-600' },
            };
            const status = statusMap[tx.type] || statusMap.sale;

            return (
              <div key={tx.id} className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-stone-200/60">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-headline font-bold text-sm",
                    isIncoming ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                  )}>
                    {tx.parties?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-800">{tx.parties?.name || 'Cash'}</p>
                    <p className="text-[10px] text-stone-400">
                      {status.label}
                      {isCreditVoucher && ' · UDHAR'}
                      {' · '}{getTimeAgo(tx.date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-bold", isIncoming ? "text-emerald-700" : "text-red-600")}>
                    {isIncoming ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", status.color)}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
          {recentTransactions.length === 0 && (
            <div className="p-6 text-center text-sm text-stone-400 bg-white rounded-2xl border border-stone-200/60">
              No recent transactions. Create your first sale!
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
