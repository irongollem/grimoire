-- Restamp waiting quest consequences only when the calendar's *shape* changes.
--
-- `campaigns_calendar_restamps_due_consequences` (20261011214845) fired on any
-- change to `custom_calendar`, and that column now also carries the calendar's
-- moons and seasons (#1086), which no server path reads. Renaming a moon or
-- moving a season recomputed every pending consequence's due date in the
-- campaign and re-ran the firing pass, to arrive at the dates it already had.
--
-- `private.calendar_shape` is exactly what the due-date arithmetic reads
-- (month lengths, festivals, leap rule), and it is immutable, so comparing it
-- in the trigger's WHEN asks the right question: did anything the dates depend
-- on change? A switch between two calendars of the same shape (Eberron and
-- Krynn are both twelve 28-day months) no longer restamps either, which is
-- correct for the same reason: every due date comes out the same.

drop trigger campaigns_calendar_restamps_due_consequences on public.campaigns;

create trigger campaigns_calendar_restamps_due_consequences
  after update of calendar_id, custom_calendar on public.campaigns
  for each row
  when (private.calendar_shape(old.calendar_id, old.custom_calendar)
        is distinct from private.calendar_shape(new.calendar_id, new.custom_calendar))
  execute procedure private.restamp_consequence_due_on();
