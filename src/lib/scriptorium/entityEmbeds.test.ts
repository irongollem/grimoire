// @vitest-environment jsdom
// resolveEntityEmbeds sanitizes through DOMPurify, which happy-dom (the repo
// default) does not sanitize correctly under (see sanitizeHtml.test.ts's own
// note) — this file needs a spec-complete DOM, same as that one.
import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  collectEntityRefs,
  entityRefKey,
  resolveEntityEmbeds,
  missingEntityMarkerHtml,
  buildEntityEmbedDocumentJson,
  buildEntityEmbedDocumentContent,
} from "./entityEmbeds";

function embed(entityType: string, entityId: string): JSONContent {
  return { type: "entityEmbed", attrs: { entityType, entityId } };
}

describe("collectEntityRefs", () => {
  it("finds refs nested anywhere in the document", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        embed("npc", "npc-1"),
        {
          type: "noteBlock",
          content: [embed("monster", "srd_owlbear")],
        },
      ],
    };
    const refs = collectEntityRefs(doc);
    expect(refs).toEqual([
      { type: "npc", id: "npc-1" },
      { type: "monster", id: "srd_owlbear" },
    ]);
  });

  it("dedupes repeated refs to the same entity", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [embed("npc", "npc-1"), embed("npc", "npc-1")],
    };
    expect(collectEntityRefs(doc)).toEqual([{ type: "npc", id: "npc-1" }]);
  });

  it("returns an empty array for a document with no embeds", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
    expect(collectEntityRefs(doc)).toEqual([]);
  });

  it("handles null/undefined input", () => {
    expect(collectEntityRefs(null)).toEqual([]);
    expect(collectEntityRefs(undefined)).toEqual([]);
  });

  it("ignores an entityEmbed node missing its attrs", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "entityEmbed", attrs: {} }] };
    expect(collectEntityRefs(doc)).toEqual([]);
  });
});

describe("entityRefKey", () => {
  it("combines type and id", () => {
    expect(entityRefKey({ type: "npc", id: "abc" })).toBe("npc:abc");
  });
});

describe("resolveEntityEmbeds", () => {
  it("returns the HTML unchanged when there is no embed placeholder", () => {
    const html = "<p>Just prose.</p>";
    expect(resolveEntityEmbeds(html, {})).toBe(html);
  });

  it("fills a placeholder with the looked-up, sanitized HTML", () => {
    const html =
      '<h1>Title</h1><div data-type="entity-embed" data-entity-type="npc" data-entity-id="npc-1"></div>';
    const out = resolveEntityEmbeds(html, { "npc:npc-1": "<h2>Aldric</h2><p>A wandering smith.</p>" });
    expect(out).toContain('data-entity-type="npc"');
    expect(out).toContain('data-entity-id="npc-1"');
    expect(out).toContain("<h2>Aldric</h2>");
    expect(out).toContain("A wandering smith.");
  });

  it("strips unsafe markup from the resolved content", () => {
    const html = '<div data-type="entity-embed" data-entity-type="npc" data-entity-id="npc-1"></div>';
    const out = resolveEntityEmbeds(html, {
      "npc:npc-1": '<p>Hi</p><script>alert(1)</script><img src=x onerror="alert(2)">',
    });
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("onerror");
  });

  it("shows the missing marker when the lookup has nothing for the ref", () => {
    const html = '<div data-type="entity-embed" data-entity-type="monster" data-entity-id="gone"></div>';
    const out = resolveEntityEmbeds(html, {});
    expect(out).toContain("This monster is no longer available.");
  });

  it("preserves data-block-id and other attributes on the embed element", () => {
    const html =
      '<div data-block-id="b1" data-type="entity-embed" data-entity-type="npc" data-entity-id="npc-1" class="sc-entity-embed"></div>';
    const out = resolveEntityEmbeds(html, { "npc:npc-1": "<p>Body</p>" });
    expect(out).toContain('data-block-id="b1"');
    expect(out).toContain("sc-entity-embed");
  });

  it("resolves multiple embeds independently", () => {
    const html =
      '<div data-type="entity-embed" data-entity-type="npc" data-entity-id="a"></div>' +
      '<div data-type="entity-embed" data-entity-type="npc" data-entity-id="b"></div>';
    const out = resolveEntityEmbeds(html, { "npc:a": "<p>A</p>", "npc:b": "<p>B</p>" });
    expect(out).toContain("<p>A</p>");
    expect(out).toContain("<p>B</p>");
  });
});

describe("missingEntityMarkerHtml", () => {
  it("has type-specific, em-dash-free wording", () => {
    for (const type of ["npc", "monster", "spell", "item", "location", "quest"] as const) {
      const html = missingEntityMarkerHtml(type);
      expect(html).toContain("no longer available");
      expect(html).not.toContain("—");
    }
  });
});

describe("buildEntityEmbedDocumentJson / buildEntityEmbedDocumentContent", () => {
  it("builds a document holding just the live embed (the entity's body carries its own name)", () => {
    expect(buildEntityEmbedDocumentJson("npc", "npc-1")).toEqual({
      type: "doc",
      content: [{ type: "entityEmbed", attrs: { entityType: "npc", entityId: "npc-1" } }],
    });
  });

  it("stringifies to the same shape", () => {
    const content = buildEntityEmbedDocumentContent("monster", "srd_owlbear");
    expect(JSON.parse(content)).toEqual(buildEntityEmbedDocumentJson("monster", "srd_owlbear"));
  });
});
