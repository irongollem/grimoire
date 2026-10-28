import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KinCard from "./KinCard.vue";
import type { KinPersonView } from "@/composables/kinship/useKinGraph";

const person = (over: Partial<KinPersonView> = {}): KinPersonView => ({
  key: "npc:a", name: "Maera Thane", bornYear: 1431, diedYear: null, dead: false, isPc: false, portraitUrl: null, subtitle: "Smith", to: null, ...over,
});

function card(props: { person: KinPersonView } & Record<string, unknown>) {
  setActivePinia(createPinia());
  return mount(KinCard, { props, global: { plugins: [] } });
}

describe("KinCard", () => {
  it("shows the name, an initial and the birth year with an age for the living", () => {
    const w = card({ person: person() });
    expect(w.text()).toContain("Maera Thane");
    expect(w.text()).toContain("born 1431");
    expect(w.text()).toMatch(/born 1431 · \d+/);
  });

  it("mutes and strikes the dead, with no age", () => {
    const w = card({ person: person({ dead: true }) });
    expect(w.attributes("data-dead")).toBe("true");
    expect(w.find(".kin-name").classes()).toContain("line-through");
    expect(w.text()).toContain("born 1431");
    expect(w.text()).not.toMatch(/·\s*\d/);
  });

  it("marks a PC, the focus and a married-in spouse", () => {
    const w = card({ person: person({ isPc: true }), focus: true, marriedIn: true });
    expect(w.attributes("data-pc")).toBe("true");
    expect(w.attributes("data-focus")).toBe("true");
    expect(w.attributes("aria-current")).toBe("true");
    expect(w.text()).toContain("married in");
  });

  it("reads the person aloud: name, dead, and the line under it", () => {
    expect(card({ person: person({ dead: true }) }).attributes("aria-label")).toBe("Maera Thane, dead, born 1431");
    expect(card({ person: person(), marriedIn: true }).attributes("aria-label")).toMatch(/^Maera Thane, born 1431 · \d+ · married in$/);
  });

  it("shows the portrait when there is one and the first letter of the name otherwise", () => {
    expect(card({ person: person({ portraitUrl: "/p.webp" }) }).get("img").attributes("src")).toBe("/p.webp");
    const plain = card({ person: person({ name: "  maera" }) });
    expect(plain.find("img").exists()).toBe(false);
    expect(plain.text()).toContain("M");
  });

  it("falls back to the subtitle when no birth year is known", () => {
    const w = card({ person: person({ bornYear: null }) });
    expect(w.find(".kin-meta").text()).toBe("Smith");
  });

  it("shows nothing when there is nothing to say", () => {
    const w = card({ person: person({ bornYear: null, subtitle: null }) });
    expect(w.find(".kin-meta").exists()).toBe(false);
  });

  it("draws a succession rank badge, dims and compacts", () => {
    const w = card({ person: person(), rank: 2, dimmed: true, compact: true });
    expect(w.find(".kin-rank").text()).toBe("2");
    expect(w.classes()).toContain("opacity-40");
    expect(w.attributes("data-compact")).toBe("true");
  });
});
