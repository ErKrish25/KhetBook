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
        setUser(data.user);
        setMember(null);
        setRole('owner');
        setOwnerId(data.user.id);
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f6f4ef] font-body text-stone-800">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(36,48,38,0.35)]"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f3ec]">
              <img src={khetbookIcon} alt="Khetbook" className="h-10 w-10 object-contain" />
            </div>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-[#1b4332]">Khetbook</h1>
            <p className="mt-2 text-sm text-stone-500">Farm accounts, made simple.</p>
          </div>

          <div className="mb-5 text-center">
            <h2 className="font-headline text-lg font-extrabold tracking-tight text-[#1b4332]">
              {isSignUp ? 'Create your farm account' : 'Sign in to continue'}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Use your email and password to access your account.
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

          {message && (
            <>
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
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
