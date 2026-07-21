<template>
  <!-- Trigger button in sidebar -->
  <button
    class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-navy-800 transition-colors font-cinzel tracking-wide"
    @click="open = true"
  >
    <IconShieldCheck class="h-3.5 w-3.5 shrink-0" />
    Admin
  </button>

  <!-- Panel -->
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="open = false"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-xl shadow-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-base font-bold text-foreground">Grimoire Admin</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="open = false"
          >
            ✕
          </button>
        </div>

        <div class="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <!-- SRD Art Defaults -->
          <div class="space-y-2">
            <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              SRD Art Defaults
            </h3>
            <p class="font-fell text-xs text-muted-foreground italic">
              Publish your uploaded SRD art as community defaults. Other DMs will see your images
              for any SRD content they haven't personalised. Re-running is safe — it updates
              existing defaults with your latest images.
            </p>
            <div v-if="statsQuery.data.value" class="font-fell text-xs text-foreground">
              Currently published:
              <span class="font-semibold">{{ statsQuery.data.value.monsters }}</span> monsters ·
              <span class="font-semibold">{{ statsQuery.data.value.spells }}</span> spells ·
              <span class="font-semibold">{{ statsQuery.data.value.items }}</span> items
            </div>
            <div v-if="publishResult" class="font-fell text-xs text-elven-green">
              Done — {{ publishResult.monsters }} monsters · {{ publishResult.spells }} spells ·
              {{ publishResult.items }} items published.
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="bulkPublish.isPending.value"
              @click="handlePublishArt"
            >
              <IconUpload class="h-3.5 w-3.5" />
              {{ bulkPublish.isPending.value ? 'Publishing…' : 'Publish all my SRD art' }}
            </button>
          </div>

          <div class="border-t border-border" />

          <!-- Generate new invite -->
          <div class="space-y-3">
            <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              New Invite Link
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                v-model="newLabel"
                type="text"
                placeholder="Label (e.g. For John)"
                class="sm:col-span-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                v-model.number="newMaxUses"
                type="number"
                min="1"
                placeholder="Uses (default 1)"
                class="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <!-- Plan picker -->
            <div class="flex items-center gap-1.5">
              <button
                v-for="opt in planOptions"
                :key="opt.value"
                type="button"
                class="px-3 py-1 rounded-md font-cinzel text-[0.6875rem] font-semibold tracking-wider border transition-colors"
                :class="newGrantedPlan === opt.value
                  ? opt.activeClass
                  : 'border-border text-muted-foreground hover:text-foreground'"
                @click="newGrantedPlan = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="newExpiry"
                type="datetime-local"
                class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
                :disabled="createInvite.isPending.value"
                @click="handleCreate"
              >
                <IconAdd class="h-3.5 w-3.5" />
                Generate
              </button>
            </div>
          </div>

          <!-- Existing invites -->
          <div class="space-y-2">
            <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Active Links
            </h3>

            <div v-if="invitesQuery.isPending.value" class="text-center py-4">
              <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            </div>

            <div
              v-for="invite in invites"
              :key="invite.id"
              class="rounded-md border border-border bg-muted/30 p-3 space-y-2"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-2">
                    <p v-if="invite.label" class="font-cinzel text-xs font-semibold text-foreground">
                      {{ invite.label }}
                    </p>
                    <span
                      v-if="invite.granted_plan !== 'free'"
                      class="px-1.5 py-0.5 rounded text-eyebrow font-semibold"
                      :class="invite.granted_plan === 'admin'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-500/10 text-amber-400'"
                    >{{ invite.granted_plan }}</span>
                  </div>
                  <p class="font-fell text-xs text-muted-foreground italic">
                    {{ invite.use_count }}{{ invite.max_uses ? `/${invite.max_uses}` : '' }} uses
                    <span v-if="invite.expires_at"> · expires {{ formatDate(invite.expires_at) }}</span>
                    <span v-if="isExpired(invite)" class="text-destructive"> · expired</span>
                  </p>
                </div>
                <button
                  class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  :disabled="deleteInvite.isPending.value"
                  @click="deleteInvite.mutate(invite.id)"
                >
                  <IconDelete class="h-3.5 w-3.5" />
                </button>
              </div>
              <div class="flex items-center gap-2 rounded bg-background px-2 py-1.5">
                <code class="flex-1 text-[0.6875rem] text-muted-foreground truncate font-mono">
                  {{ signupUrl(invite.token) }}
                </code>
                <button
                  class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-cinzel tracking-wide transition-colors"
                  :class="copiedId === invite.id
                    ? 'bg-elven-green/20 text-elven-green'
                    : 'border border-border text-foreground hover:bg-muted'"
                  @click="copy(invite)"
                >
                  <IconCheck v-if="copiedId === invite.id" class="h-3 w-3" />
                  <IconCopy v-else class="h-3 w-3" />
                  {{ copiedId === invite.id ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <p v-if="!invitesQuery.isPending.value && invites.length === 0" class="font-fell text-xs text-muted-foreground italic">
              No active invite links.
            </p>
          </div>

          <div class="border-t border-border" />

          <!-- AI Usage Stats -->
          <div class="space-y-3">
            <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              AI Usage Stats
            </h3>

            <div v-if="usageStats.isPending.value" class="text-center py-4">
              <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            </div>

            <template v-else>
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
                  <p class="font-cinzel text-base font-bold text-foreground">{{ usageStats.totalGenerations.value }}</p>
                  <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Total gens</p>
                </div>
                <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
                  <p class="font-cinzel text-base font-bold text-foreground">${{ usageStats.totalEstimatedCostUsd.value.toFixed(2) }}</p>
                  <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Est. cost (USD)</p>
                </div>
                <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
                  <p class="font-cinzel text-base font-bold text-foreground">{{ usageStats.byokCount.value }}</p>
                  <p class="font-fell text-[0.6875rem] text-muted-foreground italic">BYOK gens</p>
                </div>
              </div>

              <div v-if="usageStats.modelStats.value.length" class="space-y-1">
                <div
                  v-for="stat in usageStats.modelStats.value"
                  :key="stat.model"
                  class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
                >
                  <div class="flex-1 min-w-0">
                    <span class="font-cinzel text-xs font-semibold text-foreground">{{ stat.model }}</span>
                    <span class="font-fell text-[0.6875rem] text-muted-foreground italic ml-1">· {{ stat.provider }}</span>
                  </div>
                  <span class="font-fell text-xs text-muted-foreground shrink-0">{{ stat.count }}×</span>
                  <span class="font-cinzel text-xs text-foreground shrink-0 w-16 text-right">
                    ${{ stat.estimated_cost_usd.toFixed(3) }}
                  </span>
                </div>
              </div>

              <p v-else class="font-fell text-xs text-muted-foreground italic">
                No generation data yet.
              </p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconCheck, IconCopy, IconDelete, IconShieldCheck, IconUpload } from '@/lib/icons';
import { useAppInvites, useCreateAppInvite, useDeleteAppInvite } from "@/composables/useAppInvites";
import type { AppInvite } from "@/composables/useAppInvites";
import type { GrantedPlan } from "@/composables/useAppInvites";
import { useBulkPublishSrdArtDefaults, useSrdArtDefaultStats, useSyncSrdSpellArtToSharedTable } from "@/composables/useSrdArtDefaults";
import type { SrdArtDefaultStats } from "@/composables/useSrdArtDefaults";
import { useBulkMarkSrdMonsterArtAsCanonical, useSyncSrdArtToSharedTable } from "@/composables/useSrdMonsterArt";
import { useBulkMarkSrdSpellArtAsCanonical } from "@/composables/useSrdSpellArt";
import { useAiUsageStats } from "@/composables/useAiUsageStats";

const open = ref(false);
const invitesQuery = useAppInvites();
const usageStats = useAiUsageStats();
const createInvite = useCreateAppInvite();
const deleteInvite = useDeleteAppInvite();
const statsQuery = useSrdArtDefaultStats();
const bulkPublish = useBulkPublishSrdArtDefaults();
const bulkMarkMonsters  = useBulkMarkSrdMonsterArtAsCanonical();
const bulkMarkSpells    = useBulkMarkSrdSpellArtAsCanonical();
const syncArtToShared   = useSyncSrdArtToSharedTable();
const syncSpellArt      = useSyncSrdSpellArtToSharedTable();
const publishResult = ref<SrdArtDefaultStats | null>(null);

const invites = computed(() => invitesQuery.data.value ?? []);

const newLabel = ref("");
const newExpiry = ref("");
const newMaxUses = ref<number | null>(1);
const newGrantedPlan = ref<GrantedPlan>("free");

const planOptions: { value: GrantedPlan; label: string; activeClass: string }[] = [
  { value: "free",   label: "Free",   activeClass: "border-border bg-muted text-foreground" },
  { value: "tester", label: "Tester", activeClass: "border-amber-500/50 bg-amber-500/10 text-amber-400" },
  { value: "admin",  label: "Admin",  activeClass: "border-primary/50 bg-primary/10 text-primary" },
];
const copiedId = ref<string | null>(null);

function signupUrl(token: string) {
  return `${window.location.origin}/signup?token=${token}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function isExpired(invite: AppInvite) {
  return !!invite.expires_at && new Date(invite.expires_at) < new Date();
}

function handleCreate() {
  const payload: Parameters<typeof createInvite.mutate>[0] = {};
  if (newLabel.value.trim()) payload.label = newLabel.value.trim();
  if (newExpiry.value) payload.expires_at = new Date(newExpiry.value).toISOString();
  payload.max_uses = newMaxUses.value ?? 1;
  payload.granted_plan = newGrantedPlan.value;
  createInvite.mutate(payload, {
    onSuccess: () => {
      newLabel.value = "";
      newExpiry.value = "";
      newMaxUses.value = 1;
      newGrantedPlan.value = "free";
    },
  });
}

async function handlePublishArt() {
  publishResult.value = null;
  const [monsterCount, spellArtCount, contentResult] = await Promise.all([
    bulkMarkMonsters.mutateAsync(),
    bulkMarkSpells.mutateAsync(),
    bulkPublish.mutateAsync(),
  ]);
  // Sync canonical art into shared SRD tables
  await Promise.all([
    syncArtToShared.mutateAsync(),
    syncSpellArt.mutateAsync(),
  ]);
  publishResult.value = { monsters: monsterCount, spells: contentResult.spells + spellArtCount, items: contentResult.items };
  statsQuery.refetch();
}

async function copy(invite: AppInvite) {
  await navigator.clipboard.writeText(signupUrl(invite.token));
  copiedId.value = invite.id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}
</script>
