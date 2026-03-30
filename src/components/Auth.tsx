import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import khetbookIcon from '../assets/khetbook-icon.png';

export default function Auth() {
  const { setUser, setMember, setRole, setOwnerId } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [isFamilyLogin, setIsFamilyLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // =========== OWNER AUTH ===========
  const handleOwnerAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Account created! You can now log in.' });
        setIsSignUp(false);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else if (data.user) {
        localStorage.removeItem('khetbook_family_session');
        setUser(data.user);
        setMember(null);
        setRole('owner');
        setOwnerId(data.user.id);
      }
    }
    setIsLoading(false);
  };

  // =========== FAMILY PIN AUTH ===========
  const handleFamilyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setMessage({ type: 'error', text: 'Please enter a 6-digit PIN.' });
      return;
    }
    setIsLoading(true);
    setMessage(null);

    try {
      // Look up Family PIN from localStorage
      const storedData = localStorage.getItem('khetbook_family_pin');
      if (!storedData) {
        setMessage({ type: 'error', text: 'No Family PIN has been set up on this device yet. The farm owner must first generate a PIN from Settings.' });
        setIsLoading(false);
        return;
      }

      const { pin: savedPin, ownerId, session } = JSON.parse(storedData);

      if (pin !== savedPin) {
        setMessage({ type: 'error', text: 'Incorrect PIN. Please try again.' });
        setIsLoading(false);
        return;
      }

      // Restore the owner's session so Supabase RLS works
      if (session?.refresh_token) {
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });

        if (error || !data.session) {
          setMessage({ type: 'error', text: 'Session expired. The farm owner needs to log in and regenerate the PIN.' });
          setIsLoading(false);
          return;
        }

        // Mark this as a family session
        localStorage.setItem('khetbook_family_session', 'true');

        setUser(data.session.user);
        setMember(null);
        setRole('family_member');
        setOwnerId(ownerId);
      } else {
        setMessage({ type: 'error', text: 'PIN data is corrupted. The farm owner needs to regenerate the PIN.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f6f4ef] font-body text-stone-800">
      <div className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,#d9efe1_0%,#f6f4ef_60%,#f6f4ef_100%)]" />
        <div className="absolute -top-16 right-[-72px] h-48 w-48 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute top-24 left-[-56px] h-32 w-32 rounded-full bg-stone-200/60 blur-3xl" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center justify-between rounded-[28px] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_20px_50px_-32px_rgba(27,67,50,0.55)] backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f3ec] shadow-inner">
                <img src={khetbookIcon} alt="Khetbook" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#4f7a67]">Khetbook</p>
                <h1 className="font-headline text-lg font-extrabold tracking-tight text-[#1b4332]">Farm accounting</h1>
              </div>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Secure Access
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-5 rounded-[30px] bg-[#1b4332] px-5 py-6 text-white shadow-[0_28px_60px_-32px_rgba(27,67,50,0.8)]"
          >
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-200/80">Welcome Back</p>
            <h2 className="font-headline text-[28px] font-extrabold leading-[1.05] tracking-tight">
              Manage farm cashflow, expenses, and family access in one place.
            </h2>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-emerald-50/80">
              Sign in as the farm owner or use the family PIN to view the shared read-only ledger.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-[30px] border border-stone-200/80 bg-white/95 p-4 shadow-[0_24px_60px_-36px_rgba(36,48,38,0.4)] backdrop-blur"
          >
            <div className="mb-4 flex bg-stone-100 p-1 rounded-2xl">
            <button
              onClick={() => { setIsFamilyLogin(false); setMessage(null); }}
              className={cn(
                "flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-1.5",
                !isFamilyLogin ? "bg-white shadow-sm text-[#1b4332]" : "text-stone-400"
              )}
            >
              <span className="material-symbols-outlined text-base">person</span>
              Owner
            </button>
            <button
              onClick={() => { setIsFamilyLogin(true); setMessage(null); }}
              className={cn(
                "flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-1.5",
                isFamilyLogin ? "bg-white shadow-sm text-[#1b4332]" : "text-stone-400"
              )}
            >
              <span className="material-symbols-outlined text-base">group</span>
              Family
            </button>
          </div>

          {isFamilyLogin ? (
            <>
              <div className="mb-5 rounded-[26px] border border-emerald-100 bg-[linear-gradient(135deg,#f5fbf7_0%,#eef7f1_100%)] p-4">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <span className="material-symbols-outlined text-xl text-emerald-600">vpn_key</span>
                </div>
                <h3 className="font-headline text-lg font-extrabold tracking-tight text-[#1b4332]">Shared Ledger Access</h3>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Enter the <span className="font-bold text-stone-700">6-digit Farm PIN</span> shared by the owner to open the read-only view.
                </p>
              </div>

              <form onSubmit={handleFamilyLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-stone-400">Farm PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="● ● ● ● ● ●"
                    className="w-full rounded-2xl border-2 border-stone-200 bg-stone-50 px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.5em] text-stone-800 transition-all placeholder:text-lg placeholder:tracking-[0.3em] placeholder:text-stone-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || pin.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1b4332] py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Joining...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">receipt_long</span>
                      Open Ledger
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Access</p>
                  <p className="mt-1 text-xs font-semibold text-stone-700">Read-only ledger</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Setup</p>
                  <p className="mt-1 text-xs font-semibold text-stone-700">Generated in Settings</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-[11px] font-medium leading-relaxed text-blue-700">
                  The farm owner needs to generate a Family PIN from Settings first. Family members can then use that PIN on their own phone.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-5 rounded-[26px] border border-stone-200 bg-stone-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Owner Workspace</p>
                <h3 className="mt-2 font-headline text-lg font-extrabold tracking-tight text-[#1b4332]">
                  {isSignUp ? 'Create your farm account' : 'Sign in to continue'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Access billing, ledger, reports, entries, and farm settings from the same dashboard.
                </p>
              </div>

              <form onSubmit={handleOwnerAuth} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-stone-400">Email Address</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">mail</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@farm.com"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all placeholder:text-stone-300"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-stone-400">Password</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-lg">lock</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all placeholder:text-stone-300"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1b4332] py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Processing...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">{isSignUp ? 'person_add' : 'login'}</span>
                      {isSignUp ? 'Create Account' : 'Sign In'}
                    </>
                  )}
                </button>

                <div className="rounded-2xl bg-stone-50 px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }}
                    className="text-xs font-semibold text-stone-500 transition-colors hover:text-[#1b4332]"
                  >
                    {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mt-4 flex items-center gap-2 rounded-2xl border p-3 text-xs font-medium",
                message.type === 'success'
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-600 border border-red-200"
              )}
            >
              <span className="material-symbols-outlined text-sm">
                {message.type === 'success' ? 'check_circle' : 'error'}
              </span>
              {message.text}
            </motion.div>
          )}
          </motion.div>

          <p className="mt-6 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-stone-400">
            Khetbook v1.0 • Farm Accounting
          </p>
        </div>
      </div>
    </div>
  );
}
