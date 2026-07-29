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
    <!-- In-app route, not a marketing-site doc — the license/attribution
         notices live in Grimoire itself (Reliquary → Licenses tab), not on
         the marketing site. -->
    <RouterLink
      to="/rules?tab=licenses"
      class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide"
    >
      Licenses
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { legalUrl, type LegalDoc } from "@/lib/marketing";

// Single source of truth for the public legal links. Privacy/Terms/Refunds
// are canonical on the marketing site, so we link out to them there — no
// in-app duplication or drift. Licenses is the one exception: it's an in-app
// route (see LicensesTab.vue), not a marketing-site document.
const LEGAL_LINKS: { doc: LegalDoc; label: string }[] = [
  { doc: "privacy", label: "Privacy" },
  { doc: "terms", label: "Terms" },
  { doc: "refunds", label: "Refunds" },
];
</script>
