import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

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

  useEffect(() => {
    if (user) fetchFarmDetails();
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
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert('Error saving settings: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
  };

  const settingsFields = [
    { key: 'name', label: 'Business Name', icon: 'business', placeholder: 'Enter business name' },
    { key: 'owner_name', label: 'Owner Name', icon: 'person', placeholder: 'Enter owner name' },
    { key: 'phone', label: 'Phone Number', icon: 'call', placeholder: 'Enter phone number', type: 'tel' },
    { key: 'address', label: 'Address', icon: 'location_on', placeholder: 'Enter address' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Profile Section */}
      <section className="flex flex-col items-center mb-2">
        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 ring-4 ring-emerald-50">
          <span className="material-symbols-outlined text-3xl">storefront</span>
        </div>
        <h2 className="text-xl font-headline font-bold text-stone-800">{farmDetails.name || 'My Farm'}</h2>
        <p className="text-xs text-stone-400 mt-0.5">{user?.email}</p>
      </section>

      {/* Success Toast */}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          Settings saved successfully!
        </div>
      )}

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
