import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import DowntimeActivityCard from "./DowntimeActivityCard.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { DowntimeActivity } from "@/types/downtime.types";

const activity = { id: "a1", title: "Carousing", glyph: "G", artUrl: "/carouse.webp", risk: 1, accent: "#aa5533" } as unknown as DowntimeActivity;
const mountCard = () => mount(DowntimeActivityCard, { props: { activity } });

describe("DowntimeActivityCard low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("shows the glyph face instead of the activity's art in low art, never a blank face", () => {
    expect(mountCard().find("img").exists()).toBe(true);
    useLowArt().setLowArt(true);
    const w = mountCard();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("G");
  });
});
