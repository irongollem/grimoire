-- Migration: class_and_subclass_source
-- Add source text column to custom_classes and custom_subclasses for Open5e provenance display

alter table custom_classes
  add column if not exists source text;

alter table custom_subclasses
  add column if not exists source text;
