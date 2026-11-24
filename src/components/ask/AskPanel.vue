<template>
  <!-- Desktop and tablet: the body of the right-hand dock (SideDock). Kept alive while the chat has the dock, so a half-written question survives a tab switch. -->
  <Teleport v-if="docked" to="#side-dock-body" defer>
    <div v-show="ui.open" class="flex min-h-0 flex-1 flex-col" aria-label="Familiar" data-testid="ask-panel">
      <AskSurface ref="surface" docked v-bind="surfaceProps" v-on="surfaceHandlers" />
    </div>
  </Teleport>

  <!-- Phones: a sheet above the bottom nav. -->
  <template v-if="isMobile">
    <!-- The sheet takes its place in the modal stack: above a modal it was opened from, below anything opened from inside it (a confirm, the paywalls, the report form). -->
    <div v-if="ui.open" class="fixed inset-0 bg-black/40" :style="{ zIndex: sheetZ ?? undefined }" @click="ui.closePanel()" />
    <div
      v-if="ui.open"
      :class="['fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--dock-bottom,0px))] inset-x-0 flex flex-col rounded-t-2xl border-t border-border bg-card', fullSheet ? 'top-[calc(env(safe-area-inset-top)+0.5rem)]' : 'h-[65vh]']"
      :style="{ zIndex: sheetZ ?? undefined }"
      role="dialog"
      aria-label="Familiar"
      data-testid="ask-panel"
    >
      <AskSurface ref="surface" v-bind="surfaceProps" v-on="surfaceHandlers" />
    </div>
  </template>

  <!-- A result that finished while the panel was closed, or the DM was somewhere else. -->
  <!-- The report form, with Ask's draft in it. Only its own Send files anything. -->
  <BugReportModal v-if="reportMounted" v-model="reportOpen" :draft="reportDraft ?? undefined" />

  <AskResultNotice v-if="notice" :notice="notice" @dismiss="notice = null" @open="openResult" />
</template>

<script setup lang="ts">
/**
 * Ask Grimoire's panel (#1253). Mounted by the layout the first time it is opened and left mounted, so a turn or a
 * generation running when it is hidden carries on and its result still arrives (as a notice and a dot on the
 * button). It owns the wiring; `AskSurface` is the face and `useAskConversation` the conversation.
 */
import { computed, defineAsyncComponent, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useLazyMount } from "@/composables/useLazyMount";
import { FREE_ASKS_PER_DAY, type AskReportDraft } from "@edge-shared/agent/askContract";
import { useAskAdapters } from "@/ai/ask/useAskAdapters";
import { useAskConversation, type AskNotice } from "@/composables/ask/useAskConversation";
import { stopVoiceLines } from "@/composables/voices/useVoiceLineSpeech";
import { useFamiliarVoice } from "@/composables/ask/useFamiliarVoice";
import { useTableVoiceRates } from "@/composables/table/useTableVoice";
import { askContextFor } from "@/composables/ask/askContext";
import { useAskUsage } from "@/composables/ask/askUsage";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useAskUiStore } from "@/stores/ui/ask";
import { useModalStack } from "@/components/common/overlays/modalStack";
import AskSurface from "@/components/ask/AskSurface.vue";
import AskResultNotice from "@/components/ask/AskResultNotice.vue";

const ui = useAskUiStore();
const { confirm } = useConfirm();
const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const isMobile = useIsMobile();
const appUi = useAppUiStore();
const sheetZ = useModalStack(() => isMobile.value && ui.open);
const docked = computed(() => !isMobile.value && (ui.open || appUi.chatOpen));
const { openOutOfCredits } = useOutOfCredits();
const usage = useAskUsage();
const adapters = useAskAdapters();
const surface = ref<InstanceType<typeof AskSurface> | null>(null);
const notice = ref<AskNotice | null>(null);

