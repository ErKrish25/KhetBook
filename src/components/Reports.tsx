import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';

type ReportView = 'summary' | 'daybook' | 'cashbook';
type DateRange = 'month' | 'year' | 'all';

export default function Reports() {
  const { user } = useAuthStore();
  const [activeView, setActiveView] = useState<ReportView>('summary');
  const [dateRange, setDateRange] = useState<DateRange>('year');
  const [reportData, setReportData] = useState({
    income: 0,
    expenses: 0,
    netProfit: 0,
    sales: 0,
    purchases: 0,
    receipts: 0,
    payments: 0,
    receivables: 0,
    payables: 0,
    stockValue: 0,
    cashInHand: 0,
    bankBalance: 0,
    transactions: [] as any[],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const getDateFilter = () => {
    const now = new Date();
    if (dateRange === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }
    if (dateRange === 'year') {
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }
    return '1970-01-01';
  };

  const fetchReportData = async () => {
    setIsLoading(true);
    const fromDate = getDateFilter();

    const { data: vouchers } = await supabase
      .from('vouchers')
      .select('*, parties(name)')
      .eq('user_id', user?.id)
      .gte('date', fromDate)
      .order('date', { ascending: false });

    const { data: parties } = await supabase
      .from('parties')
      .select('*')
      .eq('user_id', user?.id);

    const { data: items } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', user?.id);

    if (vouchers && parties && items) {
      let sales = 0, purchases = 0, receipts = 0, payments = 0;
      let cashInHand = 0, bankBalance = 0;

      vouchers.forEach(v => {
        if (v.type === 'sale') sales += v.amount;
        if (v.type === 'purchase') purchases += v.amount;
        if (v.type === 'receipt') {
          receipts += v.amount;
          if (v.payment_mode === 'Cash') cashInHand += v.amount;
          else bankBalance += v.amount;
        }
        if (v.type === 'payment') {
          payments += v.amount;
          if (v.payment_mode === 'Cash') cashInHand -= v.amount;
          else bankBalance -= v.amount;
        }
      });

      let receivables = 0, payables = 0;
      parties.forEach(p => {
        if (p.balance_type === 'dr') receivables += p.opening_balance;
        if (p.balance_type === 'cr') payables += p.opening_balance;
      });

      let stockValue = 0;
      items.forEach(i => { stockValue += (i.current_stock * (i.rate || 0)); });

      const income = sales + receipts;
      const expenses = purchases + payments;

      setReportData({
        sales, purchases, receipts, payments,
        income, expenses,
        netProfit: income - expenses,
        receivables, payables, stockValue,
        cashInHand, bankBalance,
        transactions: vouchers,
      });
    }
    setIsLoading(false);
  };

  const getTimeAgo = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Date Range Selector */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-full">
        {[
          { id: 'month' as DateRange, label: 'This Month' },
          { id: 'year' as DateRange, label: 'This Year' },
          { id: 'all' as DateRange, label: 'All Time' },
        ].map(range => (
          <button
            key={range.id}
            onClick={() => setDateRange(range.id)}
            className={cn(
              "flex-1 py-2 rounded-full text-sm font-bold transition-all",
              dateRange === range.id
                ? "bg-[#1b4332] text-white shadow-sm"
                : "text-stone-500"
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Profit & Loss Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1b4332] text-white p-5 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full"></div>
        <div className="absolute right-4 top-4 opacity-20">
          <span className="material-symbols-outlined text-4xl">monitoring</span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-1">Net Profit (Estimated)</p>
        <h2 className="text-[34px] font-headline font-extrabold leading-tight mb-4">
          <span className="text-white/60 text-2xl mr-0.5">₹</span>{reportData.netProfit.toLocaleString('en-IN')}
        </h2>

        <div className="space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-white/15">
            <span className="text-xs text-white/70">Total Income</span>
            <span className="text-sm font-bold">₹{reportData.income.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/70">Total Expense</span>
            <span className="text-sm font-bold">₹{reportData.expenses.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </motion.section>

      {/* Income / Expense Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Income</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-stone-500">Sales</span>
              <span className="text-sm font-bold text-stone-800">{formatCurrency(reportData.sales)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-stone-500">Receipts</span>
              <span className="text-sm font-bold text-stone-800">{formatCurrency(reportData.receipts)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-2">Expense</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-stone-500">Purchases</span>
              <span className="text-sm font-bold text-stone-800">{formatCurrency(reportData.purchases)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-stone-500">Payments</span>
              <span className="text-sm font-bold text-stone-800">{formatCurrency(reportData.payments)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Sheet */}
      <section>
        <h4 className="font-headline font-bold text-stone-800 text-[15px] mb-3">Balance Sheet</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Total Assets</p>
            <h4 className="text-lg font-headline font-extrabold text-emerald-700">
              {formatCurrency(reportData.stockValue + reportData.receivables + Math.max(0, reportData.cashInHand) + Math.max(0, reportData.bankBalance))}
            </h4>
            <p className="text-[10px] text-stone-400 mt-1">Stock + Receivable + Cash</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Total Liabilities</p>
            <h4 className="text-lg font-headline font-extrabold text-red-600">{formatCurrency(reportData.payables)}</h4>
            <p className="text-[10px] text-stone-400 mt-1">Total Payable</p>
          </div>
        </div>
      </section>

      {/* Report Views */}
      <section>
        <h4 className="font-headline font-bold text-stone-800 text-[15px] mb-3">Financial Reports</h4>
        <div className="flex gap-2 mb-4">
          {[
            { id: 'daybook' as ReportView, icon: 'menu_book', label: 'Day Book' },
            { id: 'cashbook' as ReportView, icon: 'account_balance', label: 'Cash & Bank' },
          ].map(report => (
            <button
              key={report.id}
              onClick={() => setActiveView(activeView === report.id ? 'summary' : report.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-1",
                activeView === report.id
                  ? "bg-[#1b4332] text-white shadow-sm"
                  : "bg-white text-stone-600 border border-stone-200"
              )}
            >
              <span className="material-symbols-outlined text-lg">{report.icon}</span>
              {report.label}
            </button>
          ))}
        </div>

        {/* Day Book View */}
        {activeView === 'daybook' && (
          <div className="space-y-2">
            {reportData.transactions.map(tx => {
              const isSale = tx.type === 'sale' || tx.type === 'receipt';
              return (
                <div key={tx.id} className="bg-white p-3.5 rounded-2xl border border-stone-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      isSale ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    )}>
                      <span className="material-symbols-outlined text-lg">
                        {tx.type === 'sale' ? 'trending_up' : tx.type === 'purchase' ? 'trending_down' : tx.type === 'receipt' ? 'receipt_long' : 'shopping_cart'}
                      </span>
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-stone-800">{tx.parties?.name || 'Cash'}</h5>
                      <p className="text-[10px] text-stone-400">
                        <span className="capitalize">{tx.type}</span> • {getTimeAgo(tx.date)} • {tx.payment_mode || 'Cash'}
                      </p>
                    </div>
                  </div>
                  <span className={cn("text-sm font-bold", isSale ? "text-emerald-700" : "text-red-600")}>
                    {isSale ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })}
            {reportData.transactions.length === 0 && (
              <p className="text-center text-sm text-stone-400 py-8">No transactions in this period.</p>
            )}
          </div>
        )}

        {/* Cash & Bank Book View */}
        {activeView === 'cashbook' && (
          <div className="space-y-3">
            {/* Cash Summary */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600">payments</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">Cash in Hand</p>
                  <p className="text-lg font-headline font-extrabold text-stone-800">
                    {formatCurrency(reportData.cashInHand)}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {reportData.transactions.filter(t => t.payment_mode === 'Cash').slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex justify-between items-center py-1 text-xs">
                    <span className="text-stone-500">{tx.parties?.name || 'Cash'} • {getTimeAgo(tx.date)}</span>
                    <span className={cn("font-bold", (tx.type === 'sale' || tx.type === 'receipt') ? "text-emerald-600" : "text-red-600")}>
                      {(tx.type === 'sale' || tx.type === 'receipt') ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank Summary */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">account_balance</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">Bank Balance</p>
                  <p className="text-lg font-headline font-extrabold text-stone-800">
                    {formatCurrency(reportData.bankBalance)}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {reportData.transactions.filter(t => t.payment_mode !== 'Cash').slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex justify-between items-center py-1 text-xs">
                    <span className="text-stone-500">{tx.parties?.name || 'Bank'} • {getTimeAgo(tx.date)}</span>
                    <span className={cn("font-bold", (tx.type === 'sale' || tx.type === 'receipt') ? "text-emerald-600" : "text-red-600")}>
                      {(tx.type === 'sale' || tx.type === 'receipt') ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
