import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDraft, fallbackDraft, FIELD_MAX, reportSystem, whereFrom, WHERE_MAX } from "./askReport.ts";

const REC = "00000000-0000-4000-8000-0000000000f1";
const bug = { kind: "bug", where: "NPCs, Mara", action: "Opened Mara", expected: "A portrait", actual: "A blank box" };

describe("whereFrom", () => {
  // Bug caught: a campaign's names and record ids reaching a report that becomes an issue in a public repository.
  it("says the page's title and route, with ids replaced and no record's name", () => {
    const where = whereFrom({ route: `/npcs/${REC}?tab=notes`, title: "NPCs", record: { type: "npc", id: REC } });
    expect(where).toBe("NPCs, /npcs/:id, with npc open");
    expect(where).not.toContain("Mara");
    expect(where).not.toContain(REC);
  });

  it("falls back to the main screen, and cuts a long line", () => {
    expect(whereFrom(undefined)).toBe("The main screen");
    expect(whereFrom({ route: "/" + "a".repeat(190), title: "t".repeat(120) }).length).toBeLessThanOrEqual(WHERE_MAX);
  });
});

describe("checkDraft", () => {
  // Bug caught: a draft with a required field blank reaching the form, which the report endpoint would then refuse.
  it("refuses a bug missing any required field, and a feature missing either", () => {
    for (const key of ["where", "action", "expected", "actual"] as const) {
      expect(checkDraft({ ...bug, [key]: "  " }).ok, key).toBe(false);
    }
    expect(checkDraft({ kind: "feature", where: "x", summary: "Dark mode", problem: "" }).ok).toBe(false);
    expect(checkDraft({ kind: "feature", where: "x", summary: "", problem: "eyes hurt" }).ok).toBe(false);
    expect(checkDraft({ kind: "other" }).ok).toBe(false);
    expect(checkDraft("a bug").ok).toBe(false);
  });

  it("accepts a whole draft and drops fields of the other kind", () => {
    expect(checkDraft({ ...bug, summary: "ignored" })).toEqual({ ok: true, report: bug });
    expect(checkDraft({ kind: "feature", where: "Quests", summary: "Drag quests", problem: "Reordering takes ten clicks", action: "ignored" })).toEqual({
      ok: true,
      report: { kind: "feature", where: "Quests", summary: "Drag quests", problem: "Reordering takes ten clicks" },
    });
  });

  // Bug caught: an unbounded model field flowing into the form (and on to a public issue).
  it("caps long fields instead of refusing", () => {
    const checked = checkDraft({ ...bug, where: "w".repeat(900), actual: "a".repeat(9000) });
    expect(checked.ok && checked.report.kind === "bug" && [checked.report.where.length, checked.report.actual.length]).toEqual([WHERE_MAX, FIELD_MAX]);
  });
});

describe("fallbackDraft", () => {
  // Bug caught: an empty form, or an invented description, when the model drew nothing.
  it("makes the DM's own words the draft, with nothing invented", () => {
    expect(fallbackDraft("bug", " the map crashed ", "Maps")).toEqual({ kind: "bug", where: "Maps", action: "the map crashed", expected: "See what I wrote above.", actual: "See what I wrote above." });
    const feature = fallbackDraft("feature", "add dark mode", "Maps");
    expect(feature).toEqual({ kind: "feature", where: "Maps", summary: "add dark mode", problem: "add dark mode" });
  });

  // Bug caught: a fallback that fails the form's own required-field rule, so the DM faces blanks.
  it("always satisfies the checks the model's draft must", () => {
    expect(checkDraft(fallbackDraft("bug", "x", "Maps")).ok).toBe(true);
    expect(checkDraft(fallbackDraft("feature", "y".repeat(5000), "Maps")).ok).toBe(true);
  });
});

describe("reportSystem", () => {
  it("forbids inventing and forbids claiming a send", () => {
    expect(reportSystem()).toMatch(/Invent no steps/);
    expect(reportSystem()).toMatch(/Never say it was sent or filed/);
  });
});

describe("the consent rule", () => {
  // Bug caught: any Ask code reaching the report endpoint or table, so a report could go out without the DM pressing
  // Send in the form. Comments are not code, so they are stripped; test files name the strings on purpose.
  it("keeps every file of the turn and the agent away from the report endpoint and its table", () => {
    const roots = [join(__dirname, "..", "..", "ask-turn"), __dirname];
    const files = roots.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(dir, f)));
    expect(files.length).toBeGreaterThan(20);
    const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    const offenders = files.filter((f) => /create-bug-report|bug_reports/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
