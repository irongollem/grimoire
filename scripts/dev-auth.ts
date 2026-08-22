#!/usr/bin/env tsx
/**
 * Make the local Supabase stack signed-into-able, and give it a fixture that is
 * not the admin account.
 *
 * ## Why this is a script and not a dev-mode switch in the app
 *
 * The obvious way to let a headless agent (or a new contributor) see the app is
 * an `import.meta.env.DEV` auto-login inside `src/`. Two reasons this does it
 * from the outside instead:
 *
 * 1. **The repo is public.** Auth-bypass-shaped code is readable by anyone the
 *    moment it lands, tree-shaken from the bundle or not, and it only has to be
 *    wrong once — a mis-set mode, a preview build, a copied pattern.
 * 2. **It would not even work.** Every read path is RLS-scoped on `auth.uid()`,
 *    so a faked client session renders the app with zero rows. You would be
 *    checking layouts against an empty world, which is worse than not checking.
 *
 * Nothing here enters `src/`. It talks to the disposable local stack over
 * loopback, using the Supabase CLI's own universal development keys — the same
 * ones already committed in `config/env/localdb/.env`, which only ever address
 * 127.0.0.1.
 *
 * ## Why a second account
 *
 * `supabase/seed.sql` is a dump of real data, so every row belongs to whoever
 * pulled it — in practice the admin. That leaves exactly one local account with
 * anything in it, and it is the one account whose reads are not representative:
 * #736 shipped green because an RLS-scoped read path was only ever exercised as
 * admin, and it broke every real user. A dev environment where the only usable
 * login is the admin bakes that blind spot in permanently.
 *
 * So this also clones a campaign and its locations onto a plain, non-admin user.
 * Same data shape, ordinary privileges — what a real DM actually sees.
 *
 * A third account exists for the same reason, one layer deeper. The DM fixture
 * above still cannot reach the player portal at all: `/play` routes are fenced
 * by the persisted DM/Player lens (#729) and `requiresPlayer` guards, so every
 * player-side surface — the player journal, the inventory panel, any portal
 * read path — is untestable without a real player membership. This session's
 * document-items work (Aug 2026) had to hand-roll a player account over `psql`
 * to see the feature live; `ensureFixturePlayer` below is what now owns that
 * account properly. Same #736 lesson, one level deeper: the DM fixture fixed
 * "only the admin has data", this fixes "no account can stand where a player
 * stands".
 *
 * Usage:
 *   npm run dev:auth              # ensure all three accounts, print credentials
 *   npm run dev:auth -- --check   # report state, change nothing
 */

import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { quote, sql } from "./lib/dev-db.ts";
import { ensureFixtureContent } from "./lib/dev-fixture-content.ts";

/** Local-only, deliberately boring, never valid anywhere but this machine. */
const DEV_PASSWORD = "grimoire-local-dev";
const FIXTURE_EMAIL = "dm-fixture@example.invalid";
const PLAYER_EMAIL = "player-fixture@example.invalid";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

interface StackStatus {
  API_URL: string;
  DB_URL: string;
  SERVICE_ROLE_KEY: string;
  ANON_KEY: string;
}

/**
 * Reads the running stack's own config rather than hardcoding keys, so this
 * file holds no credentials and cannot drift from the stack it targets.
 */
function readStack(): StackStatus {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  } catch {
    throw new Error("Local stack is not running. Start it with `npm run db:start`.");
  }
  const status = JSON.parse(raw) as StackStatus;

  // The guard. Every remote action needs a real token precisely because this
  // refuses to be one: if the stack under this command is not on loopback, it is
  // not the disposable one, and nothing below should run against it.
  for (const [label, url] of [
    ["API_URL", status.API_URL],
    ["DB_URL", status.DB_URL],
  ] as const) {
    const host = new URL(url).hostname;
    if (!LOOPBACK.has(host)) {
      throw new Error(
        `Refusing to run: ${label} points at ${host}, not loopback. ` +
          `This script only ever addresses the local disposable stack.`,
      );
    }
  }
  return status;
}

