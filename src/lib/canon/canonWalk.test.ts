import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CanonSuggestionMode } from "@/ai/useCanonSuggestions";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { WALK_SKIPPABLE, followUpOf, isThin, WALK_STEPS, draftHeldBecause, firstOpenStep, invitesWalk, membersNoted, questionOf, walkScope, walkStops, walkSteps, type WalkInput, type WalkStepId } from "./canonWalk";

const entry = (over: Partial<CanonEntry>): CanonEntry => ({ id: "e", part: "truth", premise_kind: null, title: "", body: null, party_member_id: null, ...over }) as CanonEntry;
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const pitch = entry({ id: "p", part: "premise", premise_kind: "pitch", body: doc("A drowned kingdom") });
const input = (over: Partial<WalkInput> = {}): WalkInput => ({
  entries: [], clues: [], arcCount: 0, peopleCount: 0, speciesCount: 0, habitatCount: 0, party: [], notedIds: new Set(), skipped: new Set(), ...over,
});
const stateOf = (id: WalkStepId, i: WalkInput) => walkSteps(i).find((s) => s.id === id)?.state;

describe("walkSteps", () => {
  // Bug caught: a pitch created empty by "Write the pitch" counting as written, so the walk moves past it.
  it("fills the pitch only when its body has words", () => {
    expect(stateOf("pitch", input({ entries: [entry({ ...pitch, body: null })] }))).toBe("todo");
    expect(stateOf("pitch", input({ entries: [pitch] }))).toBe("filled");
  });

  // Bug caught: a premise field saved blank (an autosave of an emptied field) filling its step.
  it("fills a premise field only when it has words, and only its own kind", () => {
    const voice = entry({ id: "v", part: "premise", premise_kind: "voice", title: "  " });
    expect(stateOf("voice", input({ entries: [voice] }))).toBe("todo");
    expect(stateOf("voice", input({ entries: [{ ...voice, title: "Dry and warm" }] }))).toBe("filled");
    expect(stateOf("look", input({ entries: [{ ...voice, title: "Dry and warm" }] }))).toBe("todo");
    // A veil alone fills "Lines and veils".
    expect(stateOf("lines", input({ entries: [entry({ part: "premise", premise_kind: "veil", title: "No harm to children" })] }))).toBe("filled");
  });

  // Bug caught: a secret with no clue (or another secret's clue) filling "Secrets, with clues".
  it("fills secrets only with a secret that has a clue of its own", () => {
    const secret = entry({ id: "s", part: "secret" });
    expect(stateOf("secrets", input({ entries: [secret] }))).toBe("todo");
    expect(stateOf("secrets", input({ entries: [secret], clues: [{ secret_id: "other" } as CanonClue] }))).toBe("todo");
    expect(stateOf("secrets", input({ entries: [secret], clues: [{ secret_id: "s" } as CanonClue] }))).toBe("filled");
  });

  // Bug caught: one character's notes filling the step for a party of three, an empty party filling it, or a backstory
  // entry with nobody's notes in it (what the old rule counted) filling it.
  it("fills backstories only when every character has the DM's notes", () => {
    const party = [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }];
    const back = entry({ id: "ba", part: "backstory", party_member_id: "a" });
    expect(stateOf("backstories", input())).toBe("todo");
    expect(stateOf("backstories", input({ party, entries: [back] }))).toBe("todo");
    expect(stateOf("backstories", input({ party, notedIds: new Set(["a"]) }))).toBe("todo");
    expect(stateOf("backstories", input({ party, notedIds: new Set(["a", "b"]) }))).toBe("filled");
  });

  // Bug caught: the arcs, peoples and habitats (kept outside canon_entries) never counting, so the walk nags for ever.
  it("reads the arcs, peoples, species and habitats from their own counts", () => {
    const filled = walkSteps(input({ arcCount: 1, peopleCount: 2, speciesCount: 3, habitatCount: 1 }));
    expect(filled.filter((s) => ["arcs", "peoples", "species", "habitats"].includes(s.id)).map((s) => s.state)).toEqual(["filled", "filled", "filled", "filled"]);
  });

  // Bug caught: a skip hiding a section the DM later wrote, or the pitch being skippable through a stale row.
  it("lets a written section win over its skip, and never skips the pitch", () => {
    const skipped = new Set<WalkStepId>(["truths", "pitch"]);
    expect(stateOf("truths", input({ skipped }))).toBe("skipped");
    expect(stateOf("truths", input({ skipped, entries: [entry({ part: "truth" })] }))).toBe("filled");
    expect(stateOf("pitch", input({ skipped }))).toBe("todo");
  });
});

describe("firstOpenStep", () => {
  // Bug caught: the walk resuming on a skipped step, or at the top instead of the first gap.
  it("resumes at the first step still to do, past filled and skipped ones", () => {
    expect(firstOpenStep(walkSteps(input()))).toBe("pitch");
    const themes = entry({ part: "premise", premise_kind: "theme", title: "Kindness" });
    expect(firstOpenStep(walkSteps(input({ entries: [pitch, themes], skipped: new Set(["table"]) })))).toBe("voice");
    const all = new Set(WALK_SKIPPABLE);
    expect(firstOpenStep(walkSteps(input({ entries: [pitch], skipped: all })))).toBeNull();
  });
});

