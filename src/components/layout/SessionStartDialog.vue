<template>
  <AppModal :open="open" size="sm" @close="emit('update:open', false)">
    <ModalHeader
      :title="continuing ? 'Continue the session' : 'Start the session'"
      subtitle="Reveals post to your players' chat while it runs."
      :icon="IconEncounter"
      tone="primary"
    />

    <form class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" @submit.prevent="onConfirm">
      <!-- #1058: an evening ended by accident or by a long break is reopened,
           not started again as a second session with the next number. -->
      <SegmentedControl
        v-if="continuable"
        v-model="mode"
        :options="modeOptions"
        block
        aria-label="Continue or start a new session"
      />

      <div v-if="continuing && continuable" class="space-y-1">
        <p class="text-heading-xs font-semibold text-foreground">{{ sessionLabel(continuable) }}</p>
        <p class="text-caption text-muted-foreground">
          {{ endedAgo }}. Everything from here on is filed under it, and the log shows one session.
        </p>
      </div>

      <template v-else>
        <div class="space-y-1.5">
          <label for="session-start-number" class="text-label-lg font-semibold text-foreground">Session number</label>
          <AppInput
            id="session-start-number"
            v-model.number="number"
            type="number"
            size="md"
            placeholder="No number"
          />
          <AppButton
            v-if="number !== null"
            variant="ghost"
            size="inline"
            class="text-caption text-muted-foreground"
            label="Start without a number"
            @click="number = null"
          />
          <p v-else class="text-caption text-muted-foreground">
            An unnumbered session: right for a test or a one-shot. You can number it later from the log.
          </p>
        </div>

        <div class="space-y-1.5">
          <label for="session-start-title" class="text-label-lg font-semibold text-foreground">
            Title <span class="font-normal text-muted-foreground">(optional)</span>
          </label>
          <AppInput id="session-start-title" v-model.trim="title" size="md" placeholder="Into the Mere" />
          <p v-if="scheduled" class="text-caption text-muted-foreground">From today's scheduled session.</p>
        </div>

        <p v-if="lastTime" class="text-caption text-muted-foreground">Last time: {{ lastTime }}</p>
      </template>
    </form>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('update:open', false)" />
      <AppButton variant="live" size="sm" :disabled="pending" :label="startLabel" @click="onConfirm" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconEncounter } from "@/lib/icons";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import {
  continuableSession,
  continueLabel,
  formatEndedAgo,
  formatSessionDay,
  lastPlayedSession,
  nextSessionNumber,
  prefersContinue,
  todaysScheduledSession,
} from "@/lib/sessions/sessionPrefill";
import type { StartSessionOptions } from "@/composables/campaign/useCampaignSession";

const { open, pending = false } = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [options: StartSessionOptions];
}>();

const { data: log } = useCampaignSessions();
const { data: proposals } = useSessionProposals();
const today = useLocalToday();

const number = ref<number | null>(null);
const title = ref("");
const mode = ref<"continue" | "start">("start");
/** When the dialog opened: the break is measured from here, not re-measured each minute. */
const openedAt = ref(Date.now());

const continuable = computed(() => continuableSession(log.value ?? []));
const nextNumber = computed(() => nextSessionNumber(log.value ?? []));
const continuing = computed(() => mode.value === "continue" && continuable.value !== null);
const endedAgo = computed(() => {
  const text = continuable.value ? formatEndedAgo(continuable.value, openedAt.value) : "";
  return text.charAt(0).toUpperCase() + text.slice(1);
});
const modeOptions = computed<SegmentedOption<"continue" | "start">[]>(() => [
  { value: "continue", label: continuable.value ? continueLabel(continuable.value) : "Continue session" },
  { value: "start", label: nextNumber.value !== null ? `Start session ${nextNumber.value}` : "Start a new one" },
]);

const scheduled = computed(() => todaysScheduledSession(proposals.value ?? [], today.value));
const last = computed(() => lastPlayedSession(log.value ?? []));
const lastTime = computed(() =>
  last.value ? `${sessionLabel(last.value).replace(": ", ", ")} · ${formatSessionDay(last.value)}` : null,
);

// Prefilled each time the dialog opens, from whatever the log and the calendar
// hold then: a number the DM set last week must not outlive the session that
// has since taken it.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    openedAt.value = Date.now();
    number.value = nextNumber.value;
    title.value = scheduled.value?.title ?? "";
    // Continue is the default only when it is obviously the same evening.
    mode.value = continuable.value && prefersContinue(continuable.value, openedAt.value) ? "continue" : "start";
  },
  { immediate: true },
);

const startLabel = computed(() => {
  if (continuing.value && continuable.value) return continueLabel(continuable.value);
  return number.value !== null ? `Start session ${number.value}` : "Start session";
});

function onConfirm() {
  if (continuing.value && continuable.value) {
    emit("confirm", { continueId: continuable.value.id });
    return;
  }
  emit("confirm", {
    number: number.value,
    title: title.value.trim() || null,
    // Only a title that came from the schedule links back to it.
    proposalId: scheduled.value && title.value.trim() === scheduled.value.title ? scheduled.value.id : null,
  });
}
</script>
