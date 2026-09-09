import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useQuests } from "@/composables/quests/useQuests";
import type { Quest } from "@/types/quest.types";

/**
 * The "Enters at" half of an `unlock_quest` consequence (#871), shared by the
 * beat-scoped quick-add (`QuestPayoffPanel`) and the quest-wide form
 * (`QuestRulesPanel`) — both offer a second combobox for the target quest's
 * own beats, and both need to describe an already-authored unlock row the
 * same way. Byte-identical in each until this extraction; keep it that way by
 * changing it here, not per call site.
 *
 * One beats query rather than one per row: it follows the caller's own
 * `targetQuestId` while a form/quick-add is open, and falls back to the
 * target of an existing unlock row in the caller's own rows once it closes
 * (the caller's own reset clears `targetQuestId` but not the row itself) —
 * the cheapest thing that stays correct for the realistic case of at most one
 * unlock target at a time.
 */
export function useUnlockEntryPicker(input: {
  /** The form's current target-quest selection ("" when none chosen). */
  targetQuestId: Ref<string>;
  /** The target of an existing unlock row in the caller's own rows, or "". */
  fallbackTargetQuestId: () => string;
}): {
  entryBeatId: Ref<string>;
  targetQuest: ComputedRef<Quest | undefined>;
  entryBeatOptions: ComputedRef<{ id: string; name: string }[]>;
  unlockQuestLabel: (id: string | null) => string;
  unlockBeatLabel: (id: string | null) => string;
  resolveEntryBeatId: () => string | null;
  reset: () => void;
} {
  const { targetQuestId, fallbackTargetQuestId } = input;

  // Only `undiscovered` quests are ever a legal unlock target — the database's
  // own no-self-unlock/rung rule — so that is the pool `targetQuest` resolves
  // against, distinct from `allQuests` below.
  const { data: undiscoveredQuests } = useQuests("undiscovered");
  const { data: allQuests } = useQuests();

  const entryBeatId = ref("");
  const targetQuest = computed(() => (undiscoveredQuests.value ?? []).find((quest) => quest.id === targetQuestId.value));
  const beatQueryTargetId = computed(() => targetQuestId.value || fallbackTargetQuestId());
  const { data: beatQueryTargetBeats } = useQuestBeats(beatQueryTargetId);
  const entryBeatOptions = computed(() => (targetQuestId.value ? (beatQueryTargetBeats.value ?? []) : [])
    .filter((candidate) => candidate.kind !== "archived")
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.id === targetQuest.value?.entry_beat_id ? `${candidate.title} · entry` : candidate.title,
    })));

  // Preselects the target's own entry whenever the chosen target quest
  // changes — not on every reactive tick, so a DM who then picks a different
  // beat is not fought back to the entry on the next render.
  watch(() => targetQuest.value?.entry_beat_id ?? "", (id) => { entryBeatId.value = id; }, { immediate: true });

  // Labels resolve against every quest, not only the undiscovered ones the
  // form offers: a rule authored last month whose target has since been
  // promoted to rumor or active is still a real row on the list. An id that
  // resolves to nothing yields "" so the description drops back to the bare
  // verb rather than asserting "Missing quest" about a load that has not
  // finished (or a second unlock target this one beats query is not pointed
  // at).
  function unlockQuestLabel(id: string | null): string {
    if (!id) return "";
    return (allQuests.value ?? []).find((quest) => quest.id === id)?.title || "";
  }
  function unlockBeatLabel(id: string | null): string {
    if (!id) return "";
    return (beatQueryTargetBeats.value ?? []).find((candidate) => candidate.id === id)?.title || "";
  }

  // Null already means "the target's own entry"; writing it explicitly only
  // when the DM chose a different beat lets the entry move with the target if
  // it is re-pointed later, per the migration's own header.
  function resolveEntryBeatId(): string | null {
    if (!entryBeatId.value) return null;
    return entryBeatId.value === (targetQuest.value?.entry_beat_id ?? "") ? null : entryBeatId.value;
  }

  function reset() {
    entryBeatId.value = "";
  }

  return { entryBeatId, targetQuest, entryBeatOptions, unlockQuestLabel, unlockBeatLabel, resolveEntryBeatId, reset };
}
