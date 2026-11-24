import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { useCanonUiStore } from "@/stores/ui/canon";

const state = vi.hoisted(() => ({ aiEnabled: true }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; } }) }));

import CanonSuggestFold from "./CanonSuggestFold.vue";

const mountFold = (part = "truths") => mount(CanonSuggestFold, { props: { part }, slots: { default: "<p data-testid='helper'>helper</p>" } });
const helper = (w: ReturnType<typeof mountFold>) => w.get("[data-testid=helper]");
// v-show sets `display: none` on the panel around the slot.
const shown = (w: ReturnType<typeof mountFold>) => (helper(w).element.parentElement as HTMLElement).style.display !== "none";

describe("CanonSuggestFold", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    state.aiEnabled = true;
  });

  // Bug caught (#1258 item 19): the helper open on every visit to a part, which is what the fold is there to stop.
  it("starts collapsed, with the helper mounted but out of sight", () => {
    const w = mountFold();
    expect(shown(w)).toBe(false);
    expect(w.get("button").text()).toBe("Suggest…");
    expect(w.get("button").attributes("aria-expanded")).toBe("false");
  });

  // Bug caught: the fold unmounting the helper when shut, losing a suggestion the DM had not yet accepted.
  it("opens on the button and keeps the helper mounted when shut again", async () => {
    const w = mountFold();
    await w.get("button").trigger("click");
    expect(shown(w)).toBe(true);
    await w.get("button").trigger("click");
    expect(w.find("[data-testid=helper]").exists()).toBe(true);
    expect(shown(w)).toBe(false);
  });

  // Bug caught: one open flag for every part, so opening Truths' helper also opened Lore's.
  it("remembers being open per part in the page's store", async () => {
    const truths = mountFold("truths");
    await truths.get("button").trigger("click");
    expect(useCanonUiStore().suggestOpen).toEqual({ truths: true });
    expect(shown(mountFold("lore"))).toBe(false);
    expect(shown(mountFold("truths"))).toBe(true);
  });

  // Bug caught: a "Suggest…" button on a campaign with AI off, opening onto nothing.
  it("renders nothing when AI is off for the campaign", () => {
    state.aiEnabled = false;
    expect(mountFold().html()).toBe("<!--v-if-->");
  });
});
