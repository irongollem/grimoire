<template>
  <EntityDetailModal
    :title="displayTitle"
    :subtitle="subtitle"
    :loading="isLoading"
    height="content"
    :origin-key="`/quests/${id}`"
    @close="emit('close')"
  >
    <template #actions>
      <AppButton
        variant="subtle"
        size="sm"
        label="Story flow"
        :icon="IconNetwork"
        :to="`/quests/${id}?view=work`"
      />
    </template>

    <QuestOverviewPanel v-if="quest" :quest="quest" />
    <p v-else class="py-16 text-center text-body text-muted-foreground italic">
      This quest could not be found.
    </p>
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * A quest's overview, over the quest log.
 *
 * Nothing here is about being a modal — the shell, the dismissal and the
 * flight out of the card all belong to `EntityDetailModal`. This is the
 * quest-shaped part: the status subtitle, one action worth having within
 * reach of it, and the overview panel itself. `height="content"` rather than
 * `contained`, the NPC sheet's pair, because the overview is a single flowing
 * column, not two independently scrolling ones, and its length swings hard —
 * a freshly hooked quest with no beats yet is a few lines, one with a
 * consistency panel and a long lifecycle history is not.
 *
 * The story-flow graph and the run cockpit never appear in here — they are
 * the other half of `useQuestDetailSurface`'s `view`, and that half is a
 * commitment `useDetailModal` deliberately keeps off this popover (see the
 * routing comment on `/quests`). "Story flow" is this modal's way of pointing
 * at that surface rather than trying to hold it.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityDetailModal from "@/components/common/EntityDetailModal.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import { useQuest } from "@/composables/quests/useQuests";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";
import { IconNetwork } from "@/lib/icons";

const { id } = defineProps<{ id: string }>();

const emit = defineEmits<{ close: [] }>();

const { data: quest, isLoading } = useQuest(computed(() => id));

const displayTitle = computed(() => quest.value?.title ?? "Quest");

/** The lifecycle state, in one line — the header's job now the sheet has dropped it. */
const subtitle = computed(() => (quest.value ? QUEST_STATUS_LABELS[quest.value.status] : undefined));
</script>
