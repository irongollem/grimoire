import { describe, it, expect } from "vitest";
import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import {
  monsterStatBlockTemplate,
  monsterStatBlockWideTemplate,
  spellTemplate,
  magicItemTemplate,
  classFeatureTemplate,
} from "./templates";

const EXT = createScriptoriumExtensions();

function parse(html: string): JSONContent {
  return generateJSON(html, EXT) as JSONContent;
}

describe("entity block templates", () => {
  it("monsterStatBlockTemplate parses into a noteBlock scaffold with an ability table", () => {
    const json = parse(monsterStatBlockTemplate());
    const noteBlock = (json.content ?? []).find((n) => n.type === "noteBlock");
    expect(noteBlock).toBeDefined();
    const childTypes = (noteBlock!.content ?? []).map((n) => n.type);
    expect(childTypes).toContain("heading");
    expect(childTypes).toContain("table");
  });

  it("monsterStatBlockWideTemplate wraps the same scaffold in a wideBlock", () => {
    const json = parse(monsterStatBlockWideTemplate());
    const wide = (json.content ?? []).find((n) => n.type === "wideBlock");
    expect(wide).toBeDefined();
    expect((wide!.content ?? []).some((n) => n.type === "noteBlock")).toBe(true);
  });

  it("spellTemplate parses with heading + paragraph placeholders", () => {
    const json = parse(spellTemplate());
    const types = (json.content ?? []).map((n) => n.type);
    expect(types.filter((t) => t === "heading").length).toBeGreaterThanOrEqual(2);
    expect(types).toContain("paragraph");
  });

  it("magicItemTemplate parses with heading + paragraph placeholders", () => {
    const json = parse(magicItemTemplate());
    const types = (json.content ?? []).map((n) => n.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
  });

  it("classFeatureTemplate parses with heading + paragraph placeholders", () => {
    const json = parse(classFeatureTemplate());
    const types = (json.content ?? []).map((n) => n.type);
    expect(types.filter((t) => t === "heading").length).toBeGreaterThanOrEqual(2);
    expect(types).toContain("paragraph");
  });

  it("every template's output loads without dropping top-level content (non-empty HTML)", () => {
    for (const factory of [
      monsterStatBlockTemplate,
      monsterStatBlockWideTemplate,
      spellTemplate,
      magicItemTemplate,
      classFeatureTemplate,
    ]) {
      const json = parse(factory());
      expect((json.content ?? []).length).toBeGreaterThan(0);
    }
  });
});
