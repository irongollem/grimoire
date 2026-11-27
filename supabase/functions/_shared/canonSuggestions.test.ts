import { describe, expect, it } from "vitest";
import { ABUNDANCES, ACTIVITIES, KINGDOMS, LINK_KINDS, LIVES_AS } from "@/lib/canon/ecologyTypes";
import {
  MAX_CLUE_SUGGESTIONS,
  MAX_FORCE_STEPS,
  MAX_QUESTION_SUGGESTIONS,
  MAX_TRUTH_SUGGESTIONS,
  readPremiseKinds,
  sanitizeArcs,
  sanitizeBackstory,
  sanitizePeoples,
  sanitizeClues,
  sanitizeForces,
  sanitizeHabitats,
  sanitizeSpecies,
  SPECIES_ACTIVITIES,
  SPECIES_KINGDOMS,
  SPECIES_LINK_KINDS,
  SPECIES_LIVES_AS,
  HABITAT_ABUNDANCES,
  sanitizeLore,
  sanitizePremise,
  sanitizeQuestions,
  sanitizeSecrets,
  MAX_SECRET_CLUES,
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

describe("sanitizeSecrets", () => {
  const spots: SpotCandidate[] = [
    { kind: "location", id: "l1", name: "Mint Fields" },
    { kind: "npc", id: "n1", name: "Sift" },
    { kind: "quest_beat", id: "b1", name: "The ferry" },
  ];
  const clue = (title: string, at: unknown) => ({ title, at });

  it("keeps a secret with three clues placed on real ids", () => {
    const out = sanitizeSecrets({ suggestions: [{ title: "The guildmaster is dead", clues: [
      clue("A grave", { kind: "location", id: "l1" }), clue("A letter", { kind: "npc", id: "n1" }), clue("A ticket", { kind: "quest_beat", id: "b1" }),
    ] }] }, spots, []);
    expect(out.suggestions).toEqual([{ title: "The guildmaster is dead", clues: [
      { title: "A grave", spot: spots[0] }, { title: "A letter", spot: spots[1] }, { title: "A ticket", spot: spots[2] },
    ] }]);
  });

  // Bug caught: an id the model invented (or took from another campaign) became a reference, or failed the whole answer.
  it("drops an unknown id and keeps the clue unplaced, not the answer failed", () => {
    const out = sanitizeSecrets({ suggestions: [{ title: "S", clues: [
      clue("Elsewhere", { kind: "location", id: "from-another-campaign" }), clue("Kind mismatch", { kind: "npc", id: "l1" }), clue("Fine", { kind: "npc", id: "n1" }),
    ] }] }, spots, []);
    expect(out.suggestions[0].clues).toEqual([
      { title: "Elsewhere", spot: null }, { title: "Kind mismatch", spot: null }, { title: "Fine", spot: spots[1] },
    ]);
  });

  // Bug caught: two clues of one secret lay at one place, which "Place clues" already refuses.
  it("leaves a second clue at the same place unplaced", () => {
    const out = sanitizeSecrets({ suggestions: [{ title: "S", clues: [clue("One", { kind: "npc", id: "n1" }), clue("Two", { kind: "npc", id: "n1" })] }] }, spots, []);
    expect(out.suggestions[0].clues.map((c) => c.spot?.id ?? null)).toEqual(["n1", null]);
  });

  // Bug caught: more than three clues came through, so an accept wrote an unbounded number of rows.
  it("caps the clues of a secret", () => {
    const many = Array.from({ length: 6 }, (_, i) => clue(`C${i}`, null));
    expect(sanitizeSecrets({ suggestions: [{ title: "S", clues: many }] }, spots, []).suggestions[0].clues).toHaveLength(MAX_SECRET_CLUES);
  });

  // Bug caught: a secret with no clue was offered, which is exactly the loose end "Read it through" reports.
  it("sets aside a secret with no readable clue, and skips one the campaign already has", () => {
    const out = sanitizeSecrets({ suggestions: [
      { title: "No clues", clues: [{ title: "  " }] }, { title: "Known", clues: [clue("c", null)] }, { title: "Fresh", clues: [clue("c", null)] },
    ] }, spots, ["known"]);
    expect(out.suggestions.map((s) => s.title)).toEqual(["Fresh"]);
    expect(out.setAside).toEqual([{ claim: "No clues", reason: expect.stringContaining("no clues") }]);
  });
});

describe("premise by section (#1282)", () => {
  // Bug caught: "Enhance with AI" on the themes section also wrote a pitch and a voice the DM never asked to change.
  it("keeps only the kinds asked for, whatever else the model wrote", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "theme", text: "Mercy" }, { kind: "pitch", text: "A pitch" }, { kind: "voice", text: "Dry" }] }, [], ["theme"]);
    expect(out.suggestions).toEqual([{ kind: "theme", text: "Mercy" }]);
  });

  // Bug caught: a narrowing that is not a list of real kinds (empty, a string, a made-up kind) was accepted and widened to the whole starter.
  it.each([[[]], ["theme"], [["theme", "plot"]], [[1]]])("refuses kinds %j", (kinds) => {
    expect(readPremiseKinds(kinds)).toEqual({ ok: false });
  });

  it("reads absent kinds as the whole starter and drops a repeated kind", () => {
    expect(readPremiseKinds(undefined)).toEqual({ ok: true, kinds: null });
    expect(readPremiseKinds(["theme", "theme", "voice"])).toEqual({ ok: true, kinds: ["theme", "voice"] });
  });
});

