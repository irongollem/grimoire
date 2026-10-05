<template>
  <HearthSection title="New for you">
    <template v-if="items.length" #end>
      <span class="inline-flex items-center gap-1.5 text-caption font-semibold text-foreground">
        <EntityNewDot :is-new="true" size="sm" />{{ items.length }}
      </span>
    </template>

    <ul v-if="shown.length" class="torn hearth-card divide-y divide-border/60 rounded-lg">
      <li v-for="item in shown" :key="`${item.kind}-${item.id}`">
        <RouterLink :to="item.to" class="flex min-h-11 items-center gap-3 px-3.5 py-2.5 hover:bg-accent/40">
          <component :is="KIND[item.kind].icon" class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-body font-semibold">{{ item.title }}</span>
            <span class="block text-caption text-muted-foreground">
              <span class="text-eyebrow">{{ KIND[item.kind].label }}</span> · {{ timeAgo(item.updatedAt) }}
            </span>
          </span>
          <EntityNewDot :is-new="true" />
        </RouterLink>
      </li>
    </ul>
    <p v-else class="torn hearth-card rounded-lg px-3.5 py-3 text-body italic text-muted-foreground">
      Nothing new since you last looked.
    </p>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import HearthSection from "@/components/play/hearth/HearthSection.vue";
import { usePlayerUnread, type UnreadItem } from "@/composables/play/usePlayerUnread";
import { IconNote, IconPuzzle, IconQuest, IconScrollText } from "@/lib/icons";
import { timeAgo } from "@/lib/utils";

/**
 * What the Journal's nav dot is pointing at, spelled out. It reads
 * `usePlayerUnread().items`, the same list that decides the dot, so the two can
 * never disagree. Five rows at most; the count in the heading is the whole.
 */
const MAX_ROWS = 5;
const KIND = {
  quest: { label: "Quest", icon: IconQuest },
  puzzle: { label: "Puzzle", icon: IconPuzzle },
  handout: { label: "Handout", icon: IconScrollText },
  note: { label: "From your DM", icon: IconNote },
} satisfies Record<UnreadItem["kind"], { label: string; icon: unknown }>;

const { items } = usePlayerUnread();
const shown = computed(() => items.value.slice(0, MAX_ROWS));
</script>
