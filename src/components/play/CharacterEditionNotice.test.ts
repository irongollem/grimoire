import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CharacterEditionNotice from "./CharacterEditionNotice.vue";
import type { PartyMember } from "@/types/party.types";

const convertInPlace = vi.fn();
const confirm = vi.fn();
const success = vi.fn();
const userId = { value: "u1" as string | undefined };

vi.mock("@/composables/party/useCharacterRuleset", () => ({
  useConvertCharacterRuleset: () => ({ mutateAsync: convertInPlace, isPending: false }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    get user() {
      return userId.value ? { id: userId.value } : null;
    },
  }),
}));

function member(over: Partial<PartyMember>): PartyMember {
  return { id: "m1", name: "Mira", ruleset: "2014", owner_user_id: "u1", user_id: "dm", ...over } as PartyMember;
}

const table = { id: "c1", name: "Strahd", ruleset: "2024" as const, allows_mixed_rulesets: false };

function mountNotice(m: PartyMember, campaign = table) {
  return mount(CharacterEditionNotice, { props: { member: m, campaign } });
}

describe("CharacterEditionNotice", () => {
  beforeEach(() => {
    convertInPlace.mockReset();
    confirm.mockReset();
    success.mockReset();
    userId.value = "u1";
  });

  it("renders nothing when the editions match", () => {
    const wrapper = mountNotice(member({ ruleset: "2024" }));
    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("is informational when the table takes both", () => {
    const wrapper = mountNotice(member({}), { ...table, allows_mixed_rulesets: true });
    expect(wrapper.get("[data-testid='edition-info']").text()).toBe(
      "Built with the 2014 rules. This table plays 2024 and takes both.",
    );
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("offers conversion to the owner", () => {
    const wrapper = mountNotice(member({}));
    expect(wrapper.find("[data-testid='edition-caution']").exists()).toBe(true);
    expect(wrapper.get("button").text()).toBe("Convert to 2024");
  });

  it("offers conversion to the creator of an unowned character", () => {
    userId.value = "dm";
    const wrapper = mountNotice(member({ owner_user_id: null }));
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("names who can convert when the viewer cannot", () => {
    userId.value = "someone-else";
    const wrapper = mountNotice(member({}));
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).toContain("Its player can convert it.");
  });

  it("confirms, then converts in place", async () => {
    confirm.mockResolvedValue(true);
    convertInPlace.mockResolvedValue(undefined);
    const wrapper = mountNotice(member({}));
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(convertInPlace).toHaveBeenCalledWith({ partyMemberId: "m1", ruleset: "2024" });
    expect(success).toHaveBeenCalled();
  });

  it("does not convert when the confirmation is declined", async () => {
    confirm.mockResolvedValue(false);
    const wrapper = mountNotice(member({}));
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(convertInPlace).not.toHaveBeenCalled();
  });
});
