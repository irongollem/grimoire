import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import HousePlayerLineage from "./HousePlayerLineage.vue";
import { key, makeSource } from "@/components/kinship/testGraph";

vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => ref(false), useIsTouch: () => ref(false) }));
vi.mock("@/composables/kinship/useKinGraph", () => ({ usePlayerKinGraph: () => makeSource({ withBirth: false }) }));

describe("HousePlayerLineage", () => {
  it("draws only the house's people the player knows, with no succession numbers", () => {
    setActivePinia(createPinia());
    const w = mount(HousePlayerLineage, { props: { faction: { descent: "oath" }, members: [key("brenna"), key("tomas")] } });
    const names = w.findAll(".kin-name").map((n) => n.text());
    expect(names.sort()).toEqual(["Brenna", "Tomas"]);
  });

  it("a House with no stated descent follows the blood through either parent", () => {
    setActivePinia(createPinia());
    const w = mount(HousePlayerLineage, { props: { faction: { descent: null }, members: [key("aldous")] } });
    const names = w.findAll(".kin-name").map((n) => n.text());
    expect(names).toEqual(expect.arrayContaining(["Aldous", "Bren", "Odile"]));
  });
});
