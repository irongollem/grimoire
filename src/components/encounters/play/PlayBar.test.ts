// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import type { FightSite } from "@/lib/locations/explore";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return { site: vueRef<{ id: string; name: string } | null>(null) };
});
vi.mock("@/composables/locations/useEncounterSite", () => ({ useEncounterSite: () => h.site }));

import PlayBar from "./PlayBar.vue";

function mountBar() {
  return mount(PlayBar, {
    props: {
      encounterId: "e1", view: { showTokens: true, showZones: true, showFog: false, showGrid: true, asPlayer: false, followTurn: false, showLegend: false },
      isLive: false, goingLive: false, canGoLive: false, canGenerate: false, turnTimerSeconds: null, turnResetKey: 0,
    },
    global: { stubs: { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, PlayViewMenu: true, OverflowMenu: true, ManualHelpLink: true, TurnTimer: true } },
  });
}

describe("PlayBar back link", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.site.value = null;
  });

  // #1125 decision 9: a fight started from exploring a site has a way back to the site.
  it("goes back to the site the fight is in, and to the encounters list when it is in none", () => {
    h.site.value = { id: "s1", name: "The Barrow" } satisfies FightSite;
    const inSite = mountBar();
    const back = inSite.get("[data-testid='play-back-to-site']");
    expect(back.text()).toContain("The Barrow");
    expect(back.attributes("href")).toBe("/locations/s1/explore");

    h.site.value = null;
    const outside = mountBar();
    expect(outside.find("[data-testid='play-back-to-site']").exists()).toBe(false);
    expect(outside.text()).toContain("Encounters");
  });
});

