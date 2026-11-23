-- Every foreign key needs an index its lookups can use (supabase/tests/foreign_key_indexes.test.sql). The pending
-- routes Ask Grimoire keeps (#1254) had only a partial index on open routes, which a cascade from a deleted account or
-- session cannot use.
create index ask_pending_routes_user_idx on public.ask_pending_routes (user_id);
create index ask_pending_routes_session_idx on public.ask_pending_routes (session_id);
