import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FamilyTreePhone from "./FamilyTreePhone.vue";
import { key, makeSource } from "./testGraph";
import { layoutTree } from "@/lib/kinship/layout";
import { selectAroundFocus } from "@/lib/kinship/select";
import type { PersonKey } from "@/types/kinship.types";

function mountPhone(focus: PersonKey | null) {
  setActivePinia(createPinia());
  const source = makeSource({ withBirth: true });
  const around = key("brenna");
  const sel = selectAroundFocus(source.graph.value, around);
  const layout = layoutTree({ graph: source.graph.value, members: sel.members, folds: sel.folds, anchor: around });
  return mount(FamilyTreePhone, { props: { layout, people: source.people.value, focus } });
}
const headings = (w: ReturnType<typeof mountPhone>) => w.findAll("h3").map((h) => h.text());

describe("FamilyTreePhone row labels", () => {
  it("labels rows relative to the centred person", () => {
    const labels = headings(mountPhone(key("brenna")));
    expect(labels.some((l) => l.startsWith("Parents"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Grandparents"))).toBe(true);
  });

  it("counts generations from the top when nobody is centred, keeping the birth year", () => {
    const labels = headings(mountPhone(null));
    expect(labels[0]).toMatch(/^Generation 1/);
    expect(labels[1]).toMatch(/^Generation 2/);
    expect(labels.some((l) => /^Generation \d, c\. \d{4}$/.test(l))).toBe(true);
    expect(labels.join(" ")).not.toMatch(/Parents|Grandparents|Children|generation/);
  });
});
