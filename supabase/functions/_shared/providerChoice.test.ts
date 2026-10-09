import { describe, expect, it } from "vitest";
import { chooseImageProvider, chooseTextProvider, imageOffered, textOffered } from "./providerChoice.ts";

// Production's shape on 9 Oct 2026: OpenAI is the only text provider on,
// both image providers are on.
const configs = {
  anthropic: { text_model: "claude-haiku-4-5", text_enabled: false, image_enabled: false },
  gemini: { text_model: "gemini-2.5-flash", text_enabled: false, image_enabled: true },
  openai: { text_model: "gpt-5.6-luna", text_enabled: true, image_enabled: true },
};
const platformKeys = { openai: true, gemini: true, anthropic: true };

describe("chooseTextProvider", () => {
  const text = (chosen: string | null, ownKeys: Record<string, boolean> = {}) =>
    chooseTextProvider({ chosen, ownKeys, platformKeys, configs });

  it("prices a credits campaign on the admin's provider, ignoring a stale text_provider", () => {
    expect(text("gemini")).toEqual({ provider: "openai", isByok: false });
  });

  it("uses the provider the DM chose when they hold its key", () => {
    expect(text("gemini", { openai: true, gemini: true })).toEqual({ provider: "gemini", isByok: true });
  });

  it("uses the only key the DM holds, as Campaign Settings says it will", () => {
    expect(text("openai", { gemini: true })).toEqual({ provider: "gemini", isByok: true });
    expect(text(null, { openai: true })).toEqual({ provider: "openai", isByok: true });
  });

  it("is null when the admin offers nothing, or before the config loads", () => {
    expect(chooseTextProvider({ chosen: null, ownKeys: {}, platformKeys, configs: {} })).toBeNull();
    expect(chooseTextProvider({ chosen: null, ownKeys: {}, platformKeys: {}, configs })).toBeNull();
    expect(chooseTextProvider({ chosen: null, ownKeys: {}, platformKeys, configs: null })).toBeNull();
  });

  it("answers an own key before the config loads", () => {
    expect(chooseTextProvider({ chosen: null, ownKeys: { gemini: true }, platformKeys, configs: null }))
      .toEqual({ provider: "gemini", isByok: true });
  });

  it("never falls back to an Anthropic key Settings no longer shows, but honours one named explicitly", () => {
    expect(text(null, { anthropic: true })).toEqual({ provider: "openai", isByok: false });
    expect(text("anthropic", { anthropic: true })).toEqual({ provider: "anthropic", isByok: true });
  });
});

describe("chooseImageProvider", () => {
  const image = (chosen: string | null, ownKeys: Record<string, boolean> = {}, cfg: typeof configs = configs) =>
    chooseImageProvider({ chosen, ownKeys, platformKeys, configs: cfg });
  const geminiOff = { ...configs, gemini: { ...configs.gemini, image_enabled: false } };

  it("honours Quick or Detailed while the admin offers it", () => {
    expect(image("gemini")).toEqual({ provider: "gemini", isByok: false });
    expect(image("openai")).toEqual({ provider: "openai", isByok: false });
  });

  it("reads an unset choice as Detailed", () => {
    expect(image(null)).toEqual({ provider: "openai", isByok: false });
  });

  it("falls to an offered provider when the choice is switched off", () => {
    expect(image("gemini", {}, geminiOff)).toEqual({ provider: "openai", isByok: false });
  });

  it("falls to the DM's own key before platform credits", () => {
    expect(image("gemini", { openai: true }, geminiOff)).toEqual({ provider: "openai", isByok: true });
  });

  it("uses the DM's own key for their choice whatever the switch says", () => {
    expect(image("gemini", { gemini: true }, geminiOff)).toEqual({ provider: "gemini", isByok: true });
  });

  it("before the config loads, answers only an own key for the pick and guesses no fallback", () => {
    const loading = (chosen: string, ownKeys: Record<string, boolean>) =>
      chooseImageProvider({ chosen, ownKeys, platformKeys, configs: null });
    expect(loading("gemini", { gemini: true })).toEqual({ provider: "gemini", isByok: true });
    expect(loading("gemini", { openai: true })).toBeNull();
  });

  it("keeps a pinned capability on its provider, with no fallback", () => {
    expect(chooseImageProvider({ chosen: "gemini", ownKeys: {}, platformKeys, configs: geminiOff, pinned: true }))
      .toEqual({ provider: "gemini", isByok: false });
    expect(chooseImageProvider({ chosen: "gemini", ownKeys: {}, platformKeys: { openai: true }, configs, pinned: true }))
      .toBeNull();
  });
});

describe("what the admin offers", () => {
  it("needs a model for text but only the switch for images", () => {
    expect(textOffered({ text_enabled: true, text_model: null })).toBe(false);
    expect(imageOffered({ image_enabled: true })).toBe(true);
    expect(imageOffered(undefined)).toBe(false);
  });
});
