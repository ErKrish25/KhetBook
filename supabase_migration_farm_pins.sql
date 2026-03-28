-- =============================================
-- Khetbook: Farm PIN Table for Family Login
-- Run this SQL in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/pcjzebgsaxaszgaqzkkh/sql/new
-- =============================================

-- Create farm_pins table
CREATE TABLE IF NOT EXISTS public.farm_pins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin text NOT NULL,
  farm_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.farm_pins ENABLE ROW LEVEL SECURITY;

-- Policy: owners can manage their own pins
CREATE POLICY "Owners can manage their own pins" ON public.farm_pins
  FOR ALL
  USING (auth.uid() = owner_id);

-- Policy: anyone can look up active pins (needed for family login)
CREATE POLICY "Anyone can look up active pins" ON public.farm_pins
  FOR SELECT
  USING (is_active = true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_farm_pins_pin ON public.farm_pins(pin);
CREATE INDEX IF NOT EXISTS idx_farm_pins_owner ON public.farm_pins(owner_id);
