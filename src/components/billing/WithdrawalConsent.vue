<template>
  <label class="flex items-start gap-2 font-fell text-xs text-muted-foreground">
    <input v-model="checked" type="checkbox" class="mt-0.5 shrink-0 accent-primary" />
    <span>
      I request immediate access and acknowledge that I lose my 14-day right of withdrawal once the
      <template v-if="kind === 'credit_pack'">credits are used</template>
      <template v-else>subscription period has been supplied</template>
      (see the
      <RouterLink to="/refunds" target="_blank" class="underline hover:text-foreground transition-colors">Refund Policy</RouterLink>).
    </span>
  </label>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";

// EU right-of-withdrawal waiver — its own checkbox, separate from the Stripe ToS
// consent; the timestamped record is written server-side at checkout creation.
const checked = defineModel<boolean>({ default: false });
const { kind = "subscription" } = defineProps<{ kind?: "subscription" | "credit_pack" }>();
</script>