describe("draftHeldBecause", () => {
  // Bug caught: a draft offered before the pitch (written cold), or on a part the Familiar has no mode for.
  it("holds drafts until the pitch, and always where there is no helper", () => {
    const steps = walkSteps(input());
    const step = (id: WalkStepId) => steps.find((s) => s.id === id)!;
    expect(draftHeldBecause(step("truths"), false, true)).toMatch(/pitch first/);
    expect(draftHeldBecause(step("truths"), true, true)).toBeNull();
    expect(draftHeldBecause(step("arcs"), true, true)).toBeNull();
  });

  // Bug caught: a habitat drafted before any species exists (it can only invent what lives there), or the hold leaking
  // onto the Field guide itself, which is what fills the guide in the first place.
  it("holds a habitat draft until the field guide has a species, and offers it after", () => {
    const steps = walkSteps(input());
    const step = (id: WalkStepId) => steps.find((s) => s.id === id)!;
    expect(draftHeldBecause(step("habitats"), true, false)).toBe("Fill the Field guide first: a habitat is drafted from its species.");
    expect(draftHeldBecause(step("habitats"), true, true)).toBeNull();
    expect(draftHeldBecause(step("species"), true, false)).toBeNull();
  });

  // Bug caught: the Field guide stepped in the wrong place (after habitats, whose draft needs its species), or one
  // species not filling it.
  it("walks the Field guide between the peoples and the habitats, filled by one species", () => {
    const ids = WALK_STEPS.map((s) => s.id);
    expect(ids.indexOf("species")).toBe(ids.indexOf("peoples") + 1);
    expect(ids.indexOf("habitats")).toBe(ids.indexOf("species") + 1);
    expect(stateOf("species", input())).toBe("todo");
    expect(stateOf("species", input({ speciesCount: 1 }))).toBe("filled");
    expect(walkSteps(input()).find((s) => s.id === "species")).toMatchObject({ chapter: "species", draft: { mode: "species" }, canWrite: true });
  });

  // Bug caught: the pitch held "until the pitch is written" (a draft that could never be offered), so the DM's two
  // sentences could not be written out as a pitch, which is the first thing the wizard is for.
  it("offers the pitch's own draft before any pitch exists, and only the pitch's", () => {
    const steps = walkSteps(input());
    const step = (id: WalkStepId) => steps.find((s) => s.id === id)!;
    expect(draftHeldBecause(step("pitch"), false, true)).toBeNull();
    expect(draftHeldBecause(step("themes"), false, true)).toMatch(/pitch first/);
  });
});

describe("the drafts", () => {
  // Bug caught: a step naming a helper the suggestion composable does not have (typed here, so the compiler refuses it),
  // or a premise step drafting every premise kind instead of its own (kinds missing).
  it("each names a real helper, and only the premise steps choose kinds", () => {
    const modes: CanonSuggestionMode[] = WALK_STEPS.flatMap((s) => (s.draft ? [s.draft.mode] : []));
    expect(modes).toHaveLength(WALK_STEPS.filter((s) => s.draft !== null).length);
    for (const s of WALK_STEPS) {
      if (s.draft === null) continue;
      expect([s.id, "kinds" in s.draft]).toEqual([s.id, s.draft.mode === "premise"]);
    }
  });

  // Bug caught: "Lines and veils" drafting only lines, so a veil is never suggested.
  it("lines draft both lines and veils", () => {
    const draft = WALK_STEPS.find((s) => s.id === "lines")?.draft;
    expect(draft && "kinds" in draft ? draft.kinds : null).toEqual(["line", "veil"]);
  });
});

describe("walkStops", () => {
  const party = [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }];
  const stops = (over: Partial<WalkInput> = {}) => {
    const i = input({ party, ...over });
    return walkStops(walkSteps(i), party, i.notedIds);
  };

  // Bug caught: the backstories being one stop for the party, so a second character is never asked about.
  it("makes one backstory stop per character, in the step's place", () => {
    const all = stops();
    expect(all.filter((s) => s.step === "backstories").map((s) => s.memberName)).toEqual(["Ada", "Bo"]);
    expect(all.at(-1)?.step).toBe("backstories");
    expect(all.filter((s) => s.step === "pitch")).toHaveLength(1);
  });

  // Bug caught: a character with notes asked about again, or one without notes taken as done.
  it("fills a character's stop from their own notes", () => {
    const state = (id: string, i: Partial<WalkInput>) => stops(i).find((s) => s.memberId === id)?.state;
    expect(state("a", { notedIds: new Set(["a"]) })).toBe("filled");
    expect(state("b", { notedIds: new Set(["a"]) })).toBe("todo");
  });

  // Bug caught: skipping the backstories leaving every character to be asked, or hiding a character who has notes.
  it("skips every character without notes when the backstories are skipped", () => {
    const skipped = new Set<WalkStepId>(["backstories"]);
    const state = (id: string) => stops({ skipped, notedIds: new Set(["a"]) }).find((s) => s.memberId === id)?.state;
    expect(state("b")).toBe("skipped");
    expect(state("a")).toBe("filled");
  });

  // Bug caught: a party of none leaving a stop with no one to ask about.
  it("has no backstory stop for an empty party", () => {
    const i = input();
    expect(walkStops(walkSteps(i), [], i.notedIds).some((s) => s.step === "backstories")).toBe(false);
  });
});

