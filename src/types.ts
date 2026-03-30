export type Role = 'owner' | 'family_member';
export type EntryType = 'income' | 'expense';

export interface LedgerGroup {
  id: string;
  user_id: string;
  name: string;
  type: EntryType;
  parent_id: string | null;
  icon: string;
  created_at: string;
}

export interface TransactionEntry {
  id: string;
  user_id: string;
  voucher_no: string;
  type: EntryType;
  date: string;
  amount: number;
  notes?: string;
  ledger_group_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  ledger_groups?: { name: string; type: string } | null;
}

// Keep legacy types for compatibility during transition
export type PartyType = 'customer' | 'supplier' | 'bank' | 'cash' | 'expense';
export type BalanceType = 'dr' | 'cr';
export type ItemCategory = 'crop' | 'fertilizer' | 'seed' | 'pesticide' | 'fuel' | 'equipment' | 'other' | string;
export type Unit = 'kg' | 'quintal' | 'litre' | 'unit' | 'bigha' | 'mun' | 'bag' | 'ton' | 'packet' | string;
export type VoucherType = 'sale' | 'purchase' | 'receipt' | 'payment' | 'journal' | 'income' | 'expense';

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone?: string;
  opening_balance: number;
  balance_type: BalanceType;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  unit: Unit;
  current_stock: number;
  min_stock: number;
  rate?: number;
  created_at: string;
  updated_at: string;
}

export interface FarmMember {
  id: string;
  display_name: string;
  role: Role;
  pin_hash?: string;
  invite_pin?: string;
  invite_expires_at?: string;
  invite_used: boolean;
  is_active: boolean;
  last_active_at?: string;
  session_token?: string;
  created_at: string;
  updated_at: string;
}

export interface Voucher {
  id: string;
  voucher_no: string;
  type: VoucherType;
  date: string;
  party_id?: string;
  amount: number;
  payment_mode?: string;
  notes?: string;
  ledger_group_id?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface VoucherLine {
  id: string;
  voucher_id: string;
  item_id: string;
  qty: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface InventoryLog {
  id: string;
  item_id: string;
  member_id: string;
  action: 'add_item' | 'update_stock' | 'edit_item' | 'delete_item';
  qty_before?: number;
  qty_after?: number;
  note?: string;
  changed_at: string;
}

export interface LedgerEntry {
  id: string;
  voucher_id: string;
  party_id: string;
  amount: number;
  type: BalanceType;
  description?: string;
  date: string;
  created_at: string;
}
