/**
 * Gives the fixture campaign a quest built on the beat-graph model epic #780
 * shipped, rather than the flat quest shape that predates it.
 *
 * ## Why this exists
 *
 * `cloneRichestCampaign` in dev-auth.ts never carried quests, so the account
 * CLAUDE.md tells every session to sign in as is also the one account that
 * cannot exercise a single quest surface -- the outline, the graph designer,
 * the run cockpit, the player journal. Nothing in the epic has been played for
 * real yet, so a hand-built local fixture is the only exercise this code gets
 * before release (#826).
 *
 * ## Why synthetic rather than cloned
 *
 * Same reasoning as `ensureFixtureParty`: quests, beats, objectives and
 * consequences form a graph of foreign keys that a straight clone would have
 * to remap (beat ids inside edges, objective ids inside consequences and
 * gates), and getting that remap wrong silently produces a graph that looks
 * fine and routes nowhere. Four beats authored directly, in dependency order,
 * sidesteps the remap question entirely -- there is nothing to remap when
 * every id is a plpgsql variable assigned by the very INSERT that creates it.
 *
 * ## The shape, and why it is shaped this way
 *
 * supabase/seed.zz_quest_beats.sql already builds a two-beat graph with a
 * gate, a dormant objective and a consequence -- but for the first
 * campaign-scoped quest in the database, which belongs to the admin. This
 * mirrors that shape onto the fixture campaign instead, and extends it to
 * what #826 actually asked for: a fork (so a beat has two outgoing routes), a
 * gate that reads a real *pending* objective rather than only the dormant one,
 * and a beat staged at a cloned dungeon so the site runner has a real place to
 * open onto.
 *
 *   The plea at the hearth (root, revealed)
 *     -> The road north (revealed)          -> Into the frozen vault (hidden, staged at a dungeon)
 *          [gated: "Secure safe passage north" must be complete]
 *     -> Bargain at the checkpoint (hidden, the untaken branch)
 *          [reaching it raises the dormant "Uncover why the vault was sealed"]
 *
 * `quest_runtime_state` is seeded mid-chain, sitting on "The road north" --
 * one beat past the opening, one gated route still shut -- so the Runner and
 * the outline both open onto a quest already in progress rather than an empty
 * cockpit.
 *
 * Shared with the player fixture's claimed party member via
 * `quests.player_visible_to`, so `/play` has a journal to render (#798): the
 * revealed beats carry a real staged location for the filling-in map to
 * follow, per `get_player_visible_quest_beats`.
 *
 * Idempotent by title: a second run finds the quest already there and only
 * recomputes the summary, the same guard shape as `ensureFixtureBestiary`.
 */
import { quote, sql } from "./dev-db.ts";

const QUEST_TITLE = "The Speaker's Missing Rider";
const QUEST_SUMMARY =
  "A rider from the Council never reached Easthaven, and the roads north are colder than usual.";

/** What `ensureFixtureQuest` converged on, for the CLI summary. */
export interface FixtureQuestSummary {
  beats: number;
  edges: number;
  gates: number;
  objectives: number;
  dormantObjectives: number;
  consequences: number;
  hasRuntimeState: boolean;
}

export function ensureFixtureQuest(dbUrl: string, ownerId: string): FixtureQuestSummary | null {
  const campaignId = sql(
    dbUrl,
    `select id from public.campaigns where user_id = ${quote(ownerId)} order by created_at limit 1`,
  );
  if (!campaignId) return null;

  const questId =
    sql(
      dbUrl,
      `select id from public.quests
        where campaign_id = ${quote(campaignId)} and title = ${quote(QUEST_TITLE)}
        limit 1`,
    ) || buildFixtureQuest(dbUrl, campaignId, ownerId);

  return summarize(dbUrl, questId);
}

/**
 * The party member the player fixture claimed, if any. `player_visible_to` is
 * keyed on `party_member_id` -- `private.is_quest_player_visible` joins
 * through `campaign_members.party_member_id`, never through the auth user id
 * directly -- so sharing the quest means naming that id, not the player's.
 */
function claimedPartyMemberId(dbUrl: string, campaignId: string): string | null {
  return (
    sql(
      dbUrl,
      `select party_member_id from public.campaign_members
        where campaign_id = ${quote(campaignId)} and role = 'player' and party_member_id is not null
        order by joined_at limit 1`,
    ) || null
  );
}

/**
 * A dungeon-or-building location already sitting in the fixture campaign, to
 * stage the vault beat at. Dungeon preferred over building, since #797's site
 * runner -- the surface this exists to exercise -- only lights up for a site
 * with a floor plan. Absent only if the clone ever runs against a source
 * campaign with neither type; locally that source is Icewind Dale, which has
 * both in quantity.
 */
function stagingSiteId(dbUrl: string, campaignId: string): string | null {
  return (
    sql(
      dbUrl,
      `select id from public.locations
        where campaign_id = ${quote(campaignId)} and location_type in ('dungeon', 'building')
        order by (location_type = 'dungeon') desc, created_at
        limit 1`,
    ) || null
  );
}

/**
 * Builds the quest, its beat graph, its gate and its consequence in one
 * plpgsql block -- so every id an edge, a gate or a consequence needs already
 * exists by the time that row is written. That is the same ordering guarantee
 * the location clone's recursive depth CTE gives the room tree, gotten here
 * for free because every beat is its own INSERT rather than rows drawn from a
 * bulk SELECT with no ORDER BY to get wrong.
 */
