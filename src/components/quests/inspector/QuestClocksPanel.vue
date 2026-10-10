<template>
  <section class="rounded-lg border border-border bg-card overflow-hidden" aria-label="Clocks">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">
        Clocks
        <span v-if="clocks?.length" class="font-fell font-normal">({{ clocks.length }})</span>
      </span>
      <p class="text-caption text-muted-foreground">A clock fills one tick at a time during play. When it fills, the rules watching it fire.</p>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <QuestClockEditRow
        v-for="clock in clocks ?? []"
        :key="clock.id"
        :clock="clock"
        :quest-id="questId"
        @remove="remove(clock)"
      />
      <div class="flex items-center gap-2 pt-1">
        <AppInput
          v-model="newLabel"
          tone="underline"
          size="body"
          class="flex-1"
          placeholder="Add clock…"
          @keydown.enter.prevent="submit"
        />
        <label class="flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
          <span>Segments</span>
          <AppInput
            v-model.number="newSegments"
            type="number"
            :min="QUEST_CLOCK_MIN_SEGMENTS"
            :max="QUEST_CLOCK_MAX_SEGMENTS"
            tone="muted"
            size="body-xs"
            align="right"
            class="w-16"
            aria-label="New clock segments"
          />
        </label>
        <AppButton
          variant="ghost"
          tone="primary"
          size="inline"
          :disabled="!canAdd"
          aria-label="Add clock"
          :icon="IconAdd"
          icon-size="md"
          @click="submit"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Authoring for a quest's progress clocks (#1011), beside its objectives in the
 * overview. A clock is a DM-side counter ("the ritual", "the siege") that rules
 * can watch; playing it is `QuestRunClocks.vue` in the cockpit.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCreateQuestClock, useDeleteQuestClock, useQuestClocks } from "@/composables/quests/useQuestClocks";
import { IconAdd } from "@/lib/icons";
import { QUEST_CLOCK_MAX_SEGMENTS, QUEST_CLOCK_MIN_SEGMENTS, type QuestClock } from "@/types/quest.types";
import QuestClockEditRow from "./QuestClockEditRow.vue";

const { questId, campaignId } = defineProps<{ questId: string; campaignId: string }>();
const { data: clocks } = useQuestClocks(computed(() => questId));
const { mutateAsync: createClock } = useCreateQuestClock();
const { mutateAsync: deleteClock } = useDeleteQuestClock();
const { confirm } = useConfirm();
const toast = useToast();

const newLabel = ref("");
const newSegments = ref(4);

const canAdd = computed(
  () => !!newLabel.value.trim()
    && Number.isInteger(newSegments.value)
    && newSegments.value >= QUEST_CLOCK_MIN_SEGMENTS
    && newSegments.value <= QUEST_CLOCK_MAX_SEGMENTS,
);

async function submit() {
  if (!canAdd.value) return;
  const label = newLabel.value.trim();
  try {
    await createClock({
      campaign_id: campaignId,
      quest_id: questId,
      label,
      segments: newSegments.value,
      sort_order: clocks.value?.length ?? 0,
    });
    newLabel.value = "";
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}

async function remove(clock: QuestClock) {
  if (!(await confirm(`Remove the "${clock.label}" clock?`))) return;
  try {
    await deleteClock({ id: clock.id, questId });
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}
</script>
