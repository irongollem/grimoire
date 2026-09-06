-- Supabase resets load seed data after all migrations, and this file sorts
-- after the gitignored seed.sql when the seed*.sql glob is expanded.
--
-- Replaces seed.zz_quest_flows.sql, which called
-- `private.backfill_quest_story_flows(false)` to project an overview beat onto
-- every locally seeded quest. #793 deleted that function along with the whole
-- overview-beat concept, and with it the only reason local quests had any beats
-- at all — leaving the quest runtime, the graph, the cockpit and the player
-- story thread with nothing to render against.
--
-- So this seeds a beat graph directly instead of synthesising one. Two beats and
-- an edge on the first campaign-scoped quest is enough to exercise what the
-- backfill's output never could anyway: a real fork with a root, a gated route,
-- and an objective the branch raises.
--
-- Note what is deliberately NOT recreated: a beat per quest. Under the ledger
-- model a quest with no beats is a legitimate state — it is what a quest looks
-- like before the DM writes its opening — and papering over it locally is how
-- the overview beat justified itself in the first place.

do $$
declare
  v_quest   public.quests%rowtype;
  v_open    uuid;
  v_branch  uuid;
  v_obj     uuid;
  v_edge    uuid;
begin
  select * into v_quest
  from public.quests
  where campaign_id is not null
  order by created_at
  limit 1;

  if not found then
    raise notice 'no campaign-scoped quest seeded; skipping quest beat seed';
    return;
  end if;

  -- Idempotent: a re-run of the seed must not stack duplicate graphs.
  if exists (select 1 from public.quest_beats where quest_id = v_quest.id) then
    return;
  end if;

  insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
  values (v_quest.id, v_quest.campaign_id, 'The summons', 'social', 'revealed', 0, 0)
  returning id into v_open;

  insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
  values (v_quest.id, v_quest.campaign_id, 'The road south', 'explore', 'hidden', 320, 0)
  returning id into v_branch;

  insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
  values (v_quest.id, v_quest.campaign_id, v_open, v_branch)
  returning id into v_edge;

  -- A dormant objective the branch raises, so the #792 ledger has something to
  -- show and the raise verb has something to act on.
  insert into public.quest_objectives (quest_id, description, status, is_player_visible, sort_order)
  values (v_quest.id, 'Find out who sent the rider', 'dormant', false, 1)
  returning id into v_obj;

  insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
  values (v_quest.id, v_branch, 'raise', v_obj);

  -- #795: a route's condition is the ledger, not a caption. This one stays open
  -- only while the objective is unresolved, so the cockpit has a live gate to
  -- draw without any prep beyond the seed.
  insert into public.quest_beat_edge_gates (edge_id, quest_id, campaign_id, objective_id, status)
  values (v_edge, v_quest.id, v_quest.campaign_id, v_obj, 'pending');

  raise notice 'seeded a two-beat quest graph on %', v_quest.title;
end $$;
