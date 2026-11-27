import { describe, expect, it } from "vitest";
import { DIGEST_EXCERPT_CHARS, DIGEST_MAX_ENTRIES, canonDigestLines, loadCanonDigest, type DigestEntry } from "./canonDigest";

const entry = (over: Partial<DigestEntry>): DigestEntry => ({ part: "truth", title: "", text: "", closed: false, ...over });

describe("canonDigestLines", () => {
  // Bug caught: a helper drafting forces or a backstory never seeing the arcs, forces and secrets already written, so the
  // walk's later sections ignored the earlier ones (maintainer, 26 Nov 2026).
  it("lists the arcs and every part beyond the premise, in the book's order", () => {
    const lines = canonDigestLines(
      [entry({ part: "secret", title: "The ledger was forged" }), entry({ part: "truth", title: "Salt keeps the dead quiet" }), entry({ part: "premise", title: "Pitch" })],
      [{ name: "The Salt Owed", question: "Will the town pay?", status: "planned" }],
    );
    expect(lines).toEqual([
      "Arc (planned): The Salt Owed: asks Will the town pay?",
      "Truth: Salt keeps the dead quiet",
      "Secret: The ledger was forged",
    ]);
  });

  // Bug caught: an ended force or an answered question offered as still open, so a draft builds on what is over.
  it("marks what has closed", () => {
    expect(canonDigestLines([entry({ part: "force", title: "The tide rises", closed: true })], [])).toEqual(["Force (closed): The tide rises"]);
  });

  // Bug caught: a large canon sent whole, so one draft costs a whole book of tokens.
  it("caps the entries and cuts each text", () => {
    const many = Array.from({ length: DIGEST_MAX_ENTRIES + 10 }, (_, i) => entry({ title: `T${i}`, text: "x".repeat(DIGEST_EXCERPT_CHARS + 50) }));
    const lines = canonDigestLines(many, []);
    expect(lines).toHaveLength(DIGEST_MAX_ENTRIES);
    expect(lines[0]).toBe(`Truth: T0: ${"x".repeat(DIGEST_EXCERPT_CHARS)}`);
  });

  // Bug caught: blank entries (an add row's empty start) filling the digest with lines that say nothing.
  it("leaves out an entry with no words", () => {
    expect(canonDigestLines([entry({ title: "  ", text: "" })], [])).toEqual([]);
  });
});

// Bug caught: the loader reading another campaign's canon, or hiding a failed read as an empty canon (suggest-canon and the
// interview both rely on it).
describe("loadCanonDigest", () => {
  const fake = (calls: { table: string; eq: [string, unknown][] }[], opts: { fail?: boolean } = {}) => ({
    from(table: string) {
      const call = { table, eq: [] as [string, unknown][] };
      calls.push(call);
      const result = opts.fail
        ? { data: null, error: { message: "boom" } }
        : { data: table === "canon_arcs" ? [{ name: "The Salt Owed", question: null, status: "planned" }] : [{ part: "truth", title: "Salt keeps the dead quiet", body: null, closed_as: null }], error: null };
      // A real promise carrying the builder's chain methods, as supabase-js's builder is awaited.
      const q = Object.assign(Promise.resolve(result), {} as Record<string, unknown>);
      for (const m of ["select", "neq", "order", "limit", "in"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => { call.eq.push([c, v]); return q; };
      return q;
    },
  });

  it("reads both tables scoped to the campaign and returns the digest lines", async () => {
    const calls: { table: string; eq: [string, unknown][] }[] = [];
    const lines = await loadCanonDigest(fake(calls) as never, "camp-1");
    expect(lines).toEqual(["Arc (planned): The Salt Owed", "Truth: Salt keeps the dead quiet"]);
    for (const c of calls.filter((x) => x.table === "canon_entries" || x.table === "canon_arcs")) expect(c.eq).toContainEqual(["campaign_id", "camp-1"]);
  });

  it("throws on a failed read instead of answering an empty canon", async () => {
    await expect(loadCanonDigest(fake([], { fail: true }) as never, "camp-1")).rejects.toThrow("boom");
  });
});
