import { describe, it, expect } from "vitest";
import { formPortrait } from "./wildshapePortrait";
import type { WildshapeState } from "@/types/encounter.types";

const druid = { name: "Briar", portrait_url: "https://cdn.test/briar.webp", portrait_focal_point: { x: 0.4, y: 0.2 } };

function wolf(beast_image_url: string | null): WildshapeState {
  return { monster_id: "srd_wolf", beast_name: "Wolf", beast_image_url, beast_hp: 11, beast_max_hp: 11, beast_ac: "13" };
}

describe("formPortrait", () => {
  it("draws the character's own portrait, with its focal point, when not shaped", () => {
    expect(formPortrait(druid, null)).toEqual({ src: druid.portrait_url, focalPoint: { x: 0.4, y: 0.2 }, alt: "Briar", shaped: false });
  });

  it("draws the beast, without the character's focal point, while shaped", () => {
    expect(formPortrait(druid, wolf("https://cdn.test/wolf.webp"))).toEqual({
      src: "https://cdn.test/wolf.webp",
      focalPoint: null,
      alt: "Wolf",
      shaped: true,
    });
  });

  it("draws no picture, rather than the character's face, for a beast without art", () => {
    expect(formPortrait(druid, wolf(null))).toEqual({ src: null, focalPoint: null, alt: "Wolf", shaped: true });
  });

  it("has no focal point for a character who never set one", () => {
    expect(formPortrait({ name: "Briar", portrait_url: null }, undefined)).toEqual({ src: null, focalPoint: null, alt: "Briar", shaped: false });
  });

  // A form assumed without the library art merged copied a null picture; the
  // beast's live picture, when the caller has it, is drawn instead (5 Oct 2026).
  it("prefers the beast's live picture to the copy the form took", () => {
    expect(formPortrait(druid, wolf(null), "https://cdn.test/wolf-art.webp").src).toBe("https://cdn.test/wolf-art.webp");
    expect(formPortrait(druid, wolf("https://cdn.test/old.webp"), "https://cdn.test/new.webp").src).toBe("https://cdn.test/new.webp");
  });

  it("keeps the form's copy while the live picture is not known", () => {
    expect(formPortrait(druid, wolf("https://cdn.test/wolf.webp"), null).src).toBe("https://cdn.test/wolf.webp");
  });

  it("never lets a live picture replace the character's own portrait", () => {
    expect(formPortrait(druid, null, "https://cdn.test/wolf-art.webp").src).toBe(druid.portrait_url);
  });
});
