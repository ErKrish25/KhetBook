import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { VoucherType, Party } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store';

interface AddVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialType: VoucherType;
}

export default function AddVoucherModal({ isOpen, onClose, onSuccess, initialType }: AddVoucherModalProps) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [formData, setFormData] = useState({
    voucher_no: '',
    type: initialType,
    date: new Date().toISOString().split('T')[0],
    party_id: '',
    amount: 0,
    payment_mode: 'Cash',
    notes: '',
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        voucher_no: '',
        type: initialType,
        date: new Date().toISOString().split('T')[0],
        party_id: '',
        amount: 0,
        payment_mode: 'Cash',
        notes: '',
      });
      fetchParties();
    }
  }, [isOpen, initialType]);

  const fetchParties = async () => {
    const { data } = await supabase.from('parties').select('id, name').eq('user_id', user?.id).order('name');
    if (data) setParties(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount <= 0) return;
    setLoading(true);

    const payload = {
      ...formData,
      user_id: user?.id,
      party_id: formData.party_id || null,
      voucher_no: formData.voucher_no || `VCH-${Date.now().toString().slice(-6)}`
    };

    const { data: voucherData, error } = await supabase.from('vouchers').insert([payload]).select().single();

    if (!error && voucherData) {
      // Create ledger entry
      if (formData.party_id) {
        const isSaleOrReceipt = formData.type === 'sale' || formData.type === 'receipt';
        await supabase.from('ledger_entries').insert({
          user_id: user?.id,
          voucher_id: voucherData.id,
          party_id: formData.party_id,
          amount: formData.amount,
          type: isSaleOrReceipt ? 'dr' : 'cr',
          description: `${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} — ${voucherData.voucher_no}`,
          date: formData.date,
        });
      }
      onSuccess();
      onClose();
    } else {
      alert('Error adding voucher: ' + (error?.message || 'Unknown error'));
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <h3 className="text-lg font-headline font-bold text-stone-800">
                New {formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}
              </h3>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Voucher No</label>
                  <input
                    type="text"
                    value={formData.voucher_no}
                    onChange={(e) => setFormData({ ...formData, voucher_no: e.target.value })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="Auto-generated"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Party</label>
                <select
                  value={formData.party_id}
                  onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                >
                  <option value="">Select Party (Optional)</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Amount *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Payment Mode</label>
                  <select
                    value={formData.payment_mode}
                    onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank</option>
                    <option value="UPI">UPI</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none h-20"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-stone-200 text-stone-500 rounded-xl text-sm font-bold hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-[#1b4332] text-white rounded-xl text-sm font-bold hover:bg-emerald-900 transition-colors shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Voucher'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
