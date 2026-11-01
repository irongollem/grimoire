#!/usr/bin/env tsx
/**
 * Give the DM fixture one map that shows everything the Map Table can play
 * (epic #1125), so there is always a site to open that has walls, doors of
 * every kind, lights, flowing water, swaying trees, a rounded room, fog by
 * room and a fight to run on it.
 *
 * What it makes, for dm-fixture in the fixture campaign (dev:auth's "(fixture)" clone, the one
 * `dev:auth` seats the party and the player in):
 *
 *  1. "Showcase: the Drowned Shrine", a dungeon site with a Cartographer drawing
 *     (`scripts/lib/dev-showcase-map.ts`: eight rooms, lattice and angled walls,
 *     closed/open/locked/secret doors and a grate, water that animates, trees and
 *     props that sway, torches, braziers, a campfire and a placed light, stamps,
 *     a brushed round room, an invisible wall, darkness "dim").
 *  2. Its Plan, bound to child rooms: the Cartographer's own Publish creates the
 *     rooms, regions and ways from the drawing; this adds what a DM adds by hand
 *     afterwards (a locked door, a secret door, a difficult-terrain zone).
 *  3. The Drawing PUBLISHED the way a DM does it: the transparent bake (ground and
 *     standing halves), the calibration, a v3 `map_live` and `map_published_rev`.
 *     A bake needs a browser canvas, so this drives the real app headless
 *     (Playwright, signed in as dm-fixture) and presses the real Publish button.
 *     Baking in node would mean a second renderer to keep equal to the editor's,
 *     and the point of a showcase is to show what the app really writes.
 *  4. "Showcase: the shrine guardians", an encounter in the Round Chapel with a
 *     Tiny, Medium, Large and Huge monster, a Huge NPC and the party.
 *  5. "Showcase: Battlefield (picture only)", a place with a calibrated still and a
 *     grid and no drawing. It does not move: a moving Picture lives in the
 *     browser's OPFS, which a script cannot seed.
 *
 * Idempotent: it recognises its own rows by name (and the `showcase` tag) and
 * replaces them, leaving every other fixture row alone. Loopback only, like
 * `dev:auth`.
 *
 * Usage (the app must be running for the publish step, `npm run dev`):
 *   npm run dev:showcase                          # app at http://localhost:5173
 *   npm run dev:showcase -- --app http://localhost:5180
 *   npm run dev:showcase -- --no-publish          # rows only, publish by hand
 *   npm run dev:showcase -- --check               # report what exists, change nothing
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { parseArgs } from "node:util";
import { quote, sql } from "./lib/dev-db.ts";
import { fixtureCampaign } from "./lib/dev-fixture-campaign.ts";
import {
  assertDemoKey,
  isLoopback,
  LOCAL_DEV_PASSWORD,
  readLocalStack,
  type StackStatus,
} from "./lib/dev-stack.ts";
import {
  buildShowcaseLayers,
  SHOWCASE_DARKNESS,
  SHOWCASE_DOORS,
  SHOWCASE_NAME,
  SHOWCASE_PACK_ID,
  SHOWCASE_RIVER,
  SHOWCASE_ROOMS,
} from "./lib/dev-showcase-map.ts";
import { renderBattlefieldPng } from "./lib/dev-showcase-picture.ts";

const FIXTURE_EMAIL = "dm-fixture@example.invalid";
const TAG = "showcase";
const SITE_NAME = SHOWCASE_NAME;
const BATTLEFIELD_NAME = "Showcase: Battlefield (picture only)";
const ENCOUNTER_NAME = "Showcase: the shrine guardians";
const NPC_NAME = "Ushara, the Tide-Warden";
const CHAPEL = "Round Chapel";
const PICTURE = { width: 1536, height: 1024, cells: 24 } as const;
/** Library creatures by size (SRD 5.1 ids). */
const GUARDIANS = [
  { monster_id: "srd_srd_stirge", count: 3, size: "Tiny" },
  { monster_id: "srd_srd_skeleton", count: 3, size: "Medium" },
  { monster_id: "srd_srd_ogre", count: 1, size: "Large" },
  { monster_id: "srd_srd_giant_crocodile", count: 1, size: "Huge" },
] as const;
const NPC_STAT_SOURCE = "srd_srd_hill_giant";

