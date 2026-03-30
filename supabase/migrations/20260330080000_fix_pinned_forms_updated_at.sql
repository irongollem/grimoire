-- pinned_forms had an updated_at trigger but no updated_at column.
-- Add the column so the trigger stops erroring on any UPDATE operation.

alter table pinned_forms
  add column if not exists updated_at timestamptz default now();
