-- Migration: ac_formula_and_natural_armor
-- Adds ac_formula to party_members (formula string for computed AC) and
-- natural_armor_ac to species (base AC granted by the species trait).

alter table party_members
  add column if not exists ac_formula text null;

alter table species
  add column if not exists natural_armor_ac integer null;
