import { describe, it, expect } from "vitest";
import {
  buildFreesoundFilter,
  resolveSort,
  LICENSE_FILTER,
  SORT_OPTIONS,
  DEFAULT_SORT,
} from "./freesound-query";

const NO_FILTERS = { minDuration: null, maxDuration: null, tag: null };

describe("buildFreesoundFilter", () => {
  it("always carries the licence filter", () => {
    // The one clause that must never be droppable: without it we surface
    // CC-BY-NC results a commercial product cannot use.
    expect(buildFreesoundFilter(NO_FILTERS)).toBe(LICENSE_FILTER);
    expect(buildFreesoundFilter({ minDuration: "1", maxDuration: "5", tag: "door" })).toContain(
      LICENSE_FILTER,
    );
  });

  it("adds a bounded duration window", () => {
    expect(buildFreesoundFilter({ ...NO_FILTERS, minDuration: "1", maxDuration: "5" })).toBe(
      `${LICENSE_FILTER} duration:[1 TO 5]`,
    );
  });

  it("honours a maximum on its own", () => {
    // "under five seconds" is the most useful filter there is for one-shots,
    // and it names no minimum.
    expect(buildFreesoundFilter({ ...NO_FILTERS, maxDuration: "5" })).toBe(
      `${LICENSE_FILTER} duration:[* TO 5]`,
    );
  });

  it("honours a minimum on its own", () => {
    expect(buildFreesoundFilter({ ...NO_FILTERS, minDuration: "30" })).toBe(
      `${LICENSE_FILTER} duration:[30 TO *]`,
    );
  });

  it("ignores durations that are not usable numbers", () => {
    expect(buildFreesoundFilter({ ...NO_FILTERS, minDuration: "abc" })).toBe(LICENSE_FILTER);
    expect(buildFreesoundFilter({ ...NO_FILTERS, maxDuration: "-3" })).toBe(LICENSE_FILTER);
    expect(buildFreesoundFilter({ ...NO_FILTERS, minDuration: "" })).toBe(LICENSE_FILTER);
  });

  it("adds a quoted tag", () => {
    expect(buildFreesoundFilter({ ...NO_FILTERS, tag: "door" })).toBe(
      `${LICENSE_FILTER} tag:"door"`,
    );
  });

  it("strips quotes so a tag cannot break out of its own term", () => {
    const filter = buildFreesoundFilter({ ...NO_FILTERS, tag: 'door" OR license:("Sampling+")' });
    expect(filter).not.toContain('license:("Sampling+")');
    expect(filter.startsWith(LICENSE_FILTER)).toBe(true);
  });

  it("drops a tag that is only whitespace", () => {
    expect(buildFreesoundFilter({ ...NO_FILTERS, tag: "   " })).toBe(LICENSE_FILTER);
  });

  it("combines everything in one filter", () => {
    expect(buildFreesoundFilter({ minDuration: "0", maxDuration: "3", tag: "creak" })).toBe(
      `${LICENSE_FILTER} duration:[0 TO 3] tag:"creak"`,
    );
  });
});

describe("resolveSort", () => {
  it("maps our vocabulary onto Freesound's", () => {
    expect(resolveSort("shortest")).toBe("duration_asc");
    expect(resolveSort("longest")).toBe("duration_desc");
    expect(resolveSort("downloads")).toBe("downloads_desc");
  });

  it("falls back to the default rather than forwarding an unknown value", () => {
    // It lands in a URL signed with our API token, so it is an allowlist.
    expect(resolveSort("'; drop table sounds")).toBe(SORT_OPTIONS[DEFAULT_SORT]);
    expect(resolveSort(null)).toBe(SORT_OPTIONS[DEFAULT_SORT]);
    expect(resolveSort("")).toBe(SORT_OPTIONS[DEFAULT_SORT]);
  });
});
