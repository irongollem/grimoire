import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ createNpc: vi.fn(), connect: vi.fn(), push: vi.fn(), toastError: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: Error) => e.message } }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useCreateNpc: () => ({ mutateAsync: mocks.createNpc, isPending: ref(false) }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));

import { useNewBackstoryNpc } from "./useNewBackstoryNpc";

describe("useNewBackstoryNpc", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createNpc.mockResolvedValue({ id: "npc-1", name: "Someone from Tansy's past" });
    mocks.connect.mockResolvedValue(undefined);
  });

  // Bug caught: the person a backstory brings in was created visible to the players (or untied), so the DM shared a
  // stranger by creating them, or found them nowhere near the story they came from.
  it("makes the person hidden from every player and tied `about` from the backstory, then opens them", async () => {
    await useNewBackstoryNpc().start("entry-1", "Tansy");
    expect(mocks.createNpc).toHaveBeenCalledWith(expect.objectContaining({ player_visible_to: [], player_visible_fields: [], name: "Someone from Tansy's past" }));
    expect(mocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: "canon", id: "entry-1" },
        other: { kind: "npc", id: "npc-1", name: "Someone from Tansy's past" },
        choice: expect.objectContaining({ key: "about", subjectIsFrom: true }),
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith({ name: "npc-detail", params: { id: "npc-1" } });
  });

  it("does not open a person it could not tie, and tells the DM instead", async () => {
    mocks.connect.mockRejectedValue(new Error("tie refused"));
    await useNewBackstoryNpc().start("entry-1", "Tansy");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("tie refused");
  });
});
