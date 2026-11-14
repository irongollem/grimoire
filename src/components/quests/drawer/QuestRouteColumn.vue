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
        <AppButton :icon="IconClose" aria-label="Back to the quest" tooltip="Back to the quest" size="icon-sm" variant="ghost" @click="emit('deselect')" />
      </div>
    </template>

    <template v-if="edge">
      <label class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">What the party does</span>
        <AppInput v-model="label" placeholder="Take Naerth's deal" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">What it costs</span>
        <AppInput v-model="note" placeholder="His son goes free; the family loses its boats." />
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-caption font-semibold text-foreground">Kind</span>
        <SegmentedControl v-model="kind" size="sm" :options="kindOptions" />
        <p v-if="kind === 'choice' && !canBeParallel" class="text-caption text-muted-foreground">This beat has no other choice route yet. Add one before making this one "and also", or its thread would have nowhere to send the cursor.</p>
        <p v-if="kind === 'parallel'" class="text-caption text-muted-foreground">The label also names the thread it opens.</p>
      </div>

      <QuestRouteGateEditor v-model:gate-mode="gateMode" v-model:conditions="conditions" :objective-options="objectiveOptions" :gate-preview="gatePreview" />

      <div v-if="effects.length" class="rounded-md border border-border bg-muted/40 p-2">
        <p class="text-caption font-semibold text-foreground">Taking it does</p>
        <ul class="mt-1 space-y-0.5 text-caption text-muted-foreground">
          <li v-for="(effect, index) in effects" :key="index">{{ describeQuestRouteEffect(effect) }}</li>
        </ul>
      </div>

      <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
      <div class="flex items-center justify-end gap-2">
        <AppButton label="Save route" size="sm" :loading="saving" @click="void save()" />
      </div>
    </template>

    <template v-if="edge" #foot>
      <div class="flex flex-col gap-2">
        <QuestTakeRoute :key="edge.id" :edge="edge" :edges="edges" :beats="beats" :target-staging="targetStaging" :thread-id="threadId" :session-id="sessionId" />
        <AppButton label="Delete route" size="sm" variant="destructive" @click="onDelete" />
      </div>
    </template>
  </QuestColumnFrame>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import QuestRouteGateEditor from "../inspector/QuestRouteGateEditor.vue";
import QuestTakeRoute from "../inspector/QuestTakeRoute.vue";
import QuestColumnFrame from "./QuestColumnFrame.vue";
import { useRouteDraft } from "@/composables/quests/useRouteDraft";
import { IconClose } from "@/lib/icons";
import { describeQuestRouteEffect } from "@/lib/quests/gates";
import type { QuestRouteKind } from "@/types/quest.types";

/**
 * The drawer's column for a selected route (#1194): what the party does, what
 * it costs, whether it is one of several ways or an "and also", its gate and
 * its effects, with Take this route and Delete pinned below. It owns its draft
 * and its save, so the story flow carries no route state.
 */
const { questId, edgeId, threadId = null, sessionId = null } = defineProps<{
  questId: string;
  edgeId: string;
  /** The focus thread; null disables Take this route. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
}>();
const emit = defineEmits<{ deselect: []; "select-beat": [beatId: string]; deleted: [] }>();

const { edge, edges, beats, label, note, kind, gateMode, conditions, saving, error, sourceTitle, targetTitle, objectiveOptions, gatePreview, effects, canBeParallel, targetStaging, save, remove } = useRouteDraft(toRef(() => questId), toRef(() => edgeId));

const heading = computed(() => edge.value?.label?.trim() || `To ${targetTitle.value}`);
// A beat with no other choice route cannot spend its only way out on an "and also".
const kindOptions = computed<SegmentedOption<QuestRouteKind>[]>(() => [
  { value: "choice", label: "They choose one" },
  { value: "parallel", label: "And also", disabled: !canBeParallel.value, tooltip: canBeParallel.value ? undefined : "Add a choice route from this beat first." },
]);

async function onDelete() {
  if (await remove()) emit("deleted");
}
</script>
