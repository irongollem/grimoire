<template>
  <CanonChapter chapter="moving" :title="chapter.label" :why="chapter.why" :open="selected !== null" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <CanonReview mode="forces" :entries="forces" />
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>
    </template>

    <ul v-if="moving.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="force-ledger">
      <ForceRow
        v-for="force in moving"
        :key="force.id"
        :entry="force"
        :steps="stepsOf(force.id)"
        :ticks="ticksOf(force.id)"
        :selected="force.id === selected?.id"
        :move="canReorder ? endsOf(moving, force.id) : null"
        @select="emit('select', force.id)"
        @move="(direction) => reorder(moving, force.id, direction)"
      />
    </ul>
    <CanonEmpty v-else-if="forces.length === 0 && arcLabel !== null" title="Nothing is moving in this arc" :text="`Nothing of this chapter is in ${arcLabel}.`" />
    <CanonEmpty v-else-if="ended.length === 0" title="No forces yet" :text="EMPTY_TEXT" ask="Suggest a force that is moving in my world." />

    <div v-if="ended.length > 0" class="flex flex-col gap-2" data-testid="force-ended-section">
      <AppButton
        variant="ghost"
        size="sm"
        class="self-start"
        :label="`No longer moving (${ended.length})`"
        :icon="showEnded ? IconChevronDown : IconChevronRight"
        icon-size="xs"
        :aria-expanded="showEnded"
        data-testid="force-ended-toggle"
        @click="showEnded = !showEnded"
      />
      <Transition v-bind="drawerTransition()">
        <ul v-show="showEnded" class="flex flex-col rounded-lg border border-border bg-card" data-testid="force-ended-ledger">
          <ForceRow
            v-for="force in ended"
            :key="force.id"
            :entry="force"
            :steps="stepsOf(force.id)"
            :ticks="ticksOf(force.id)"
            :selected="force.id === selected?.id"
            @select="emit('select', force.id)"
          />
        </ul>
      </Transition>
    </div>

    <template #add>
      <CanonAddRow v-model="draft" placeholder="A new force, by its name…" input-label="A new force" label="Add force" :create="addForce" />
    </template>

    <template #entry>
      <ForceDetail v-if="selected" :key="selected.id" :entry="selected" @close="emit('close')" @delete="emit('delete')" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The What is moving chapter: every force with its next step and its clock. The steps and ticks are read once for the whole list, never one per force.
 * The open force is found among `forces`, so an arc that narrows the list away from it closes it. Adding keeps the
 * add row takes a name only and opens the new force beside the list, where who, what it wants and its clock are set.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonReview from "./CanonReview.vue";
import ForceDetail from "./ForceDetail.vue";
import ForceRow from "./ForceRow.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { endsOf } from "@/lib/canon/canonOrder";
import { chapterOf } from "@/lib/canon/canonParts";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const EMPTY_TEXT = "A force is someone or something that wants and acts whether or not the party does: a cult, a winter, a rival.";

const { forces, selectedId = null, arcLabel = null } = defineProps<{
  /** The forces of the page's arc (every force when none is chosen). */
  forces: readonly CanonEntry[];
  selectedId?: string | null;
  /** The name of the arc narrowing this chapter, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string]; close: []; delete: [] }>();

const chapter = chapterOf("moving");
const selected = computed(() => (selectedId === null ? null : forces.find((f) => f.id === selectedId) ?? null));

// A force that has ended leaves the ledger and waits under "No longer moving"; its entry opens as any other.
const moving = computed(() => forces.filter((f) => f.closed_as === null));
const ended = computed(() => forces.filter((f) => f.closed_as !== null));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null);
const reorder = useCanonReorder();
// Transient UI state: whether the ended forces are showing, and the name being typed into the add row.
const showEnded = ref(false);
const draft = ref("");
const { mutateAsync: create } = useCreateCanonEntry();

async function addForce(title: string) {
  const created = await create({ part: "force", title, sort_order: forces.length });
  emit("select", created.id);
}

const { data } = useCanonForceData();
const NO_STEPS: readonly CanonForceStep[] = [];
const NO_TICKS: readonly CanonForceTick[] = [];
const stepsByForce = computed(() => groupBy(data.value?.steps ?? [], (s) => s.force_id));
const ticksByForce = computed(() => groupBy(data.value?.ticks ?? [], (t) => t.force_id));
const stepsOf = (id: string) => stepsByForce.value.get(id) ?? NO_STEPS;
const ticksOf = (id: string) => ticksByForce.value.get(id) ?? NO_TICKS;

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}
</script>
