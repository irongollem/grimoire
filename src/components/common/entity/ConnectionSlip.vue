<!--
  One connection on a sheet: who or what, how they are tied, and why.

  The NPC sheet listed its family, its NPC connections and its factions three
  ways (bare rows, bordered cards with a coloured badge, rounded pills), and the
  AI's suggestions a fourth. The maintainer asked for one design (24 Oct 2026):
  "a thumbnail, paper slip, notes, and only have them differ on tags and details
  that actually differ". This is that slip. The caller supplies the name, the
  picture, the tags and the notes; the slip owns the layout.

  Slots, for what differs per kind:
  - `tags`: controls that sit with the tags (a faction role picker);
  - `meta`: the italic line under the name, when it is more than text (a link);
  - `actions`: top right, the row's menu;
  - `footer`: under the notes, full width (Accept / Dismiss on a suggestion).
-->
<template>
  <div
    class="torn flex items-start gap-3 border border-border bg-card p-2.5"
    :data-dead="dead || undefined"
  >
    <span
      class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm border bg-muted text-body font-bold text-muted-foreground"
      :class="[pc ? 'border-primary ring-1 ring-primary' : 'border-border', dead && 'opacity-60']"
      aria-hidden="true"
    >
      <FocalImage v-if="image && imageFormat === 'token'" :src="image" alt="" format="token" class="size-full" />
      <img v-else-if="image" :src="image" alt="" class="size-full object-cover" loading="lazy" />
      <template v-else>{{ initial }}</template>
    </span>

    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <button
          v-if="opens"
          type="button"
          class="slip-name min-w-0 text-left text-body font-bold"
          :class="nameClass"
          @click="emit('open')"
        >{{ name }}</button>
        <RouterLink v-else-if="to" :to="to" class="slip-name min-w-0 text-body font-bold" :class="nameClass">{{ name }}</RouterLink>
        <span v-else class="min-w-0 text-body font-bold" :class="nameClass">{{ name }}</span>
        <span
          v-for="(tag, i) in tags"
          :key="`${i}:${tag.label}`"
          class="rounded px-1.5 py-0.5 text-label font-semibold"
          :class="tag.color ? '' : 'bg-muted text-muted-foreground'"
          :style="tag.color ? { backgroundColor: `color-mix(in oklab, ${tag.color} 13%, transparent)`, color: tag.color } : undefined"
        >{{ tag.label }}</span>
        <slot name="tags" />
      </div>
      <div v-if="meta || $slots.meta" class="flex flex-wrap items-center gap-x-1 text-caption italic text-muted-foreground">
        <span v-if="meta">{{ meta }}</span>
        <slot name="meta" />
      </div>
      <p v-if="notes" class="whitespace-normal wrap-break-word text-caption text-muted-foreground">{{ notes }}</p>
      <div v-if="$slots.footer" class="mt-1.5">
        <slot name="footer" />
      </div>
    </div>

    <div v-if="$slots.actions" class="-mr-1 -mt-1 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/media/FocalImage.vue";

export interface ConnectionTag {
  label: string;
  /** A CSS colour that means something (a relationship type's own colour); plain muted otherwise. */
  color?: string;
}

const {
  name,
  image = null,
  imageFormat = "portrait",
  to = null,
  opens = false,
  pc = false,
  dead = false,
  tags = [],
  meta = null,
  notes = null,
} = defineProps<{
  name: string;
  image?: string | null;
  /** `token` for a faction's emblem (a round crest), `portrait` for a person. */
  imageFormat?: "portrait" | "token";
  /** Where the name goes, when it is a link. */
  to?: string | null;
  /** The name is a button that emits `open` (an NPC opening in place) instead of a link. */
  opens?: boolean;
  pc?: boolean;
  dead?: boolean;
  tags?: ConnectionTag[];
  meta?: string | null;
  notes?: string | null;
}>();
const emit = defineEmits<{ open: [] }>();

const initial = computed(() => name.trim().charAt(0).toUpperCase() || "?");
const nameClass = computed(() => (dead ? "text-muted-foreground line-through decoration-1" : "text-foreground"));
</script>

<style scoped>
/* The name is bare text that answers the pointer, not a button box. */
.slip-name:hover {
  color: var(--color-primary);
}
</style>
