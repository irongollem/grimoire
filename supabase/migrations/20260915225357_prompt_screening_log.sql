-- Prompt screening log — the evidence for retuning IMAGE_PROMPT_THRESHOLDS.
--
-- supabase/functions/_shared/moderation.ts screens every image prompt against
-- omni-moderation-latest and refuses the few that cross a per-category score
-- threshold. Those thresholds were set from eight hand-written prompts measured
-- on 16 Sep 2026, which is enough to ship and nowhere near enough to keep. This
-- table is how they get corrected from real use.
--
-- Two things are recorded, and the second is the one that matters:
--
--   1. our decision — every category score, which categories crossed, and the
--      threshold table in force at the time (`thresholds`, stored per row so a
--      later retune does not retroactively relabel old rows);
--   2. the renderer's verdict — written back after the image call as
--      `provider_outcome`. Our own judgement is not ground truth. A prompt we
--      waved through at 0.89 that gpt-image then refused is the signal that the
--      threshold is too high, and it is invisible unless both halves land on
--      the same row.
--
-- The prompt text is stored only where a human would have to read it to judge:
-- within PROMPT_TEXT_BAND of a threshold, over a threshold, or refused by the
-- renderer after we allowed it. Ordinary passes keep scores alone — this table
-- must not become a durable record of everything every DM has asked for.

create table prompt_screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- Which surface asked (entity_image, npc_portrait, map_style_generation, …),
  -- so a threshold can be judged per feature: map prompts and portrait prompts
  -- do not score alike.
  generation_type text not null,
  -- The renderer this prompt was bound for. `provider_outcome` means nothing
  -- without it: OpenAI refuses at moderation "low", Gemini largely does not.
  image_provider text not null,
  blocked boolean not null,
  -- The categories that crossed, empty when we allowed the prompt.
  categories_over text[] not null default '{}',
  -- All 13 category_scores, not merely the five we gate on: a category we do
  -- not currently read is exactly where the next useful gate would be found.
  scores jsonb not null,
  -- The threshold table this row was judged against.
  thresholds jsonb not null,
  -- Null for an ordinary pass. See the header note.
  prompt text,
  -- Null until the render resolves: 'rendered', 'refused' (the provider's own
  -- moderation declined it) or 'error' (anything else — never evidence about a
  -- threshold).
  provider_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompt_screenings_outcome_check
    check (provider_outcome is null or provider_outcome in ('rendered', 'refused', 'error'))
);

-- The two reads this table exists for: the recent window, and the disagreements
-- (allowed by us, refused by the renderer) which are the rows worth reading first.
create index prompt_screenings_created_at_idx on prompt_screenings (created_at desc);
create index prompt_screenings_disagreement_idx on prompt_screenings (created_at desc)
  where blocked = false and provider_outcome = 'refused';

create trigger prompt_screenings_updated_at
  before update on prompt_screenings
  for each row execute procedure update_updated_at();

-- RLS: the shape of ai_credit_ledger, and for the same reason. Rows are written
-- only by edge functions on the service role (which bypasses RLS), so there is
-- no insert/update/delete policy to write — adding the usual four would grant
-- a user the ability to forge or erase their own screening history. Reads are
-- the user's own (it is their data, and their DSR export should be able to
-- reach it) plus the admin, who is the only one retuning anything.
alter table prompt_screenings enable row level security;

create policy "prompt_screenings_select"
  on prompt_screenings for select
  using ((select auth.uid()) = user_id);

create policy "prompt_screenings_admin_select"
  on prompt_screenings for select
  using (private.is_app_admin());

-- ── Calibration read ─────────────────────────────────────────────────────────

