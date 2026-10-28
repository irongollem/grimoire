import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TraitList from "./TraitList.vue";

const stubs = { RichTextViewer: { props: ["content"], template: "<div class='rt'>rich</div>" } };

function render(description: string) {
  return mount(TraitList, {
    props: { title: "Special Abilities", traits: [{ name: "Spellcasting", description }] },
    global: { stubs },
  });
}

describe("TraitList", () => {
  it("renders nothing without traits", () => {
    const wrapper = mount(TraitList, { props: { title: "Reactions", traits: [] }, global: { stubs } });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("runs the first line in after the name and gives each later line its own paragraph", () => {
    const wrapper = render("The lich is a spellcaster.\n\n* Cantrips: mage hand\n* 1st level: shield");
    const trait = wrapper.find(".trait");
    expect(trait.find("span:nth-of-type(2)").text()).toBe("The lich is a spellcaster.");
    expect(trait.findAll("p").map((p) => p.text())).toEqual(["* Cantrips: mage hand", "* 1st level: shield"]);
  });

  it("hands a stored Tiptap document to the rich-text viewer", () => {
    const doc = JSON.stringify({ type: "doc", content: [] });
    expect(render(doc).find(".rt").exists()).toBe(true);
  });

  it("keeps a string that merely parses as JSON as plain text", () => {
    const wrapper = render("20");
    expect(wrapper.find(".rt").exists()).toBe(false);
    expect(wrapper.find(".trait").text().replace(/\s+/g, " ")).toBe("Spellcasting. 20");
  });

  it.each(["null", '{"note":"not a document"}', "[1, 2]"])("keeps %s as plain text, since it is JSON but not a stored document", (description) => {
    const wrapper = render(description);
    expect(wrapper.find(".rt").exists()).toBe(false);
    expect(wrapper.find(".trait").text()).toContain(description.split("\n")[0]);
  });

  it("ignores blank lines and stray spaces around the paragraphs", () => {
    const wrapper = render("\n  Hits hard.  \n");
    const trait = wrapper.find(".trait");
    expect(trait.findAll("p")).toHaveLength(0);
    expect(trait.find("span:nth-of-type(2)").text()).toBe("Hits hard.");
  });
});
