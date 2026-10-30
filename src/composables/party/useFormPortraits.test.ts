import { describe, expect, it, vi } from "vitest";
import type { Monster } from "@/types/monster.types";
import type { WildshapeState } from "@/types/encounter.types";

const beasts = vi.hoisted(() => ({ map: new Map<string, Monster>() }));
vi.mock("@/composables/monsters/useMonstersByIds", async () => {
  const { computed: c } = await import("vue");
  return { useMonstersByIds: () => ({ data: c(() => beasts.map), isLoading: c(() => false) }) };
});

import { useFormPortraits } from "./useFormPortraits";

const druid = { name: "Ysolde", portrait_url: "druid.webp", portrait_focal_point: { x: 1, y: 1 } };
const form = (beast_image_url: string | null): WildshapeState => ({
  monster_id: "srd_srd_dire_wolf",
  beast_name: "Dire Wolf",
  beast_image_url,
  beast_hp: 37,
  beast_max_hp: 37,
  beast_ac: "14",
});
const beast = (image_url: string | null) => ({ id: "srd_srd_dire_wolf", image_url }) as Monster;

describe("useFormPortraits", () => {
  it("draws the beast's live art over the stored copy, which a form assumed without art left null (maintainer report, wildshaped druid on the initiative track)", () => {
    beasts.map = new Map([["srd_srd_dire_wolf", beast("live-wolf.webp")]]);
    const portraitOf = useFormPortraits(() => [form(null)]);
    expect(portraitOf(druid, form(null)).src).toBe("live-wolf.webp");
    expect(portraitOf(druid, form("stale-copy.webp")).src).toBe("live-wolf.webp");
  });

  it("falls back to the stored copy when the beast read has no picture, and never to the druid's face", () => {
    beasts.map = new Map([["srd_srd_dire_wolf", beast(null)]]);
    const portraitOf = useFormPortraits(() => [form("stale-copy.webp")]);
    expect(portraitOf(druid, form("stale-copy.webp")).src).toBe("stale-copy.webp");
    expect(portraitOf(druid, form(null)).src).toBeNull();
  });

  it("an unshaped member keeps their own portrait whatever beasts are loaded", () => {
    beasts.map = new Map([["srd_srd_dire_wolf", beast("live-wolf.webp")]]);
    const portraitOf = useFormPortraits(() => [null]);
    const p = portraitOf(druid, null);
    expect(p).toMatchObject({ src: "druid.webp", focalPoint: { x: 1, y: 1 }, shaped: false });
  });
});