describe("sanitizePremise, in sections", () => {
  // Bug caught: a walk draft of the pitch keeping only the first version, so the DM had nothing to choose between
  // (maintainer, 26 Nov 2026: "the first closer to what they typed, the remaining slots a bit more creative").
  it("keeps up to three versions of a pitch when drafting by section, and one for the whole starter", () => {
    const versions = { suggestions: ["One.", "Two.", "Three.", "Four."].map((text) => ({ kind: "pitch", text })) };
    expect(sanitizePremise(versions, [], ["pitch"]).suggestions.map((s) => s.text)).toEqual(["One.", "Two.", "Three."]);
    expect(sanitizePremise(versions, []).suggestions.filter((s) => s.kind === "pitch")).toHaveLength(1);
  });
});

describe("sanitizeArcs", () => {
  const themes = [{ id: "t1", text: "Mercy" }];

  // Bug caught: an invented theme id became a tie the database refuses (or, worse, a tie to a row of another campaign).
  it("keeps the arc but drops a theme id it was not given", () => {
    const out = sanitizeArcs({ suggestions: [{ name: "The Thaw", summary: "Winter ends", theme_id: "t1" }, { name: "The Frost", summary: "Winter stays", theme_id: "elsewhere" }] }, themes, []);
    expect(out.suggestions.map((a) => [a.name, a.themeId])).toEqual([["The Thaw", "t1"], ["The Frost", null]]);
  });

  // Bug caught: an arc the campaign already has was proposed again, so accepting made a twin.
  it("skips a name the campaign already has, case aside, and one repeated in the answer", () => {
    const out = sanitizeArcs({ suggestions: [{ name: "the thaw", summary: "x" }, { name: "New", summary: "x" }, { name: "NEW", summary: "y" }] }, themes, ["The Thaw"]);
    expect(out.suggestions.map((a) => a.name)).toEqual(["New"]);
  });

  // Bug caught: the name's 80-character limit was not held, so the arc could not be written.
  it("cuts a name to 80 characters and keeps six arcs at most", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `${i}${"n".repeat(100)}`, summary: "s" }));
    const out = sanitizeArcs({ suggestions: many }, themes, []);
    expect(out.suggestions).toHaveLength(6);
    expect(out.suggestions[0]!.name).toHaveLength(80);
  });

  // Bug caught: an arc with no summary or no name was offered as an empty card.
  it("drops an arc with no name or no summary", () => {
    expect(sanitizeArcs({ suggestions: [{ name: "", summary: "x" }, { name: "A", summary: " " }] }, themes, []).suggestions).toEqual([]);
  });
});

