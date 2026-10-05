// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createEntityMentionExtension } from "./EntityMention";

/**
 * #932 story 3: a stored mention carries only `{ id, entityType }` — no
 * `label`, since the label is the entity's real name and a note's rich-text
 * JSON is downloaded verbatim by every viewer, player portal included. These
 * tests exercise the schema directly (`generateJSON`/`generateHTML`, not a
 * real `Editor`) so they never construct the Vue `NodeView` — that needs a
 * mounted Vue app context `addNodeView` isn't given here.
 */
const extensions = [StarterKit, createEntityMentionExtension({})];

describe("EntityMention — no label survives storage", () => {
  it("does not read a data-label attribute back out of parsed HTML, even when present in the markup", () => {
    const html = '<p><span data-entity-id="npc-1" data-entity-type="npc" data-label="Elminster"></span></p>';
    const json = generateJSON(html, extensions);
    const mention = json.content?.[0]?.content?.[0];
    expect(mention.type).toBe("entityMention");
    expect(mention.attrs).toEqual({ id: "npc-1", entityType: "npc" });
  });

  it("round-trips id/entityType through JSON -> HTML -> JSON with no data-label anywhere in the output", () => {
    const startJson = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "entityMention", attrs: { id: "npc-1", entityType: "npc" } }],
      }],
    };
    const html = generateHTML(startJson, extensions);
    expect(html).toContain('data-entity-id="npc-1"');
    expect(html).toContain('data-entity-type="npc"');
    expect(html).not.toContain("data-label");

    const roundTripped = generateJSON(html, extensions);
    const mention = roundTripped.content?.[0]?.content?.[0];
    expect(mention.attrs).toEqual({ id: "npc-1", entityType: "npc" });
  });

  it("ignores an extra label attr passed alongside id/entityType in already-parsed JSON", () => {
    const startJson = {
      type: "doc",
      content: [{
        type: "paragraph",
        // A pre-#932 stored row, or a stray extra key — either way, the
        // schema has no `label` attribute defined, so it cannot round-trip.
        content: [{ type: "entityMention", attrs: { id: "npc-1", entityType: "npc", label: "Elminster" } }],
      }],
    };
    const html = generateHTML(startJson, extensions);
    expect(html).not.toContain("data-label");
    expect(html).not.toContain("Elminster");
  });
});
