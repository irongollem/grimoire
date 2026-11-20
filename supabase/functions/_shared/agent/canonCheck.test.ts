import { describe, expect, it, vi } from "vitest";
import {
  canonCheckRequest,
  canonVerdict,
  checkInvention,
  MAX_TRUTHS_CHECKED,
  type CanonCheckMaterial,
} from "./canonCheck";
import type { JudgeResult } from "../typesafe";

const SECRET_A = "00000000-0000-4000-8000-0000000000a1";
const SECRET_B = "00000000-0000-4000-8000-0000000000b2";
const STATEMENT = "The Baron poisoned the well to hide the ledger.";

const material: CanonCheckMaterial = {
  truths: [
    { text: "Magic leaves a taste on the tongue.", secret: false },
    { text: "The ferrywoman is the first queen.", secret: true },
  ],
  questions: ["Who made the Stain?"],
  secrets: [
    { id: SECRET_A, statement: STATEMENT },
    { id: SECRET_B, statement: "The bell is hollow." },
  ],
};

/** A judge result that answers every named question with 0.05, except the ones given. */
const answers = (high: Record<string, number>): JudgeResult => ({
  model: "jev-test",
  inputTokens: 10,
  answers: Object.fromEntries(
    ["contradicts_0", "contradicts_1", "answers_0", "states_0", "states_1", "hints_0", "hints_1"].map((k) => [
      k,
      { type: "noul" as const, noul: high[k] ?? 0.05 },
    ]),
  ),
});

describe("canonCheckRequest", () => {
  it("asks nothing of a campaign with no truth, question or secret", () => {
    expect(canonCheckRequest("The river is cold.", { truths: [], questions: [], secrets: [] }, new Set())).toBeNull();
  });

  it("gives the secrets' statements to the judge, one question per truth, question and secret", () => {
    const request = canonCheckRequest("The well tastes odd.", material, new Set())!;
    expect(JSON.stringify(request.state)).toContain(STATEMENT);
    expect(Object.keys(request.questions).sort()).toEqual(
      ["answers_0", "contradicts_0", "contradicts_1", "hints_0", "hints_1", "states_0", "states_1"],
    );
  });

  it("does not ask whether an invention hints at a secret that has a clue here", () => {
    const request = canonCheckRequest("The well tastes odd.", material, new Set([SECRET_A]))!;
    expect(Object.keys(request.questions)).not.toContain("hints_0");
    expect(Object.keys(request.questions)).toContain("hints_1");
  });

  it("holds the number of truths in one request", () => {
    const many = { ...material, truths: Array.from({ length: MAX_TRUTHS_CHECKED + 10 }, (_, i) => ({ text: `Truth ${i}.`, secret: false })) };
    expect(canonCheckRequest("x", many, new Set())!.state).toMatchObject({ truths: expect.any(Array) });
    expect((canonCheckRequest("x", many, new Set())!.state as { truths: string[] }).truths).toHaveLength(MAX_TRUTHS_CHECKED);
  });
});

describe("canonVerdict", () => {
  it("lets an invention through when nothing scores high", () => {
    expect(canonVerdict(material, new Set(), answers({}))).toBeNull();
  });

  it("refuses a contradiction and names the truth, in the frame's words", () => {
    expect(canonVerdict(material, new Set(), answers({ contradicts_0: 0.95 }))).toBe(
      "It contradicts a truth: Magic leaves a taste on the tongue. Invent around it. Nothing was filed: rephrase and file it again.",
    );
  });

  it("does not name a truth the DM keeps secret, or the Narrator learns it from the refusal", () => {
    const reason = canonVerdict(material, new Set(), answers({ contradicts_1: 0.95 }))!;
    expect(reason).toContain("a truth the DM keeps");
    expect(reason).not.toContain("ferrywoman");
  });

  it("refuses an answered open question and names the question", () => {
    expect(canonVerdict(material, new Set(), answers({ answers_0: 0.9 }))).toContain("It answers an open question the DM keeps: Who made the Stain. Leave it open.");
  });

  it("refuses a stated secret without a word of what it says", () => {
    const reason = canonVerdict(material, new Set(), answers({ states_0: 0.99 }))!;
    expect(reason).toContain("It states a secret. Only the DM reveals a secret.");
    expect(reason).not.toContain("Baron");
    expect(reason).not.toContain("well");
  });

  it("refuses a hint at a secret where no clue lies, and allows it where one does", () => {
    expect(canonVerdict(material, new Set(), answers({ hints_0: 0.9 }))).toContain("where no clue");
    expect(canonVerdict(material, new Set([SECRET_A]), answers({ hints_0: 0.9 }))).toBeNull();
  });

  it("still refuses a stated secret where a clue lies: a clue allows a hint, never the statement", () => {
    expect(canonVerdict(material, new Set([SECRET_A]), answers({ states_0: 0.9 }))).toContain("It states a secret");
  });

  it("lets a borderline score through, the line being 0.8", () => {
    expect(canonVerdict(material, new Set(), answers({ contradicts_0: 0.79, answers_0: 0.79, states_0: 0.79, hints_0: 0.79 }))).toBeNull();
    expect(canonVerdict(material, new Set(), answers({ contradicts_0: 0.8 }))).not.toBeNull();
  });

  it("leaves a missing answer as no finding", () => {
    expect(canonVerdict(material, new Set(), { model: "m", inputTokens: 1, answers: {} })).toBeNull();
  });
});

describe("checkInvention", () => {
  const base = { invention: "The well tastes odd.", material, clueSecretIds: new Set<string>() };

  it("refuses with the reason when the judge finds a contradiction", async () => {
    const judge = vi.fn(async () => answers({ contradicts_0: 0.9 }));
    const out = await checkInvention({ ...base, judge });
    expect(out?.error).toContain("It contradicts a truth");
  });

  it("files and says so in the log when there is no judge", async () => {
    const log = vi.fn();
    expect(await checkInvention({ ...base, judge: null, log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("skipped (no judge)"));
  });

  it("files and says so in the log when the judge throws", async () => {
    const log = vi.fn();
    const judge = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await checkInvention({ ...base, judge, log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("skipped (the judge failed)"), expect.any(Error));
  });

  it("never calls the judge when the campaign has nothing to check against", async () => {
    const judge = vi.fn(async () => answers({}));
    expect(await checkInvention({ ...base, material: { truths: [], questions: [], secrets: [] }, judge })).toBeNull();
    expect(judge).not.toHaveBeenCalled();
  });
});