-- Mirrors get_credit_calibration_hints: an admin-only aggregate whose whole
-- purpose is to let a hard-coded constant be corrected from measured reality.
--
-- Returns one jsonb document rather than a table because the panel wants two
-- differently-shaped things at once — a per-category distribution and a list of
-- individual rows to read — and one guarded function is one thing to audit.
-- p_band: how close a category's score must be to its threshold before a
-- refusal is attributed to THAT category. Read-time rather than baked in,
-- because it is a question about the data, not a property of it — and it
-- mirrors PROMPT_TEXT_BAND in moderation.ts, which decides the same thing at
-- write time for the prompt text.
-- p_generation_type: restrict to one calling surface. Not a nicety — the tile
-- pack generator renders dozens of machine-authored prompts per pack, which are
-- near-identical, never near a threshold, and would otherwise dominate every
-- percentile here and hide the DM-authored prompts the thresholds exist for.
-- `by_type` in the result shows that composition so the skew is visible rather
-- than merely suspected.
create or replace function public.get_prompt_screening_hints(
  p_days int default 30,
  p_band numeric default 0.05,
  p_generation_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_since  timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  v_result jsonb;
begin
  -- coalesce: is_app_admin() returns NULL for a JWT with no role claim, and
  -- `not NULL` is NULL, which falls straight through a bare `if not`. See the
  -- SECURITY DEFINER rules in CLAUDE.md.
  if not coalesce(private.is_app_admin(), false) then
    raise exception 'Admin only';
  end if;

  select jsonb_build_object(
    'since', v_since,
    'total', count(*),
    'blocked', count(*) filter (where s.blocked),
    -- The headline number: we allowed it, the renderer did not. Every one of
    -- these is a threshold sitting too high.
    'refused_after_pass', count(*) filter (where not s.blocked and s.provider_outcome = 'refused'),
    'rendered', count(*) filter (where s.provider_outcome = 'rendered')
  )
  into v_result
  from prompt_screenings s
  where s.created_at >= v_since
    and (p_generation_type is null or s.generation_type = p_generation_type);

  return v_result
    || jsonb_build_object('categories', coalesce((
         -- Per gated category: how close ordinary traffic actually gets to the
         -- line, and how often the line was wrong in either direction.
         select jsonb_agg(row_to_json(c)::jsonb order by c.category)
         from (
           select
             k.category,
             max((s.thresholds ->> k.category)::numeric)                       as threshold,
             -- Rows that actually carry this category. Not count(*): a score the
             -- response omitted is unjudged, and reading it as 0 would drag the
             -- percentiles down while the sample count claimed otherwise.
             count(*) filter (where jsonb_exists(s.scores, k.category))         as samples,
             -- percentile_cont ignores NULLs, so an absent score is excluded
             -- here too rather than coerced.
             round(percentile_cont(0.5)  within group (
               order by (s.scores ->> k.category)::numeric)::numeric, 4)        as p50,
             round(percentile_cont(0.95) within group (
               order by (s.scores ->> k.category)::numeric)::numeric, 4)        as p95,
             -- The highest score we ALLOWED. The gap between this and the
             -- threshold is the headroom a retune would be spending.
             round(max((s.scores ->> k.category)::numeric) filter (where not s.blocked), 4) as max_allowed,
             count(*) filter (where k.category = any(s.categories_over))        as blocked_here,
             -- Attributed, not global. Every row is cross-joined to every
             -- category, so an unqualified count credits a sexual-content
             -- refusal to `hate` and `sexual/minors` as well — which reads as
             -- three thresholds needing attention when only one does. A
             -- refusal counts for a category only where that category was
             -- actually near its line.
             count(*) filter (
               where not s.blocked
                 and s.provider_outcome = 'refused'
                 and (s.scores ->> k.category)::numeric
                       >= (s.thresholds ->> k.category)::numeric - p_band
             )                                                                 as refused_after_pass
           from prompt_screenings s
           cross join lateral jsonb_object_keys(s.thresholds) as k(category)
           where s.created_at >= v_since
             and (p_generation_type is null or s.generation_type = p_generation_type)
           group by k.category
         ) c
       ), '[]'::jsonb))
    || jsonb_build_object('rows', coalesce((
         -- The rows a human reads to make the call: everything we kept text
         -- for, newest first. Bounded — this is a judgement aid, not an export.
         select jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc)
         from (
           select s.id, s.created_at, s.generation_type, s.image_provider,
                  s.blocked, s.categories_over, s.provider_outcome, s.prompt, s.scores
           from prompt_screenings s
           where s.created_at >= v_since and s.prompt is not null
             and (p_generation_type is null or s.generation_type = p_generation_type)
           order by s.created_at desc
           limit 100
         ) r
       ), '[]'::jsonb))
    || jsonb_build_object('by_type', coalesce((
         -- Which surfaces produced this window's rows. Read it before trusting
         -- a percentile: a window that is 95% tile_pack is not evidence about
         -- the prompts a DM writes.
         select jsonb_agg(row_to_json(t)::jsonb order by t.screenings desc)
         from (
           select s.generation_type, count(*) as screenings,
                  count(*) filter (where s.blocked) as blocked,
                  count(*) filter (where not s.blocked and s.provider_outcome = 'refused') as refused_after_pass
           from prompt_screenings s
           where s.created_at >= v_since
           group by s.generation_type
         ) t
       ), '[]'::jsonb));
end;
$$;

-- Login-only, and never on the PostgREST anon surface (anon's access comes via
-- the PUBLIC grant, so revoking from anon alone is a no-op — revoke from both).
revoke execute on function public.get_prompt_screening_hints(int, numeric, text) from public, anon;
grant execute on function public.get_prompt_screening_hints(int, numeric, text) to authenticated, service_role;

comment on table prompt_screenings is
  'Per-prompt moderation screening decisions and the renderer''s later verdict. Exists so IMAGE_PROMPT_THRESHOLDS in supabase/functions/_shared/moderation.ts can be retuned from measured traffic rather than the eight prompts it was set from.';
comment on column prompt_screenings.provider_outcome is
  'Written back after the image call: rendered | refused | error. ''refused'' on a row with blocked=false is the disagreement that justifies lowering a threshold.';
