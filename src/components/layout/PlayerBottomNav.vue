<template>
  <!-- ── Bottom navigation bar ──────────────────────────────────────────── -->
  <!-- pb-safe pushes the nav's inner content above the iOS home indicator;
       pl-safe / pr-safe keep the edge buttons off landscape notches. -->
  <nav class="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border h-[calc(4rem+env(safe-area-inset-bottom))] pb-safe pl-safe pr-safe">
    <div class="flex items-stretch justify-around">

      <!-- Mobile (< sm): 4 pinned items -->
      <RouterLink
        v-for="item in mobileNav"
        :key="'mob-' + item.to"
        :to="item.to"
        class="sm:hidden flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-2xs md:text-xs tracking-wider">{{ item.label }}</span>
      </RouterLink>

      <!-- Tablet+ (sm+): 7 pinned items -->
      <RouterLink
        v-for="item in tabletNav"
        :key="'tab-' + item.to"
        :to="item.to"
        class="hidden sm:flex flex-col items-center justify-center gap-0.5 flex-1 py-3 transition-colors"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-2xs md:text-xs tracking-wider">{{ item.label }}</span>
      </RouterLink>

      <!-- More button (always) -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 sm:py-3 transition-colors"
        :class="showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="emit('open-more')"
      >
        <IconGridView class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-2xs md:text-xs tracking-wider">More</span>
      </button>

    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { IconGridView } from '@/lib/icons';
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { MOBILE_NAV_SLOTS, TABLET_NAV_SLOTS } from "@/lib/playerNav";

const { showMore } = defineProps<{
  showMore: boolean;
}>();

const emit = defineEmits<{
  'open-more': [];
}>();

const route = useRoute();
const { sortedNav } = usePlayerNavPrefs();

const mobileNav = computed(() => sortedNav.value.slice(0, MOBILE_NAV_SLOTS));
const tabletNav = computed(() => sortedNav.value.slice(0, TABLET_NAV_SLOTS));

function isActive(to: string): boolean {
  return to === "/play" ? route.path === "/play" : route.path.startsWith(to);
}
</script>
