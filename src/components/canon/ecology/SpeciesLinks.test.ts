import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";
import type { LinkKind } from "@/lib/canon/ecologyTypes";

const mocks = vi.hoisted(() => ({ addLink: vi.fn(), removeLink: vi.fn() }));
const state = vi.hoisted(() => ({ links: [] as unknown[] }));

const sp = (id: string, name: string) => ({ id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 });
vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({
    species: ref([sp("bear", "Rime bear"), sp("piper", "Pith piper")]),
    forms: ref([]),
    links: ref(state.links),
    statBlockNameByForm: ref(new Map()),
    addLink: mocks.addLink,
    removeLink: mocks.removeLink,
  }),
}));

import SpeciesLinks from "./SpeciesLinks.vue";

const species = sp("bear", "Rime bear") as never;
const textarea = { props: ["modelValue"], emits: ["update:modelValue", "item-selected"], template: "<textarea :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />" };
const mountIt = (current = species) => mount(SpeciesLinks, { props: { species: current }, global: { stubs: { MentionTextarea: textarea, EntityMentionChip: { props: ["entityType", "id", "editable"], template: "<span>{{ entityType }}:{{ id }}</span>" }, SpeciesLinkEditor: { template: "<div data-testid='link-editor' />" } } } });
const link = (o: { id: string; from: string; to: string | null; kind: LinkKind; note?: string }) => ({ id: o.id, fromSpeciesId: o.from, kind: o.kind, toSpeciesId: o.to, fromFormId: null, toFormId: null, habitatId: null, note: o.note ?? null });

describe("SpeciesLinks", () => {
  beforeEach(() => {
    mocks.addLink.mockReset().mockResolvedValue(undefined);
    mocks.removeLink.mockReset();
    state.links = [link({ id: "l1", from: "bear", to: "piper", kind: "eats", note: "in autumn" }), link({ id: "l2", from: "piper", to: "bear", kind: "helps" }), link({ id: "l3", from: "piper", to: "other", kind: "eats" })];
  });

  // Bug: a link was written from the wrong side ("Rime bear is eaten by Pith piper") or another species' links were listed.
  it("reads each link from this species' side and leaves out links that are not about it", () => {
    const w = mountIt();
    const rows = w.findAll("[data-testid=species-link]");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("eats");
    expect(rows[0].get("[data-testid=link-species]").text()).toBe("species:piper");
    expect(rows[0].get("[data-testid=link-note]").text()).toBe("in autumn");
    expect(rows[1].get("[data-testid=link-species]").text()).toBe("species:piper");
    const piperPage = mountIt(sp("piper", "Pith piper") as never);
    expect(piperPage.findAll("[data-testid=species-link]")[0].text()).toContain("is eaten by");
  });

  it("opens the editor of the row clicked, and closes it on a second click", async () => {
    const w = mountIt();
    await w.findAll("[data-testid=species-link-open]")[1].trigger("click");
    expect(w.findAll("[data-testid=link-editor]")).toHaveLength(1);
    await w.findAll("[data-testid=species-link-open]")[1].trigger("click");
    expect(w.find("[data-testid=link-editor]").exists()).toBe(false);
  });

  // Bug: "eats" with no one picked was saved as a link to nothing; shelters may be left open on purpose.
  it("needs a species to eat, but lets shelters and carries name no one", async () => {
    const w = mountIt();
    const add = w.get("button[type=submit]");
    expect(add.attributes("disabled")).toBeDefined();
    await w.get("select").setValue("shelters");
    expect(w.get("button[type=submit]").attributes("disabled")).toBeUndefined();
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith({ fromSpeciesId: "bear", kind: "shelters", toSpeciesId: null });
  });

  // Bug: a pick whose words the DM then deleted still linked the species.
  it("links the picked species, and forgets a pick whose words were deleted", async () => {
    const w = mountIt();
    await w.get("textarea").setValue("@Pith_piper ");
    w.findComponent(MentionTextarea).vm.$emit("item-selected", { item: { id: "piper", label: "Pith piper" }, token: "@Pith_piper", value: "@Pith_piper " });
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith({ fromSpeciesId: "bear", kind: "eats", toSpeciesId: "piper" });
    await w.get("textarea").setValue("@Pith_piper ");
    w.findComponent(MentionTextarea).vm.$emit("item-selected", { item: { id: "piper", label: "Pith piper" }, token: "@Pith_piper", value: "" });
    await w.get("textarea").setValue("");
    expect(w.get("button[type=submit]").attributes("disabled")).toBeDefined();
  });
});
