import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { cn } from '../lib/utils';

export default function Settings() {
  const { user, role, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [farmDetails, setFarmDetails] = useState({
    name: '',
    address: '',
    phone: '',
    owner_name: ''
  });

  // Family PIN state
  const [farmPin, setFarmPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFarmDetails();
      if (role === 'owner') fetchFarmPin();
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

  const fetchFarmPin = async () => {
    const { data } = await supabase
      .from('farm_pins')
      .select('pin')
      .eq('owner_id', user?.id)
      .eq('is_active', true)
      .single();

    if (data) setFarmPin(data.pin);
  };

  const generatePin = async () => {
    setPinLoading(true);
    // Generate a random 6-digit PIN
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();

    // Deactivate any existing PINs for this owner
    await supabase
      .from('farm_pins')
      .update({ is_active: false })
      .eq('owner_id', user?.id);

    // Insert new PIN
    const { error } = await supabase
      .from('farm_pins')
      .insert({
        owner_id: user?.id,
        pin: newPin,
        farm_name: farmDetails.name || 'My Farm',
        is_active: true,
      });

    if (!error) {
      setFarmPin(newPin);
      setShowPin(true);
    } else {
      alert('Failed to generate PIN: ' + error.message);
    }
    setPinLoading(false);
  };

  const deactivatePin = async () => {
    await supabase
      .from('farm_pins')
      .update({ is_active: false })
      .eq('owner_id', user?.id);
    setFarmPin(null);
    setShowPin(false);
  };

  const copyPin = () => {
    if (farmPin) {
      navigator.clipboard.writeText(farmPin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
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

  const isOwner = role === 'owner';

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
          <span className="material-symbols-outlined text-3xl">
            {isOwner ? 'storefront' : 'group'}
          </span>
        </div>
        <h2 className="text-xl font-headline font-bold text-stone-800">{farmDetails.name || 'My Farm'}</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn(
            "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
            isOwner ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          )}>
            {isOwner ? 'Owner' : 'Family Member'}
          </span>
        </div>
        <p className="text-xs text-stone-400 mt-1">{user?.email}</p>
      </section>

      {/* Success Toast */}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          Settings saved successfully!
        </div>
      )}

      {/* ====== FAMILY PIN SECTION (Owner Only) ====== */}
      {isOwner && (
        <section>
          <h3 className="font-headline font-bold text-stone-800 text-[15px] mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-emerald-600">vpn_key</span>
            Family Access PIN
          </h3>

          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
            {farmPin ? (
              <>
                {/* Active PIN */}
                <div className="p-5">
                  <p className="text-xs text-stone-400 mb-3">
                    Share this PIN with your family members so they can login using the <strong>"Family"</strong> tab on the login screen.
                  </p>

                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Farm PIN</p>
                      <p className="text-3xl font-mono font-extrabold text-[#1b4332] tracking-[0.3em]">
                        {showPin ? farmPin : '● ● ● ● ● ●'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setShowPin(!showPin)}
                        className="p-2 bg-white rounded-lg border border-stone-200 text-stone-500 active:scale-95 transition-all"
                        title={showPin ? 'Hide' : 'Show'}
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showPin ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                      <button
                        onClick={copyPin}
                        className={cn(
                          "p-2 rounded-lg border active:scale-95 transition-all",
                          pinCopied
                            ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                            : "bg-white border-stone-200 text-stone-500"
                        )}
                        title="Copy"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {pinCopied ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-stone-100 p-4 flex gap-2">
                  <button
                    onClick={generatePin}
                    disabled={pinLoading}
                    className="flex-1 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    {pinLoading ? 'Generating...' : 'New PIN'}
                  </button>
                  <button
                    onClick={deactivatePin}
                    className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">block</span>
                    Disable Access
                  </button>
                </div>
              </>
            ) : (
              /* No Active PIN */
              <div className="p-5 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-stone-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-stone-400 text-xl">lock_open</span>
                </div>
                <p className="text-sm font-medium text-stone-600 mb-1">No Family PIN Active</p>
                <p className="text-xs text-stone-400 mb-4">
                  Generate a 6-digit PIN so your family members can securely access your farm data from their own phones.
                </p>
                <button
                  onClick={generatePin}
                  disabled={pinLoading}
                  className="px-6 py-3 bg-[#1b4332] text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                >
                  <span className="material-symbols-outlined text-base">vpn_key</span>
                  {pinLoading ? 'Generating...' : 'Generate Farm PIN'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Farm Details Form (Owner Only) */}
      {isOwner && (
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
      )}

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
