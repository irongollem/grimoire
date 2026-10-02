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

  it("emits approve with the option's scope", async () => {
    setQuery({ name: "Wisp" });
    const wrapper = mountDialog(review({}));
    const approve = wrapper.findAll("button").find((b) => b.text() === "Approve");
    await approve?.trigger("click");
    expect(wrapper.emitted("approve")).toEqual([["character"]]);
  });
});
