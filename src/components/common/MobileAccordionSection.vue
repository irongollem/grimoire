<template>
  <!--
    Mobile-only (<md) collapsible card section for entity detail/edit screens
    (NPC, Monster, and other sections). A tappable header (Cinzel title +
    rotating chevron) toggles the body. Open state is owned by the parent via
    `v-model:open` so callers decide defaults (e.g. Lore open, others closed).
  -->
  <section class="overflow-hidden rounded-xl border border-border bg-card">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="font-cinzel text-base font-bold tracking-wide text-foreground">
        {{ title }}
      </span>
      <!-- Chevron (inline SVG — rotates 180° when open) -->
      <svg
        class="size-5 shrink-0 text-muted-foreground transition-transform duration-200"
        :class="open && 'rotate-180'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="open" class="border-t border-border px-4 pt-3 pb-4">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
const open = defineModel<boolean>("open", { required: true });
</script>
