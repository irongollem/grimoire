#!/usr/bin/env tsx
/**
 * The synthetic fixture the performance harness measures (epic #999).
 *
 * The harness used to sign in as `dm-fixture`, which `npm run dev:auth` clones
 * out of `supabase/seed.sql`, a gitignored dump of real data. CI has no such
 * file, so there was nothing to sign in to, and the budgets were numbers about
 * one maintainer's private world. This script builds a small world from
 * nothing, committed as code, so the same journeys read the same rows on every
 * machine and the counts mean the same thing everywhere.
 *
 * ## What it creates (all fixed names, no randomness, no clock)
 *
 * - `perf-dm@example.invalid` and `perf-player@example.invalid`, password
 *   `LOCAL_DEV_PASSWORD` (the same local-only password as dev:auth). Not the
 *   `dev:auth` accounts, so running this never
 *   disturbs the maintainer's own dev fixtures.
 * - One campaign owned by the DM, with three party members, one of which the
 *   player claims, so `/play` works.
 * - One location, three NPCs, two notes (one pinned), one quest with three
 *   beats and its edges, one encounter. The dashboard has no layout row, so it
 *   renders its default widgets, which is what a new DM sees.
 *
 * ## Which paths it uses
 *
 * Accounts go through the GoTrue admin API (the only way to set a password).
 * Everything else is plain inserts over `psql`, which fire the same triggers
 * the app relies on: `campaigns_create_dm_membership` seats the DM,
 * `campaigns_enable_default_sources` enables the library, `create_quest_main_thread`
 * gives the quest its Main thread, and `claim_party_member_on_link` makes the
 * player's seat claim their character. Those were found by listing the
 * triggers on `campaigns`, `campaign_members` and `quests` (`pg_trigger`), not
 * by hand-copying what they write. Terms acceptance is written to
 * `user_subscriptions` the way `accept_terms` does, because the Terms gate
 * (#919) otherwise stops both accounts at `/terms`.
 *
 * ## Safety
 *
 * Same as `dev-auth.ts`, and refuses before it touches anything:
 * - keys come only from `supabase status` (never `.env.local` or the
 *   environment, which may hold hosted keys);
 * - the API and database addresses must both be loopback;
 * - the service-role key must be the CLI's universal development key
 *   (issuer `supabase-demo`).
 * Every delete is scoped to the two fixture accounts' ids: deleting those
 * accounts is what clears what they own, so re-running converges on the same
 * state and no other account's row is addressed.
 *
 * Usage: `npm run perf:fixture`
 */
import { createClient } from "@supabase/supabase-js";
import { quote, sql } from "../lib/dev-db.ts";
import { assertDemoKey, LOCAL_DEV_PASSWORD, readLocalStack } from "../lib/dev-stack.ts";
import { markdownToTiptap } from "../lib/tiptap.ts";

export const PERF_DM_EMAIL = "perf-dm@example.invalid";
export const PERF_PLAYER_EMAIL = "perf-player@example.invalid";
export const PERF_PASSWORD = LOCAL_DEV_PASSWORD;

const CAMPAIGN_NAME = "Perf Fixture Campaign";

/** A rich-text value the way the editors store it. */
function prose(text: string): string {
  const doc = markdownToTiptap(text);
  if (doc === null) throw new Error(`Could not convert fixture text to rich text: ${text}`);
  return quote(doc);
}

