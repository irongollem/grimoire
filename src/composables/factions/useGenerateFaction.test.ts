import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const mocks = vi.hoisted(() => ({ createFaction: vi.fn(), addNpc: vi.fn(), connect: vi.fn(), connectIn: vi.fn(), generate: vi.fn() }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/factions/useFactions", () => ({
  useCreateFaction: () => ({ mutateAsync: mocks.createFaction }),
  useAddFactionNpc: () => ({ mutateAsync: mocks.addNpc }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.connect }),
  useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.connectIn }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, fallback?: string) => fallback ?? "boom" }) }));
vi.mock("@/ai/useFactionGeneration", () => ({ useFactionGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", text: t }) }));

const { useGenerateFaction } = await import("./useGenerateFaction");

const generated = (over: Record<string, unknown> = {}) => ({
  name: "The Ravens", faction_type: "", alignment: "", description: "Spies.", image_url: "emblem.png", tags: ["spies"], ...over,
});

describe("useGenerateFaction", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset().mockResolvedValue({ id: "f1", campaign_id: "c1" });
    mocks.connectIn.mockReset().mockResolvedValue(undefined);
    mocks.addNpc.mockReset().mockResolvedValue(undefined);
    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.generate.mockReset().mockResolvedValue(generated());
    busy.value = false;
    genError.value = null;
  });

  it("stores a blank generated type and alignment as null and keeps the leader and place out of the generator's options", async () => {
    await useGenerateFaction().generateAndCreateFaction("spies", { leader_name: "Mara", leaderNpcId: "n1", headquartersLocationId: "l1" });
    expect(mocks.generate).toHaveBeenCalledWith("spies", { leader_name: "Mara" });
    expect(mocks.createFaction).toHaveBeenCalledWith(expect.objectContaining({ faction_type: null, alignment: null, emblem_url: "emblem.png", player_visible_to: [] }));
  });

  it("seats the leader and ties the headquarters, each only when named", async () => {
    const both = await useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1", headquartersLocationId: "l1" });
    expect(mocks.addNpc).toHaveBeenCalledWith({ faction_id: "f1", npc_id: "n1", role: "Leader" });
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "faction", id: "f1" }, other: expect.objectContaining({ kind: "location", id: "l1" }),
    }));
    expect(both).toMatchObject({ id: "f1", leader: "saved", headquarters: "saved", linkErrors: [] });

    mocks.addNpc.mockClear();
    mocks.connect.mockClear();
    const neither = await useGenerateFaction().generateAndCreateFaction("spies");
    expect(mocks.addNpc).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(neither).toMatchObject({ leader: "none", headquarters: "none" });
  });

  it("a leader that fails to link leaves the faction saved and the headquarters still tied", async () => {
    mocks.addNpc.mockRejectedValue(new Error("npc gone"));
    const outcome = await useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1", headquartersLocationId: "l1" });
    expect(outcome).toMatchObject({ id: "f1", leader: "failed", headquarters: "saved" });
    expect(outcome.linkErrors).toEqual(["The leader could not be added: npc gone"]);
  });

  it("a headquarters that fails to link leaves the faction saved and the leader still seated", async () => {
    mocks.connect.mockRejectedValue(new Error("no such place"));
    const outcome = await useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1", headquartersLocationId: "l1" });
    expect(outcome).toMatchObject({ id: "f1", leader: "saved", headquarters: "failed" });
    expect(outcome.linkErrors[0]).toContain("The headquarters could not be set");
  });

  it("links nothing when the faction itself cannot be saved, and lets that save error through", async () => {
    mocks.createFaction.mockRejectedValue(new Error("quota_exceeded"));
    await expect(useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1" })).rejects.toThrow("quota_exceeded");
    expect(mocks.addNpc).not.toHaveBeenCalled();
  });

  it("reports a failed emblem only when one was asked for", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateFaction().generateAndCreateFaction("spies", { generateImage: true })).picture).toBe("failed");
    expect((await useGenerateFaction().generateAndCreateFaction("spies", { generateImage: false })).picture).toBe("none");
  });

  it("creates nothing while another generation is running, or when generation returns nothing", async () => {
    busy.value = true;
    genError.value = "an old failure";
    expect(await useGenerateFaction().generateAndCreateFaction("spies")).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    busy.value = false;
    mocks.generate.mockResolvedValue(null);
    expect(await useGenerateFaction().generateAndCreateFaction("spies")).toMatchObject({ id: null, error: "an old failure" });
    expect(mocks.createFaction).not.toHaveBeenCalled();
  });

  describe("links", () => {
    const serves = typeChoices("faction", "deity").find((c) => c.key === "serves") ?? typeChoices("faction", "deity")[0]!;
    const basedIn = typeChoices("faction", "location").find((c) => c.key === "based_in" && c.subjectIsFrom)!;
    const member = typeChoices("faction", "npc").find((c) => c.key === "member_of")!;
    const auril: GeneratorLink = { kind: "deity", id: "d1", name: "Auril", choice: serves };
    const docks: GeneratorLink = { kind: "location", id: "l1", name: "The Docks", choice: basedIn };

    // Bug caught: ties chosen in "Tie it to…" never reached the saved faction.
    it("writes each tie to the saved faction, in the campaign it was saved in", async () => {
      const outcome = await useGenerateFaction().generateAndCreateFaction("spies", { links: [auril] });
      expect(outcome.linkErrors).toEqual([]);
      expect(mocks.connectIn).toHaveBeenCalledWith({
        input: { subject: { kind: "faction", id: "f1" }, other: { kind: "deity", id: "d1", name: "Auril" }, choice: serves },
        campaignId: "c1",
      });
    });

    // Bug caught: a failed tie threw and the page lost the faction it had just saved.
    it("reports a failed tie and keeps the faction, the leader and the other ties", async () => {
      mocks.connectIn.mockRejectedValueOnce(new Error("denied"));
      const other: GeneratorLink = { ...auril, id: "d2", name: "Tyr" };
      const outcome = await useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1", links: [auril, other] });
      expect(outcome).toMatchObject({ id: "f1", leader: "saved" });
      expect(outcome.linkErrors).toEqual(["Auril: boom"]);
      expect(mocks.connectIn).toHaveBeenCalledTimes(2);
    });

    // Bug caught: the same headquarters or leader picked in both paths was written twice.
    it("does not write a tie the leader or headquarters field already writes", async () => {
      const leader: GeneratorLink = { kind: "npc", id: "n1", name: "Mara", choice: member };
      await useGenerateFaction().generateAndCreateFaction("spies", { leaderNpcId: "n1", headquartersLocationId: "l1", links: [leader, docks, auril] });
      expect(mocks.connectIn.mock.calls.map(([arg]) => arg.input.other.id)).toEqual(["d1"]);
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it("writes a tie to another place even when a headquarters is chosen", async () => {
      await useGenerateFaction().generateAndCreateFaction("spies", { headquartersLocationId: "l2", links: [docks] });
      expect(mocks.connectIn).toHaveBeenCalledTimes(1);
    });

    it("tells the model the ties after the concept, and nothing when there are none", async () => {
      await useGenerateFaction().generateAndCreateFaction("spies", { links: [auril] });
      expect(mocks.generate.mock.calls[0][0]).toBe(`spies\nTies: ${serves.word} Auril`);
      await useGenerateFaction().generateAndCreateFaction("spies");
      expect(mocks.generate.mock.calls[1][0]).toBe("spies");
    });

    it("writes no tie when the faction cannot be saved", async () => {
      mocks.createFaction.mockRejectedValue(new Error("quota_exceeded"));
      await expect(useGenerateFaction().generateAndCreateFaction("spies", { links: [auril] })).rejects.toThrow();
      expect(mocks.connectIn).not.toHaveBeenCalled();
    });
  });
});
