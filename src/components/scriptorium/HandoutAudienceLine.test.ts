import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import HandoutAudienceLine from "./HandoutAudienceLine.vue";

const mocks = vi.hoisted(() => ({ hidden: { value: [] as string[] } }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "p1", name: "Pip" },
      { id: "p2", name: "Wren" },
      { id: "p3", name: "Bramble" },
    ]),
  }),
}));
vi.mock("@/composables/scriptorium/useHandoutShare", () => ({
  usePendingHandoutReveals: () => ({ hiddenNames: mocks.hidden }),
}));

const handout = { id: "d1", title: "Letter", campaign_id: "c1", player_visible_to: [] as string[], updated_at: "x", theme: "letter" as const };
const mountLine = (visible: string[]) =>
  mount(HandoutAudienceLine, {
    props: { handout: { ...handout, player_visible_to: visible } },
    global: { stubs: { HandoutShareDialog: { props: ["open", "handout"], template: '<i data-testid="dialog" :data-open="open" />' } } },
  });

describe("HandoutAudienceLine", () => {
  it("says who holds the handout, or that nobody does yet", () => {
    mocks.hidden.value = [];
    expect(mountLine(["p1", "p2"]).text()).toBe("With Pip and Wren");
    expect(mountLine([]).text()).toBe("Not given yet");
    expect(mountLine(["p1", "p2", "p3"]).text()).toBe("With the whole party");
  });

  it("offers no Reveal when nothing linked is hidden from the holders", () => {
    mocks.hidden.value = [];
    expect(mountLine(["p1"]).text()).not.toContain("Reveal");
  });

  it("names a linked entry still hidden from the holders and opens the Give dialog from Reveal", async () => {
    mocks.hidden.value = ["The Bell-Mother"];
    const w = mountLine(["p1", "p2"]);
    expect(w.text()).toContain("The Bell-Mother is linked but hidden from them.");
    expect(w.get('[data-testid="dialog"]').attributes("data-open")).toBe("false");
    await w.findAll("button").find((b) => b.text() === "Reveal")!.trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="dialog"]').attributes("data-open")).toBe("true");
  });
});
