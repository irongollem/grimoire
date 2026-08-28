<template>
  <!-- At rest the app needs no label: prep *is* the app. What needs saying is
       the thing you can start. Once it is running the control stops being a
       button and becomes a status the DM can read at a glance — which is the
       whole complaint about the segmented pair it replaces, where flipping to
       PLAY changed one segment's tint and nothing else on screen. -->
  <div class="w-full">
    <AppButton
      v-if="!isRunning"
      variant="subtle"
      :size="size === 'md' ? 'md' : 'xs'"
      block
      class="font-cinzel font-bold tracking-widest"
      :disabled="pending || !campaign.activeCampaignId"
      :label="size === 'md' ? 'Start session' : 'Start session'"
      @click="onStart"
    />

    <div
      v-else
      class="flex items-center gap-2 rounded border border-primary/50 bg-primary/10"
      :class="size === 'md' ? 'px-3 py-2' : 'px-2 py-1'"
    >
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
        :class="{ 'animate-pulse': !reduced }"
        aria-hidden="true"
      />
      <span
        class="flex-1 truncate font-cinzel font-bold uppercase tracking-widest text-primary"
        :class="size === 'md' ? 'text-xs' : 'text-2xs'"
      >
        Session live
      </span>
      <!-- Elapsed time is what makes a session nobody ended obvious. A
           three-day-old clock reads as wrong on sight, where a lit segment
           never did. -->
      <span
        class="shrink-0 font-mono tabular-nums text-primary/90"
        :class="size === 'md' ? 'text-2xs' : 'text-2xs'"
      >{{ elapsed }}</span>
      <AppButton
        variant="ghost"
        size="inline"
        class="shrink-0"
        tooltip="End session"
        aria-label="End session"
        :disabled="pending"
        @click="onEnd"
      >
        <IconClose class="h-3 w-3" />
      </AppButton>
    </div>
  </div>

  <SessionStartDialog
    v-model:open="confirmOpen"
    :pending="pending"
    @confirm="confirmStart"
  />
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignSession, formatSessionElapsed } from "@/composables/campaign/useCampaignSession";
import { useToast } from "@/composables/useToast";
import { prefersReducedMotion } from "@/lib/motion";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import SessionStartDialog from "@/components/layout/SessionStartDialog.vue";

const { size = "sm" } = defineProps<{
  /** sm = chrome scale (sidebar, top bar); md = the More sheet. */
  size?: "sm" | "md";
}>();

const campaign = useCampaignStore();
const toast = useToast();
const { isRunning, startedAt, pending, start, end } = useCampaignSession();

const reduced = prefersReducedMotion();
const confirmOpen = ref(false);

// The clock only needs to be right to the minute, so it ticks once a minute.
// A per-second timer would repaint the chrome 60× more often to render digits
// that do not change.
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 60_000);
onUnmounted(() => clearInterval(tick));

const elapsed = computed(() => formatSessionElapsed(startedAt.value, now.value));

/** The one moment a DM will read four lines about what changes, so it is the
 *  only place the consequences are enumerated. Dismissible forever. */
const SEEN_KEY = "grimoire:session-start-explained";

async function onStart() {
  if (localStorage.getItem(SEEN_KEY) === "true") return confirmStart();
  confirmOpen.value = true;
}

async function confirmStart() {
  confirmOpen.value = false;
  try {
    await start();
    now.value = Date.now();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "The session could not be started");
  }
}

async function onEnd() {
  try {
    const closed = await end();
    const parts: string[] = [];
    if (closed.encounters_ended) parts.push(`${closed.encounters_ended} encounter${closed.encounters_ended === 1 ? "" : "s"} stopped`);
    if (closed.chains_paused) parts.push(`${closed.chains_paused} quest${closed.chains_paused === 1 ? "" : "s"} paused`);
    // Says what it did, because ending a session reaches further than the
    // control it was clicked from — combat stops and open chains pause.
    toast.success(parts.length ? `Session ended — ${parts.join(", ")}.` : "Session ended.");
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "The session could not be ended");
  }
}
</script>
