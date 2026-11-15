import { describe, expect, it } from "vitest";
import {
  applyVerdicts,
  buildPool,
  buildRelationRequest,
  buildStoredText,
  candidateKey,
  judgeTable,
  planPairs,
  runBounded,
  verdictKey,
  RELATION_QUESTION,
  type PoolEntity,
} from "./judging";
import { buildNpcQueryText, SIMILAR_MAX_DISTANCE, type Candidate, type MatchKind } from "./matching";

function cand(id: string, matchKind: MatchKind, distance: number | null = null, source: "campaign" | "library" = "campaign"): Candidate {
  return { targetId: id, source, name: id, matchKind, detail: null, distance, verdict: null };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("buildPool", () => {
  it("orders name candidates first then similar by distance, and never lists a row twice", () => {
    const pool = buildPool(
      [cand("a", "exact"), cand("b", "near")],
      [cand("d", "similar", 0.3), cand("a", "similar", 0.01), cand("c", "similar", 0.1)],
    );
    expect(pool.map((c) => c.targetId)).toEqual(["a", "b", "c", "d"]);
    expect(pool[0].matchKind).toBe("exact");
  });

  it("treats the same id in campaign and library as two rows", () => {
    const pool = buildPool([cand("x", "exact", null, "campaign")], [cand("x", "similar", 0.1, "library")]);
    expect(pool).toHaveLength(2);
  });
});

describe("planPairs", () => {
  const entity = (key: string, n: number): PoolEntity => ({
    key,
    pool: Array.from({ length: n }, (_, i) => cand(`${key}-${i}`, i < 2 ? "exact" : "similar", i / 100)),
  });

  it("judges at most 8 pairs per entity and keeps the name candidates among them", () => {
    const pairs = planPairs([entity("e1", 12)], 8, 1600);
    expect(pairs).toHaveLength(8);
    expect(pairs.slice(0, 2).map((p) => p.candidate.matchKind)).toEqual(["exact", "exact"]);
    expect(pairs.map((p) => p.candidate.targetId)).not.toContain("e1-8");
  });

  it("stops at the per-request cap, in entity order", () => {
    const pairs = planPairs([entity("e1", 5), entity("e2", 5), entity("e3", 5)], 8, 7);
    expect(pairs).toHaveLength(7);
    expect(pairs.filter((p) => p.entityKey === "e3")).toHaveLength(0);
    expect(pairs.filter((p) => p.entityKey === "e2")).toHaveLength(2);
  });

  it("uses the documented defaults of 8 and 1,600", () => {
    const many = Array.from({ length: 300 }, (_, i) => entity(`e${i}`, 8));
    expect(planPairs(many)).toHaveLength(1600);
    expect(planPairs([entity("e", 20)])).toHaveLength(8);
  });
});

describe("applyVerdicts", () => {
  const kind = "npcs" as const;
  const key = "npcs:n1";
  const verdicts = (entries: [Candidate, number][]) =>
    new Map(entries.map(([c, v]) => [verdictKey(key, c), v] as [string, number]));

  it("drops a similar candidate judged under 0.5 but keeps a name candidate with the same verdict", () => {
    const name = cand("name", "exact");
    const similar = cand("sim", "similar", 0.05);
    const out = applyVerdicts(kind, key, [name, similar], verdicts([[name, 0.1], [similar, 0.1]]));
    expect(out.map((c) => c.targetId)).toEqual(["name"]);
    expect(out[0].verdict).toBe(0.1);
  });

  it("keeps a similar candidate at exactly 0.5", () => {
    const similar = cand("sim", "similar", 0.9);
    const out = applyVerdicts(kind, key, [similar], verdicts([[similar, 0.5]]));
    expect(out).toHaveLength(1);
  });

  it("keeps a judged similar candidate far beyond the distance cut-off, and is not capped at 3", () => {
    const sims = Array.from({ length: 5 }, (_, i) => cand(`s${i}`, "similar", 0.9));
    const out = applyVerdicts(kind, key, sims, verdicts(sims.map((c) => [c, 1.5] as [Candidate, number])));
    expect(out).toHaveLength(5);
  });

  it("orders judged candidates by verdict descending, then the unjudged in pool order", () => {
    const a = cand("a", "exact");
    const b = cand("b", "similar", 0.01);
    const c = cand("c", "similar", 0.02);
    const u = cand("u", "exact");
    const out = applyVerdicts(kind, key, [a, u, b, c], verdicts([[a, 0.6], [b, 1.4], [c, 1.2]]));
    expect(out.map((x) => x.targetId)).toEqual(["b", "c", "a", "u"]);
    expect(out.map((x) => x.verdict)).toEqual([1.4, 1.2, 0.6, null]);
  });

  it("drops merely related similar rows beside a row judged the same, but never a name candidate", () => {
    // Seen in the review: "Comfit" matched Comfit, followed by three other NPCs of the same town marked "related".
    const same = cand("same", "similar", 0.3);
    const neighbour = cand("neighbour", "similar", 0.4);
    const namesake = cand("namesake", "contains");
    const out = applyVerdicts(kind, key, [namesake, same, neighbour], verdicts([[same, 1.5], [neighbour, 1.49], [namesake, 1.0]]));
    expect(out.map((x) => x.targetId)).toEqual(["same", "namesake"]);
  });

  it("with nothing judged the same, shows the two closest related similar rows and no more", () => {
    const sims = [1.2, 0.9, 0.8, 0.7].map((v, i) => [cand(`s${i}`, "similar", 0.4), v] as [Candidate, number]);
    const out = applyVerdicts(kind, key, sims.map(([c]) => c), verdicts(sims));
    expect(out.map((x) => x.targetId)).toEqual(["s0", "s1"]);
  });

  it("an unjudged similar candidate falls back to the distance rule (kept inside the cut-off, dropped outside)", () => {
    const max = SIMILAR_MAX_DISTANCE[kind];
    const near = cand("near", "similar", max);
    const far = cand("far", "similar", max + 0.01);
    const out = applyVerdicts(kind, key, [near, far], new Map());
    expect(out.map((c) => c.targetId)).toEqual(["near"]);
    expect(out[0].verdict).toBeNull();
  });

  it("an unjudged similar candidate is still capped at 3, as before the judging tier", () => {
    const sims = Array.from({ length: 5 }, (_, i) => cand(`s${i}`, "similar", 0.01));
    expect(applyVerdicts(kind, key, sims, new Map())).toHaveLength(3);
  });

  it("an unjudged name candidate is always kept", () => {
    const name = cand("name", "contains");
    expect(applyVerdicts(kind, key, [name], new Map())).toHaveLength(1);
  });

  it("a verdict recorded for another entity does not apply to this one", () => {
    const similar = cand("sim", "similar", 0.5);
    const other = new Map([[verdictKey("npcs:other", similar), 2]]);
    expect(applyVerdicts(kind, key, [similar], other)).toHaveLength(0);
  });

  it("does not mutate the pool it was given", () => {
    const similar = cand("sim", "similar", 0.01);
    applyVerdicts(kind, key, [similar], verdicts([[similar, 1]]));
    expect(similar.verdict).toBeNull();
  });
});

describe("runBounded", () => {
  it("never runs more tasks at once than the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
      return i;
    });
    const out = await runBounded(tasks, { concurrency: 3, deadlineMs: 2000 });
    expect(peak).toBe(3);
    expect(out.every((o) => o.done)).toBe(true);
    expect(out.map((o) => (o.done ? o.value : -1))).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("a task that throws is unfinished and does not stop the others", async () => {
    const out = await runBounded(
      [() => Promise.resolve(1), () => Promise.reject(new Error("boom")), () => Promise.resolve(3)],
      { concurrency: 2, deadlineMs: 2000 },
    );
    expect(out.map((o) => o.done)).toEqual([true, false, true]);
  });

  it("returns at the deadline: slow tasks are unfinished and aborted, unstarted ones never start", async () => {
    let started = 0;
    let aborted = 0;
    const slow = (signal: AbortSignal) => {
      started++;
      return new Promise<number>((resolve) => {
        signal.addEventListener("abort", () => aborted++);
        setTimeout(() => resolve(1), 500);
      });
    };
    const begin = Date.now();
    const out = await runBounded([() => Promise.resolve(0), slow, slow, slow, slow], { concurrency: 2, deadlineMs: 40 });
    expect(Date.now() - begin).toBeLessThan(400);
    expect(out[0]).toEqual({ done: true, value: 0 });
    expect(out.slice(1).every((o) => !o.done)).toBe(true);
    expect(started).toBe(2);
    expect(aborted).toBe(2);
    await sleep(520);
    expect(out.slice(1).every((o) => !o.done)).toBe(true);
    // The stragglers settling late must not make the workers start the queued tasks.
    expect(started).toBe(2);
  });

  it("an empty task list resolves at once", async () => {
    expect(await runBounded([], { concurrency: 16, deadlineMs: 50 })).toEqual([]);
  });
});

