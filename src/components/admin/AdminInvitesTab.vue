<template>
  <div class="space-y-6">
    <!-- New Invite Link -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">New Invite Link</h2>
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

    <!-- Active Links -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Active Links</h2>

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
            <p class="text-caption text-muted-foreground italic">
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
              ? 'bg-green-500/20 text-green-400'
              : 'border border-border text-foreground hover:bg-muted'"
            @click="copyInvite(invite)"
          >
            <IconCheck v-if="copiedId === invite.id" class="h-3 w-3" />
            <IconCopy v-else class="h-3 w-3" />
            {{ copiedId === invite.id ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <p v-if="!invitesQuery.isPending.value && invites.length === 0" class="text-caption text-muted-foreground italic">
        No active invite links.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconCheck, IconCopy, IconDelete } from "@/lib/icons";
import { useAppInvites, useCreateAppInvite, useDeleteAppInvite } from "@/composables/useAppInvites";
import type { AppInvite, GrantedPlan } from "@/composables/useAppInvites";

const invitesQuery = useAppInvites();
const createInvite = useCreateAppInvite();
const deleteInvite = useDeleteAppInvite();

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

function isExpired(invite: AppInvite) {
  return !!invite.expires_at && new Date(invite.expires_at) < new Date();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

async function copyInvite(invite: AppInvite) {
  await navigator.clipboard.writeText(signupUrl(invite.token));
  copiedId.value = invite.id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}
</script>
