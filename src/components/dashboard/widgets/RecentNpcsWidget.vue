<template>
  <DashboardWidget
    v-if="recentNpcs.length"
    title="Recent NPCs"
    to="/npcs"
    action-label="All NPCs →"
    max-height="none"
  >
    <div class="flex gap-4 overflow-x-auto px-4 py-3" style="scrollbar-width: none">
      <RouterLink
        v-for="npc in recentNpcs"
        :key="npc.id"
        :to="`/npcs/${npc.id}`"
        class="flex flex-col items-center gap-1.5 shrink-0 w-14 group"
      >
        <div class="h-12 w-12 rounded-full overflow-hidden bg-secondary ring-2 ring-transparent group-hover:ring-primary/40 transition-all">
          <FocalImage
            :src="npc.portrait_url"
            :focal-point="npc.portrait_focal_point ?? null"
            format="token"
            :alt="npc.name"
            placeholder="/assets/placeholders/npc.webp"
          />
        </div>
        <p class="text-caption text-center text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2 leading-tight w-full">
          {{ npc.name }}
        </p>
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useRecentNpcs } from "@/composables/dashboard/useRecentNpcs";
import FocalImage from "@/components/common/FocalImage.vue";
import DashboardWidget from "../DashboardWidget.vue";

/** Who the DM has been looking at, so the faces of the current scene are one
 *  click away. Ordered by the visit, not by the campaign. */
const { data: npcs } = useNpcs();
const { recentIds } = useRecentNpcs();

const recentNpcs = computed(() => {
  const byId = new Map((npcs.value ?? []).map((n) => [n.id, n]));
  return recentIds.value
    .map((id) => byId.get(id))
    .filter((n): n is NonNullable<typeof n> => n != null);
});
</script>
