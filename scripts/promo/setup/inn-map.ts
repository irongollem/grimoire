#!/usr/bin/env tsx
/**
 * Draws "The Pulled Sugar Inn" for the Sugarwell demo copy: a Cartographer map written in code
 * (`scripts/lib/demo-inn-map.ts`, library tile sets and library dressing only), bound to the inn's place and published
 * through the real app, so the Map Table has a drawn, lit, furnished inn to play on.
 *
 *   tsx --tsconfig tsconfig.node.json scripts/promo/setup/inn-map.ts [--app http://localhost:5173] [--check]
 *
 * Idempotent: it recognises its own drawing by id and its own rooms by name and replaces them. Loopback only.
 * Afterwards it writes `promo-out/inn-map/preview.png` (the transparent bake and the standing half over a dark ground)
 * for review. `--check` reports and changes nothing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { FIXTURE_EMAIL } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { assertDemoKey, isLoopback, LOCAL_DEV_PASSWORD, readLocalStack, type StackStatus } from "../../lib/dev-stack.ts";
import {
  buildInnLayers,
  INN_DARKNESS,
  INN_DOORS,
  INN_NAME,
  INN_PACK_ID,
  INN_PROP_FOOTPRINTS,
  INN_ROOMS,
} from "../../lib/demo-inn-map.ts";
import { publishThroughApp } from "../../lib/publish-through-app.ts";
import { demoCampaignId } from "./demo.ts";

/** Fixed, so a re-run replaces the same drawing. */
const MAP_ID = "1fed0000-0000-4000-8000-000000000001";
const OUT_DIR = "promo-out/inn-map";

interface Context {
  stack: StackStatus;
  userId: string;
  campaignId: string;
  innId: string;
}

