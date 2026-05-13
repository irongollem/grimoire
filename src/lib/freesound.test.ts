import { describe, it, expect } from "vitest";
import { normalizeLicense, buildAttribution, rewriteToCdn } from "./freesound";

describe("normalizeLicense", () => {
  it("maps Creative Commons 0 to cc0 (friendly form)", () => {
    expect(normalizeLicense("Creative Commons 0")).toBe("cc0");
    expect(normalizeLicense("creative commons 0")).toBe("cc0");
    expect(normalizeLicense("CC0 1.0")).toBe("cc0");
  });

  it("maps the CC0 URL form to cc0 — Freesound API actually returns URLs", () => {
    expect(normalizeLicense("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("cc0");
  });

  it("maps plain Attribution to cc-by (friendly form)", () => {
    expect(normalizeLicense("Attribution")).toBe("cc-by");
    expect(normalizeLicense("attribution")).toBe("cc-by");
    expect(normalizeLicense("Attribution 4.0")).toBe("cc-by");
  });

  it("maps the CC-BY URL forms to cc-by", () => {
    expect(normalizeLicense("http://creativecommons.org/licenses/by/3.0/")).toBe("cc-by");
    expect(normalizeLicense("https://creativecommons.org/licenses/by/4.0/")).toBe("cc-by");
  });

  it("rejects Attribution NonCommercial in both forms — the whole point of the filter", () => {
    expect(normalizeLicense("Attribution Noncommercial")).toBe(null);
    expect(normalizeLicense("attribution noncommercial 3.0")).toBe(null);
    expect(normalizeLicense("http://creativecommons.org/licenses/by-nc/3.0/")).toBe(null);
    expect(normalizeLicense("https://creativecommons.org/licenses/by-nc/4.0/")).toBe(null);
  });

  it("returns null for unknown licenses rather than guessing", () => {
    expect(normalizeLicense("Sampling+")).toBe(null);
    expect(normalizeLicense("")).toBe(null);
    expect(normalizeLicense("All Rights Reserved")).toBe(null);
  });
});

describe("buildAttribution", () => {
  const hit = { name: "Tavern Crowd", username: "innkeeper42", url: "https://freesound.org/s/12345/" };

  it("emits no attribution for CC0 — those contributors didn't ask to be credited", () => {
    expect(buildAttribution(hit, "cc0")).toEqual({ attribution: null, attribution_url: null });
  });

  it("emits a citation + source link for CC-BY", () => {
    expect(buildAttribution(hit, "cc-by")).toEqual({
      attribution: `"Tavern Crowd" by innkeeper42 on Freesound (CC-BY)`,
      attribution_url: "https://freesound.org/s/12345/",
    });
  });

  it("preserves quirky names verbatim — don't mangle the title", () => {
    const odd = { name: `Crash "loud"`, username: "fx_dude", url: "https://freesound.org/s/9/" };
    const out = buildAttribution(odd, "cc-by");
    expect(out.attribution).toBe(`"Crash "loud"" by fx_dude on Freesound (CC-BY)`);
  });
});

describe("rewriteToCdn", () => {
  it("rewrites the redirect host to the CDN host", () => {
    expect(rewriteToCdn("https://freesound.org/data/previews/316/316738_5123451-hq.mp3"))
      .toBe("https://cdn.freesound.org/previews/316/316738_5123451-hq.mp3");
  });

  it("also handles http (legacy URLs in older records)", () => {
    expect(rewriteToCdn("http://freesound.org/data/previews/1/1_a-hq.mp3"))
      .toBe("https://cdn.freesound.org/previews/1/1_a-hq.mp3");
  });

  it("leaves unrelated URLs alone — never rewrite a non-Freesound host", () => {
    expect(rewriteToCdn("https://example.com/audio.mp3")).toBe("https://example.com/audio.mp3");
    expect(rewriteToCdn("")).toBe("");
  });
});
