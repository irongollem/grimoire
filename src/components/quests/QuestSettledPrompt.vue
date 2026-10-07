<template>
  <div
    v-if="visible"
    role="status"
    class="flex flex-wrap items-center gap-2 rounded-lg border border-tone-caution/50 bg-tone-caution/5"
    :class="compact ? 'px-2 py-1.5' : 'p-3'"
  >
    <p class="min-w-0 flex-1 text-caption text-foreground" :class="compact ? '' : 'font-semibold'">
      Every objective is resolved.
      <span v-if="!compact" class="font-normal text-muted-foreground">Is the quest over?</span>
    </p>
    <div class="flex flex-wrap gap-1.5">
      <AppButton label="Mark completed" size="xs" variant="primary" :disabled="saving" @click="finish('completed')" />
      <AppButton label="Mark failed" size="xs" variant="subtle" :disabled="saving" @click="finish('failed')" />
      <AppButton label="Keep running" size="xs" variant="ghost" @click="dismissed.add(questId)" />
    </div>
  </div>
</template>

<script lang="ts">
import { reactive } from "vue";

// Per session, per quest, shared by every mount of the prompt: dismissing it in
// the cockpit also quiets the overview, and a reload asks again.
const dismissed = reactive(new Set<string>());
</script>

<script setup lang="ts">
/**
 * "Every objective is resolved." (#1011). The server never changes
 * `quests.status` when the ledger settles; the DM is asked instead. Settled is
 * `isLedgerSettled` (mirrors `private.quest_ledger_settled`), and the prompt
 * only shows for a quest still `active`.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useQuest, useQuestObjectives, useUpdateQuest } from "@/composables/quests/useQuests";
import { useToast } from "@/composables/useToast";
import { isLedgerSettled } from "@/lib/quests/objectives";

const { questId, compact = false } = defineProps<{ questId: string; compact?: boolean }>();
const questIdRef = computed(() => questId);
const { data: quest } = useQuest(questIdRef);
const { data: objectives } = useQuestObjectives(questIdRef);
const { mutateAsync: updateQuest } = useUpdateQuest();
const toast = useToast();
const saving = ref(false);

const visible = computed(
  () => quest.value?.status === "active" && isLedgerSettled(objectives.value ?? []) && !dismissed.has(questId),
);

async function finish(status: "completed" | "failed") {
  saving.value = true;
  try {
    await updateQuest({ id: questId, update: { status } });
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  } finally {
    saving.value = false;
  }
}
</script>
