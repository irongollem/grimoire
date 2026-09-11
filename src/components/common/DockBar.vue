<template>
  <!--
    A bottom-docked action bar for phone-width surfaces (#872, "Quest Phone
    Frames"): the one or two controls that must stay one tap away at any
    scroll position — "What happens next" in the run cockpit, "Rooms · n" and
    "Advance beat" in the site handoff, "Reveal to players" on the beat page.

    Sticky inside the page's own scroll container rather than `fixed`, so it
    never floats over another route's chrome, and offset above the DM bar nav
    wherever that bar is the nav chrome (the `barnav:` variant — pointer or
    width driven, see src/assets/theme.css). Above `hideFrom` it does not
    exist: the desktop layout keeps its controls in normal document flow (the
    #776 rule for the outcome strip is untouched on `xl` and up).

    `-mx-4 md:-mx-6` cancels `PageHeader`'s own scroll-body padding
    (`px-4 md:px-6`, PageHeader.vue's `data-testid="page-body"`) — every
    caller (QuestRunCockpit, QuestSiteHandoff, QuestBeatDetailView) mounts
    inside that body with no horizontal padding of its own in between, so this
    is the only padding actually in play. Keep the two in sync.

    Where the bar nav is still on screen — a touch tablet between `md` and the
    dock's own breakpoint — the dock sits above it; below `md` the quest
    routes are full-screen takeovers (`meta.fullscreenMobile`) with no bar nav,
    so the dock is the true bottom, as the frames draw it.

    Tap targets are 48px in the dock, per the frames' phone rules; callers pass
    `AppButton`s with `size="lg"` or a `min-h-12` class.
  -->
  <div
    class="sticky z-20 -mx-4 mt-auto flex items-center gap-2 border-t border-border bg-card px-4 pt-2.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-18px_rgba(17,31,56,0.5)] md:-mx-6 md:px-6"
    :class="[HIDE_FROM[hideFrom], offsetClass]"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useIsMobile } from "@/composables/useBreakpoint";

const { hideFrom = "xl" } = defineProps<{
  /** The breakpoint from which the dock stops existing. */
  hideFrom?: keyof typeof HIDE_FROM;
}>();

// Static strings on purpose: Tailwind only emits classes it can read.
const HIDE_FROM = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden", xl: "xl:hidden" } as const;

const isMobile = useIsMobile();
const offsetClass = computed(() => isMobile.value
  ? "bottom-0"
  : "barnav:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sidenav:bottom-0");
</script>
