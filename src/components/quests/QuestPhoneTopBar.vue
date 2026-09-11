<template>
  <!--
    The phone top bar of a quest surface (#872, "Quest Phone Frames", the
    `tbar` in every frame): back, title, one line under it, one trailing
    action. Rendered only below `md`, where `/quests/:id` and its beat page
    are full-screen takeover routes (`meta.fullscreenMobile`, the same
    contract the NPC and monster sheets use) and the app's own top bar and
    bottom nav are suppressed. Above `md` it does not exist — `PageHeader`
    shows the title and the sidebar is the nav.

    Back goes where the party came from when there is a history entry, else
    to the quest log — the NPC sheet's rule, copied not re-derived.
  -->
  <header class="sticky top-0 z-30 -mx-4 flex min-h-13 items-center gap-2 border-b border-border bg-card px-2 py-2 md:hidden">
    <AppButton
      variant="ghost"
      size="icon-sm"
      shape="pill"
      :class="ICON_TOUCH_TARGET"
      :icon="IconChevronLeft"
      icon-size="lg"
      aria-label="Back"
      @click="goBack"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate font-cinzel text-body font-bold leading-tight text-foreground">{{ title }}</p>
      <p v-if="subtitle" class="truncate font-fell text-caption text-muted-foreground">{{ subtitle }}</p>
    </div>
    <slot name="action" />
  </header>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import { IconChevronLeft } from "@/lib/icons";

const { title, subtitle, fallbackTo = "/quests" } = defineProps<{
  title: string;
  subtitle?: string;
  /** Where Back goes when there is no history to return to. */
  fallbackTo?: string;
}>();

const router = useRouter();

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push(fallbackTo);
}
</script>