interface Context {
  stack: StackStatus;
  admin: SupabaseClient;
  userId: string;
  campaignId: string;
  campaignName: string;
}

function resolveContext(): Omit<Context, "admin"> {
  const stack = readLocalStack();
  assertDemoKey("SERVICE_ROLE_KEY", stack.SERVICE_ROLE_KEY);
  const userId = sql(
    stack.DB_URL,
    `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`,
  );
  if (!userId)
    throw new Error("No dm-fixture account. Run `npm run dev:auth` first.");
  // The same campaign dev:auth gives the party: its "(fixture)" clone, the one the DM fixture has open.
  const campaign = fixtureCampaign(stack.DB_URL, userId);
  if (!campaign) throw new Error("dm-fixture has no fixture campaign. Run `npm run dev:auth` first.");
  return { stack, userId, campaignId: campaign.id, campaignName: campaign.name };
}

function assertLocalApp(raw: string): string {
  const url = new URL(raw);
  if (!isLoopback(url.hostname))
    throw new Error(
      `Refusing to drive ${url.origin}: the publish step only addresses a local app.`,
    );
  return url.origin;
}

// ── Check ──────────────────────────────────────────────────────────────────

function report(ctx: Omit<Context, "admin">): void {
  const { stack, userId } = ctx;
  const q = (statement: string) => sql(stack.DB_URL, statement);
  console.log(`fixture campaign : ${ctx.campaignName}`);
  const site = q(
    `select id, source_map_id, coalesce(map_live->>'version','-'), coalesce(jsonb_array_length(map_live->'groups'),0),
            coalesce(jsonb_array_length(map_live->'sprites'),0), coalesce(jsonb_array_length(map_live->'lights'),0),
            coalesce(jsonb_array_length(map_live->'walls'),0), coalesce(jsonb_array_length(map_live->'doors'),0),
            coalesce(map_published_rev::text,'-'), (map_layer_url is not null)
       from public.locations where user_id = ${quote(userId)} and name = ${quote(SITE_NAME)}`,
  );
  if (!site) {
    console.log(`site             : absent (${SITE_NAME})`);
  } else {
    const [
      id,
      mapId,
      version,
      groups,
      sprites,
      lights,
      walls,
      doors,
      rev,
      baked,
    ] = site.split("\t");
    const mapRev = q(
      `select rev from public.dungeon_maps where id = ${quote(mapId)}`,
    );
    console.log(`site             : ${SITE_NAME} (${id})`);
    console.log(
      `  drawing        : ${mapId} rev ${mapRev}, published rev ${rev}${rev === mapRev ? "" : " (STALE)"}, bake ${baked === "t" ? "present" : "missing"}`,
    );
    console.log(
      `  map_live       : v${version}, ${groups} groups, ${sprites} sprites, ${lights} lights, ${walls} walls, ${doors} doors`,
    );
    const plan = q(
      `select (select count(*) from public.location_map_regions where site_location_id = ${quote(id)} and region_role = 'space'),
              (select count(*) from public.location_map_regions where site_location_id = ${quote(id)} and region_role = 'zone'),
              (select count(*) from public.locations where parent_id = ${quote(id)}),
              (select count(*) from public.location_doors d join public.locations c on c.id = d.from_location_id where c.parent_id = ${quote(id)}),
              (select count(*) from public.location_doors d join public.locations c on c.id = d.from_location_id where c.parent_id = ${quote(id)} and d.starts_locked),
              (select count(*) from public.location_doors d join public.locations c on c.id = d.from_location_id where c.parent_id = ${quote(id)} and d.is_secret)`,
    );
    const [spaces, zones, rooms, ways, locked, secret] = plan.split("\t");
    console.log(
      `  plan           : ${rooms} rooms, ${spaces} traced spaces, ${zones} zone, ${ways} ways (${locked} locked, ${secret} secret)`,
    );
  }
  const encounter = q(
    `select e.id, jsonb_array_length(e.combatants), cardinality(e.party_member_ids), l.name
       from public.encounters e left join public.locations l on l.id = e.location_id
      where e.user_id = ${quote(userId)} and e.name = ${quote(ENCOUNTER_NAME)}`,
  );
  console.log(
    `encounter        : ${encounter ? (([id, n, party, where]) => `${id}, ${n} combatant lines, ${party} party members, in ${where}`)(encounter.split("\t")) : "absent"}`,
  );
  const battlefield = q(
    `select id, (map_url is not null), coalesce(grid_calibration->>'cells_per_image_width','-') from public.locations
      where user_id = ${quote(userId)} and name = ${quote(BATTLEFIELD_NAME)}`,
  );
  console.log(
    `battlefield      : ${battlefield ? (([id, still, cells]) => `${id}, still ${still === "t" ? "present" : "missing"}, grid ${cells} squares wide`)(battlefield.split("\t")) : "absent"}`,
  );
}

