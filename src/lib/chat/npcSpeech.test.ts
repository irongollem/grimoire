import { describe, expect, it } from "vitest";
import { npcSpeechMetadata, readNpcSpeech, safePortraitUrl } from "./npcSpeech";

describe("safePortraitUrl", () => {
  // Bug caught: a message's metadata (written by any member) used as an img src, so a script or tracking URL scheme is drawn.
  it("draws only an http(s) address", () => {
    expect(safePortraitUrl("https://cdn.example/a.webp")).toBe("https://cdn.example/a.webp");
    expect(safePortraitUrl("javascript:alert(1)")).toBeNull();
    expect(safePortraitUrl("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(safePortraitUrl("not a url")).toBeNull();
    expect(safePortraitUrl(42)).toBeNull();
  });
});

describe("readNpcSpeech", () => {
  // Bug caught: an ordinary chat line (or a character's) drawn as an NPC's bubble.
  it("is null for any line that does not name an NPC", () => {
    expect(readNpcSpeech(null)).toBeNull();
    expect(readNpcSpeech({ for_party_member_id: "p1" })).toBeNull();
    expect(readNpcSpeech({ for_npc_id: 7 })).toBeNull();
    expect(readNpcSpeech({ for_npc_id: "" })).toBeNull();
  });

  // Bug caught: a bad portrait URL or focal in the jsonb breaking the bubble instead of leaving the initial.
  it("reads the NPC and drops a bad portrait or focal point", () => {
    expect(readNpcSpeech({ for_npc_id: "n1", speaker_portrait_url: "https://x.test/a.webp", speaker_portrait_focal: { x: 1, y: 2 }, ai: true }))
      .toEqual({ npcId: "n1", portrait: "https://x.test/a.webp", focal: { x: 1, y: 2 }, ai: true });
    expect(readNpcSpeech({ for_npc_id: "n1", speaker_portrait_url: "javascript:1", speaker_portrait_focal: { x: "a" }, ai: "yes" }))
      .toEqual({ npcId: "n1", portrait: null, focal: null, ai: false });
  });
});

describe("npcSpeechMetadata", () => {
  // Bug caught: the AI mark or its provenance lost from a model-written line (AI Act Art. 50).
  it("marks a model's line as AI with its provenance, and leaves a DM's line unmarked", () => {
    const prov = { generatorType: "npc_voice", provider: "p", model: "m", generatedAt: "t", edited: false };
    expect(npcSpeechMetadata("n1", { portrait: "https://x.test/a.webp", focal: null }, { provenance: prov }))
      .toEqual({ for_npc_id: "n1", speaker_portrait_url: "https://x.test/a.webp", ai: true, ai_provenance: prov });
    expect(npcSpeechMetadata("n1", { portrait: null, focal: null })).toEqual({ for_npc_id: "n1" });
  });
});
