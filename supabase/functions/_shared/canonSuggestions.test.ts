import { describe, expect, it } from "vitest";
import {
  MAX_CLUE_SUGGESTIONS,
  MAX_FORCE_STEPS,
  MAX_QUESTION_SUGGESTIONS,
  MAX_TRUTH_SUGGESTIONS,
  sanitizeClues,
  sanitizeForces,
  sanitizeLore,
  sanitizePremise,
  sanitizeQuestions,
  sanitizeTruths,
  type ForceWho,
  type KnowerCandidate,
  type SpotCandidate,
} from "./canonSuggestions";

const people: KnowerCandidate[] = [
  { kind: "npc", id: "n1", name: "Mara Voss" },
  { kind: "faction", id: "f1", name: "The Iron Concord" },
  { kind: "party_member", id: "p1", name: "Tilda" },
];

describe("sanitizePremise", () => {
  it("keeps line and veil proposals as private drafts for the DM to discuss with the table", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "line", text: "No harm to children" }, { kind: "veil", text: "War" }, { kind: "theme", text: "Mercy" }] }, []);
    expect(out.suggestions).toEqual([
      { kind: "line", text: "No harm to children" },
      { kind: "veil", text: "War" },
      { kind: "theme", text: "Mercy" },
    ]);
    expect(out.setAside).toEqual([]);
  });

  it("drops a kind the model invented", () => {
    expect(sanitizePremise({ suggestions: [{ kind: "plot", text: "x" }] }, []).suggestions).toEqual([]);
  });

  it("keeps one pitch, voice and look only, so an answer cannot offer two of a single-entry kind", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "pitch", text: "A" }, { kind: "pitch", text: "B" }, { kind: "theme", text: "C" }, { kind: "theme", text: "D" }] }, []);
    expect(out.suggestions.map((s) => s.text)).toEqual(["A", "C", "D"]);
  });

  it("drops what the campaign already holds, case and spacing aside", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "theme", text: "  kindness   is courage " }] }, [{ kind: "theme", text: "Kindness is courage" }]);
    expect(out.suggestions).toEqual([]);
  });

  it("trims and caps a long line", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "theme", text: ` ${"a".repeat(900)} ` }] }, []);
    expect(out.suggestions[0].text.length).toBe(300);
  });

  it("survives a non-object answer", () => {
    expect(sanitizePremise("nope", []).suggestions).toEqual([]);
  });
});

describe("sanitizeTruths", () => {
  it("matches a known_to name back to the real record, case insensitively", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "The bell tolls for the drowned", knowledge: "some", known_to: ["mara voss", "THE IRON CONCORD"] }] }, people, []);
    expect(out.suggestions[0].knowers).toEqual([people[0], people[1]]);
  });

  it("never turns an unknown name into a knower, and reports it", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Mara Voss", "Lord Nobody"] }] }, people, []);
    expect(out.suggestions[0].knowers).toEqual([people[0]]);
    expect(out.setAside.map((a) => a.claim)).toEqual(["Lord Nobody"]);
  });

  it("sets aside a 'some' truth with no real knower rather than offering a truth nobody knows", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Lord Nobody"] }, { title: "U", knowledge: "some" }] }, people, []);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside.some((a) => a.claim === "T")).toBe(true);
    expect(out.setAside.some((a) => a.claim === "U")).toBe(true);
  });

  it("gives an 'all' or 'secret' truth no knowers even if the model named some", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "A", knowledge: "all", known_to: ["Mara Voss"] }, { title: "B", knowledge: "secret", known_to: ["Tilda"] }] }, people, []);
    expect(out.suggestions.map((s) => s.knowers)).toEqual([[], []]);
  });

  it("drops a mark that is not all, some or secret", () => {
    expect(sanitizeTruths({ suggestions: [{ title: "A", knowledge: "most" }] }, people, []).suggestions).toEqual([]);
  });

  it("drops a truth the campaign already has", () => {
    expect(sanitizeTruths({ suggestions: [{ title: "the sea is salt", knowledge: "all" }] }, people, ["The sea is salt"]).suggestions).toEqual([]);
  });

  it("offers at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Truth ${i}`, knowledge: "all" }));
    expect(sanitizeTruths({ suggestions: many }, people, []).suggestions).toHaveLength(MAX_TRUTH_SUGGESTIONS);
  });

  it("names a knower once", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Tilda", "tilda"] }] }, people, []);
    expect(out.suggestions[0].knowers).toHaveLength(1);
  });
});

