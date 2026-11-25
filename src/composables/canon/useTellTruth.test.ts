import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), nameKnower: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutateAsync: mocks.update }) }));
vi.mock("@/composables/canon/useKnownTo", () => ({ useKnownTo: () => ({ nameKnower: mocks.nameKnower }) }));
vi.mock("@/composables/canon/useRevealSecret", () => ({ useOpenSessionId: () => () => "sess1" }));

import { useTellTruth } from "@/composables/canon/useTellTruth";

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.nameKnower.mockReset().mockResolvedValue(undefined);
});

describe("useTellTruth", () => {
  // Bug caught (#1279 review): naming one knower on a truth known to all rewrote it to "some", narrowing who knows it.
  it("names knowers on a truth known to all without narrowing it", async () => {
    const { tellSome } = useTellTruth(() => "t1");
    await tellSome({ id: "t1", revealed_at: null, knowledge: "all" }, [{ id: "pm1", name: "Mira" }]);
    expect(mocks.nameKnower).toHaveBeenCalledWith("t1", { kind: "party_member", id: "pm1", name: "Mira" });
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: expect.objectContaining({ knowledge: "all" }) });
  });

  // Bug caught: a secret or some-known truth told to chosen characters left at its old mark, so nobody's World tab had it.
  it("marks any other truth known to some when told to chosen characters", async () => {
    const { tellSome } = useTellTruth(() => "t1");
    await tellSome({ id: "t1", revealed_at: null, knowledge: "secret" }, [{ id: "pm1", name: "Mira" }]);
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: expect.objectContaining({ knowledge: "some", revealed_session_id: "sess1" }) });
  });
});