describe("request and stored text", () => {
  it("builds the evaluated question with its three criteria and the imported/existing state", () => {
    const req = buildRelationRequest("imp", "exi");
    expect(req.state).toEqual({ imported: "imp", existing: "exi" });
    const q = req.questions[RELATION_QUESTION];
    expect(q.type).toBe("score");
    if (q.type === "score") expect(q.criteria).toHaveLength(3);
  });

  it("builds a stored NPC's text in the same shape as the imported entity's, so the two compare like with like", () => {
    const row = { id: "1", name: "Baelin", race: "Dwarf", occupation: "Smith", alignment: null, tags: [], appearance: null, personality: null, backstory: null };
    expect(buildStoredText("npcs", row)).toBe(buildNpcQueryText("Baelin", { race: "Dwarf", occupation: "Smith" }));
  });

  it("returns null (the pair goes unjudged) for a row missing a required column", () => {
    expect(buildStoredText("npcs", { name: "Baelin", tags: "not a list" })).toBeNull();
    expect(buildStoredText("locations", { name: "Inn", tags: [], location_type: null })).toBeNull();
    expect(buildStoredText("items", { name: "Nail", tags: [], item_type: "gear" })).toBeNull();
    expect(buildStoredText("npcs", { tags: [] })).toBeNull();
  });

  it("reads a library monster's challenge rating from its stat block and tolerates null tags", () => {
    const text = buildStoredText("monsters", {
      name: "Owlbear", monster_type: "monstrosity", size: "Large", habitat: null, tags: null, description: null,
      stat_block: { challenge_rating: "3" },
    });
    expect(text).toBe("Owlbear. Large monstrosity, CR 3.");
  });

  it("maps a candidate to its table: campaign rows to the kind's own table, library only for monsters and items", () => {
    expect(judgeTable("npcs", "campaign")).toBe("npcs");
    expect(judgeTable("monsters", "library")).toBe("library_monsters");
    expect(judgeTable("items", "library")).toBe("library_items");
    expect(judgeTable("npcs", "library")).toBeNull();
  });

  it("keys a candidate by source and id", () => {
    expect(candidateKey(cand("x", "exact", null, "library"))).toBe("library:x");
  });
});
