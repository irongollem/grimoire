import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SpellSheetMobile from "./SpellSheetMobile.vue";
import type { Spell } from "@/types/spell.types";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
vi.mock("@/components/notes/DmNoteBox.vue", () => ({
  default: { name: "DmNoteBox", props: ["type", "id", "label"], template: '<div data-testid="dm-note">{{ type }}</div>' },
}));

function spell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "s1",
    name: "Fireball",
    level: 3,
    school: "evocation",
    casting_time: "1 action",
    casting_time_custom: null,
    range: "150 feet",
    range_custom: null,
    duration: "Instantaneous",
    duration_custom: null,
    components: ["V", "S", "M"],
    material: "a tiny ball of bat guano",
    concentration: false,
    ritual: false,
    description: "A bright streak flashes from your pointing finger.",
    higher_levels: null,
    classes: ["Sorcerer", "Wizard"],
    tags: [],
    source: "srd-2014",
    source_title: "SRD 5.1",
    source_url: null,
    image_url: null,
    image_focal_point: null,
    ...overrides,
  } as unknown as Spell;
}

const stubs = { FocalImage: true, AiImageBadge: true, RouterLink: true, MobileSheet: true, AppButton: { props: ["to", "label"], template: '<a :href="to">{{ label }}</a>' } };

function mountSheet(props: Partial<{ spell: Spell; canEdit: boolean; showDmNote: boolean }> = {}) {
  return mount(SpellSheetMobile, {
    props: { spell: spell(), canEdit: false, showDmNote: false, ...props },
    global: { stubs },
  });
}

describe("SpellSheetMobile", () => {
  it("names the level, school and ritual in the subtitle", () => {
    expect(mountSheet().text()).toContain("3rd-Level · evocation");
    expect(mountSheet({ spell: spell({ level: 0, ritual: true }) }).text()).toContain("Cantrip · evocation · Ritual");
  });

  it("shows the four casting facts, with the custom value and the components in words", () => {
    const text = mountSheet({ spell: spell({ casting_time_custom: "10 minutes" }) }).text();
    expect(text).toContain("10 minutes");
    expect(text).toContain("150 feet");
    expect(text).toContain("Verbal, Somatic, Material (a tiny ball of bat guano)");
    expect(text).toContain("Instantaneous");
  });

  it("notes concentration on the duration", () => {
    expect(mountSheet({ spell: spell({ concentration: true, duration: "1 minute" }) }).text()).toContain(
      "1 minute (concentration)",
    );
  });

  it("sets the description with the drop-cap class", () => {
    expect(mountSheet().find(".lore").exists()).toBe(true);
  });

  it("shows At Higher Levels, Classes and Source only when set", () => {
    const full = mountSheet({ spell: spell({ higher_levels: "One more die per slot." }) }).text();
    expect(full).toContain("At Higher Levels");
    expect(full).toContain("Sorcerer, Wizard");
    expect(full).toContain("SRD 5.1");
    const bare = mountSheet({ spell: spell({ classes: [], source: null }) }).text();
    expect(bare).not.toContain("At Higher Levels");
    expect(bare).not.toContain("Classes");
    expect(bare).not.toContain("Source");
  });

  it("renders the DM note box only when asked", () => {
    expect(mountSheet().find('[data-testid="dm-note"]').exists()).toBe(false);
    const w = mountSheet({ showDmNote: true });
    expect(w.find('[data-testid="dm-note"]').text()).toBe("spell");
  });

  it("offers Edit only when the caller can edit", () => {
    expect(mountSheet().find('a[href="/spells/s1?edit=true"]').exists()).toBe(false);
    expect(mountSheet({ canEdit: true }).find('a[href="/spells/s1?edit=true"]').exists()).toBe(true);
  });

  it("has no overflow menu", () => {
    expect(mountSheet({ canEdit: true }).find('[aria-label="More actions"]').exists()).toBe(false);
  });
});
