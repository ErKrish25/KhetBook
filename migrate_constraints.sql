-- =============================================
-- MIGRATION: Expand items table CHECK constraints
-- Run this in Supabase SQL Editor to fix the item save issue
-- =============================================

-- 1. Drop the old restrictive CHECK constraints
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_unit_check;
ALTER TABLE items DROP CONSTRAINT IF EXISTS item_unit_check;

-- 2. Re-add with expanded values
ALTER TABLE items ADD CONSTRAINT items_category_check 
  CHECK (category IN ('crop', 'fertilizer', 'seed', 'pesticide', 'fuel', 'equipment', 'medicine', 'feed', 'dairy', 'labour', 'other'));

ALTER TABLE items ADD CONSTRAINT items_unit_check
  CHECK (unit IN ('kg', 'gram', 'quintal', 'litre', 'unit', 'NOS', 'QTY', 'mun', 'bag', 'ton', 'packet'));