const BugReportModal = defineAsyncComponent(() => import("@/components/common/overlays/BugReportModal.vue"));
const reportOpen = ref(false);
const reportMounted = useLazyMount(reportOpen);
const reportDraft = ref<AskReportDraft | null>(null);

const voice = useFamiliarVoice();
const rates = useTableVoiceRates();

const convo = useAskConversation({
  campaignId: () => campaign.activeCampaignId,
  context: () => askContextFor({ path: route.path, query: route.query }, route.meta.title),
  adapters,
  campaignName: () => campaign.activeCampaign?.name ?? "this campaign",
  routePath: () => route.fullPath,
  // Ooru reads its own words only: the conversation hands over the replies, nothing else. Only while its switch is
  // on screen: a voice the DM cannot see cannot be turned off, so it must not speak (or charge).
  onReplied: ({ sessionId, texts }) => {
    const campaignId = campaign.activeCampaignId;
    if (campaignId !== null && voicePerMinute.value !== null) voice.say({ campaignId, sessionId, texts });
  },
  onFinished: ({ startedAt, ...finished }) => {
    // Generation goes on with the panel shut. The DM is told by the dot, and by a slip if they are not looking at
    // the place it started from; when they are looking at the panel it is already in the thread.
    if (!ui.open) ui.markUnread();
    if (!ui.open || route.fullPath !== startedAt) notice.value = finished;
  },
});

/** On a phone a card a button opened, still to be filled in, takes the whole sheet: its form is long and its price stays in view. */
const fullSheet = computed(() => convo.items.value.some((i) => i.kind === "proposal" && i.origin === "button" && i.state === "quote"));

const freeLeft = computed(() => convo.freeLeft.value ?? usage.freeLeft.value);
// The count stays until it runs out: switching to the cost sentence after the first question read as if the free
// ones were already gone (maintainer, 23 Nov 2026).
const allowanceLine = computed(() => {
  if (freeLeft.value === null) return "";
  if (freeLeft.value === 0) return "No free questions left today. An answer now costs what it uses, charged in whole credits.";
  return `${freeLeft.value} of ${FREE_ASKS_PER_DAY} free questions left today`;
});

/**
 * Starts a fresh conversation unless that would lose something paid for: never while a generation is in flight (the
 * button is disabled, and a search or Suggest waits the same way), and only on a yes while one awaits Create. Starting
 * over silences the old answer. Resolves whether it started over.
 */
async function startOver(): Promise<boolean> {
  if (convo.generating.value) return false;
  const waiting = convo.holding.value;
  if (waiting !== null && !(await confirm(`Discard the ${waiting} you have not saved? What it cost is spent.`, { title: "Start over?", confirmLabel: "Discard it" }))) return false;
  voice.stop();
  stopVoiceLines();
  convo.newConversation();
  return true;
}

/** What Ooru's voice costs a minute, when the server speaks with ElevenLabs at all; null hides the switch. */
const voicePerMinute = computed(() => (rates.data.value?.on === true ? rates.data.value.perMinute.elevenlabs : null));
const voiceNote = computed(() => {
  if (!voice.on.value) return null;
  if (voice.broke.value) return "Ooru went quiet: you are out of credits.";
  if (voice.spent.value) return "Ooru went quiet: the voices allowance is used up for now.";
  if (voice.unavailable.value) return "Ooru cannot speak: voices are not switched on.";
  return null;
});

const surfaceProps = computed(() => ({
  items: convo.items.value,
  adapters,
  running: convo.running.value,
  startingOverBlocked: convo.generating.value,
  // The owl moves while the words arrive and while Ooru reads them aloud: either is Ooru talking. Following the audio
  // alone left it still through the streaming, and for good on a reply the server declined to voice.
  speaking: convo.speaking.value || voice.speaking.value,
  campaignName: campaign.activeCampaign?.name ?? "No campaign",
  pageTitle: (route.meta.title as string | undefined) ?? null,
  allowanceLine: allowanceLine.value,
  voice: { shown: voicePerMinute.value !== null, on: voice.on.value, perMinute: voicePerMinute.value, note: voiceNote.value },
}));

