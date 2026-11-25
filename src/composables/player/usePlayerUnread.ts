import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { useReadMarkers } from "@/composables/player/useReadItems";
import { usePlayerNoticeBoards } from "@/composables/noticeBoards/usePlayerNoticeBoards";
import { usePlayerHandouts } from "@/scriptorium/composables/usePlayerHandouts";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { usePlayerVisiblePuzzles } from "@/composables/dungeon-features/usePuzzles";
import { usePlayerVisibleNotes } from "@/composables/notes/useNotes";
import { usePlayerCanon } from "@/composables/canon/usePlayerCanon";
import { useMyMemberId } from "@/composables/canon/useMyStory";
import { listedNotes } from "@/lib/notes/noteSessions";
import { useTableQuestionAnswers, useTableQuestions } from "@/composables/tableQuestions/useTableQuestions";
import { isWaitingOn } from "@/lib/tableQuestions/answers";
import { useAuthStore } from "@/stores/auth";

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
  kind: "quest" | "puzzle" | "handout" | "note" | "lore" | "chronicle" | "story";
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
  lore: readonly (Dated & { title: string })[] | undefined;
  /** Shared notes linked to a session: they are read in The World's Chronicle, not among DM Notes. */
  chronicle?: readonly (Dated & { title: string })[] | undefined;
  /** What the DM told this player of their own backstory (My story). */
  story?: readonly (Dated & { title: string })[] | undefined;
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
    ...(src.chronicle ?? [])
      .filter((n) => src.isNew.note(n.id, n.updated_at))
      .map((n): UnreadItem => ({ kind: "chronicle", id: n.id, title: n.title, updatedAt: n.updated_at, to: { name: "play-journal", query: { tab: "world" } } })),
    ...(src.lore ?? [])
      .filter((l) => src.isNew.lore(l.id, l.updated_at))
      .map((l): UnreadItem => ({ kind: "lore", id: l.id, title: l.title, updatedAt: l.updated_at, to: { name: "play-journal", query: { tab: "world" } } })),
    ...(src.story ?? [])
      .filter((b) => src.isNew.story(b.id, b.updated_at))
      .map((b): UnreadItem => ({ kind: "story", id: b.id, title: b.title, updatedAt: b.updated_at, to: { name: "play-journal", query: { tab: "story" } } })),
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
  const { data: allNotes } = usePlayerVisibleNotes();
  // A note linked to a session is a Chronicle entry in The World; the rest are DM Notes.
  const notes = computed(() => listedNotes(allNotes.value ?? []));
  const chronicle = computed(() => (allNotes.value ?? []).filter((n) => n.session_id !== null));
  const { data: noticeBoards } = usePlayerNoticeBoards();
  // Lore the player can read, dated by when it last grew for them (a new passage relights it, like a DM edit).
  const { world } = usePlayerCanon();
  const lore = computed(() => (world.value?.lore ?? []).map((l) => ({ id: l.entry.id, title: l.entry.title, updated_at: l.latestAt })));
  // My story: the player's own backstory grows for them when the DM tells them a passage (their own writing is never news).
  const myMemberId = useMyMemberId();
  const story = computed(() =>
    (world.value?.backstories ?? []).flatMap((b) =>
      b.memberId === myMemberId.value && b.latestDmAt !== null ? [{ id: b.entry.id, title: "Your story", updated_at: b.latestDmAt }] : [],
    ),
  );
  // One request for all the types (#999); they used to be four.
  const { isNew: isNewOfType } = useReadMarkers(["quest", "puzzle", "handout", "note", "notice_board", "canon_lore", "canon_backstory", "canon_told"]);
  const isQuestNew = (id: string, updatedAt?: string) => isNewOfType("quest", id, updatedAt);
  const isPuzzleNew = (id: string, updatedAt?: string) => isNewOfType("puzzle", id, updatedAt);
  const isHandoutNew = (id: string, updatedAt?: string) => isNewOfType("handout", id, updatedAt);
  const isNoteNew = (id: string, updatedAt?: string) => isNewOfType("note", id, updatedAt);
  const isLoreNew = (id: string, updatedAt?: string) => isNewOfType("canon_lore", id, updatedAt);
  const isStoryNew = (id: string, updatedAt?: string) => isNewOfType("canon_backstory", id, updatedAt);
  // A truth told to the party, or a secret revealed, is New until the World tab has shown it: the same marker and rule the tab's own dot uses (#1279 item 27).
  const told = computed(() => {
    const w = world.value;
    if (w === undefined) return [];
    return [...w.onlyMine, ...w.known, ...w.revealed].flatMap((e) => (e.revealed_at != null ? [{ id: e.id, updated_at: e.revealed_at }] : []));
  });
  const isToldNew = (id: string, updatedAt?: string) => isNewOfType("canon_told", id, updatedAt);
  const isNoticeBoardNew = (id: string, updatedAt?: string) => isNewOfType("notice_board", id, updatedAt);

  // The Hearth's "Your DM asks…": an open question this player has not answered (#1212).
  const auth = useAuthStore();
  // The same two reads the Hearth's own section makes (every question, then their
  // answers), so TanStack shares them: an open-only read here was one more request
  // on every player's first load (perf budgets, 16 Nov 2026). isWaitingOn skips
  // the closed ones.
  const { data: tableQuestions } = useTableQuestions();
  const questionIds = computed(() => (tableQuestions.value === undefined ? [] : tableQuestions.value.map((q) => q.id)));
  const { data: questionAnswers } = useTableQuestionAnswers(questionIds);
  // Until the answers arrive nothing counts as waiting: judged from a missing list,
  // every open question looks unanswered and the dot flashes on at each load.
  const waitingOnAnswer = computed(() => {
    const userId = auth.user?.id;
    const questions = tableQuestions.value;
    const answers = questionAnswers.value;
    if (!userId || !questions || questions.length === 0 || !answers) return false;
    return questions.some((q) => isWaitingOn(q, answers.filter((a) => a.question_id === q.id), userId));
  });

  const sections = computed(() => ({
    quests: anyUnread((quests.value ?? []).filter((q) => QUEST_LOG_STATUSES.includes(q.status)), isQuestNew),
    puzzles: anyUnread(puzzles.value, isPuzzleNew),
    handouts: anyUnread(handouts.value, isHandoutNew),
    dmNotes: anyUnread(notes.value, isNoteNew),
    // The RPC lists revealed boards only, so any new one is news for the player.
    noticeBoards: anyUnread(noticeBoards.value, isNoticeBoardNew),
    world: anyUnread(lore.value, isLoreNew) || anyUnread(chronicle.value, isNoteNew) || anyUnread(told.value, isToldNew),
    story: anyUnread(story.value, isStoryNew),
  }));

  /** The Journal tile in the nav: anything new in any of its sections. */
  const journal = computed(() => Object.values(sections.value).some(Boolean));

  /** Nav paths that carry a dot. Keyed by route so the nav needs no knowledge of sections. */
  const unreadPaths = computed(() => [
    ...(waitingOnAnswer.value ? ["/play"] : []),
    ...(journal.value ? ["/play/journal"] : []),
  ]);

  /** The unread things themselves, newest first (the Hearth's "new for you" list). */
  const items = computed(() =>
    collectUnreadItems({
      quests: quests.value,
      puzzles: puzzles.value,
      handouts: handouts.value,
      notes: notes.value,
      lore: lore.value,
      chronicle: chronicle.value,
      story: story.value,
      isNew: { quest: isQuestNew, puzzle: isPuzzleNew, handout: isHandoutNew, note: isNoteNew, lore: isLoreNew, chronicle: isNoteNew, story: isStoryNew },
    }),
  );

  return { sections, journal, unreadPaths, items, isNoticeBoardNew };
}
