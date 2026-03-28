import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PartyType, BalanceType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store';

interface AddPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultFormData = {
  name: '',
  type: 'customer' as PartyType,
  phone: '',
  opening_balance: 0,
  balance_type: 'dr' as BalanceType,
};

export default function AddPartyModal({ isOpen, onClose, onSuccess }: AddPartyModalProps) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ ...defaultFormData });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) setFormData({ ...defaultFormData });
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setLoading(true);

    const payload = { ...formData, user_id: user?.id };
    const { error } = await supabase.from('parties').insert([payload]);

    setLoading(false);
    if (!error) {
      onSuccess();
      onClose();
    } else {
      alert('Error adding party: ' + error.message);
    }
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
              <h3 className="text-lg font-headline font-bold text-stone-800">Add New Party</h3>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Party Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Enter party name"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as PartyType })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                  >
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Opening Balance</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.opening_balance || ''}
                    onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Balance Type</label>
                  <select
                    value={formData.balance_type}
                    onChange={(e) => setFormData({ ...formData, balance_type: e.target.value as BalanceType })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                  >
                    <option value="dr">Receivable (Dr)</option>
                    <option value="cr">Payable (Cr)</option>
                  </select>
                </div>
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
                  {loading ? 'Saving...' : 'Save Party'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
