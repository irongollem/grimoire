<template>
  <section class="rounded-lg border border-border bg-card p-3" aria-label="Selected route">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Selected route</h3>
      <span class="ml-auto truncate rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground">{{ sourceTitle }} → {{ targetTitle }}</span>
    </header>

    <div class="mt-2 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-caption font-semibold text-foreground">Route kind</span>
        <SegmentedControl v-model="routeKind" size="sm" :options="routeKindOptions" />
      </div>
      <p v-if="routeKind === 'choice' && !canBeParallel" class="text-caption text-muted-foreground">This beat has no other choice route yet — add one before opening a parallel route here, or its thread would have nowhere to send the cursor.</p>

      <AppInput v-if="routeKind === 'parallel'" v-model="threadLabel" placeholder="Thread label — shown to the DM and on the player thread…" aria-label="Opens thread" />

      <div class="grid gap-2 sm:grid-cols-2">
        <AppSelect v-model="gateStatus" aria-label="Route gate">
          <option value="">No gate — always open</option>
          <option v-for="status in QUEST_CONSEQUENCE_OBJECTIVE_STATUSES" :key="status" :value="status">Open while an objective is {{ QUEST_OBJECTIVE_STATUS_LABELS[status].toLowerCase() }}</option>
        </AppSelect>
        <EntityCombobox v-if="gateStatus" v-model="gateObjectiveId" :options="objectiveOptions" placeholder="Which objective…" />
      </div>

      <div v-if="effects.length" class="rounded-md border border-border bg-background p-2">
        <div class="flex items-center gap-2">
          <p class="text-caption font-semibold text-foreground">Consequences on this route</p>
          <AppButton :to="editTo" label="Edit" size="xs" variant="subtle" class="ml-auto" />
        </div>
        <ul class="mt-1 space-y-0.5 text-caption text-muted-foreground">
          <li v-for="(effect, index) in effects" :key="index">{{ describeQuestRouteEffect(effect) }}</li>
        </ul>
      </div>
    </div>

    <p v-if="error" role="alert" class="mt-2 text-caption text-destructive">{{ error }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <AppButton label="Save route" size="sm" :loading="saving" @click="emit('save')" />
      <AppButton label="Delete route" size="sm" variant="destructive" @click="emit('delete')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { describeQuestRouteEffect } from "@/lib/quests/gates";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import { QUEST_CONSEQUENCE_OBJECTIVE_STATUSES, type QuestConsequenceObjectiveStatus, type QuestRouteEffect, type QuestRouteKind } from "@/types/quest.types";

const { sourceTitle, targetTitle, objectiveOptions, effects, editTo, canBeParallel, saving = false, error = "" } = defineProps<{
  sourceTitle: string;
  targetTitle: string;
  objectiveOptions: { id: string; name: string }[];
  effects: QuestRouteEffect[];
  editTo: string;
  canBeParallel: boolean;
  saving?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ save: []; delete: [] }>();

// A beat with no choice route yet cannot afford to spend its only outgoing
// route on a parallel one — the invariant the composer also enforces when
// creating a route from scratch (frame `01 Delta`'s "invariant to keep").
const routeKindOptions = computed<SegmentedOption<QuestRouteKind>[]>(() => [
  { value: "choice", label: "Choice" },
  { value: "parallel", label: "Parallel", disabled: !canBeParallel, tooltip: canBeParallel ? undefined : "Add a choice route from this beat first." },
]);

const routeKind = defineModel<QuestRouteKind>("routeKind", { required: true });
const threadLabel = defineModel<string>("threadLabel", { required: true });
const gateStatus = defineModel<QuestConsequenceObjectiveStatus | "">("gateStatus", { required: true });
const gateObjectiveId = defineModel<string>("gateObjectiveId", { required: true });
</script>
