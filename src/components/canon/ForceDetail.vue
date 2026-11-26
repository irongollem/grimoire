<template>
  <CanonEntryPane kind="Force" delete-label="Delete this force" close-label="Close this force" data-testid="force-detail" @close="emit('close')" @delete="emit('delete')">
    <template #title>
      <AppInput :key="titleRevision" v-model.lazy="title" size="body" tone="filled" aria-label="What they are doing" placeholder="The summoning, the long march…" />
    </template>

    <template #who>
      <ForceWhoPicker :force-id="entry.id" />
      <EntryArcPicker v-if="shown('arc')" :entry="entry" />
    </template>

    <div v-if="outcome !== null" class="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2" data-testid="force-ended">
      <span class="text-body font-bold text-foreground" data-testid="force-ended-line">{{ FORCE_OUTCOME_ENDED[outcome] }}</span>
      <span v-if="entry.closed_note !== null" class="text-body text-foreground" data-testid="force-ended-note">{{ entry.closed_note }}</span>
      <AppButton variant="outline" size="sm" label="Set it moving again" class="self-start" data-testid="force-resume" @click="resume" />
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Wants</span>
      <AppInput :key="wantsRevision" v-model.lazy="wants" wrap size="body" tone="filled" aria-label="What it wants" placeholder="What it wants, in one line…" />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">If it succeeds</span>
      <AppInput :key="ifSucceedsRevision" v-model.lazy="ifSucceeds" wrap size="body" tone="filled" aria-label="If it succeeds" placeholder="What the world becomes if nobody stops it…" />
    </div>

    <CanonEntryNotes v-if="shown('notes')" :key="entry.id" :entry="entry" label="Notes" help="Never shown to players." placeholder="How it plays, what it will do next…" />

    <CanonBlock title="Its clock and its steps">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-eyebrow text-muted-foreground">Clock</span>
          <AppSelect v-model="clockSize" size="sm" aria-label="Clock size">
            <option :value="null">No clock</option>
            <option v-for="n in CLOCK_SIZES" :key="n" :value="n">{{ n }} ticks</option>
          </AppSelect>
        </div>
        <div v-if="entry.clock_size !== null" class="flex flex-wrap items-center gap-3">
          <ForceClock :force="entry" :ticks="ticks" />
          <span class="text-body text-foreground" data-testid="force-clock-tally">{{ filled }} of {{ entry.clock_size }}</span>
          <AppInput v-model="note" size="body" tone="filled" class="min-w-0 flex-1 basis-40" aria-label="Why the world moved" placeholder="Why, if you want to say…" />
          <AppButton variant="outline" size="sm" label="Tick back" :disabled="outcome !== null || filled === 0" data-testid="tick-back" @click="tick(-1)" />
          <AppButton variant="primary" size="sm" label="Tick forward" :disabled="outcome !== null || filled === entry.clock_size" data-testid="tick-forward" @click="tick(1)" />
        </div>
        <p v-if="divergence !== null" class="m-0 text-caption text-muted-foreground" data-testid="force-divergence">{{ divergence }}</p>
        <div v-if="clockIsFull && !ending" class="flex flex-col gap-2" data-testid="force-clock-full">
          <p class="m-0 text-body font-bold text-foreground">The clock is full. What happened?</p>
          <div class="flex flex-wrap gap-2">
            <AppButton v-for="option in FORCE_OUTCOME_OPTIONS" :key="option.value" variant="outline" size="sm" :label="option.label" :data-testid="`force-full-${option.value}`" @click="startEnding(option.value)" />
          </div>
        </div>
      </div>
      <ForceSteps :force="entry" :steps="steps" :frozen="outcome !== null" />
    </CanonBlock>

    <CanonBlock v-if="ticks.length > 0" title="Recent moves">
      <ForceLog :ticks="ticks" :limit="RECENT_MOVES" @undo="undo" />
    </CanonBlock>

    <div v-if="shown('quests')" class="flex flex-col gap-2">
      <EntryQuests :entry="entry" :links="links" label="Where the party meets it" empty="In no quest yet: the party has not crossed its path." />
      <StartQuestFrom :entry="entry" />
    </div>
    <ForceQuestClocks :entry="entry" />
    <EntryStoryLinks v-if="shown('story')" :entry="entry" />

    <CanonAddFold :choices="choices(FOLDED)" @choose="choose" />

    <div v-if="outcome === null" class="flex flex-col gap-2">
      <ForceEndForm v-if="ending" :initial="endingFrom" @end="end" @cancel="ending = false" />
      <AppButton v-else variant="outline" size="sm" label="End this force…" class="self-start" data-testid="force-end" @click="startEnding('stopped')" />
    </div>

    <template v-if="shown('connections')" #connections>
      <ConnectionsSection :subject="subject" :subject-name="entry.title" :hide="isShownAbove" />
    </template>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open force, in the chapter's entry pane: who is behind it (a person, a faction or a god), what it wants and what the world becomes if it succeeds, its
 * clock with Tick forward and back and its steps, the newest three moves, and the quests where the party meets it, with "Start a quest from this". Optional blocks that
 * are empty fold into one "Add…" row. The clock's fill is the sum of the ticks, never stored.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonAddFold from "./kit/CanonAddFold.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import ForceClock from "./ForceClock.vue";
