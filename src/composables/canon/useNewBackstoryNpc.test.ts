import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createNpc: vi.fn(), connect: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(), campaignId: "campaign-1" }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, info: mocks.toastInfo, fromError: (e: Error) => e.message } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaignId() { return mocks.campaignId; } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useCreateNpcInCampaign: () => ({ mutateAsync: mocks.createNpc }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.connect }) }));

import { useNewBackstoryNpc } from "./useNewBackstoryNpc";
import { typeChoices } from "@/lib/worldLinks/connections";

const personTie = typeChoices("npc", "party_member")[0]!;

describe("useNewBackstoryNpc", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.connect.mockReset();
    mocks.toastError.mockReset();
    mocks.toastInfo.mockReset();
    mocks.campaignId = "campaign-1";
    mocks.createNpc.mockResolvedValue({ id: "npc-1", name: "Maren" });
    mocks.connect.mockResolvedValue(undefined);
  });

  const maren = { name: "Maren", relationship: personTie };

  // Bug caught: the person a backstory brings in was created visible to the players (or untied), so the DM shared a
  // stranger by creating them, or found them nowhere near the story they came from.
  it("makes the person named, hidden from every player and tied `about` from the backstory, and hands them back without navigating", async () => {
    const made = await useNewBackstoryNpc().start("entry-1", "Tansy", "pc-1", maren);
    expect(made).toEqual({ id: "npc-1", name: "Maren" });
    expect(mocks.createNpc).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: "campaign-1", player_visible_to: [], player_visible_fields: [], name: "Maren" }));
    expect(mocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          subject: { kind: "canon", id: "entry-1" },
          other: { kind: "npc", id: "npc-1", name: "Maren" },
          choice: expect.objectContaining({ key: "about", subjectIsFrom: true }),
        }),
        campaignId: "campaign-1",
      }),
    );
    expect(mocks.connect).toHaveBeenCalledWith({
      input: { subject: { kind: "npc", id: "npc-1" }, other: { kind: "party_member", id: "pc-1", name: "Tansy" }, choice: personTie },
      campaignId: "campaign-1",
    });
  });

  // Bug caught: a blank name still creating "an NPC with no name" (the form's required field not enforced where it counts).
  it("creates nothing for a blank name", async () => {
    expect(await useNewBackstoryNpc().start("entry-1", "Tansy", "pc-1", { name: "   ", relationship: null })).toBeNull();
    expect(mocks.createNpc).not.toHaveBeenCalled();
  });

  // Bug caught: an optional relationship still writing a person tie (with a null choice, or a made-up default type).
  it("writes only the backstory tie when no relationship is given", async () => {
    await useNewBackstoryNpc().start("entry-1", "Tansy", "pc-1", { name: "Maren", relationship: null });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.connect.mock.calls[0]![0].input.subject).toEqual({ kind: "canon", id: "entry-1" });
  });

  it("returns nothing for a person it could not tie, and tells the DM instead", async () => {
    mocks.connect.mockRejectedValue(new Error("tie refused"));
    expect(await useNewBackstoryNpc().start("entry-1", "Tansy", "pc-1", maren)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith("tie refused");
  });

  it("keeps both ties in the originating campaign if the active campaign changes mid-flow", async () => {
    mocks.connect.mockImplementationOnce(async () => { mocks.campaignId = "campaign-2"; });
    await useNewBackstoryNpc().start("entry-1", "Tansy", "pc-1", maren);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.connect.mock.calls.map(([value]) => value.campaignId)).toEqual(["campaign-1", "campaign-1"]);
    expect(mocks.toastInfo).toHaveBeenCalled();
  });
});
