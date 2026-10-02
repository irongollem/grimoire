import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import CharacterContentItemDialog from "./CharacterContentItemDialog.vue";
import type { CharacterContentReview } from "@/composables/party/useCharacterContentReviews";

const query = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));

vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCharacterContentItem: () => query.state,
}));

const RichTextViewerStub = { props: ["content"], template: '<div class="rich">{{ content }}</div>' };

function review(over: Partial<CharacterContentReview>): CharacterContentReview {
  return {
    id: "r1",
    campaign_id: "c1",
    party_member_id: "p1",
    kind: "species",
    ref: "x",
    label: "Label",
    reason: "homebrew",
    source_slug: null,
    source_title: null,
    status: "pending",
    decided_by: null,
    decided_at: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function setQuery(data: unknown, flags: { pending?: boolean; error?: boolean } = {}) {
  query.state = {
    data: ref(data),
    isPending: ref(flags.pending ?? false),
    isError: ref(flags.error ?? false),
    refetch: vi.fn(),
  };
}

function mountDialog(r: CharacterContentReview) {
  return mount(CharacterContentItemDialog, {
    props: { open: true, review: r },
    attachTo: document.body,
    global: { stubs: { RichTextViewer: RichTextViewerStub, transition: false, Teleport: true } },
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("CharacterContentItemDialog", () => {
  it("shows a loading state, not a blank", () => {
    setQuery(null, { pending: true });
    const wrapper = mountDialog(review({}));
    expect(wrapper.text()).not.toContain("There is nothing more to show");
    expect(wrapper.find("[data-testid=item-row]").exists()).toBe(false);
  });

  it("shows a species with its traits, speed and languages, and skips empty fields", () => {
    setQuery({
      name: "Wisp",
      description: "A small light.",
      size: "Small",
      speed: { walk: 30, fly: 20, swim: 0 },
      traits: [{ name: "Glow", description: "Sheds light." }],
      languages: ["Common"],
      notes: "DM only",
      avg_height: "",
    });
    const wrapper = mountDialog(review({ label: "Wisp" }));
    const text = wrapper.text();
    expect(text).toContain("Wisp");
    expect(text).toContain("Species. The player's own content, which this table does not have.");
    expect(text).toContain("walk 30 ft., fly 20 ft.");
    expect(text).not.toContain("swim");
    expect(text).toContain("Glow");
    expect(text).toContain("Common");
    expect(text).not.toContain("DM only");
    expect(wrapper.text()).toContain("A small light.");
  });

  it("shows what a species changes on the sheet: bonuses, natural armor, innate spells and variants", () => {
    setQuery({
      name: "Mossling",
      ability_score_increases: { description: "+2 WIS, +1 CON" },
      natural_armor_ac: 13,
      granted_spells: [
        { spell_id: "x", spell_name: "Druidcraft", uses_per_day: null, min_level: 1, subrace: null },
        { spell_id: "y", spell_name: "Entangle", uses_per_day: 1, min_level: 3, subrace: "Fenborn" },
        { spell_id: "z", spell_name: "", uses_per_day: 1, min_level: 1, subrace: null },
      ],
      subraces: [
        {
          name: "Fenborn",
          description: "Raised in standing water.",
          ability_score_increases: { str: 1, dex: 0 },
          traits: [{ name: "Hold Breath", description: "Fifteen minutes." }],
        },
      ],
    });
    const text = mountDialog(review({ label: "Mossling" })).text();
    expect(text).toContain("+2 WIS, +1 CON");
    expect(text).toContain("13");
    expect(text).toContain("Druidcraft (at will)");
    expect(text).toContain("Entangle (1/day, from level 3), Fenborn only");
    expect(text).toContain("Fenborn (STR +1)");
    expect(text).not.toContain("DEX");
    expect(text).toContain("Fenborn: Hold Breath");
    expect(text).toContain("Fifteen minutes.");
  });

  it("shows a class with the features an approval would copy, by level", () => {
    setQuery({
      class_name: "Hexer",
      hit_die: 8,
      nested_features: [
        { level: "1", name: "Knack", description: "Once a day." },
        { level: "3", name: "Hex", description: null },
        { level: "5", name: "", description: "Nameless rows are skipped." },
      ],
    });
    const text = mountDialog(review({ kind: "class", label: "Hexer" })).text();
    expect(text).toContain("d8");
    expect(text).toContain("Level 1: Knack");
    expect(text).toContain("Once a day.");
    expect(text).toContain("Level 3: Hex");
    expect(text).not.toContain("Nameless rows are skipped.");
  });

  it("shows a subclass with the spells it grants", () => {
    setQuery({ subclass_name: "Bog Witch", class_name: "Hexer", nested_spells: [{ level: "3", name: "Mire", description: "Mud." }] });
    const text = mountDialog(review({ kind: "subclass", label: "Bog Witch" })).text();
    expect(text).toContain("Level 3: Mire");
    expect(text).toContain("Mud.");
  });

  it("shows a spell", () => {
    setQuery({ name: "Zap", level: 0, school: "evocation", components: ["V", "S"], description: "Bzzt." });
    const wrapper = mountDialog(review({ kind: "spell", label: "Zap" }));
    const text = wrapper.text();
    expect(text).toContain("Cantrip");
    expect(text).toContain("evocation");
    expect(text).toContain("Bzzt.");
  });

  it("says so when it cannot load, and offers another try", () => {
    setQuery(null, { error: true });
    const wrapper = mountDialog(review({}));
    expect(wrapper.find("[data-testid=item-error]").text()).toContain("This could not be loaded.");
    expect(wrapper.text()).toContain("Try again");
  });

  it("renders a null item as nothing to show, not as an error", () => {
    setQuery(null);
    const wrapper = mountDialog(review({ reason: "foreign", label: "Content from another table" }));
    expect(wrapper.find("[data-testid=item-empty]").text()).toBe("There is nothing more to show for this one.");
    expect(wrapper.find("[data-testid=item-error]").exists()).toBe(false);
  });

  it("keeps Approve off until the item is on screen: an approval from here says the DM looked", async () => {
    setQuery(null, { pending: true });
    const loading = mountDialog(review({}));
    const whileLoading = loading.findAll("button").find((b) => b.text() === "Approve");
    expect(whileLoading?.attributes("disabled")).toBeDefined();
    await whileLoading?.trigger("click");
    expect(loading.emitted("approve")).toBeUndefined();

    setQuery(null, { error: true });
    const failed = mountDialog(review({}));
    expect(failed.findAll("button").find((b) => b.text() === "Approve")?.attributes("disabled")).toBeDefined();
  });

  it("emits approve with the option's scope and when the DM saw the item", async () => {
    // `seen_at`, not the row's own `updated_at`: a feature edited later than
    // its class counts as a change to what the DM was shown.
    setQuery({ name: "Wisp", updated_at: "2026-10-01T09:00:00Z", seen_at: "2026-10-02T09:00:00Z" });
    const wrapper = mountDialog(review({}));
    const approve = wrapper.findAll("button").find((b) => b.text() === "Approve");
    await approve?.trigger("click");
    expect(wrapper.emitted("approve")).toEqual([["character", "2026-10-02T09:00:00Z"]]);
  });

  it("emits no timestamp when the item carries none, rather than inventing one", async () => {
    setQuery({ name: "Wisp" });
    const wrapper = mountDialog(review({}));
    const approve = wrapper.findAll("button").find((b) => b.text() === "Approve");
    await approve?.trigger("click");
    expect(wrapper.emitted("approve")).toEqual([["character", undefined]]);
  });
});
