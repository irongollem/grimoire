import { describe, expect, it } from "vitest";
import * as client from "./imagePrompt";
import * as edge from "@edge-shared/image-prompt.ts";

// The two copies cannot share a file (browser vs Deno), so every property is
// held on both, and the outputs are held equal so neither copy drifts.
const COPIES = [
  ["client", client],
  ["edge", edge],
] as const;

const PARTS = { base: "oil painting", setting: "a rugged wintry land of snowy peaks", subject: "an elderly butler" };

describe.each(COPIES)("%s image-prompt: character portraits", (_name, mod) => {
  // The bug: NPCs came out as full-body, low-angle hero shots looking off to
  // the side with the campaign's snowy mountains painted behind them, because
  // the portrait prompt asked for no framing and called the Setting
  // "only background atmosphere".
  it("frames a portrait at eye level, looking at the viewer, with no distant landscape", () => {
    const prompt = mod.buildLabelledImagePrompt(PARTS);
    const framing = prompt.split("\n").find((line) => line.startsWith("Framing:"));
    expect(framing).toMatch(/eye level/);
    expect(framing).toMatch(/looks directly at the viewer/);
    expect(framing).toMatch(/no distant landscape/);
  });

  it("does not tell the model to paint the Setting behind a portrait", () => {
    expect(mod.buildLabelledImagePrompt(PARTS)).not.toMatch(/background atmosphere/);
  });

  it.each(["npc_portrait", "party_member"])("regenerating a %s is framed as a portrait", (kind) => {
    expect(mod.buildEntityImagePrompt(kind, PARTS)).toMatch(/^Framing:.*eye level/m);
  });

  it.each(["monster", "location"])("a %s keeps the Setting as its backdrop and is not portrait-framed", (kind) => {
    const prompt = mod.buildEntityImagePrompt(kind, PARTS);
    expect(prompt).not.toMatch(/eye level/);
    expect(prompt).toMatch(/background atmosphere/);
  });

  it("asks the prompt author for a portrait's gaze, and only for a portrait", () => {
    expect(mod.buildImagePromptAuthorSystem("npc_portrait")).toMatch(/where the subject is looking/);
    expect(mod.buildImagePromptAuthorSystem("monster")).not.toMatch(/where the subject is looking/);
  });
});

describe("client and edge image-prompt copies", () => {
  it.each(["npc_portrait", "party_member", "monster", "location"])("build the same %s prompt and author system", (kind) => {
    expect(client.buildEntityImagePrompt(kind, PARTS)).toBe(edge.buildEntityImagePrompt(kind, PARTS));
    expect(client.buildImagePromptAuthorSystem(kind)).toBe(edge.buildImagePromptAuthorSystem(kind));
  });
});

describe("edge imageBoostFor", () => {
  // A portrait given the scene booster is pushed back toward a deep-background
  // hero shot; a scene given the portrait booster loses its atmospheric depth.
  it.each(["npc_portrait", "party_member", "npc_disguise"])("gives a %s the portrait booster", (kind) => {
    expect(edge.imageBoostFor(kind)).toBe("portrait");
  });

  it.each(["monster", "location", "chronicler"])("gives a %s the scene booster", (kind) => {
    expect(edge.imageBoostFor(kind)).toBe(true);
  });
});
