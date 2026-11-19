import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SoloBar from "./SoloBar.vue";

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });
const mountBar = (hitPoints: { current: number; max: number } | null) => mount(SoloBar, { props: { ...base, hitPoints }, global: { plugins: [router] } });
const base = { campaign: "Sugarwell", character: "Inkling", credits: 0, turns: 0, balance: null, narratorVoice: "male" as const };

describe("SoloBar", () => {
  // Bug caught: a phone bar that says "24 of 27" for a character whose hit points are not known yet, or says nothing of who plays.
  it("falls back to the character's name alone while hit points are not known", () => {
    const w = mountBar(null);
    expect(w.get('[data-testid="solo-bar-who"]').text()).toBe("Playing Inkling");
  });

  // Bug caught: hit points that stay at 24 after the character is hurt, because the bar copied them once.
  it("follows the hit points as they change", async () => {
    const w = mountBar({ current: 24, max: 27 });
    expect(w.get('[data-testid="solo-bar-who"]').text()).toBe("Inkling · 24 of 27 hit points");
    await w.setProps({ hitPoints: { current: 9, max: 27 } });
    expect(w.get('[data-testid="solo-bar-who"]').text()).toBe("Inkling · 9 of 27 hit points");
  });

  // Bug caught: the host's choice of the Narrator's voice swallowed inside the panel, so the page never changes
  // the table's row; or the control showing a voice the table does not speak in.
  it("shows the table's Narrator voice in the sitting panel and hands a new choice to the page", async () => {
    const w = mountBar(null);
    await w.get('button[aria-label="What this sitting has cost"]').trigger("click");
    const choice = w.get('[data-testid="solo-narrator-voice"]');
    const pressed = choice.findAll("button").filter((b) => b.attributes("aria-pressed") === "true");
    expect(pressed.map((b) => b.text())).toEqual(["A man's voice"]);
    await choice.findAll("button").find((b) => b.text() === "A woman's voice")?.trigger("click");
    expect(w.emitted("narratorVoice")).toEqual([["female"]]);
  });
});