// ── Write ──────────────────────────────────────────────────────────────────

/** The storage path inside a bucket of one of our local public urls, or null for anything else. */
function localObjectPath(url: string | null, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const at = url?.indexOf(marker) ?? -1;
  return url && at >= 0 ? url.slice(at + marker.length).split("?")[0] : null;
}

async function removeOldRows(ctx: Context): Promise<void> {
  const { stack, userId, admin } = ctx;
  const q = (statement: string) => sql(stack.DB_URL, statement);
  const old = q(
    `select map_layer_url, map_layer_stand_url, map_layer_stand_live_url, map_url from public.locations
      where user_id = ${quote(userId)} and name in (${quote(SITE_NAME)}, ${quote(BATTLEFIELD_NAME)})`,
  );
  const paths = old
    .split("\n")
    .filter(Boolean)
    .flatMap((row) => row.split("\t"))
    .map((url) => localObjectPath(url, "location-images"))
    .filter((p): p is string => p !== null);
  // Rooms, regions, ways and placements go with the site (they cascade); the encounter and NPC only point at it.
  q(
    `delete from public.encounters where user_id = ${quote(userId)} and name = ${quote(ENCOUNTER_NAME)}`,
  );
  q(
    `delete from public.npcs where user_id = ${quote(userId)} and name = ${quote(NPC_NAME)} and tags @> array[${quote(TAG)}]`,
  );
  q(
    `delete from public.locations where user_id = ${quote(userId)} and name in (${quote(SITE_NAME)}, ${quote(BATTLEFIELD_NAME)})`,
  );
  q(
    `delete from public.dungeon_maps where user_id = ${quote(userId)} and name = ${quote(SITE_NAME)}`,
  );
  if (paths.length > 0) {
    const { error } = await admin.storage.from("location-images").remove(paths);
    if (error)
      console.warn(
        `Could not remove ${paths.length} old images: ${error.message}`,
      );
  }
}

async function createDrawingAndSite(
  ctx: Context,
  partyIds: string[],
): Promise<{ mapId: string; siteId: string }> {
  const { admin, userId, campaignId } = ctx;
  const { data: map, error: mapError } = await admin
    .from("dungeon_maps")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      name: SITE_NAME,
      description:
        "Every Map Table feature on one map. Made by `npm run dev:showcase`.",
      layers: buildShowcaseLayers(),
      metadata: {},
      default_pack_id: SHOWCASE_PACK_ID,
      darkness: SHOWCASE_DARKNESS,
      tags: [TAG],
    })
    .select("id")
    .single();
  if (mapError) throw mapError;

  const { data: site, error: siteError } = await admin
    .from("locations")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      parent_id: null,
      name: SITE_NAME,
      location_type: "dungeon",
      description:
        "A shrine the tide took, built to show off the Map Table: walls, doors of every kind, lights, flowing water, swaying trees, fog by room.",
      tags: [TAG],
      map_pins: [],
      is_map_shared: true,
      player_visible_to: partyIds,
      is_description_shared: true,
      is_npcs_shared: false,
      is_inventory_shared: false,
      related_location_ids: [],
      source_map_id: map.id,
      is_battle_map: false,
    })
    .select("id")
    .single();
  if (siteError) throw siteError;
  return { mapId: map.id, siteId: site.id };
}

