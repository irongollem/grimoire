import { describe, expect, it, afterEach } from "vitest";
import { pathToFileURL } from "node:url";
import { isCliEntry } from "./cli";

const originalArgv1 = process.argv[1];

afterEach(() => {
  process.argv[1] = originalArgv1;
});

describe("isCliEntry", () => {
  it("is true when argv[1] names this module", () => {
    process.argv[1] = "/tmp/DnD helper/scripts/x.ts";
    expect(isCliEntry(pathToFileURL(process.argv[1]).href)).toBe(true);
  });

  it("survives characters the manual file:// form mis-parses", () => {
    process.argv[1] = "/tmp/100% done/#1/scripts/x.ts";
    expect(isCliEntry(pathToFileURL(process.argv[1]).href)).toBe(true);
  });

  it("is false for a different module", () => {
    process.argv[1] = "/tmp/scripts/a.ts";
    expect(isCliEntry(pathToFileURL("/tmp/scripts/b.ts").href)).toBe(false);
  });
});