function buildFixtureQuest(dbUrl: string, campaignId: string, ownerId: string): string {
  const playerVisibleTo = claimedPartyMemberId(dbUrl, campaignId);
  const playerVisibleToLiteral = playerVisibleTo
    ? `array[${quote(playerVisibleTo)}]::uuid[]`
    : "'{}'::uuid[]";

  const stagingSite = stagingSiteId(dbUrl, campaignId);
  const stagingSiteLiteral = stagingSite ? quote(stagingSite) : "null";

  sql(
    dbUrl,
    `
    do $$
    declare
      v_quest_id uuid;
      v_beat_open uuid;
      v_beat_road uuid;
      v_beat_checkpoint uuid;
      v_beat_vault uuid;
      v_edge_road_vault uuid;
      v_obj_passage uuid;
      v_obj_sealed uuid;
    begin
      insert into public.quests (user_id, campaign_id, title, summary, status, player_visible_to)
      values (
        ${quote(ownerId)}, ${quote(campaignId)}, ${quote(QUEST_TITLE)}, ${quote(QUEST_SUMMARY)},
        'undiscovered', ${playerVisibleToLiteral}
      )
      returning id into v_quest_id;

      -- Root: the only beat with no incoming edge, so rootBeatIds and the
      -- outline both have a real opening to render.
      insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
      values (v_quest_id, ${quote(campaignId)}, 'The plea at the hearth', 'social', 'revealed', 0, 0)
      returning id into v_beat_open;

      insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
      values (v_quest_id, ${quote(campaignId)}, 'The road north', 'explore', 'revealed', 320, -140)
      returning id into v_beat_road;

      -- The untaken branch. Hidden, same as any authored route the party has
      -- not walked -- reaching it is what raises the dormant objective below.
      insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
      values (v_quest_id, ${quote(campaignId)}, 'Bargain at the checkpoint', 'social', 'hidden', 320, 140)
      returning id into v_beat_checkpoint;

      insert into public.quest_beats (
        quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y, staged_at_location_id
      )
      values (
        v_quest_id, ${quote(campaignId)}, 'Into the frozen vault', 'explore', 'hidden', 640, -140,
        ${stagingSiteLiteral}
      )
      returning id into v_beat_vault;

      -- The fork: the opening beat has two outgoing routes.
      insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
      values (v_quest_id, ${quote(campaignId)}, v_beat_open, v_beat_road);

      insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
      values (v_quest_id, ${quote(campaignId)}, v_beat_open, v_beat_checkpoint);

      insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
      values (v_quest_id, ${quote(campaignId)}, v_beat_road, v_beat_vault)
      returning id into v_edge_road_vault;

      -- A real, non-dormant objective for the gate to read.
      insert into public.quest_objectives (quest_id, description, status, is_player_visible, sort_order)
      values (v_quest_id, 'Secure safe passage north', 'pending', true, 0)
      returning id into v_obj_passage;

      -- Dormant: the party has not been given this thread, because it lives
      -- behind the branch they did not take.
      insert into public.quest_objectives (quest_id, description, status, is_player_visible, sort_order)
      values (v_quest_id, 'Uncover why the vault was sealed', 'dormant', false, 1)
      returning id into v_obj_sealed;

      -- The route into the vault stays shut until passage is secured -- a
      -- gated route visible without any prep beyond this seed.
      insert into public.quest_beat_edge_gates (edge_id, quest_id, campaign_id, objective_id, status)
      values (v_edge_road_vault, v_quest_id, ${quote(campaignId)}, v_obj_passage, 'complete');

      -- Reaching the untaken branch is what wakes the dormant objective.
      insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
      values (v_quest_id, v_beat_checkpoint, 'raise', v_obj_sealed);

      -- Mid-chain: one step past the opening, sitting on the gated fork, so
      -- the Runner opens onto a quest already in progress.
      -- On the quest's Main thread: every quest is born with one (the
      -- create_quest_main_thread trigger), and a cursor belongs to a thread.
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status, visit_stack, visit_index, return_stack
      )
      values (
        ${quote(campaignId)}, v_quest_id,
        (select id from public.quest_threads where quest_id = v_quest_id and label = 'Main'),
        v_beat_road, 'running',
        jsonb_build_array(
          jsonb_build_object('beat_id', v_beat_open),
          jsonb_build_object('beat_id', v_beat_road)
        ),
        1, '[]'::jsonb
      );
    end $$;
    `,
  );

  return sql(
    dbUrl,
    `select id from public.quests
      where campaign_id = ${quote(campaignId)} and title = ${quote(QUEST_TITLE)}
      limit 1`,
  );
}

function summarize(dbUrl: string, questId: string): FixtureQuestSummary {
  const count = (query: string) => Number(sql(dbUrl, query));
  return {
    beats: count(`select count(*) from public.quest_beats where quest_id = ${quote(questId)}`),
    edges: count(`select count(*) from public.quest_beat_edges where quest_id = ${quote(questId)}`),
    gates: count(
      `select count(*) from public.quest_beat_edge_gates where quest_id = ${quote(questId)}`,
    ),
    objectives: count(
      `select count(*) from public.quest_objectives where quest_id = ${quote(questId)}`,
    ),
    dormantObjectives: count(
      `select count(*) from public.quest_objectives
        where quest_id = ${quote(questId)} and status = 'dormant'`,
    ),
    consequences: count(
      `select count(*) from public.quest_consequences where quest_id = ${quote(questId)}`,
    ),
    hasRuntimeState:
      count(`select count(*) from public.quest_runtime_state where quest_id = ${quote(questId)}`) >
      0,
  };
}
