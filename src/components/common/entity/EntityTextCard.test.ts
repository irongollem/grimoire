import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import EntityTextCard from "./EntityTextCard.vue";

const stubs = { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } };
const Icon = () => h("svg");

describe("EntityTextCard", () => {
  it("links the whole card and shows title, subtitle and capped tags", () => {
    const w = mount(EntityTextCard, {
      props: { to: "/x/1", title: "Alert", subtitle: "Origin", fallbackIcon: Icon, tags: ["a", "b", "c", "d", "e"], maxTags: 3 },
      global: { stubs },
    });
    expect(w.find("a").attributes("href")).toBe("/x/1");
    expect(w.text()).toContain("Alert");
    expect(w.text()).toContain("Origin");
    expect(w.text()).toContain("c");
    expect(w.text()).not.toContain("d");
  });

  it("omits the subtitle and tag line when absent", () => {
    const w = mount(EntityTextCard, {
      props: { to: "/x/1", title: "Alert", fallbackIcon: Icon },
      global: { stubs },
    });
    expect(w.findAll("span")).toHaveLength(0);
  });
});
