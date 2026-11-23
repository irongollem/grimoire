<template>
  <section id="canon-moving" class="@container flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-moving-heading">
    <CanonRubric id="canon-moving-heading" numeral="III" title="What is moving" />
    <p class="text-caption text-muted-foreground">The world's own business, beyond the party's quests. Never shown to players.</p>

    <CanonSuggestions mode="forces" :entries="forces" />

    <CanonPartFind part="forces" noun="force" :count="forces.length" :arc-label="arcLabel" />

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
            :selected="force.id === selectedId"
            :move="canReorder ? endsOf(moving, force.id) : null"
            @select="emit('select', force.id)"
            @move="(direction) => reorder(moving, force.id, direction)"
          />
        </ul>
        <EmptyState
          v-else-if="forces.length > 0 && ended.length === 0"
          class="border border-dashed border-border bg-card"
          title="No force matches"
          description="Nothing here has those words in it."
        />
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
                :selected="force.id === selectedId"
                @select="emit('select', force.id)"
              />
            </ul>
          </Transition>
        </div>
      </div>
      <ForceLog v-if="forces.length > 0" class="@2xl:w-64 @2xl:shrink-0" :ticks="logTicks" :force-name="nameOf" @undo="undo" />
    </div>

    <form class="flex flex-col gap-2" @submit.prevent="addForce">
      <fieldset class="flex min-w-0 flex-col gap-1" :disabled="isSaving || unlinkedForceId !== null">
        <legend class="text-eyebrow text-muted-foreground">Who moves</legend>
        <AppInput v-if="factionId === ''" v-model="who" tone="filled" size="body" placeholder="Write a name…" aria-label="A new force" />
        <EntityCombobox
          :model-value="factionId"
          :options="factions ?? []"
          :placeholder="factionId === '' ? 'Or choose a faction…' : 'Choose a faction…'"
          @update:model-value="chooseFaction"
        />
      </fieldset>
      <div class="flex flex-wrap gap-2">
        <AppInput v-model="wants" tone="filled" size="body" class="min-w-0 flex-1 basis-48" placeholder="What it wants, in one line…" aria-label="What the new force wants" :disabled="isSaving || unlinkedForceId !== null" />
        <AppSelect v-model="clockSize" size="body" aria-label="Clock size" :disabled="isSaving || unlinkedForceId !== null">
          <option :value="null">No clock</option>
          <option v-for="n in CLOCK_SIZES" :key="n" :value="n">{{ n }} ticks</option>
        </AppSelect>
        <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" :label="unlinkedForceId === null ? 'Add force' : 'Retry faction link'" :loading="isSaving" :disabled="!canSubmit" />
        <AppButton v-if="unlinkedForceId !== null && !isSaving" type="button" variant="subtle" label="Keep force without link" @click="finishForce(unlinkedForceId)" />
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
/** Part III (frame 06): every force with its clock and the step it has reached. The steps and ticks are read once for the whole list, never one per force. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonPartFind from "./CanonPartFind.vue";
import CanonRubric from "./CanonRubric.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import ForceLog from "./ForceLog.vue";
import ForceRow from "./ForceRow.vue";
import { useCreateCanonEntryInCampaign } from "@/composables/canon/useCanonEntries";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { matchesQuery } from "@/lib/canon/canonNarrow";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCanonForceData, useUndoForceTick } from "@/composables/canon/useCanonForces";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useCampaignStore } from "@/stores/campaign";
import { useAllFactions } from "@/composables/factions/useFactions";
import { IconAdd, IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import { toast } from "@/lib/toast";
import { typeChoices } from "@/lib/worldLinks/connections";
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
const store = useCanonUiStore();
const found = computed(() => forces.filter((f) => matchesQuery(f.title, store.partQuery.forces)));
const moving = computed(() => found.value.filter((f) => f.closed_as === null));
const ended = computed(() => found.value.filter((f) => f.closed_as !== null));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.partQuery.forces.trim() === "");
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
const nameOf = (forceId: string) => forces.find((f) => f.id === forceId)?.title ?? "A force that is gone";

const who = ref("");
const wants = ref("");
const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const clockSize = ref<number | null>(null);
const factionId = ref("");
const { data: factions } = useAllFactions();
const faction = computed(() => factions.value?.find((row) => row.id === factionId.value));
const { mutateAsync: create } = useCreateCanonEntryInCampaign();
const { mutateAsync: connect } = useCreateConnectionInCampaign();
const campaign = useCampaignStore();
const isSaving = ref(false);
// A retry after a failed link finishes the saved force instead of creating a second row.
const unlinkedForceId = ref<string | null>(null);
const unlinkedForceCampaignId = ref<string | null>(null);
const canSubmit = computed(() => {
  if (isSaving.value || wants.value.trim() === "") return false;
  return factionId.value === "" ? who.value.trim() !== "" : faction.value !== undefined;
});

function chooseFaction(id: string) {
  if (!isSaving.value && unlinkedForceId.value === null) factionId.value = id;
}

function finishForce(forceId: string) {
  who.value = "";
  wants.value = "";
  clockSize.value = null;
  factionId.value = "";
  unlinkedForceId.value = null;
  unlinkedForceCampaignId.value = null;
  emit("select", forceId);
}

async function addForce() {
  if (!canSubmit.value) return;
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  if (unlinkedForceId.value !== null && unlinkedForceCampaignId.value !== campaignId) {
    toast.error("Switch back to the campaign where this force was started, then retry the faction link.");
    return;
  }
  const selectedFaction = faction.value;
  isSaving.value = true;
  try {
    if (unlinkedForceId.value === null) {
      const created = await create({ campaignId, input: {
        part: "force",
        title: selectedFaction ? selectedFaction.name : who.value.trim(),
        wants: wants.value.trim(),
        ...(clockSize.value === null ? {} : { clock_size: clockSize.value }),
        sort_order: forces.length,
      } });
      unlinkedForceId.value = created.id;
      unlinkedForceCampaignId.value = campaignId;
    }
    if (selectedFaction) {
      const choice = typeChoices("canon", "faction").find((entry) => entry.key === "about" && entry.subjectIsFrom);
      if (!choice) throw new Error("A force cannot be linked to a faction.");
      await connect({ input: {
        subject: { kind: "canon", id: unlinkedForceId.value },
        other: { kind: "faction", id: selectedFaction.id, name: selectedFaction.name },
        choice,
      }, campaignId });
    }
    finishForce(unlinkedForceId.value);
  } catch (error) {
    // Create reports its own error. Keep the saved force and inputs if its faction link failed.
    if (unlinkedForceId.value !== null) toast.error(`Force saved, but the faction could not be linked. ${toast.fromError(error)}`);
  } finally {
    isSaving.value = false;
  }
}
</script>
