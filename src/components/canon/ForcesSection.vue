<template>
  <section id="canon-moving" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-moving-heading">
    <CanonRubric id="canon-moving-heading" numeral="III" title="What is moving" />
    <p class="text-caption text-muted-foreground">The world's own business, beyond the party's quests. Never shown to players.</p>

    <CanonSuggestions mode="forces" :entries="forces" />

    <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <ul v-if="forces.length > 0" class="flex flex-col border border-border bg-card" data-testid="force-ledger">
          <ForceRow
            v-for="force in forces"
            :key="force.id"
            :entry="force"
            :steps="stepsOf(force.id)"
            :ticks="ticksOf(force.id)"
            :selected="force.id === selectedId"
            @select="emit('select', force.id)"
          />
        </ul>
        <EmptyState
          v-else
          class="border border-dashed border-border bg-card"
          title="Nothing is moving yet"
          description="A force is a faction, a person or a power with its own plans. Give it a clock and steps, and tick it forward as the world moves."
        />
      </div>
      <ForceLog v-if="forces.length > 0" class="lg:w-64 lg:shrink-0" :ticks="data?.ticks ?? []" :force-name="nameOf" @undo="undo" />
    </div>

    <form class="flex flex-col gap-2" @submit.prevent="addForce">
      <AppInput v-model="who" tone="filled" size="body" placeholder="Who moves…" aria-label="A new force" />
      <div class="flex flex-wrap gap-2">
        <AppInput v-model="wants" tone="filled" size="body" class="min-w-0 flex-1" placeholder="What it wants, in one line…" aria-label="What the new force wants" />
        <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" label="Add force" :loading="isPending" :disabled="who.trim() === '' || wants.trim() === ''" />
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
/** Part III (frame 06): every force with its clock and the step it has reached. The steps and ticks are read once for the whole list, never one per force. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonRubric from "./CanonRubric.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import ForceLog from "./ForceLog.vue";
import ForceRow from "./ForceRow.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData, useUndoForceTick } from "@/composables/canon/useCanonForces";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const { forces, selectedId = null } = defineProps<{ forces: readonly CanonEntry[]; selectedId?: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

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

const { mutate: undo } = useUndoForceTick();
const nameOf = (forceId: string) => forces.find((f) => f.id === forceId)?.title ?? "A force that is gone";

const who = ref("");
const wants = ref("");
const { mutateAsync: create, isPending } = useCreateCanonEntry();

async function addForce() {
  const title = who.value.trim();
  const want = wants.value.trim();
  if (title === "" || want === "") return;
  try {
    const created = await create({ part: "force", title, wants: want, sort_order: forces.length });
    who.value = "";
    wants.value = "";
    emit("select", created.id);
  } catch {
    // The mutation has already told the DM (toast); the words stay in the boxes to try again.
  }
}
</script>
