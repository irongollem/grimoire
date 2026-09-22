import { computed, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { readEmbeddedXmp, inheritXmpIntoVariant } from "@/lib/storage";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import { normalizeGeneratedTile, decodeBase64 } from "@/cartographer/normalizeGeneratedTile";
import { styleReferenceFrom } from "@/cartographer/styleReference";
import { rotateTile } from "@/cartographer/rotateTile";
import { rotationsOf } from "@/cartographer/authoringPlan";
import { preparePackUpload } from "@/cartographer/packUpload";
import { invokeTilePackGenerator as invoke } from "./tilePackGenerator";
import { LIBRARY_PACKS_KEY } from "./useLibraryTilePacks";
import type { TilePackGenerationJob, TilePackGenerationRun, UserTilePack } from "@/cartographer/userPack.types";
import { cloneManifest } from "@/cartographer/cloneManifest";

const PACKS_KEY = "user-tile-packs";
const RUNS_KEY = "tile-pack-generation-runs";

async function fetchPacks(): Promise<UserTilePack[]> {
  const { data, error } = await supabase.from("user_tile_packs")
    .select("*, campaign_tile_packs(campaign_id)").order("updated_at", { ascending: false });
  if (error) throw error;
  return data as UserTilePack[];
}

async function fetchRuns(): Promise<(TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] })[]> {
  const { data, error } = await supabase.from("tile_pack_generation_runs")
    .select("*, user_tile_packs(*), tile_pack_generation_jobs(*)").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as (TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] })[];
}

async function fetchRun(id: string): Promise<TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] }> {
  const { data, error } = await supabase.from("tile_pack_generation_runs")
    .select("*, user_tile_packs(*), tile_pack_generation_jobs(*)").eq("id", id).single();
  if (error) throw error;
  return data as TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };
}

function namespacedPackId(packId: string, userId: string): string {
  const base = packId.replace(/^custom-/, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `custom-${base}-${userId.slice(0, 8)}`;
}

async function uploadPrepared(files: File[]): Promise<UserTilePack> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const prepared = await preparePackUpload(files);
  const manifest = structuredClone(prepared.manifest);
  manifest.pack_id = namespacedPackId(manifest.pack_id, user.id);
  const registered = await invoke<{ pack: UserTilePack }>({ action: "register_upload", manifest });
  const prefix = `${user.id}/${manifest.pack_id}/v${manifest.pack_version}`;
  const uploaded: string[] = [];
  try {
    for (const [relative, blob] of prepared.assets) {
      const objectPath = `${prefix}/${relative}`;
      const { error } = await supabase.storage.from("tile-packs").upload(objectPath, blob, { contentType: "image/webp" });
      if (error) throw error;
      uploaded.push(objectPath);
    }
    const manifestPath = `${prefix}/manifest.json`;
    const { error } = await supabase.storage.from("tile-packs").upload(
      manifestPath,
      new Blob([JSON.stringify(manifest)], { type: "application/json" }),
      { contentType: "application/json" },
    );
    if (error) throw error;
    uploaded.push(manifestPath);
    const finalized = await invoke<{ pack: UserTilePack }>({ action: "finalize_upload", pack_id: registered.pack.id });
    return finalized.pack;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from("tile-packs").remove(uploaded);
    await supabase.from("user_tile_packs").delete().eq("id", registered.pack.id);
    throw error;
  }
}

export async function loadUserPack(pack: UserTilePack): Promise<TilePackRuntime> {
  const manifest = cloneManifest(pack.manifest);
  const paths: string[] = [];
  const slots: { url: string }[] = [];
  for (const entries of Object.values(manifest.assets)) {
    for (const slot of entries ?? []) {
      paths.push(`${pack.user_id}/${pack.pack_id}/v${pack.pack_version}/${slot.url}`);
      slots.push(slot);
    }
  }
  const { data, error } = await supabase.storage.from("tile-packs").createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  data.forEach((signed, index) => {
    if (!signed.signedUrl) throw new Error(`Could not sign ${paths[index]}`);
    slots[index]!.url = signed.signedUrl;
  });
  const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  try { return await loadPack(manifestUrl); } finally { URL.revokeObjectURL(manifestUrl); }
}

