import { describe, it, expect } from "vitest";
import { docMentionsEntity, contentMentionsEntity } from "@/lib/tiptap/mentions";

function mentionNode(id: string) {
  return { type: "entityMention", attrs: { id, entityType: "npc", label: "Someone" } };
}

describe("docMentionsEntity", () => {
  it("finds a top-level mention node", () => {
    expect(docMentionsEntity(mentionNode("npc-1"), "npc-1")).toBe(true);
  });

  it("finds a mention nested several levels deep", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello " }, mentionNode("npc-1"), { type: "text", text: "!" }],
        },
      ],
    };
    expect(docMentionsEntity(doc, "npc-1")).toBe(true);
  });

  it("returns false when the id doesn't match any mention", () => {
    const doc = { type: "doc", content: [mentionNode("npc-1")] };
    expect(docMentionsEntity(doc, "npc-2")).toBe(false);
  });

  it("returns false when the id appears only as a substring of another mention's id", () => {
    // The composable's `like` query can surface this; the walk must not
    // treat a substring match as a real mention.
    const doc = { type: "doc", content: [mentionNode("npc-123")] };
    expect(docMentionsEntity(doc, "npc-1")).toBe(false);
  });

  it("returns false for an empty id", () => {
    expect(docMentionsEntity(mentionNode(""), "")).toBe(false);
  });

  it("does not throw on a doc with no content array", () => {
    expect(docMentionsEntity({ type: "doc" }, "npc-1")).toBe(false);
  });

  it("does not throw on a node whose attrs are missing", () => {
    expect(docMentionsEntity({ type: "entityMention" }, "npc-1")).toBe(false);
  });

  it("does not throw on primitive input", () => {
    expect(docMentionsEntity("just a string", "npc-1")).toBe(false);
    expect(docMentionsEntity(42, "npc-1")).toBe(false);
    expect(docMentionsEntity(null, "npc-1")).toBe(false);
    expect(docMentionsEntity(undefined, "npc-1")).toBe(false);
  });

  it("does not throw when content holds non-object entries", () => {
    const doc = { type: "doc", content: ["not a node", 1, null, mentionNode("npc-1")] };
    expect(docMentionsEntity(doc, "npc-1")).toBe(true);
  });
});

describe("contentMentionsEntity", () => {
  it("parses a JSON string and finds the mention", () => {
    const content = JSON.stringify({ type: "doc", content: [mentionNode("npc-1")] });
    expect(contentMentionsEntity(content, "npc-1")).toBe(true);
  });

  it("returns false for null content", () => {
    expect(contentMentionsEntity(null, "npc-1")).toBe(false);
  });

  it("returns false for undefined content", () => {
    expect(contentMentionsEntity(undefined, "npc-1")).toBe(false);
  });

  it("returns false, not throw, on malformed JSON", () => {
    expect(contentMentionsEntity("{not valid json", "npc-1")).toBe(false);
  });

  it("returns false for an empty id", () => {
    const content = JSON.stringify(mentionNode("npc-1"));
    expect(contentMentionsEntity(content, "")).toBe(false);
  });
});
