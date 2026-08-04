<template>
  <!--
    EU AI Act Art 50(4) disclosure — the single read point for `ai_provenance`
    (see context/compliance/provenance-architecture.md §7). Two variants:

    - `chip`   — small muted overlay for images. Positions itself
                 `absolute bottom-*-right-*` — the host element must be
                 `relative`-positioned (same contract as MiniPortraitOverlay's
                 badge button).
    - `line`   — quiet inline text for AI-drafted prose, meant to sit next to
                 existing meta text (e.g. JournalCard's `#meta` slot).

    Both render nothing when `provenance` is null/undefined — callers decide
    visibility by whether they pass a provenance object at all (same pattern
    as `EntityNewDot`'s `isNew` prop), so a generator's own authoring surface
    simply never mounts this component instead of hiding it conditionally.

    `provenance` intentionally accepts a display-only shape rather than the
    full `AiProvenance` core type — callers with a real `AiProvenance` record
    (notes, generated entities) pass it straight through; callers with only a
    provider column (minis) build a minimal literal. Every field is optional:
    render what's known, omit what isn't.
  -->
  <span
    v-if="provenance && variant === 'chip'"
    class="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-label text-white/90"
    :title="tooltipText"
  ><IconGenerate class="h-2.5 w-2.5 shrink-0" />AI</span>

  <p
    v-else-if="provenance && variant === 'line'"
    class="flex items-center gap-1 text-caption text-muted-foreground/70 italic"
    :title="tooltipText"
  ><IconGenerate class="h-2.5 w-2.5 shrink-0" />{{ lineText }}</p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconGenerate } from "@/lib/icons";

/** Display-only projection of `AiProvenance` (src/ai/provenance.ts) — every field optional, so a caller that only knows the provider (e.g. minis) can still show a badge. */
export interface AiBadgeProvenance {
  model?: string;
  provider?: string;
  generatedAt?: string;
  edited?: boolean;
}

const { variant, provenance } = defineProps<{
  /** `chip` = absolute-positioned image overlay; `line` = inline text-draft disclosure. */
  variant: "chip" | "line";
  provenance?: AiBadgeProvenance | null;
}>();

const lineText = computed(() =>
  provenance?.edited ? "AI-assisted, edited by the DM" : "Drafted with AI assistance",
);

const tooltipText = computed(() => {
  if (!provenance) return "";
  const lines = ["AI-generated"];
  if (provenance.model) {
    lines.push(
      provenance.provider ? `Model: ${provenance.model} (${provenance.provider})` : `Model: ${provenance.model}`,
    );
  } else if (provenance.provider) {
    lines.push(`Provider: ${provenance.provider}`);
  }
  if (provenance.generatedAt) {
    const d = new Date(provenance.generatedAt);
    if (!isNaN(d.getTime())) lines.push(`Generated: ${d.toLocaleDateString()}`);
  }
  if (provenance.edited) lines.push("Edited by a human afterward");
  return lines.join("\n");
});
</script>
