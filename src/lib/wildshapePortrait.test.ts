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
});