const surfaceHandlers = {
  new: () => void startOver(),
  voice: (on: boolean) => voice.setOn(on),
  // Read a reply again: the server answers from the clip it kept, so one already read costs nothing.
  replay: (text: string) => {
    const campaignId = campaign.activeCampaignId;
    const sessionId = convo.sessionId();
    if (campaignId !== null && sessionId !== null && voicePerMinute.value !== null) voice.replay({ campaignId, sessionId, text });
  },
  close: () => ui.closePanel(),
  send: (text: string) => void convo.send(text),
  choose: convo.choose,
  "hand-off": convo.handOff,
  confirm: (id: number) => void convo.confirm(id),
  cancel: convo.cancel,
  adjust: convo.adjust,
  concept: convo.setConcept,
  quick: (id: number) => void convo.quick(id),
  create: (id: number) => void convo.createPreview(id),
  again: (id: number) => void convo.againPreview(id),
  act: (id: number, section: number, row: number) => void convo.actOnRow(id, section, row),
  discard: convo.discardPreview,
  pick: convo.choosePreview,
  decide: convo.decide,
  retry: (id: number, i: number) => void convo.retryPart(id, i),
  leave: convo.leavePart,
  credits: (needed: number) => openOutOfCredits(needed),
  upgrade: () => void router.push("/billing"),
  review: (report: AskReportDraft) => {
    reportDraft.value = report;
    reportOpen.value = true;
  },
};

async function openResult(to: string) {
  const open = notice.value?.open;
  notice.value = null;
  await router.push(to);
  // Suggestions live in the page's own panel: it opens once the page is there.
  open?.();
}

// A question carried over from the search box starts a fresh conversation: it is a new question, not a reply.
watch(
  () => ui.pendingQuery,
  (pending) => {
    if (pending === null) return;
    const text = ui.takePendingQuery();
    if (text === null) return;
    // When a generation is in flight or awaiting a yes, the question joins the thread it is in.
    void startOver().then(() => convo.send(text));
  },
  { immediate: true },
);

// A page's Generate button leaves a generator's card to open. It joins the thread (the DM may be mid-conversation)
// and sends nothing: no model is asked and nothing is charged until the card's gilt button is pressed.
watch(
  () => ui.pendingGenerator,
  (pending) => {
    if (pending === null) return;
    const taken = ui.takePendingGenerator();
    if (taken !== null) convo.openGenerator(taken);
  },
  { immediate: true },
);

// A request written into the box unsent (the Canon's Suggest) also starts a fresh conversation; the composer takes the text.
watch(
  () => ui.prefill,
  (text) => {
    if (text !== null) void startOver();
  },
  { immediate: true },
);

// The hotkey and the button both ask for the input; the surface is only there once the panel is open.
watch(
  () => ui.focusRequest,
  async () => {
    await nextTick();
    surface.value?.focus();
  },
  { immediate: true },
);

// A conversation belongs to one campaign: the old one's answer must not carry on speaking in the new.
watch(() => campaign.activeCampaignId, () => {
  voice.stop();
  stopVoiceLines();
});

// A new turn silences the old answer, however it was started (typed, a chip chosen, a question carried over from
// search): in one place, so no path into a turn can forget it. The day's free questions are read again after each
// turn, so the line is the server's and not a guess.
watch(convo.running, (isRunning) => {
  if (isRunning) {
    voice.stop();
    stopVoiceLines();
  }
  else usage.refetch();
});

// The switch went away (voices off, or their price unknown): whatever was playing stops with it.
watch(voicePerMinute, (perMinute) => {
  if (perMinute === null) voice.stop();
});

// Opening the panel is seeing the result in the thread: the slip has done its job.
watch(
  () => ui.open,
  (open) => {
    if (open) notice.value = null;
  },
);

</script>
