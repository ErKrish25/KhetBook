import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import khetbookIcon from '../assets/khetbook-icon.png';

export default function Auth() {
  const { setUser, setRole, setOwnerId } = useAuthStore();
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
        setUser(data.user);
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
      // Step 1: Look up the PIN in the farm_pins table
      const { data: pinData, error: pinError } = await supabase
        .from('farm_pins')
        .select('owner_id, farm_name')
        .eq('pin', pin)
        .eq('is_active', true)
        .single();

      if (pinError || !pinData) {
        setMessage({ type: 'error', text: 'Invalid PIN. Please check with the farm owner.' });
        setIsLoading(false);
        return;
      }

      const ownerId = pinData.owner_id;
      const farmName = pinData.farm_name || 'Farm';

      // Step 2: Create a derived family email and sign in (or sign up)
      const familyEmail = `family_${ownerId.substring(0, 8)}_${pin}@khetbook.local`;
      const familyPassword = `kb_${pin}_${ownerId.substring(0, 12)}`;

      // Try sign in first
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: familyEmail,
        password: familyPassword,
      });

      if (signInData?.user) {
        // Existing family account — log in
        setUser(signInData.user);
        setRole('family_member');
        setOwnerId(ownerId);
        setIsLoading(false);
        return;
      }

      // If sign in failed, create a new family account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: familyEmail,
        password: familyPassword,
        options: {
          data: {
            role: 'family_member',
            owner_id: ownerId,
            farm_name: farmName,
          }
        }
      });

      if (signUpError) {
        setMessage({ type: 'error', text: 'Failed to create family account. Please try again.' });
        setIsLoading(false);
        return;
      }

      if (signUpData?.user) {
        // Auto-login after sign up
        const { data: loginData } = await supabase.auth.signInWithPassword({
          email: familyEmail,
          password: familyPassword,
        });

        if (loginData?.user) {
          setUser(loginData.user);
          setRole('family_member');
          setOwnerId(ownerId);
        } else {
          setMessage({ type: 'error', text: 'Account created! Please enter PIN again to log in.' });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Something went wrong.' });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center p-4 font-body">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 mx-auto mb-4">
            <img src={khetbookIcon} alt="Khetbook" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-headline font-extrabold text-[#1b4332] tracking-tight mb-1">Khetbook</h1>
          <p className="text-sm text-stone-400">Farm accounting made simple.</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-stone-200/60 p-6 shadow-sm"
        >
          {/* Owner / Family Toggle */}
          <div className="flex bg-stone-100 p-1 rounded-xl mb-6">
            <button
              onClick={() => { setIsFamilyLogin(false); setMessage(null); }}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                !isFamilyLogin ? "bg-white shadow-sm text-[#1b4332]" : "text-stone-400"
              )}
            >
              <span className="material-symbols-outlined text-base">person</span>
              Owner
            </button>
            <button
              onClick={() => { setIsFamilyLogin(true); setMessage(null); }}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                isFamilyLogin ? "bg-white shadow-sm text-[#1b4332]" : "text-stone-400"
              )}
            >
              <span className="material-symbols-outlined text-base">group</span>
              Family
            </button>
          </div>

          {isFamilyLogin ? (
            <>
              {/* Family PIN Form */}
              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600 text-xl">vpn_key</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Ask the farm owner for the <span className="font-bold text-stone-600">6-digit Farm PIN</span> to join their farm account.
                </p>
              </div>

              <form onSubmit={handleFamilyLogin} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Farm PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="● ● ● ● ● ●"
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-xl py-4 px-4 text-2xl text-center tracking-[0.5em] font-mono font-bold text-stone-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all placeholder:text-stone-300 placeholder:tracking-[0.3em] placeholder:text-lg"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || pin.length !== 6}
                  className="w-full py-3.5 bg-[#1b4332] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Joining Farm...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">login</span>
                      Join Farm
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Owner Login */}
              <form onSubmit={handleOwnerAuth} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Email Address</label>
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
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 block">Password</label>
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
                  className="w-full py-3.5 bg-[#1b4332] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-1"
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

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }}
                    className="text-xs font-medium text-stone-400 hover:text-[#1b4332] transition-colors"
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
                "mt-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2",
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

        <p className="text-center text-[10px] text-stone-300 mt-6">Khetbook v1.0 • Farm Accounting</p>
      </div>
    </div>
  );
}