/**
 * Sets the dev password only when it is not already in force.
 *
 * Supabase revokes every refresh token when a password changes, so an
 * unconditional update signs out whoever was using the app — including the
 * browser tab you were about to check something in. Re-running this script is
 * routine (it is the way to add the fixture, or to repair it), so it has to be
 * quiet when there is nothing to do.
 *
 * Returns true when a change was actually made.
 */
async function ensurePassword(
  stack: StackStatus,
  admin: SupabaseClient,
  email: string,
  userId: string,
): Promise<boolean> {
  const probe = createClient(stack.API_URL, stack.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await probe.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (!signInError) return false;

  const { error } = await admin.auth.admin.updateUserById(userId, { password: DEV_PASSWORD });
  if (error) throw new Error(`Could not set password for ${email}: ${error.message}`);
  return true;
}

async function main() {
  const { values } = parseArgs({
    options: { check: { type: "boolean", default: false } },
    allowPositionals: false,
  });
  const checkOnly = values.check === true;

  const stack = readStack();
  const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── The seeded admin account ────────────────────────────────────────────────
  const adminRow = sql(
    stack.DB_URL,
    `select id, email from auth.users
      where coalesce(raw_app_meta_data->>'role','') = 'admin'
      order by created_at limit 1`,
  );
  if (!adminRow) throw new Error("No admin account in the local seed — run `npm run db:reset`.");
  const [adminId, adminEmail] = adminRow.split("\t");

  // ── The non-admin fixture ───────────────────────────────────────────────────
  const existing = sql(
    stack.DB_URL,
    `select id from auth.users where email = ${quote(FIXTURE_EMAIL)} limit 1`,
  );

  // ── The player fixture ──────────────────────────────────────────────────────
  const existingPlayer = sql(
    stack.DB_URL,
    `select id from auth.users where email = ${quote(PLAYER_EMAIL)} limit 1`,
  );

  if (checkOnly) {
    const owned = existing
      ? sql(stack.DB_URL, `select count(*) from public.locations where user_id = ${quote(existing)}`)
      : "0";
    const playerMemberships = existingPlayer
      ? sql(
          stack.DB_URL,
          `select count(*) from public.campaign_members where user_id = ${quote(existingPlayer)}`,
        )
      : "0";
    console.log(`admin account   : ${adminEmail}`);
    console.log(`fixture account : ${existing ? `${FIXTURE_EMAIL} (${owned} locations)` : "absent"}`);
    console.log(
      `player account  : ${
        existingPlayer
          ? `${PLAYER_EMAIL} (${playerMemberships} campaign memberships)`
          : "absent"
      }`,
    );
    console.log(`\nRun without --check to (re)set passwords to "${DEV_PASSWORD}".`);
    return;
  }

  const changed: string[] = [];
  if (await ensurePassword(stack, admin, adminEmail, adminId)) changed.push(adminEmail);

  let fixtureId = existing;
  if (!fixtureId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: FIXTURE_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Fixture DM" },
    });
    if (error || !data.user) throw new Error(`Could not create fixture user: ${error?.message}`);
    fixtureId = data.user.id;
  } else if (await ensurePassword(stack, admin, FIXTURE_EMAIL, fixtureId)) {
    changed.push(FIXTURE_EMAIL);
  }

  const cloned = cloneRichestCampaign(stack.DB_URL, fixtureId);
  // Party first: the content below spreads its reveal state across party
  // members, so it needs somebody to share with.
  const party = ensureFixtureParty(stack.DB_URL, fixtureId);
  // And the player needs the party: it claims a seat in it.
  const player = await ensureFixturePlayer(stack, admin, fixtureId);
  if (player.passwordChanged) changed.push(PLAYER_EMAIL);
  const beasts = ensureFixtureBestiary(stack.DB_URL, fixtureId);
  const content = ensureFixtureContent(stack.DB_URL, fixtureId);

  const inventory = [
    `${cloned} locations`,
    `${party} party members`,
    `${beasts} monsters`,
    ...Object.entries(content).map(([name, n]) => `${n} ${name}`),
  ].join(", ");

  console.log(`Local sign-in ready — password for all three: ${DEV_PASSWORD}\n`);
  console.log(`  admin   ${adminEmail}`);
  console.log(`  fixture ${FIXTURE_EMAIL}`);
  console.log(`          ${inventory}, ordinary privileges`);
  console.log(`  player  ${PLAYER_EMAIL}`);
  console.log(
    `          member of the fixture campaign, playing ${player.characterName ?? "no claimed character"}\n`,
  );
  if (changed.length) {
    console.log(`Password changed for ${changed.join(", ")} — those sessions are signed out.`);
  }
  console.log("Use the fixture for anything RLS-scoped. See #736 — the admin account");
  console.log("is not a representative reader, and testing on it is what hid that bug.");
}

