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
 * Usage:
 *   npm run dev:auth              # ensure both accounts, print credentials
 *   npm run dev:auth -- --check   # report state, change nothing
 */

import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

/** Local-only, deliberately boring, never valid anywhere but this machine. */
const DEV_PASSWORD = "grimoire-local-dev";
const FIXTURE_EMAIL = "dm-fixture@example.invalid";

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

function sql(dbUrl: string, statement: string): string {
  return execFileSync("psql", [dbUrl, "-At", "-F", "\t", "-c", statement], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
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

  if (checkOnly) {
    const owned = existing
      ? sql(stack.DB_URL, `select count(*) from public.locations where user_id = ${quote(existing)}`)
      : "0";
    console.log(`admin account   : ${adminEmail}`);
    console.log(`fixture account : ${existing ? `${FIXTURE_EMAIL} (${owned} locations)` : "absent"}`);
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

  console.log(`Local sign-in ready — password for both: ${DEV_PASSWORD}\n`);
  console.log(`  admin   ${adminEmail}`);
  console.log(`  fixture ${FIXTURE_EMAIL}  (${cloned} locations, ordinary privileges)\n`);
  if (changed.length) {
    console.log(`Password changed for ${changed.join(", ")} — those sessions are signed out.`);
  }
  console.log("Use the fixture for anything RLS-scoped. See #736 — the admin account");
  console.log("is not a representative reader, and testing on it is what hid that bug.");
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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
 * (their targets are not cloned), and `player_visible_to` (no party members to
 * share with, and an inherited share list is a misleading default).
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
    create temporary table _npc_clone on commit drop as
    select * from public.npcs
     where campaign_id = ${quote(sourceId)} and location_id is not null;

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

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
