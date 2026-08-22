<template>
  <!-- Trigger button in sidebar -->
  <AppButton
    variant="ghost"
    fill="muted"
    size="sm"
    block
    class="justify-start"
    :icon="IconShieldCheck"
    label="Admin"
    @click="open = true"
  />

  <!-- Panel -->
  <AppModal :open="open" size="md" @close="open = false">
    <ModalHeader title="Grimoire Admin" closeable @close="open = false" />

    <!-- Scrolls because the shell caps the panel at the viewport, where the
         old hand-rolled panel overflowed it. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
      <!-- SRD Art Defaults -->
      <LibraryArtPublishPanel variant="inline" />

      <div class="border-t border-border" />

      <!-- Generate new invite -->
      <div class="space-y-3">
        <h3 class="text-label-lg font-semibold text-muted-foreground uppercase">
          New Invite Link
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <AppInput
            v-model="newLabel"
            placeholder="Label (e.g. For John)"
            class="sm:col-span-2"
          />
          <AppInput
            v-model.number="newMaxUses"
            type="number"
            min="1"
            placeholder="Uses (default 1)"
          />
        </div>
        <!-- Plan picker -->
        <div class="flex items-center gap-1.5">
          <AppButton
            v-for="opt in planOptions"
            :key="opt.value"
            type="button"
            variant="tinted"
            size="sm"
            :tone="opt.tone"
            :emphasis="newGrantedPlan === opt.value ? 'strong' : 'outline'"
            :label="opt.label"
            @click="newGrantedPlan = opt.value"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="newExpiry"
            type="datetime-local"
            class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <AppButton
            variant="primary"
            size="sm"
            :icon="IconAdd"
            label="Generate"
            :disabled="createInvite.isPending.value"
            @click="handleCreate"
          />
        </div>
      </div>

      <!-- Existing invites -->
      <div class="space-y-2">
        <h3 class="text-label-lg font-semibold text-muted-foreground uppercase">
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
                <AppButton
                  v-if="invite.granted_plan !== 'free'"
                  as="span"
                  variant="tinted"
                  size="xs"
                  class="uppercase"
                  :tone="invite.granted_plan === 'admin' ? 'primary' : 'caution'"
                  :label="invite.granted_plan"
                />
              </div>
              <p class="text-caption text-muted-foreground italic">
                {{ invite.use_count }}{{ invite.max_uses ? `/${invite.max_uses}` : '' }} uses
                <span v-if="invite.expires_at"> · expires {{ formatDate(invite.expires_at) }}</span>
                <span v-if="isExpired(invite)" class="text-destructive"> · expired</span>
              </p>
            </div>
            <AppButton
              variant="ghost"
              fill="tone"
              tone="danger"
              size="icon-xs"
              class="shrink-0"
              :icon="IconDelete"
              tooltip="Delete invite link"
              :disabled="deleteInvite.isPending.value"
              @click="deleteInvite.mutate(invite.id)"
            />
          </div>
          <div class="flex items-center gap-2 rounded bg-background px-2 py-1.5">
            <code class="flex-1 text-xs text-muted-foreground truncate font-mono">
              {{ signupUrl(invite.token) }}
            </code>
            <AppButton
              variant="outline"
              size="xs"
              icon-size="xs"
              class="shrink-0"
              tone="success"
              :fill="copiedId === invite.id ? 'none' : 'muted'"
              :active="copiedId === invite.id"
              :icon="copiedId === invite.id ? IconCheck : IconCopy"
              :label="copiedId === invite.id ? 'Copied!' : 'Copy'"
              @click="copy(invite)"
            />
          </div>
        </div>

        <p v-if="!invitesQuery.isPending.value && invites.length === 0" class="text-caption text-muted-foreground italic">
          No active invite links.
        </p>
      </div>

      <div class="border-t border-border" />

      <!-- AI Usage Stats -->
      <div class="space-y-3">
        <h3 class="text-label-lg font-semibold text-muted-foreground uppercase">
          AI Usage Stats
        </h3>

        <div v-if="usageStats.isPending.value" class="text-center py-4">
          <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        </div>

        <template v-else>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
              <p class="text-heading-sm font-bold text-foreground">{{ usageStats.totalGenerations.value }}</p>
              <p class="text-caption text-muted-foreground italic">Total gens</p>
            </div>
            <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
              <p class="text-heading-sm font-bold text-foreground">${{ usageStats.totalEstimatedCostUsd.value.toFixed(2) }}</p>
              <p class="text-caption text-muted-foreground italic">Est. cost (USD)</p>
            </div>
            <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
              <p class="text-heading-sm font-bold text-foreground">{{ usageStats.byokCount.value }}</p>
              <p class="text-caption text-muted-foreground italic">BYOK gens</p>
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
                <span class="text-caption text-muted-foreground italic ml-1">· {{ stat.provider }}</span>
              </div>
              <span class="text-caption text-muted-foreground shrink-0">{{ stat.count }}×</span>
              <span class="font-cinzel text-xs text-foreground shrink-0 w-16 text-right">
                ${{ stat.estimated_cost_usd.toFixed(3) }}
              </span>
            </div>
          </div>

          <p v-else class="text-caption text-muted-foreground italic">
            No generation data yet.
          </p>
        </template>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconCheck, IconCopy, IconDelete, IconShieldCheck } from '@/lib/icons';
import { useAppInvites, useCreateAppInvite, useDeleteAppInvite } from "@/composables/useAppInvites";
import type { AppInvite } from "@/composables/useAppInvites";
import type { GrantedPlan } from "@/composables/useAppInvites";
import LibraryArtPublishPanel from "@/components/admin/LibraryArtPublishPanel.vue";
import { useAiUsageStats } from "@/composables/useAiUsageStats";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { ButtonTone } from "@/components/common/appButtonVariants";

const open = ref(false);
const invitesQuery = useAppInvites();
const usageStats = useAiUsageStats();
const createInvite = useCreateAppInvite();
const deleteInvite = useDeleteAppInvite();

const invites = computed(() => invitesQuery.data.value ?? []);

const newLabel = ref("");
const newExpiry = ref("");
const newMaxUses = ref<number | null>(1);
const newGrantedPlan = ref<GrantedPlan>("free");

const planOptions: { value: GrantedPlan; label: string; tone: ButtonTone }[] = [
  { value: "free",   label: "Free",   tone: "neutral" },
  { value: "tester", label: "Tester", tone: "caution" },
  { value: "admin",  label: "Admin",  tone: "primary" },
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

async function copy(invite: AppInvite) {
  await navigator.clipboard.writeText(signupUrl(invite.token));
  copiedId.value = invite.id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}
</script>
