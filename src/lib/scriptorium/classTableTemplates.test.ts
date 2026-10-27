// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { getDefaultSpellSlots, THIRD_CASTER_SLOTS } from "@/types/spell.types";
import { fullCasterTable, halfCasterTable, thirdCasterTable, martialTable } from "./classTableTemplates";

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function mount(content: object): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content: [content] },
    extensions: createScriptoriumExtensions(),
  });
  editors.push(editor);
  return editor;
}

/** Every table has 20 level rows plus one header row. */
function tableRows(json: JSONContent): JSONContent[] {
  const wide = (json.content ?? [])[0];
  const table = (wide.content ?? [])[0];
  return table.content ?? [];
}

describe("class progression table templates", () => {
  it.each([
    ["fullCasterTable", fullCasterTable, 13],
    ["halfCasterTable", halfCasterTable, 8],
    ["thirdCasterTable", thirdCasterTable, 7],
  ] as const)("%s wraps a 21-row table (header + 20 levels) with %d columns", (_name, factory, colCount) => {
    const editor = mount(factory());
    const json = editor.getJSON();
    expect((json.content ?? [])[0]?.type).toBe("wideBlock");
    const rows = tableRows(json);
    expect(rows).toHaveLength(21);
    expect(rows[0].type).toBe("tableRow");
    expect((rows[0].content ?? [])).toHaveLength(colCount);
    // Every data row has the same column count as the header.
    for (const row of rows.slice(1)) {
      expect((row.content ?? [])).toHaveLength(colCount);
    }
  });

  it("martialTable uses the given custom column name in its header", () => {
    const editor = mount(martialTable("Ki Points"));
    expect(editor.getHTML()).toContain("Ki Points");
    const rows = tableRows(editor.getJSON());
    expect(rows).toHaveLength(21);
  });
});

// The progression values are rules data, so they are checked against the
// repo's own spell-slot tables (PHB 2014 class tables) rather than against
// themselves: a typo in either copy shows up as a disagreement.
describe("class progression table values", () => {
  type Cell = { content?: { content?: { text?: string }[] }[] };
  type Row = { content: Cell[] };
  const text = (c: Cell) => c.content?.[0]?.content?.[0]?.text ?? "";
  /** The data rows of a template as arrays of cell text, header dropped. */
  function dataRows(table: object): string[][] {
    const rows = ((table as { content: { content: Row[] }[] }).content[0] as unknown as { content: Row[] }).content;
    return rows.slice(1).map((r) => r.content.map(text));
  }
  const slotCell = (max: number | undefined) => (max ? String(max) : "\u2014");
  const slotsAt = (cls: "Wizard" | "Paladin", level: number, columns: number) => {
    const byLevel = new Map(getDefaultSpellSlots(cls, level, "2014").map((s) => [s.level, s.max]));
    return Array.from({ length: columns }, (_, i) => slotCell(byLevel.get(i + 1)));
  };

  it("every table gives the proficiency bonus the PHB does: +2 at level 1, rising one every fourth level", () => {
    for (const rows of [dataRows(fullCasterTable()), dataRows(halfCasterTable()), dataRows(thirdCasterTable()), dataRows(martialTable("Ki"))]) {
      rows.forEach((row, i) => {
        expect(row[0]).toBe(String(i + 1));
        expect(row[1]).toBe(`+${Math.ceil((i + 1) / 4) + 1}`);
      });
    }
  });

  it("full casters match the Wizard's slots and cantrips (3, then 4 at level 4, 5 at level 10)", () => {
    dataRows(fullCasterTable()).forEach((row, i) => {
      const level = i + 1;
      expect(row.slice(4)).toEqual(slotsAt("Wizard", level, 9));
      expect(row[3]).toBe(String(level >= 10 ? 5 : level >= 4 ? 4 : 3));
    });
  });

  it("half casters match the Paladin's slots", () => {
    dataRows(halfCasterTable()).forEach((row, i) => {
      expect(row.slice(3)).toEqual(slotsAt("Paladin", i + 1, 5));
    });
  });

  it("third casters match the Eldritch Knight's slots", () => {
    dataRows(thirdCasterTable()).forEach((row, i) => {
      expect(row.slice(3)).toEqual(Array.from({ length: 4 }, (_, k) => slotCell(THIRD_CASTER_SLOTS[i][k])));
    });
  });
});
