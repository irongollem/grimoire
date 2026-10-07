<template>
  <!--
    Mobile-only (<md) entity card. Renders one of two layouts via `layout`:
      - "rows"    : a horizontal card row — thumbnail + name/subtitle + foot row + chevron
      - "gallery" : a portrait card for a 2-col grid — image on top, text below

    Generic enough for both NPCs and Monsters; the parent maps each entity to
    these props. The whole card is a <RouterLink> to the detail route.
  -->
  <!-- Gallery is a column whose plate and body are the card's direct children: the vellum
       theme's wanted-poster rules (inset framed plate, centred engraved name) key on exactly
       the desktop card's shape, `> .relative.shrink-0.overflow-hidden` and `> .flex.flex-1.flex-col.p-3`. -->
  <RouterLink
    :to="to"
    class="rounded-xl border border-border bg-card transition-colors active:border-primary/50"
    :class="layout === 'gallery' ? 'flex flex-col overflow-hidden' : 'block'"
  >
    <!-- ── Rows layout ──────────────────────────────────────────────────── -->
    <div v-if="layout === 'rows'" class="flex items-center gap-3 p-2.5">
      <div class="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        <FocalImage
          :src="imageUrl"
          :alt="title"
          format="square"
          :focal-point="focalPoint"
          :placeholder="placeholder"
        />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-1.5">
          <span v-if="statusClass" class="size-2 shrink-0 rounded-full" :class="statusClass" />
          <h3 class="truncate text-heading-xs font-bold leading-tight text-foreground">
            {{ title }}
          </h3>
        </div>

        <p v-if="subtitle" class="truncate text-caption italic text-muted-foreground">
          {{ subtitle }}
        </p>

        <div class="mt-0.5 flex items-center gap-2 text-2xs">
          <span
            v-if="badgeText"
            class="relative shrink-0 rounded px-1.5 py-0.5 font-cinzel font-bold uppercase tracking-wider text-white"
          >
            <span class="absolute inset-0 rounded opacity-90" :class="badgeClass ?? 'bg-muted-foreground'" />
            <span class="relative">{{ badgeText }}</span>
          </span>
          <span
            v-if="location"
            class="min-w-0 truncate font-fell italic text-muted-foreground"
          >
            <IconCompassRose class="mr-1 inline h-3.5 w-3.5 -translate-y-px" />{{ location }}
          </span>
          <IconReveal
            v-if="shared"
            class="size-3 shrink-0 text-primary"
            aria-label="Shared with players"
          />
        </div>
      </div>

      <!-- Trailing chevron (inline SVG — no icon import dependency) -->
      <svg
        class="size-5 shrink-0 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>

    <!-- ── Gallery layout ───────────────────────────────────────────────── -->
    <template v-else>
      <div class="relative aspect-4/5 shrink-0 overflow-hidden bg-muted">
        <FocalImage
          :src="imageUrl"
          :alt="title"
          format="portrait"
          :focal-point="focalPoint"
          :placeholder="placeholder"
        />
        <!-- The same chip as the desktop card's badge, so it becomes the same paper label. -->
        <span
          v-if="badgeText"
          class="absolute top-2 right-2 flex h-6 items-center rounded px-1.5 text-eyebrow font-bold text-white backdrop-blur-sm"
        >
          <span class="absolute inset-0 rounded opacity-50" :class="badgeClass ?? 'bg-muted-foreground'" />
          <span class="relative">{{ badgeText }}</span>
        </span>
        <span
          v-if="shared"
          class="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60"
        >
          <IconReveal class="size-3.5 text-primary" aria-label="Shared with players" />
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-0.5 p-3">
        <div class="flex items-center gap-1.5">
          <span v-if="statusClass" class="size-2 shrink-0 rounded-full" :class="statusClass" />
          <h3 class="truncate text-heading-xs font-bold leading-tight text-foreground">
            {{ title }}
          </h3>
        </div>
        <p v-if="subtitle" class="truncate text-caption italic text-muted-foreground">
          {{ subtitle }}
        </p>
      </div>
    </template>
  </RouterLink>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import { IconCompassRose, IconReveal } from "@/lib/icons";

const {
  layout = "rows",
  imageUrl = null,
  focalPoint = null,
} = defineProps<{
  layout?: "rows" | "gallery";
  to: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  placeholder: string;
  badgeText?: string;
  /** Background utility class from an entity ramp (#742), not a colour value. */
  badgeClass?: string;
  statusClass?: string;
  location?: string;
  shared?: boolean;
}>();
</script>
