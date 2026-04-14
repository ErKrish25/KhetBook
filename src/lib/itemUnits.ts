import { Unit } from '../types';

export const ITEM_UNIT_OPTIONS = [
  { value: 'kg', label: 'Kg' },
  { value: 'gram', label: 'Gram' },
  { value: 'mun', label: 'Mun (20kg)' },
  { value: 'quintal', label: 'Quintal' },
  { value: 'bag', label: 'Bag / Bori' },
  { value: 'ton', label: 'Ton' },
  { value: 'litre', label: 'Litre' },
  { value: 'packet', label: 'Packet' },
  { value: 'unit', label: 'Unit / Pcs' },
  { value: 'bigha', label: 'Bigha' },
] as const;

export const VALID_ITEM_UNITS = ITEM_UNIT_OPTIONS.map((option) => option.value);

const UNIT_ALIASES: Record<string, string> = {
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  liter: 'litre',
  liters: 'litre',
  ltr: 'litre',
  nos: 'unit',
  piece: 'unit',
  pieces: 'unit',
  pcs: 'unit',
};

export const normalizeItemUnit = (value: string): Unit => {
  const trimmed = value.trim();
  if (!trimmed) return 'kg';

  const lowered = trimmed.toLowerCase();
  const normalized = UNIT_ALIASES[lowered] || lowered;

  return normalized as Unit;
};

export const getUnitLabel = (unit: string) => {
  const normalized = normalizeItemUnit(unit);
  const labels: Record<string, string> = {
    kg: 'Kg',
    gram: 'Gram',
    quintal: 'Qtl',
    litre: 'Litre',
    unit: 'Pcs',
    bigha: 'Bigha',
    mun: 'MUN',
    bag: 'Bag',
    ton: 'Ton',
    packet: 'Packet',
  };

  return labels[normalized] || unit;
};

export const getUnitInsertCandidates = (unit: string) => {
  const normalized = normalizeItemUnit(unit);

  if (normalized === 'unit') {
    return ['unit', 'NOS'];
  }

  return [normalized];
};
