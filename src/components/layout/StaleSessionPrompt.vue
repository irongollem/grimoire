<template>
  <!--
    A session nobody ended is the failure this exists for: the DM closed the
    laptop on Thursday, and on Sunday afternoon every NPC they reveal while
    prepping announces itself to players who are not at the table.

    An alert dialog rather than a toast, because the question has consequences
    either way and a toast that times out would default to "keep broadcasting".
  -->
  <AppModal :open="open" size="sm" role="alertdialog" @close="keepRunning">
    <ModalHeader
      title="Still playing?"
      :subtitle="`This session has been running for ${elapsedLabel}.`"
      :icon="IconClock"
      tone="caution"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <p class="text-body text-muted-foreground">
        While it runs, revealing an NPC posts to your players' chat. If the table
        has packed up, end the session: any running encounter stops and every
        open quest pauses where the party left it.
      </p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton variant="subtle" size="sm" label="Still playing" @click="keepRunning" />
      <AppButton variant="primary" size="sm" :disabled="pending" label="End session" @click="onEnd" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconClock } from "@/lib/icons";
import { isSessionStale, formatSessionElapsed } from "@/composables/campaign/useCampaignSession";
import { useSessionActions } from "@/composables/sessions/useSessionActions";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";

// The shared end: the same toast as every other End, with its Undo, which is
// what a wrong answer here needs (#1058).
const { session, loaded, pending, endSession } = useSessionActions();

const open = ref(false);
/**
 * Asked once per app load, not on a timer. A `setInterval` that fires at 3am to
 * ask "still playing?" is worse than not asking: nobody is there to answer, and
 * the dialog is waiting on top of the app in the morning.
 *
 * Dismissing means "yes, still playing" — so it must not re-ask this load, or
 * the answer stops meaning anything.
 */
const answered = ref(false);

const elapsedLabel = computed(() => {
  const elapsed = formatSessionElapsed(session.value?.started_at ?? null);
  if (!elapsed) return "a while";
  const [hours] = elapsed.split(":");
  const count = Number(hours);
  return count >= 24
    ? `${Math.floor(count / 24)} day${Math.floor(count / 24) === 1 ? "" : "s"}`
    : `${count} hour${count === 1 ? "" : "s"}`;
});

watch(
  [loaded, session],
  () => {
    if (answered.value || !loaded.value) return;
    if (isSessionStale(session.value)) open.value = true;
  },
  { immediate: true },
);

function keepRunning() {
  answered.value = true;
  open.value = false;
}

async function onEnd() {
  answered.value = true;
  try {
    await endSession();
  } finally {
    open.value = false;
  }
}
</script>
