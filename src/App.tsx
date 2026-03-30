import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store';
import { motion, AnimatePresence } from 'motion/react';
import { useSwipeable } from 'react-swipeable';
import { cn } from './lib/utils';
import khetbookIcon from './assets/khetbook-icon.png';

// Components
import Dashboard from './components/Dashboard';
import AddEntry from './components/AddEntry';
import EditEntry from './components/EditEntry';
import Ledger from './components/Ledger';
import Reports from './components/Reports';
import Auth from './components/Auth';
import Settings from './components/Settings';
import FamilyHome from './components/FamilyHome';

export type Tab = 'dashboard' | 'add' | 'ledger' | 'reports' | 'settings';

export default function App() {
  const { user, member, role, setUser, setMember, setRole, setOwnerId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isLoading, setLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addEntryType, setAddEntryType] = useState<'income' | 'expense'>('expense');

  const restoreAuthState = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
    const isFamily = localStorage.getItem('khetbook_family_session') === 'true';
    const familyPinData = localStorage.getItem('khetbook_family_pin');

    if (!session) {
      setUser(null);
      setMember(null);
      setRole(null);
      setOwnerId(null);
      localStorage.removeItem('khetbook_family_session');
      return;
    }

    setUser(session.user);
    setMember(null);

    if (isFamily && familyPinData) {
      try {
        const parsed = JSON.parse(familyPinData);
        if (parsed?.ownerId) {
          setRole('family_member');
          setOwnerId(parsed.ownerId);
          return;
        }
      } catch {
        // fall back
      }
      localStorage.removeItem('khetbook_family_session');
    }

    setRole('owner');
    setOwnerId(session.user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      restoreAuthState(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      restoreAuthState(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setMember, setOwnerId, setRole, setUser]);

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
  };

  const handleEditSave = () => {
    setEditingTransaction(null);
    setRefreshKey(k => k + 1); // Force child components to refresh
  };

  const handleEditCancel = () => {
    setEditingTransaction(null);
  };

  const navItems = [
    { id: 'dashboard', icon: 'home', label: 'Home' },
    { id: 'add', icon: 'add_circle', label: 'Add' },
    { id: 'ledger', icon: 'account_tree', label: 'Ledger' },
    { id: 'reports', icon: 'assessment', label: 'Reports' },
  ];

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (!user || role !== 'owner') return;
      const currentIndex = navItems.findIndex(item => item.id === activeTab);
      if (currentIndex >= 0 && currentIndex < navItems.length - 1) {
        setActiveTab(navItems[currentIndex + 1].id as Tab);
      }
    },
    onSwipedRight: () => {
      if (!user || role !== 'owner') return;
      const currentIndex = navItems.findIndex(item => item.id === activeTab);
      if (currentIndex > 0) {
        setActiveTab(navItems[currentIndex - 1].id as Tab);
      }
    },
    preventScrollOnSwipe: true,
    trackMouse: false
  });

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

  if (role === 'family_member') {
    return <FamilyHome />;
  }

  return (
    <div {...swipeHandlers} className="min-h-screen bg-[#fafaf9] text-stone-800 font-body pb-24 overflow-x-hidden">
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
            {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} onEditTransaction={handleEditTransaction} onSetAddType={(type) => { setAddEntryType(type); setActiveTab('add'); }} refreshKey={refreshKey} />}
            {activeTab === 'add' && <AddEntry onDone={() => setActiveTab('dashboard')} initialType={addEntryType} />}
            {activeTab === 'ledger' && <Ledger onEditTransaction={handleEditTransaction} refreshKey={refreshKey} />}
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

      {/* Edit Entry Overlay */}
      <AnimatePresence>
        {editingTransaction && (
          <EditEntry
            transaction={editingTransaction}
            onSave={handleEditSave}
            onCancel={handleEditCancel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
