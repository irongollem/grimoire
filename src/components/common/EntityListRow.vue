<template>
  <!--
    The horizontal entity row — a small square emblem, a name, a line of
    supporting text, some tags, and whatever controls belong at the trailing
    edge. The counterpart to `EntityGridCard`, which is the portrait-led shape;
    this is for entities whose picture is an emblem rather than a scene, and
    which read better as a list than as a gallery.

    It exists because `FactionListView` and `PantheonListView` had each written
    the same forty lines: same wrapper classes, same 3rem emblem tile, same
    truncating name, same three tag pills, same chevron. The two had already
    drifted in the small ways that duplication always drifts in — one passed
    `render-width` to `FocalImage` and the other did not, one gave the image an
    empty `alt` and the other gave it none — and neither difference was a
    decision anybody made.

    A `div` with an absolutely-positioned link rather than a `RouterLink`
    wrapper, and this is load-bearing: the trailing slot holds buttons, and a
    button inside an anchor is invalid markup that swallows its own clicks.
    That is also why the slot sits in a `z-10` wrapper with `@click.prevent.stop`
    — it has to win against the link covering the whole row.
  -->
  <div
    class="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
  >
    <RouterLink :to="to" class="absolute inset-0 z-2" />

    <div
      class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
    >
      <FocalImage
        v-if="imageUrl"
        :src="imageUrl"
        :alt="title"
        format="square"
        :render-width="200"
      />
      <component v-else :is="fallbackIcon" class="h-5 w-5 text-muted-foreground/40" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate font-cinzel text-sm font-bold text-foreground">{{ title }}</p>
      <p v-if="subtitle" class="text-label text-muted-foreground mt-0.5">{{ subtitle }}</p>
      <div v-if="tags.length" class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="tag in tags.slice(0, maxTags)"
          :key="tag"
          class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
        >{{ tag }}</span>
      </div>
      <slot name="body" />
    </div>

    <!--
      One group rather than two row children, so the controls and the chevron
      cost the row a single `gap-3` between them and the text. Split, the extra
      gap comes straight out of the name, which truncates a word earlier for it.
    -->
    <div class="flex shrink-0 items-center gap-1">
      <div v-if="$slots.actions" class="relative z-10" @click.prevent.stop>
        <slot name="actions" />
      </div>
      <IconChevronRight
        class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconChevronRight } from "@/lib/icons";

const { imageUrl = null, subtitle = null, tags = [], maxTags = 3 } = defineProps<{
  /** Where the whole row navigates. */
  to: string;
  title: string;
  /** Shown under the title — a faction's type, a pantheon's deity count. */
  subtitle?: string | null;
  /** Emblem. Falls back to `fallbackIcon` when absent. */
  imageUrl?: string | null;
  /** Drawn in the emblem tile when there is no image. */
  fallbackIcon: Component;
  tags?: readonly string[];
  /** Tags beyond this are dropped — the row is a glance, not an inventory. */
  maxTags?: number;
}>();
</script>
