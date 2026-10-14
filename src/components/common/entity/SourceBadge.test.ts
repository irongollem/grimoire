import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { sourceLabel } from "@/lib/library/sourceLabel";
import SourceBadge from "./SourceBadge.vue";

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) =>
      sourceLabel(source, title, new Map([["grimoire-dungeon-craft", "Grimoire Dungeon Craft"]])),
  }),
}));

describe("SourceBadge", () => {
  it("names a library book by its title, with the title as the tooltip", () => {
    const wrapper = mount(SourceBadge, { props: { source: "grimoire-dungeon-craft" } });
    expect(wrapper.text()).toBe("Grimoire Dungeon Craft");
    expect(wrapper.attributes("title")).toBe("Grimoire Dungeon Craft");
  });

  it("shows the source a DM typed on their own row", () => {
    expect(mount(SourceBadge, { props: { source: "Monster Manual" } }).text()).toBe("Monster Manual");
  });

  it("renders nothing for a row with no source", () => {
    expect(mount(SourceBadge, { props: { source: null } }).find("span").exists()).toBe(false);
  });
});
