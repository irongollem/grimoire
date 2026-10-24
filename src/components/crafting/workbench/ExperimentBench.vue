<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:p-6">
    <header class="flex items-center gap-3">
      <AppButton :to="{ name: 'play-crafting' }" variant="ghost" size="icon-sm" :icon="IconChevronLeft" aria-label="Back to the Workshop" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-heading-sm font-bold text-foreground">Experiment</h1>
        <p class="text-caption text-muted-foreground">{{ discipline.label }} · {{ art.bench.label }}</p>
      </div>
      <AppSelect :model-value="discipline.id" size="sm" aria-label="Switch bench" @update:model-value="onSwitch">
        <option v-for="d in CRAFTING_DISCIPLINES" :key="d.id" :value="d.id">{{ d.label }}</option>
      </AppSelect>
    </header>

    <p class="text-body text-muted-foreground italic">You know no recipe for this. Lay out what you think belongs together and try it.</p>

    <WorkbenchBenchFrame v-if="wide" :art="art" :count="dishCount" list-label="Dishes">
      <template #dish="{ index, tabindex, setRef, onFocusin }">
        <ExperimentSlot
          :ref="setRef"
          :tabindex="tabindex"
          :entry="entries[index] ?? null"
          :index="index"
          :total="dishCount"
          variant="bench"
          :art="art"
          @press="onPress(index)"
          @focusin="onFocusin"
        />
      </template>
    </WorkbenchBenchFrame>

    <div v-else class="flex flex-col gap-3">
      <div class="relative h-28 overflow-hidden rounded-lg border border-border bg-muted">
        <img :src="art.phoneSrc" alt="" aria-hidden="true" draggable="false" class="h-full w-full object-cover object-top" />
      </div>
      <ul class="flex flex-col gap-2" aria-label="Dishes">
        <li v-for="i in dishCount" :key="i">
          <ExperimentSlot :entry="entries[i - 1] ?? null" :index="i - 1" :total="dishCount" variant="row" :art="art" @press="onPress(i - 1)" />
        </li>
      </ul>
    </div>

    <ExperimentPack
      ref="pack"
      :entries="packEntries"
      :full="entries.length >= EXPERIMENT_MAX_ITEMS"
      :empty-text="entries.length > 0 ? 'Everything you can use is on the bench.' : 'You carry nothing you can experiment with.'"
      @lay="lay"
    />

    <div class="flex flex-col gap-2">
      <AppButton
        variant="primary"
        size="md"
        block
        label="Experiment"
        :disabled="entries.length === 0 || previewing"
        :loading="experimenting"
        @click="onExperiment"
      />
      <!-- The server only lets the seated player experiment (craft_experiment refuses a DM's
           preview), so the preview says so instead of failing with a misleading error. -->
      <p v-if="previewing" class="text-caption text-muted-foreground">Only the player can experiment. The preview shows their bench.</p>
      <p v-if="experimentError" class="text-caption text-destructive" role="alert">{{ experimentError }}</p>
    </div>

    <ExperimentOutcomeModal
      v-if="result"
      :open="true"
      :result="result"
      :discipline="discipline"
      :chat-notice="chatNotice"
      @close="onClose"
      @attempt="onAttempt"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ExperimentOutcomeModal from "@/components/crafting/workbench/ExperimentOutcomeModal.vue";
import ExperimentPack from "@/components/crafting/workbench/ExperimentPack.vue";
import ExperimentSlot from "@/components/crafting/workbench/ExperimentSlot.vue";
import WorkbenchBenchFrame from "@/components/crafting/workbench/WorkbenchBenchFrame.vue";
import { useCraftExperiment } from "@/composables/crafting/useCraftExperiment";
import type { PlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import { useAbove } from "@/composables/useBreakpoint";
import { useAppUiStore } from "@/stores/ui/app";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting/disciplines";
import { EXPERIMENT_MAX_ITEMS, experimentEntries, experimentPack, experimentPackEntries, standingLayout } from "@/lib/crafting/experiment";
import { benchArtFor } from "@/lib/crafting/workbench/art";
import { IconChevronLeft } from "@/lib/icons";
import type { CraftingDiscipline } from "@/types/crafting.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The experiment bench (#1103): an empty bench for one discipline. The player lays pack items in
 * dishes and presses Experiment; nothing is spent, whatever comes of it.
 */
const { disciplineId, member, crafting } = defineProps<{
  disciplineId: CraftingDiscipline;
  member: PartyMember;
  /** The view's own `usePlayerCrafting`, handed down so the bench does not build a second copy. */
  crafting: PlayerCrafting;
}>();

const router = useRouter();
const wide = useAbove("lg");
const pack = ref<InstanceType<typeof ExperimentPack> | null>(null);

const discipline = computed(() => getDiscipline(disciplineId));
const art = computed(() => benchArtFor(disciplineId));

// One row id per dish; a stack laid twice fills two dishes, up to the units it holds.
const laidOut = ref<string[]>([]);
const eligible = computed(() => experimentPack(crafting.myInventory.value));
// A live ring can take a laid-out row away (equipped, spent, handed on) or shrink its stack. The
// layout follows, so a dish never holds what the pack no longer has, the cap counts what shows,
// and a row that comes back does not reappear on the bench by itself.
watch(eligible, (pack) => {
  const standing = standingLayout(laidOut.value, pack);
  if (standing.length !== laidOut.value.length) laidOut.value = standing;
});
const entries = computed(() => experimentEntries(laidOut.value, eligible.value, crafting.allItems.value));
const packEntries = computed(() => experimentPackEntries(laidOut.value, eligible.value, crafting.allItems.value));
// One empty dish to fill, until the bench is full.
const dishCount = computed(() => entries.value.length + (entries.value.length < EXPERIMENT_MAX_ITEMS ? 1 : 0));

function lay(rowId: string) {
  laidOut.value = standingLayout([...laidOut.value, rowId], eligible.value);
}

function onPress(index: number) {
  if (entries.value[index]) laidOut.value = laidOut.value.filter((_, i) => i !== index);
  else pack.value?.focusFirst();
}

const { result, experimenting, experimentError, chatNotice, experiment, clearError, dismiss } = useCraftExperiment(() => member);
// A refusal describes the layout it was given; once the bench changes it no longer applies.
watch(laidOut, clearError);
const appUi = useAppUiStore();
const previewing = computed(() => appUi.dmPreviewMode);

function onExperiment() {
  void experiment(
    disciplineId,
    entries.value.map((e) => e.row.id),
  );
}

function onClose() {
  dismiss();
}

function onAttempt(recipeId: string) {
  dismiss();
  void router.push({ name: "play-crafting-workbench", params: { recipeId } });
}

function onSwitch(id: CraftingDiscipline) {
  void router.push({ name: "play-crafting-experiment", params: { discipline: id } });
}
</script>
