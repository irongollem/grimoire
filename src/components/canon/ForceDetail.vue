<template>
  <section class="flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A force" data-testid="force-detail">
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Who</span>
      <AppInput :key="whoRevision" v-model.lazy="who" size="body" tone="filled" aria-label="Who moves" placeholder="A faction, a person, a power…" />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Wants</span>
      <AppInput :key="wantsRevision" v-model.lazy="wants" wrap size="body" tone="filled" aria-label="What it wants" placeholder="What it wants, in one line…" />
    </div>

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
        <AppButton variant="outline" size="sm" label="Tick back" :disabled="filled === 0" data-testid="tick-back" @click="tick(-1)" />
        <AppButton variant="primary" size="sm" label="Tick forward" :disabled="filled === entry.clock_size" data-testid="tick-forward" @click="tick(1)" />
      </div>
    </div>

    <ForceSteps :force="entry" :steps="steps" />
    <ForceQuests :force="entry" :links="links" />
    <ForceLog :ticks="ticks" @undo="undo" />

    <ConnectionsSection :subject="subject" :subject-name="entry.title" />

    <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" label="Delete this force" class="self-start" @click="emit('delete')" />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected force (frame 06): who it is and what it wants, its clock with Tick forward and back, its steps, the
 * quests where the party meets it and the log of what moved. The clock's fill is the sum of the ticks, never stored.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import ForceClock from "./ForceClock.vue";
import ForceLog from "./ForceLog.vue";
import ForceQuests from "./ForceQuests.vue";
import ForceSteps from "./ForceSteps.vue";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { clockFilled, useCanonForceData, useUndoForceTick, useTickForce } from "@/composables/canon/useCanonForces";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { IconDelete } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: [] }>();

const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const { data } = useCanonForceData();
const steps = computed(() => (data.value?.steps ?? []).filter((s) => s.force_id === entry.id));
const ticks = computed(() => (data.value?.ticks ?? []).filter((t) => t.force_id === entry.id));
const links = computed(() => (data.value?.quests ?? []).filter((q) => q.force_id === entry.id));

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

const note = ref("");
function tick(delta: 1 | -1) {
  tickForce({ campaignId: entry.campaign_id, forceId: entry.id, delta, note: note.value.trim() });
  note.value = "";
}
</script>
