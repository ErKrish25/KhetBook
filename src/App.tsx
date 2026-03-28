import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import khetbookIcon from './assets/khetbook-icon.png';

// Components
import Dashboard from './components/Dashboard';
import Billing from './components/Billing';
import Ledger from './components/Ledger';
import Inventory from './components/Inventory';
import Reports from './components/Reports';
import Auth from './components/Auth';
import Settings from './components/Settings';

export type Tab = 'dashboard' | 'billing' | 'ledger' | 'inventory' | 'reports' | 'settings';

export default function App() {
  const { user, role, member, setUser, setRole, setMember, setOwnerId, isLoading, setLoading, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const u = session.user;
        setUser(u);
        // Check if this is a family member by looking at user_metadata
        const meta = u.user_metadata;
        if (meta?.role === 'family_member' && meta?.owner_id) {
          setRole('family_member');
          setOwnerId(meta.owner_id);
        } else {
          setRole('owner');
          setOwnerId(u.id);
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const u = session.user;
        setUser(u);
        const meta = u.user_metadata;
        if (meta?.role === 'family_member' && meta?.owner_id) {
          setRole('family_member');
          setOwnerId(meta.owner_id);
        } else {
          setRole('owner');
          setOwnerId(u.id);
        }
      } else {
        setUser(null);
        setRole(null);
        setMember(null);
        setOwnerId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-6 h-6 border-2 border-[#1b4332] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user && !member) {
    return <Auth />;
  }

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Home', roles: ['owner', 'family_member'] },
    { id: 'billing', icon: 'receipt_long', label: 'Billing', roles: ['owner', 'family_member'] },
    { id: 'ledger', icon: 'menu_book', label: 'Ledger', roles: ['owner', 'family_member'] },
    { id: 'inventory', icon: 'inventory_2', label: 'Stock', roles: ['owner', 'family_member'] },
    { id: 'reports', icon: 'assessment', label: 'Reports', roles: ['owner'] },
  ].filter(item => item.roles.includes(role || ''));

  return (
    <div className="min-h-screen bg-[#fafaf9] text-stone-800 font-body pb-24">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md flex justify-between items-center px-5 h-14 border-b border-stone-100 pt-safe">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 flex items-center justify-center">
            <img alt="Khetbook" className="w-full h-full object-contain" src={khetbookIcon} />
          </div>
          <h1 className="font-headline font-extrabold text-[#1b4332] text-lg tracking-tight">
            Khetbook
          </h1>
        </div>
        <button
          onClick={() => setActiveTab('settings')}
          className="text-stone-400 hover:text-stone-600 transition-colors active:scale-95 duration-200 p-1"
        >
          <span className="material-symbols-outlined text-[22px]">settings</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="pt-16 px-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
            {activeTab === 'billing' && <Billing />}
            {activeTab === 'ledger' && <Ledger />}
            {activeTab === 'inventory' && <Inventory />}
            {activeTab === 'reports' && <Reports />}
            {activeTab === 'settings' && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 w-full z-50 pb-safe bg-white border-t border-stone-100 flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-3 active:scale-90 duration-200 transition-all min-w-[56px]",
                isActive ? "text-[#1b4332]" : "text-stone-400"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-10 h-7 rounded-full transition-all mb-0.5",
                isActive && "bg-emerald-100"
              )}>
                <span
                  className={cn(
                    "material-symbols-outlined text-[20px]",
                    isActive && "fill-icon"
                  )}
                >
                  {item.icon}
                </span>
              </div>
              <span className={cn(
                "text-[10px] uppercase tracking-wider font-semibold",
                isActive && "font-bold"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
