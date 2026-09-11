<template>
  <AppModal :open="open" size="lg" align="sheet" panel-class="h-full sm:h-auto" @close="cancel">
    <!--
      Below `sm` (design frame `02 Advance`): three stacked sections plus a
      footer preview do not fit a phone modal, so the header becomes a
      two-step wizard (route, then what it does) instead of the single
      always-visible header `sm` and up keeps. Same submit, same validation —
      the step is presentational, so both headers drive the same refs.
    -->
    <div v-if="isMobile" class="border-b border-border px-5 pt-4 pb-3">
      <div class="mb-1 flex items-center justify-between gap-2">
        <p class="flex items-center gap-1.5 text-eyebrow font-semibold text-primary">
          <component :is="IconCheck" class="h-3 w-3" />
          Advance · Thread {{ threadLetter }}
        </p>
        <AppButton variant="ghost" size="md" :icon="IconClose" aria-label="Close" @click="cancel" />
      </div>
      <h3 class="mb-3 truncate text-heading-sm font-bold text-foreground">
        {{ step === 1 ? `Leaving “${currentBeatTitle}”` : `→ ${headerTitle}` }}
      </h3>
      <div class="flex items-center gap-2 text-caption font-semibold">
        <span class="flex items-center gap-1" :class="step === 1 ? 'text-primary' : 'text-ink-success'">
          <component :is="IconCheck" v-if="step > 1" class="h-3 w-3" />
          <span v-else>1</span>
          Route
        </span>
        <span class="h-px flex-1 bg-border" />
        <span :class="step === 2 ? 'text-primary' : 'text-muted-foreground'">2 What it does</span>
      </div>
    </div>
    <div v-else class="border-b border-border px-5 pt-4">
      <p class="mb-1 flex items-center gap-1.5 text-eyebrow font-semibold text-primary">
        <component :is="IconCheck" class="h-3 w-3" />
        Advance · Thread {{ threadLetter }}
      </p>
      <ModalHeader
        :title="headerTitle"
        subtitle="One transition is recorded. Consequences fire now; loot waits for you."
        subtitle-role="body"
        header-class="border-none px-0 pb-3 pt-0"
        closeable
        @close="cancel"
      />
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <!-- 1. The route taken -->
      <section v-show="!isMobile || step === 1" aria-label="The route taken — the others become unreachable">
        <p v-if="isMobile" class="mb-3 text-body text-muted-foreground">
          One transition is recorded. Consequences fire now; loot waits for you.
        </p>
        <p class="mb-2 flex items-center gap-1.5 text-eyebrow font-semibold text-muted-foreground">
          <component :is="IconShuffle" class="h-3.5 w-3.5" />
          The route taken — the others become unreachable
        </p>
        <div class="space-y-1.5">
          <label
            v-for="route in choiceRoutes"
            :key="route.edge_id"
            class="flex items-start gap-2.5 rounded-lg border p-3"
            :class="[
              selectedEdgeId === route.edge_id ? 'border-primary bg-primary/5' : 'border-border',
              isClosed(route) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ]"
          >
            <input
              type="radio"
              name="advance-route"
              class="mt-1 shrink-0"
              :checked="selectedEdgeId === route.edge_id"
              :disabled="isClosed(route)"
              @change="selectChoice(route.edge_id)"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-cinzel text-sm font-bold text-foreground">{{ route.beat_title || "Untitled beat" }}</span>
              <span v-if="!isClosed(route)" class="block text-caption text-muted-foreground">
                → {{ route.beat_title || "Untitled beat" }} · Thread {{ threadLetter }}'s cursor moves here
              </span>
              <span v-else class="block text-caption text-destructive">{{ routeCondition(route.gate)?.text }}</span>
            </span>
          </label>

          <!-- The open-ended option: naming what happened is what creates the beat. -->
          <div class="rounded-lg border border-dashed border-border p-3" :class="improviseSelected ? 'border-primary bg-primary/5' : ''">
            <label class="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="advance-route" class="mt-1 shrink-0" :checked="improviseSelected" @change="selectImprovise" />
              <span class="min-w-0 flex-1">
                <span class="block font-cinzel text-sm font-bold text-foreground">Something else happened</span>
                <span class="block text-caption text-muted-foreground">Name it and it becomes an improvised beat in this thread</span>
              </span>
            </label>

            <!--
              Copied inline from the deleted QuestRunImprovPanel.vue (#824's
              lesson stands: one required field, everything else optional and
              tucked behind "Add details" so a busy table is not asked to fill
              a form before the button will enable).
            -->
            <Transition v-bind="drawerTransition()">
              <div v-show="improviseSelected" class="mt-3 space-y-2 border-t border-border pt-3">
                <AppInput v-model="improviseTitle" placeholder="What just happened?" autofocus @keyup.enter="submit" />
                <div class="flex items-center justify-between gap-2">
                  <AppButton
                    :label="improviseDetailsOpen ? 'Hide details' : 'Add details'"
                    size="xs"
                    variant="ghost"
                    :aria-expanded="improviseDetailsOpen"
                    @click="improviseDetailsOpen = !improviseDetailsOpen"
                  />
                </div>
                <Transition v-bind="drawerTransition()">
                  <div v-show="improviseDetailsOpen" class="space-y-2">
                    <AppSelect v-model="improviseKind">
                      <option value="neutral">Story moment</option>
                      <option value="social">Social</option>
                      <option value="combat">Combat</option>
                      <option value="explore">Explore</option>
                      <option value="discovery">Discovery</option>
                    </AppSelect>
                    <AppInput v-model="improviseReason" placeholder="Why did the story detour? (defaults to the title)" />
                    <AppInput v-model="improviseDmLead" placeholder="One-line DM note" />
                    <AppInput v-model="improviseRevealText" placeholder="Player reveal copy" />
                    <AppCheckbox v-model="improvisePushReturn" label-role="caption" label="Offer a return to the current beat" />
                    <AppCheckbox v-model="improviseKeepEdge" label-role="caption" label="Keep an “Improvised” edge in the authored graph" />
                  </div>
                </Transition>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <!-- 2. Also opens -->
      <section
        v-if="parallelRoutes.length && !improviseSelected"
        v-show="!isMobile || step === 2"
        aria-label="Also opens — both paths get walked"
      >
        <p class="mb-2 flex items-center gap-1.5 text-eyebrow font-semibold text-ink-info">
          <component :is="IconLayers" class="h-3.5 w-3.5" />
          Also opens — both paths get walked
        </p>
        <div class="space-y-1.5">
          <AppCheckbox
            v-for="route in parallelRoutes"
            :key="route.edge_id"
            v-model="spawnEdgeIds"
            :value="route.edge_id"
            :disabled="isClosed(route)"
            align="start"
            label-layout="row"
            :class="[
              'items-start gap-2.5 rounded-lg border p-3',
              isClosed(route) ? 'border-border opacity-60' : 'border-tone-info/50 bg-tone-info/5',
            ]"
          >
            <span class="min-w-0 flex-1">
              <span class="block font-cinzel text-sm font-bold text-foreground">{{ route.beat_title || "Untitled beat" }}</span>
              <span v-if="!isClosed(route)" class="block text-caption text-muted-foreground">
                <template v-if="plan?.spawnLetters[route.edge_id]">
                  Creates Thread {{ plan.spawnLetters[route.edge_id] }} — “{{ route.thread_label || route.beat_title }}” — at that beat. Thread {{ threadLetter }} keeps its own cursor —
                  untick to prepare the layer without opening it yet.
                </template>
                <template v-else>
                  Would open a thread “{{ route.thread_label || route.beat_title }}” at that beat.
                </template>
              </span>
              <span v-else class="block text-caption text-destructive">{{ routeCondition(route.gate)?.text }}</span>
            </span>
            <span v-if="route.site" class="shrink-0 rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">
              site · {{ route.site.room_count }} room{{ route.site.room_count === 1 ? "" : "s" }}
            </span>
          </AppCheckbox>
        </div>
      </section>

      <!-- 3. Payoff from this route -->
      <section v-if="selectedChoice" v-show="!isMobile || step === 2" aria-label="Payoff from this route">
        <p class="mb-2 flex items-center gap-1.5 text-eyebrow font-semibold text-muted-foreground">
          <component :is="IconInvite" class="h-3.5 w-3.5" />
          Payoff from this route
        </p>
        <p v-if="!selectedChoice.payoff.length && !selectedChoice.loot.length" class="text-caption italic text-muted-foreground">
          This route carries no payoff.
        </p>
        <div v-else class="space-y-1.5">
          <AppCheckbox
            v-for="entry in selectedChoice.payoff"
            :key="entry.consequence_id"
            v-model="firedConsequenceIds"
            :value="entry.consequence_id"
            align="start"
            label-layout="row"
            class="items-center gap-2.5 rounded-lg border border-border p-2.5"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="[payoffTone(entry).bg, payoffTone(entry).text]">
              <component :is="payoffIcon(entry.action)" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-body font-semibold text-foreground">{{ describePayoff(entry) }}</span>
              <span class="block text-caption text-muted-foreground">{{ payoffHint(entry.action) }}</span>
            </span>
            <span
              v-if="!firedConsequenceIds.includes(entry.consequence_id)"
              class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground"
            >held</span>
          </AppCheckbox>

          <AppCheckbox
            v-for="entry in selectedChoice.loot"
            :key="entry.id"
            v-model="dispatchLootIds"
            :value="entry.id"
            align="start"
            label-layout="row"
            class="items-center gap-2.5 rounded-lg border border-border p-2.5"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <component :is="IconCoins" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-body font-semibold text-foreground">{{ entry.quantity > 1 ? `${entry.quantity}× ` : "" }}{{ entry.label }}</span>
              <span class="block text-caption text-muted-foreground">
                {{ dispatchLootIds.includes(entry.id) ? "loot · drops to chat with the transition" : "loot · stays in the cockpit until you dispatch it" }}
              </span>
            </span>
          </AppCheckbox>
        </div>
      </section>

      <p v-if="submitError" role="alert" class="text-caption text-destructive">{{ submitError }}</p>
    </div>

    <!-- Footer: mobile splits into a Continue step and an Advance step; sm+ keeps the one-step footer with its preview line. -->
    <div v-if="isMobile && step === 1" class="flex items-center gap-2 border-t border-border px-5 py-3">
      <AppButton label="Cancel" variant="subtle" size="md" class="flex-1" @click="cancel" />
      <AppButton label="Continue" variant="primary" size="md" class="flex-1" :disabled="!canSubmit" @click="step = 2" />
    </div>
    <div v-else-if="isMobile" class="flex flex-col gap-2 border-t border-border px-5 py-3">
      <p class="text-caption text-muted-foreground">
        <template v-if="improviseSelected">Improvised beats carry no payoff yet — add consequences from the beat editor after the session.</template>
        <template v-else-if="plan">
          After this: threads <span class="font-semibold text-foreground">{{ plan.threadsAfter.join(", ") }}</span> live ·
          {{ plan.fired }} consequence{{ plan.fired === 1 ? "" : "s" }} fired · {{ plan.held }} loot held
        </template>
        <template v-else>Choose what happened to see what changes.</template>
      </p>
      <div class="flex items-center gap-2">
        <AppButton label="Back" variant="subtle" size="md" @click="step = 1" />
        <AppButton label="Advance" variant="primary" size="md" class="flex-1" :icon="IconCheck" :loading="submitting" :disabled="!canSubmit" @click="submit" />
      </div>
    </div>
    <div v-else class="flex items-center gap-2 border-t border-border px-5 py-3">
      <p class="flex-1 text-caption text-muted-foreground">
        <template v-if="improviseSelected">Improvised beats carry no payoff yet — add consequences from the beat editor after the session.</template>
        <template v-else-if="plan">
          After this: threads <span class="font-semibold text-foreground">{{ plan.threadsAfter.join(", ") }}</span> live ·
          {{ plan.fired }} consequence{{ plan.fired === 1 ? "" : "s" }} fired · {{ plan.held }} loot held
        </template>
        <template v-else>Choose what happened to see what changes.</template>
      </p>
      <AppButton label="Cancel" variant="subtle" size="sm" @click="cancel" />
      <AppButton label="Advance" variant="primary" size="sm" :icon="IconCheck" :loading="submitting" :disabled="!canSubmit" @click="submit" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The Advance dialog (epic #850 story G, design frame `05 Advance`): "one
 * dialog carries the whole model — the route taken, the routes that also
 * open, and which payoffs go out now. It is the only place a thread is
 * created." Replaces the separate "choose an outcome" / improvise-panel /
 * loot-drop flow with one submit that plans the whole transaction
 * (`planAdvance`, `src/lib/quests/advance.ts`) before it is sent.
 */
import { computed, ref, watch, type Component } from "vue";
import type {
  QuestConsequenceAction,
  QuestRoutePayoff,
  QuestRuntimeContext,
  RelationshipShiftConsequencePayload,
} from "@/types/quest.types";
import { isVersionConflictError, planAdvance, type PlanAdvanceResult } from "@/lib/quests/advance";
import { routeCondition } from "@/lib/quests/ledger";
import { describeQuestConsequenceAction, relationshipShiftIsGain } from "@/lib/quests/consequences";
import { useQuestRuntimeCommand, useQuestRuntimeImprovise } from "@/composables/quests/useQuestFlow";
import { useBelow } from "@/composables/useBreakpoint";
import { drawerTransition } from "@/lib/motion";
import {
  IconAnnounce,
  IconAward,
  IconCalendar,
  IconCheck,
  IconClose,
  IconCoins,
  IconHand,
  IconInvite,
  IconLayers,
  IconQuest,
  IconReveal,
  IconScrollText,
  IconShuffle,
  IconWarning,
} from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";

const props = defineProps<{
  open: boolean;
  context: QuestRuntimeContext;
  threadLetter: string;
  preselectedEdgeId?: string | null;
  improvise?: boolean;
}>();

const emit = defineEmits<{ close: []; advanced: [context: QuestRuntimeContext] }>();

// Below `sm` the dialog becomes a two-step sheet (design frame `02 Advance`);
// `sm` and up render every section at once, exactly as before. `step` is pure
// presentation — it never changes what `plan`/`canSubmit`/`submit` do.
const isMobile = useBelow("sm");
const step = ref<1 | 2>(1);
const currentBeatTitle = computed(() => props.context.current?.title || "this beat");

const choiceRoutes = computed(() => props.context.outgoing.filter((route) => route.route_kind === "choice"));
const parallelRoutes = computed(() => props.context.outgoing.filter((route) => route.route_kind === "parallel"));

function isClosed(route: { gate: { is_open: boolean } | null }): boolean {
  return !!route.gate && !route.gate.is_open;
}

const selectedEdgeId = ref<string | null>(null);
const improviseSelected = ref(false);
const selectedChoice = computed(() => choiceRoutes.value.find((route) => route.edge_id === selectedEdgeId.value) ?? null);

function selectChoice(edgeId: string) {
  selectedEdgeId.value = edgeId;
  improviseSelected.value = false;
}
function selectImprovise() {
  selectedEdgeId.value = null;
  improviseSelected.value = true;
}

const spawnEdgeIds = ref<string[]>([]);
const firedConsequenceIds = ref<string[]>([]);
const dispatchLootIds = ref<string[]>([]);

const improviseTitle = ref("");
const improviseKind = ref("neutral");
const improviseReason = ref("");
const improviseDmLead = ref("");
const improviseRevealText = ref("");
const improvisePushReturn = ref(true);
const improviseKeepEdge = ref(false);
const improviseDetailsOpen = ref(false);

const submitting = ref(false);
const submitError = ref("");

// Reset the whole dialog to a fresh state every time it opens — reopened for
// a different beat, or for the same one after a cancelled attempt, it must
// not carry over the previous visit's ticks.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  submitError.value = "";
  step.value = 1;
  improviseSelected.value = !!props.improvise;
  selectedEdgeId.value = props.improvise ? null : (props.preselectedEdgeId ?? null);
  spawnEdgeIds.value = parallelRoutes.value.filter((route) => !isClosed(route)).map((route) => route.edge_id);
  improviseTitle.value = "";
  improviseKind.value = "neutral";
  improviseReason.value = "";
  improviseDmLead.value = "";
  improviseRevealText.value = "";
  improvisePushReturn.value = true;
  improviseKeepEdge.value = false;
  improviseDetailsOpen.value = false;
}, { immediate: true });