describe("sanitizePeoples", () => {
  const candidates = [
    { kind: "species" as const, id: "s-own", name: "Vell" },
    { kind: "library_species" as const, id: "lib-elf", name: "Elf" },
    { kind: "library_species" as const, id: "lib-orc", name: "Orc" },
  ];

  // Bug caught: the model's invented id, or a real id under the wrong kind, was written as a people.
  it("sets aside an id that is not a candidate, or is one under the other kind", () => {
    const out = sanitizePeoples({ suggestions: [
      { kind: "species", record_id: "nope", percent: 10 },
      { kind: "library_species", record_id: "s-own", percent: 10 },
      { kind: "library_species", record_id: "lib-elf", percent: 10 },
    ] }, candidates, []);
    expect(out.suggestions.map((p) => p.recordId)).toEqual(["lib-elf"]);
    expect(out.setAside).toHaveLength(2);
    expect(out.setAside[0]!.reason).toContain("not a species");
  });

  // Bug caught: a record already listed was proposed again (the table refuses it unless it has its own name).
  it("sets aside a record and name already listed, but offers the same record under a new culture name", () => {
    const listed = [{ kind: "library_species", recordId: "lib-elf", name: null, percent: 20 }];
    const out = sanitizePeoples({ suggestions: [
      { kind: "library_species", record_id: "lib-elf", percent: 10 },
      { kind: "library_species", record_id: "lib-elf", name: "The Vael", percent: 10 },
    ] }, candidates, listed);
    expect(out.suggestions.map((p) => p.name)).toEqual(["The Vael"]);
    expect(out.setAside[0]!.reason).toBe("this people is already listed");
  });

  // Bug caught: shares past 100 reached the database, whose commit-time check then failed the accept.
  it("keeps the shares to 100 with what is listed, setting aside the last ones that do not fit", () => {
    const listed = [{ kind: "monster", recordId: "m1", name: null, percent: 50 }];
    const out = sanitizePeoples({ suggestions: [
      { kind: "species", record_id: "s-own", percent: 30 },
      { kind: "library_species", record_id: "lib-elf", percent: 20 },
      { kind: "library_species", record_id: "lib-orc", percent: 1 },
    ] }, candidates, listed);
    expect(out.suggestions.map((p) => p.percent)).toEqual([30, 20]);
    expect(out.setAside).toEqual([{ claim: "Orc", reason: "its 1% would take the peoples past 100%" }]);
  });

  // Bug caught: a share of 0, a negative or a non-number was written as a people with no weight.
  it("skips a share outside 1 to 100", () => {
    const out = sanitizePeoples({ suggestions: [
      { kind: "species", record_id: "s-own", percent: 0 },
      { kind: "species", record_id: "s-own", percent: 101 },
      { kind: "species", record_id: "s-own", percent: "40" },
    ] }, candidates, []);
    expect(out.suggestions).toEqual([]);
  });
});

describe("sanitizeBackstory", () => {
  // Bug caught: a passage the backstory already has, or one with no words, was offered again.
  it("skips a repeated title and a passage with no body, and keeps five at most", () => {
    const out = sanitizeBackstory({ suggestions: [
      { title: "The fire", body: "x" },
      { title: "A", body: "a" }, { title: "B", body: "b" }, { title: "", body: "c" }, { title: "C", body: " " }, { title: "D", body: "d" }, { title: "E", body: "e" },
      { title: "F", body: "f" }, { title: "G", body: "g" },
    ] }, ["the fire"]);
    expect(out.suggestions.map((p) => p.title)).toEqual(["A", "B", "D", "E", "F"]);
  });

  // Bug caught: paragraphs were flattened into one line.
  it("keeps the paragraph breaks of a body", () => {
    expect(sanitizeBackstory({ suggestions: [{ title: "T", body: "One.\n\nTwo." }] }, []).suggestions[0]!.body).toBe("One.\n\nTwo.");
  });
});

describe("the field guide's closed lists", () => {
  // Bug caught: a list here drifted from the database check, so a proposal passed the sanitizer and the write was refused.
  it("equal the client's (and so the database's) lists", () => {
    expect([...SPECIES_KINGDOMS]).toEqual([...KINGDOMS]);
    expect([...SPECIES_ACTIVITIES]).toEqual([...ACTIVITIES]);
    expect([...SPECIES_LINK_KINDS]).toEqual([...LINK_KINDS]);
    expect([...SPECIES_LIVES_AS].sort()).toEqual([...LIVES_AS].sort());
    expect([...HABITAT_ABUNDANCES].sort()).toEqual([...ABUNDANCES].sort());
  });
});