/**
 * Clones the campaign with the most locations onto `ownerId`, unless that owner
 * already has locations. Idempotent by that check — re-running does not stack up
 * duplicate worlds.
 *
 * Remapped: location ids, `parent_id`, `related_location_ids`, and the
 * `child_location_id` inside each `map_pins` entry — a pin left pointing at the
 * source world would render as another owner's place on this owner's map.
 *
 * Dropped rather than copied: per-campaign API keys (they are secrets, and a
 * fixture has no business holding them), `npc_owner_id` and `source_map_id`
 * (their targets are not cloned), and `player_visible_to` (an inherited share
 * list names party members from another campaign, so it is worse than empty).
 *
 * A party is added separately by `ensureFixtureParty`.
 */
function cloneRichestCampaign(dbUrl: string, ownerId: string): number {
  const already = Number(
    sql(dbUrl, `select count(*) from public.locations where user_id = ${quote(ownerId)}`),
  );
  if (already > 0) return already;

  const sourceId = sql(
    dbUrl,
    `select c.id from public.campaigns c
       join public.locations l on l.campaign_id = c.id
      group by c.id order by count(l.id) desc limit 1`,
  );
  if (!sourceId) return 0;

  sql(
    dbUrl,
    `
    begin;

    create temporary table _new_campaign on commit drop as
    select gen_random_uuid() as id;

    insert into public.campaigns (
      id, user_id, name, description, setting, current_year, calendar_id, theme,
      excluded_monster_ids, health_visibility, immersive_rolls, disabled_class_names,
      optional_rules, allow_chronicle_promotion, is_archived, current_month, current_day,
      ai_enabled
    )
    select n.id, ${quote(ownerId)}, c.name || ' (fixture)', c.description, c.setting,
           c.current_year, c.calendar_id, c.theme, c.excluded_monster_ids,
           c.health_visibility, c.immersive_rolls, c.disabled_class_names,
           c.optional_rules, c.allow_chronicle_promotion, c.is_archived,
           c.current_month, c.current_day, c.ai_enabled
      from public.campaigns c cross join _new_campaign n
     where c.id = ${quote(sourceId)};

    create temporary table _id_map on commit drop as
    select id as old_id, gen_random_uuid() as new_id
      from public.locations where campaign_id = ${quote(sourceId)};

    insert into public.locations (
      id, user_id, campaign_id, parent_id, name, location_type, description, notes,
      tags, image_url, map_url, map_pins, is_map_shared, player_visible_to,
      player_summary, is_description_shared, is_npcs_shared, is_inventory_shared,
      npc_owner_id, related_location_ids, source_map_id, is_battle_map,
      grid_calibration, era_start, era_end, audio_theme
    )
    select
      m.new_id,
      ${quote(ownerId)},
      n.id,
      pm.new_id,
      l.name, l.location_type, l.description, l.notes, l.tags, l.image_url,
      l.map_url,
      coalesce((
        select jsonb_agg(
          case when pin_map.new_id is not null
               then jsonb_set(pin, '{child_location_id}', to_jsonb(pin_map.new_id))
               else pin end)
          from jsonb_array_elements(l.map_pins) as pin
          left join _id_map pin_map on pin_map.old_id::text = pin->>'child_location_id'
      ), '[]'::jsonb),
      l.is_map_shared,
      '{}',
      l.player_summary, l.is_description_shared, l.is_npcs_shared,
      l.is_inventory_shared,
      null,
      coalesce((
        select array_agg(rel_map.new_id)
          from unnest(l.related_location_ids) as rel(id)
          join _id_map rel_map on rel_map.old_id = rel.id
      ), '{}'),
      null,
      l.is_battle_map, l.grid_calibration, l.era_start, l.era_end, l.audio_theme
      from public.locations l
      join _id_map m on m.old_id = l.id
      cross join _new_campaign n
      left join _id_map pm on pm.old_id = l.parent_id
     where l.campaign_id = ${quote(sourceId)};

    -- NPCs, so the fixture can exercise "People in the Area" and anything else
    -- that reads people through a location. A fixture that holds places but no
    -- inhabitants silently stops covering half the Atlas.
    --
    -- Cloned via a select-star temp table rather than an explicit column list:
    -- npcs has 31 columns and gains more, and a hand-written list would quietly
    -- stop copying whatever was added last.
    -- Capped at 8 against a free-tier limit of 10 (see the quota config in
    -- 20260630000001). The source campaign has ~200, and cloning them all left
    -- the fixture 190-odd over quota, so every NPC card rendered as a blurred
    -- "Locked / Upgrade to access" tile — which is not what a real DM sees, and
    -- makes the fixture useless for looking at any NPC UI. Two spare slots so
    -- the fixture can still create one.
    create temporary table _npc_clone on commit drop as
    select * from public.npcs
     where campaign_id = ${quote(sourceId)} and location_id is not null
     limit 8;

    update _npc_clone c set
      id = gen_random_uuid(),
      user_id = ${quote(ownerId)},
      campaign_id = (select id from _new_campaign),
      location_id = (select m.new_id from _id_map m where m.old_id = c.location_id),
      -- Point at rows this clone does not own; dangling FKs would fail the insert.
      linked_monster_id = null,
      scriptorium_doc_id = null;

    delete from _npc_clone where location_id is null;
    insert into public.npcs select * from _npc_clone;

    commit;
  `,
  );

  return Number(
    sql(dbUrl, `select count(*) from public.locations where user_id = ${quote(ownerId)}`),
  );
}


