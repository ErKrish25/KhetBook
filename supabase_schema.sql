-- =============================================
-- Khetbook Database Schema (Unified)
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables/views to allow clean recreation (BE CAREFUL IN PRODUCTION)
DROP VIEW IF EXISTS items_family_view;
DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS voucher_lines CASCADE;
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;
DROP TABLE IF EXISTS ledger_groups CASCADE;
DROP TABLE IF EXISTS farm_pins CASCADE;
DROP TABLE IF EXISTS farm_members CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS parties CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 1. Profiles Table (For Settings)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    farm_name TEXT,
    address TEXT,
    phone TEXT,
    owner_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ledger Groups Table (Hierarchical Categories for Income/Expense)
CREATE TABLE ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  parent_id UUID REFERENCES ledger_groups(id) ON DELETE CASCADE,
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Vouchers Table (Core Transactions)
CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    voucher_no TEXT NOT NULL,
    type TEXT CHECK (type IN ('income', 'expense', 'sale', 'purchase', 'receipt', 'payment', 'journal')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL,
    ledger_group_id UUID REFERENCES ledger_groups(id) ON DELETE SET NULL,
    notes TEXT,
    payment_mode TEXT,
    party_id UUID,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- NOTE: The tables below are legacy tables kept for backward compatibility
-- during the transition from the general accounting app to the simple
-- Income/Expense tracker. They may not be actively used.
-- ============================================================================

CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('customer', 'supplier', 'bank', 'cash', 'expense')),
    phone TEXT,
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    balance_type TEXT CHECK (balance_type IN ('dr', 'cr')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('crop', 'fertilizer', 'seed', 'pesticide', 'fuel', 'equipment', 'other')),
    unit TEXT CHECK (unit IN ('kg', 'quintal', 'litre', 'unit', 'bigha')),
    current_stock NUMERIC(15,3) DEFAULT 0.000,
    min_stock NUMERIC(15,3) DEFAULT 0.000,
    rate NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE farm_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('owner', 'family_member')),
    pin_hash TEXT,
    invite_pin TEXT,
    invite_expires_at TIMESTAMPTZ,
    invite_used BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMPTZ,
    session_token TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    member_id UUID REFERENCES farm_members(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('add_item', 'update_stock', 'edit_item', 'delete_item')),
    qty_before NUMERIC(15,3),
    qty_after NUMERIC(15,3),
    note TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE voucher_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    qty NUMERIC(15,3),
    rate NUMERIC(15,2),
    amount NUMERIC(15,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    type TEXT CHECK (type IN ('dr', 'cr')),
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE VIEW items_family_view AS
SELECT id, user_id, name, category, unit, current_stock, min_stock, created_at, updated_at
FROM items;

-- =============================================
-- Row Level Security (RLS) Configuration
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Base Policies (Users see/manage their own data)
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage own ledger groups" ON ledger_groups FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own vouchers" ON vouchers FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own parties" ON parties FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own items" ON items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own voucher lines" ON voucher_lines FOR SELECT USING (
    EXISTS (SELECT 1 FROM vouchers WHERE vouchers.id = voucher_lines.voucher_id AND vouchers.user_id = auth.uid())
);
CREATE POLICY "Users can manage own ledger entries" ON ledger_entries FOR ALL USING (auth.uid() = user_id);
