<template>
  <PageHeader title="Tile Packs" description="Upload a validated pack, generate one from a theme, or share it with your active campaign.">
    <template #title-suffix>
      <ManualHelpLink page="cartographer-tile-packs" />
    </template>
    <template #actions>
      <AppButton variant="outline" label="Back to maps" @click="router.push('/cartographer')" />
    </template>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
      <section class="space-y-4">
        <div class="rounded-xl border border-border bg-card p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-cinzel text-heading-sm text-foreground">Available packs</h2>
              <p class="mt-1 text-body-sm text-muted-foreground">Your packs and read-only packs shared through the active campaign.</p>
            </div>
            <span class="text-caption text-muted-foreground">{{ campaignPacks.length }} pack(s)</span>
          </div>
          <div v-if="campaignPacks.length" class="mt-4 grid gap-3 sm:grid-cols-2">
            <article v-for="pack in campaignPacks" :key="pack.id" class="rounded-lg border border-border bg-background/40 p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="truncate text-label-lg text-foreground">{{ pack.name }}</h3>
                  <p class="text-caption text-muted-foreground">v{{ pack.pack_version }} · {{ pack.source }} · {{ pack.status }}</p>
                </div>
                <span v-if="pack.user_id !== userId" class="rounded-full bg-muted px-2 py-0.5 text-caption-sm text-muted-foreground">Read only</span>
              </div>
              <p class="mt-2 line-clamp-2 text-body-xs text-muted-foreground">{{ pack.description || "No description" }}</p>
              <AppCheckbox
                v-if="pack.user_id === userId && activeCampaignId"
                class="mt-3"
                :model-value="isShared(pack)"
                label="Share with active campaign"
                :disabled="share.isPending.value"
                @update:model-value="toggleShare(pack, $event)"
              />
              <AppButton
                v-if="pack.user_id === userId"
                class="mt-3"
                variant="destructive"
                size="caption"
                label="Delete pack"
                :disabled="remove.isPending.value"
                @click="deletePack(pack)"
              />
            </article>
          </div>
          <p v-else class="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-body-sm text-muted-foreground">
            No custom packs yet.
          </p>
        </div>

        <div v-if="isPro" class="rounded-xl border border-border bg-card p-4">
          <h2 class="font-cinzel text-heading-sm text-foreground">Upload a pack</h2>
          <p class="mt-1 text-body-sm text-muted-foreground">Choose a zip or a folder containing manifest.json and exact 128×128 WebP assets.</p>
          <div class="mt-4 flex flex-wrap gap-3">
            <label class="cursor-pointer rounded-md border border-border bg-muted px-3 py-2 text-label text-foreground hover:bg-muted/70">
              Choose zip
              <input class="sr-only" type="file" accept=".zip,application/zip" @change="onUploadFiles" />
            </label>
            <label class="cursor-pointer rounded-md border border-border bg-muted px-3 py-2 text-label text-foreground hover:bg-muted/70">
              Choose folder
              <input class="sr-only" type="file" webkitdirectory multiple @change="onUploadFiles" />
            </label>
          </div>
          <p v-if="uploadMessage" class="mt-3 text-body-xs" :class="uploadError ? 'text-red-500' : 'text-emerald-500'">{{ uploadMessage }}</p>
        </div>
      </section>

      <section class="space-y-4">
        <div v-if="!isPro" class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 class="font-cinzel text-heading-sm text-foreground">Custom creation is a Pro feature</h2>
          <p class="mt-2 text-body-sm text-muted-foreground">Campaign-shared packs remain available read-only. Upgrade to upload or generate your own.</p>
          <AppButton class="mt-4" variant="primary" label="View plans" @click="router.push('/billing')" />
        </div>

        <div v-else class="rounded-xl border border-border bg-card p-4">
          <h2 class="font-cinzel text-heading-sm text-foreground">Generate a complete pack</h2>
          <p class="mt-1 text-body-sm text-muted-foreground">GPT Image 2 low generates three reusable proof assets first. Approve the family, then the remaining schema jobs continue.</p>
          <div class="mt-4 space-y-3">
            <label class="block">
              <span class="mb-1 block text-label text-muted-foreground">Concept name</span>
              <AppInput v-model="conceptName" placeholder="Moonlit elven observatory" maxlength="100" />
            </label>
            <label class="block">
              <span class="mb-1 block text-label text-muted-foreground">Description</span>
              <textarea v-model="conceptDescription" maxlength="1000" rows="4" class="w-full rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground" placeholder="Materials, motifs, palette, mood…" />
            </label>
            <p v-if="!activeCampaignId" class="text-caption text-amber-500">Select an active campaign before generating.</p>
            <AppButton
              variant="primary"
              block
              label="Create generation run"
              :disabled="!conceptName.trim() || !activeCampaignId || createRun.isPending.value"
              @click="startRun"
            />
          </div>
        </div>

        <div v-if="runList.length" class="rounded-xl border border-border bg-card p-4">
          <h2 class="font-cinzel text-heading-sm text-foreground">Generation runs</h2>
          <div class="mt-4 space-y-4">
            <article v-for="run in runList" :key="run.id" class="rounded-lg border border-border bg-background/40 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-label-lg text-foreground">{{ run.user_tile_packs?.name ?? "Tile pack" }}</h3>
                  <p class="text-caption text-muted-foreground">{{ run.status.replaceAll('_', ' ') }} · {{ run.completed_jobs }}/{{ run.total_jobs }} · {{ run.charged_credits }} credits</p>
                </div>
                <AppButton
                  v-if="canCancel(run.status)"
                  variant="ghost"
                  size="caption"
                  label="Cancel"
                  @click="cancelRun(run.id)"
                />
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full bg-primary transition-[width]" :style="{ width: `${Math.round(run.completed_jobs / run.total_jobs * 100)}%` }" />
              </div>
              <p v-if="runError[run.id]" class="mt-2 text-caption text-red-500">{{ runError[run.id] }}</p>
              <div v-if="run.status === 'awaiting_approval'" class="mt-3">
                <div v-if="proofUrls[run.id]?.length" class="mb-3 grid grid-cols-3 gap-2">
                  <div v-for="proof in proofUrls[run.id]" :key="proof.jobId" class="space-y-1">
                    <img
                      :src="proof.url"
                      alt="Generated tile-pack style proof"
                      class="aspect-square w-full rounded-md border border-border bg-black/20 object-contain [image-rendering:pixelated]"
                    />
                    <AppButton variant="ghost" size="caption" block label="Regenerate" @click="regenerateProof(run.id, proof.jobId)" />
                  </div>
                </div>
                <p class="text-body-xs text-muted-foreground">The floor, wall, and solid-block proofs passed normalization. Approve this visual family before spending credits on the rest.</p>
                <AppButton class="mt-2" variant="primary" size="sm" label="Approve and generate pack" @click="approveAndRun(run.id)" />
              </div>
              <AppButton
                v-else-if="run.status === 'proof_pending' || run.status === 'generating'"
                class="mt-3"
                variant="outline"
                size="sm"
                :label="runningId === run.id ? 'Generating…' : run.status === 'proof_pending' ? 'Generate proof' : 'Continue generation'"
                :disabled="runningId === run.id"
                @click="continueRun(run.id)"
              />
              <div v-if="failedJobs(run).length" class="mt-3 space-y-1">
                <div v-for="job in failedJobs(run)" :key="job.id" class="flex items-center justify-between gap-2 text-caption">
                  <span class="truncate text-red-500">{{ job.slot_id }}: {{ job.error }}</span>
                  <AppButton variant="ghost" size="caption" label="Retry" @click="retryJob(run.id, job.id)" />
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import { useSubscription } from "@/composables/useSubscription";
import { useTilePacks } from "@/composables/useTilePacks";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useConfirm } from "@/composables/useConfirm";
import type { GenerationRunStatus, TilePackGenerationJob, TilePackGenerationRun, UserTilePack } from "@/cartographer/userPack.types";

