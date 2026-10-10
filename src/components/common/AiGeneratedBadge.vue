<template>
  <span
    v-if="shown && variant === 'chip'"
    class="absolute bottom-1.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-label text-white/90 print:hidden"
    :class="corner === 'left' ? 'left-1.5' : 'right-1.5'"
    :title="tooltipText"
  ><IconGenerate class="h-2.5 w-2.5 shrink-0" />AI</span>

  <span
    v-else-if="shown && variant === 'inline'"
    class="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-label text-muted-foreground print:hidden"
    :title="tooltipText"
  ><IconGenerate class="h-2.5 w-2.5 shrink-0" />AI</span>

  <p
    v-else-if="shown && variant === 'line'"
    class="flex items-center gap-1 text-caption text-muted-foreground/70 italic"
    :title="tooltipText"
  ><IconGenerate class="h-2.5 w-2.5 shrink-0" />{{ lineText }}</p>
</template>

<script setup lang="ts">
/*
  The visible AI label: the display of an AI provenance record (see
  context/compliance/provenance-architecture.md §7). The legal duty is the
  machine-readable mark in the file (Art 50(2)); this label is the readable
  courtesy on top of it, on by default, and each viewer may switch it off for
  their own screen (`useAiLabelPrefs`). Three variants:

  - `chip`   small muted overlay for images, on screen only: it never prints
             (the maintainer's call, 29 Sep 2026; printed cards carry no
             badge, and the XMP mark stays in the file). It positions itself
             `absolute` in a bottom corner, so the host element must be
             `relative` (same contract as MiniPortraitOverlay's badge button).
  - `inline` the same "AI" mark as the chip, but in the normal flow instead of over
             the picture, for an image the DM works on directly (the focal point
             picker), where a chip over the art would sit under the pointer.
  - `line`   quiet inline text for AI-drafted prose, meant to sit next to
             existing meta text (e.g. JournalCard's `#meta` slot).

  This component only renders a record it is given. Image badges go through
  `AiImageBadge`, which finds the record by the image's URL (`FocalImage` mounts
  one itself through its `aiBadge` prop).

  Every variant renders nothing when `provenance` is null or undefined, or when
  the viewer has turned AI labels off. Callers decide visibility by whether they
  pass a record at all (same pattern as `EntityNewDot`'s `isNew` prop). The
  label is shown wherever a record exists, the DM's own screens and editors
  included: a DM should be able to tell the AI art in their campaign from the
  rest. The viewer's switch, not the surface, decides whether it is visible.
  Avatars under ~48px, tokens, chat, print sheets and admin curation carry none.

  `provenance` intentionally accepts a display-only shape rather than the full
  `AiProvenance` core type. Callers with a real record (notes) pass it straight
  through; callers with only a provider column (minis) build a minimal literal.
  Every field is optional: render what is known, omit what is not.
*/
import { computed } from "vue";
import { IconGenerate } from "@/lib/icons";
import { useAiLabelPrefs } from "@/composables/ai/useAiLabelPrefs";

/** Display-only projection of `AiProvenance` (src/ai/provenance.ts) — every field optional, so a caller that only knows the provider (e.g. minis) can still show a badge. */
export interface AiBadgeProvenance {
  model?: string;
  provider?: string;
  generatedAt?: string;
  edited?: boolean;
}

const { variant, provenance, corner = "right" } = defineProps<{
  /** `chip` = absolute-positioned image overlay; `inline` = the same mark in the flow; `line` = inline text-draft disclosure. */
  variant: "chip" | "inline" | "line";
  provenance?: AiBadgeProvenance | null;
  /** Bottom corner the `chip` sits in; `left` for hosts whose right corner is taken (the NPC card's mini button). */
  corner?: "left" | "right";
}>();

const { showAiLabels } = useAiLabelPrefs();
const shown = computed(() => !!provenance && showAiLabels.value);

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
