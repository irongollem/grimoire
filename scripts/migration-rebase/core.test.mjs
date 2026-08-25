import { describe, it, expect } from "vitest";
import {
  versionFromDate,
  dateFromVersion,
  nextVersionAfter,
  planRebase,
  countVersionCitations,
  rewriteVersionCitations,
} from "./core.mjs";

const PATTERN = /^(?<version>\d{14})_.+\.sql$/;
const NOW = new Date(Date.UTC(2026, 7, 25, 19, 31, 1)); // 20260825193101

describe("version arithmetic", () => {
  it("renders a UTC instant as a sortable version", () => {
    expect(versionFromDate(NOW)).toBe("20260825193101");
  });

  it("round-trips a real timestamp", () => {
    expect(dateFromVersion("20260825193101")?.toISOString()).toBe("2026-08-25T19:31:01.000Z");
  });

  // Not a defect: this repo's history starts with YYYYMMDD + a six-digit
  // counter, which is the same width and sorts correctly but is not a time.
  it("returns null for a counter-style version that is not a real time", () => {
    expect(dateFromVersion("20260426000099")).toBeNull();
  });

  it("returns null for a date JS would silently roll over", () => {
    expect(dateFromVersion("20260231000000")).toBeNull();
  });

  it("prefers the wall clock when it already beats the target", () => {
    expect(nextVersionAfter("20260825073922", NOW)).toBe("20260825193101");
  });

  // Two rebases in the same second, or a skewed clock.
  it("falls back to one second past the target when the clock is behind", () => {
    expect(nextVersionAfter("20260825193101", NOW)).toBe("20260825193102");
    expect(nextVersionAfter("20260825235959", NOW)).toBe("20260826000000");
  });

  it("explains itself rather than inventing a version it cannot compute", () => {
    expect(() => nextVersionAfter("29990426000099", NOW)).toThrow(/not a UTC timestamp/);
  });
});

describe("planRebase — the failure it exists for", () => {
  // 25 Aug 2026. A migration stamped 00:59 in a worktree, merged at 07:50 after
  // three others had already reached production. `db push` refused it, which
  // failed the release job — and the frontend had already shipped from the same
  // push through a different pipeline.
  const base = [
    "20260825000600_document_import_luna_measured.sql",
    "20260825003117_constrain_document_import_shape.sql",
    "20260825003319_sweep_stranded_document_imports.sql",
    "20260825073922_loud_poller_provisioning_gap.sql",
  ];

  it("catches a migration dated before the newest on the base ref", () => {
    const plan = planRebase({
      localFilenames: [...base, "20260825005907_refresh_openai_models.sql"],
      baseFilenames: base,
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.line).toBe("20260825073922");
    expect(plan.offenders.map((o) => o.version)).toEqual(["20260825005907"]);
    expect(plan.moves).toEqual([
      {
        from: "20260825005907_refresh_openai_models.sql",
        to: "20260825193101_refresh_openai_models.sql",
        oldVersion: "20260825005907",
        newVersion: "20260825193101",
      },
    ]);
  });

  it("says nothing when every local migration already lands after the line", () => {
    const plan = planRebase({
      localFilenames: [...base, "20260825193101_refresh_openai_models.sql"],
      baseFilenames: base,
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.offenders).toEqual([]);
    expect(plan.moves).toEqual([]);
  });

  // The property that makes moving "too much" the safe choice: a migration
  // written later is the one liable to depend on one written earlier, so their
  // relative order must survive the rebase.
  it("moves every local migration when any is stale, preserving their order", () => {
    const plan = planRebase({
      localFilenames: [...base, "20260825005907_early.sql", "20260825080000_later.sql"],
      baseFilenames: base,
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.moves.map((m) => m.from)).toEqual([
      "20260825005907_early.sql",
      "20260825080000_later.sql",
    ]);
    expect(plan.moves.map((m) => m.newVersion)).toEqual(["20260825193101", "20260825193102"]);
    const [first, second] = plan.moves.map((m) => m.newVersion);
    expect(first < second).toBe(true);
  });

  // Renaming one of these means re-running it wherever it is already applied.
  it("never moves a migration that exists on the base ref", () => {
    const plan = planRebase({
      localFilenames: [...base, "20260825005907_refresh_openai_models.sql"],
      baseFilenames: base,
      pattern: PATTERN,
      now: NOW,
    });
    const moved = new Set(plan.moves.map((m) => m.from));
    for (const filename of base) expect(moved.has(filename)).toBe(false);
  });
});

describe("planRebase — the other ways a version space breaks", () => {
  it("reports two files claiming one version", () => {
    const plan = planRebase({
      localFilenames: ["20260825120000_a.sql", "20260825120000_b.sql"],
      baseFilenames: [],
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.duplicates).toEqual([
      { version: "20260825120000", filenames: ["20260825120000_a.sql", "20260825120000_b.sql"] },
    ]);
  });

  it("reports a filename that carries no version at all", () => {
    const plan = planRebase({
      localFilenames: ["add_widgets.sql", "20260825120000_ok.sql"],
      baseFilenames: [],
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.malformed).toEqual(["add_widgets.sql"]);
  });

  // A shallow clone has no base ref. Refusing to compare is right; failing the
  // build because a comparison was unavailable is not.
  it("stays quiet when there is no base ref to compare against", () => {
    const plan = planRebase({
      localFilenames: ["20260825120000_a.sql"],
      baseFilenames: [],
      pattern: PATTERN,
      now: NOW,
    });
    expect(plan.line).toBeNull();
    expect(plan.offenders).toEqual([]);
    expect(plan.moves).toEqual([]);
  });

  it("is agnostic about the naming scheme — Rails, Flyway, anything ordered", () => {
    const plan = planRebase({
      localFilenames: ["V1_2__add_users.sql", "V1_1__init.sql"],
      baseFilenames: ["V1_3__add_index.sql"],
      pattern: /^V(?<version>[\d_]+)__.+\.sql$/,
      now: NOW,
    });
    expect(plan.line).toBe("1_3");
    expect(plan.offenders.map((o) => o.version)).toEqual(["1_1", "1_2"]);
  });
});

describe("citations", () => {
  it("finds a version cited in prose and in other migrations", () => {
    const text = "Superseded by 20260825073922, see also 20260825073922.";
    expect(countVersionCitations(text, "20260825073922")).toBe(2);
  });

  // The reason for the digit boundaries: a bare substring match would corrupt
  // longer identifiers that merely contain the version.
  it("does not match inside a longer run of digits", () => {
    expect(countVersionCitations("x2026082507392299", "20260825073922")).toBe(0);
  });

  it("rewrites every standalone citation and nothing else", () => {
    const text = "see 20260825005907 and 120260825005907";
    expect(rewriteVersionCitations(text, "20260825005907", "20260825193101")).toBe(
      "see 20260825193101 and 120260825005907",
    );
  });
});
