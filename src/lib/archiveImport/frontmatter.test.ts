import { describe, expect, it } from "vitest";
import { buildFrontmatter } from "@/lib/campaignExport/vaultText";
import { frontmatterList, frontmatterString, splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("reads scalars, quoted strings, numbers, booleans and lists", () => {
    const { data, body } = splitFrontmatter(
      [
        "---",
        'title: "A: tricky \\"name\\""',
        "level: 5",
        "alive: true",
        "empty:",
        "aliases:",
        "  - Bob",
        "  - 'Bob''s twin'",
        "tags: [npc, \"a, b\"]",
        "nested:",
        "  inner: 1",
        "after: ok",
        "---",
        "# Body",
      ].join("\n"),
    );
    expect(data).toEqual({
      title: 'A: tricky "name"',
      level: 5,
      alive: true,
      empty: null,
      aliases: ["Bob", "Bob's twin"],
      tags: ["npc", "a, b"],
      after: "ok",
    });
    expect(body).toBe("# Body");
  });

  it("reads what our own vault writes", () => {
    const text = buildFrontmatter([
      ["type", "npc"],
      ["grimoire_id", "abc"],
      ["tags", ["x", "y z"]],
      ["empty", []],
    ]);
    expect(splitFrontmatter(`${text}\nBody`).data).toEqual({ type: "npc", grimoire_id: "abc", tags: ["x", "y z"], empty: [] });
  });

  it("returns the text untouched without a frontmatter fence, and tolerates CRLF and a BOM", () => {
    expect(splitFrontmatter("# Just a page")).toEqual({ data: {}, body: "# Just a page" });
    expect(splitFrontmatter("﻿---\r\ntitle: x\r\n---\r\nbody").data).toEqual({ title: "x" });
  });

  it("skips block scalars rather than misreading them", () => {
    expect(splitFrontmatter("---\nnote: |\n  line\n  more\nkeep: 1\n---\n").data).toEqual({ keep: 1 });
  });
});

describe("frontmatter value helpers", () => {
  it("takes the first of a list as the string", () => {
    expect(frontmatterString(["a", "b"])).toBe("a");
    expect(frontmatterString(null)).toBeNull();
    expect(frontmatterString(3)).toBe("3");
  });
  it("splits a comma string as a list", () => {
    expect(frontmatterList("a, b")).toEqual(["a", "b"]);
    expect(frontmatterList(["a"])).toEqual(["a"]);
  });
});
