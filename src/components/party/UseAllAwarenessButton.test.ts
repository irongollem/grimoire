// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  party: [] as { id: string }[],
  mutate: vi.fn(),
}));

vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { value: mocks.party } }) }));
vi.mock("@/composables/party/useAwarenessRolls", () => ({
  useAwarenessRolls: () => ({ get enabled() { return mocks.enabled; } }),
  useUseAwarenessRolls: () => ({ isPending: { value: false }, mutate: mocks.mutate }),
}));

import UseAllAwarenessButton from "./UseAllAwarenessButton.vue";

describe("UseAllAwarenessButton", () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.party = [{ id: "m1" }, { id: "m2" }];
    mocks.mutate.mockClear();
  });

  it("uses the roll of every active member, not only the first", async () => {
    const w = mount(UseAllAwarenessButton);
    await w.find("button").trigger("click");
    expect(mocks.mutate).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("sends nothing for an empty party, rather than a call with no members", async () => {
    mocks.party = [];
    const w = mount(UseAllAwarenessButton);
    await w.find("button").trigger("click");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("is hidden while the rule is off", () => {
    mocks.enabled = false;
    expect(mount(UseAllAwarenessButton).find("button").exists()).toBe(false);
  });
});
