import { describe, expect, it } from "vitest";
import { buildInstruction, OWN_WRITING_GUIDANCE } from "./buildInstruction.ts";
import { EXTRACTION_SCHEMA } from "./extractionSchema.ts";

const base = { sourceKind: "text", sourceText: "SRC", pageCount: 0, textGuidance: "GUIDE" };

describe("buildInstruction", () => {
  it("adds the word-for-word paragraph only for the DM's own writing, before the source", () => {
    const own = buildInstruction({ ...base, ownWriting: true });
    expect(own).toContain(OWN_WRITING_GUIDANCE);
    expect(own.indexOf(OWN_WRITING_GUIDANCE)).toBeLessThan(own.indexOf("SRC"));
    expect(buildInstruction({ ...base, ownWriting: false })).not.toContain(OWN_WRITING_GUIDANCE);
  });

  it("adds it for a PDF too", () => {
    const pdf = buildInstruction({ ...base, sourceKind: "pdf", pageCount: 3, ownWriting: true });
    expect(pdf).toContain("3 pages");
    expect(pdf).toContain(OWN_WRITING_GUIDANCE);
  });
});

describe("quest extraction schema", () => {
  const find = (node: unknown, key: string): Record<string, unknown> | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const rec = node as Record<string, unknown>;
    const props = rec.properties as Record<string, unknown> | undefined;
    if (props && key in props && "beats" in props) return rec;
    for (const v of Object.values(rec)) {
      const hit = find(v, key);
      if (hit) return hit;
    }
    return undefined;
  };

  it("asks for the quest's dm_content and a labelled route, all required for strict mode", () => {
    const quest = find(EXTRACTION_SCHEMA, "routes");
    expect(quest).toBeDefined();
    const props = quest!.properties as Record<string, { items?: { properties: Record<string, unknown>; required: string[] } }>;
    expect(props.dm_content).toBeDefined();
    expect(quest!.required).toContain("dm_content");
    const route = props.routes.items!;
    expect(Object.keys(route.properties)).toEqual(expect.arrayContaining(["kind", "label", "note"]));
    expect(route.required).toEqual(expect.arrayContaining(["kind", "label", "note"]));
  });
});
