import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ createFaction: vi.fn(), addNpc: vi.fn(), connect: vi.fn(), generate: vi.fn() }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/factions/useFactions", () => ({
  useCreateFaction: () => ({ mutateAsync: mocks.createFaction }),
  useAddFactionNpc: () => ({ mutateAsync: mocks.addNpc }),
}));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));
vi.mock("@/ai/useFactionGeneration", () => ({ useFactionGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", text: t }) }));

const { useGenerateFaction } = await import("./useGenerateFaction");

const generated = (over: Record<string, unknown> = {}) => ({
  name: "The Ravens", faction_type: "", alignment: "", description: "Spies.", image_url: "emblem.png", tags: ["spies"], ...over,
});

describe("useGenerateFaction", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset().mockResolvedValue({ id: "f1" });
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
});
