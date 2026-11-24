import { describe, expect, it } from "vitest";
import { canonThisSession, sessionCanonText } from "./canonSession";
import { canonEntry } from "@/test/canonEntry";
import type { CanonClue, CanonForceStep, CanonForceTick, CanonLorePassage } from "@/types/canon.types";

const session = { id: "s1", started_at: null, played_on: "2026-11-14", created_at: "2026-11-14T10:00:00Z" };
const at = "2026-11-14T20:00:00Z";

const clue = (over: Partial<CanonClue>): CanonClue => ({
  id: "c", user_id: "u", campaign_id: "c1", secret_id: "sec1", title: "A torn ledger", sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  item_id: null, document_id: null, found_at: at, found_session_id: "s1", passage_id: null, ai_provenance: null, created_at: at, updated_at: at, ...over,
});
const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({
  id: "p", user_id: "u", campaign_id: "c1", entry_id: "lore1", title: "The first toll", body: null, sort_order: 1, player_visible_to: [], told_at: at,
  told_session_id: "s1", location_id: null, npc_id: null, quest_beat_id: null, author_id: null, ai_provenance: null, created_at: at, updated_at: at, ...over,
});
const step = (over: Partial<CanonForceStep>): CanonForceStep => ({
  id: "st", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The ferry stops", sort_order: 0, reached_at: at, reached_session_id: "s1",
  due_year: null, due_month: null, due_day: null, ai_provenance: null, created_at: at, updated_at: at, ...over,
});
const tick = (over: Partial<CanonForceTick>): CanonForceTick => ({
  id: "t", user_id: "u", campaign_id: "c1", force_id: "f1", delta: 1, note: "the toll is refused", session_id: "s1", step_id: null,
  world_year: null, world_month: null, world_day: null, created_at: at, ...over,
});
const entries = [
  canonEntry({ id: "sec1", part: "secret", title: "Who owns the ferry", revealed_at: at, revealed_session_id: "s1" }),
  canonEntry({ id: "lore1", part: "lore", title: "The roads" }),
  canonEntry({ id: "f1", part: "force", title: "The Ferrymen" }),
  canonEntry({ id: "q1", part: "question", title: "Who rang the bell?", closed_as: "answered", closed_at: at }),
];
const all = { session, entries, clues: [clue({})], passages: [passage({})], steps: [step({})], ticks: [tick({})] };

describe("canonThisSession", () => {
  // Bug caught: a kind of change left out of the list (each is read from a different column on a different table).
  it("lists each kind: clues found, passages told, secrets revealed, steps reached, clock moves and questions answered", () => {
    const { groups, total } = canonThisSession(all);
    expect(groups.map((g) => [g.kind, g.items.map((i) => i.title)])).toEqual([
      ["clues", ["A torn ledger"]],
      ["passages", ["The first toll"]],
      ["secrets", ["Who owns the ferry"]],
      ["steps", ["The Ferrymen: The ferry stops"]],
      ["ticks", ["The Ferrymen: the toll is refused"]],
      ["questions", ["Who rang the bell?"]],
    ]);
    expect(total).toBe(6);
  });

  // Bug caught: another session's finds shown under this one (the session id compared against the wrong column or not at all).
  it("ignores what another session did, and what was never marked for this one", () => {
    const { total } = canonThisSession({
      ...all,
      clues: [clue({ found_session_id: "s2" }), clue({ id: "c2", found_session_id: null, found_at: null })],
      passages: [passage({ told_session_id: "s2" })],
      steps: [step({ reached_session_id: "s2" })],
      ticks: [tick({ session_id: "s2" })],
      entries: entries.map((e) => (e.part === "secret" ? { ...e, revealed_session_id: "s2" } : e)).filter((e) => e.part !== "question"),
    });
    expect(total).toBe(0);
  });

  // Bug caught: the tick that reaching a step writes counted as a second change beside the step.
  it("lists a reached step once, not again as the tick it wrote", () => {
    const { groups } = canonThisSession({ ...all, ticks: [tick({ step_id: "st", note: "Reached: The ferry stops" })] });
    expect(groups.map((g) => g.kind)).not.toContain("ticks");
  });

  // Bug caught: a question answered on another day shown here, because it has no session id and was matched loosely.
  it("matches an answered question to the session by the day, and not one answered on another day or left open", () => {
    const other = [
      canonEntry({ id: "q2", part: "question", closed_as: "answered", closed_at: "2026-11-15T09:00:00Z" }),
      canonEntry({ id: "q3", part: "question", closed_as: null, closed_at: null }),
    ];
    expect(canonThisSession({ ...all, entries: other, clues: [], passages: [], steps: [], ticks: [] }).total).toBe(0);
  });

  // Bug caught: every item leading nowhere, or to a clue's id (which is not an entry) instead of its secret.
  it("links each item to the canon entry it belongs to", () => {
    const tos = canonThisSession(all).groups.map((g) => g.items[0].to.query.entry);
    expect(tos).toEqual(["sec1", "lore1", "sec1", "f1", "f1", "q1"]);
  });
});

describe("sessionCanonText", () => {
  // Bug caught: the Chronicler told there was canon this session when nothing changed.
  it("is empty when nothing changed", () => {
    expect(sessionCanonText({ groups: [], total: 0 })).toBe("");
  });

  // Bug caught: a kind or its titles missing from what the Chronicler reads.
  it("names each kind and its titles", () => {
    const text = sessionCanonText(canonThisSession(all));
    expect(text).toContain("- Clues found: A torn ledger");
    expect(text).toContain("- Secrets revealed: Who owns the ferry");
    expect(text).toContain("- Questions answered: Who rang the bell?");
  });
});
