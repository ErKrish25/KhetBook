-- Khetbook Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to allow clean recreation
DROP VIEW IF EXISTS items_family_view;
DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS voucher_lines CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS farm_members CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS parties CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Profiles Table (For Settings)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    farm_name TEXT,
    address TEXT,
    phone TEXT,
    owner_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Parties Table
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('customer', 'supplier', 'bank', 'cash', 'expense')),
    phone TEXT,
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    balance_type TEXT CHECK (balance_type IN ('dr', 'cr')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Items (Inventory) Table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Farm Members Table
CREATE TABLE farm_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('owner', 'family_member')),
    pin_hash TEXT, -- bcrypt hash of member's 4-digit app PIN
    invite_pin TEXT, -- 6-digit invite PIN
    invite_expires_at TIMESTAMPTZ,
    invite_used BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMPTZ,
    session_token TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory Logs Table
CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    member_id UUID REFERENCES farm_members(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('add_item', 'update_stock', 'edit_item', 'delete_item')),
    qty_before NUMERIC(15,3),
    qty_after NUMERIC(15,3),
    note TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- Vouchers Table
CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    voucher_no TEXT NOT NULL,
    type TEXT CHECK (type IN ('sale', 'purchase', 'receipt', 'payment', 'journal')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    payment_mode TEXT,
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Voucher Lines Table
CREATE TABLE voucher_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    qty NUMERIC(15,3),
    rate NUMERIC(15,2),
    amount NUMERIC(15,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger Entries Table
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    type TEXT CHECK (type IN ('dr', 'cr')),
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE VIEW items_family_view AS
SELECT id, user_id, name, category, unit, current_stock, min_stock, created_at, updated_at
FROM items;

-- RLS Policies (Basic setup, needs refinement based on auth)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users to only see their own data
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own parties" ON parties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parties" ON parties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parties" ON parties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parties" ON parties FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own items" ON items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON items FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vouchers" ON vouchers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vouchers" ON vouchers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vouchers" ON vouchers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vouchers" ON vouchers FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own voucher lines" ON voucher_lines FOR SELECT USING (
    EXISTS (SELECT 1 FROM vouchers WHERE vouchers.id = voucher_lines.voucher_id AND vouchers.user_id = auth.uid())
);
CREATE POLICY "Users can insert own voucher lines" ON voucher_lines FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vouchers WHERE vouchers.id = voucher_lines.voucher_id AND vouchers.user_id = auth.uid())
);
CREATE POLICY "Users can update own voucher lines" ON voucher_lines FOR UPDATE USING (
    EXISTS (SELECT 1 FROM vouchers WHERE vouchers.id = voucher_lines.voucher_id AND vouchers.user_id = auth.uid())
);
CREATE POLICY "Users can delete own voucher lines" ON voucher_lines FOR DELETE USING (
    EXISTS (SELECT 1 FROM vouchers WHERE vouchers.id = voucher_lines.voucher_id AND vouchers.user_id = auth.uid())
);

CREATE POLICY "Users can view own ledger entries" ON ledger_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ledger entries" ON ledger_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ledger entries" ON ledger_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ledger entries" ON ledger_entries FOR DELETE USING (auth.uid() = user_id);
