// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { KIT_MIME, endKitDrag } from "@/scriptorium/lib/kit/kitItem";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  endKitDrag();
});

const NOTE = '<div data-type="noteBlock" class="sc-note"><p>inside</p></div>';

function open(): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    content: `<p>before</p>${NOTE}<p>after</p>`,
    extensions: createScriptoriumExtensions(),
  });
  return editor;
}

/** Aims the pointer at `pos` and at the lower or upper half of the block holding it: happy-dom has no layout to ask. */
function aim(ed: Editor, pos: number, half: "upper" | "lower") {
  const box = document.createElement("div");
  box.getBoundingClientRect = () => ({ top: 100, height: 40, bottom: 140, left: 0, right: 10, width: 10, x: 0, y: 100, toJSON: () => ({}) });
  vi.spyOn(ed.view, "posAtCoords").mockReturnValue({ pos, inside: pos });
  vi.spyOn(ed.view, "nodeDOM").mockReturnValue(box);
  return half === "upper" ? 105 : 135;
}

function drop(ed: Editor, y: number, raw: string): { handled: boolean; prevented: boolean } {
  const preventDefault = vi.fn();
  const event = { clientX: 5, clientY: y, preventDefault, dataTransfer: { types: [KIT_MIME], getData: () => raw } } as unknown as DragEvent;
  const handled = ed.view.someProp("handleDrop", (f) => f(ed.view, event, null as never, false)) === true;
  return { handled, prevented: preventDefault.mock.calls.length > 0 };
}
const names = (ed: Editor) => (ed.getJSON().content ?? []).map((n) => n.type);
const TABLE = JSON.stringify({ kind: "block", label: "Table" });

describe("dropping a kit item on the page", () => {
  // Fails on: a drop over a box's text nesting the block inside the box (a table inside a sidebar).
  it("lands between top-level blocks, after the box when the pointer is in its lower half", () => {
    const ed = open();
    const inside = ed.state.doc.child(0).nodeSize + 3;
    expect(drop(ed, aim(ed, inside, "lower"), TABLE).handled).toBe(true);
    expect(names(ed).slice(0, 4)).toEqual(["paragraph", "noteBlock", "table", "paragraph"]);
    expect(JSON.stringify(ed.getJSON().content?.[1])).not.toContain('"table"');
  });

  // Fails on: the upper half also dropping after the box, so a block can never go above one.
  it("lands before the box when the pointer is in its upper half", () => {
    const ed = open();
    const inside = ed.state.doc.child(0).nodeSize + 3;
    drop(ed, aim(ed, inside, "upper"), TABLE);
    expect(names(ed).slice(0, 3)).toEqual(["paragraph", "table", "noteBlock"]);
  });

  // Fails on: a drop onto a read-only page (the reader, a locked book) changing the document.
  it("inserts nothing when the editor is read-only", () => {
    const ed = open();
    ed.setEditable(false);
    const before = ed.getHTML();
    const inside = ed.state.doc.child(0).nodeSize + 3;
    const result = drop(ed, aim(ed, inside, "lower"), TABLE);
    expect(result.handled).toBe(false);
    expect(ed.getHTML()).toBe(before);
  });

  // Fails on: junk dragged in from outside the app (not a kit payload) inserting a block or swallowing the drop.
  it.each([["not json"], ['{"kind":"entity","entityType":"dragon","entityId":"1","name":"x"}'], [""]])(
    "ignores a payload that does not parse: %j",
    (raw) => {
      const ed = open();
      const before = ed.getHTML();
      const inside = ed.state.doc.child(0).nodeSize + 3;
      const result = drop(ed, aim(ed, inside, "lower"), raw);
      expect(result).toEqual({ handled: false, prevented: false });
      expect(ed.getHTML()).toBe(before);
    },
  );
});