// Changing the selected route re-derives the payoff/loot ticks: fire
// everything by default, dispatch nothing by default.
watch(selectedChoice, (choice) => {
  firedConsequenceIds.value = (choice?.payoff ?? []).map((entry) => entry.consequence_id);
  dispatchLootIds.value = [];
}, { immediate: true });

const heldConsequenceIds = computed(() =>
  (selectedChoice.value?.payoff ?? [])
    .map((entry) => entry.consequence_id)
    .filter((id) => !firedConsequenceIds.value.includes(id)),
);

const plan = computed<PlanAdvanceResult | null>(() => {
  if (!selectedEdgeId.value) return null;
  return planAdvance({
    context: props.context,
    edgeId: selectedEdgeId.value,
    spawnEdgeIds: spawnEdgeIds.value,
    heldIds: heldConsequenceIds.value,
    dispatchIds: dispatchLootIds.value,
  });
});

const headerTitle = computed(() => {
  if (improviseSelected.value) return improviseTitle.value.trim() || "Something else happened";
  return selectedChoice.value?.beat_title || "Choose what happened";
});

const canSubmit = computed(() =>
  improviseSelected.value ? !!improviseTitle.value.trim() : !!selectedEdgeId.value,
);

function describePayoff(entry: QuestRoutePayoff): string {
  return describeQuestConsequenceAction(entry, () => entry.target_objective ?? entry.target_npc ?? entry.target_quest ?? "Objective removed");
}