function resolveContext(): Context {
  const stack = readLocalStack();
  assertDemoKey("SERVICE_ROLE_KEY", stack.SERVICE_ROLE_KEY);
  const userId = sql(stack.DB_URL, `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  if (!userId) throw new Error("No dm-fixture account. Run `npm run dev:auth` first.");
  const campaignId = demoCampaignId();
  const innId = sql(
    stack.DB_URL,
    `select id from public.locations where campaign_id = ${quote(campaignId)} and user_id = ${quote(userId)} and name = ${quote(INN_NAME)}`,
  );
  if (!innId) throw new Error(`The demo copy has no place "${INN_NAME}". Has the demo template changed?`);
  return { stack, userId, campaignId, innId };
}

function assertLocalApp(raw: string): string {
  const url = new URL(raw);
  if (!isLoopback(url.hostname)) throw new Error(`Refusing to drive ${url.origin}: the publish step only addresses a local app.`);
  return url.origin;
}

/** The footprints the builder assumes must be the library's, or the layout checks in its test mean nothing. */
function assertFootprints(ctx: Context): void {
  const ids = Object.keys(INN_PROP_FOOTPRINTS);
  const rows = sql(
    ctx.stack.DB_URL,
    `select id, footprint_w, footprint_h from public.library_dressing where id in (${ids.map(quote).join(",")})`,
  )
    .split("\n")
    .filter(Boolean)
    .map((r) => r.split("\t"));
  const found = new Map(rows.map(([id, w, h]) => [id, [Number(w), Number(h)] as const]));
  const problems = Object.entries(INN_PROP_FOOTPRINTS).flatMap(([id, [w, h]]) => {
    const row = found.get(id);
    if (!row) return [`${id} is not in the library`];
    return row[0] === w && row[1] === h ? [] : [`${id} is ${row[0]}x${row[1]} in the library, ${w}x${h} here`];
  });
  if (problems.length > 0) throw new Error(`The dressing the inn uses has changed:\n  ${problems.join("\n  ")}`);

  const packs = sql(
    ctx.stack.DB_URL,
    `select pack_id || ' v' || pack_version from public.library_tile_packs where status = 'published'`,
  ).split("\n");
  for (const pack of ["wood-interior v4", "stone-dungeon v4", "forest v5"])
    if (!packs.includes(pack)) throw new Error(`Tile set ${pack} is not published in the library.`);
}

function report(ctx: Context): void {
  const q = (statement: string) => sql(ctx.stack.DB_URL, statement);
  const site = q(
    `select source_map_id, coalesce(map_live->>'version','-'), coalesce(jsonb_array_length(map_live->'walls'),0),
            coalesce(jsonb_array_length(map_live->'doors'),0), coalesce(jsonb_array_length(map_live->'lights'),0),
            coalesce(map_published_rev::text,'-'), (map_layer_url is not null), is_map_shared
       from public.locations where id = ${quote(ctx.innId)}`,
  );
  const [mapId, version, walls, doors, lights, rev, baked, shared] = site.split("\t");
  console.log(`inn              : ${INN_NAME} (${ctx.innId})`);
  if (!mapId) {
    console.log("  drawing        : none bound");
  } else {
    const mapRev = q(`select rev from public.dungeon_maps where id = ${quote(mapId)}`);
    console.log(`  drawing        : ${mapId} rev ${mapRev}, published rev ${rev}${rev === mapRev ? "" : " (STALE)"}, bake ${baked === "t" ? "present" : "missing"}`);
    console.log(`  map_live       : v${version}, ${walls} walls, ${doors} doors, ${lights} lights; shown to players: ${shared === "t" ? "yes" : "no"}`);
  }
  const rooms = q(`select name from public.locations where parent_id = ${quote(ctx.innId)} order by name`).split("\n").filter(Boolean);
  const missing = INN_ROOMS.filter((r) => !rooms.includes(r.name)).map((r) => r.name);
  console.log(`  rooms          : ${rooms.length} (${rooms.join(", ") || "none"})${missing.length > 0 ? `; missing: ${missing.join(", ")}` : ""}`);
  const ways = q(
    `select d.edge_key from public.location_doors d join public.locations c on c.id = d.from_location_id where c.parent_id = ${quote(ctx.innId)}`,
  ).split("\n").filter(Boolean);
  console.log(`  ways           : ${ways.length} (${ways.join(", ") || "none"})`);
}

/** The storage path inside a bucket of one of our local public urls, or null for anything else. */
function localObjectPath(url: string | null, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const at = url ? url.indexOf(marker) : -1;
  return url && at >= 0 ? url.slice(at + marker.length).split("?")[0] : null;
}

async function removeOldRows(ctx: Context, admin: SupabaseClient): Promise<void> {
  const q = (statement: string) => sql(ctx.stack.DB_URL, statement);
  const old = q(
    `select map_layer_url, map_layer_stand_url, map_layer_stand_live_url from public.locations where id = ${quote(ctx.innId)}`,
  );
  const paths = old
    .split("\t")
    .map((url) => localObjectPath(url, "location-images"))
    .filter((p): p is string => p !== null);
  // Only the rooms this script proposes; they take their regions and ways with them.
  q(
    `delete from public.locations where parent_id = ${quote(ctx.innId)} and name in (${INN_ROOMS.map((r) => quote(r.name)).join(",")})`,
  );
  q(`delete from public.location_map_regions where site_location_id = ${quote(ctx.innId)}`);
  q(
    `update public.locations set source_map_id = null, map_live = null, map_published_rev = null, map_layer_url = null,
            map_layer_stand_url = null, map_layer_stand_live_url = null, map_layer_calibration = null
      where id = ${quote(ctx.innId)}`,
  );
  q(`delete from public.dungeon_maps where id = ${quote(MAP_ID)} or (user_id = ${quote(ctx.userId)} and name = ${quote(INN_NAME)})`);
  if (paths.length > 0) {
    const { error } = await admin.storage.from("location-images").remove(paths);
    if (error) console.warn(`Could not remove ${paths.length} old images: ${error.message}`);
  }
}

async function createDrawing(ctx: Context, admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("dungeon_maps").insert({
    id: MAP_ID,
    user_id: ctx.userId,
    campaign_id: ctx.campaignId,
    name: INN_NAME,
    description: "Floss's inn on the Masters' Lane, ground floor. Made by `promo/setup/inn-map.ts`.",
    layers: buildInnLayers(),
    metadata: {},
    default_pack_id: INN_PACK_ID,
    darkness: INN_DARKNESS,
    tags: ["demo"],
  });
  if (error) throw error;

  const partyIds = sql(
    ctx.stack.DB_URL,
    `select id from public.party_members where campaign_id = ${quote(ctx.campaignId)} order by sort_order nulls last, created_at`,
  ).split("\n").filter(Boolean);
  const { error: siteError } = await admin
    .from("locations")
    .update({ source_map_id: MAP_ID, is_map_shared: true, player_visible_to: partyIds })
    .eq("id", ctx.innId);
  if (siteError) throw siteError;
}

/** A publish made before the tile sets finished loading writes a snapshot with no walls or doors. */
function assertSnapshot(ctx: Context): void {
  const row = sql(
    ctx.stack.DB_URL,
    `select coalesce(map_live->>'version','-'), coalesce(jsonb_array_length(map_live->'walls'),0), coalesce(jsonb_array_length(map_live->'doors'),0),
            coalesce(jsonb_array_length(map_live->'lights'),0)
       from public.locations where id = ${quote(ctx.innId)}`,
  );
  const [version, walls, doors, lights] = row.split("\t");
  if (version !== "3") throw new Error(`The published snapshot is v${version}, expected the v3 vector graph.`);
  if (Number(walls) === 0) throw new Error("The published snapshot has no walls.");
  if (Number(doors) !== INN_DOORS.length) throw new Error(`The published snapshot has ${doors} doors, expected ${INN_DOORS.length}.`);
  if (Number(lights) === 0) throw new Error("The published snapshot has no lights.");
}

function assertPlan(ctx: Context): void {
  const q = (statement: string) => sql(ctx.stack.DB_URL, statement);
  const rooms = new Set(q(`select name from public.locations where parent_id = ${quote(ctx.innId)}`).split("\n").filter(Boolean));
  const missing = INN_ROOMS.filter((r) => !rooms.has(r.name)).map((r) => r.name);
  if (missing.length > 0) throw new Error(`Publish did not create the rooms: ${missing.join(", ")}`);
  const ways = new Set(
    q(
      `select d.edge_key from public.location_doors d join public.locations c on c.id = d.from_location_id where c.parent_id = ${quote(ctx.innId)}`,
    ).split("\n").filter(Boolean),
  );
  const lost = INN_DOORS.filter((d) => !ways.has(d.edge)).map((d) => d.edge);
  if (lost.length > 0) throw new Error(`Publish did not derive the ways on: ${lost.join(", ")}`);
}

/** Both halves of the bake over a dark ground, so a reviewer sees the map as the table will. */
async function writePreview(ctx: Context): Promise<string> {
  const urls = sql(ctx.stack.DB_URL, `select map_layer_url, map_layer_stand_url from public.locations where id = ${quote(ctx.innId)}`).split("\t");
  if (!urls[0]) throw new Error("The inn has no bake to preview.");
  const fetched = await Promise.all(
    urls.filter(Boolean).map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download ${url}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }),
  );
  const meta = await sharp(fetched[0]).metadata();
  if (!meta.width || !meta.height) throw new Error("The bake has no size.");
  await mkdir(OUT_DIR, { recursive: true });
  const out = `${OUT_DIR}/preview.png`;
  const png = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: "#171210" } })
    .composite(fetched.map((input) => ({ input })))
    .png()
    .toBuffer();
  await writeFile(out, png);
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      app: { type: "string", default: "http://localhost:5173" },
    },
    allowPositionals: false,
  });
  const ctx = resolveContext();
  if (values.check === true) {
    report(ctx);
    return;
  }
  const app = assertLocalApp(values.app);
  assertFootprints(ctx);
  const admin = createClient(ctx.stack.API_URL, ctx.stack.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await removeOldRows(ctx, admin);
  await createDrawing(ctx, admin);
  console.log(`drawing ${MAP_ID} bound to ${INN_NAME}`);
  await publishThroughApp({ dbUrl: ctx.stack.DB_URL, campaignId: ctx.campaignId, app, mapId: MAP_ID, siteId: ctx.innId });
  assertSnapshot(ctx);
  assertPlan(ctx);
  const preview = await writePreview(ctx);
  console.log(`preview written to ${preview}\n`);
  report(ctx);
  console.log(`\nOpen as dm-fixture (${LOCAL_DEV_PASSWORD}): ${app}/locations/${ctx.innId}/map`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
