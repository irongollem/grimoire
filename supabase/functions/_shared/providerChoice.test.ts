import { describe, expect, it } from "vitest";
import { chooseImageProvider, chooseTextProvider, imageOffered, keysPresent, textOffered } from "./providerChoice.ts";

// Production's shape on 9 Oct 2026: OpenAI is the only text provider on,
// both image providers are on.
const configs = {
  anthropic: { text_model: "claude-haiku-4-5", text_enabled: false, image_enabled: false },
  gemini: { text_model: "gemini-2.5-flash", text_enabled: false, image_enabled: true },
  openai: { text_model: "gpt-6-luna", text_enabled: true, image_enabled: true },
};
const platformKeys = { openai: true, gemini: true, anthropic: true };

describe("chooseTextProvider", () => {
  it("answers with the provider the admin offers", () => {
    expect(chooseTextProvider({ platformKeys, configs })).toEqual({ provider: "openai" });
  });

  it("is null when the admin offers nothing, or before the config loads", () => {
    expect(chooseTextProvider({ platformKeys, configs: {} })).toBeNull();
    expect(chooseTextProvider({ platformKeys: {}, configs })).toBeNull();
    expect(chooseTextProvider({ platformKeys, configs: null })).toBeNull();
  });

  it("never routes to a provider the admin switched off, even one with a model set", () => {
    const offOnly = { gemini: configs.gemini, anthropic: configs.anthropic }; // both have text_model but text_enabled false
    expect(chooseTextProvider({ platformKeys, configs: offOnly })).toBeNull();
  });

  it("needs the platform's key for the provider as well as the admin's switch", () => {
    expect(chooseTextProvider({ platformKeys: { gemini: true }, configs })).toBeNull();
  });

  it("when the admin offers two providers, the first in the platform order answers", () => {
    const both = { ...configs, gemini: { ...configs.gemini, text_enabled: true } };
    expect(chooseTextProvider({ platformKeys, configs: both })).toEqual({ provider: "openai" });
    expect(chooseTextProvider({ platformKeys: { gemini: true, anthropic: true }, configs: both })).toEqual({ provider: "gemini" });
  });
});

describe("chooseImageProvider", () => {
  const image = (chosen: string | null, cfg: typeof configs = configs) =>
    chooseImageProvider({ chosen, platformKeys, configs: cfg });
  const geminiOff = { ...configs, gemini: { ...configs.gemini, image_enabled: false } };

  it("honours Quick or Detailed while the admin offers it", () => {
    expect(image("gemini")).toEqual({ provider: "gemini" });
    expect(image("openai")).toEqual({ provider: "openai" });
  });

  it("reads an unset choice as Detailed", () => {
    expect(image(null)).toEqual({ provider: "openai" });
  });

  it("falls to an offered provider when the choice is switched off", () => {
    expect(image("gemini", geminiOff)).toEqual({ provider: "openai" });
  });

  it("before the config loads, answers nothing and guesses no fallback", () => {
    expect(chooseImageProvider({ chosen: "gemini", platformKeys, configs: null })).toBeNull();
  });

  it("falls past a pick the admin offers but the platform holds no key for", () => {
    expect(chooseImageProvider({ chosen: "gemini", platformKeys: { openai: true }, configs }))
      .toEqual({ provider: "openai" });
    expect(chooseImageProvider({ chosen: "gemini", platformKeys: {}, configs })).toBeNull();
  });

  it("does not fall back onto a provider the admin has switched off", () => {
    const bothOff = { ...configs, openai: { ...configs.openai, image_enabled: false }, gemini: { ...configs.gemini, image_enabled: false } };
    expect(image("gemini", bothOff)).toBeNull();
  });

  it("with an unrecognised choice, the first provider of the platform order answers", () => {
    expect(image("nonsense")).toEqual({ provider: "openai" });
  });

  it("keeps a pinned capability on its provider, with no fallback", () => {
    expect(chooseImageProvider({ chosen: "gemini", platformKeys, configs: geminiOff, pinned: true }))
      .toEqual({ provider: "gemini" });
    expect(chooseImageProvider({ chosen: "gemini", platformKeys: { openai: true }, configs, pinned: true }))
      .toBeNull();
  });
});

describe("keysPresent", () => {
  it("counts a non-empty key as held and an empty or missing one as not", () => {
    expect(keysPresent({ openai: "sk-live", gemini: "", anthropic: null })).toEqual({ openai: true, gemini: false, anthropic: false });
  });
});

describe("what the admin offers", () => {
  it("needs a model for text but only the switch for images", () => {
    expect(textOffered({ text_enabled: true, text_model: null })).toBe(false);
    expect(textOffered({ text_enabled: false, text_model: "gpt-6-luna" })).toBe(false);
    expect(imageOffered({ image_enabled: true })).toBe(true);
    expect(imageOffered(undefined)).toBe(false);
  });
});
