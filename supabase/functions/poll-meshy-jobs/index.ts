/**
 * Cron-driven Meshy job poller (SIMULACRUM_PLAN.md §4) — the part
 * `EdgeRuntime.waitUntil` can't do, since Meshy tasks run multi-minute,
 * longer than an edge isolate reliably lives. Invoked every minute by
 * pg_cron via pg_net (see the `poll-meshy-jobs` cron job in
 * supabase/migrations/20260718000001_simulacrum_foundations.sql) — there is
 * no user JWT on that call, so auth is a shared secret token instead of
 * getUser().
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
import { uploadWithRetry } from "../_shared/storage-upload.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

/** Works for both https:// (real Meshy) and data: (MESHY_MOCK) URLs. */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
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
  const entries = Object.entries(task.modelUrls) as Array<[MeshFormat, string]>;
  const [formatEntries, thumbnailUrl] = await Promise.all([
    Promise.all(entries.map(async ([format, url]) => {
      const bytes = await fetchBytes(url);
      const path = await uploadModelFile(`${mini.user_id}/${mini.id}/model.${format}`, bytes, CONTENT_TYPES[format]);
      return [format, path] as const;
    })),
    (async (): Promise<string | null> => {
      if (!task.thumbnailUrl) return null;
      const bytes = await fetchBytes(task.thumbnailUrl);
      const path = await uploadModelFile(`${mini.user_id}/${mini.id}/thumb.webp`, bytes, CONTENT_TYPES.thumb);
      // The thumbnail is rendered raw by <img> tags — store its full URL.
      return admin.storage.from("mini-models").getPublicUrl(path).data.publicUrl;
    })(),
  ]);

  const paths: Partial<Record<MeshFormat, string>> = Object.fromEntries(formatEntries);

  const extraPaths: Record<string, string> = {};
  if (paths.usdz) extraPaths.usdz = paths.usdz;
  if (paths["3mf"]) extraPaths["3mf"] = paths["3mf"];
  if (paths.obj) extraPaths.obj = paths.obj;

  await admin.from("minis").update({
    glb_path: paths.glb ?? null,
    stl_path: paths.stl ?? null,
    extra_paths: extraPaths,
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
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = Deno.env.get("SIMULACRUM_POLLER_TOKEN");
  // MESHY_MOCK=1 bypasses the token check for local testing — there's no
  // pg_cron calling this in a dev DB, so the caller is always trusted (you).
  const mockMode = Deno.env.get("MESHY_MOCK") === "1";

  if (!mockMode) {
    // The token is provisioned together with the Vault `simulacrum_poller_url`
    // secret at go-live (SIMULACRUM_PLAN.md §7 Phase 4) — until then this
    // function 503s, so it's safe to have deployed years before the Meshy
    // subscription exists.
    if (!expected) return new Response("Poller not configured", { status: 503 });
    if (token !== expected) return new Response("Unauthorized", { status: 401 });
  }

  const { data: minis } = await admin
    .from("minis")
    .select("id, user_id, format, status, meshy_task_id, glb_path, reservation_ids, credits_spent, sculpt_count, updated_at")
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
