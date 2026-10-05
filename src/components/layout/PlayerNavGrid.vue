<template>
  <div class="relative bg-card border-t border-border rounded-t-2xl px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
    <div class="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-5" />

    <!-- The campaign in play, as the DM's More sheet opens with theirs. -->
    <AppButton variant="menu" size="body" block class="mb-4 rounded-lg border border-border" @click="emit('open-campaigns')">
      <div class="h-9 w-9 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
        <IconNavCampaign class="h-4 w-4 text-primary" />
      </div>
      <div class="flex-1 min-w-0 text-left">
        <p class="text-body font-bold text-foreground leading-tight truncate">{{ campaignName }}</p>
        <p v-if="characterName" class="text-caption text-muted-foreground italic truncate leading-tight">Playing {{ characterName }}</p>
      </div>
      <IconChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
    </AppButton>

    <div class="grid grid-cols-4 sm:grid-cols-7 gap-1">
      <RouterLink
        v-for="item in sortedNav"
        :key="item.to"
        :to="item.to"
        class="relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 transition-colors"
        :class="isActive(item.to)
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
        @click="$emit('close')"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <EntityNewDot :is-new="unreadPaths.includes(item.to)" size="sm" class="absolute top-2 left-1/2 ml-2" />
        <span class="text-label md:text-xs text-center leading-tight">{{ item.label }}</span>
      </RouterLink>
    </div>

    <button
      v-if="updateAvailable"
      type="button"
      class="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-3 text-label-lg font-bold text-primary transition-colors hover:bg-primary/20"
      @click="reloadApp"
    >
      <IconRefresh class="h-4 w-4 shrink-0" />
      Reload to update
    </button>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { IconChevronRight, IconNavCampaign, IconRefresh } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { usePlayerNavPrefs } from "@/composables/play/usePlayerNavPrefs";
import { updateAvailable, reloadApp } from "@/composables/useAppUpdate";

const { unreadPaths, campaignName, characterName } = defineProps<{
  /** Nav paths with something new (usePlayerUnread). */
  unreadPaths: readonly string[];
  campaignName: string;
  characterName: string | null;
}>();

const emit = defineEmits<{
  close: [];
  'open-campaigns': [];
}>();

const route = useRoute();
const { sortedNav } = usePlayerNavPrefs();

function isActive(to: string): boolean {
  return to === "/play" ? route.path === "/play" : route.path.startsWith(to);
}
</script>
