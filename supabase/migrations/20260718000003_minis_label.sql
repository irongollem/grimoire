-- Migration: minis_label
-- Denormalized display name snapshot (source entity's name at forge time) so the
-- /minis gallery never needs a three-table join per card.

alter table minis add column label text;
