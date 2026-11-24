import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: { value: false } }),
  useUpdateCanonEntry: () => ({ mutate: vi.fn() }),
  useTrashCanonEntry: () => ({ mutate: vi.fn() }),
  createCanonEntry: vi.fn(),
  updateCanonEntry: vi.fn(),
}));
// The look's pictures and AI button have their own test; here it is the same plain field as the voice.
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: false }) }));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: async () => true }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: () => true }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (n: number) => n }) }));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const tableOpen = vi.hoisted(() => ({ on: true }));
vi.mock("@/composables/campaign/useTableAccess", async () => {
  const { computed } = await import("vue");
  return { useTableAccess: () => ({ open: computed(() => tableOpen.on) }) };
});

import PremiseChapter from "./PremiseChapter.vue";

const entry = (over: Partial<CanonEntry>): CanonEntry => canonEntry({ id: "e", campaign_id: "c1", part: "premise", premise_kind: "theme", ...over });

const RevealStub = { name: "AudienceRevealControl", template: "<i data-testid='reveal' />" };

function mountChapter(entries: CanonEntry[], table_violence: Campaign["table_violence"] = "standard") {
  return mount(PremiseChapter, {
    props: { campaign: { id: "c1", setting: "Eberron", calendar_id: null, table_violence } as Campaign, entries },
    global: { stubs: { CanonReview: true, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, AudienceRevealControl: RevealStub, ThemeCarriedBy: true, PremiseWorld: true, PremisePitch: true, CanonSuggest: { name: "CanonSuggest", props: ["request"], template: "<i data-testid='suggest' />" } } },
  });
}

describe("PremiseChapter", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the premise still carried its own AI panel instead of one request to the Familiar.
  it("asks the Familiar for a premise from the head, with no panel of its own", () => {
    const w = mountChapter([]);
    expect(w.getComponent({ name: "CanonSuggest" }).props("request")).toBe("Suggest a premise for my campaign: a pitch, themes and how it plays.");
    expect(w.text()).not.toContain("Suggest a premise for");
  });

  // Bug caught: the players' margin was drawn at every width and squeezed the sheet on a phone.
  it("shows the players' book only from 80rem of the chapter, not below", () => {
    const w = mountChapter([]);
    const margin = w.get("[data-testid=premise-book-preview]");
    expect(margin.classes()).toEqual(expect.arrayContaining(["hidden", "@7xl:flex"]));
  });

  it("gives voice and look no reveal control, because players never read them", () => {
    const w = mountChapter([entry({ id: "v", premise_kind: "voice", title: "Dry" }), entry({ id: "l", premise_kind: "look", title: "Gouache" })]);
    expect(w.find("[data-testid=premise-voice] [data-testid=reveal]").exists()).toBe(false);
    expect(w.find("[data-testid=premise-look] [data-testid=reveal]").exists()).toBe(false);
    expect(w.text()).toContain("Players never read this.");
  });

  it("gives each theme, table note, line and veil a reveal control, as players may be shown those", () => {
    const w = mountChapter([
      entry({ id: "1", premise_kind: "theme" }), entry({ id: "2", premise_kind: "table" }),
      entry({ id: "3", premise_kind: "line" }), entry({ id: "4", premise_kind: "veil" }),
    ]);
    expect(w.findAll("[data-testid=reveal]")).toHaveLength(4);
  });

  it("files each entry under its own kind: a line is not listed among the themes", () => {
    const w = mountChapter([entry({ id: "1", premise_kind: "theme", title: "Sweet spoils" }), entry({ id: "3", premise_kind: "line", title: "No harm to children" })]);
    const values = (id: string) => w.findAll(`[data-testid=${id}] textarea`).map((i) => (i.element as HTMLTextAreaElement).value);
    expect(values("premise-theme")).toContain("Sweet spoils");
    expect(values("premise-theme")).not.toContain("No harm to children");
    expect(values("premise-line-veil")).toContain("No harm to children");
  });

  // Bug caught (#1255 item 25): two screens setting what the Narrator may tell, neither saying the other exists.
  it("reads the violence dial back under lines and veils, with the way to change it", () => {
    tableOpen.on = true;
    const w = mountChapter([], "grim");
    const line = w.find("[data-testid=premise-violence]");
    expect(line.text()).toContain("Violence and horror at the AI table: Grim.");
    expect(line.find("a").attributes("href")).toBe("/campaign/settings");
  });

  // Bug caught: the dial named on a campaign whose AI table is closed, where it does nothing.
  it("leaves the dial line out where the AI table is not open", () => {
    tableOpen.on = false;
    expect(mountChapter([]).find("[data-testid=premise-violence]").exists()).toBe(false);
    tableOpen.on = true;
  });
});
