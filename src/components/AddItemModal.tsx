import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ItemCategory, Unit } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store';
import { getUnitInsertCandidates, ITEM_UNIT_OPTIONS, normalizeItemUnit } from '../lib/itemUnits';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultFormData = {
  name: '',
  category: 'crop' as ItemCategory,
  unit: 'kg' as Unit,
  current_stock: 0,
  min_stock: 0,
  rate: 0,
};

export default function AddItemModal({ isOpen, onClose, onSuccess }: AddItemModalProps) {
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

    const unitCandidates = getUnitInsertCandidates(formData.unit);
    let error = null;

    for (const unit of unitCandidates) {
      const payload = { ...formData, unit: normalizeItemUnit(unit), user_id: user?.id };
      const result = await supabase.from('items').insert([{
        ...payload,
        unit: unit as Unit,
      }]);

      if (!result.error) {
        error = null;
        break;
      }

      error = result.error;

      if (!result.error.message.toLowerCase().includes('unit_check')) {
        break;
      }
    }

    setLoading(false);
    if (!error) {
      // Log the addition
      onSuccess();
      onClose();
    } else {
      alert('Error adding item: ' + error.message);
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
              <h3 className="text-lg font-headline font-bold text-stone-800">Add New Item</h3>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Item Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g. Wheat, Fertilizer, Diesel"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                  >
                    <option value="crop">Crop</option>
                    <option value="fertilizer">Fertilizer</option>
                    <option value="seed">Seed</option>
                    <option value="pesticide">Pesticide</option>
                    <option value="medicine">Medicine</option>
                    <option value="feed">Feed</option>
                    <option value="dairy">Dairy</option>
                    <option value="labour">Labour</option>
                    <option value="fuel">Fuel</option>
                    <option value="equipment">Equipment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: normalizeItemUnit(e.target.value) })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                  >
                    {ITEM_UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Current Stock</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.current_stock || ''}
                    onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Min Stock Alert</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.min_stock || ''}
                    onChange={(e) => setFormData({ ...formData, min_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Rate / Price (₹)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.rate || ''}
                    onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="0.00"
                  />
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
                  {loading ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
