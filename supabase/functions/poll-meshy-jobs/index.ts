/**
 * Cron-driven Meshy job poller (SIMULACRUM_PLAN.md §4) — the part
 * `EdgeRuntime.waitUntil` can't do, since Meshy tasks run multi-minute,
 * longer than an edge isolate reliably lives. Invoked every minute by
 * pg_cron via pg_net (see the `poll-meshy-jobs` cron job in
 * supabase/migrations/20260718000001_simulacrum_foundations.sql) — there is
 * no user JWT on that call, so auth is a shared bearer token instead of
 * getUser(). The token is sent in a header, never in the URL/access logs.
 *
 * Assets are deleted from Meshy after 3 days (non-Enterprise) — downloading
 * every requested format into our own `mini-models` bucket immediately on
 * SUCCEEDED is mandatory, not optional (SIMULACRUM_PLAN.md §1).
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { releaseCredits, recordGeneration } from "../_shared/credits.ts";
import { getImageTo3dTask, resolveMeshyKey, type MeshFormat } from "../_shared/mesh3d.ts";
import { resolveSculptOutcome, isStale, type MiniStatusB } from "../_shared/simulacrum.ts";
import { uploadWithRetry, fetchBytes } from "../_shared/storage-upload.ts";
import { composeStl, figureScaleFor } from "../_shared/mesh-compose.ts";
import { composeGlb, figureScaleForGlb } from "../_shared/glb-compose.ts";
import { parseBinaryStl, stlBounds } from "../_shared/stl.ts";
import { DEFAULT_BASE_ID, BASE_STORAGE_PREFIX } from "../_shared/mini-bases.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

interface MiniRow {
  id: string;
  user_id: string;
  format: "print" | "vtt";
  status: MiniStatusB;
  meshy_task_id: string | null;
  glb_path: string | null;
  reservation_ids: string[] | null;
  credits_spent: number;
  sculpt_count: number;
  scale_mm: 28 | 32;
  updated_at: string;
}

const CONTENT_TYPES: Record<MeshFormat | "thumb", string> = {
  glb: "model/gltf-binary",
  stl: "model/stl",
  usdz: "model/vnd.usdz+zip",
  "3mf": "model/3mf",
  obj: "text/plain",
  thumb: "image/webp",
};

// Returns the bucket-relative PATH (not the public URL, unlike the other
// uploadWithRetry callers) — the *_path columns store paths, and the client
// builds public URLs via getPublicUrl("miniModels", path); storing full URLs
// here would get double-wrapped into broken links.
async function uploadModelFile(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  await uploadWithRetry(admin, "mini-models", path, bytes, contentType);
  return path;
}

/** Terminal failure path shared by "no task id" / "no Meshy key" / resolveSculptOutcome's "fail". */
async function failMini(mini: MiniRow, nextStatus: MiniStatusB, error: string, creditsSpent: number): Promise<void> {
  if (mini.reservation_ids?.length) await releaseCredits(admin, mini.reservation_ids);
  await admin.from("minis").update({
    status: nextStatus,
    error,
    meshy_task_id: null,
    reservation_ids: null,
    credits_spent: creditsSpent,
  }).eq("id", mini.id);
}

/**
 * Auto-composes a freshly-downloaded figure onto DEFAULT_BASE_ID at the
 * mini's requested scale_mm (SIMULACRUM_PLAN.md §2 BASELESS decision, #542).
 * Returns null (not an error) when the base files aren't in storage yet —
 * `npm run ingest-mini-bases` hasn't been run — so the caller can fall back
 * to raw-as-model without treating a missing base as a hard failure.
 */
