import { describe, expect, it } from "vitest";
import {
  QUEST_DESIGN_ANSWER_LIMIT,
  QUEST_DESIGN_PROSE_LIMIT,
  QUEST_DESIGN_TURN_BUDGET,
  buildQuestDesignerUserContent,
  parseQuestDesignTurnBody,
  sanitizeQuestDesignOutput,
} from "./questDesigner";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: "campaign-1",
    prose: "The party is hired to find a missing caravan.",
    turn: 1,
    tree: null,
    answers: [],
    ...overrides,
  };
}

describe("parseQuestDesignTurnBody", () => {
  it("accepts a well-formed turn-1 body", () => {
    const result = parseQuestDesignTurnBody(validBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({
        campaign_id: "campaign-1",
        prose: "The party is hired to find a missing caravan.",
        turn: 1,
        tree: null,
        answers: [],
      });
    }
  });

  it("accepts a later turn carrying a previous tree and answers", () => {
    const tree = { title: "T", summary: "S", beats: [{ key: "b1", title: "Open", dm_content: "...", kind: "neutral" }], objectives: [], tags: [] };
    const result = parseQuestDesignTurnBody(validBody({
      turn: 2,
      tree,
      answers: [{ question_key: "q1", question: "Does the caravan survive?", answer: "No" }],
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.tree).toEqual(tree);
      expect(result.body.answers).toEqual([{ question_key: "q1", question: "Does the caravan survive?", answer: "No" }]);
    }
  });

  it("rejects a non-object body", () => {
    expect(parseQuestDesignTurnBody(null).ok).toBe(false);
    expect(parseQuestDesignTurnBody("nope").ok).toBe(false);
    expect(parseQuestDesignTurnBody([]).ok).toBe(false);
  });

  it("rejects a missing or blank campaign_id", () => {
    expect(parseQuestDesignTurnBody(validBody({ campaign_id: "" })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ campaign_id: undefined })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ campaign_id: 42 })).ok).toBe(false);
  });

  it("rejects a missing, blank, or over-limit prose", () => {
    expect(parseQuestDesignTurnBody(validBody({ prose: "" })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ prose: "   " })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ prose: "a".repeat(QUEST_DESIGN_PROSE_LIMIT + 1) })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ prose: "a".repeat(QUEST_DESIGN_PROSE_LIMIT) })).ok).toBe(true);
  });

  it("rejects a non-integer, zero, negative, or over-budget turn", () => {
    expect(parseQuestDesignTurnBody(validBody({ turn: 0 })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ turn: -1 })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ turn: 1.5 })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ turn: QUEST_DESIGN_TURN_BUDGET + 1 })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ turn: QUEST_DESIGN_TURN_BUDGET })).ok).toBe(true);
  });

  it("rejects a tree that is an array, a primitive, or too large", () => {
    expect(parseQuestDesignTurnBody(validBody({ tree: [] })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ tree: "not an object" })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ tree: { huge: "x".repeat(70_000) } })).ok).toBe(false);
  });

  it("rejects a non-array answers field, and an oversized answers array", () => {
    expect(parseQuestDesignTurnBody(validBody({ answers: "nope" })).ok).toBe(false);
    const tooMany = Array.from({ length: 41 }, (_, i) => ({ question_key: `q${i}`, question: "Q?", answer: "A" }));
    expect(parseQuestDesignTurnBody(validBody({ answers: tooMany })).ok).toBe(false);
  });

  it("rejects an answer entry missing question_key, question, or answer", () => {
    expect(parseQuestDesignTurnBody(validBody({ answers: [{ question: "Q?", answer: "A" }] })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ answers: [{ question_key: "q1", answer: "A" }] })).ok).toBe(false);
    expect(parseQuestDesignTurnBody(validBody({ answers: [{ question_key: "q1", question: "Q?" }] })).ok).toBe(false);
  });

  it("rejects an answer longer than the answer limit", () => {
    const answers = [{ question_key: "q1", question: "Q?", answer: "a".repeat(QUEST_DESIGN_ANSWER_LIMIT + 1) }];
    expect(parseQuestDesignTurnBody(validBody({ answers })).ok).toBe(false);
  });

  it("accepts an answer at exactly the limit and a note-key answer", () => {
    const answers = [
      { question_key: "q1", question: "Q?", answer: "a".repeat(QUEST_DESIGN_ANSWER_LIMIT) },
      { question_key: "note", question: "Free note", answer: "Also the tavern burns down." },
    ];
    expect(parseQuestDesignTurnBody(validBody({ answers })).ok).toBe(true);
  });
});

