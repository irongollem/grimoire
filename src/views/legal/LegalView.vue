<template>
  <div class="h-dvh flex flex-col overflow-y-auto">
    <!-- Minimal nav -->
    <header class="border-b border-border/40 px-6 py-4 flex items-center gap-4">
      <RouterLink
        to="/"
        class="font-cinzel text-lg font-bold text-gold-500 tracking-widest hover:text-gold-400 transition-colors"
      >
        Grimoire
      </RouterLink>
      <span class="text-border">·</span>
      <span class="font-fell text-sm text-muted-foreground italic">{{ title }}</span>
      <RouterLink
        to="/"
        class="ml-auto font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
      >
        ← Back
      </RouterLink>
    </header>

    <!-- Content -->
    <main class="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article class="legal-prose" v-html="html" />
    </main>

    <!-- Footer -->
    <footer class="border-t border-border/40 py-6 text-center space-x-6">
      <RouterLink to="/privacy" class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors">
        Privacy Policy
      </RouterLink>
      <RouterLink to="/terms" class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors">
        Terms of Service
      </RouterLink>
      <RouterLink to="/refunds" class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors">
        Refund Policy
      </RouterLink>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { marked } from "marked";
import privacyMd from "@/legal/privacy.md?raw";
import termsMd from "@/legal/terms.md?raw";
import refundsMd from "@/legal/refunds.md?raw";

type LegalDoc = "privacy" | "terms" | "refunds";

const DOCS: Record<LegalDoc, { source: string; title: string }> = {
  privacy: { source: privacyMd, title: "Privacy Policy" },
  terms: { source: termsMd, title: "Terms of Service" },
  refunds: { source: refundsMd, title: "Refund Policy" },
};

const route = useRoute();
const doc = computed(() => (route.meta.doc as LegalDoc) ?? "privacy");

const source = computed(() => DOCS[doc.value].source);
const html = computed(() => marked(source.value, { async: false }) as string);

const title = computed(() => DOCS[doc.value].title);
</script>

<style scoped>
.legal-prose :deep(h1) {
  font-family: var(--font-cinzel);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-foreground);
  margin-bottom: 0.25rem;
}

.legal-prose :deep(h2) {
  font-family: var(--font-cinzel);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-foreground);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-border);
}

.legal-prose :deep(h3) {
  font-family: var(--font-cinzel);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-muted-foreground);
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.legal-prose :deep(p) {
  font-family: var(--font-fell);
  font-size: 0.9375rem;
  color: var(--color-foreground);
  line-height: 1.7;
  margin-bottom: 0.875rem;
}

.legal-prose :deep(ul),
.legal-prose :deep(ol) {
  font-family: var(--font-fell);
  font-size: 0.9375rem;
  color: var(--color-foreground);
  line-height: 1.7;
  padding-left: 1.5rem;
  margin-bottom: 0.875rem;
}

.legal-prose :deep(li) {
  margin-bottom: 0.25rem;
}

.legal-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-fell);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.legal-prose :deep(th) {
  font-family: var(--font-cinzel);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--color-border);
  color: var(--color-muted-foreground);
}

.legal-prose :deep(td) {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-foreground);
  vertical-align: top;
}

.legal-prose :deep(tr:last-child td) {
  border-bottom: none;
}

.legal-prose :deep(a) {
  color: var(--color-gold-400, #d4a24c);
  text-decoration: underline;
}

.legal-prose :deep(a:hover) {
  color: var(--color-gold-300, #e8c06a);
}

.legal-prose :deep(strong) {
  font-weight: 600;
  color: var(--color-foreground);
}

.legal-prose :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1.5rem 0;
}

.legal-prose :deep(blockquote) {
  border-left: 3px solid var(--color-border);
  padding-left: 1rem;
  color: var(--color-muted-foreground);
  font-style: italic;
  margin: 1rem 0;
}

.legal-prose :deep(code) {
  font-family: monospace;
  font-size: 0.85em;
  background: var(--color-muted);
  padding: 0.1em 0.3em;
  border-radius: 0.2rem;
}
</style>