describe("sanitizeSpecies", () => {
  const guide = [{ id: "sp-fox", name: "Red Fox" }];
  const clades = [{ id: "cl-canid", name: "Canids" }];
  const run = (suggestions: unknown[]) => sanitizeSpecies({ suggestions }, guide, clades);

  // Bug caught: a species the guide already has was proposed again, and its accept hit the unique name.
  it("sets aside a name the guide already has, in any case", () => {
    const out = run([{ name: "  red   FOX " }, { name: "Marsh Heron" }]);
    expect(out.suggestions.map((s) => s.name)).toEqual(["Marsh Heron"]);
    expect(out.setAside).toEqual([{ claim: "red FOX", reason: "the field guide already has it" }]);
  });

  // Bug caught: a model's made-up kingdom, habit or hour reached the database check and refused the accept.
  it("keeps only the words of the closed lists, and calls a missing kingdom an animal", () => {
    const [s] = run([{ name: "Glowcap", kingdom: "mineral", lives_as: "swarm", activity: "dusk" }]).suggestions;
    expect(s).toMatchObject({ kingdom: "animal", livesAs: null, activity: null });
    const [t] = run([{ name: "Glowcap", kingdom: "fungus", lives_as: "colony", activity: "night" }]).suggestions;
    expect(t).toMatchObject({ kingdom: "fungus", livesAs: "colony", activity: "night" });
  });

  // Bug caught: a long name, scientific name, form label or note was written past the column's length check.
  it("cuts each text to its column's length", () => {
    const [s] = run([{
      name: "n".repeat(200), scientific_name: "s".repeat(300),
      forms: [{ label: "f".repeat(100) }],
      links: [{ kind: "eats", to: "sp-fox", note: "x".repeat(500) }],
    }]).suggestions;
    expect([s!.name.length, s!.scientificName!.length, s!.forms[0]!.label.length, s!.links[0]!.note!.length]).toEqual([80, 120, 40, 200]);
  });

  // Bug caught: a species with no description was written with the text "undefined", or a long one past the paragraph cap.
  it("keeps a description to a paragraph's length and empty when the model gave none", () => {
    const [bare, long] = run([{ name: "A" }, { name: "B", description: "d".repeat(3000) }]).suggestions;
    expect(bare!.description).toBe("");
    expect(long!.description).toHaveLength(1500);
  });

  // Bug caught: more than six forms or eight links per species, or a form twice, was written.
  it("allows at most 6 forms and 8 links, and no form or link twice", () => {
    const forms = Array.from({ length: 9 }, (_, i) => ({ label: `Stage ${i}` }));
    const links = Array.from({ length: 12 }, (_, i) => ({ kind: "helps", to: `sp-${i}` }));
    const many = sanitizeSpecies({ suggestions: [{ name: "A", forms: [{ label: "Pup" }, { label: "pup" }, ...forms], links: [{ kind: "eats", to: "sp-fox" }, { kind: "eats", to: "Red Fox" }, ...links] }] },
      [{ id: "sp-fox", name: "Red Fox" }, ...links.map((l) => ({ id: l.to, name: `Beast ${l.to}` }))], clades);
    const [s] = many.suggestions;
    expect(s!.forms).toHaveLength(6);
    expect(s!.forms.filter((f) => f.label.toLowerCase() === "pup")).toHaveLength(1);
    expect(s!.links).toHaveLength(8);
    expect(s!.links.filter((l) => l.kind === "eats")).toHaveLength(1);
  });

  // Bug caught: a link to an invented species was written (a foreign key refusal), or dropped its whole species with it.
  it("drops a link whose target is neither a known id nor in this answer, and keeps the species", () => {
    const out = run([{ name: "Heron", links: [{ kind: "eats", to: "sp-ghost" }, { kind: "eats", to: "Frog" }] }, { name: "Frog" }]);
    expect(out.suggestions[0]!.links).toEqual([{ kind: "eats", toSpeciesId: null, toName: "Frog", toLabel: "Frog", note: null }]);
    expect(out.suggestions.map((s) => s.name)).toEqual(["Heron", "Frog"]);
  });

  // Bug caught: a link to a species that was set aside or cut by the cap survived and waited for an accept that never comes.
  it("does not link to a name that did not survive, nor to itself", () => {
    const out = run([{ name: "Heron", links: [{ kind: "eats", to: "heron" }, { kind: "competes", to: "Red Fox " }] }, { name: "Red Fox" }]);
    expect(out.suggestions).toHaveLength(1);
    // The set-aside fox is an existing species: the link resolves to its id, not to a batch name.
    expect(out.suggestions[0]!.links).toEqual([{ kind: "competes", toSpeciesId: "sp-fox", toName: null, toLabel: "Red Fox", note: null }]);
  });

  // Bug caught: a link with no target was written for a kind that needs one (the database check refuses it).
  it("allows no target only for shelters and carries", () => {
    const [s] = run([{ name: "Oak", links: [{ kind: "shelters" }, { kind: "carries", to: "" }, { kind: "eats" }, { kind: "helps", to: "" }] }]).suggestions;
    expect(s!.links.map((l) => l.kind)).toEqual(["shelters", "carries"]);
    expect(s!.links.every((l) => l.toSpeciesId === null && l.toName === null)).toBe(true);
  });

  // Bug caught: an unknown clade id was taken for a new clade's name, or a known id made a duplicate clade.
  it("resolves a clade by id or name to the existing one, and treats anything else as a new clade", () => {
    const out = run([{ name: "A", clade: "cl-canid" }, { name: "B", clade: "canids" }, { name: "C", clade: "Herons" }, { name: "D" }]).suggestions;
    expect(out.map((s) => s.clade)).toEqual([{ id: "cl-canid", name: "Canids" }, { id: "cl-canid", name: "Canids" }, { id: null, name: "Herons" }, null]);
  });

  // Bug caught: the answer's ninth species was written, past the cap.
  it("keeps at most 8 species", () => {
    expect(run(Array.from({ length: 12 }, (_, i) => ({ name: `Beast ${i}` }))).suggestions).toHaveLength(8);
  });
});

