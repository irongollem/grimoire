<template>
  <div
    v-if="isSuspended"
    class="shrink-0 bg-destructive/15 border-b border-destructive/40 px-4 py-2 text-center"
  >
    <p class="text-caption text-destructive">
      Your account is frozen<template v-if="suspensionReason"> ({{ suspensionReason }})</template> —
      AI generation and purchases are paused. Email
      <a href="mailto:info@dungeongrimoire.com" class="underline hover:no-underline">info@dungeongrimoire.com</a>
      to resolve this.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useSubscription } from "@/composables/billing/useSubscription";

const { isSuspended, suspensionReason } = useSubscription();
</script>