async function composeMiniModel(
  mini: MiniRow,
  figureBytes: Partial<Record<"glb" | "stl", Uint8Array>>,
): Promise<{ glbPath: string | null; stlPath: string | null } | null> {
  if (!figureBytes.glb) return null; // every format fetches glb — nothing to seat if it's missing

  const basePublicUrl = (ext: "stl" | "glb") =>
    admin.storage.from("mini-models").getPublicUrl(`${BASE_STORAGE_PREFIX}/${DEFAULT_BASE_ID}.${ext}`).data.publicUrl;

  const [baseGlbBytes, baseStlBytes] = await Promise.all([
    fetchBytes(basePublicUrl("glb")).catch(() => null),
    figureBytes.stl ? fetchBytes(basePublicUrl("stl")).catch(() => null) : Promise.resolve(null),
  ]);
  if (!baseGlbBytes) return null; // base not ingested yet — see ingest-mini-bases.ts

  // Derive ONE scale factor and reuse it for both exports, so the GLB
  // preview and the printable STL always agree on size. Prefer the STL
  // bounds when a figure STL exists (print format) — VTT sculpts never fetch
  // an STL (meshyParamsForFormat), so figureScaleForGlb reads the same
  // bounds straight from the figure GLB's own POSITION accessors instead.
  const scale = figureBytes.stl
    ? figureScaleFor(stlBounds(parseBinaryStl(figureBytes.stl)), mini.scale_mm)
    : await figureScaleForGlb(figureBytes.glb, mini.scale_mm);

  const composedGlb = await composeGlb(figureBytes.glb, baseGlbBytes, mini.scale_mm, scale);
  const glbPath = await uploadModelFile(`${mini.user_id}/${mini.id}/model.glb`, composedGlb, CONTENT_TYPES.glb);

  let stlPath: string | null = null;
  if (figureBytes.stl && baseStlBytes) {
    const composedStl = composeStl(figureBytes.stl, baseStlBytes, mini.scale_mm);
    stlPath = await uploadModelFile(`${mini.user_id}/${mini.id}/model.stl`, composedStl, CONTENT_TYPES.stl);
  }

  return { glbPath, stlPath };
}

