<template>
  <!--
    The whole-page placeholder shown while a navigation waits on its route chunk
    (see router/navigationPending). It repeats ListPageLayout's frame (same
    paddings, same gold divider) so the real page replaces it without a jump.
    Below md the top bar owns the title, exactly as in ListPageLayout, so only
    the action and filter blocks appear there.
  -->
  <div class="lg:flex lg:flex-col lg:flex-1 lg:min-h-0" role="status">
    <span class="sr-only">Loading…</span>

    <div class="bg-background px-4 pt-3 md:px-6 md:pt-6">
      <div class="flex items-start justify-between gap-3 md:flex-wrap md:gap-4">
        <div class="hidden md:block md:shrink-0">
          <SkeletonBlock class="h-9 w-56" />
          <SkeletonBlock class="mt-2 h-4 w-80 max-w-full" />
        </div>
        <div class="flex items-center gap-2 md:grow md:justify-end">
          <SkeletonBlock class="h-9 w-24 rounded-lg" />
          <SkeletonBlock class="h-9 w-9 rounded-lg" />
          <SkeletonBlock class="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <div class="gold-divider mt-3 md:mt-4" />

      <div class="flex gap-2 py-3">
        <SkeletonBlock class="h-9 min-w-0 flex-1 rounded-lg md:max-w-sm md:flex-none md:basis-80" />
        <SkeletonBlock class="h-9 w-24 rounded-lg" />
      </div>
    </div>

    <div class="px-4 pb-4 md:px-6 md:pb-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <ListSkeleton :variant="isMobile ? 'rows' : 'grid'" :count="isMobile ? 8 : 12" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import SkeletonBlock from "@/components/common/SkeletonBlock.vue";
import { useIsMobile } from "@/composables/useBreakpoint";

const isMobile = useIsMobile();
</script>
