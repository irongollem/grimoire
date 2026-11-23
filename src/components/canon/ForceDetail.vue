<template>
  <section class="@container flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A force" data-testid="force-detail">
    <div v-if="outcome !== null" class="flex flex-col gap-1.5 border border-border bg-muted/40 px-3 py-2" data-testid="force-ended">
      <span class="text-body font-bold text-foreground" data-testid="force-ended-line">{{ FORCE_OUTCOME_ENDED[outcome] }}</span>
      <span v-if="entry.closed_note !== null" class="text-body text-foreground" data-testid="force-ended-note">{{ entry.closed_note }}</span>
      <AppButton variant="outline" size="sm" label="Set it moving again" class="self-start" data-testid="force-resume" @click="resume" />
    </div>
    <!-- From 32rem of the detail's own width two columns: who it is, its clock and its ending, then what it does. One column below that. -->
    <div class="flex flex-col gap-4 @lg:grid @lg:grid-cols-2 @lg:items-start @lg:gap-6">
      <div class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span class="text-eyebrow text-muted-foreground">Who</span>
          <AppInput :key="whoRevision" v-model.lazy="who" size="body" tone="filled" aria-label="Who moves" placeholder="A faction, a person, a power…" />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-eyebrow text-muted-foreground">Wants</span>
          <AppInput :key="wantsRevision" v-model.lazy="wants" wrap size="body" tone="filled" aria-label="What it wants" placeholder="What it wants, in one line…" />
        </div>
        <CanonEntryNotes
          :key="entry.id"
          :entry="entry"
          label="Notes"
          help="Never shown to players."
          placeholder="How it plays, what it will do next…"
        />
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
          <div v-if="clockIsFull" class="flex flex-col gap-2" data-testid="force-clock-full">
            <p class="text-body font-bold text-foreground">The clock is full. What happened?</p>
            <div class="flex flex-wrap gap-2">
              <AppButton v-for="option in FORCE_OUTCOME_OPTIONS" :key="option.value" variant="outline" size="sm" :label="option.label" :data-testid="`force-full-${option.value}`" @click="end(option.value, '')" />
            </div>
          </div>
        </div>
        <div v-if="outcome === null" class="flex flex-col gap-2">
          <ForceEndForm v-if="ending" @end="end" @cancel="ending = false" />
          <AppButton v-else variant="outline" size="sm" label="End this force…" class="self-start" data-testid="force-end" @click="ending = true" />
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-4">
        <ForceSteps :force="entry" :steps="steps" :frozen="outcome !== null" />
        <EntryQuests :entry="entry" :links="links" label="Where the party meets it" empty="In no quest yet: the party has not crossed its path." />
        <ForceLog :ticks="ticks" @undo="undo" />
      </div>
    </div>

    <ConnectionsSection :subject="subject" :subject-name="entry.title" />

    <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" label="Delete this force" class="self-start" @click="emit('delete')" />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected force (frame 06): who it is and what it wants, its clock with Tick forward and back, its steps, the
 * quests where the party meets it and the log of what moved. The clock's fill is the sum of the ticks, never stored.
 * It opens beside the forces ledger (`CanonSplit`) and, from 32rem of its own width, runs in two columns.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import ForceClock from "./ForceClock.vue";
import ForceEndForm from "./ForceEndForm.vue";
import ForceLog from "./ForceLog.vue";
import EntryQuests from "./EntryQuests.vue";
import ForceSteps from "./ForceSteps.vue";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { clockFilled, useCanonForceData, useUndoForceTick, useTickForce } from "@/composables/canon/useCanonForces";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { FORCE_OUTCOME_ENDED, FORCE_OUTCOME_OPTIONS, RESUME_FORCE_PATCH, endForcePatch, forceOutcome, type ForceOutcome } from "@/lib/canon/canonClose";
import { IconDelete } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: [] }>();

const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const { data } = useCanonForceData();
const steps = computed(() => (data.value?.steps ?? []).filter((s) => s.force_id === entry.id));
const ticks = computed(() => (data.value?.ticks ?? []).filter((t) => t.force_id === entry.id));
const links = computed(() => (data.value?.quests ?? []).filter((q) => q.entry_id === entry.id));

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const filled = computed(() => (entry.clock_size === null ? 0 : clockFilled(ticks.value, entry.clock_size)));

const { mutate: update } = useUpdateCanonEntry();
const { mutate: tickForce } = useTickForce();
const { mutate: undo } = useUndoForceTick();

const { text: who, revision: whoRevision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));
const { text: wants, revision: wantsRevision } = useCommittedText(
  () => (entry.wants === null ? "" : entry.wants),
  (next) => update({ id: entry.id, patch: { wants: next } }),
);

const clockSize = computed<number | null>({
  get: () => entry.clock_size,
  set: (next) => update({ id: entry.id, patch: { clock_size: next } }),
});

// A force that has ended keeps its past readable and moves no further: no ticks, no step reached, no new step.
const outcome = computed(() => forceOutcome(entry));
const clockIsFull = computed(() => outcome.value === null && entry.clock_size !== null && filled.value === entry.clock_size);

// Transient UI state: whether the End form is open.
const ending = ref(false);
function end(how: ForceOutcome, why: string) {
  update({ id: entry.id, patch: endForcePatch(how, why, new Date().toISOString()) });
  ending.value = false;
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
