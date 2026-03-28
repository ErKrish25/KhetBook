import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTransactionModal({ isOpen, transaction, onClose, onSaved }: EditTransactionModalProps) {
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (transaction) {
      setAmount(transaction.amount || 0);
      setDate(transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : '');
      setPaymentMode(transaction.payment_mode || 'Cash');
      setNotes(transaction.notes || '');
      setSaved(false);
    }
  }, [transaction]);

  const handleSave = async () => {
    if (!transaction) return;
    setSaving(true);

    const { error } = await supabase
      .from('vouchers')
      .update({
        amount,
        date,
        payment_mode: paymentMode,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    }
  };

  const typeLabels: Record<string, string> = {
    sale: 'Sale',
    purchase: 'Purchase',
    receipt: 'Receipt',
    payment: 'Payment',
  };

  if (!isOpen || !transaction) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[85vh] overflow-auto pb-safe"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-stone-200 rounded-full" />
            </div>

            <div className="px-5 pb-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-headline font-bold text-stone-800">Edit Transaction</h3>
                  <p className="text-xs text-stone-400">
                    #{transaction.voucher_no} • {typeLabels[transaction.type] || transaction.type}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 active:scale-90 transition-all"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Type Badge */}
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                  transaction.type === 'sale' ? "bg-emerald-100 text-emerald-700" :
                  transaction.type === 'purchase' ? "bg-red-100 text-red-600" :
                  transaction.type === 'receipt' ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {typeLabels[transaction.type] || transaction.type}
                </span>
                {transaction.payment_mode === 'Credit' && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 uppercase tracking-wider">
                    UDHAR
                  </span>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold">₹</span>
                  <input
                    type="number"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-xl py-3.5 pl-10 pr-4 text-xl font-bold text-stone-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all"
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Payment Mode</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Cash', 'UPI', 'Bank', 'Credit'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={cn(
                        "py-2.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95",
                        paymentMode === mode
                          ? "border-[#1b4332] bg-emerald-50 text-[#1b4332]"
                          : "border-stone-200 bg-white text-stone-500"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm font-medium text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all placeholder:text-stone-300"
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={saving || amount <= 0}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50",
                  saved
                    ? "bg-emerald-500 text-white shadow-emerald-500/30"
                    : "bg-[#1b4332] text-white shadow-emerald-900/20"
                )}
              >
                {saved ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    Saved!
                  </span>
                ) : saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