// Icon and tone per payoff action (design frame `05 Advance`): a fixed shape
// for the three it shows (shift_npc_relationship, owe_favor, unlock_quest)
// extended to the rest of the union so any route's payoff renders, not just
// the ones the mock happened to draw.
const PAYOFF_ICON: Record<QuestConsequenceAction, Component> = {
  raise: IconQuest,
  reveal: IconReveal,
  complete: IconCheck,
  fail: IconWarning,
  create_calendar_event: IconCalendar,
  send_broadcast: IconAnnounce,
  shift_npc_relationship: IconInvite,
  unlock_quest: IconQuest,
  grant_knowledge: IconScrollText,
  owe_favor: IconHand,
  award_milestone: IconAward,
};
function payoffIcon(action: QuestConsequenceAction): Component {
  return PAYOFF_ICON[action];
}

type PayoffTone = "success" | "danger" | "caution" | "arcane" | "info" | "gold";
const PAYOFF_TONE: Record<QuestConsequenceAction, PayoffTone> = {
  raise: "info",
  reveal: "info",
  complete: "success",
  fail: "danger",
  create_calendar_event: "info",
  send_broadcast: "info",
  shift_npc_relationship: "danger",
  unlock_quest: "arcane",
  grant_knowledge: "info",
  owe_favor: "caution",
  award_milestone: "gold",
};
const TONE_CLASSES: Record<PayoffTone, { bg: string; text: string }> = {
  success: { bg: "bg-tone-success/15", text: "text-ink-success" },
  danger: { bg: "bg-destructive/12", text: "text-destructive" },
  caution: { bg: "bg-tone-caution/15", text: "text-ink-caution" },
  arcane: { bg: "bg-tone-arcane/15", text: "text-ink-arcane" },
  info: { bg: "bg-tone-info/15", text: "text-ink-info" },
  gold: { bg: "bg-primary/15", text: "text-primary" },
};
function payoffTone(entry: QuestRoutePayoff): { bg: string; text: string } {
  // Signed, like the rule editor's own tone map (QuestConsequencesPanel.vue):
  // a positive shift reads as a gain, a negative one as a cost — the same
  // action either way, painted by the sign the DM actually set.
  if (entry.action === "shift_npc_relationship" && relationshipShiftIsGain(entry.action_payload as Partial<RelationshipShiftConsequencePayload>)) {
    return TONE_CLASSES.success;
  }
  return TONE_CLASSES[PAYOFF_TONE[entry.action]];
}

