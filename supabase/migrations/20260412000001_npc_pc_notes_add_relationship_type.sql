-- Migration: npc_pc_notes_add_relationship_type
-- Add relationship_type column to npc_pc_notes so NPC↔PC relations have the same shape as NPC↔NPC

alter table npc_pc_notes
  add column relationship_type text not null default 'contact';
