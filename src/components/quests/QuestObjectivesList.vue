<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">
        Objectives
        <span v-if="objectives?.length" class="font-fell font-normal">
          ({{ doneCount }}/{{ objectives.length }})
        </span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <div
        v-for="obj in objectives ?? []"
        :key="obj.id"
        class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <button
          type="button"
          class="mt-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :title="`${QUEST_OBJECTIVE_STATUS_LABELS[obj.status]} — click for ${QUEST_OBJECTIVE_STATUS_LABELS[nextObjectiveStatus(obj.status)].toLowerCase()}`"
          @click="$emit('toggle', obj)"
        >
          <QuestObjectiveStatusMark :status="obj.status" />
        </button>
        <span
          class="text-body flex-1 leading-snug transition-colors"
          :class="
            obj.status === 'complete'
              ? 'text-muted-foreground line-through'
              : obj.status === 'failed' ? 'text-muted-foreground' : 'text-foreground'
          "
        >
          {{ obj.description }}
        </span>
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          :class="obj.is_player_visible ? 'text-elven-green' : ''"
          :icon="obj.is_player_visible ? IconReveal : IconHide"
          :tooltip="
            obj.is_player_visible
              ? 'Visible to players — click to hide'
              : 'Hidden from players — click to reveal'
          "
          @click="$emit('toggle-visibility', obj)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          :icon="IconClose"
          aria-label="Remove objective"
          @click="$emit('remove', obj)"
        />
      </div>
      <div v-if="!isNew" class="flex items-center gap-2 pt-1">
        <AppInput
          v-model="newObjective"
          tone="underline"
          size="body"
          class="flex-1"
          placeholder="Add objective…"
          @keydown.enter.prevent="submit"
        />
        <AppButton
          variant="ghost"
          tone="primary"
          size="inline"
          :disabled="!newObjective.trim()"
          aria-label="Add objective"
          :icon="IconAdd"
          icon-size="md"
          @click="submit"
        />
      </div>
      <p
        v-else
        class="text-caption text-muted-foreground italic px-2 py-1"
      >
        Save the quest first, then add objectives.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconClose, IconHide, IconReveal } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { countObjectivesComplete, nextObjectiveStatus, QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import QuestObjectiveStatusMark from "./QuestObjectiveStatusMark.vue";
import type { QuestObjective } from "@/types/quest.types";

const { objectives = [], isNew = false } = defineProps<{
  objectives: QuestObjective[] | undefined;
  isNew: boolean;
}>();

const emit = defineEmits<{
  toggle: [obj: QuestObjective];
  "toggle-visibility": [obj: QuestObjective];
  remove: [obj: QuestObjective];
  add: [description: string];
}>();

const newObjective = ref("");

const doneCount = computed(() => countObjectivesComplete(objectives ?? []));

function submit() {
  if (!newObjective.value.trim()) return;
  emit("add", newObjective.value.trim());
  newObjective.value = "";
}
</script>