describe("buildQuestDesignerUserContent", () => {
  const wrap = (s: string) => `<wrapped>${s}</wrapped>`;

  it("builds the turn-1 instruction with no previous tree or answers", () => {
    const content = buildQuestDesignerUserContent(
      { prose: "Find the caravan.", entityBlock: "", turn: 1, tree: null, answers: [] },
      wrap,
    );
    expect(content).toBe(
      "<wrapped>Find the caravan.</wrapped>\n\n--- turn 1 ---\n" +
      "This is the first turn. Propose the whole tree and ask what you must.",
    );
  });

  it("includes the entity block between the wrapped prose and the turn section", () => {
    const content = buildQuestDesignerUserContent(
      { prose: "Find the caravan.", entityBlock: "\n\nENTITIES", turn: 1, tree: null, answers: [] },
      wrap,
    );
    expect(content).toBe(
      "<wrapped>Find the caravan.</wrapped>\n\nENTITIES\n\n--- turn 1 ---\n" +
      "This is the first turn. Propose the whole tree and ask what you must.",
    );
  });

  it("builds a later turn with the previous tree and every answer, including a free note", () => {
    const tree = { title: "T" };
    const answers = [
      { question_key: "q1", question: "Does the caravan survive?", answer: "No" },
      { question_key: "note", question: "note", answer: "The bridge is out." },
    ];
    const content = buildQuestDesignerUserContent(
      { prose: "Find the caravan.", entityBlock: "", turn: 3, tree, answers },
      wrap,
    );
    expect(content).toBe(
      "<wrapped>Find the caravan.</wrapped>\n\n--- turn 3 ---\n" +
      "Previous tree (revise only what the answers affect):\n" +
      '{"title":"T"}\n' +
      "Answers so far:\n" +
      '- [q1] "Does the caravan survive?" → "No"\n' +
      '- DM note: "The bridge is out."\n' +
      "Return the full revised tree and any remaining questions.",
    );
  });
});

describe("sanitizeQuestDesignOutput", () => {
  const validTree = {
    title: "T",
    summary: "S",
    beats: [{ key: "b1", title: "Open", dm_content: "...", kind: "neutral" }],
    routes: [],
    objectives: [{ description: "Find it", raised_by: "b1" }],
    tags: [],
  };

  it("returns null when tree is missing or not an object", () => {
    expect(sanitizeQuestDesignOutput({ questions: [], note: "" })).toBeNull();
    expect(sanitizeQuestDesignOutput({ tree: "nope", questions: [], note: "" })).toBeNull();
    expect(sanitizeQuestDesignOutput({ tree: [], questions: [], note: "" })).toBeNull();
    expect(sanitizeQuestDesignOutput(null)).toBeNull();
  });

  it("returns null when tree.beats is missing or empty", () => {
    expect(sanitizeQuestDesignOutput({ tree: { ...validTree, beats: [] }, questions: [], note: "" })).toBeNull();
    expect(sanitizeQuestDesignOutput({ tree: { title: "T" }, questions: [], note: "" })).toBeNull();
  });

  it("passes through a valid tree and note, defaulting note to empty string", () => {
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions: [], note: "Proposed the opening." });
    expect(result).toEqual({ tree: validTree, questions: [], note: "Proposed the opening." });

    const noNote = sanitizeQuestDesignOutput({ tree: validTree, questions: [] });
    expect(noNote?.note).toBe("");
  });

  it("drops a question with a blank key or blank question text", () => {
    const questions = [
      { key: "", question: "Q?", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "q1", question: "  ", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions).toEqual([]);
  });

  it("drops options with a blank key/label, then drops the question if fewer than 2 survive", () => {
    const questions = [
      {
        key: "q1", about: "b1", question: "Which fork?", why: "w",
        options: [{ key: "", label: "bad" }, { key: "a", label: "" }, { key: "b", label: "Only one left" }],
      },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions).toEqual([]);
  });

  it("keeps a question with exactly 2 valid options", () => {
    const questions = [
      { key: "q1", about: "b1", question: "Which fork?", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions).toEqual([{ key: "q1", about: "b1", question: "Which fork?", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] }]);
  });

  it("trims a question with more than 4 options down to 4", () => {
    const questions = [
      {
        key: "q1", question: "Which?", why: "w",
        options: [
          { key: "a", label: "A" }, { key: "b", label: "B" },
          { key: "c", label: "C" }, { key: "d", label: "D" }, { key: "e", label: "E" },
        ],
      },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions[0].options).toHaveLength(4);
    expect(result?.questions[0].options.map((o) => o.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("normalizes a missing about to null and trims why", () => {
    const questions = [
      { key: "q1", question: "Which?", why: "  because  ", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions[0].about).toBeNull();
    expect(result?.questions[0].why).toBe("because");
  });

  it("dedupes questions by key, keeping the first occurrence", () => {
    const questions = [
      { key: "q1", question: "First?", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { key: "q1", question: "Duplicate?", why: "w", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
    ];
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions).toHaveLength(1);
    expect(result?.questions[0].question).toBe("First?");
  });

  it("caps at 3 questions per turn", () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({
      key: `q${i}`, question: `Question ${i}?`, why: "w",
      options: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
    }));
    const result = sanitizeQuestDesignOutput({ tree: validTree, questions, note: "" });
    expect(result?.questions).toHaveLength(3);
    expect(result?.questions.map((q) => q.key)).toEqual(["q0", "q1", "q2"]);
  });

  it("defaults questions to an empty array when the field is missing or malformed", () => {
    expect(sanitizeQuestDesignOutput({ tree: validTree, note: "" })?.questions).toEqual([]);
    expect(sanitizeQuestDesignOutput({ tree: validTree, questions: "nope", note: "" })?.questions).toEqual([]);
  });
});
