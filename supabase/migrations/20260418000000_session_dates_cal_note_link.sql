-- Session date fields on notes + bidirectional link between notes and calendar_events.
--
-- notes gets:
--   session_start_year/month/day  — in-game start of the session (Harptos date)
--   session_end_year/month/day    — in-game end of the session (optional)
--   session_real_date             — real-world date string "YYYY-MM-DD" (optional)
--   linked_calendar_event_id      — FK to the auto-created session calendar event
--
-- calendar_events gets:
--   linked_note_id                — FK back to the source note (nullable, set-null on delete)
--
-- Insert order to avoid circular FK deadlock:
--   1. INSERT note (linked_calendar_event_id = null)
--   2. INSERT calendar_event (linked_note_id = note.id)
--   3. UPDATE note SET linked_calendar_event_id = event.id

alter table public.notes
  add column session_start_year  integer,
  add column session_start_month integer,
  add column session_start_day   integer,
  add column session_end_year    integer,
  add column session_end_month   integer,
  add column session_end_day     integer,
  add column session_real_date   text,
  add column linked_calendar_event_id uuid;

alter table public.calendar_events
  add column linked_note_id uuid references public.notes(id) on delete set null;

-- Add FK after calendar_events column exists to avoid ordering issues
alter table public.notes
  add constraint notes_linked_calendar_event_fk
    foreign key (linked_calendar_event_id)
    references public.calendar_events(id)
    on delete set null;

create index notes_linked_calendar_event_idx
  on public.notes(linked_calendar_event_id)
  where linked_calendar_event_id is not null;

create index calendar_events_linked_note_idx
  on public.calendar_events(linked_note_id)
  where linked_note_id is not null;