describe("membersNoted", () => {
  const back = (id: string, member: string) => entry({ id, part: "backstory", party_member_id: member });

  // Bug caught: a player's own passage counting as the DM's notes, or another passage on someone else's entry.
  it("counts only passages the signed-in user wrote, on that character's entry", () => {
    const entries = [back("ea", "a"), back("eb", "b")];
    const passages = [{ entry_id: "ea", author_id: "player" }, { entry_id: "eb", author_id: "dm" }];
    expect([...membersNoted(entries, passages, "dm")]).toEqual(["b"]);
  });

  // Bug caught: a signed-out read matching passages whose author is null (an erased account).
  it("counts nothing with no signed-in user", () => {
    expect(membersNoted([back("ea", "a")], [{ entry_id: "ea", author_id: null }], null).size).toBe(0);
  });
});

describe("questionOf and walkScope", () => {
  // Bug caught: the backstory question going out with its {name} placeholder showing.
  it("names the character in the backstory question", () => {
    expect(questionOf({ step: "backstories", memberId: "a", memberName: "Ada" })).toContain("Ada");
    expect(questionOf({ step: "backstories", memberId: "a", memberName: "Ada" })).not.toContain("{name}");
  });

  // Bug caught: two characters' drafts sharing one proposal key, so the second overwrites the first.
  it("keeps each character's proposals under their own scope", () => {
    expect(walkScope({ step: "backstories", memberId: "a", memberName: "Ada" })).not.toBe(walkScope({ step: "backstories", memberId: "b", memberName: "Bo" }));
  });

  // Bug caught (live run, 26 Nov 2026): the Themes draft showing in the Pitch's block too, because the six premise steps
  // share the premise helper and every one of them reviewed it under the one key.
  it("keeps each section's proposals under its own scope, the premise sections too", () => {
    const section = (step: WalkStepId) => walkScope({ step, memberId: null, memberName: null });
    expect(section("pitch")).not.toBe(section("themes"));
    expect(section("themes")).not.toBe(section("voice"));
  });
});

describe("invitesWalk", () => {
  // Bug caught: an established canon with no pitch never being asked for one (the gap #1282 was opened over).
  it("invites while the pitch is empty, however big the canon", () => {
    const big = Array.from({ length: 12 }, (_, i) => entry({ id: `t${i}`, part: "truth" }));
    expect(invitesWalk(big, walkSteps(input({ entries: big })))).toBe(true);
    const withPitch = [...big, pitch];
    expect(invitesWalk(withPitch, walkSteps(input({ entries: withPitch })))).toBe(false);
    expect(invitesWalk([pitch], walkSteps(input({ entries: [pitch] })))).toBe(true);
  });
});

describe("the skippable sections", () => {
  // Bug caught: a step added here that the database's check refuses, so Skip fails with a 23514 at the table.
  it("match the canon_walk_skips check in the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20261127065537_canon_walk_field_guide.sql"), "utf8");
    const check = /canon_walk_skips_section check \(section in \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const listed = [...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...WALK_SKIPPABLE].sort());
  });
});

describe("isThin and followUpOf (#1282)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  // Bug caught: the boundary off by one: fourteen words are thin, fifteen are enough (app convention, epic #1282).
  it.each([[0, true], [1, true], [14, true], [15, false], [40, false]])("%i words: thin is %s", (n, thin) => {
    expect(isThin(words(n))).toBe(thin);
  });

  // Bug caught: padding counted as words, so spaces and newlines make a thin answer look full.
  it("counts words, not spaces", () => {
    expect(isThin(`  ${words(5)}  \n\n   `)).toBe(true);
    expect(isThin(words(15).replaceAll(" ", "\n"))).toBe(false);
  });

  // Bug caught: the backstory follow-up going out with its {name} placeholder showing.
  it("names the character in the backstory follow-up", () => {
    const text = followUpOf({ step: "backstories", memberId: "a", memberName: "Ada" });
    expect(text).toContain("Ada");
    expect(text).not.toContain("{name}");
  });

  // Bug caught: a step with no follow-up (blank text) so the Familiar asks an empty question.
  it("gives every step a follow-up, and no question that sets a low bar", () => {
    for (const s of WALK_STEPS) {
      expect(s.followUp.trim(), s.id).not.toBe("");
      expect(`${s.question} ${s.followUp}`, s.id).not.toMatch(/plenty|is enough|a few words/i);
    }
  });
});