/**
 * Gives the fixture's campaign a party, if it has none.
 *
 * Separate from the clone rather than part of it, and the difference is not
 * cosmetic: the clone is guarded on "this owner already has locations", so on
 * every run after the first it returns immediately. A party added inside it
 * would therefore only ever reach a fixture created after this was written —
 * which is precisely the fixture nobody has.
 *
 * It matters because every reveal control in the app is a list of party
 * members. With nobody to share with, all of them render their "no party
 * members yet" empty state, and the half of the feature that actually decides
 * who sees what cannot be clicked at all.
 *
 * Synthetic rather than cloned from the source campaign: `party_members`
 * carries FKs to species, backgrounds, deities and a linked player account, and
 * a clone that does not remap them inserts a dangling reference. Only the
 * columns without a usable default are named; the rest is what a freshly
 * created character gets from the app.
 */
function ensureFixtureParty(dbUrl: string, ownerId: string): number {
  const campaignId = sql(
    dbUrl,
    `select id from public.campaigns where user_id = ${quote(ownerId)} order by created_at limit 1`,
  );
  if (!campaignId) return 0;

  const already = Number(
    sql(dbUrl, `select count(*) from public.party_members where campaign_id = ${quote(campaignId)}`),
  );

  if (already === 0) {
    sql(
      dbUrl,
      `insert into public.party_members (user_id, campaign_id, name, player_name, class, level, sort_order)
       values
         (${quote(ownerId)}, ${quote(campaignId)}, 'Brakka Ironvow', 'Sam',  'Fighter', 4, 0),
         (${quote(ownerId)}, ${quote(campaignId)}, 'Nessa Quill',    'Alex', 'Rogue',   4, 1),
         (${quote(ownerId)}, ${quote(campaignId)}, 'Orin Vale',      'Jo',   'Cleric',  4, 2);`,
    );
  }

  // Outside the "party is empty" guard on purpose. Behind the early return this
  // replaced, portraits would only ever reach a fixture created after this was
  // written — which is precisely the fixture nobody has. It guards itself, on
  // the narrower question of whether a member still lacks a face.
  giveThePartyFaces(dbUrl, campaignId);

  return Number(
    sql(dbUrl, `select count(*) from public.party_members where campaign_id = ${quote(campaignId)}`),
  );
}

