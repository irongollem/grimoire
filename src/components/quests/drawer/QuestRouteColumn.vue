<template>
  <QuestColumnFrame label="Selected route">
    <template #header>
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-caption text-muted-foreground">
            Route from
            <AppButton v-if="edge" :label="sourceTitle" size="xs" variant="link" @click="emit('select-beat', edge.source_beat_id)" />
          </p>
          <h3 class="text-heading-sm font-bold text-foreground">{{ heading }}</h3>
        </div>
        <!-- Back up to the quest, said in words: an × means delete elsewhere on this screen. -->
        <AppButton :icon="IconChevronLeft" label="Quest" aria-label="Back to the quest" size="xs" variant="subtle" @click="emit('deselect')" />
      </div>
    </template>

    <template v-if="edge">
      <label class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">What the party does</span>
        <AppInput v-model="draft.label" placeholder="Take Naerth's deal" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">What it costs</span>
        <AppInput v-model="draft.note" placeholder="His son goes free; the family loses its boats." />
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">Kind</span>
        <SegmentedControl v-model="draft.kind" size="sm" :options="kindOptions" />
        <p v-if="draft.kind === 'choice' && !canBeParallel" class="text-caption text-muted-foreground">This beat has no other choice route yet. Add one before making this one "and also", or its thread would have nowhere to send the cursor.</p>
        <p v-if="draft.kind === 'parallel'" class="text-caption text-muted-foreground">The label also names the thread it opens.</p>
      </div>

      <QuestRouteGateEditor v-model:gate-mode="draft.gateMode" v-model:conditions="draft.conditions" :objective-options="objectiveOptions" :gate-preview="gatePreview" />

      <div v-if="effects.length" class="rounded-md border border-border bg-muted/40 p-2">
        <p class="text-caption font-semibold text-foreground">Taking it does</p>
        <ul class="mt-1 space-y-0.5 text-caption text-muted-foreground">
          <li v-for="(effect, index) in effects" :key="index">{{ describeQuestRouteEffect(effect) }}</li>
        </ul>
      </div>

      <p v-if="deleteError" role="alert" class="text-caption text-destructive">{{ deleteError }}</p>
      <AutosaveStatus :status="status" :error="saveError" :paused-label="`Autosave paused until ${pausedReason}`" />

      <QuestTakeRoute :key="edge.id" :edge="edge" :edges="edges" :beats="beats" :target-staging="targetStaging" :standing="standing" :thread-id="threadId" :session-id="sessionId" />
      <AppButton label="Delete route" size="sm" variant="destructive" @click="onDelete" />
    </template>

  </QuestColumnFrame>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import QuestRouteGateEditor from "../inspector/QuestRouteGateEditor.vue";
import QuestTakeRoute from "../inspector/QuestTakeRoute.vue";
import QuestColumnFrame from "./QuestColumnFrame.vue";
import { useRouteDraft } from "@/composables/quests/useRouteDraft";
import { IconChevronLeft } from "@/lib/icons";
import { describeQuestRouteEffect } from "@/lib/quests/gates";
import type { ThreadStanding } from "@/lib/quests/moves";
import type { QuestRouteKind } from "@/types/quest.types";

/**
 * The drawer's column for a selected route (#1194): what the party does, what
 * it costs, whether it is one of several ways or an "and also", its gate and
 * its effects, then Take this route and Delete at the end of the scrolling body. It owns its draft
 * and saves it itself (autosave, no Save button), so the story flow carries no route state.
 */
const { questId, edgeId, standing, threadId = null, sessionId = null } = defineProps<{
  questId: string;
  edgeId: string;
  /** Where the focus thread stands (#1194): the route is taken here, marked as taken from further back, or out of reach. Null with no thread. */
  standing: ThreadStanding | null;
  /** The focus thread; null disables Take this route. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
}>();
const emit = defineEmits<{ deselect: []; "select-beat": [beatId: string]; deleted: [] }>();

const { edge, edges, beats, draft, deleteError, status, saveError, pausedReason, sourceTitle, targetTitle, objectiveOptions, gatePreview, effects, canBeParallel, targetStaging, remove } = useRouteDraft(toRef(() => questId), toRef(() => edgeId));

const heading = computed(() => edge.value?.label?.trim() || `To ${targetTitle.value}`);
// "And also" is greyed until it could be saved: it needs a label (which names the
// thread it opens) and another choice route out of the beat to keep the cursor
// moving. Once a route is already "and also", clearing either pauses autosave
// instead (see useRouteDraft), so an invalid route is never written.
const alsoNeeds = computed(() => {
  if (draft.kind === "parallel") return undefined;
  if (!draft.label.trim()) return "Give the route a label first";
  if (!canBeParallel.value) return "Needs another route out of this beat";
  return undefined;
});
const kindOptions = computed<SegmentedOption<QuestRouteKind>[]>(() => [
  { value: "choice", label: "They choose one" },
  { value: "parallel", label: "And also", disabled: alsoNeeds.value !== undefined, tooltip: alsoNeeds.value },
]);

async function onDelete() {
  if (await remove()) emit("deleted");
}
</script>
