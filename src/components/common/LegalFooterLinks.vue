<template>
  <nav class="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap">
    <RouterLink
      v-for="link in LEGAL_LINKS"
      :key="link.to"
      :to="link.to"
      class="font-cinzel text-[11px] text-muted-foreground hover:text-foreground transition-colors tracking-wide"
    >
      {{ link.label }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";

// Single source of truth for the public legal links, reused across the app shell
// and marketing footers so they never drift.
const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/refunds", label: "Refunds" },
] as const;
</script>
