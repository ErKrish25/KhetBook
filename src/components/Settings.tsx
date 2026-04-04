import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { cn, formatCurrency } from '../lib/utils';
import { toast } from '../lib/useToast';
import { logAction } from '../lib/auditLog';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';

type SettingsView = 'main' | 'trash' | 'restore-preview';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [farmDetails, setFarmDetails] = useState({
    name: '',
    address: '',
    phone: '',
    owner_name: ''
  });



  // Backup state
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  // Restore state
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Trash state
  const [view, setView] = useState<SettingsView>('main');
  const [trashedVouchers, setTrashedVouchers] = useState<any[]>([]);
  const [trashedGroups, setTrashedGroups] = useState<any[]>([]);
  const [trashedItems, setTrashedItems] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFarmDetails();
      // Load last backup date from localStorage
      const stored = localStorage.getItem('khetbook_last_backup');
      if (stored) setLastBackupDate(stored);
    }
  }, [user]);

  const fetchFarmDetails = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (data) {
      setFarmDetails({
        name: data.farm_name || '',
        address: data.address || '',
        phone: data.phone || '',
        owner_name: data.owner_name || user?.email?.split('@')[0] || 'Owner'
      });
    } else {
      setFarmDetails({
        name: 'My Farm',
        address: '',
        phone: '',
        owner_name: user?.email?.split('@')[0] || 'Owner'
      });
    }
  };



  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user?.id,
        farm_name: farmDetails.name,
        address: farmDetails.address,
        phone: farmDetails.phone,
        owner_name: farmDetails.owner_name,
        updated_at: new Date().toISOString()
      });

    setLoading(false);
    if (!error) {
      setSaved(true);
      toast.success('Settings saved');
      setTimeout(() => setSaved(false), 3000);
    } else {
      toast.error('Error saving settings: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
  };

  // =============================================
  // BACKUP — Export all data as JSON
  // =============================================
  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const [
        { data: vouchers },
        { data: ledgerGroups },
        { data: items },
        { data: voucherLines },
        { data: inventoryLogs },
        { data: profiles },
      ] = await Promise.all([
        supabase.from('vouchers').select('*').eq('user_id', user?.id),
        supabase.from('ledger_groups').select('*').eq('user_id', user?.id),
        supabase.from('items').select('*').eq('user_id', user?.id),
        supabase.from('voucher_lines').select('*, vouchers!inner(user_id)').eq('vouchers.user_id', user?.id),
        supabase.from('inventory_logs').select('*').eq('user_id', user?.id),
        supabase.from('profiles').select('*').eq('id', user?.id),
      ]);

      const backup = {
        version: '1.0',
        app: 'khetbook',
        exportedAt: new Date().toISOString(),
        userId: user?.id,
        data: {
          profiles: profiles || [],
          ledger_groups: ledgerGroups || [],
          vouchers: vouchers || [],
          voucher_lines: (voucherLines || []).map(({ vouchers: _, ...rest }: any) => rest),
          items: items || [],
          inventory_logs: inventoryLogs || [],
        },
        counts: {
          profiles: (profiles || []).length,
          ledger_groups: (ledgerGroups || []).length,
          vouchers: (vouchers || []).length,
          voucher_lines: (voucherLines || []).length,
          items: (items || []).length,
          inventory_logs: (inventoryLogs || []).length,
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `khetbook-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const now = new Date().toISOString();
      localStorage.setItem('khetbook_last_backup', now);
      setLastBackupDate(now);
      toast.success('Backup downloaded successfully');
      logAction('create', 'backup', null, null, { counts: backup.counts });
    } catch (err) {
      toast.error('Failed to create backup');
    }
    setBackupLoading(false);
  };

  // =============================================
  // RESTORE — Import from JSON
  // =============================================
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data?.app || data.app !== 'khetbook') {
          toast.error('Invalid backup file. Please select a valid Khetbook backup.');
          return;
        }
        setRestorePreview(data);
        setView('restore-preview');
      } catch {
        toast.error('Could not read file. Make sure it\'s a valid JSON backup.');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!restorePreview?.data) return;
    setRestoreLoading(true);
    setShowRestoreConfirm(false);

    try {
      const d = restorePreview.data;

      // Upsert in order: profiles → ledger_groups → vouchers → voucher_lines → items → inventory_logs
      if (d.profiles?.length) {
        await supabase.from('profiles').upsert(d.profiles, { onConflict: 'id' });
      }
      if (d.ledger_groups?.length) {
        await supabase.from('ledger_groups').upsert(d.ledger_groups, { onConflict: 'id' });
      }
      if (d.vouchers?.length) {
        await supabase.from('vouchers').upsert(d.vouchers, { onConflict: 'id' });
      }
      if (d.voucher_lines?.length) {
        await supabase.from('voucher_lines').upsert(d.voucher_lines, { onConflict: 'id' });
      }
      if (d.items?.length) {
        await supabase.from('items').upsert(d.items, { onConflict: 'id' });
      }
      if (d.inventory_logs?.length) {
        await supabase.from('inventory_logs').upsert(d.inventory_logs, { onConflict: 'id' });
      }

      logAction('restore', 'backup', null, null, { counts: restorePreview.counts });
      toast.success('Data restored successfully!');
      setView('main');
      setRestorePreview(null);
    } catch (err) {
      toast.error('Restore failed. Please try again.');
    }
    setRestoreLoading(false);
  };

  // =============================================
  // TRASH — View and restore soft-deleted items
  // =============================================
  const fetchTrash = async () => {
    setTrashLoading(true);
    const [{ data: v }, { data: g }, { data: i }] = await Promise.all([
      supabase.from('vouchers').select('id, type, amount, date, notes, deleted_at').eq('user_id', user?.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('ledger_groups').select('id, name, type, icon, deleted_at').eq('user_id', user?.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('items').select('id, name, category, deleted_at').eq('user_id', user?.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ]);
    setTrashedVouchers(v || []);
    setTrashedGroups(g || []);
    setTrashedItems(i || []);
    setTrashLoading(false);
  };

  const restoreItem = async (table: string, id: string, label: string) => {
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id);
    if (error) {
      toast.error('Failed to restore: ' + error.message);
      return;
    }
    logAction('restore', table, id);
    toast.success(`"${label}" restored`);
    fetchTrash();
  };

  const permanentDelete = async (table: string, id: string, label: string) => {
    // For vouchers, also delete voucher_lines
    if (table === 'vouchers') {
      await supabase.from('voucher_lines').delete().eq('voucher_id', id);
    }
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      toast.error('Failed to permanently delete: ' + error.message);
      return;
    }
    toast.success(`"${label}" permanently deleted`);
    fetchTrash();
  };

  const getDaysLeft = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 15 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return daysLeft;
  };

  const getBackupAge = () => {
    if (!lastBackupDate) return null;
    const days = Math.floor((Date.now() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const settingsFields = [
    { key: 'name', label: 'Business Name', icon: 'business', placeholder: 'Enter business name' },
    { key: 'owner_name', label: 'Owner Name', icon: 'person', placeholder: 'Enter owner name' },
    { key: 'phone', label: 'Phone Number', icon: 'call', placeholder: 'Enter phone number', type: 'tel' },
    { key: 'address', label: 'Address', icon: 'location_on', placeholder: 'Enter address' },
  ];

  // =============================================
  // TRASH VIEW
  // =============================================
  if (view === 'trash') {
    const totalTrash = trashedVouchers.length + trashedGroups.length + trashedItems.length;

    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center gap-3 -mt-1">
          <button onClick={() => setView('main')} className="text-stone-500 active:scale-95">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h2 className="text-lg font-headline font-bold text-stone-800">Trash</h2>
          <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">{totalTrash}</span>
        </div>

        <p className="text-xs text-stone-400">Items in trash are auto-deleted after 15 days. Restore them to keep them.</p>

        {trashLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#1b4332] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalTrash === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-stone-200/60">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-emerald-600 text-2xl">check_circle</span>
            </div>
            <p className="text-sm font-medium text-stone-600">Trash is empty</p>
            <p className="text-xs text-stone-400 mt-1">No deleted items to show</p>
          </div>
        ) : (
          <>
            {/* Trashed Vouchers */}
            {trashedVouchers.length > 0 && (
              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">receipt_long</span>
                  Entries ({trashedVouchers.length})
                </h4>
                <div className="space-y-2">
                  {trashedVouchers.map(v => {
                    const isIncome = v.type === 'income' || v.type === 'sale';
                    const daysLeft = getDaysLeft(v.deleted_at);
                    return (
                      <div key={v.id} className="bg-white rounded-xl border border-stone-200/60 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", isIncome ? "bg-emerald-100" : "bg-red-100")}>
                              <span className={cn("material-symbols-outlined text-sm", isIncome ? "text-emerald-600" : "text-red-500")}>{isIncome ? 'trending_up' : 'trending_down'}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-stone-700">{v.notes || (isIncome ? 'Income' : 'Expense')}</p>
                              <p className="text-[10px] text-stone-400">{new Date(v.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {formatCurrency(v.amount)}</p>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{daysLeft}d left</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => restoreItem('vouchers', v.id, v.notes || 'Entry')} className="flex-1 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 flex items-center justify-center gap-1 active:scale-95">
                            <span className="material-symbols-outlined text-sm">restore</span>Restore
                          </button>
                          <button onClick={() => permanentDelete('vouchers', v.id, v.notes || 'Entry')} className="py-2 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold text-stone-400 active:scale-95">
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Trashed Groups */}
            {trashedGroups.length > 0 && (
              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">account_tree</span>
                  Categories ({trashedGroups.length})
                </h4>
                <div className="space-y-2">
                  {trashedGroups.map(g => {
                    const daysLeft = getDaysLeft(g.deleted_at);
                    return (
                      <div key={g.id} className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", g.type === 'income' ? "bg-emerald-100" : "bg-red-100")}>
                            <span className={cn("material-symbols-outlined text-sm", g.type === 'income' ? "text-emerald-600" : "text-red-500")}>{g.icon || 'folder'}</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-700">{g.name}</p>
                            <p className="text-[10px] text-stone-400 capitalize">{g.type} · {daysLeft}d left</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => restoreItem('ledger_groups', g.id, g.name)} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] font-bold text-emerald-700 active:scale-95">Restore</button>
                          <button onClick={() => permanentDelete('ledger_groups', g.id, g.name)} className="p-1.5 text-stone-300 active:scale-95">
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Trashed Items */}
            {trashedItems.length > 0 && (
              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">inventory_2</span>
                  Items ({trashedItems.length})
                </h4>
                <div className="space-y-2">
                  {trashedItems.map(i => {
                    const daysLeft = getDaysLeft(i.deleted_at);
                    return (
                      <div key={i.id} className="bg-white rounded-xl border border-stone-200/60 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-stone-500 text-sm">inventory_2</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-700">{i.name}</p>
                            <p className="text-[10px] text-stone-400 capitalize">{i.category} · {daysLeft}d left</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => restoreItem('items', i.id, i.name)} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] font-bold text-emerald-700 active:scale-95">Restore</button>
                          <button onClick={() => permanentDelete('items', i.id, i.name)} className="p-1.5 text-stone-300 active:scale-95">
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    );
  }

  // =============================================
  // RESTORE PREVIEW VIEW
  // =============================================
  if (view === 'restore-preview' && restorePreview) {
    const c = restorePreview.counts;
    return (
      <div className="space-y-5 pb-8">
        <div className="flex items-center gap-3 -mt-1">
          <button onClick={() => { setView('main'); setRestorePreview(null); }} className="text-stone-500 active:scale-95">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h2 className="text-lg font-headline font-bold text-stone-800">Restore Preview</h2>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-amber-600">warning</span>
            <p className="text-sm font-bold text-amber-800">Review before restoring</p>
          </div>
          <p className="text-xs text-amber-700">This backup was created on <strong>{new Date(restorePreview.exportedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>. Existing records with matching IDs will be overwritten.</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
          {[
            { label: 'Entries (Vouchers)', count: c.vouchers, icon: 'receipt_long' },
            { label: 'Categories', count: c.ledger_groups, icon: 'account_tree' },
            { label: 'Items', count: c.items, icon: 'inventory_2' },
            { label: 'Voucher Lines', count: c.voucher_lines, icon: 'list' },
            { label: 'Inventory Logs', count: c.inventory_logs, icon: 'history' },
          ].map((row, i, arr) => (
            <div key={row.label} className={`flex items-center justify-between p-3.5 ${i < arr.length - 1 ? 'border-b border-stone-100' : ''}`}>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-stone-400 text-lg">{row.icon}</span>
                <span className="text-sm font-medium text-stone-700">{row.label}</span>
              </div>
              <span className="text-sm font-bold text-stone-800">{row.count}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setView('main'); setRestorePreview(null); }} className="flex-1 py-3.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-sm active:scale-[0.98]">Cancel</button>
          <button onClick={() => setShowRestoreConfirm(true)} disabled={restoreLoading} className="flex-1 py-3.5 bg-[#1b4332] text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-base">restore</span>
            {restoreLoading ? 'Restoring...' : 'Restore Data'}
          </button>
        </div>

        <ConfirmModal
          isOpen={showRestoreConfirm}
          title="Restore Data?"
          message={`This will import ${c.vouchers} entries, ${c.ledger_groups} categories, and ${c.items} items. Existing records with matching IDs will be updated.`}
          onConfirm={handleRestore}
          onCancel={() => setShowRestoreConfirm(false)}
          confirmText="Yes, Restore"
        />
      </div>
    );
  }

  // =============================================
  // MAIN SETTINGS VIEW
  // =============================================
  const backupAge = getBackupAge();
  const showBackupWarning = backupAge === null || backupAge >= 7;

  return (
    <div className="space-y-6 pb-8">
      {/* Profile Section */}
      <section className="flex flex-col items-center mb-2">
        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 ring-4 ring-emerald-50">
          <span className="material-symbols-outlined text-3xl">storefront</span>
        </div>
        <h2 className="text-xl font-headline font-bold text-stone-800">{farmDetails.name || 'My Farm'}</h2>
        <p className="text-xs text-stone-400 mt-1">{user?.email}</p>
      </section>

      {/* Success Toast */}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          Settings saved successfully!
        </div>
      )}

      {/* ====== BACKUP & RESTORE SECTION ====== */}
      <section>
          <h3 className="font-headline font-bold text-stone-800 text-[15px] mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-blue-600">cloud_upload</span>
            Data Management
          </h3>

          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
            {/* Backup Warning Banner */}
            {showBackupWarning && (
              <div className={cn(
                "px-4 py-3 flex items-center gap-2 border-b",
                backupAge === null
                  ? "bg-red-50 border-red-100"
                  : backupAge >= 15
                    ? "bg-red-50 border-red-100"
                    : "bg-amber-50 border-amber-100"
              )}>
                <span className={cn("material-symbols-outlined text-lg", backupAge === null || backupAge >= 15 ? "text-red-500" : "text-amber-500")}>
                  {backupAge === null ? 'error' : 'warning'}
                </span>
                <p className={cn("text-xs font-medium flex-1", backupAge === null || backupAge >= 15 ? "text-red-700" : "text-amber-700")}>
                  {backupAge === null
                    ? "You've never backed up your data. Create a backup now!"
                    : `Last backup was ${backupAge} days ago. Consider backing up.`}
                </p>
              </div>
            )}

            {/* Export */}
            <button
              onClick={handleExportBackup}
              disabled={backupLoading}
              className="w-full p-4 flex items-center gap-3 active:bg-stone-50 transition-colors text-left border-b border-stone-100 disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-blue-600 text-lg">download</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-stone-800">{backupLoading ? 'Creating backup...' : 'Export Backup'}</p>
                <p className="text-[10px] text-stone-400">
                  {lastBackupDate
                    ? `Last: ${new Date(lastBackupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Download all data as JSON'}
                </p>
              </div>
              <span className="material-symbols-outlined text-stone-300">chevron_right</span>
            </button>

            {/* Import */}
            <label className="w-full p-4 flex items-center gap-3 active:bg-stone-50 transition-colors text-left border-b border-stone-100 cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-amber-600 text-lg">upload</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-stone-800">Restore from Backup</p>
                <p className="text-[10px] text-stone-400">Import a previously exported JSON file</p>
              </div>
              <span className="material-symbols-outlined text-stone-300">chevron_right</span>
              <input type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
            </label>

            {/* Trash */}
            <button
              onClick={() => { setView('trash'); fetchTrash(); }}
              className="w-full p-4 flex items-center gap-3 active:bg-stone-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-500 text-lg">delete</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-stone-800">View Trash</p>
                <p className="text-[10px] text-stone-400">Restore or permanently delete items</p>
              </div>
              <span className="material-symbols-outlined text-stone-300">chevron_right</span>
            </button>
          </div>
        </section>


      {/* Farm Details Form */}
      <section>
          <h3 className="font-headline font-bold text-stone-800 text-[15px] mb-3">Farm Details</h3>
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
            {settingsFields.map((field, i) => (
              <div key={field.key} className={`p-4 ${i < settingsFields.length - 1 ? 'border-b border-stone-100' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-stone-400 text-lg">{field.icon}</span>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{field.label}</label>
                </div>
                <input
                  type={field.type || 'text'}
                  value={(farmDetails as any)[field.key]}
                  onChange={(e) => setFarmDetails({ ...farmDetails, [field.key]: e.target.value })}
                  className="w-full bg-transparent text-sm font-medium text-stone-800 outline-none placeholder:text-stone-300"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <div className="p-4 border-t border-stone-100">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1b4332] text-white rounded-xl font-bold text-sm shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </section>

      {/* Preferences */}
      <section>
        <h3 className="font-headline font-bold text-stone-800 text-[15px] mb-3">Preferences</h3>
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-stone-400">language</span>
              <span className="text-sm font-bold text-stone-800">Language</span>
            </div>
            <span className="text-sm text-stone-500 font-medium">English</span>
          </div>

          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-stone-400">notifications</span>
              <span className="text-sm font-bold text-stone-800">Notifications</span>
            </div>
            <div className="w-10 h-6 bg-[#1b4332] rounded-full relative cursor-pointer">
              <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1"></div>
            </div>
          </div>

          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-stone-400">info</span>
              <span className="text-sm font-bold text-stone-800">App Version</span>
            </div>
            <span className="text-sm text-stone-400 font-medium">1.0.0</span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full p-4 flex items-center gap-3 text-red-500 active:bg-red-50 transition-colors text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-sm font-bold">Logout</span>
          </button>
        </div>
      </section>
    </div>
  );
}
