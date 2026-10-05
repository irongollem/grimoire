import { computed } from "vue";
import { useReadItems } from "@/composables/play/useReadItems";
import { usePlayerHandouts } from "@/composables/scriptorium/usePlayerHandouts";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { usePlayerVisiblePuzzles } from "@/composables/dungeon-features/usePuzzles";
import { useNotes } from "@/composables/notes/useNotes";

/** The quest statuses the Quest Log renders in a group; a shared quest outside them has no card to dot. */
export const QUEST_LOG_STATUSES: readonly string[] = ["active", "completed", "failed"];

interface Dated {
  id: string;
  updated_at: string;
}

/** True when any item is unread, by the same rule the journal cards use to draw their dot. */
export function anyUnread(
  items: readonly Dated[] | undefined,
  isNew: (id: string, updatedAt: string) => boolean,
): boolean {
  return (items ?? []).some((i) => isNew(i.id, i.updated_at));
}

/**
 * Is anything new, per section, for the signed-in player. It reads the same
 * lists the journal tabs read (TanStack dedupes by key, and their live sync is
 * already wired) against the same `player_read_items` rows, so the nav dot and
 * the card dot cannot disagree and nothing new polls.
 */
export function usePlayerUnread() {
  const { data: quests } = usePlayerVisibleQuests();
  const { data: puzzles } = usePlayerVisiblePuzzles();
  const { data: handouts } = usePlayerHandouts();
  const { data: notes } = useNotes();
  const { isNew: isQuestNew } = useReadItems("quest");
  const { isNew: isPuzzleNew } = useReadItems("puzzle");
  const { isNew: isHandoutNew } = useReadItems("handout");
  const { isNew: isNoteNew } = useReadItems("note");

  const sections = computed(() => ({
    quests: anyUnread((quests.value ?? []).filter((q) => QUEST_LOG_STATUSES.includes(q.status)), isQuestNew),
    puzzles: anyUnread(puzzles.value, isPuzzleNew),
    handouts: anyUnread(handouts.value, isHandoutNew),
    dmNotes: anyUnread(notes.value, isNoteNew),
  }));

  /** The Journal tile in the nav: anything new in any of its sections. */
  const journal = computed(() => Object.values(sections.value).some(Boolean));

  /** Nav paths that carry a dot. Keyed by route so the nav needs no knowledge of sections. */
  const unreadPaths = computed(() => (journal.value ? ["/play/journal"] : []));

  return { sections, journal, unreadPaths };
}
