import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EntityCombobox from "./EntityCombobox.vue";

const options = [
  { id: "a", name: "Alder" },
  { id: "b", name: "Birch" },
];

function mountBox(props: { modelValue: string; options: typeof options; selectedLabel?: string | null }) {
  return mount(EntityCombobox, {
    props,
    global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
  });
}

const placeholderOf = (w: ReturnType<typeof mountBox>) => w.get("input").attributes("placeholder");

describe("EntityCombobox", () => {
  it("shows the selected option's name from options", () => {
    expect(placeholderOf(mountBox({ modelValue: "b", options }))).toBe("Birch");
  });

  it("falls back to the placeholder when nothing is selected", () => {
    expect(placeholderOf(mountBox({ modelValue: "", options, selectedLabel: "Ignored" }))).toBe("Search…");
  });

  it("shows selectedLabel while the selected id is not in options yet", () => {
    expect(placeholderOf(mountBox({ modelValue: "z", options: [], selectedLabel: "Zephyr" }))).toBe("Zephyr");
  });

  it("prefers the option's name over selectedLabel once options hold the id", () => {
    expect(placeholderOf(mountBox({ modelValue: "a", options, selectedLabel: "Stale" }))).toBe("Alder");
  });

  it("matches a query against matchText when given, the name otherwise", async () => {
    const tagged = [{ id: "p", name: "Healing draught", tag: "potion" }, { id: "r", name: "Rope", tag: "gear" }];
    const tagOf = new Map(tagged.map((t) => [t.id, t.tag]));
    const plain = mount(EntityCombobox, {
      props: { modelValue: "", options: tagged },
      global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
    });
    await plain.get("input").setValue("potion");
    expect(plain.findAll("li")).toHaveLength(0);

    const byTag = mount(EntityCombobox, {
      // mount() does not carry the component's generic, so the tag is looked up by id.
      props: { modelValue: "", options: tagged, matchText: (o: { id: string; name: string }) => `${o.name} ${tagOf.get(o.id)}` },
      global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
    });
    await byTag.get("input").setValue("potion");
    expect(byTag.findAll("li").map((li) => li.text())).toEqual(["Healing draught"]);
  });

  it("emits open each time the dropdown opens", async () => {
    const w = mountBox({ modelValue: "", options });
    await w.get("input").trigger("focus");
    expect(w.emitted("open")).toHaveLength(1);
    await w.get("input").trigger("keydown.escape");
    await w.get("input").trigger("focus");
    expect(w.emitted("open")).toHaveLength(2);
  });

  it("renders the hooks Vellum styles its field by", () => {
    const input = mountBox({ modelValue: "", options }).get("input");
    expect(input.attributes("data-field")).toBe("combobox");
    expect(input.attributes("data-field-size")).toBe("body");
    expect(input.attributes("data-field-tone")).toBe("card");
  });

  it("marks its open list as a floating slip", async () => {
    const w = mountBox({ modelValue: "", options });
    await w.get("input").trigger("focus");
    expect(w.find("ul[data-slip]").exists()).toBe(true);
  });

  describe("footer slot", () => {
    function mountWithFooter(withFooter: boolean) {
      return mount(EntityCombobox, {
        props: { modelValue: "", options },
        slots: withFooter
          ? { footer: `<template #footer="{ query }"><button data-test="footer-btn">Create "{{ query }}"</button></template>` }
          : {},
        global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
      });
    }

    it("renders below the options with the typed query", async () => {
      const w = mountWithFooter(true);
      await w.get("input").setValue("bir");
      expect(w.get("[data-test=footer-btn]").text()).toBe('Create "bir"');
      expect(w.findAll("li").some((li) => li.text() === "Birch")).toBe(true);
    });

    it("is absent when the caller provides none", async () => {
      const w = mountWithFooter(false);
      await w.get("input").setValue("zzz");
      expect(w.find("[data-test=footer-btn]").exists()).toBe(false);
      expect(w.text()).toContain("No matches");
    });

    it("stays clickable, in place of No matches, when nothing matches", async () => {
      const w = mountWithFooter(true);
      await w.get("input").setValue("zzz");
      expect(w.text()).not.toContain("No matches");
      expect(w.find("ul[data-slip]").exists()).toBe(true);
      expect(w.find("[data-test=footer-btn]").exists()).toBe(true);
    });
  });
});
