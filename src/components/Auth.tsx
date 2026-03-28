import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';
import { motion } from 'motion/react';
import { Mail, Key, ArrowRight, Lock } from 'lucide-react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [isFamilyLogin, setIsFamilyLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleOwnerAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Account created! You can now log in.' });
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      }
    }
    setIsLoading(false);
  };

  const handleFamilyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // This would be a custom implementation as per PRD
    setMessage({ type: 'error', text: 'Family PIN login is being implemented.' });
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-12 h-12 bg-stone-900 rounded-lg flex items-center justify-center text-white font-bold text-xl mx-auto mb-4"
          >
            K
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 mb-1">Khetbook</h1>
          <p className="text-sm text-stone-500">Farm accounting made simple.</p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
          <div className="flex bg-stone-100 p-1 rounded-lg mb-6">
            <button 
              onClick={() => setIsFamilyLogin(false)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${!isFamilyLogin ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
            >
              Owner
            </button>
            <button 
              onClick={() => setIsFamilyLogin(true)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${isFamilyLogin ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
            >
              Family
            </button>
          </div>

          {isFamilyLogin ? (
            <form onSubmit={handleFamilyLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">Enter 6-digit PIN</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input 
                    type="password" 
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="000000"
                    className="w-full bg-white border border-stone-200 rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent outline-none transition-all text-center tracking-[0.5em] font-mono"
                    required
                  />
                </div>
              </div>
              <button 
                disabled={isLoading}
                className="w-full bg-stone-900 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 hover:bg-stone-800 transition-all disabled:opacity-50 shadow-sm"
              >
                {isLoading ? 'Verifying...' : 'Join Farm'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleOwnerAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@farm.com"
                    className="w-full bg-white border border-stone-200 rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white border border-stone-200 rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent outline-none transition-all"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <button 
                disabled={isLoading}
                className="w-full bg-stone-900 text-white py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 hover:bg-stone-800 transition-all disabled:opacity-50 shadow-sm mt-2"
              >
                {isLoading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                <ArrowRight className="w-4 h-4" />
              </button>
              
              <div className="text-center pt-2">
                <button 
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
                >
                  {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                </button>
              </div>
            </form>
          )}

          {message && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-4 p-3 rounded-md text-xs font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
            >
              {message.text}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
