import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
import type { BackstoryOrigin } from "@/components/connections/connectionRows";

const state = vi.hoisted(() => ({ origin: undefined as unknown }));

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "m1" } }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: computed(() => [{ id: "m1", name: "Tansy" }]) }) }));
vi.mock("@/composables/memorials/useMemorials", () => ({ useCampaignMemorials: () => ({ data: computed(() => []) }) }));
vi.mock("@/composables/canon/useBackstoryOrigin", () => ({ useBackstoryOrigin: () => computed(() => state.origin) }));

import PartyMemberView from "./PartyMemberView.vue";

const mountView = () =>
  mount(PartyMemberView, {
    global: {
      stubs: {
        PlayerCharacterView: true,
        AppButton: true,
        OverflowMenu: true,
        SetDownDialog: true,
        DmNoteBox: true,
        EntityBacklinks: true,
        ConnectionsSection: { name: "ConnectionsSection", props: ["subject", "subjectName", "origin"], template: "<div data-testid='section' />" },
      },
    },
  });

describe("PartyMemberView", () => {
  // Bug: the character's own page mounted the block without `origin`, so a person from the backstory was unmarked here
  // while the Canon page marked them.
  it("hands the connections block the backstory origin", () => {
    const origin: BackstoryOrigin = { entryId: "b1", npcIds: new Set(["n1"]) };
    state.origin = origin;
    const section = mountView().findComponent({ name: "ConnectionsSection" });
    expect(section.props("origin")).toStrictEqual(origin);
    expect(section.props("subject")).toEqual({ kind: "party_member", id: "m1" });
  });

  // Bug: a character with no backstory yet passed a made-up origin and marked someone.
  it("hands no origin when the character has no backstory entry", () => {
    state.origin = undefined;
    expect(mountView().findComponent({ name: "ConnectionsSection" }).props("origin")).toBeUndefined();
  });
});