const PAYOFF_HINT: Record<QuestConsequenceAction, string> = {
  raise: "fires with the transition · undoable from the event log",
  reveal: "fires with the transition · undoable from the event log",
  complete: "fires with the transition · undoable from the event log",
  fail: "fires with the transition · undoable from the event log",
  shift_npc_relationship: "fires with the transition · undoable from the event log",
  create_calendar_event: "create_calendar_event · calendar",
  send_broadcast: "send_broadcast · chat",
  grant_knowledge: "grant_knowledge · journal",
  owe_favor: "pinned to the NPC's page",
  unlock_quest: "unlock_quest · hold it back for the finale",
  award_milestone: "award_milestone · character sheet",
};
function payoffHint(action: QuestConsequenceAction): string {
  return PAYOFF_HINT[action];
}

function cancel() {
  emit("close");
}

const runtimeCommand = useQuestRuntimeCommand();
const runtimeImprovise = useQuestRuntimeImprovise();

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitError.value = "";
  submitting.value = true;
  try {
    if (improviseSelected.value) {
      const result = await runtimeImprovise.mutateAsync({
        campaignId: props.context.state?.campaign_id ?? props.context.thread.campaign_id,
        questId: props.context.state?.quest_id ?? props.context.thread.quest_id,
        threadId: props.context.thread.id,
        expectedVersion: props.context.state?.version ?? 0,
        title: improviseTitle.value.trim(),
        kind: improviseKind.value,
        reason: improviseReason.value.trim(),
        dmLead: improviseDmLead.value.trim(),
        revealText: improviseRevealText.value.trim(),
        pushReturn: improvisePushReturn.value,
        keepEdge: improviseKeepEdge.value,
      });
      emit("advanced", result.context);
      emit("close");
      return;
    }
    if (!plan.value) return;
    const context = await runtimeCommand.mutateAsync(plan.value.rpcArgs);
    emit("advanced", context);
    emit("close");
  } catch (caught) {
    submitError.value = isVersionConflictError(caught)
      ? "The session moved on another device — reopen to advance."
      : caught instanceof Error ? caught.message : "The transition could not be recorded";
  } finally {
    submitting.value = false;
  }
}
</script>
