<template>
  <nav class="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap">
    <a
      v-for="link in LEGAL_LINKS"
      :key="link.doc"
      :href="legalUrl(link.doc)"
      target="_blank"
      rel="noopener noreferrer"
      class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide"
    >
      {{ link.label }}
    </a>
  </nav>
</template>

<script setup lang="ts">
import { legalUrl, type LegalDoc } from "@/lib/marketing";

// Single source of truth for the public legal links. The documents themselves
// live on the marketing site (apex domain); the app links out to them.
const LEGAL_LINKS: { doc: LegalDoc; label: string }[] = [
  { doc: "privacy", label: "Privacy" },
  { doc: "terms", label: "Terms" },
  { doc: "refunds", label: "Refunds" },
];
</script>
