<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Abuse Velocity Guard</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Caps how fast a new account can burn purchased credits (friendly-fraud blast radius).
        Leave off until you have real usage data — enabling with low limits can throttle legit power users.
      </p>
    </div>

    <p v-if="query.isPending.value" class="text-body text-muted-foreground">Loading…</p>

    <template v-else-if="local">
      <AppCheckbox v-model="local.enabled" label="Enabled" />
      <AppCheckbox
        v-model="local.enforce"
        :disabled="!local.enabled"
        label="Enforce (block over-limit spends) — off = log-only"
        :label-class="local.enabled ? undefined : 'text-muted-foreground'"
      />

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label class="space-y-1">
          <span class="block text-eyebrow font-semibold text-muted-foreground">New-account age (days)</span>
          <AppInput v-model.number="local.young_account_days" type="number" min="0" tone="filled" size="body-xs" />
        </label>
        <label class="space-y-1">
          <span class="block text-eyebrow font-semibold text-muted-foreground">Window (hours)</span>
          <AppInput v-model.number="local.window_hours" type="number" min="1" tone="filled" size="body-xs" />
        </label>
        <label class="space-y-1">
          <span class="block text-eyebrow font-semibold text-muted-foreground">Max purchased / window</span>
          <AppInput v-model.number="local.max_purchased_spend_window" type="number" min="0" tone="filled" size="body-xs" />
        </label>
      </div>

      <div class="flex items-center gap-2">
        <AppButton
          variant="primary"
          size="sm"
          :disabled="update.isPending.value"
          :label="update.isPending.value ? 'Saving…' : 'Save'"
          @click="save"
        />
        <span v-if="saved" class="text-caption text-green-500 self-center">Saved.</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useAbuseGuard, type AbuseGuardConfig } from "@/composables/admin/useAbuseGuard";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";

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
