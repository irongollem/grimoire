<template>
  <section id="canon-moving" class="@container flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-moving-heading">
    <CanonRubric id="canon-moving-heading" numeral="III" title="What is moving" />
    <p class="text-caption text-muted-foreground">The world's own business, beyond the party's quests. Never shown to players.</p>

    <CanonSuggestFold part="forces">
      <CanonSuggestions mode="forces" :entries="forces" />
    </CanonSuggestFold>

    <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>

    <!-- By the section's own width, not the viewport: beside the page-body ledger of an open force the log drops under the list. -->
    <div class="flex flex-col gap-4 @2xl:flex-row @2xl:items-start">
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <ul v-if="moving.length > 0" class="flex flex-col border border-border bg-card" data-testid="force-ledger">
          <ForceRow
            v-for="force in moving"
            :key="force.id"
            :entry="force"
            :steps="stepsOf(force.id)"
            :ticks="ticksOf(force.id)"
            :who="whoOf(force.id)"
            :selected="force.id === selectedId"
            :move="canReorder ? endsOf(moving, force.id) : null"
            @select="emit('select', force.id)"
            @move="(direction) => reorder(moving, force.id, direction)"
          />
        </ul>
        <EmptyState
          v-else-if="forces.length === 0 && arcLabel !== null"
          class="border border-dashed border-border bg-card"
          title="Nothing is moving in this arc"
          :description="`Nothing of this part is in ${arcLabel}.`"
        />
        <EmptyState
          v-else-if="ended.length === 0"
          class="border border-dashed border-border bg-card"
          title="Nothing is moving yet"
          description="A force is a faction, a person or a power with its own plans. Give it a clock and steps, and tick it forward as the world moves."
        />
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
            <ul v-show="showEnded" class="flex flex-col border border-border bg-card" data-testid="force-ended-ledger">
              <ForceRow
                v-for="force in ended"
                :key="force.id"
                :entry="force"
                :steps="stepsOf(force.id)"
                :ticks="ticksOf(force.id)"
                :who="whoOf(force.id)"
                :selected="force.id === selectedId"
                @select="emit('select', force.id)"
              />
            </ul>
          </Transition>
        </div>
      </div>
      <ForceLog v-if="forces.length > 0" class="@2xl:w-64 @2xl:shrink-0" :ticks="logTicks" :force-name="nameOf" @undo="undo" />
    </div>

    <ForceAddForm :sort-order="forces.length" @added="(id) => emit('select', id)" />
  </section>
</template>

<script setup lang="ts">
/** Part III (frame 06): every force with its clock and the step it has reached. The steps and ticks are read once for the whole list, never one per force. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonRubric from "./CanonRubric.vue";
import CanonSuggestFold from "./CanonSuggestFold.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import ForceAddForm from "./ForceAddForm.vue";
import ForceLog from "./ForceLog.vue";
import ForceRow from "./ForceRow.vue";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonForceData, useUndoForceTick } from "@/composables/canon/useCanonForces";
import { useForceFactions } from "@/composables/canon/useForceFactions";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const { forces, selectedId = null, arcLabel = null } = defineProps<{
  /** The forces of the page's arc (every force when none is chosen). */
  forces: readonly CanonEntry[];
  selectedId?: string | null;
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

// A force that has ended leaves the ledger and waits under "No longer moving"; its detail opens as any other.
const moving = computed(() => forces.filter((f) => f.closed_as === null));
const ended = computed(() => forces.filter((f) => f.closed_as !== null));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null);
const reorder = useCanonReorder();
// Transient UI state: whether the ended forces are showing.
const showEnded = ref(false);

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

// Under an arc the log tells only of the forces on screen, not of ones it would have to call "gone".
const logTicks = computed(() => (data.value?.ticks ?? []).filter((t) => arcLabel === null || forces.some((f) => f.id === t.force_id)));

const { mutate: undo } = useUndoForceTick();
const { whoOf } = useForceFactions();
const nameOf = (forceId: string) => forces.find((f) => f.id === forceId)?.title ?? "A force that is gone";
</script>
