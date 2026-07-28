import { describe, it, expect } from "vitest";
import { SOUND_PROVIDERS, getProvider, defaultProvider } from "./index";

describe("provider registry", () => {
  it("registers at least one provider", () => {
    expect(SOUND_PROVIDERS.length).toBeGreaterThan(0);
  });

  it("gives every provider a unique id", () => {
    const ids = SOUND_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a provider by id", () => {
    expect(getProvider("freesound")?.id).toBe("freesound");
    expect(getProvider("grimoire")?.id).toBe("grimoire");
  });

  it("leads with our own catalogue", () => {
    // The default tab should be the source that is free on every tier and
    // whose terms cannot change under us.
    expect(defaultProvider()?.id).toBe("grimoire");
  });

  it("returns undefined for a provider that has been removed", () => {
    // Removing a provider is a supported operation — callers must cope with a
    // stale id rather than assuming every id still resolves.
    expect(getProvider("some-retired-library")).toBeUndefined();
  });

  it("defaults to the first registered provider rather than a hardcoded name", () => {
    // So deleting a provider cannot leave the default pointing at nothing.
    expect(defaultProvider()).toBe(SOUND_PROVIDERS[0]);
  });
});
