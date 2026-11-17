<template>
  <!-- "The mark never hides": the per-viewer switch that hides "made with AI" labels on pictures does not reach it.
       Oxblood, the rubric colour, because it is a standing rule of the table (Disclosure, 07). -->
  <span
    class="text-eyebrow inline-flex items-center gap-1.5 border border-(--live-ink,var(--primary)) bg-card px-2.5 py-1 font-bold tracking-widest text-(--live-ink,var(--primary))"
  >
    <i class="size-1.5 rotate-45 bg-(--live-ink,var(--primary))" aria-hidden="true" />
    <span class="max-sm:hidden">The Dungeon Master is an AI</span>
    <span class="sm:hidden">AI Dungeon Master</span>
  </span>
</template>
