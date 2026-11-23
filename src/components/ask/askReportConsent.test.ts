import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("Ask never files a report on its own", () => {
  // Bug caught: Ask filing a report the DM never sent. A report goes out only from the report form's own Send button.
  it("no Ask source calls create-bug-report or touches bug_reports", () => {
    const here = import.meta.dirname;
    const dirs = [here, join(here, "../../composables/ask"), join(here, "../../ai/ask")];
    const sources = dirs.flatMap(files).filter((f) => !f.endsWith("askReportConsent.test.ts"));
    expect(sources.length).toBeGreaterThan(10);
    const offenders = sources.filter((f) => /create-bug-report|bug_reports/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
