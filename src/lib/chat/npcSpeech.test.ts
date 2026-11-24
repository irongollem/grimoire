import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { npcSpeechMetadata, ownHostPortraitUrl, readNpcSpeech, safePortraitUrl } from "./npcSpeech";

beforeEach(() => vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.dungeongrimoire.test"));
afterEach(() => vi.unstubAllEnvs());

const CDN_PIC = "https://cdn.dungeongrimoire.test/npc-images/u/a.webp";

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
    expect(readNpcSpeech(null, true)).toBeNull();
    expect(readNpcSpeech({ for_party_member_id: "p1" }, true)).toBeNull();
    expect(readNpcSpeech({ for_npc_id: 7 }, true)).toBeNull();
    expect(readNpcSpeech({ for_npc_id: "" }, true)).toBeNull();
  });

  // Bug caught: a bad portrait URL or focal in the jsonb breaking the bubble instead of leaving the initial.
  it("reads the NPC and drops a bad portrait or focal point", () => {
    expect(readNpcSpeech({ for_npc_id: "n1", speaker_portrait_url: CDN_PIC, speaker_portrait_focal: { x: 1, y: 2 }, ai: true }, true))
      .toEqual({ npcId: "n1", portrait: CDN_PIC, focal: { x: 1, y: 2 }, ai: true });
    expect(readNpcSpeech({ for_npc_id: "n1", speaker_portrait_url: "javascript:1", speaker_portrait_focal: { x: "a" }, ai: "yes" }, true))
      .toEqual({ npcId: "n1", portrait: null, focal: null, ai: false });
  });
});

describe("npcSpeechMetadata", () => {
  // Bug caught: the AI mark or its provenance lost from a model-written line (AI Act Art. 50).
  it("marks a model's line as AI with its provenance, and leaves a DM's line unmarked", () => {
    const prov = { generatorType: "npc_voice", provider: "p", model: "m", generatedAt: "t", edited: false };
    expect(npcSpeechMetadata("n1", { portrait: CDN_PIC, focal: null }, { provenance: prov }))
      .toEqual({ for_npc_id: "n1", speaker_portrait_url: CDN_PIC, ai: true, ai_provenance: prov });
    expect(npcSpeechMetadata("n1", { portrait: null, focal: null })).toEqual({ for_npc_id: "n1" });
  });
});

describe("readNpcSpeech: who may speak for an NPC", () => {
  // Bug caught: a player inserting a chat row with `for_npc_id` and drawing a forged NPC bubble (with the AI mark and a picture).
  it("draws a line as an NPC only when a DM of the campaign sent it", () => {
    const forged = { for_npc_id: "n1", speaker_portrait_url: CDN_PIC, ai: true };
    expect(readNpcSpeech(forged, false)).toBeNull();
    expect(readNpcSpeech(forged, true)).toMatchObject({ npcId: "n1", portrait: CDN_PIC, ai: true });
  });
});

describe("ownHostPortraitUrl", () => {
  // Bug caught: a picture from any host drawn in every viewer's chat, leaking their address to whoever wrote the line.
  it("draws https on the asset CDN or the Supabase origin and nothing else", () => {
    expect(ownHostPortraitUrl(CDN_PIC)).toBe(CDN_PIC);
    expect(ownHostPortraitUrl("http://localhost:54321/storage/v1/object/public/npc-images/a.webp")).not.toBeNull();
    expect(ownHostPortraitUrl("https://evil.example/pixel.png")).toBeNull();
    expect(ownHostPortraitUrl("http://cdn.dungeongrimoire.test/npc-images/a.webp")).toBeNull();
    expect(ownHostPortraitUrl("https://cdn.dungeongrimoire.test.evil.example/a.webp")).toBeNull();
    expect(readNpcSpeech({ for_npc_id: "n1", speaker_portrait_url: "https://evil.example/pixel.png" }, true)?.portrait).toBeNull();
  });

  // Bug caught: a portrait from a foreign host stored in the shared chat row at write time.
  it("is not stored in the metadata either", () => {
    expect(npcSpeechMetadata("n1", { portrait: "https://evil.example/p.png", focal: null })).toEqual({ for_npc_id: "n1" });
  });
});
