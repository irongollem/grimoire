import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppButton from "@/components/common/controls/AppButton.vue";
import SiteRoomCard from "./SiteRoomCard.vue";

const mocks = vi.hoisted(() => ({
  facts: {} as Record<string, boolean>,
  encounters: [] as { id: string; name: string; is_finished: boolean }[],
}));

vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({
    stateOf: (_id: string, fact: string) => (fact in mocks.facts ? { value: mocks.facts[fact] } : undefined),
  }),
}));
vi.mock("@/composables/encounters/useEncounters", () => ({
  useEncountersByLocation: () => ({ data: ref(mocks.encounters) }),
}));

const mountCard = () =>
  mount(SiteRoomCard, { props: { room: { id: "r1", name: "The flooded shaft" } }, global: { stubs: { RouterLink: RouterLinkStub } } });
const button = (w: ReturnType<typeof mountCard>, label: string) =>
  w.findAllComponents(AppButton).find((b) => b.props("label") === label);

beforeEach(() => {
  mocks.facts = {};
  mocks.encounters = [];
});

// #1125 frame 03: clicking a room shows its card; the dive into the room is a button on it.
describe("SiteRoomCard", () => {
  it("opens the room only when asked, with its id", () => {
    const w = mountCard();
    button(w, "Open the room")!.vm.$emit("click");
    expect(w.emitted("open")).toEqual([["r1"]]);
  });

  it("chips only the facts the party has asserted true", () => {
    mocks.facts = { cleared: true, looted: false };
    const text = mountCard().text();
    expect(text).toContain("Cleared");
    expect(text).not.toContain("Looted");
    expect(text).not.toContain("Explored");
  });

  it("offers Fight here for the staged encounter that has not been fought", () => {
    mocks.encounters = [
      { id: "done", name: "Old ambush", is_finished: true },
      { id: "e1", name: "Drowned guards", is_finished: false },
    ];
    expect(button(mountCard(), "Fight here")!.props("to")).toBe("/encounters/e1/run");
  });

  it("offers no Fight here when every staged encounter is finished, or none is", () => {
    expect(button(mountCard(), "Fight here")).toBeUndefined();
    mocks.encounters = [{ id: "done", name: "Old ambush", is_finished: true }];
    expect(button(mountCard(), "Fight here")).toBeUndefined();
  });

  it("closes", () => {
    const w = mountCard();
    w.findAllComponents(AppButton).find((b) => b.props("ariaLabel") === "Close room card")!.vm.$emit("click");
    expect(w.emitted("close")).toHaveLength(1);
  });
});
