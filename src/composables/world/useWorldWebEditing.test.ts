import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useWorldWebEditing } from "./useWorldWebEditing";
import { tie } from "@/lib/worldWeb/tieFixture";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retype: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useRetypeConnection: () => ({ mutateAsync: mocks.retype, isPending: ref(false) }),
  useRemoveConnection: () => ({ mutateAsync: mocks.remove, isPending: ref(false) }),
  useUpdateLink: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: (e: unknown, f: string) => (e instanceof Error ? e.message : f) }),
}));

const choice: TypeChoice = { key: "worships", word: "worships", subjectIsFrom: true, family: "faith", common: true, pair: "person_deity" };

describe("useWorldWebEditing", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("ties two things through the connections layer and says so", async () => {
    mocks.create.mockResolvedValue(undefined);
    const ok = await useWorldWebEditing().connect("npc:brenna", { kind: "deity", id: "lady", name: "The Drowned Lady" }, choice);
    expect(ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({
      subject: { kind: "npc", id: "brenna" },
      other: { kind: "deity", id: "lady", name: "The Drowned Lady" },
      choice,
    });
    expect(mocks.success).toHaveBeenCalledWith("Tied together.");
  });

  it("refuses to start a tie from a quest", async () => {
    const ok = await useWorldWebEditing().connect("quest:q1", { kind: "npc", id: "harl", name: "Harl" }, choice);
    expect(ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });

  it("reports a failed write instead of swallowing it", async () => {
    mocks.create.mockRejectedValue(new Error("denied"));
    const ok = await useWorldWebEditing().connect("npc:brenna", { kind: "deity", id: "lady", name: "L" }, choice);
    expect(ok).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith("denied");
  });

  it("retypes a tie read from the subject's side", async () => {
    mocks.retype.mockResolvedValue(undefined);
    const t = tie({});
    await useWorldWebEditing().retypeTie(t, "deity:lady", choice);
    const arg = mocks.retype.mock.calls[0]?.[0];
    expect(arg.subject).toEqual({ kind: "deity", id: "lady" });
    expect(arg.connection).toMatchObject({ row_id: "r1", outward: false, other_kind: "npc", other_id: "brenna" });
  });

  it("removes a tie only after the DM confirms", async () => {
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.remove.mockResolvedValue(undefined);
    const editing = useWorldWebEditing();
    expect(await editing.removeTie(tie({}), "npc:brenna")).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await editing.removeTie(tie({}), "npc:brenna")).toBe(true);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("saves a link's note and the line players are told together", async () => {
    mocks.update.mockResolvedValue(undefined);
    await useWorldWebEditing().saveWords(tie({ row_id: "l9" }), { note: "Owes Harl", told: "Every dawn she leaves a coin." });
    expect(mocks.update).toHaveBeenCalledWith({ id: "l9", note: "Owes Harl", told: "Every dawn she leaves a coin." });
  });
});
