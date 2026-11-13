import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TagChip from "./TagChip.vue";
import TagChips from "./TagChips.vue";

const TAGS = ["merchant", "guild", "smuggler", "harbour", "informant"];

describe("TagChips", () => {
  it("shows max tags and counts only the hidden ones in +N", () => {
    const wrapper = mount(TagChips, { props: { tags: TAGS, max: 3, overflow: true } });
    expect(wrapper.findAllComponents(TagChip).map((c) => c.text())).toEqual(["merchant", "guild", "smuggler"]);
    expect(wrapper.text()).toContain("+2");
  });

  it("says nothing about the rest unless asked, and nothing when none are hidden", () => {
    expect(mount(TagChips, { props: { tags: TAGS, max: 3 } }).text()).not.toContain("+");
    expect(mount(TagChips, { props: { tags: TAGS.slice(0, 2), max: 3, overflow: true } }).text()).not.toContain("+");
  });

  it("renders nothing for no tags, so a caller needs no v-if", () => {
    expect(mount(TagChips, { props: { tags: [] } }).html()).not.toContain("<div");
  });
});

describe("TagChip", () => {
  it("lets a call-site class override a chip token and passes other attrs on", () => {
    const wrapper = mount(TagChip, {
      attrs: { class: "text-muted-foreground/60", title: "Variants" },
      slots: { default: "2 variants" },
    });
    const classes = wrapper.get("span").classes();
    expect(classes).toContain("text-muted-foreground/60");
    expect(classes).not.toContain("text-muted-foreground");
    expect(wrapper.get("span").attributes("title")).toBe("Variants");
  });
});
