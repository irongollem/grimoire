<template>
  <DashboardWidget
    v-if="recentMonsters.length"
    title="Recently discovered monsters"
    to="/monsters"
    action-label="All monsters →"
    max-height="none"
  >
    <div class="flex gap-4 overflow-x-auto px-4 py-3" style="scrollbar-width: none">
      <RouterLink
        v-for="row in recentMonsters"
        :key="row.id"
        :to="`/monsters/${row.id}`"
        class="flex flex-col items-center gap-1.5 shrink-0 w-14 group"
      >
        <div class="h-12 w-12 rounded-full overflow-hidden bg-secondary ring-2 ring-transparent group-hover:ring-primary/40 transition-all">
          <FocalImage
            :src="row.imageUrl"
            :focal-point="row.portraitFocalPoint"
            format="token"
            :alt="row.name"
            placeholder="/assets/placeholders/monster.webp"
          />
        </div>
        <p class="text-caption text-center text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2 leading-tight w-full">
          {{ row.name }}
        </p>
        <p class="text-caption-sm text-center text-muted-foreground/70 leading-tight w-full">
          {{ timeAgo(row.discoveredAt) }}
        </p>
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useCampaignDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { deriveRecentMonsters } from "@/lib/dashboard/recentMonsters";
import { timeAgo } from "@/lib/utils";
import FocalImage from "@/components/common/FocalImage.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Bestiary entries the party has recently discovered, newest first (#764) —
 * the discovery-log sibling of `RecentNpcsWidget`: same avatar strip, same
 * self-hiding shell, same "portrait + name" reading. It adds one thing that
 * widget does not need — a "when" line — because a discovery is an in-world
 * event with its own timestamp, unlike an NPC visit, which is only ever "you
 * looked at this recently" with no time worth printing.
 *
 * `useCampaignDiscoveries()` is the DM's own unfiltered read of
 * `discovered_monsters` for the active campaign (no player-visibility
 * filtering — this widget only ever mounts on the DM dashboard, same as
 * `CursedItemsWidget`). `useAllMonsters()` is the merged bestiary: a
 * discovery can point at either a DM-created row (`monsters`) or a shared
 * `library_monsters` row, and both resolve through the same merged list to
 * the same `/monsters/:id` route — `recentMonsters.ts` owns the two-column
 * reference lookup, the join, the sort and the limit.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through its own composables.
 */
const { data: discoveries } = useCampaignDiscoveries();
const { data: monsters } = useAllMonsters();

/**
 * `?? []` is safe here for the same reason `DeathSavesWidget` / `CursedItemsWidget`
 * document: an unloaded discovery log or bestiary and a loaded one with
 * nothing to show both render nothing at all, so collapsing them loses no
 * distinction for a widget that hides itself entirely rather than showing a
 * loading or empty state.
 */
const recentMonsters = computed(() => deriveRecentMonsters(discoveries.value ?? [], monsters.value ?? []));
</script>