/**
 * Signs in as dm-fixture in a headless Chrome, opens the drawing in the Cartographer and presses Publish in the
 * review: the app's own code bakes, uploads and writes the site, its rooms, ways and snapshot.
 */
async function publishThroughApp(
  ctx: Context,
  app: string,
  mapId: string,
  siteId: string,
): Promise<void> {
  const { chromium } = await import("playwright");
  // The installed Chrome, as the promo scripts use: the bundled build is only there after `npx playwright install`.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    await context.addInitScript(
      `localStorage.setItem("grimoire:user-mode", JSON.stringify("dm")); localStorage.setItem("grimoire_active_campaign", ${JSON.stringify(ctx.campaignId)}); localStorage.setItem("grimoire_active_campaign_dm", ${JSON.stringify(ctx.campaignId)});`,
    );
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on("pageerror", (e) => console.warn(`  app error: ${e.message}`));

    try {
      await page.goto(`${app}/login`);
      await page.locator('input[autocomplete="username"]').fill(FIXTURE_EMAIL);
      await page
        .locator('input[autocomplete="current-password"]')
        .fill(LOCAL_DEV_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
      });

      await page.goto(`${app}/cartographer/${mapId}`);
      // The editor loads every published tile set in the background. Publishing before they are in bakes the water and
      // the sway from placeholders, so wait for the page to go quiet first.
      await page.waitForLoadState("networkidle", { timeout: 90_000 });
      await page.waitForTimeout(2_000);
      // A fixture campaign with a session left open asks "Still playing?" a few seconds after load.
      await page
        .getByRole("button", { name: "Still playing" })
        .click({ timeout: 8_000 })
        .catch(() => undefined);
      await page.getByRole("button", { name: "Map", exact: true }).click();
      await page.getByText("Review changes to the site").click();
      await page.getByRole("heading", { name: "Publish to Atlas" }).waitFor();
      const publish = page.getByRole("button", {
        name: /^Publish \d+ changes?$/,
      });
      await publish.waitFor();
      // The picker has the site preselected (the drawing already names it as its source); a plan appears once loaded.
      await page
        .getByText("Pick a place to publish")
        .waitFor({ state: "detached" });
      await publish.click();

      // Done when the modal closes and the site claims the drawing's rev; a failure leaves the error in the modal.
      const deadline = Date.now() + 240_000;
      for (;;) {
        const state = sql(
          ctx.stack.DB_URL,
          `select (l.map_published_rev = m.rev) from public.locations l join public.dungeon_maps m on m.id = l.source_map_id where l.id = ${quote(siteId)}`,
        );
        if (state === "t") break;
        const failure = await page
          .locator("p.text-destructive")
          .first()
          .textContent({ timeout: 500 })
          .catch(() => null);
        if (failure)
          throw new Error(`Publish failed in the app: ${failure.trim()}`);
        if (Date.now() > deadline)
          throw new Error("Publish did not finish within four minutes.");
        await page.waitForTimeout(1500);
      }
    } catch (error) {
      // Set SHOWCASE_SHOT=/some/file.png to see what the headless page was looking at.
      if (process.env.SHOWCASE_SHOT)
        await page
          .screenshot({ path: process.env.SHOWCASE_SHOT })
          .catch(() => undefined);
      throw error;
    }
  } finally {
    await browser.close();
  }
}

