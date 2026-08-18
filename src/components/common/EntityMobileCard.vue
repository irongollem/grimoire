<template>
  <!--
    Mobile-only (<md) entity card. Renders one of two layouts via `layout`:
      - "rows"    : a horizontal card row — thumbnail + name/subtitle + foot row + chevron
      - "gallery" : a portrait card for a 2-col grid — image on top, text below

    Generic enough for both NPCs and Monsters; the parent maps each entity to
    these props. The whole card is a <RouterLink> to the detail route.
  -->
  <RouterLink
    :to="to"
    class="block rounded-xl border border-border bg-card transition-colors active:border-primary/50"
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
          <h3 class="truncate font-cinzel text-sm font-bold leading-tight text-foreground">
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
            📍 {{ location }}
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
    <div v-else class="flex flex-col overflow-hidden rounded-xl">
      <div class="relative aspect-4/5 w-full overflow-hidden bg-muted">
        <FocalImage
          :src="imageUrl"
          :alt="title"
          format="portrait"
          :focal-point="focalPoint"
          :placeholder="placeholder"
        />
        <span
          v-if="badgeText"
          class="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-eyebrow font-bold text-white"
        >
          <span class="absolute inset-0 rounded opacity-90" :class="badgeClass ?? 'bg-muted-foreground'" />
          <span class="relative">{{ badgeText }}</span>
        </span>
        <span
          v-if="shared"
          class="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60"
        >
          <IconReveal class="size-3.5 text-primary" aria-label="Shared with players" />
        </span>
      </div>

      <div class="flex flex-col gap-0.5 p-2.5">
        <div class="flex items-center gap-1.5">
          <span v-if="statusClass" class="size-2 shrink-0 rounded-full" :class="statusClass" />
          <h3 class="truncate font-cinzel text-sm font-bold leading-tight text-foreground">
            {{ title }}
          </h3>
        </div>
        <p v-if="subtitle" class="truncate text-caption italic text-muted-foreground">
          {{ subtitle }}
        </p>
      </div>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import { IconReveal } from "@/lib/icons";

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
