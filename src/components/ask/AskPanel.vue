<template>
  <!-- Desktop and tablet: a column beside the page, as the campaign chat is. -->
  <Transition v-if="!isMobile" v-bind="railTransition()">
    <aside v-if="ui.open" class="hidden w-104 shrink-0 md:flex sticky top-0 h-dvh" aria-label="Familiar" data-testid="ask-panel">
      <div class="flex w-104 shrink-0 flex-col border-l border-border bg-card">
        <AskSurface ref="surface" v-bind="surfaceProps" v-on="surfaceHandlers" />
      </div>
    </aside>
  </Transition>

  <!-- Phones: a sheet above the bottom nav. -->
  <template v-else>
    <div v-if="ui.open" class="fixed inset-0 z-40 bg-black/40" @click="ui.closePanel()" />
    <div
      v-if="ui.open"
      class="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--dock-bottom,0px))] inset-x-0 z-50 flex h-[65vh] flex-col rounded-t-2xl border-t border-border bg-card"
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
import { railTransition } from "@/lib/motion";
import { FREE_ASKS_PER_DAY, type AskReportDraft } from "@edge-shared/agent/askContract";
import { useAskAdapters } from "@/ai/ask/useAskAdapters";
import { useAskConversation, type AskNotice } from "@/composables/ask/useAskConversation";
import { askContextFor } from "@/composables/ask/askContext";
import { useAskUsage } from "@/composables/ask/askUsage";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignStore } from "@/stores/campaign";
import { useAskUiStore } from "@/stores/ui/ask";
import AskSurface from "@/components/ask/AskSurface.vue";
import AskResultNotice from "@/components/ask/AskResultNotice.vue";

const ui = useAskUiStore();
const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const isMobile = useIsMobile();
const { openOutOfCredits } = useOutOfCredits();
const usage = useAskUsage();
const adapters = useAskAdapters();
const surface = ref<InstanceType<typeof AskSurface> | null>(null);
const notice = ref<AskNotice | null>(null);

const BugReportModal = defineAsyncComponent(() => import("@/components/common/overlays/BugReportModal.vue"));
const reportOpen = ref(false);
const reportMounted = useLazyMount(reportOpen);
const reportDraft = ref<AskReportDraft | null>(null);

const convo = useAskConversation({
  campaignId: () => campaign.activeCampaignId,
  context: () => askContextFor({ path: route.path, query: route.query }, route.meta.title),
  adapters,
  campaignName: () => campaign.activeCampaign?.name ?? "this campaign",
  routePath: () => route.fullPath,
  onFinished: ({ startedAt, ...finished }) => {
    // Generation goes on with the panel shut. The DM is told by the dot, and by a slip if they are not looking at
    // the place it started from; when they are looking at the panel it is already in the thread.
    if (!ui.open) ui.markUnread();
    if (!ui.open || route.fullPath !== startedAt) notice.value = finished;
  },
});

const freeLeft = computed(() => convo.freeLeft.value ?? usage.freeLeft.value);
// The count stays until it runs out: switching to the cost sentence after the first question read as if the free
// ones were already gone (maintainer, 23 Nov 2026).
const allowanceLine = computed(() => {
  if (freeLeft.value === null) return "";
  if (freeLeft.value === 0) return "No free questions left today. An answer now costs what it uses, charged in whole credits.";
  return `${freeLeft.value} of ${FREE_ASKS_PER_DAY} free questions left today`;
});

const surfaceProps = computed(() => ({
  items: convo.items.value,
  adapters,
  running: convo.running.value,
  speaking: convo.speaking.value,
  campaignName: campaign.activeCampaign?.name ?? "No campaign",
  pageTitle: (route.meta.title as string | undefined) ?? null,
  allowanceLine: allowanceLine.value,
}));

const surfaceHandlers = {
  new: () => convo.newConversation(),
  close: () => ui.closePanel(),
  send: (text: string) => void convo.send(text),
  choose: convo.choose,
  "hand-off": convo.handOff,
  confirm: (id: number) => void convo.confirm(id),
  cancel: convo.cancel,
  adjust: convo.adjust,
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
    convo.newConversation();
    void convo.send(text);
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

// The day's free questions are read again after each turn, so the line is the server's and not a guess.
watch(convo.running, (isRunning) => {
  if (!isRunning) usage.refetch();
});

// Opening the panel is seeing the result in the thread: the slip has done its job.
watch(
  () => ui.open,
  (open) => {
    if (open) notice.value = null;
  },
);

</script>