/** A publish made before the tile sets finished loading writes water with no motion and no water art. */
function assertSnapshotIsLive(ctx: Context, siteId: string): void {
  const overlays = Number(
    sql(
      ctx.stack.DB_URL,
      `select coalesce(jsonb_array_length(map_live->'groups'->0->'overlays'), 0) from public.locations where id = ${quote(siteId)}`,
    ),
  );
  if (overlays === 0)
    throw new Error(
      "The published snapshot has water with no motion overlays: the tile sets were not loaded when it was baked. Run again.",
    );
}

/** What a DM adds to the Plan by hand after publishing: a locked door, a secret door, a difficult-terrain zone. */
async function finishPlan(
  ctx: Context,
  siteId: string,
): Promise<Map<string, string>> {
  const { stack, userId, admin } = ctx;
  const q = (statement: string) => sql(stack.DB_URL, statement);
  const rooms = new Map<string, string>(
    q(
      `select name, id from public.locations where parent_id = ${quote(siteId)}`,
    )
      .split("\n")
      .filter(Boolean)
      .map((row) => row.split("\t") as [string, string]),
  );
  const missing = SHOWCASE_ROOMS.filter((r) => !rooms.has(r.name)).map(
    (r) => r.name,
  );
  if (missing.length > 0)
    throw new Error(`Publish did not create the rooms: ${missing.join(", ")}`);

  const wayOf = (edgeKey: string) =>
    `from public.location_doors where edge_key = ${quote(edgeKey)} and from_location_id in (select id from public.locations where parent_id = ${quote(siteId)})`;
  q(
    `update public.location_doors set starts_locked = true, lock_note = 'A rusted iron lock. The key lies in the drowned cistern.' where id in (select id ${wayOf(SHOWCASE_DOORS.locked)})`,
  );
  q(
    `update public.location_doors set is_secret = true where id in (select id ${wayOf(SHOWCASE_DOORS.secret)})`,
  );

  const { error } = await admin.from("location_map_regions").insert({
    user_id: userId,
    site_location_id: siteId,
    region_role: "zone",
    zone_kind: "terrain",
    zone_payload: { movement_cost: 2, depth_ft: 2, visible_to_players: true },
    label: "Flooded channel",
    cells: SHOWCASE_RIVER,
    derived_from: "dm",
  });
  if (error) throw error;
  return rooms;
}

async function createFight(
  ctx: Context,
  chapelId: string,
  partyIds: string[],
): Promise<{ npcId: string; encounterId: string }> {
  const { admin, userId, campaignId, stack } = ctx;
  const stat = sql(
    stack.DB_URL,
    `select stat_block::text from public.library_monsters where id = ${quote(NPC_STAT_SOURCE)}`,
  );
  if (!stat)
    throw new Error(
      `Library monster ${NPC_STAT_SOURCE} is missing. Run \`npm run dev:library\`.`,
    );
  const { data: npc, error: npcError } = await admin
    .from("npcs")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      location_id: chapelId,
      name: NPC_NAME,
      race: "Hill giant",
      occupation: "Warden of the drowned shrine",
      status: "alive",
      relationship: "hostile",
      size: "huge",
      tags: [TAG],
      stat_block: JSON.parse(stat) as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (npcError) throw npcError;

  const combatants = [
    ...GUARDIANS.map((g) => ({
      id: randomUUID(),
      monster_id: g.monster_id,
      npc_id: null,
      count: g.count,
      faction_id: "enemy",
      custom_name: null,
    })),
    {
      id: randomUUID(),
      monster_id: null,
      npc_id: npc.id,
      count: 1,
      faction_id: "enemy",
      custom_name: null,
    },
  ];
  const { data: encounter, error: encounterError } = await admin
    .from("encounters")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      location_id: chapelId,
      name: ENCOUNTER_NAME,
      description:
        "Stirges in the rafters, skeletons at the circle, an ogre and a crocodile in the water, and Ushara. Tiny, Medium, Large and Huge together.",
      party_member_ids: partyIds,
      combatants,
      factions: [
        {
          id: "players",
          name: "Players",
          color: "#1C2A4A",
          hostile_to: ["enemy"],
        },
        {
          id: "enemy",
          name: "Enemy",
          color: "#6B1C1C",
          hostile_to: ["players", "ally"],
        },
        { id: "ally", name: "Ally", color: "#1A4A1A", hostile_to: ["enemy"] },
        { id: "neutral", name: "Neutral", color: "#3D3D3D", hostile_to: [] },
      ],
    })
    .select("id")
    .single();
  if (encounterError) throw encounterError;
  return { npcId: npc.id, encounterId: encounter.id };
}

