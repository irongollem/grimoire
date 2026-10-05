import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
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

export interface UnreadItem {
  kind: "quest" | "puzzle" | "handout" | "note";
  id: string;
  title: string;
  updatedAt: string;
  to: RouteLocationRaw;
}

interface UnreadSources {
  quests: readonly (Dated & { title: string; status: string })[] | undefined;
  puzzles: readonly (Dated & { name: string })[] | undefined;
  handouts: readonly (Dated & { title: string })[] | undefined;
  notes: readonly (Dated & { title: string })[] | undefined;
  isNew: Record<UnreadItem["kind"], (id: string, updatedAt: string) => boolean>;
}

/**
 * Every unread thing, newest first. Same lists, same filter (quests the Quest
 * Log lists) and same `isNew` checks as `sections`, so the list and the Journal
 * dot cannot disagree. Puzzles and DM notes have no detail route, so they open
 * their Journal tab.
 */
export function collectUnreadItems(src: UnreadSources): UnreadItem[] {
  const items: UnreadItem[] = [
    ...(src.quests ?? [])
      .filter((q) => QUEST_LOG_STATUSES.includes(q.status) && src.isNew.quest(q.id, q.updated_at))
      .map((q): UnreadItem => ({ kind: "quest", id: q.id, title: q.title, updatedAt: q.updated_at, to: { name: "play-quest-detail", params: { id: q.id } } })),
    ...(src.puzzles ?? [])
      .filter((p) => src.isNew.puzzle(p.id, p.updated_at))
      .map((p): UnreadItem => ({ kind: "puzzle", id: p.id, title: p.name, updatedAt: p.updated_at, to: { name: "play-journal", query: { tab: "puzzles" } } })),
    ...(src.handouts ?? [])
      .filter((h) => src.isNew.handout(h.id, h.updated_at))
      .map((h): UnreadItem => ({ kind: "handout", id: h.id, title: h.title, updatedAt: h.updated_at, to: { name: "play-handout", params: { id: h.id } } })),
    ...(src.notes ?? [])
      .filter((n) => src.isNew.note(n.id, n.updated_at))
      .map((n): UnreadItem => ({ kind: "note", id: n.id, title: n.title, updatedAt: n.updated_at, to: { name: "play-journal", query: { tab: "dm-notes" } } })),
  ];
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

  /** The unread things themselves, newest first (the Hearth's "new for you" list). */
  const items = computed(() =>
    collectUnreadItems({
      quests: quests.value,
      puzzles: puzzles.value,
      handouts: handouts.value,
      notes: notes.value,
      isNew: { quest: isQuestNew, puzzle: isPuzzleNew, handout: isHandoutNew, note: isNoteNew },
    }),
  );

  return { sections, journal, unreadPaths, items };
}
