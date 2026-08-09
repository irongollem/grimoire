-- RLS without an UPDATE policy makes rewrites affect zero rows, but does not
-- necessarily raise. Remove the table privileges too so history corruption is
-- loud and immediately actionable for every authenticated client.
revoke update, delete on public.quest_beat_transitions from authenticated, anon;
