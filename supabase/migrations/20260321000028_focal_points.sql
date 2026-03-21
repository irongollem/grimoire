-- Add manual focal point override for portrait images.
-- Stored as {x: number, y: number} (0–100 percentages matching CSS object-position).
-- When set, FocalImage uses this directly and skips smartcrop analysis.

alter table npcs     add column if not exists portrait_focal_point jsonb;
alter table monsters add column if not exists portrait_focal_point jsonb;
