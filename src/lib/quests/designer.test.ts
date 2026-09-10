import { describe, expect, it } from "vitest";
import {
  QUEST_DESIGN_ANSWER_LIMIT,
  diffDesignTrees,
  sanitizeDesignQuestions,
  toDesignAnswer,
  type QuestDesignQuestion,
  type QuestDesignTree,
} from "./designer";

function question(overrides: Partial<QuestDesignQuestion> = {}): QuestDesignQuestion {
  return {
    key: "q1",
    about: null,
    question: "Who wronged the party?",
    why: "Needed to place the antagonist.",
    options: [
      { key: "a", label: "A rival noble" },
      { key: "b", label: "A corrupt priest" },
    ],
    ...overrides,
  };
}

function tree(overrides: Partial<QuestDesignTree> = {}): QuestDesignTree {
  return {
    title: "The Silent Bell",
    summary: "Something rings under the church at night.",
    objectives: [{ description: "Investigate the bell" }],
    tags: [],
    ...overrides,
  };
}

describe("sanitizeDesignQuestions", () => {
  it("returns [] for a non-array response", () => {
    expect(sanitizeDesignQuestions(null)).toEqual([]);
    expect(sanitizeDesignQuestions(undefined)).toEqual([]);
    expect(sanitizeDesignQuestions("nope")).toEqual([]);
    expect(sanitizeDesignQuestions({})).toEqual([]);
  });

  it("drops a question with a blank key or blank question text", () => {
    const raw = [
      { key: "", question: "Has no key", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "k2", question: "   ", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "k3", question: "Survives", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeDesignQuestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("k3");
  });

  it("drops blank options first, then drops the whole question when fewer than 2 survive", () => {
    const raw = [
      {
        key: "k1",
        question: "Only one good option",
        options: [
          { key: "a", label: "Good" },
          { key: "", label: "Blank key" },
          { key: "b", label: "" },
        ],
      },
    ];
    expect(sanitizeDesignQuestions(raw)).toEqual([]);
  });

  it("trims more than 4 surviving options down to 4", () => {
    const raw = [
      {
        key: "k1",
        question: "Many options",
        options: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
          { key: "c", label: "C" },
          { key: "d", label: "D" },
          { key: "e", label: "E" },
        ],
      },
    ];
    const result = sanitizeDesignQuestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.options).toHaveLength(4);
    expect(result[0]!.options.map((o) => o.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes questions by key, keeping the first occurrence", () => {
    const raw = [
      { key: "k1", question: "First", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "k1", question: "Duplicate", options: [{ key: "c", label: "C" }, { key: "d", label: "D" }] },
    ];
    const result = sanitizeDesignQuestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe("First");
  });

  it("caps the surviving list at 3 questions", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`,
      question: `Question ${i}`,
      options: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
    }));
    expect(sanitizeDesignQuestions(raw)).toHaveLength(3);
  });

  it("normalizes a blank about to null and keeps a real one trimmed", () => {
    const raw = [
      { key: "k1", about: "  ", question: "Q1", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "k2", about: " beat-1 ", question: "Q2", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeDesignQuestions(raw);
    expect(result[0]!.about).toBeNull();
    expect(result[1]!.about).toBe("beat-1");
  });
});

describe("diffDesignTrees", () => {
  it("reports nothing changed when prev is null — the first proposal has nothing to compare against", () => {
    const next = tree({
      beats: [{ key: "b1", title: "Open", dm_content: "", kind: "neutral" }],
      objectives: [{ description: "Do the thing" }],
    });
    const diff = diffDesignTrees(null, next);
    expect(diff.beats).toEqual({ b1: "unchanged" });
    expect(diff.removedBeatTitles).toEqual([]);
    expect(diff.objectivesAdded).toEqual([]);
    expect(diff.objectivesRemoved).toEqual([]);
  });

  it("marks a beat changed when title/dm_content/kind differ, unchanged otherwise", () => {
    const prev = tree({
      beats: [
        { key: "b1", title: "Open", dm_content: "Original", kind: "neutral" },
        { key: "b2", title: "Same", dm_content: "Same content", kind: "combat" },
      ],
    });
    const next = tree({
      beats: [
        { key: "b1", title: "Open (revised)", dm_content: "Original", kind: "neutral" },
        { key: "b2", title: "Same", dm_content: "Same content", kind: "combat" },
      ],
    });
    const diff = diffDesignTrees(prev, next);
    expect(diff.beats).toEqual({ b1: "changed", b2: "unchanged" });
  });

  it("marks a beat added when it's new, and reports removed beat titles for ones absent from next", () => {
    const prev = tree({
      beats: [
        { key: "b1", title: "Open", dm_content: "", kind: "neutral" },
        { key: "b2", title: "Cut scene", dm_content: "", kind: "neutral" },
      ],
    });
    const next = tree({
      beats: [
        { key: "b1", title: "Open", dm_content: "", kind: "neutral" },
        { key: "b3", title: "New beat", dm_content: "", kind: "combat" },
      ],
    });
    const diff = diffDesignTrees(prev, next);
    expect(diff.beats).toEqual({ b1: "unchanged", b3: "added" });
    expect(diff.removedBeatTitles).toEqual(["Cut scene"]);
  });

  it("compares objectives by description: added and removed", () => {
    const prev = tree({ objectives: [{ description: "Find the culprit" }, { description: "Warn the elder" }] });
    const next = tree({ objectives: [{ description: "Find the culprit" }, { description: "Confront the cult" }] });
    const diff = diffDesignTrees(prev, next);
    expect(diff.objectivesAdded).toEqual(["Confront the cult"]);
    expect(diff.objectivesRemoved).toEqual(["Warn the elder"]);
  });

  it("returns an empty diff when nothing changed between prev and next", () => {
    const stable = tree({
      beats: [{ key: "b1", title: "Open", dm_content: "", kind: "neutral" }],
      objectives: [{ description: "Do the thing" }],
    });
    const diff = diffDesignTrees(stable, { ...stable });
    expect(diff).toEqual({
      beats: { b1: "unchanged" },
      removedBeatTitles: [],
      objectivesAdded: [],
      objectivesRemoved: [],
    });
  });
});

describe("toDesignAnswer", () => {
  it("uses the chosen option's label as the answer text", () => {
    const q = question();
    const result = toDesignAnswer(q, { optionKey: "b", freeText: "" });
    expect(result).toEqual({ question_key: "q1", question: q.question, answer: "A corrupt priest" });
  });

  it("uses trimmed free text when no option is chosen", () => {
    const q = question();
    const result = toDesignAnswer(q, { optionKey: null, freeText: "  A wandering hag, actually  " });
    expect(result).toEqual({ question_key: "q1", question: q.question, answer: "A wandering hag, actually" });
  });

  it("returns null when neither an option nor free text is given", () => {
    const q = question();
    expect(toDesignAnswer(q, { optionKey: null, freeText: "" })).toBeNull();
    expect(toDesignAnswer(q, { optionKey: null, freeText: "   " })).toBeNull();
  });

  it("falls back to free text when the option key doesn't match any real option", () => {
    const q = question();
    const result = toDesignAnswer(q, { optionKey: "not-a-real-key", freeText: "Free text wins" });
    expect(result?.answer).toBe("Free text wins");
  });

  it("caps the answer text at QUEST_DESIGN_ANSWER_LIMIT", () => {
    const q = question();
    const long = "x".repeat(QUEST_DESIGN_ANSWER_LIMIT + 50);
    const result = toDesignAnswer(q, { optionKey: null, freeText: long });
    expect(result?.answer).toHaveLength(QUEST_DESIGN_ANSWER_LIMIT);
  });
});
