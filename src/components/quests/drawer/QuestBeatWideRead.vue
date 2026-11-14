<template>
  <section class="flex min-w-0 flex-col gap-3" aria-label="What players read">
    <h3 class="text-heading-sm font-bold text-foreground">What players read</h3>

    <QuestBeatVisibilityControl :beat="beat" size="lg" :floor="floor" />
    <p v-if="floorLine" class="text-caption text-muted-foreground" data-testid="floor-line">{{ floorLine }}</p>

    <div class="flex flex-col gap-2">
      <div v-for="slip in slips" :key="slip.visibility" class="flex flex-col gap-1">
        <p class="flex items-center gap-2 text-label-lg font-bold text-foreground">
          {{ slip.title }}
          <span v-if="beat.visibility === slip.visibility" class="rounded bg-primary/15 px-1.5 py-0.5 text-label uppercase text-primary">Showing</span>
        </p>
        <div class="rounded-lg border border-border bg-card p-3 text-body">
          <RichTextViewer v-if="hasBeatText(slip.text)" :content="slip.text" />
          <p v-else class="text-caption italic text-muted-foreground">Nothing written yet.</p>
        </div>
      </div>
      <div><AppButton label="Edit" size="xs" variant="subtle" @click="emit('edit-text')" /></div>
    </div>

    <AppCheckbox :model-value="beat.secret" label="Secret: players hear nothing until they get here" label-role="caption" size="sm" :disabled="saving" @update:model-value="setSecret" />
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { hasBeatText } from "@/lib/quests/beatText";
import { visibilityFloor } from "@/lib/quests/visibility";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import QuestBeatVisibilityControl from "../common/QuestBeatVisibilityControl.vue";

/**
 * Frame 10, "What players read": the three-circle track the DM moves a beat along
 * (never below the floor a move already set), the two slips players see at each
 * step with the live one marked, and whether the beat is a secret. The text itself
 * is written in the column's one form, so Edit only asks for it.
 */
const { beat, edges, reachedBeatIds, partyBeatIds } = defineProps<{
  beat: QuestBeat;
  edges: QuestBeatEdge[];
  /** Beats the party has arrived at at any point. */
  reachedBeatIds: ReadonlySet<string>;
  /** Beats a live thread's cursor stands on. */
  partyBeatIds: ReadonlySet<string>;
}>();
const emit = defineEmits<{ "edit-text": [] }>();

const updateBeat = useUpdateQuestBeat();
const error = ref("");
const saving = ref(false);

const floor = computed(() => visibilityFloor({ beatId: beat.id, partyBeatIds, reachedBeatIds, edges, secret: beat.secret }));
const floorLine = computed(() => {
  if (floor.value === "revealed") return partyBeatIds.has(beat.id) ? "Revealed on its own: the party is here." : "Revealed on its own: the party has been here.";
  if (floor.value === "rumored") return "Rumored on its own: one route away.";
  return "";
});
const slips = computed(() => [
  { visibility: "rumored" as const, title: "While rumored", text: beat.rumor_text },
  { visibility: "revealed" as const, title: "Once revealed", text: beat.reveal_text },
]);

async function save(fallback: string, write: () => Promise<unknown>) {
  error.value = "";
  saving.value = true;
  try { await write(); } catch (caught) { error.value = caught instanceof Error ? caught.message : fallback; } finally { saving.value = false; }
}
function setSecret(next: boolean) {
  if (next === beat.secret) return;
  void save("Could not change this beat's secrecy", () => updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { secret: next } }));
}
</script>