describe("sanitizeHabitats", () => {
  const guide = [{ id: "sp-fox", name: "Red Fox" }, { id: "sp-heron", name: "Heron" }];
  const run = (suggestions: unknown[], existing: string[] = []) => sanitizeHabitats({ suggestions }, existing, guide);

  // Bug caught: a habitat the campaign already lists was proposed again.
  it("sets aside a habitat name already listed or repeated in the answer", () => {
    const out = run([{ name: "Salt Marsh" }, { name: "Deep Wood" }, { name: "deep wood" }], ["salt marsh"]);
    expect(out.suggestions.map((h) => h.name)).toEqual(["Deep Wood"]);
    expect(out.setAside).toHaveLength(2);
  });

  // Bug caught: an invented species id reached insertHabitatSpecies (a foreign key refusal that threw away the habitat).
  it("drops an unknown species id with a reason and keeps the habitat", () => {
    const out = run([{ name: "Marsh", species: [{ species_id: "sp-ghost", abundance: "common" }, { species_id: "sp-heron", abundance: "common" }] }]);
    expect(out.suggestions[0]!.species).toEqual([{ speciesId: "sp-heron", speciesName: "Heron", abundance: "common" }]);
    expect(out.setAside[0]!.reason).toContain("not a species in the field guide");
  });

  // Bug caught: a species listed twice in one habitat hit the unique (habitat, species) and failed the whole accept.
  it("drops a species repeated in one habitat", () => {
    const out = run([{ name: "Marsh", species: [{ species_id: "sp-fox", abundance: "rare" }, { species_id: "sp-fox", abundance: "common" }] }]);
    expect(out.suggestions[0]!.species).toEqual([{ speciesId: "sp-fox", speciesName: "Red Fox", abundance: "rare" }]);
    expect(out.setAside).toHaveLength(1);
  });

  // Bug caught: a model's percentage was carried to the write, overriding the shares worked out in code; an odd abundance word was refused by the check.
  it("never carries a percent, and calls an unknown abundance none", () => {
    const [h] = run([{ name: "Marsh", species: [{ species_id: "sp-fox", abundance: "plentiful", percent: 60 }] }]).suggestions;
    expect(h!.species[0]).toEqual({ speciesId: "sp-fox", speciesName: "Red Fox", abundance: null });
    expect(JSON.stringify(h)).not.toContain("percent");
  });
});