async function createBattlefield(ctx: Context): Promise<string> {
  const { admin, userId, campaignId } = ctx;
  const { data: place, error } = await admin
    .from("locations")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      parent_id: null,
      name: BATTLEFIELD_NAME,
      location_type: "wilds",
      description:
        "A meadow with a ford, for a fight on a plain picture and a grid. The Picture is still: a moving one lives in the browser, which a script cannot fill.",
      tags: [TAG],
      map_pins: [],
      is_map_shared: false,
      player_visible_to: [],
      is_description_shared: false,
      is_npcs_shared: false,
      is_inventory_shared: false,
      related_location_ids: [],
      is_battle_map: true,
    })
    .select("id")
    .single();
  if (error) throw error;

  // The bucket takes WebP and JPEG only, like every place picture the app stores.
  const still = await sharp(renderBattlefieldPng(PICTURE.width, PICTURE.height))
    .webp({ quality: 88 })
    .toBuffer();
  const path = `${userId}/showcase-battlefield-${place.id}.webp`;
  const { error: uploadError } = await admin.storage
    .from("location-images")
    .upload(path, still, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;
  const { data } = admin.storage.from("location-images").getPublicUrl(path);
  const { error: updateError } = await admin
    .from("locations")
    .update({
      map_url: data.publicUrl,
      grid_calibration: {
        cells_per_image_width: PICTURE.cells,
        origin_x_pct: 0,
        origin_y_pct: 0,
        grid_opacity: 0.5,
      },
    })
    .eq("id", place.id);
  if (updateError) throw updateError;
  return place.id;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      "no-publish": { type: "boolean", default: false },
      app: { type: "string", default: "http://localhost:5173" },
    },
    allowPositionals: false,
  });
  const base = resolveContext();
  if (values.check === true) {
    report(base);
    return;
  }
  const app = assertLocalApp(values.app);
  const ctx: Context = {
    ...base,
    admin: createClient(base.stack.API_URL, base.stack.SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };

  const partyIds = sql(
    ctx.stack.DB_URL,
    `select id from public.party_members where campaign_id = ${quote(ctx.campaignId)} order by sort_order nulls last, created_at`,
  )
    .split("\n")
    .filter(Boolean);

  await removeOldRows(ctx);
  const { mapId, siteId } = await createDrawingAndSite(ctx, partyIds);
  console.log(`drawing ${mapId} and site ${siteId} created`);

  let chapelId = siteId;
  if (values["no-publish"] !== true) {
    await publishThroughApp(ctx, app, mapId, siteId);
    assertSnapshotIsLive(ctx, siteId);
    const rooms = await finishPlan(ctx, siteId);
    chapelId = rooms.get(CHAPEL) ?? siteId;
  } else {
    console.log(
      "publish skipped (--no-publish): open the drawing in the Cartographer and use Map > Review changes to the site",
    );
  }

  const fight = await createFight(ctx, chapelId, partyIds);
  const battlefieldId = await createBattlefield(ctx);
  console.log(
    `encounter ${fight.encounterId}, NPC ${fight.npcId}, battlefield ${battlefieldId}\n`,
  );
  report(base);
  console.log(
    `\nOpen as dm-fixture (${LOCAL_DEV_PASSWORD}): ${app}/locations/${siteId}/map`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