import ForceEndForm from "./ForceEndForm.vue";
import ForceLog from "./ForceLog.vue";
import ForceQuestClocks from "./ForceQuestClocks.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import ForceSteps from "./ForceSteps.vue";
import ForceWhoPicker from "./ForceWhoPicker.vue";
import StartQuestFrom from "./StartQuestFrom.vue";
import { discardCanonEntry, useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { useEntryFold, type FoldKey } from "@/composables/canon/useEntryFold";
import { isWhoTie } from "@/lib/canon/forceWho";
import { clockFilled, clockStepsDivergence } from "@/lib/canon/canonForces";
import { typeChoices } from "@/lib/worldLinks/connections";
import { toast } from "@/lib/toast";
import { useCanonForceData, useUndoForceTick, useTickForce } from "@/composables/canon/useCanonForces";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { FORCE_OUTCOME_ENDED, FORCE_OUTCOME_OPTIONS, RESUME_FORCE_PATCH, endForce, forceOutcome, type ForceOutcome } from "@/lib/canon/canonClose";
import type { CanonEntry } from "@/types/canon.types";
import type { Connection, WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: []; close: [] }>();

/** How many of the force's moves show before "All N moves". */
const RECENT_MOVES = 3;
const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const { data } = useCanonForceData();
const steps = computed(() => (data.value?.steps ?? []).filter((s) => s.force_id === entry.id));
const ticks = computed(() => (data.value?.ticks ?? []).filter((t) => t.force_id === entry.id));
const links = computed(() => (data.value?.quests ?? []).filter((q) => q.entry_id === entry.id));

// The story links (because of, led to, carries) are EntryStoryLinks' block above and the who is the header's, so Connections does not list them again.
const isShownAbove = (c: Connection): boolean => isWhoTie(c) || (c.source === "link" && (c.type === "led_to" || c.type === "carries"));

// The optional blocks fold into one "Add…" row while empty (#1279 item 16); the clock and its steps are the force and always show.
const FOLDED: readonly FoldKey[] = ["arc", "notes", "quests", "story", "connections"];
const { shown, choices, choose } = useEntryFold(() => entry, { hideConnection: isShownAbove });

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const filled = computed(() => (entry.clock_size === null ? 0 : clockFilled(ticks.value, entry.clock_size)));

const { mutate: update, mutateAsync: updateAsync } = useUpdateCanonEntry();
const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: connect } = useCreateConnection();
const { mutate: tickForce } = useTickForce();
const { mutate: undo } = useUndoForceTick();

const { text: title, revision: titleRevision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));
const { text: wants, revision: wantsRevision } = useCommittedText(
  () => (entry.wants === null ? "" : entry.wants),
  (next) => update({ id: entry.id, patch: { wants: next } }),
);

// What happens if nobody stops it. Unlike the other fields, clearing it is allowed: it writes null, never an empty string.
// A no-op edit (the saved words typed back with stray spaces) changes nothing Vue can see, so `ifSucceedsRevision` remakes the field.
const ifSucceedsRevision = ref(0);
const ifSucceeds = computed<string>({
  get: () => (entry.if_succeeds === null ? "" : entry.if_succeeds),
  set: (next) => {
    const text = next.trim();
    const saved = entry.if_succeeds === null ? "" : entry.if_succeeds;
    if (text === saved) {
      ifSucceedsRevision.value++;
      return;
    }
    update({ id: entry.id, patch: { if_succeeds: text === "" ? null : text } });
  },
});

const clockSize = computed<number | null>({
  get: () => entry.clock_size,
  set: (next) => update({ id: entry.id, patch: { clock_size: next } }),
});

// A force that has ended keeps its past readable and moves no further: no ticks, no step reached, no new step.
const outcome = computed(() => forceOutcome(entry));
const clockIsFull = computed(() => outcome.value === null && entry.clock_size !== null && filled.value === entry.clock_size);

// The clock and the steps are not bound to each other; one quiet line says when they have drifted apart.
const divergence = computed(() => (outcome.value === null ? clockStepsDivergence(entry.clock_size, filled.value, steps.value) : null));

// Transient UI state: whether the End form is open, and the outcome the DM picked before it opened.
const ending = ref(false);
const endingFrom = ref<ForceOutcome>("stopped");
function startEnding(how: ForceOutcome) {
  endingFrom.value = how;
  ending.value = true;
}

/** The truth the force left behind is made first, then the force closes pointing at it, then the two are tied `led_to`. */
async function end(how: ForceOutcome, why: string, trueNow: string) {
  try {
    const { linkError } = await endForce(how, why, trueNow, new Date().toISOString(), {
      createTruth: createEntry,
      updateForce: (patch) => updateAsync({ id: entry.id, patch }),
      discardTruth: discardCanonEntry,
      linkLedTo: async (truthId, truthTitle) => {
        const choice = typeChoices("canon", "canon").find((c) => c.key === "led_to" && c.subjectIsFrom);
        if (!choice) throw new Error("A force cannot be linked to the truth it led to.");
        await connect({ subject: { kind: "canon", id: entry.id }, other: { kind: "canon", id: truthId, name: truthTitle }, choice });
      },
    });
    ending.value = false;
    if (linkError !== null) toast.error(`The force ended, but it could not be linked to what is true now. ${toast.fromError(linkError)}`);
  } catch {
    // The mutations have already told the DM (toast); the form stays open to try again.
  }
}
function resume() {
  update({ id: entry.id, patch: RESUME_FORCE_PATCH });
}

const note = ref("");
function tick(delta: 1 | -1) {
  tickForce({ campaignId: entry.campaign_id, forceId: entry.id, delta, note: note.value.trim() });
  note.value = "";
}
</script>
