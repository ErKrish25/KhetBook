import { useToastStore } from '../lib/useToast';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const ICONS: Record<string, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

const STYLES: Record<string, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-500 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-stone-700 text-white',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'pointer-events-auto w-full px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 cursor-pointer',
              STYLES[t.type]
            )}
            onClick={() => removeToast(t.id)}
          >
            <span className="material-symbols-outlined text-lg shrink-0">
              {ICONS[t.type]}
            </span>
            <span className="text-sm font-semibold flex-1">{t.message}</span>
            <span className="material-symbols-outlined text-sm opacity-60 shrink-0">close</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
