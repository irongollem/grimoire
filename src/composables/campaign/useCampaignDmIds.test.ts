import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const members = vi.hoisted(() => ({ value: [] as { user_id: string; role: string }[] }));
vi.mock("pinia", async (orig) => ({ ...(await orig<typeof import("pinia")>()), storeToRefs: (s: unknown) => s }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: ref({ user_id: "owner" }) }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: ref(members.value) }),
}));

import { useCampaignDmIds } from "./useCampaignDmIds";

describe("useCampaignDmIds (#590)", () => {
  it("is the owner plus every seated DM, and no player", () => {
    members.value = [
      { user_id: "co", role: "dm" },
      { user_id: "p1", role: "player" },
    ];
    let ids!: ReturnType<typeof useCampaignDmIds>;
    mount(defineComponent({ setup() { ids = useCampaignDmIds(); return () => h("div"); } }));
    expect([...ids.value].sort()).toEqual(["co", "owner"]);
  });
});
