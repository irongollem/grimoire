import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "m1" } }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: computed(() => [{ id: "m1", name: "Tansy" }]) }) }));
vi.mock("@/composables/memorials/useMemorials", () => ({ useCampaignMemorials: () => ({ data: computed(() => []) }) }));

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
        ConnectionsSection: { name: "ConnectionsSection", props: ["subject", "subjectName"], template: "<div data-testid='section' />" },
      },
    },
  });

describe("PartyMemberView", () => {
  // Bug: the connections block was mounted for no subject, or for another character.
  it("mounts the connections block on this character", () => {
    const section = mountView().findComponent({ name: "ConnectionsSection" });
    expect(section.props("subject")).toEqual({ kind: "party_member", id: "m1" });
  });

  // Bug (#1279 item 12): the character's page had no way to the backstory written about them in the Canon.
  it("links to this character's backstory in the Canon", () => {
    const link = mountView().findComponent("[data-testid=backstory-link]");
    expect(link.exists()).toBe(true);
    expect((link as unknown as { props(k: string): unknown }).props("to")).toEqual({ path: "/canon", query: { backstory: "m1" } });
  });
});
