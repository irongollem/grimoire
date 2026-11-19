import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry } from "@/types/canon.types";

vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: { value: false } }),
  useUpdateCanonEntry: () => ({ mutate: vi.fn() }),
  useDeleteCanonEntry: () => ({ mutate: vi.fn() }),
  createCanonEntry: vi.fn(),
  updateCanonEntry: vi.fn(),
}));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import PremiseSection from "./PremiseSection.vue";

const entry = (over: Partial<CanonEntry>): CanonEntry => ({
  id: "e", user_id: "u", campaign_id: "c1", part: "premise", premise_kind: "theme", knowledge: null, title: "x",
  body: null, sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const RevealStub = { name: "AudienceRevealControl", template: "<i data-testid='reveal' />" };

function mountSection(entries: CanonEntry[]) {
  return mount(PremiseSection, {
    props: { campaign: { id: "c1", setting: "Eberron", calendar_id: null } as Campaign, entries },
    global: { stubs: { AudienceRevealControl: RevealStub, PremiseWorld: true, PremisePitch: true, CanonSuggestions: true } },
  });
}

describe("PremiseSection", () => {
  it("gives voice and look no reveal control, because players never read them", () => {
    const w = mountSection([entry({ id: "v", premise_kind: "voice", title: "Dry" }), entry({ id: "l", premise_kind: "look", title: "Gouache" })]);
    expect(w.find("[data-testid=premise-voice] [data-testid=reveal]").exists()).toBe(false);
    expect(w.find("[data-testid=premise-look] [data-testid=reveal]").exists()).toBe(false);
    expect(w.text()).toContain("Players never read this.");
  });

  it("gives each theme, table note, line and veil a reveal control, as players may be shown those", () => {
    const w = mountSection([
      entry({ id: "1", premise_kind: "theme" }), entry({ id: "2", premise_kind: "table" }),
      entry({ id: "3", premise_kind: "line" }), entry({ id: "4", premise_kind: "veil" }),
    ]);
    expect(w.findAll("[data-testid=reveal]")).toHaveLength(4);
  });

  it("files each entry under its own kind: a line is not listed among the themes", () => {
    const w = mountSection([entry({ id: "1", premise_kind: "theme", title: "Sweet spoils" }), entry({ id: "3", premise_kind: "line", title: "No harm to children" })]);
    const values = (id: string) => w.findAll(`[data-testid=${id}] input`).map((i) => (i.element as HTMLInputElement).value);
    expect(values("premise-theme")).toContain("Sweet spoils");
    expect(values("premise-theme")).not.toContain("No harm to children");
    expect(values("premise-line-veil")).toContain("No harm to children");
  });
});
