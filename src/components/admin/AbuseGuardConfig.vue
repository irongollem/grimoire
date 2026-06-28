<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Abuse Velocity Guard</h2>
      <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
        Caps how fast a new account can burn purchased credits (friendly-fraud blast radius).
        Leave off until you have real usage data — enabling with low limits can throttle legit power users.
      </p>
    </div>

    <p v-if="query.isPending.value" class="font-fell text-sm text-muted-foreground">Loading…</p>

    <template v-else-if="local">
      <label class="flex items-center gap-2 font-fell text-sm text-foreground">
        <input v-model="local.enabled" type="checkbox" class="accent-primary" />
        Enabled
      </label>
      <label class="flex items-center gap-2 font-fell text-sm" :class="local.enabled ? 'text-foreground' : 'text-muted-foreground'">
        <input v-model="local.enforce" type="checkbox" :disabled="!local.enabled" class="accent-primary" />
        Enforce (block over-limit spends) — off = log-only
      </label>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label class="space-y-1">
          <span class="block font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">New-account age (days)</span>
          <input v-model.number="local.young_account_days" type="number" min="0" class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </label>
        <label class="space-y-1">
          <span class="block font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Window (hours)</span>
          <input v-model.number="local.window_hours" type="number" min="1" class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </label>
        <label class="space-y-1">
          <span class="block font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Max purchased / window</span>
          <input v-model.number="local.max_purchased_spend_window" type="number" min="0" class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </label>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="update.isPending.value"
          @click="save"
        >
          {{ update.isPending.value ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="font-fell text-xs text-green-500 self-center">Saved.</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useAbuseGuard, type AbuseGuardConfig } from "@/composables/useAbuseGuard";

const { query, update } = useAbuseGuard();

const local = ref<AbuseGuardConfig | null>(null);
const saved = ref(false);

// Clone the fetched config into a local editable copy.
watch(
  query.data,
  (cfg) => {
    if (cfg) local.value = { ...cfg };
  },
  { immediate: true },
);

async function save() {
  if (!local.value) return;
  await update.mutateAsync({ ...local.value });
  saved.value = true;
  setTimeout(() => (saved.value = false), 3000);
}
</script>
