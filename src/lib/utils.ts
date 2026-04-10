import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Compact currency for tight UI spaces —
 *   ₹1,00,00,000 → ₹1Cr
 *   ₹15,00,000   → ₹15L
 *   ₹1,50,000    → ₹1.5L
 *   ₹85,000      → ₹85K
 *   ₹9,500       → ₹9,500
 */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_00_00_000) {
    // Crores
    const cr = abs / 1_00_00_000;
    return `${sign}₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`;
  }
  if (abs >= 1_00_000) {
    // Lakhs
    const l = abs / 1_00_000;
    return `${sign}₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
  }
  if (abs >= 10_000) {
    // Thousands
    const k = abs / 1_000;
    return `${sign}₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  // Small amounts — show full
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(num: number, decimals = 2) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
