import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store';
import { motion, AnimatePresence } from 'motion/react';
import { useSwipeable } from 'react-swipeable';
import { cn } from './lib/utils';
import khetbookIcon from './assets/khetbook-icon.png';

// Components
const Dashboard = lazy(() => import('./components/Dashboard'));
const AddEntry = lazy(() => import('./components/AddEntry'));
import EditEntry from './components/EditEntry';
const Ledger = lazy(() => import('./components/Ledger'));
const Reports = lazy(() => import('./components/Reports'));
import Auth from './components/Auth';
const Settings = lazy(() => import('./components/Settings'));
import ToastContainer from './components/Toast';

export type Tab = 'dashboard' | 'add' | 'ledger' | 'reports' | 'settings';

export default function App() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isLoading, setLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addEntryType, setAddEntryType] = useState<'income' | 'expense'>('expense');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
  };

  const handleEditSave = () => {
    setEditingTransaction(null);
    setRefreshKey(k => k + 1);
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
      if (!user) return;
      const currentIndex = navItems.findIndex(item => item.id === activeTab);
      if (currentIndex >= 0 && currentIndex < navItems.length - 1) {
        setActiveTab(navItems[currentIndex + 1].id as Tab);
      }
    },
    onSwipedRight: () => {
      if (!user) return;
      const currentIndex = navItems.findIndex(item => item.id === activeTab);
      if (currentIndex > 0) {
        setActiveTab(navItems[currentIndex - 1].id as Tab);
      }
    },
    preventScrollOnSwipe: true,
    trackMouse: false
  });

  const renderTabContent = () => {
    if (activeTab === 'dashboard') {
      return (
        <Dashboard
          onNavigate={setActiveTab}
          onEditTransaction={handleEditTransaction}
          onSetAddType={(type) => {
            setAddEntryType(type);
            setActiveTab('add');
          }}
          refreshKey={refreshKey}
        />
      );
    }

    if (activeTab === 'add') {
      return <AddEntry onDone={() => setActiveTab('dashboard')} initialType={addEntryType} />;
    }

    if (activeTab === 'ledger') {
      return <Ledger onEditTransaction={handleEditTransaction} refreshKey={refreshKey} />;
    }

    if (activeTab === 'reports') {
      return <Reports />;
    }

    return <Settings />;
  };

  const screenLoader = (
    <div className="min-h-[40vh] flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-6 h-6 border-2 border-[#1b4332] border-t-transparent rounded-full"
      />
    </div>
  );

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

  if (!user) {
    return <Auth />;
  }

  return (
    <div {...swipeHandlers} className="min-h-screen bg-[#fafaf9] text-stone-800 font-body pb-24 overflow-x-hidden">
      <ToastContainer />
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
            <Suspense fallback={screenLoader}>
              {renderTabContent()}
            </Suspense>
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
