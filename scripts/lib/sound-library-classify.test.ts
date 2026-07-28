import { describe, it, expect } from "vitest";
import {
  boardCategory,
  libraryTags,
  isLoopable,
  libraryStoragePath,
  libraryPublicUrl,
  BED_MIN_SECONDS,
} from "./sound-library-classify";

describe("boardCategory", () => {
  it("routes a long file from a bed-capable collection to the ambient bus", () => {
    expect(boardCategory("forest", 180)).toBe("ambient");
    expect(boardCategory("tavern", 90)).toBe("ambient");
  });

  it("routes a short file from the same collection to effects", () => {
    // A two-second drip belongs on the effects bus even though it lives in
    // `rain` — otherwise it ducks the music every time it fires.
    expect(boardCategory("rain", 2)).toBe("effects");
  });

  it("keeps a long foley file out of ambient", () => {
    // Length does not make a footstep sequence into ambience.
    expect(boardCategory("foley", 300)).toBe("effects");
    expect(boardCategory("monster", 120)).toBe("effects");
  });

  it("treats the threshold as inclusive", () => {
    expect(boardCategory("wind", BED_MIN_SECONDS)).toBe("ambient");
    expect(boardCategory("wind", BED_MIN_SECONDS - 0.01)).toBe("effects");
  });

  it("falls back to effects for a collection it has never seen", () => {
    expect(boardCategory("spaceship", 600)).toBe("effects");
  });
});

describe("libraryTags", () => {
  it("carries the theme label so triggers work without the DM tagging anything", () => {
    expect(libraryTags("tavern")).toEqual(["tavern"]);
    expect(libraryTags("thunder")).toEqual(["thunder", "storm"]);
    expect(libraryTags("ice")).toEqual(["ice", "arctic"]);
  });

  it("deduplicates when the collection is its own theme", () => {
    expect(libraryTags("forest")).toEqual(["forest"]);
  });

  it("gives a themeless collection only its own name", () => {
    // Inventing a theme for `foley` would make location triggers fire a coin
    // purse. Not firing is the better failure.
    expect(libraryTags("foley")).toEqual(["foley"]);
    expect(libraryTags("ambience")).toEqual(["ambience"]);
  });

  it("still tags an unknown collection with its own name", () => {
    expect(libraryTags("spaceship")).toEqual(["spaceship"]);
  });
});

describe("isLoopable", () => {
  it("believes the source when it says loop", () => {
    expect(isLoopable("rain/rain-gutter-loop", "Rain in the Gutter Loop")).toBe(true);
    expect(isLoopable("forest/forest-day", "Forest Day (looping)")).toBe(true);
    expect(isLoopable("fire/campfire-looped", "Campfire")).toBe(true);
  });

  it("does not guess a long file into a loop", () => {
    // The trap this exists to avoid: long enough to be a bed, still clicks.
    expect(isLoopable("river/park-river", "Park River Recording")).toBe(false);
  });

  it("is not fooled by a word that merely contains loop", () => {
    expect(isLoopable("foley/loophole", "Loophole")).toBe(false);
    expect(isLoopable("magic/bloop", "Bloop")).toBe(false);
  });
});

describe("libraryStoragePath", () => {
  it("files everything under the library prefix the admin policy keys off", () => {
    expect(libraryStoragePath("rain/rain-gutter-loop")).toBe("library/rain/rain-gutter-loop.ogg");
  });

  it("never uses an srd prefix — none of this is SRD content", () => {
    expect(libraryStoragePath("tavern/tavern-crowd")).not.toContain("srd");
  });
});

describe("libraryPublicUrl", () => {
  it("builds the public object URL", () => {
    expect(libraryPublicUrl("https://x.supabase.co", "library/rain/a.ogg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/sounds/library/rain/a.ogg",
    );
  });

  it("tolerates a trailing slash on the project URL", () => {
    expect(libraryPublicUrl("https://x.supabase.co/", "library/rain/a.ogg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/sounds/library/rain/a.ogg",
    );
  });
});
