<template>
  <!-- ── Bottom navigation bar ──────────────────────────────────────────── -->
  <!-- pb-safe pushes the nav's inner content above the iOS home indicator;
       pl-safe / pr-safe keep the edge buttons off landscape notches. -->
  <nav class="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border h-[calc(4rem+env(safe-area-inset-bottom))] pb-safe pl-safe pr-safe">
    <div class="flex items-stretch justify-around">

      <!-- Mobile (< sm): 4 pinned items -->
      <RouterLink
        v-for="item in mobileNav"
        :key="'mob-' + item.id"
        v-prefetch="item.to"
        :to="item.to"
        class="sm:hidden relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span v-if="unreadPaths.includes(item.to)" class="absolute top-1.5 left-1/2 ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="New" />
        <span class="text-label md:text-xs">{{ item.label }}</span>
      </RouterLink>

      <!-- Tablet+ (sm+): 7 pinned items -->
      <RouterLink
        v-for="item in tabletNav"
        :key="'tab-' + item.id"
        v-prefetch="item.to"
        :to="item.to"
        class="hidden sm:flex relative flex-col items-center justify-center gap-0.5 flex-1 py-3 transition-colors"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span v-if="unreadPaths.includes(item.to)" class="absolute top-1.5 left-1/2 ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="New" />
        <span class="text-label md:text-xs">{{ item.label }}</span>
      </RouterLink>

      <!-- More button (always) -->
      <button
        type="button"
        class="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 sm:py-3 transition-colors"
        :class="showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="emit('open-more')"
      >
        <IconGridView class="h-5 w-5 shrink-0" />
        <!-- Something new in a section that lives behind More at this width. -->
        <span v-if="moreUnreadMobile" class="sm:hidden absolute top-1.5 left-1/2 ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="New" />
        <span v-if="moreUnreadTablet" class="hidden sm:block absolute top-1.5 left-1/2 ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="New" />
        <span class="text-label md:text-xs">More</span>
      </button>

    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { IconGridView } from '@/lib/icons';
import { usePlayerNavPrefs } from "@/composables/player/usePlayerNavPrefs";
import { usePrefetchOnIntent } from "@/composables/usePrefetchOnIntent";
import { MOBILE_NAV_SLOTS, TABLET_NAV_SLOTS, isNavItemActive } from "@/lib/playerNav";

const { showMore, unreadPaths } = defineProps<{
  showMore: boolean;
  /** Nav paths with something new (usePlayerUnread). */
  unreadPaths: readonly string[];
}>();

const emit = defineEmits<{
  'open-more': [];
}>();

const vPrefetch = usePrefetchOnIntent();
const route = useRoute();
const { sortedNav } = usePlayerNavPrefs();

const mobileNav = computed(() => sortedNav.value.slice(0, MOBILE_NAV_SLOTS));
const tabletNav = computed(() => sortedNav.value.slice(0, TABLET_NAV_SLOTS));

// The More button carries the dot for whatever is unread but not pinned at this width.
const moreUnreadMobile = computed(() => unreadPaths.some((p) => !mobileNav.value.some((i) => i.to === p)));
const moreUnreadTablet = computed(() => unreadPaths.some((p) => !tabletNav.value.some((i) => i.to === p)));

function isActive(to: string): boolean {
  return isNavItemActive(to, route.path);
}
</script>
