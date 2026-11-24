import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));

type Goblin = { id: string; name: string; is_shared: boolean; challenge_rating: string; source: string | null; source_title: string | null };
const monsters = shallowRef<Goblin[] | undefined>(undefined);
const party = shallowRef<{ id: string }[] | undefined>(undefined);
const companions = shallowRef<{ id: string; fights: boolean }[] | undefined>(undefined);

vi.mock("@/composables/encounters/useEncounters", () => ({ useCreateEncounter: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: companions }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: party }) }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: () => ({ data: monsters }) }));
vi.mock("@/ai/useEncounterGeneration", () => ({
  useEncounterGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));
vi.mock("@/lib/tiptap/markdownToTiptap", () => ({ toTiptapJson: (text: string) => `doc:${text}` }));
vi.mock("@/lib/encounters/companionCombat", () => ({ takesPartInCombat: (c: { fights: boolean }) => c.fights }));

const { useGenerateEncounter, buildEncounterDescription } = await import("./useGenerateEncounter");

const goblin: Goblin = { id: "m-gob", name: "Goblin", is_shared: true, challenge_rating: "1/4", source: null, source_title: null };
const generated = {
  name: "Road Ambush", difficulty: "medium", environment: "A forest road", tactics: "Hit and run", twist: "A bridge",
  combatants: [{ name: "Goblin", count: 3, role: "Archer" }, { name: "Dragon of Nowhere", count: 1, role: "Boss" }]
};

describe("useGenerateEncounter", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    busy.value = false;
    genError.value = null;
    monsters.value = [goblin];
    party.value = [{ id: "pc1" }, { id: "pc2" }];
    companions.value = [{ id: "c-fights", fights: true }, { id: "c-bystander", fights: false }];
  });

  it("saves the encounter at the place it was set in, and keeps the model options free of it", async () => {
    const { generateEncounterDraft, saveEncounterDraft } = useGenerateEncounter();
    const { draft } = await generateEncounterDraft("Ambush", { difficulty: "hard" });
    expect(mocks.generate).toHaveBeenCalledWith("Ambush", { difficulty: "hard" });
    if (draft === null) throw new Error("no draft");
    await saveEncounterDraft(draft, "l1");
    expect(mocks.create.mock.calls[0][0].location_id).toBe("l1");
  });

  // Bug caught: generating saved the encounter before the DM had looked at it.
  it("generating saves nothing: only saving the draft creates the encounter", async () => {
    const { generateEncounterDraft, saveEncounterDraft } = useGenerateEncounter();
    const { draft } = await generateEncounterDraft("Ambush", { difficulty: "hard" });
    expect(mocks.create).not.toHaveBeenCalled();
    if (draft === null) throw new Error("no draft");
    await saveEncounterDraft(draft, null);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    expect(await useGenerateEncounter().generateEncounterDraft("Ambush", { difficulty: "auto" })).toEqual({ draft: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("makes no draft and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    expect(await useGenerateEncounter().generateEncounterDraft("Ambush", { difficulty: "auto" })).toEqual({ draft: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("starts with the whole active party and the companions who fight, and keeps a creature the Bestiary lacks as a line to add by hand", async () => {
    const { generateEncounterDraft, saveEncounterDraft } = useGenerateEncounter();
    const { draft } = await generateEncounterDraft("Ambush", { difficulty: "hard" });
    if (draft === null) throw new Error("no draft");
    expect(draft.unmatched).toHaveLength(1);
    await saveEncounterDraft(draft, null);
    const saved = mocks.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      name: "Road Ambush", party_member_ids: ["pc1", "pc2"], companion_ids: ["c-fights"], is_finished: false, location_id: null,
    });
    expect(saved.combatants).toHaveLength(1);
    expect(saved.combatants[0]).toMatchObject({ monster_id: "m-gob", count: 3 });
    expect(saved.description).toContain("Add manually: Dragon of Nowhere (Boss)");
  });

  it("waits for the Bestiary and the party instead of building an empty encounter", async () => {
    monsters.value = undefined;
    const pending = useGenerateEncounter().generateEncounterDraft("Ambush", { difficulty: "auto" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    monsters.value = [goblin];
    const { draft } = await pending;
    expect(draft?.matched).toHaveLength(1);
  });

  it("refuses to save against a party that has not loaded, rather than start without them", async () => {
    party.value = undefined;
    await expect(useGenerateEncounter().saveGeneratedEncounter(generated, [], [])).rejects.toThrow("party has not loaded");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a failed save throw so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("quota_exceeded"));
    const { generateEncounterDraft, saveEncounterDraft } = useGenerateEncounter();
    const { draft } = await generateEncounterDraft("Ambush", { difficulty: "auto" });
    if (draft === null) throw new Error("no draft");
    await expect(saveEncounterDraft(draft, null)).rejects.toThrow("quota_exceeded");
  });
});

describe("buildEncounterDescription", () => {
  it("writes only what the model gave, and no Add manually line when every creature matched", () => {
    expect(buildEncounterDescription({ ...generated, tactics: "", twist: "" }, [])).toBe("doc:Environment: A forest road");
  });
});