export function useTilePacks(campaignId?: Ref<string | null>, includeRuns = true) {
  const queryClient = useQueryClient();
  const packs = useQuery({ queryKey: [PACKS_KEY], queryFn: fetchPacks });
  const runs = useQuery({
    queryKey: [RUNS_KEY],
    queryFn: fetchRuns,
    enabled: includeRuns,
    refetchInterval: includeRuns ? 5_000 : false,
  });

  const upload = useMutation({
    mutationFn: uploadPrepared,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
  });
  const share = useMutation({
    mutationFn: async ({ packId, campaign, enabled }: { packId: string; campaign: string; enabled: boolean }) => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      if (enabled) {
        const { error } = await supabase.from("campaign_tile_packs").insert({ campaign_id: campaign, tile_pack_id: packId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("campaign_tile_packs").delete().eq("campaign_id", campaign).eq("tile_pack_id", packId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
  });
  const remove = useMutation({
    mutationFn: (packId: string) => invoke<{ deleted: true }>({ action: "delete_pack", pack_id: packId }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] }),
    ]),
  });
  const createRun = useMutation({
    mutationFn: (input: { name: string; description: string; campaignId: string }) => invoke<{ run_id: string }>({
      action: "create", name: input.name, description: input.description, campaign_id: input.campaignId,
    }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] }),
    ]),
  });

  async function toBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function runJob(run: TilePackGenerationRun, job: TilePackGenerationJob): Promise<void> {
    const generated = await invoke<{ image_b64: string; content_type: string }>({ action: "generate", run_id: run.id, job_id: job.id });
    const normalized = await normalizeGeneratedTile({
      imageB64: generated.image_b64,
      contentType: generated.content_type,
      mechanics: job.job.mechanics,
      slot: job.job.slot,
    });
    // The edge function already marked `generated.image_b64` with provenance
    // (EU AI Act Art 50) before sending it here — but normalizeGeneratedTile
    // canvas-decodes and re-encodes the tile (`canvasToWebp`), and canvas
    // never preserves embedded metadata, so the XMP packet does not survive
    // that trip. It has to be read back out of the still-marked source and
    // re-embedded into the freshly-encoded normalized blob, which is always
    // webp regardless of the source format — the same inheritance the image
    // library uses for canvas-resized variants (`src/lib/storage/upload.ts`).
    const sourceBytes = decodeBase64(generated.image_b64);
    const sourceXmp = await readEmbeddedXmp(new Blob([sourceBytes.buffer as ArrayBuffer], { type: generated.content_type }));
    const markedNormalized = await inheritXmpIntoVariant(normalized, sourceXmp);
    // Proof slots become the style references for every pack-phase call, so the
    // 256px reduction is built here while the raw is already decoded — the edge
    // runtime has no image library, and at full resolution those references cost
    // several times the tile they help produce. Purely an internal generation
    // input (never shown to any user), so it carries no provenance of its own.
    const styleRef = job.phase === "proof"
      ? await styleReferenceFrom(generated.image_b64, generated.content_type)
      : null;
    await invoke({
      action: "complete",
      run_id: run.id,
      job_id: job.id,
      image_b64: await toBase64(markedNormalized),
      ...(styleRef ? { style_ref_b64: await toBase64(styleRef) } : {}),
    });
    // Slots that are this one turned a quarter, half or three-quarter turn.
    // A vertical wall is the horizontal wall rotated; rendering it separately
    // costs a second call and lets the two drift — `celestial-observatory` was
    // authored tile by tile with a human approving each and still ended up with
    // 22px horizontal walls against 14px vertical ones. The plan never makes
    // jobs for these (`createGenerationPlan` collapses them onto the source),
    // so they are produced here and written by `complete_rotation`, which
    // re-checks against the same table that the slot really is a rotation of
    // this job's.
    //
    // Rotation happens client-side for the same reason normalization does: the
    // edge runtime has no image library. The marked, normalized blob is the
    // input, so the derived tile inherits the source's provenance packet rather
    // than claiming a render of its own.
    for (const derived of rotationsOf(job.job.id)) {
      // Canvas drops embedded metadata, so the turn loses the XMP packet the
      // same way normalization does a few lines above — and a derived tile is
      // still AI output, so it still owes the EU AI Act Art 50 disclosure. Its
      // provenance is re-inherited from the marked source rather than rebuilt:
      // it records the render that actually produced these pixels, which is
      // the source's, because a rotation is not a second generation.
      const turned = await inheritXmpIntoVariant(
        await rotateTile(markedNormalized, derived.degrees),
        await readEmbeddedXmp(markedNormalized),
      );
      await invoke({
        action: "complete_rotation",
        run_id: run.id,
        job_id: job.id,
        slot_id: derived.id,
        image_b64: await toBase64(turned),
      });
    }
    await refreshAfterJob();
  }

  async function runNext(run: TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] }): Promise<boolean> {
    const phase = run.status === "proof_pending" ? "proof" : run.status === "generating" ? "pack" : null;
    const next = run.tile_pack_generation_jobs.sort((a, b) => a.ordinal - b.ordinal)
      .find((job) => job.phase === phase && job.status === "pending");
    if (!next) return false;
    await runJob(run, next);
    return true;
  }

  /**
   * Both lanes' pack rows, plus the runs.
   *
   * A completed tile writes its bytes and patches the owning pack's manifest
   * server-side, so the row the editor renders from is stale the moment a job
   * finishes — and this loop drives library runs as well as user ones (the
   * edge function resolves the lane from the run row, so the caller does not
   * say which). Invalidating only `user-tile-packs` is what made a library
   * run report "completed 16/16" over a grid of blank cells that filled in
   * only on a page refresh.
   */
  async function refreshAfterJob(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [LIBRARY_PACKS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] }),
    ]);
  }

  async function runUntilPause(runId: string): Promise<void> {
    while (true) {
      const current = await fetchRun(runId);
      if (current.cancel_requested || !["proof_pending", "generating"].includes(current.status)) break;
      if (!(await runNext(current))) break;
    }
    await refreshAfterJob();
  }

  async function action(runId: string, actionName: "approve_proof" | "cancel" | "retry_job" | "regenerate_job", jobId?: string): Promise<void> {
    await invoke({ action: actionName, run_id: runId, ...(jobId ? { job_id: jobId } : {}) });
    await refreshAfterJob();
  }

  async function signJobAssets(jobs: TilePackGenerationJob[]): Promise<{ jobId: string; url: string }[]> {
    const stored = jobs.flatMap((job) => job.normalized_path ? [{ jobId: job.id, path: job.normalized_path }] : []);
    if (!stored.length) return [];
    const { data, error } = await supabase.storage.from("tile-packs").createSignedUrls(stored.map((item) => item.path), 60 * 60);
    if (error) throw error;
    return data.flatMap((entry, index) => entry.signedUrl ? [{ jobId: stored[index]!.jobId, url: entry.signedUrl }] : []);
  }

  const campaignPacks = computed(() => campaignId?.value
    ? (packs.data.value ?? []).filter((pack) => pack.user_id === getCurrentUser()?.id || pack.campaign_tile_packs?.some((share) => share.campaign_id === campaignId.value))
    : (packs.data.value ?? []));
  return { packs, campaignPacks, runs, upload, share, remove, createRun, runNext, runUntilPause, action, signJobAssets };
}
