<template>
  <!-- The one right-hand column: the campaign chat and the Familiar are two tabs of it, never two columns. -->
  <Transition v-bind="railTransition()">
    <aside
      v-if="open && isDesktop"
      class="flex w-104 shrink-0"
      :class="asideClass"
      aria-label="Chat and Familiar"
      data-testid="side-dock"
      :data-mode="overlay ? 'overlay' : 'push'"
    >
      <!-- Fixed width, so the dock slides out from the page edge rather than rewrapping while it opens. -->
      <div class="flex w-104 shrink-0 flex-col border-l border-border bg-card">
        <div class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
          <div class="flex min-w-0 flex-1 items-center gap-1" role="tablist" aria-label="Right-hand dock">
            <AppButton
              v-if="canAsk"
              role="tab"
              variant="ghost"
              size="sm"
              label="Familiar"
              :active="ask.open"
              :aria-selected="ask.open"
              aria-controls="side-dock-body"
              data-testid="side-dock-tab-familiar"
              @click="ask.openPanel()"
            />
            <AppButton
              role="tab"
              variant="ghost"
              size="sm"
              :active="appUi.chatOpen"
              :aria-selected="appUi.chatOpen"
              aria-controls="side-dock-body"
              data-testid="side-dock-tab-chat"
              @click="appUi.openChat()"
            >
              Chat
              <span v-if="appUi.chatHasUnread" class="h-2 w-2 rounded-full bg-destructive" data-testid="side-dock-unread" aria-label="Unread messages" />
            </AppButton>
          </div>
          <AppButton variant="ghost" size="icon-sm" :icon="IconClose" icon-size="md" aria-label="Close" data-testid="side-dock-close" @click="close" />
        </div>
        <div id="side-dock-body" class="flex min-h-0 flex-1 flex-col" />
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
/**
 * One dock for the campaign chat and the Familiar (maintainer, 24 Nov 2026; canvas "Ask Grimoire" frames 12 and 13).
 * It owns the column and the tab strip; each body stays where it was (CampaignChat, AskPanel) and teleports into
 * `#side-dock-body`, which exists once the layout has mounted this before them. Only one is open at a time.
 *
 * Wide windows (110rem: sidebar, about 1100px of page and the dock) lay it in the flow, pushing the page as both
 * columns did; narrower ones slide it over the page with no scrim, so the page keeps its width and a click on it does
 * not close the dock. A phone keeps each one's own bottom sheet, which is why nothing renders here below `md`; the
 * one-at-a-time rule still holds there.
 */
import { computed, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useAbove } from "@/composables/useBreakpoint";
import { useCanAsk } from "@/composables/ask/useCanAsk";
import { railTransition } from "@/lib/motion";
import { IconClose } from "@/lib/icons";
import { useAppUiStore } from "@/stores/ui/app";
import { useAskUiStore } from "@/stores/ui/ask";
import AppButton from "@/components/common/controls/AppButton.vue";

/** The player layout lays the dock inside its own column and never over the page. */
const { contained = false } = defineProps<{ contained?: boolean }>();

const appUi = useAppUiStore();
const ask = useAskUiStore();
const canAsk = useCanAsk();
const isDesktop = useAbove("md");
const roomToPush = useMediaQuery("(min-width: 110rem)");

const open = computed(() => appUi.chatOpen || ask.open);
const overlay = computed(() => !contained && !roomToPush.value);
const asideClass = computed(() => {
  if (overlay.value) return "fixed right-0 top-0 z-40 h-dvh shadow-[-12px_0_24px_rgb(43_32_25/0.18)]";
  return contained ? "h-full min-h-0" : "sticky top-0 h-dvh";
});

// One at a time, whoever opens: every caller that sets `chatOpen` or opens the Familiar keeps working.
watch(
  () => appUi.chatOpen,
  (isOpen) => {
    if (isOpen) ask.closePanel();
  },
);
watch(
  () => ask.open,
  (isOpen) => {
    if (isOpen) appUi.chatOpen = false;
  },
);

function close() {
  appUi.chatOpen = false;
  ask.closePanel();
}
</script>
