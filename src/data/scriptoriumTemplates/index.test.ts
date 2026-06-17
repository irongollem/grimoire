import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { SCRIPTORIUM_TEMPLATES } from "./index";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function topLevelTypes(json: { content?: { type?: string }[] }): string[] {
  return (json.content ?? []).map((n) => n.type ?? "");
}

// `content` typed as object to sidestep Tiptap's strict typed-schema signature
// (the app passes JSON.parse(...) which is `any`); a built template is an object.
function mountTemplate(content: object): Editor {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: createScriptoriumExtensions(),
  });
}

describe("Scriptorium templates", () => {
  it("have unique ids and required metadata", () => {
    const ids = SCRIPTORIUM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of SCRIPTORIUM_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.docType).toBeTruthy();
    }
  });

  it("build() is fresh each call (no shared mutable node objects)", () => {
    for (const t of SCRIPTORIUM_TEMPLATES) {
      const a = t.build();
      const b = t.build();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    }
  });

  it.each(SCRIPTORIUM_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s loads into the editor without dropping top-level blocks",
    (_id, template) => {
      const builtTypes = topLevelTypes(template.build());
      editor = mountTemplate(template.build());
      const gotTypes = topLevelTypes(editor.getJSON());
      // Nothing rejected by the schema: every built block survives in order
      // (ProseMirror may append a trailing paragraph, which the prefix ignores).
      expect(gotTypes.slice(0, builtTypes.length)).toEqual(builtTypes);
      expect(editor.getHTML().length).toBeGreaterThan(0);
    },
  );

  it("templates with a cover include a coverPage node", () => {
    for (const id of ["blank-book", "adventure-module", "monster-compendium", "spell-compendium", "subclass-supplement"]) {
      const t = SCRIPTORIUM_TEMPLATES.find((x) => x.id === id)!;
      const types = (t.build().content ?? []).map((n) => n.type);
      expect(types).toContain("coverPage");
    }
  });
});