type RunWithJobs = TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };

const router = useRouter();
const auth = useAuthStore();
const campaign = useCampaignStore();
const { isPro } = useSubscription();
const activeCampaignId = computed(() => campaign.activeCampaignId);
const userId = computed(() => auth.user?.id ?? "");
const { confirm } = useConfirm();
const { campaignPacks, runs, upload, share, remove, createRun, runUntilPause, action, signJobAssets } = useTilePacks(activeCampaignId);
const runList = computed(() => runs.data.value ?? []);
const conceptName = ref("");
const conceptDescription = ref("");
const uploadMessage = ref("");
const uploadError = ref(false);
const runningId = ref("");
const runError = reactive<Record<string, string>>({});
const proofUrls = reactive<Record<string, { jobId: string; url: string }[]>>({});

watch(runList, async (items) => {
  for (const run of items) {
    if (run.status !== "awaiting_approval" || proofUrls[run.id]?.length) continue;
    try {
      proofUrls[run.id] = await signJobAssets(run.tile_pack_generation_jobs.filter((job) => job.phase === "proof"));
    } catch (error) {
      runError[run.id] = error instanceof Error ? error.message : "Could not load proof images";
    }
  }
}, { immediate: true });

function isShared(pack: UserTilePack): boolean {
  return !!activeCampaignId.value && !!pack.campaign_tile_packs?.some((entry) => entry.campaign_id === activeCampaignId.value);
}