async function processMini(mini: MiniRow, meshyKey: string): Promise<void> {
  if (!mini.meshy_task_id) {
    // A sculpting/downloading row with no task id is corrupt state, not a
    // transient one — no existing model possible without a prior sculpt.
    await failMini(mini, "failed", "No Meshy task id recorded", 0);
    return;
  }

  const stale = isStale(mini.updated_at, Date.now());

  // A row stuck in "downloading" past the stale window means the download step
  // itself keeps failing (SUCCEEDED tasks would otherwise re-enter "complete"
  // every tick forever — the status write below must NOT refresh updated_at's
  // staleness clock into an infinite retry loop).
  if (mini.status === "downloading" && stale) {
    const nextStatus = mini.glb_path ? "ready" : "failed";
    await failMini(mini, nextStatus, "Model download failed repeatedly", nextStatus === "failed" ? 0 : mini.credits_spent);
    return;
  }

  const task = await getImageTo3dTask(meshyKey, mini.meshy_task_id);
  const outcome = resolveSculptOutcome({
    taskStatus: task.status,
    hasExistingModel: !!mini.glb_path,
    stale,
  });

  if (outcome.kind === "wait") return;

  if (outcome.kind === "fail") {
    const creditsSpent = outcome.nextStatus === "failed" ? 0 : mini.credits_spent;
    await failMini(mini, outcome.nextStatus, task.error ?? "Sculpt timed out", creditsSpent);
    return;
  }

  // outcome.kind === "complete" — only stamp "downloading" on the first entry;
  // re-stamping on retry ticks would reset the staleness clock (see above).
  if (mini.status !== "downloading") {
    await admin.from("minis").update({ status: "downloading" }).eq("id", mini.id);
  }

  // Formats + thumbnail are independent fetch→upload pairs — run them together.
  // Bytes are kept (not just paths) so the raw-copy + auto-compose steps
  // below don't need a second storage round-trip for figure files.
  const entries = Object.entries(task.modelUrls) as Array<[MeshFormat, string]>;
  const [formatResults, thumbnailUrl] = await Promise.all([
    Promise.all(entries.map(async ([format, url]) => {
      const bytes = await fetchBytes(url);
      const path = await uploadModelFile(`${mini.user_id}/${mini.id}/model.${format}`, bytes, CONTENT_TYPES[format]);
      return { format, path, bytes };
    })),
    (async (): Promise<string | null> => {
      if (!task.thumbnailUrl) return null;
      const bytes = await fetchBytes(task.thumbnailUrl);
      const path = await uploadModelFile(`${mini.user_id}/${mini.id}/thumb.webp`, bytes, CONTENT_TYPES.thumb);
      // The thumbnail is rendered raw by <img> tags — store its full URL.
      return admin.storage.from("mini-models").getPublicUrl(path).data.publicUrl;
    })(),
  ]);

  const paths: Partial<Record<MeshFormat, string>> = {};
  const figureBytes: Partial<Record<"glb" | "stl", Uint8Array>> = {};
  for (const r of formatResults) {
    paths[r.format] = r.path;
    if (r.format === "glb" || r.format === "stl") figureBytes[r.format] = r.bytes;
  }

  const extraPaths: Record<string, string> = {};
  if (paths.usdz) extraPaths.usdz = paths.usdz;
  if (paths["3mf"]) extraPaths["3mf"] = paths["3mf"];
  if (paths.obj) extraPaths.obj = paths.obj;

  // Keep raw (uncomposed) copies of the figure-only sculpt alongside the
  // (soon to be overwritten) model.* files — forge-mini's `set_base` action
  // recomposes from these without ever re-running Meshy.
  if (figureBytes.glb) {
    extraPaths.raw_glb = await uploadModelFile(`${mini.user_id}/${mini.id}/raw.glb`, figureBytes.glb, CONTENT_TYPES.glb);
  }
  if (figureBytes.stl) {
    extraPaths.raw_stl = await uploadModelFile(`${mini.user_id}/${mini.id}/raw.stl`, figureBytes.stl, CONTENT_TYPES.stl);
  }

  // Auto-compose onto the default base at the mini's requested scale — never
  // allowed to brick an otherwise-successful (paid) sculpt: any failure just
  // falls back to the raw figure-only files already uploaded as model.* above.
  let baseId: string | null = null;
  try {
    const composed = await composeMiniModel(mini, figureBytes);
    if (composed) {
      if (composed.glbPath) paths.glb = composed.glbPath;
      if (composed.stlPath) paths.stl = composed.stlPath;
      baseId = DEFAULT_BASE_ID;
    }
  } catch (e) {
    console.error(`poll-meshy-jobs: auto-compose failed for mini ${mini.id} — falling back to raw model`, e);
  }

  await admin.from("minis").update({
    glb_path: paths.glb ?? null,
    stl_path: paths.stl ?? null,
    extra_paths: extraPaths,
    base_id: baseId,
    thumbnail_url: thumbnailUrl,
    polycount: task.polycount,
    status: "ready",
    sculpt_count: mini.sculpt_count + 1,
    error: null,
    meshy_task_id: null,
    reservation_ids: null,
  }).eq("id", mini.id);

  // Settle the hold and record the real (historical) spend — credits_spent
  // itself is left untouched as the charge record (forge-mini's sculpt step
  // already wrote it).
  if (mini.reservation_ids?.length) {
    await releaseCredits(admin, mini.reservation_ids);
    await recordGeneration(admin, mini.user_id, "mini_sculpt", false, mini.credits_spent).catch(console.error);
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const expected = Deno.env.get("SIMULACRUM_POLLER_TOKEN");
  // MESHY_MOCK=1 bypasses the token check for local testing — there's no
  // pg_cron calling this in a dev DB, so the caller is always trusted (you).
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(supabaseUrl);
  const mockMode = isLocal && Deno.env.get("MESHY_MOCK") === "1";

  if (!mockMode) {
    // The token is provisioned together with the Vault `simulacrum_poller_url`
    // secret at go-live (SIMULACRUM_PLAN.md §7 Phase 4) — until then this
    // function 503s, so it's safe to have deployed years before the Meshy
    // subscription exists.
    if (!expected) return new Response("Poller not configured", { status: 503 });
    if (!timingSafeEqual(token, expected)) return new Response("Unauthorized", { status: 401 });
  }

  const { data: minis } = await admin
    .from("minis")
    .select("id, user_id, format, status, meshy_task_id, glb_path, reservation_ids, credits_spent, sculpt_count, scale_mm, updated_at")
    .in("status", ["sculpting", "downloading"])
    .limit(20);

  const rows = (minis ?? []) as MiniRow[];
  if (!rows.length) return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });

  // One key fetch per tick, not per mini — it can't differ between rows.
  const meshyKey = await resolveMeshyKey(admin);
  if (!meshyKey) {
    // Shouldn't happen — forge-mini checked the key before creating any task —
    // but fail the batch safely rather than poll forever.
    for (const mini of rows) await failMini(mini, "failed", "Meshy platform key unavailable", 0);
    return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  let processed = 0;
  for (const mini of rows) {
    try {
      await processMini(mini, meshyKey);
      processed++;
    } catch (e) {
      console.error(`poll-meshy-jobs: mini ${mini.id} failed`, e);
    }
  }

  return new Response(JSON.stringify({ processed }), { headers: { "Content-Type": "application/json" } });
});
