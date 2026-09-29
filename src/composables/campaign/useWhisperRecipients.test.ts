import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { CampaignMember } from "@/types/campaign.types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  members: { value: undefined as unknown },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "me" } }) }));
vi.mock("@/composables/campaign/useCampaignMembers", async () => {
  const { ref } = await import("vue");
  mocks.members = ref<unknown>(undefined);
  return { useCampaignMembers: () => ({ data: mocks.members }) };
});

import { fetchWhisperRecipients, useWhisperTarget } from "./useWhisperRecipients";

const member = (user_id: string) => ({ id: `m-${user_id}`, user_id }) as CampaignMember;
const membersRef = () => mocks.members as ReturnType<typeof ref<CampaignMember[] | undefined>>;

describe("fetchWhisperRecipients", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("returns the ids the server allows, asking for the given campaign", async () => {
    mocks.rpc.mockResolvedValue({ data: ["u2", "u3"], error: null });
    await expect(fetchWhisperRecipients("c1")).resolves.toEqual(["u2", "u3"]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_whisper_recipients", { p_campaign_id: "c1" });
  });

  it("throws the RPC error rather than reporting nobody to whisper", async () => {
    const boom = new Error("Not a member of this campaign");
    mocks.rpc.mockResolvedValue({ data: null, error: boom });
    await expect(fetchWhisperRecipients("c1")).rejects.toBe(boom);
  });
});

describe("useWhisperTarget", () => {
  // The members ref is shared, so a wrapper left mounted would keep reacting to it.
  const mounted: { unmount: () => void }[] = [];
  afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

  function setup() {
    let result!: ReturnType<typeof useWhisperTarget>;
    const wrapper = mount(
      defineComponent({
        setup() {
          result = useWhisperTarget(membersRef());
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    mounted.push(wrapper);
    return result;
  }

  beforeEach(() => {
    mocks.rpc.mockReset();
    membersRef().value = undefined;
  });

  it("does not ask the server until the member list has loaded", async () => {
    mocks.rpc.mockResolvedValue({ data: ["u2"], error: null });
    setup();
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
    membersRef().value = [member("me"), member("u2")];
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the whisper target when someone joins while the new answer loads", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: ["u2"], error: null });
    membersRef().value = [member("me"), member("u2")];
    const state = setup();
    await flushPromises();
    state.whisperTarget.value = "u2";

    let release!: (v: { data: string[]; error: null }) => void;
    mocks.rpc.mockReturnValueOnce(new Promise((r) => (release = r)));
    membersRef().value = [member("me"), member("u2"), member("u3")];
    await flushPromises();
    // The new key is still loading; the previous answer stands.
    expect(state.whisperTarget.value).toBe("u2");
    expect(state.whisperableMembers.value.map((m) => m.user_id)).toEqual(["u2"]);

    release({ data: ["u2", "u3"], error: null });
    await vi.waitFor(() =>
      expect(state.whisperableMembers.value.map((m) => m.user_id)).toEqual(["u2", "u3"]),
    );
    expect(state.whisperTarget.value).toBe("u2");
  });

  it("drops a target the settled answer no longer allows", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: ["u2"], error: null });
    membersRef().value = [member("me"), member("u2")];
    const state = setup();
    await flushPromises();
    state.whisperTarget.value = "u2";

    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    membersRef().value = [member("me"), member("u2"), member("u3")];
    await vi.waitFor(() => expect(state.whisperTarget.value).toBe(""));
  });
});
