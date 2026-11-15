import { describe, expect, it, vi } from "vitest";
import { ENTITY_KINDS, NONE_OPTION, REPAIR_MIN_PROBABILITY, entityRepairGroups, namesIn, repairNames, repairedList, shortlistOffered, type RepairDeps } from "./nameRepair";
import type { JudgeRequest, JudgeResult } from "./typesafe";

const CONTEXT = "An ambush encounter.";

function answer(choice: string, probability: number, tokens = 50): JudgeResult {
  return {
    model: "jev-1.14.0",
    inputTokens: tokens,
    answers: { entry: { type: "choice", choice, confidence: probability, probabilities: { [choice]: probability } } },
  };
}

/** A judge that always answers with the given result and records the requests it saw. */
function fakeJudge(result: JudgeResult | ((req: JudgeRequest) => JudgeResult)) {
  const seen: JudgeRequest[] = [];
  const judge: RepairDeps["judge"] = (req) => {
    seen.push(req);
    return Promise.resolve(typeof result === "function" ? result(req) : result);
  };
  return { judge, seen };
}

const offered = [{ name: "Skeleton Archer", hint: "CR 1/4 undead" }, { name: "Goblin" }];

describe("repairNames", () => {
  it("never sends a name that already equals an offered name, whatever its case or padding (it would waste a call and risk a rewrite)", async () => {
    const { judge, seen } = fakeJudge(answer("Goblin", 0.9));
    const r = await repairNames({ names: [{ name: "  skeleton ARCHER " }, { name: "GOBLIN" }], offered, context: CONTEXT }, { judge });
    expect(seen).toHaveLength(0);
    expect(r.repairs.size).toBe(0);
    expect(r.judged).toBe(0);
  });

  it("repairs a plural onto the offered name and reports the tokens spent", async () => {
    const { judge, seen } = fakeJudge(answer("Skeleton Archer", 0.9, 77));
    const r = await repairNames({ names: [{ name: "Skeletal Archers", note: "ambushers on the ridge" }], offered, context: CONTEXT }, { judge });
    expect(r.repairs.get("Skeletal Archers")).toBe("Skeleton Archer");
    expect(r.inputTokens).toBe(77);
    expect(r.judged).toBe(1);
    const q = seen[0].questions.entry;
    expect(q.type).toBe("choice");
    if (q.type !== "choice") throw new Error("unreachable");
    expect(q.criteria["Skeleton Archer"]).toBe("CR 1/4 undead");
    expect(Object.keys(q.criteria)).toContain(NONE_OPTION);
    expect(seen[0].state).toEqual({ generated: "Skeletal Archers (ambushers on the ridge)", context: CONTEXT });
  });

  it("repairs nothing when the model picks 'none of these' (a different creature must stay unmatched)", async () => {
    const { judge } = fakeJudge(answer(NONE_OPTION, 0.99, 31));
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }], offered, context: CONTEXT }, { judge });
    expect(r.repairs.size).toBe(0);
    expect(r.judged).toBe(1);
    expect(r.inputTokens).toBe(31);
  });

  it("repairs nothing below 0.7 and repairs at exactly 0.7", async () => {
    expect(REPAIR_MIN_PROBABILITY).toBe(0.7);
    const low = await repairNames({ names: [{ name: "Skeletal Archers" }], offered, context: CONTEXT }, { judge: fakeJudge(answer("Skeleton Archer", 0.69)).judge });
    expect(low.repairs.size).toBe(0);
    const at = await repairNames({ names: [{ name: "Skeletal Archers" }], offered, context: CONTEXT }, { judge: fakeJudge(answer("Skeleton Archer", 0.7)).judge });
    expect(at.repairs.get("Skeletal Archers")).toBe("Skeleton Archer");
  });

  it("repairs nothing when the pick is a name that was not offered (the model must not mint a row)", async () => {
    // The second name is answered correctly, so a guard that throws instead of skipping the first loses it too.
    const judge: RepairDeps["judge"] = (req) =>
      Promise.resolve((req.state as { generated: string }).generated.startsWith("Skeletal") ? answer("Skeleton Warlord", 0.95) : answer("Goblin", 0.9));
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }, { name: "Goblins" }], offered, context: CONTEXT }, { judge });
    expect(r.repairs.has("Skeletal Archers")).toBe(false);
    expect(r.repairs.get("Goblins")).toBe("Goblin");
  });

  it("repairs nothing when the pick's probability is missing from the answer", async () => {
    const { judge } = fakeJudge({
      model: "m",
      inputTokens: 1,
      answers: { entry: { type: "choice", choice: "Skeleton Archer", confidence: 0.9, probabilities: {} } },
    });
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }], offered, context: CONTEXT }, { judge });
    expect(r.repairs.size).toBe(0);
  });

  it("offers at most 12 entries per name, the closest ones, plus the none option", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Wolf ${String.fromCharCode(65 + (i % 26))}${i}` }));
    many.push({ name: "Dire Wolf" });
    const { judge, seen } = fakeJudge(answer(NONE_OPTION, 0.9));
    await repairNames({ names: [{ name: "Dire Wolf Alpha" }], offered: many, context: CONTEXT }, { judge });
    const q = seen[0].questions.entry;
    if (q.type !== "choice") throw new Error("unreachable");
    expect(Object.keys(q.criteria)).toHaveLength(13);
    expect(Object.keys(q.criteria)).toContain("Dire Wolf");
  });

  it("skips a name with nothing close in the offered list (no empty-option request)", async () => {
    const { judge, seen } = fakeJudge(answer(NONE_OPTION, 0.9));
    const r = await repairNames({ names: [{ name: "Ancient Red Dragon" }], offered, context: CONTEXT }, { judge });
    expect(seen).toHaveLength(0);
    expect(r.judged).toBe(0);
  });

  it("checks at most 24 names per call", async () => {
    const names = Array.from({ length: 30 }, (_, i) => ({ name: `Goblin Boss ${i}` }));
    const { judge, seen } = fakeJudge(answer(NONE_OPTION, 0.9));
    await repairNames({ names, offered, context: CONTEXT }, { judge });
    expect(seen).toHaveLength(24);
  });

  it("sends a repeated output name once", async () => {
    const { judge, seen } = fakeJudge(answer("Skeleton Archer", 0.9));
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }, { name: "skeletal archers" }], offered, context: CONTEXT }, { judge });
    expect(seen).toHaveLength(1);
    expect(r.repairs.get("Skeletal Archers")).toBe("Skeleton Archer");
  });

  it("returns at the deadline with nothing repaired when the judge never answers", async () => {
    const judge: RepairDeps["judge"] = () => new Promise(() => {});
    const started = Date.now();
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }], offered, context: CONTEXT }, { judge, deadlineMs: 30 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(r.repairs.size).toBe(0);
    expect(r.judged).toBe(0);
  });

  it("a failed request repairs nothing and does not throw, while the others still repair", async () => {
    const judge: RepairDeps["judge"] = vi.fn((req: JudgeRequest) => {
      const s = req.state as { generated: string };
      return s.generated.startsWith("Skeletal")
        ? Promise.reject(new Error("TypeSafe request failed"))
        : Promise.resolve(answer("Goblin", 0.9));
    });
    const r = await repairNames({ names: [{ name: "Skeletal Archers" }, { name: "Goblins" }], offered, context: CONTEXT }, { judge });
    expect(r.repairs.has("Skeletal Archers")).toBe(false);
    expect(r.repairs.get("Goblins")).toBe("Goblin");
  });

  it("runs no more than the concurrency cap at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const judge: RepairDeps["judge"] = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return answer(NONE_OPTION, 0.9);
    };
    const names = Array.from({ length: 20 }, (_, i) => ({ name: `Goblin Boss ${i}` }));
    await repairNames({ names, offered, context: CONTEXT }, { judge, concurrency: 3 });
    expect(peak).toBe(3);
  });
});

describe("shortlistOffered", () => {
  it("ranks a closer name first and drops unrelated ones", () => {
    const list = shortlistOffered("Dire Wolf Alpha", [{ name: "Goblin" }, { name: "Wolf" }, { name: "Dire Wolf" }], 12);
    expect(list.map((o) => o.name)).toEqual(["Dire Wolf", "Wolf"]);
  });
});

describe("entity helpers", () => {
  it("builds one group per kind so a place is never offered the people (a cross-kind repair would break the client's per-kind lookup)", () => {
    const groups = entityRepairGroups(
      { npcs: [{ name: "Old Tom", descriptor: "innkeeper" }], locations: [{ name: "The Mill", descriptor: null }], factions: [] },
      { npcs: ["Tom"], locations: ["Mill"], factions: [] },
      "Quest hooks.",
    );
    expect(ENTITY_KINDS).toEqual(["npcs", "locations", "factions"]);
    expect(groups.map((g) => g.offered)).toEqual([[{ name: "Old Tom", hint: "innkeeper" }], [{ name: "The Mill" }], []]);
    expect(groups[1].names).toEqual([{ name: "Mill" }]);
  });

  it("repairs a list in place, keeps a missing list missing and leaves non-string items alone", () => {
    const repairs = new Map([["Tom", "Old Tom"]]);
    expect(repairedList(repairs, ["Tom", "Ann", 7])).toEqual(["Old Tom", "Ann", 7]);
    expect(repairedList(repairs, undefined)).toBeUndefined();
    expect(namesIn(["a", 3, null])).toEqual(["a"]);
    expect(namesIn(undefined)).toEqual([]);
  });
});