/**
 * Borrows a portrait for each party member from the NPCs cloned alongside them.
 *
 * The party is synthetic — three names typed into an insert — so it has no art,
 * and every surface that draws a character's face falls back to initials on the
 * one account we are told to use: the party tracker, the player portal, and the
 * relationship web, which puts a PC's portrait on their node.
 *
 * Borrowed rather than shipped, because a fixture cannot carry image files and a
 * hardcoded URL would be a guess about a bucket this machine may not have. The
 * cloned NPCs already hold portrait URLs that resolve on whatever seed.sql is
 * here, and their focal points come along, which is the point — the crop these
 * surfaces do is exactly what needs looking at.
 *
 * Idempotent by the same "only if empty" rule as its caller: it never overwrites
 * a portrait somebody set by hand.
 */
function giveThePartyFaces(dbUrl: string, campaignId: string): void {
  sql(
    dbUrl,
    `with faces as (
       select portrait_url, portrait_focal_point,
              row_number() over (order by name) rn
         from public.npcs
        where campaign_id = ${quote(campaignId)} and portrait_url is not null
     ), members as (
       select id, row_number() over (order by sort_order) rn
         from public.party_members
        where campaign_id = ${quote(campaignId)} and portrait_url is null
     )
     update public.party_members pm
        set portrait_url = f.portrait_url,
            portrait_focal_point = f.portrait_focal_point
       from members m
       join faces f on f.rn = ((m.rn - 1) % (select greatest(count(*), 1) from faces)) + 1
      where pm.id = m.id;`,
  );
}

/** What `ensureFixturePlayer` converged on, for the CLI summary. */
interface FixturePlayerState {
  characterName: string | null;
  passwordChanged: boolean;
}

/**
 * Ensures the player fixture: an auth user, a `campaign_members` row on the
 * fixture campaign with role `player`, and a claimed party member so the
 * account is not just a login but an actual seat at the table.
 *
 * Find-or-create mirrors the DM fixture's inline handling in `main` exactly —
 * same `ensurePassword` probe, same `email_confirm: true` — but is its own
 * function because, unlike the DM fixture, there is real work after the auth
 * user exists: the membership row and the character claim.
 *
 * The `campaign_members` upsert is keyed on the table's own
 * `(campaign_id, user_id)` uniqueness, so re-running this converges an
 * already-existing row (role, party_member_id, display_name all reset to the
 * canonical values) rather than erroring on it — load-bearing the first time
 * this ran here, because the stack already had a hand-made row from before
 * this function existed.
 */
async function ensureFixturePlayer(
  stack: StackStatus,
  admin: SupabaseClient,
  dmOwnerId: string,
): Promise<FixturePlayerState> {
  const dbUrl = stack.DB_URL;

  const existing = sql(dbUrl, `select id from auth.users where email = ${quote(PLAYER_EMAIL)} limit 1`);

  let playerId = existing;
  let passwordChanged = false;
  if (!playerId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: PLAYER_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Fixture Player" },
    });
    if (error || !data.user) throw new Error(`Could not create player user: ${error?.message}`);
    playerId = data.user.id;
  } else if (await ensurePassword(stack, admin, PLAYER_EMAIL, playerId)) {
    passwordChanged = true;
  }

  const campaignId = sql(
    dbUrl,
    `select id from public.campaigns where user_id = ${quote(dmOwnerId)} order by created_at limit 1`,
  );
  if (!campaignId) return { characterName: null, passwordChanged };

  const character = findClaimableCharacter(dbUrl, campaignId);

  sql(
    dbUrl,
    `insert into public.campaign_members (campaign_id, user_id, role, party_member_id, display_name)
     values (
       ${quote(campaignId)}, ${quote(playerId)}, 'player',
       ${character ? quote(character.id) : "null"}, 'Fixture Player'
     )
     on conflict (campaign_id, user_id) do update
       set role = excluded.role,
           party_member_id = excluded.party_member_id,
           display_name = excluded.display_name;`,
  );

  // Claimed-character state: the party member's own row has to point back at
  // the player too, not just the membership row. `owner_user_id` is what the
  // player-portal read paths (and the party UI's "claimed" badge) key off.
  if (character) {
    sql(
      dbUrl,
      `update public.party_members set owner_user_id = ${quote(playerId)}
        where id = ${quote(character.id)};`,
    );
  }

  return { characterName: character?.name ?? null, passwordChanged };
}

