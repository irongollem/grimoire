import { describe, expect, it } from "vitest";
import { remapMentionIds } from "@/lib/campaign/mentionRemap";
import type { IdMap } from "@/lib/campaign/campaignSerialization";

function mention(id: string, entityType = "npc") {
  return { type: "entityMention", attrs: { id, entityType } };
}

function doc(...content: unknown[]) {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

describe("remapMentionIds", () => {
  it("drops the stored name from a mention in a backup written before mentions were id-only", () => {
    const legacy = { type: "entityMention", attrs: { id: "srd_owlbear", entityType: "monster", label: "Owlbear" } };
    const result = remapMentionIds(JSON.stringify(doc(legacy)), new Map());

    expect(JSON.parse(result!).content[0].content[0].attrs).toEqual({ id: "srd_owlbear", entityType: "monster" });
  });

  it("remaps a single top-level mention", () => {
    const idMap: IdMap = new Map([["old-npc", "new-npc"]]);
    const content = JSON.stringify(doc(mention("old-npc")));

    const result = remapMentionIds(content, idMap);

    const parsed = JSON.parse(result!);
    expect(parsed.content[0].content[0].attrs.id).toBe("new-npc");
  });

  it("remaps several mentions of different entity types in one document", () => {
    const idMap: IdMap = new Map([
      ["old-npc", "new-npc"],
      ["old-loc", "new-loc"],
      ["old-pm", "new-pm"],
    ]);
    const content = JSON.stringify(
      doc(
        { type: "text", text: "Went to " },
        mention("old-loc", "location"),
        { type: "text", text: " with " },
        mention("old-pm", "player"),
        { type: "text", text: " to meet " },
        mention("old-npc", "npc"),
      ),
    );

    const result = remapMentionIds(content, idMap);
    const parsed = JSON.parse(result!);
    const mentionNodes = parsed.content[0].content.filter(
      (n: { type: string }) => n.type === "entityMention",
    );
    expect(mentionNodes.map((n: { attrs: { id: string } }) => n.attrs.id)).toEqual([
      "new-loc",
      "new-pm",
      "new-npc",
    ]);
  });

  it("remaps a mention nested several levels deep (e.g. inside a list)", () => {
    const idMap: IdMap = new Map([["old-npc", "new-npc"]]);
    const nested = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [mention("old-npc")] },
              ],
            },
          ],
        },
      ],
    };
    const content = JSON.stringify(nested);

    const result = remapMentionIds(content, idMap);
    const parsed = JSON.parse(result!);
    expect(
      parsed.content[0].content[0].content[0].content[0].attrs.id,
    ).toBe("new-npc");
  });

  it("leaves an id untouched when it is not in the map", () => {
    const idMap: IdMap = new Map([["old-npc", "new-npc"]]);
    // A library monster text id and the party sentinel — neither ever gets a
    // fresh uuid from buildIdMapFromArrays, so neither is in the map.
    const content = JSON.stringify(doc(mention("srd_owlbear", "monster"), mention("party-group", "party")));

    const result = remapMentionIds(content, idMap);

    expect(result).toBe(content); // nothing changed -> same string back
    const parsed = JSON.parse(result!);
    expect(parsed.content[0].content[0].attrs.id).toBe("srd_owlbear");
    expect(parsed.content[0].content[1].attrs.id).toBe("party-group");
  });

  it("returns unchanged content when no mention in the map appears", () => {
    const idMap: IdMap = new Map([["unrelated", "unrelated-new"]]);
    const content = JSON.stringify(doc({ type: "text", text: "Just plain prose." }));

    expect(remapMentionIds(content, idMap)).toBe(content);
  });

  it("passes through invalid JSON unchanged (legacy plain-text rows)", () => {
    const idMap: IdMap = new Map([["old-npc", "new-npc"]]);
    const plainText = "This is a legacy plain-text note, not Tiptap JSON.";

    expect(remapMentionIds(plainText, idMap)).toBe(plainText);
  });

  it("passes through empty string unchanged", () => {
    const idMap: IdMap = new Map();
    expect(remapMentionIds("", idMap)).toBe("");
  });

  it("returns null for null input", () => {
    const idMap: IdMap = new Map();
    expect(remapMentionIds(null, idMap)).toBeNull();
  });

  it("never throws on a JSON value that isn't a Tiptap doc shape", () => {
    const idMap: IdMap = new Map([["old", "new"]]);
    expect(remapMentionIds(JSON.stringify(42), idMap)).toBe(JSON.stringify(42));
    expect(remapMentionIds(JSON.stringify("just a string"), idMap)).toBe(JSON.stringify("just a string"));
    expect(remapMentionIds(JSON.stringify(null), idMap)).toBe(JSON.stringify(null));
    expect(remapMentionIds(JSON.stringify([1, 2, 3]), idMap)).toBe(JSON.stringify([1, 2, 3]));
  });

  it("does not mutate the idMap or leave stray references between calls", () => {
    const idMap: IdMap = new Map([["old-npc", "new-npc"]]);
    const content = JSON.stringify(doc(mention("old-npc")));

    remapMentionIds(content, idMap);

    expect(idMap.size).toBe(1);
    expect(idMap.get("old-npc")).toBe("new-npc");
  });
});
