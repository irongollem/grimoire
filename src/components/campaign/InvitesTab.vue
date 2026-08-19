<template>
  <div class="space-y-6 max-w-3xl">
    <!-- Create new invite -->
    <div class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">
        New Invite Link
      </h3>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <!-- Label -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground italic">Label (optional)</label>
          <AppInput
            v-model="newLabel"
            type="text"
            placeholder="e.g. For Alice"
            size="body"
          />
        </div>

        <!-- Expiry -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground italic">Expires (optional)</label>
          <input
            v-model="newExpiry"
            type="datetime-local"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <!-- Max uses -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground italic">Max uses (optional)</label>
          <AppInput
            v-model.number="newMaxUses"
            type="number"
            min="1"
            placeholder="Unlimited"
            size="body"
          />
        </div>
      </div>

      <AppButton
        variant="primary"
        size="lg"
        :icon="IconAdd"
        icon-size="md"
        :disabled="createInvite.isPending.value"
        @click="handleCreate"
      >
        {{ createInvite.isPending.value ? 'Generating…' : 'Generate Link' }}
      </AppButton>
    </div>

    <!-- Existing invites -->
    <div v-if="invitesQuery.isPending.value" class="text-center py-8">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div
        v-for="invite in invites"
        :key="invite.id"
        class="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5 min-w-0">
            <p v-if="invite.label" class="font-cinzel text-sm font-semibold text-foreground">
              {{ invite.label }}
            </p>
            <p class="text-caption text-muted-foreground italic space-x-3">
              <span>{{ invite.use_count }}{{ invite.max_uses ? `/${invite.max_uses}` : '' }} uses</span>
              <span v-if="invite.expires_at">· Expires {{ formatDate(invite.expires_at) }}</span>
              <span v-if="isExpired(invite)" class="text-destructive">· Expired</span>
            </p>
          </div>
          <AppButton
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            fill="tone"
            tone="danger"
            :icon="IconDelete"
            tooltip="Revoke invite"
            :disabled="revokeInvite.isPending.value"
            class="shrink-0"
            @click="revokeInvite.mutate(invite.id)"
          />
        </div>

        <!-- URL row -->
        <div class="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <code class="flex-1 text-xs text-muted-foreground truncate font-mono">
            {{ inviteUrl(invite.token) }}
          </code>
          <button
            class="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-cinzel tracking-wide transition-colors"
            :class="copiedId === invite.id
              ? 'bg-elven-green/20 text-elven-green'
              : 'bg-card border border-border text-foreground hover:bg-muted'"
            @click="copyLink(invite)"
          >
            <IconCheck v-if="copiedId === invite.id" class="h-3 w-3" />
            <IconCopy v-else class="h-3 w-3" />
            {{ copiedId === invite.id ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <div
        v-if="invites.length === 0"
        class="rounded-lg border border-dashed border-border p-8 text-center"
      >
        <IconLink class="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p class="text-body text-muted-foreground italic">
          No invite links yet. Generate one above to share with your players.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconCheck, IconCopy, IconDelete, IconLink } from '@/lib/icons';
import {
  useCampaignInvites,
  useCreateCampaignInvite,
  useRevokeInvite,
} from "@/composables/useCampaignMembers";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { CampaignInvite } from "@/types/campaign.types";

const invitesQuery = useCampaignInvites();
const createInvite = useCreateCampaignInvite();
const revokeInvite = useRevokeInvite();

const invites = computed(() => invitesQuery.data.value ?? []);

const newLabel = ref("");
const newExpiry = ref("");
const newMaxUses = ref<number | null>(null);
const copiedId = ref<string | null>(null);

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isExpired(invite: CampaignInvite) {
  return !!invite.expires_at && new Date(invite.expires_at) < new Date();
}

function handleCreate() {
  const payload: Parameters<typeof createInvite.mutate>[0] = {};
  if (newLabel.value.trim()) payload.label = newLabel.value.trim();
  if (newExpiry.value) payload.expires_at = new Date(newExpiry.value).toISOString();
  if (newMaxUses.value) payload.max_uses = newMaxUses.value;
  createInvite.mutate(payload, {
    onSuccess: () => {
      newLabel.value = "";
      newExpiry.value = "";
      newMaxUses.value = null;
    },
  });
}

async function copyLink(invite: CampaignInvite) {
  await navigator.clipboard.writeText(inviteUrl(invite.token));
  copiedId.value = invite.id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}
</script>
