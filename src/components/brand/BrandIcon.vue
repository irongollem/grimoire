<!--
  Third-party brand logos, loaded VERBATIM from `src/assets/brands/*.svg`.

  Deliberately not part of `icons.ts`. Everything there flows through `glyph()`,
  which repaints the art in `currentColor` so it tints with the surrounding text
  — right for our own hand-drawn glyphs, wrong for someone else's logo. Recolour,
  distort or redraw a mark and you are in breach of its guidelines; that is a
  legal question, not a styling one.

  Scaling is fine, and necessary — a logo has to sit at the same weight as the
  label beside it. What matters is that the scale stays uniform and nothing else
  changes.

  Rendered as an <img> rather than inlined markup on purpose: the browser draws
  the vendor's file exactly as shipped, with no opportunity for a stylesheet to
  reach inside and recolour a path. The files are well under Vite's 4KB inline
  limit, so each still ends up a build-time data URI — no extra request, and no
  `v-html`.

  Adding one: drop the vendor's official SVG into `src/assets/brands/` and add
  its filename to `BrandName`. Size it with utility classes; do not recolour it,
  re-viewBox it, or scale the axes independently.
-->
<template>
  <img :src="src" :alt="label ?? name" class="shrink-0 object-contain" draggable="false" />
</template>

<script setup lang="ts">
import { computed } from "vue";

/** Filenames in src/assets/brands/, without the extension. One for now. */
export type BrandName = "spotify";

const { name, label } = defineProps<{
  name: BrandName;
  /**
   * Accessible name. Usually leave it: the brand's own name is the right alt
   * text, and the button around it carries the action wording.
   */
  label?: string;
}>();

// Eager so the URL resolves at build time; Vite inlines anything under its
// assetsInlineLimit, so these become data URIs rather than extra requests.
const MARKS = import.meta.glob("@/assets/brands/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const src = computed(() => {
  const hit = Object.entries(MARKS).find(([path]) => path.endsWith(`/${name}.svg`));
  if (!hit) throw new Error(`No brand mark for "${name}" in src/assets/brands/`);
  return hit[1];
});
</script>