const spots: SpotCandidate[] = [
  { kind: "location", id: "l1", name: "The Drowned Chapel" },
  { kind: "npc", id: "n1", name: "Mara Voss" },
  { kind: "quest_beat", id: "b1", name: "The Ferry Crossing" },
  { kind: "location", id: "l2", name: "Saltgate" },
];
const at = (kind: string, name: string) => ({ kind, name });

describe("sanitizeClues", () => {
  it("matches a spot back to the real row, case insensitively", () => {
    const out = sanitizeClues({ suggestions: [{ title: "A wet footprint", at: at("location", "the drowned chapel") }] }, spots, new Set());
    expect(out.suggestions[0].spot).toEqual(spots[0]);
  });

  it("never places a clue at a name the campaign does not have, and reports it", () => {
    const out = sanitizeClues({ suggestions: [{ title: "C", at: at("location", "Nowhere Keep") }] }, spots, new Set());
    expect(out.suggestions).toEqual([]);
    expect(out.setAside).toHaveLength(1);
  });

  it("does not let a person's name stand for a place of the same name", () => {
    const out = sanitizeClues({ suggestions: [{ title: "C", at: at("npc", "Saltgate") }] }, spots, new Set());
    expect(out.suggestions).toEqual([]);
  });

  it("sets aside a clue at a spot this secret already uses", () => {
    const out = sanitizeClues({ suggestions: [{ title: "C", at: at("npc", "Mara Voss") }] }, spots, new Set(["npc|n1"]));
    expect(out.suggestions).toEqual([]);
    expect(out.setAside[0].reason).toContain("Mara Voss");
  });

  it("keeps one of two clues proposed at the same spot", () => {
    const out = sanitizeClues({ suggestions: [{ title: "A", at: at("location", "Saltgate") }, { title: "B", at: at("location", "Saltgate") }] }, spots, new Set());
    expect(out.suggestions.map((s) => s.title)).toEqual(["A"]);
  });

  it("offers at most three", () => {
    const out = sanitizeClues({ suggestions: spots.map((s, i) => ({ title: `C${i}`, at: at(s.kind, s.name) })) }, spots, new Set());
    expect(out.suggestions).toHaveLength(MAX_CLUE_SUGGESTIONS);
  });
});

describe("sanitizeQuestions", () => {
  it("drops a question the campaign already keeps, and a repeat inside the answer", () => {
    const out = sanitizeQuestions({ suggestions: [{ title: "who rang the bell?" }, { title: "Why is the sea warm?" }, { title: "why is the SEA warm?" }] }, ["Who rang the bell?"]);
    expect(out.suggestions).toEqual([{ title: "Why is the sea warm?" }]);
  });

  it("offers at most six", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ title: `Q${i}?` }));
    expect(sanitizeQuestions({ suggestions: many }, []).suggestions).toHaveLength(MAX_QUESTION_SUGGESTIONS);
  });
});