/**
 * The party member this player's account claims: Nessa Quill by name, or —
 * should a future fixture roster ever drop that name — whichever member sorts
 * first. Falling back instead of returning nothing keeps the player account
 * useful (a claimed character, not an empty portal) even if the party's
 * makeup changes.
 */
function findClaimableCharacter(
  dbUrl: string,
  campaignId: string,
): { id: string; name: string } | null {
  const preferred = sql(
    dbUrl,
    `select id, name from public.party_members
      where campaign_id = ${quote(campaignId)} and name = 'Nessa Quill' limit 1`,
  );
  const row =
    preferred ||
    sql(
      dbUrl,
      `select id, name from public.party_members
        where campaign_id = ${quote(campaignId)} order by sort_order limit 1`,
    );
  if (!row) return null;
  const [id, name] = row.split("\t");
  return { id, name };
}

/**
 * Enables one library monster source on the fixture campaign, so the Bestiary
 * has something in it.
 *
 * A campaign starts with no sources enabled and the fixture owns no custom
 * monsters, so `/monsters` renders "No monsters match your filters" and every
 * bestiary-shaped surface — the grid, the detail modal, the encounter builder's
 * creature picker, the player bestiary — is unreachable without first knowing
 * that a Sources panel exists and what to tick in it. That is a poor first five
 * minutes, and it is why this had to be done by hand to review #743's monster
 * half at all.
 *
 * Enabling a source rather than cloning monsters: `library_monsters` is shared
 * content that every account can already read, so a row in
 * `campaign_enabled_sources` is the whole grant — no copying, and nothing owned
 * by the fixture that could drift from the real thing.
 *
 * The slug is looked up rather than hardcoded, because which sources are seeded
 * locally depends on whichever `seed.sql` dump the machine has.
 */
function ensureFixtureBestiary(dbUrl: string, ownerId: string): number {
  const campaignId = sql(
    dbUrl,
    `select id from public.campaigns where user_id = ${quote(ownerId)} order by created_at limit 1`,
  );
  if (!campaignId) return 0;

  // Guarded on creatures rather than on rows, because those are not the same
  // question: a campaign can have several sources enabled and still show an
  // empty bestiary, which is the state this was written for. Whichever seed.sql
  // a machine has covers only some slugs, so an enabled source whose monsters
  // were never seeded locally contributes nothing and reads as "no monsters".
  const already = countFixtureMonsters(dbUrl, campaignId);
  if (already > 0) return already;

  // The source with the most creatures in it, so the grid is worth looking at.
  const slug = sql(
    dbUrl,
    `select source from public.library_monsters
      group by source order by count(*) desc limit 1`,
  );
  if (!slug) return 0;

  sql(
    dbUrl,
    `insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
     select ${quote(campaignId)}, ${quote(slug)}, coalesce(max(cs.title), ${quote(slug)})
       from public.content_sources cs where cs.key = ${quote(slug)}
     on conflict do nothing;`,
  );

  return countFixtureMonsters(dbUrl, campaignId);
}

function countFixtureMonsters(dbUrl: string, campaignId: string): number {
  return Number(
    sql(
      dbUrl,
      `select count(*) from public.library_monsters m
        where m.source in (
          select source_slug from public.campaign_enabled_sources
           where campaign_id = ${quote(campaignId)}
        )`,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