async function toggleShare(pack: UserTilePack, enabled: boolean): Promise<void> {
  if (!activeCampaignId.value) return;
  await share.mutateAsync({ packId: pack.id, campaign: activeCampaignId.value, enabled });
}

async function deletePack(pack: UserTilePack): Promise<void> {
  const accepted = await confirm(`Delete ${pack.name} and all of its stored assets? Maps that use it will fall back until another pack is selected.`, {
    title: "Delete tile pack?",
    confirmLabel: "Delete pack",
  });
  if (accepted) await remove.mutateAsync(pack.id);
}

async function onUploadFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  uploadMessage.value = "Validating pack…";
  uploadError.value = false;
  try {
    const pack = await upload.mutateAsync(files);
    uploadMessage.value = `${pack.name} uploaded successfully.`;
  } catch (error) {
    uploadError.value = true;
    uploadMessage.value = error instanceof Error ? error.message : "Upload failed";
  }
}

async function startRun(): Promise<void> {
  if (!activeCampaignId.value) return;
  const result = await createRun.mutateAsync({ name: conceptName.value.trim(), description: conceptDescription.value.trim(), campaignId: activeCampaignId.value });
  conceptName.value = "";
  conceptDescription.value = "";
  await continueRun(result.run_id);
}

async function continueRun(id: string): Promise<void> {
  runningId.value = id;
  runError[id] = "";
  try { await runUntilPause(id); }
  catch (error) { runError[id] = error instanceof Error ? error.message : "Generation failed"; }
  finally { runningId.value = ""; }
}

async function approveAndRun(id: string): Promise<void> {
  await action(id, "approve_proof");
  await continueRun(id);
}

async function cancelRun(id: string): Promise<void> {
  await action(id, "cancel");
}

async function retryJob(runId: string, jobId: string): Promise<void> {
  await action(runId, "retry_job", jobId);
  await continueRun(runId);
}

async function regenerateProof(runId: string, jobId: string): Promise<void> {
  proofUrls[runId] = [];
  await action(runId, "regenerate_job", jobId);
  await continueRun(runId);
}

function failedJobs(run: RunWithJobs): TilePackGenerationJob[] {
  return run.tile_pack_generation_jobs.filter((job) => job.status === "failed");
}

function canCancel(status: GenerationRunStatus): boolean {
  return !["completed", "cancelled", "failed"].includes(status);
}
</script>