describe("sanitizeForces", () => {
  const whos: ForceWho[] = [{ kind: "faction", id: "f1", name: "The Iron Concord" }];
  const quests = [{ id: "q1", title: "The Salt Road" }];
  const force = { who: "the iron concord", wants: "The harbour", steps: ["a", "b", "c"], clock_size: 6, quests: ["The Salt Road"] };

  it("matches who to a real faction or person, and keeps a free-text name as written", () => {
    const out = sanitizeForces({ suggestions: [force, { ...force, who: "The Tide Cult" }] }, whos, quests, []);
    expect(out.suggestions[0].who).toEqual(whos[0]);
    expect(out.suggestions[1].who).toBeNull();
    expect(out.suggestions[1].title).toBe("The Tide Cult");
  });

  it("sets aside a quest that does not exist but keeps the force", () => {
    const out = sanitizeForces({ suggestions: [{ ...force, quests: ["The Salt Road", "Lost Quest"] }] }, whos, quests, []);
    expect(out.suggestions[0].quests).toEqual(quests);
    expect(out.setAside.map((a) => a.claim)).toEqual(["Lost Quest"]);
  });

  it("clamps a clock to what the database accepts", () => {
    const out = sanitizeForces({ suggestions: [{ ...force, clock_size: 40 }, { ...force, who: "B", clock_size: 0 }] }, whos, quests, []);
    expect(out.suggestions.map((s) => s.clockSize)).toEqual([12, 2]);
  });

  it("sets aside a force with no readable clock", () => {
    const out = sanitizeForces({ suggestions: [{ ...force, clock_size: "six" }] }, whos, quests, []);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside).toHaveLength(1);
  });

  it("trims steps, drops empties and caps at five", () => {
    const steps = ["  one ", "", "   ", "two", "three", "four", "five", "six", "seven"];
    const out = sanitizeForces({ suggestions: [{ ...force, steps }] }, whos, quests, []);
    expect(out.suggestions[0].steps).toEqual(["one", "two", "three", "four", "five"]);
    expect(out.suggestions[0].steps).toHaveLength(MAX_FORCE_STEPS);
  });

  it("sets aside a force with no steps", () => {
    expect(sanitizeForces({ suggestions: [{ ...force, steps: [" "] }] }, whos, quests, []).suggestions).toEqual([]);
  });

  it("drops a force the campaign already has", () => {
    expect(sanitizeForces({ suggestions: [force] }, whos, quests, ["The Iron Concord"]).suggestions).toEqual([]);
  });
});

describe("sanitizeLore", () => {
  const answer = {
    title: "The Sinking",
    kind: "legend",
    passages: [
      { title: "What all know", text: "The city went under.", at: at("location", "Saltgate") },
      { title: "What priests know", text: "A bell rang.", at: at("npc", "mara voss") },
      { title: "What none know", text: "It was chosen.", at: at("npc", "Lord Nobody") },
    ],
  };
  const requested = { title: "", kind: null };

  it("never places the first passage, which is told with the entry", () => {
    expect(sanitizeLore(answer, spots, [], requested).suggestions[0].passages[0].spot).toBeNull();
  });

  it("matches a later passage's place to a real row, and leaves an unknown one unplaced and reported", () => {
    const out = sanitizeLore(answer, spots, [], requested);
    expect(out.suggestions[0].passages.map((p) => p.spot?.id ?? null)).toEqual([null, "n1", null]);
    expect(out.setAside.map((a) => a.claim)).toEqual(["Lord Nobody"]);
  });

  it("needs at least one passage with words", () => {
    expect(sanitizeLore({ title: "T", passages: [{ title: "h", text: "  " }] }, spots, [], requested).suggestions).toEqual([]);
  });

  it("drops a title the campaign already has", () => {
    expect(sanitizeLore(answer, spots, ["the sinking"], requested).suggestions).toEqual([]);
  });

  it("keeps the DM's title and kind over the model's", () => {
    const out = sanitizeLore(answer, spots, [], { title: "My Title", kind: "history" });
    expect(out.suggestions[0]).toMatchObject({ title: "My Title", kind: "history" });
  });

  it("falls back to the model's kind only when it is a real one", () => {
    expect(sanitizeLore(answer, spots, [], requested).suggestions[0].kind).toBe("legend");
    expect(sanitizeLore({ ...answer, kind: "lies" }, spots, [], requested).suggestions[0].kind).toBeNull();
  });

  it("caps the passages at five and each body", () => {
    const passages = Array.from({ length: 8 }, (_, i) => ({ title: `P${i}`, text: "x".repeat(3000) }));
    const out = sanitizeLore({ title: "T", passages }, spots, [], requested);
    expect(out.suggestions[0].passages).toHaveLength(5);
    expect(out.suggestions[0].passages[0].body.length).toBe(1500);
  });
});
