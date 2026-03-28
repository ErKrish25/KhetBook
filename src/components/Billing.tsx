import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VoucherType, Party, Item } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store';
import ConfirmModal from './ConfirmModal';

type BillingView = 'list' | 'form';

const generateVoucherNo = () =>
  `KB-${new Date().getFullYear().toString().slice(-2)}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;

const defaultFormData = () => ({
  party_id: '',
  date: new Date().toISOString().split('T')[0],
  voucher_no: generateVoucherNo(),
  item_id: '',
  qty: 0,
  unit: 'KG',
  rate: 0,
  amount: 0,
  payment_mode: 'Cash',
  notes: '',
});

export default function Billing() {
  const { user } = useAuthStore();
  const [view, setView] = useState<BillingView>('list');
  const [activeType, setActiveType] = useState<VoucherType>('sale');
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState(defaultFormData());

  // Is this an item-based voucher or money-only?
  const isItemBased = activeType === 'sale' || activeType === 'purchase';
  const isMoneyOnly = activeType === 'receipt' || activeType === 'payment';

  useEffect(() => {
    fetchVouchers();
    fetchParties();
    fetchItems();
  }, [activeType]);

  const fetchVouchers = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('vouchers')
      .select('*, parties(name)')
      .eq('user_id', user?.id)
      .eq('type', activeType)
      .order('date', { ascending: false });

    if (data) setVouchers(data);
    setIsLoading(false);
  };

  const fetchParties = async () => {
    const { data } = await supabase.from('parties').select('*').eq('user_id', user?.id).order('name');
    if (data) setParties(data);
  };

  const fetchItems = async () => {
    const { data } = await supabase.from('items').select('*').eq('user_id', user?.id).order('name');
    if (data) setItems(data);
  };

  // Get the selected party's current balance for the form
  const selectedParty = parties.find(p => p.id === formData.party_id);
  const partyBalance = selectedParty ? selectedParty.opening_balance : 0;
  const partyBalanceType = selectedParty?.balance_type;

  const handleSubmit = async () => {
    setFormError('');

    // Validation
    if (!formData.party_id) { setFormError('Please select a party.'); return; }

    let amount = 0;

    if (isItemBased) {
      // Sale / Purchase: must have item, qty, rate
      if (!formData.item_id) { setFormError('Please select an item.'); return; }
      if (formData.qty <= 0) { setFormError('Quantity must be greater than 0.'); return; }
      if (formData.rate <= 0) { setFormError('Rate must be greater than 0.'); return; }
      amount = formData.qty * formData.rate;
    } else {
      // Receipt / Payment: must have a direct amount
      if (formData.amount <= 0) { setFormError('Amount must be greater than 0.'); return; }
      amount = formData.amount;
    }

    setSaving(true);

    // 1. Create voucher
    const payload = {
      user_id: user?.id,
      voucher_no: formData.voucher_no,
      type: activeType,
      date: formData.date,
      party_id: formData.party_id,
      amount,
      payment_mode: formData.payment_mode,
      notes: formData.notes,
    };

    const { data: voucherData, error: voucherError } = await supabase
      .from('vouchers')
      .insert([payload])
      .select()
      .single();

    if (voucherError || !voucherData) {
      setSaving(false);
      setFormError('Error saving: ' + (voucherError?.message || 'Unknown error'));
      return;
    }

    // 2. Create voucher_line only for Sale/Purchase
    if (isItemBased && formData.item_id) {
      await supabase.from('voucher_lines').insert({
        voucher_id: voucherData.id,
        item_id: formData.item_id,
        qty: formData.qty,
        rate: formData.rate,
        amount,
      });
    }

    // 3. Create ledger entry
    const isCreditEntry = activeType === 'sale' || activeType === 'receipt';
    await supabase.from('ledger_entries').insert({
      user_id: user?.id,
      voucher_id: voucherData.id,
      party_id: formData.party_id,
      amount,
      type: isCreditEntry ? 'dr' : 'cr',
      description: `${activeType.charAt(0).toUpperCase() + activeType.slice(1)} — ${formData.voucher_no}`,
      date: formData.date,
    });

    // 4. Update inventory stock (only for Sale/Purchase)
    if (activeType === 'sale' && formData.item_id) {
      const item = items.find(i => i.id === formData.item_id);
      if (item) {
        await supabase.from('items').update({
          current_stock: Math.max(0, item.current_stock - formData.qty)
        }).eq('id', formData.item_id);
      }
    } else if (activeType === 'purchase' && formData.item_id) {
      const item = items.find(i => i.id === formData.item_id);
      if (item) {
        await supabase.from('items').update({
          current_stock: item.current_stock + formData.qty
        }).eq('id', formData.item_id);
      }
    }

    // 5. Update party balance based on transaction type
    if (selectedParty) {
      let newBalance = selectedParty.opening_balance;
      let newBalanceType = selectedParty.balance_type;

      if (activeType === 'sale' && formData.payment_mode === 'Credit') {
        // Credit sale — party owes you more (increases Dr)
        if (newBalanceType === 'dr') {
          newBalance += amount;
        } else {
          // Party had Cr balance (you owed them), reduce it first
          newBalance -= amount;
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'dr';
          }
        }
      } else if (activeType === 'purchase' && formData.payment_mode === 'Credit') {
        // Credit purchase — you owe the party more (increases Cr)
        if (newBalanceType === 'cr') {
          newBalance += amount;
        } else {
          newBalance -= amount;
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'cr';
          }
        }
      } else if (activeType === 'receipt') {
        // Receipt — party pays you, reduces their Dr balance
        if (newBalanceType === 'dr') {
          newBalance -= amount;
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'cr';
          }
        } else {
          newBalance += amount;
        }
      } else if (activeType === 'payment') {
        // Payment — you pay the party, reduces your Cr obligation
        if (newBalanceType === 'cr') {
          newBalance -= amount;
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'dr';
          }
        } else {
          newBalance += amount;
        }
      }

      await supabase.from('parties').update({
        opening_balance: newBalance,
        balance_type: newBalanceType,
      }).eq('id', selectedParty.id);
    }

    setSaving(false);
    setFormData(defaultFormData());
    setFormError('');
    fetchVouchers();
    fetchItems();
    fetchParties();
    setView('list');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('vouchers').delete().eq('id', deleteId);
    if (!error) fetchVouchers();
    else alert('Error deleting voucher: ' + error.message);
    setDeleteId(null);
  };

  const openNewForm = () => {
    setFormData(defaultFormData());
    setFormError('');
    setView('form');
  };

  const computedAmount = isItemBased
    ? formData.qty * formData.rate
    : formData.amount;

  // Payment modes differ by type
  const paymentModes = isItemBased
    ? ['Cash', 'Bank', 'UPI', 'Credit']
    : ['Cash', 'Bank', 'UPI']; // Receipt/Payment are always against money, no credit

  const paymentModeIcons: Record<string, string> = {
    Cash: 'payments',
    Bank: 'account_balance',
    UPI: 'qr_code_2',
    Credit: 'schedule',
  };

  // For Receipt: show parties who owe you (Dr). For Payment: show parties you owe (Cr).
  const filteredParties = isMoneyOnly
    ? parties.filter(p => {
        if (activeType === 'receipt') return p.balance_type === 'dr' && p.opening_balance > 0;
        if (activeType === 'payment') return p.balance_type === 'cr' && p.opening_balance > 0;
        return true;
      })
    : parties;

  // ============================================
  // FORM VIEW
  // ============================================
  if (view === 'form') {
    return (
      <div className="space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between -mt-2">
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-stone-500 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="text-sm font-semibold">Back</span>
          </button>
          <div className={cn(
            "px-4 py-1.5 rounded-full border",
            computedAmount > 0 ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200"
          )}>
            <span className={cn("text-sm font-bold", computedAmount > 0 ? "text-emerald-700" : "text-stone-400")}>
              <span className={computedAmount > 0 ? "text-emerald-500" : "text-stone-300"}>₹</span>
              {computedAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Error */}
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            {formError}
          </div>
        )}

        {/* Voucher Type Chips */}
        <section className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              {isItemBased ? 'Invoice Details' : 'Transaction Details'}
            </h4>
            <span className="text-xs text-stone-400 font-medium">#{formData.voucher_no}</span>
          </div>

          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {[
              { id: 'sale', label: 'Sale', icon: 'trending_up' },
              { id: 'purchase', label: 'Purchase', icon: 'trending_down' },
              { id: 'receipt', label: 'Receipt', icon: 'call_received' },
              { id: 'payment', label: 'Payment', icon: 'call_made' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveType(t.id as VoucherType);
                  // Reset payment_mode when switching type
                  setFormData(prev => ({
                    ...prev,
                    payment_mode: t.id === 'receipt' || t.id === 'payment' ? 'Cash' : prev.payment_mode,
                    item_id: '',
                    qty: 0,
                    rate: 0,
                    amount: 0,
                  }));
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1",
                  activeType === t.id
                    ? "bg-[#1b4332] text-white"
                    : "bg-stone-100 text-stone-500"
                )}
              >
                <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Party Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">
              {activeType === 'sale' ? 'Buyer / Customer' :
               activeType === 'purchase' ? 'Seller / Supplier' :
               activeType === 'receipt' ? 'Receiving From' : 'Paying To'}
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 text-lg">person</span>
              <select
                value={formData.party_id}
                onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}
                className="w-full bg-white border border-stone-200 rounded-xl py-3 pl-10 pr-10 text-sm font-semibold text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Select Party</option>
                {filteredParties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.opening_balance > 0 ? ` (₹${p.opening_balance.toLocaleString('en-IN')} ${p.balance_type === 'dr' ? 'DR' : 'CR'})` : ''}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">expand_more</span>
            </div>

            {/* Party Outstanding Balance Indicator */}
            {selectedParty && selectedParty.opening_balance > 0 && (
              <div className={cn(
                "mt-2 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2",
                selectedParty.balance_type === 'dr'
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                  : "bg-red-50 text-red-600 border border-red-100"
              )}>
                <span className="material-symbols-outlined text-sm">info</span>
                Outstanding: ₹{selectedParty.opening_balance.toLocaleString('en-IN')}
                {selectedParty.balance_type === 'dr' ? ' receivable (they owe you)' : ' payable (you owe them)'}
              </div>
            )}
          </div>

          {/* Date & Inv No */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-white border border-stone-200 rounded-xl py-3 px-3 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Voucher No</label>
              <input
                type="text"
                value={formData.voucher_no}
                onChange={(e) => setFormData({ ...formData, voucher_no: e.target.value })}
                className="w-full bg-white border border-stone-200 rounded-xl py-3 px-3 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        </section>

        {/* Item Section — ONLY for Sale/Purchase */}
        {isItemBased && (
          <section className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
              {activeType === 'sale' ? 'Crop / Item to Sell' : 'Item to Purchase'}
            </h4>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Crop / Item</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 text-lg">eco</span>
                <select
                  value={formData.item_id}
                  onChange={(e) => {
                    const item = items.find(i => i.id === e.target.value);
                    setFormData({
                      ...formData,
                      item_id: e.target.value,
                      rate: item?.rate || formData.rate,
                      unit: item?.unit?.toUpperCase() || formData.unit,
                    });
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl py-3 pl-10 pr-10 text-sm font-semibold text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="">Select Item</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit})</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">expand_more</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">QTY</label>
                <div className="flex">
                  <input
                    type="number"
                    value={formData.qty || ''}
                    onChange={(e) => setFormData({ ...formData, qty: parseFloat(e.target.value) || 0 })}
                    className="flex-1 bg-white border border-stone-200 rounded-l-xl py-3 px-3 text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0"
                  />
                  <div className="px-3 py-3 bg-stone-50 border border-l-0 border-stone-200 rounded-r-xl flex items-center">
                    <span className="text-xs font-bold text-stone-600">{formData.unit}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Rate (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">₹</span>
                  <input
                    type="number"
                    value={formData.rate || ''}
                    onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-stone-200 rounded-xl py-3 pl-7 pr-3 text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Amount Section — ONLY for Receipt/Payment */}
        {isMoneyOnly && (
          <section className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
              {activeType === 'receipt' ? 'Amount Received' : 'Amount Paid'}
            </h4>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Amount (₹)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 text-lg font-bold">₹</span>
                <input
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl py-4 pl-10 pr-4 text-xl font-extrabold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="0"
                  autoFocus
                />
              </div>
            </div>

            {selectedParty && selectedParty.opening_balance > 0 && (
              <button
                onClick={() => setFormData({ ...formData, amount: selectedParty.opening_balance })}
                className="text-xs text-emerald-600 font-bold flex items-center gap-1 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-sm">auto_fix</span>
                Pay full outstanding (₹{selectedParty.opening_balance.toLocaleString('en-IN')})
              </button>
            )}
          </section>
        )}

        {/* Payment Mode & Notes */}
        <section className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Payment & Notes</h4>

          <div className="flex gap-2 flex-wrap">
            {paymentModes.map(mode => (
              <button
                key={mode}
                onClick={() => setFormData({ ...formData, payment_mode: mode })}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
                  formData.payment_mode === mode
                    ? mode === 'Credit'
                      ? "bg-amber-50 border-2 border-amber-500 text-amber-700"
                      : "bg-emerald-50 border-2 border-emerald-500 text-emerald-700"
                    : "bg-white border border-stone-200 text-stone-500"
                )}
              >
                <span className="material-symbols-outlined text-lg">
                  {paymentModeIcons[mode]}
                </span>
                {mode === 'Credit' ? 'Credit (Udhar)' : mode}
              </button>
            ))}
          </div>

          {formData.payment_mode === 'Credit' && isItemBased && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">info</span>
              {activeType === 'sale'
                ? "This amount will be added to the party's receivable (they owe you)."
                : "This amount will be added to your payable (you owe them)."}
            </div>
          )}

          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none h-16"
          />
        </section>

        {/* Save Button */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className={cn(
            "w-full py-4 text-white rounded-2xl font-bold text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50",
            formData.payment_mode === 'Credit'
              ? "bg-amber-600 shadow-amber-900/20"
              : "bg-[#1b4332] shadow-emerald-900/20"
          )}
        >
          {saving ? 'Saving...' : (
            formData.payment_mode === 'Credit'
              ? `Save ${activeType === 'sale' ? 'Sale' : 'Purchase'} on Credit`
              : `Save ${activeType.charAt(0).toUpperCase() + activeType.slice(1)}`
          )}
        </button>
      </div>
    );
  }

  // ============================================
  // LIST VIEW
  // ============================================
  return (
    <div className="space-y-5 pb-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-headline font-bold text-stone-800">Billing</h2>
          <p className="text-xs text-stone-400">Manage invoices, receipts & payments.</p>
        </div>
        <button
          onClick={openNewForm}
          className="bg-[#1b4332] text-white w-10 h-10 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {[
          { id: 'sale', label: 'Sales', icon: 'trending_up' },
          { id: 'purchase', label: 'Purchases', icon: 'trending_down' },
          { id: 'receipt', label: 'Receipts', icon: 'call_received' },
          { id: 'payment', label: 'Payments', icon: 'call_made' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveType(tab.id as VoucherType)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1.5",
              activeType === tab.id
                ? "bg-[#1b4332] text-white shadow-sm"
                : "bg-white text-stone-500 border border-stone-200"
            )}
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {vouchers.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Total ({activeType}s)</p>
            <p className="text-xl font-headline font-extrabold text-stone-800">
              {formatCurrency(vouchers.reduce((sum, v) => sum + v.amount, 0))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Count</p>
            <p className="text-xl font-headline font-extrabold text-stone-800">{vouchers.length}</p>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {vouchers.map((voucher, i) => {
            const isIncoming = activeType === 'sale' || activeType === 'receipt';
            const isCreditVoucher = voucher.payment_mode === 'Credit';
            return (
              <motion.div
                key={voucher.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl p-4 border border-stone-200/60 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center",
                    isIncoming ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                  )}>
                    <span className="material-symbols-outlined text-xl">
                      {activeType === 'sale' ? 'trending_up' : activeType === 'purchase' ? 'trending_down' : activeType === 'receipt' ? 'call_received' : 'call_made'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-800">{voucher.parties?.name || 'Cash'}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-stone-400 mt-0.5">
                      <span>#{voucher.voucher_no}</span>
                      <span>•</span>
                      <span>{new Date(voucher.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      {isCreditVoucher && (
                        <>
                          <span>•</span>
                          <span className="text-amber-600 font-bold">UDHAR</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1.5">
                  <span className={cn("font-bold text-sm", isIncoming ? "text-emerald-700" : "text-red-600")}>
                    {formatCurrency(voucher.amount)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(voucher.id); }}
                    className="text-stone-400 hover:text-red-500 transition-colors p-0.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {vouchers.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">receipt_long</span>
            </div>
            <p className="text-stone-400 font-medium text-sm">No {activeType}s found.</p>
            <button
              onClick={openNewForm}
              className="mt-3 text-emerald-600 text-sm font-bold active:scale-95 transition-transform"
            >
              Create your first {activeType} →
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Voucher"
        message="Are you sure you want to delete this voucher? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete"
      />
    </div>
  );
}
