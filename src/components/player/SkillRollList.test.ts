import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import SkillRollList from "./SkillRollList.vue";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({
  flavor: vi.fn(),
  prompt: vi.fn(),
  campaign: { activeCampaign: null as { user_id: string; immersive_rolls: boolean } | null },
  auth: { user: null as { id: string } | null },
  whisper: { ids: new Set<string>(), ok: true },
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendFlavorMessage: mocks.flavor }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: mocks.prompt }) }));
vi.mock("@/composables/party/useSpeaker", () => ({ useSpeaker: () => ({ speakerName: (m: { name: string }) => m.name }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useWhisperRecipients", () => ({
  useWhisperRecipients: () => ({ allowedIds: ref(mocks.whisper.ids), query: { isSuccess: ref(mocks.whisper.ok) } }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaign }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));

const member = {
  name: "Wren", str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10, proficiency_bonus: 2,
  skill_proficiencies: { stealth: "expertise", perception: "proficient" },
} as unknown as PartyMember;

function mountList(density?: "list" | "compact", extra: { checkDisadvantage?: boolean; checkPenalty?: number } = {}) {
  return mount(SkillRollList, {
    props: { member, checkDisadvantage: false, checkPenalty: 0, density, ...extra },
    global: { directives: { "roll-mode": {} } },
  });
}

describe("SkillRollList", () => {
  it("lists all eighteen skills in the Skills tab layout", () => {
    const w = mountList();
    expect(w.findAll("button")).toHaveLength(18);
    expect(w.text()).toContain("DEX");
  });

  it("compact lists the same eighteen without ability tags", () => {
    const w = mountList("compact");
    expect(w.find("[data-skill-compact]").exists()).toBe(true);
    expect(w.findAll("button")).toHaveLength(18);
    expect(w.text()).not.toContain("DEX");
  });

  it("scores a skill from the member's proficiency", () => {
    expect(mountList("compact").text()).toContain("Stealth");
    expect(mountList("compact").text()).toContain("+6");
  });
});

describe("SkillRollList rolling", () => {
  const DM = "dm-1";
  beforeEach(() => {
    mocks.flavor.mockReset().mockResolvedValue(undefined);
    mocks.prompt.mockReset().mockResolvedValue({ total: 17, modifier: 6, label: "Stealth Check", breakdown: [{ val: 11, dropped: false }], isCrit: false });
    mocks.campaign.activeCampaign = { user_id: DM, immersive_rolls: true };
    mocks.auth.user = { id: "player-1" };
    mocks.whisper = { ids: new Set([DM]), ok: true };
  });
  const roll = async (w: ReturnType<typeof mountList>, label: string, mode: "advantage" | null = null) => {
    const row = w.findAllComponents({ name: "SkillRollRow" }).find((r) => r.props("label") === label)!;
    row.vm.$emit("roll", mode);
    await flushPromises();
  };

  it("an immersive roll goes to the DM alone: the table sees only a flavour line and a masked result", async () => {
    const w = mountList();
    await roll(w, "Stealth");
    expect(mocks.flavor).toHaveBeenCalledWith("tries to move undetected", "Stealth");
    expect(mocks.prompt).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: DM, senderName: "Wren" }));
    expect(w.emitted("roll")![0][0]).toEqual({ label: "Stealth Check", dice: 0, modifier: 6, total: 0, masked: true });
  });

  it("a skill that is not on the immersive list, or a table without immersive rolls, rolls openly with its real total", async () => {
    const w = mountList();
    await roll(w, "Athletics");
    expect(mocks.flavor).not.toHaveBeenCalled();
    expect(w.emitted("roll")![0][0]).toMatchObject({ dice: 11, total: 17 });
    expect(w.emitted("roll")![0][0]).not.toHaveProperty("masked");
    mocks.campaign.activeCampaign = { user_id: DM, immersive_rolls: false };
    await roll(w, "Stealth");
    expect(mocks.flavor).not.toHaveBeenCalled();
    expect(w.emitted("roll")![1][0]).toMatchObject({ total: 17 });
  });

  it("rolls openly when the DM may not be whispered (a young player and an adult who is not their parent)", async () => {
    mocks.whisper = { ids: new Set(), ok: true };
    const w = mountList();
    await roll(w, "Stealth");
    expect(mocks.flavor).not.toHaveBeenCalled();
    expect(w.emitted("roll")![0][0]).toMatchObject({ total: 17 });
  });

  it("stays immersive until the server has answered who may be whispered, so a hidden result is never published", async () => {
    mocks.whisper = { ids: new Set(), ok: false };
    const w = mountList();
    await roll(w, "Stealth");
    expect(mocks.flavor).toHaveBeenCalled();
    expect(w.emitted("roll")![0][0]).toMatchObject({ masked: true });
  });

  it("a DM previewing as a player is always allowed to whisper themselves", async () => {
    mocks.whisper = { ids: new Set(), ok: true };
    mocks.auth.user = { id: DM };
    const w = mountList();
    await roll(w, "Stealth");
    expect(mocks.flavor).toHaveBeenCalled();
  });

  it("rolls openly when the campaign has no DM to whisper to", async () => {
    mocks.campaign.activeCampaign = null;
    const w = mountList();
    await roll(w, "Stealth");
    expect(mocks.flavor).not.toHaveBeenCalled();
  });

  it("adds the exhaustion penalty to the bonus, and an exhausted check is labelled disadvantage", async () => {
    mocks.campaign.activeCampaign = { user_id: DM, immersive_rolls: false };
    const w = mountList("list", { checkDisadvantage: true, checkPenalty: -2 });
    await roll(w, "Athletics");
    expect(mocks.prompt).toHaveBeenCalledWith(expect.objectContaining({ counts: { 20: 1 }, modifier: 0 + -2, mode: "disadvantage", label: "Athletics Check (Dis)" }));
  });

  it("advantage picked on the row cancels exhaustion's disadvantage to a straight roll", async () => {
    mocks.campaign.activeCampaign = null;
    const w = mountList("list", { checkDisadvantage: true });
    await roll(w, "Athletics", "advantage");
    expect(mocks.prompt).toHaveBeenCalledWith(expect.objectContaining({ mode: "normal", label: "Athletics Check" }));
  });

  it("emits no masked result when a physical-dice prompt for an immersive check is cancelled", async () => {
    mocks.prompt.mockResolvedValue(null);
    const w = mountList();
    await roll(w, "Stealth");
    expect(w.emitted("roll")).toBeUndefined();
  });

  it("announces nothing when the player cancels a physical-dice prompt", async () => {
    mocks.campaign.activeCampaign = null;
    mocks.prompt.mockResolvedValue(null);
    const w = mountList();
    await roll(w, "Athletics");
    expect(w.emitted("roll")).toBeUndefined();
  });
});