async function main() {
  const stack = readLocalStack();
  assertDemoKey("SERVICE_ROLE_KEY", stack.SERVICE_ROLE_KEY);
  assertDemoKey("ANON_KEY", stack.ANON_KEY);
  const db = stack.DB_URL;
  const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Clear: delete the two fixture accounts (matched by email, nothing else),
  // which removes everything they own. A fresh account then gets a fresh id, so
  // no leftover row of an earlier run can change a request count.
  for (const email of [PERF_PLAYER_EMAIL, PERF_DM_EMAIL]) {
    const id = sql(db, `select id from auth.users where email = ${quote(email)}`);
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`Could not remove the previous ${email}: ${error.message}`);
  }

  const createUser = async (email: string, displayName: string): Promise<string> => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PERF_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);
    return data.user.id;
  };
  const dmId = await createUser(PERF_DM_EMAIL, "Perf DM");
  const playerId = await createUser(PERF_PLAYER_EMAIL, "Perf Player");

  // Terms gate: both accounts have accepted the current version.
  sql(
    db,
    `update public.user_subscriptions
        set terms_version = private.current_terms_version(), terms_accepted_at = now()
      where user_id in (${quote(dmId)}, ${quote(playerId)});`,
  );

  const dm = quote(dmId);
  const campaignId = sql(
    db,
    // ai_enabled is decided (off): null means "undecided", which opens the
    // "Bring AI to this campaign?" dialog over every page and blocks the clicks.
    `insert into public.campaigns (user_id, name, description, ai_enabled)
     values (${dm}, ${quote(CAMPAIGN_NAME)}, 'Synthetic campaign for the performance harness.', false)
     returning id;`,
  ).split("\n")[0];
  const campaign = quote(campaignId);

  // Party: three characters, each with its class pinned to the official
  // definition like the app's own character creation does.
  sql(
    db,
    `with camp as (
       select ruleset from public.campaigns where id = ${campaign}
     ), members as (
       insert into public.party_members (user_id, campaign_id, name, player_name, ruleset, level, sort_order)
       select ${dm}, ${campaign}, v.name, v.player_name, camp.ruleset, 4, v.sort_order
         from camp,
              (values ('Perf Fighter', 'Player One',   0),
                      ('Perf Rogue',   'Perf Player',  1),
                      ('Perf Cleric',  'Player Three', 2)) as v(name, player_name, sort_order)
       returning id, name, ruleset
     )
     insert into public.character_classes (party_member_id, class_name, class_definition_id, class_definition_kind, levels, is_primary)
     select m.id, c.class_name, sc.id, 'system', 4, true
       from members m
       join (values ('Perf Fighter', 'Fighter'), ('Perf Rogue', 'Rogue'), ('Perf Cleric', 'Cleric')) as c(member_name, class_name)
         on c.member_name = m.name
       join public.system_classes sc on sc.class_name = c.class_name and sc.ruleset = m.ruleset;`,
  );
  const characterId = sql(db, `select id from public.party_members where campaign_id = ${campaign} and name = 'Perf Rogue'`);

  // The player's seat. The claim trigger sets the character's owner.
  sql(
    db,
    `insert into public.campaign_members (campaign_id, user_id, role, party_member_id, display_name)
     values (${campaign}, ${quote(playerId)}, 'player', ${quote(characterId)}, 'Perf Player');`,
  );

  const locationId = sql(
    db,
    `insert into public.locations (user_id, campaign_id, name, location_type, description)
     values (${dm}, ${campaign}, 'Perf Harbour', 'town', ${prose("A small harbour town that exists to be loaded.")})
     returning id;`,
  ).split("\n")[0];

  sql(
    db,
    `insert into public.npcs (user_id, campaign_id, location_id, name, race, occupation, relationship, relevance, personality)
     values
       (${dm}, ${campaign}, ${quote(locationId)}, 'Perf Harbourmaster', 'Human', 'Harbourmaster', 'friendly', 4, 'Brisk and fair.'),
       (${dm}, ${campaign}, ${quote(locationId)}, 'Perf Innkeeper', 'Halfling', 'Innkeeper', 'indifferent', 3, 'Hears everything.'),
       (${dm}, ${campaign}, null, 'Perf Smuggler', 'Tiefling', 'Smuggler', 'unknown', 3, 'Never where you left them.');`,
  );

  sql(
    db,
    `insert into public.notes (user_id, campaign_id, title, content, category, tags, is_pinned)
     values
       (${dm}, ${campaign}, 'Perf pinned note', ${prose("A pinned note the dashboard shows.")}, 'general', '{perf}', true),
       (${dm}, ${campaign}, 'Perf plain note', ${prose("A second note, not pinned.")}, 'lore', '{perf}', false);`,
  );

  sql(
    db,
    `insert into public.encounters (user_id, campaign_id, name, description, party_member_ids, location_id)
     values (${dm}, ${campaign}, 'Perf Ambush', 'A quiet ambush on the harbour road.',
             (select array_agg(id order by sort_order) from public.party_members where campaign_id = ${campaign}),
             ${quote(locationId)});`,
  );

  sql(
    db,
    `do $$
     declare
       v_quest uuid;
       v_open uuid;
       v_road uuid;
       v_end uuid;
     begin
       insert into public.quests (user_id, campaign_id, title, summary, status, player_visible_to)
       values (${dm}, ${campaign}, 'Perf Quest', 'A quest with a few beats.', 'active', array[${quote(characterId)}]::uuid[])
       returning id into v_quest;

       insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
       values (v_quest, ${campaign}, 'Perf opening', 'social', 'revealed', 0, 0) returning id into v_open;
       insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
       values (v_quest, ${campaign}, 'Perf road', 'explore', 'revealed', 320, 0) returning id into v_road;
       insert into public.quest_beats (quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y)
       values (v_quest, ${campaign}, 'Perf finale', 'combat', 'hidden', 640, 0) returning id into v_end;

       insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
       values (v_quest, ${campaign}, v_open, v_road), (v_quest, ${campaign}, v_road, v_end);

       insert into public.quest_objectives (quest_id, description, status, is_player_visible, sort_order)
       values (v_quest, 'Reach the finale', 'pending', true, 0);
     end $$;`,
  );

  const counts = sql(
    db,
    `select
       (select count(*) from public.party_members where campaign_id = ${campaign}),
       (select count(*) from public.npcs where campaign_id = ${campaign}),
       (select count(*) from public.notes where campaign_id = ${campaign}),
       (select count(*) from public.quests where campaign_id = ${campaign}),
       (select count(*) from public.quest_beats where campaign_id = ${campaign}),
       (select count(*) from public.encounters where campaign_id = ${campaign}),
       (select count(*) from public.locations where campaign_id = ${campaign})`,
  ).split("\t");
  const [party, npcs, notes, quests, beats, encounters, locations] = counts;

  console.log(`Performance fixture ready on ${stack.API_URL} (password ${PERF_PASSWORD}).`);
  console.log(`  dm      ${PERF_DM_EMAIL}`);
  console.log(`  player  ${PERF_PLAYER_EMAIL}  (claims Perf Rogue)`);
  console.log(
    `  campaign "${CAMPAIGN_NAME}": ${party} party members, ${npcs} npcs, ${notes} notes, ` +
      `${quests} quest (${beats} beats), ${encounters} encounter, ${locations} location; default dashboard.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
