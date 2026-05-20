import { describe, expect, it } from "vitest";

import { _planConversionsForTest as planConversions, TABLE_FIELDS } from "./migrate-plaintext-to-tiptap";

const tiptapDoc = (text: string) =>
  JSON.stringify({ type: "doc", attrs: { twoColumn: false }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("planConversions — npcs", () => {
  it("plans conversions for plaintext fields, skips already-tiptap + empty", () => {
    const rows = [
      {
        id: "row-1", name: "NPC One",
        appearance: "A plain markdown sentence.",
        personality: tiptapDoc("Already Tiptap."),
        backstory: null,
        notes: "",
      },
      {
        id: "row-2", name: "NPC Two",
        appearance: tiptapDoc("Already Tiptap."),
        personality: tiptapDoc("Already Tiptap."),
        backstory: tiptapDoc("Already Tiptap."),
        notes: tiptapDoc("Already Tiptap."),
      },
    ];
    const { plans, anomalies } = planConversions("npcs", rows);
    expect(anomalies).toEqual([]);
    expect(plans.length).toBe(1); // only row-1 has a plaintext field
    expect(plans[0]!.id).toBe("row-1");
    expect(Object.keys(plans[0]!.fields)).toEqual(["appearance"]);
    // The converted value is a Tiptap doc string
    const converted = plans[0]!.fields.appearance!.converted;
    expect(JSON.parse(converted).type).toBe("doc");
  });

  it("idempotent: a row that's already all-tiptap produces zero plans", () => {
    const rows = [
      {
        id: "row-1", name: "Already migrated",
        appearance: tiptapDoc("A"),
        personality: tiptapDoc("B"),
        backstory: tiptapDoc("C"),
        notes: tiptapDoc("D"),
      },
    ];
    const { plans, anomalies } = planConversions("npcs", rows);
    expect(plans).toEqual([]);
    expect(anomalies).toEqual([]);
  });

  it("flags unknown-json values as anomalies (does NOT plan them)", () => {
    const rows = [
      {
        id: "row-bad", name: "Legacy ProseMirror Dump",
        // Valid JSON but root.type != "doc" — a legacy non-Tiptap dump.
        // Converting as if it were plaintext would corrupt the row.
        appearance: '{"type":"paragraph","content":[]}',
        personality: null,
        backstory: null,
        notes: "Plain notes here.",
      },
    ];
    const { plans, anomalies } = planConversions("npcs", rows);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toMatchObject({
      table: "npcs",
      id: "row-bad",
      field: "appearance",
    });
    // The plain `notes` is still planned — anomaly on one field doesn't block others.
    expect(plans.length).toBe(1);
    expect(Object.keys(plans[0]!.fields)).toEqual(["notes"]);
  });
});

describe("planConversions — deities + pantheons", () => {
  it("converts deity description + dm_notes when plaintext", () => {
    const rows = [
      {
        id: "deity-1", name: "Plaintext Deity",
        description: "The patron of welcoming.",
        dm_notes: "GM-only reveal.",
      },
    ];
    const { plans } = planConversions("deities", rows);
    expect(plans.length).toBe(1);
    expect(Object.keys(plans[0]!.fields).sort()).toEqual(["description", "dm_notes"]);
  });

  it("converts pantheon description when plaintext", () => {
    const rows = [
      { id: "p-1", name: "Lesser Deities", description: "The small faiths most commonly named." },
    ];
    const { plans } = planConversions("pantheons", rows);
    expect(plans.length).toBe(1);
    expect(Object.keys(plans[0]!.fields)).toEqual(["description"]);
  });
});

describe("plan field-preview shape (for dry-run output readability)", () => {
  it("source preview is truncated to 80 chars with newlines escaped", () => {
    const longMd = "Paragraph one.\n\nParagraph two has bold **word** in it.\n\n" + "x".repeat(100);
    const rows = [{ id: "r", name: "long", appearance: longMd, personality: null, backstory: null, notes: null }];
    const { plans } = planConversions("npcs", rows);
    expect(plans[0]!.fields.appearance!.sourceLen).toBe(longMd.length);
    // Source is sliced to 80 chars then \n → \\n (each newline doubles).
    // Bound the result at 90 chars (slack for a handful of escaped newlines).
    expect(plans[0]!.fields.appearance!.sourcePreview.length).toBeLessThanOrEqual(90);
    // Newlines escaped so logs stay on one line
    expect(plans[0]!.fields.appearance!.sourcePreview).not.toContain("\n");
  });
});

describe("TABLE_FIELDS — schema invariants", () => {
  it("covers exactly the 3 expected tables", () => {
    expect(Object.keys(TABLE_FIELDS).sort()).toEqual(["deities", "npcs", "pantheons"]);
  });

  it("npcs has the 4 rich-text columns", () => {
    expect([...TABLE_FIELDS.npcs]).toEqual(["appearance", "personality", "backstory", "notes"]);
  });

  it("deities has description + dm_notes", () => {
    expect([...TABLE_FIELDS.deities]).toEqual(["description", "dm_notes"]);
  });

  it("pantheons has description only", () => {
    expect([...TABLE_FIELDS.pantheons]).toEqual(["description"]);
  });
});
