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
      label="Start session"
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
        {{ liveLabel }}
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
import { formatSessionElapsed, type StartSessionOptions } from "@/composables/campaign/useCampaignSession";
import { useSessionActions } from "@/composables/sessions/useSessionActions";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { prefersReducedMotion } from "@/lib/motion";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import SessionStartDialog from "@/components/layout/SessionStartDialog.vue";

const { size = "sm" } = defineProps<{
  /** sm = chrome scale (sidebar, top bar); md = the More sheet. */
  size?: "sm" | "md";
}>();

const campaign = useCampaignStore();
const { session, isRunning, startedAt, pending, startSession, endSession } = useSessionActions();

const reduced = prefersReducedMotion();
const confirmOpen = ref(false);

// The clock only needs to be right to the minute, so it ticks once a minute.
// A per-second timer would repaint the chrome 60× more often to render digits
// that do not change.
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 60_000);
onUnmounted(() => clearInterval(tick));

const liveLabel = computed(() =>
  session.value && session.value.number !== null ? `${sessionShortLabel(session.value)} live` : "Session live",
);
const elapsed = computed(() => formatSessionElapsed(startedAt.value, now.value));

/** Every start asks: the number and title are the session's name in the log,
 *  and the only moment the DM is certain to be looking at it. */
function onStart() {
  confirmOpen.value = true;
}

async function confirmStart(options: StartSessionOptions) {
  confirmOpen.value = false;
  if (await startSession(options)) now.value = Date.now();
}

// Says what it did, because ending a session reaches further than the control
// it was clicked from — combat stops and open chains pause.
const onEnd = endSession;
</script>
