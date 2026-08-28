import { computed, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import { normalizeGeneratedTile } from "@/cartographer/normalizeGeneratedTile";
import { styleReferenceFrom } from "@/cartographer/styleReference";
import { preparePackUpload } from "@/cartographer/packUpload";
import type { TilePackGenerationJob, TilePackGenerationRun, UserTilePack } from "@/cartographer/userPack.types";
import type { TilePackManifest } from "@/cartographer/packSchema";

const PACKS_KEY = "user-tile-packs";
const RUNS_KEY = "tile-pack-generation-runs";

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tile-pack-generator", { body });
  if (error) throw new Error((data as { error?: string } | null)?.error ?? error.message);
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

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
  const manifest = structuredClone(pack.manifest) as TilePackManifest;
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
    // Proof slots become the style references for every pack-phase call, so the
    // 256px reduction is built here while the raw is already decoded — the edge
    // runtime has no image library, and at full resolution those references cost
    // several times the tile they help produce.
    const styleRef = job.phase === "proof"
      ? await styleReferenceFrom(generated.image_b64, generated.content_type)
      : null;
    await invoke({
      action: "complete",
      run_id: run.id,
      job_id: job.id,
      image_b64: await toBase64(normalized),
      ...(styleRef ? { style_ref_b64: await toBase64(styleRef) } : {}),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [PACKS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] }),
    ]);
  }

  async function runNext(run: TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] }): Promise<boolean> {
    const phase = run.status === "proof_pending" ? "proof" : run.status === "generating" ? "pack" : null;
    const next = run.tile_pack_generation_jobs.sort((a, b) => a.ordinal - b.ordinal)
      .find((job) => job.phase === phase && job.status === "pending");
    if (!next) return false;
    await runJob(run, next);
    return true;
  }

  async function runUntilPause(runId: string): Promise<void> {
    while (true) {
      const current = await fetchRun(runId);
      if (current.cancel_requested || !["proof_pending", "generating"].includes(current.status)) break;
      if (!(await runNext(current))) break;
    }
    await queryClient.invalidateQueries({ queryKey: [RUNS_KEY] });
  }

  async function action(runId: string, actionName: "approve_proof" | "cancel" | "retry_job" | "regenerate_job", jobId?: string): Promise<void> {
    await invoke({ action: actionName, run_id: runId, ...(jobId ? { job_id: jobId } : {}) });
    await queryClient.invalidateQueries({ queryKey: [RUNS_KEY] });
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
