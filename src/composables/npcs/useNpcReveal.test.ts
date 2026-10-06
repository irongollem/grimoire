import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Npc } from "@/types/npc.types";

const mocks = vi.hoisted(() => ({
  updateNpc: vi.fn(),
  sendNarrativeEvent: vi.fn(),
  reportChatFailure: vi.fn(),
  dmMode: { value: "play" as "play" | "prep" },
}));

vi.mock("@/composables/npcs/useNpcs", () => ({
  useUpdateNpc: () => ({ mutate: mocks.updateNpc }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendNarrativeEvent: mocks.sendNarrativeEvent }),
}));
vi.mock("@/composables/campaign/chatSendErrors", () => ({
  useChatSendFailure: () => ({ reportChatFailure: mocks.reportChatFailure }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "pc-1", name: "Aela" },
      { id: "pc-2", name: "Brom" },
    ]),
  }),
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({
    get dmMode() {
      return mocks.dmMode.value;
    },
  }),
}));

import { npcShareUpdate, useNpcReveal } from "./useNpcReveal";

function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: "npc-1",
    name: "Lord Vance",
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: false,
    player_visible_to: [],
    player_visible_fields: [],
    ...over,
  } as Npc;
}

describe("useNpcReveal", () => {
  beforeEach(() => {
    mocks.updateNpc.mockReset();
    mocks.sendNarrativeEvent.mockReset().mockResolvedValue(undefined);
    mocks.reportChatFailure.mockReset();
    mocks.dmMode.value = "play";
  });

  it("seeds the default fields on a first share and writes both columns at once", () => {
    const { adapter, fields, visibleTo } = useNpcReveal(() => makeNpc());
    adapter.toggleMember("pc-1");
    expect(mocks.updateNpc).toHaveBeenCalledTimes(1);
    expect(mocks.updateNpc).toHaveBeenCalledWith({
      id: "npc-1",
      update: { player_visible_to: ["pc-1"], player_visible_fields: ["name", "portrait"] },
    });
    expect(visibleTo.value).toEqual(["pc-1"]);
    expect(fields.value).toEqual(["name", "portrait"]);
  });

  it("keeps the DM's chosen fields on a re-share", () => {
    const { adapter } = useNpcReveal(() => makeNpc({ player_visible_fields: ["name"] }));
    adapter.toggleMember("pc-1");
    expect(mocks.updateNpc).toHaveBeenCalledWith({
      id: "npc-1",
      update: { player_visible_to: ["pc-1"], player_visible_fields: ["name"] },
    });
  });

  it("leaves the field list alone when unsharing", () => {
    const { adapter, fields } = useNpcReveal(() =>
      makeNpc({ player_visible_to: ["pc-1"], player_visible_fields: ["portrait"] }),
    );
    adapter.unshare();
    expect(mocks.updateNpc).toHaveBeenCalledWith({
      id: "npc-1",
      update: { player_visible_to: [], player_visible_fields: ["portrait"] },
    });
    expect(fields.value).toEqual(["portrait"]);
    expect(mocks.sendNarrativeEvent).not.toHaveBeenCalled();
  });

  it("announces the encounter in play mode under the player-facing name", () => {
    const { adapter } = useNpcReveal(() => makeNpc());
    adapter.toggleMember("pc-1");
    expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith("Aela encounters Lord Vance.", "npc-1");
  });

  it("never announces the true name of a disguised NPC", () => {
    const { adapter } = useNpcReveal(() => makeNpc({ disguise_name: "The Stranger" }));
    adapter.toggleMember("pc-2");
    const [msg] = mocks.sendNarrativeEvent.mock.calls[0] as [string];
    expect(msg).toBe("Brom encounters The Stranger.");
    expect(msg).not.toContain("Lord Vance");
  });

  it("announces under 'someone' when the name is not shared", () => {
    const { adapter } = useNpcReveal(() => makeNpc({ player_visible_fields: ["portrait"] }));
    adapter.toggleMember("pc-1");
    expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith("Aela encounters someone.", "npc-1");
  });

  it("announces a whole-party share only when it was hidden", () => {
    const hidden = useNpcReveal(() => makeNpc());
    hidden.adapter.setWholeParty();
    expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith("The party encounters Lord Vance.", "npc-1");
    expect(mocks.updateNpc).toHaveBeenCalledWith({
      id: "npc-1",
      update: { player_visible_to: ["pc-1", "pc-2"], player_visible_fields: ["name", "portrait"] },
    });

    mocks.sendNarrativeEvent.mockClear();
    const shared = useNpcReveal(() => makeNpc({ player_visible_to: ["pc-1"] }));
    shared.adapter.setWholeParty();
    expect(mocks.sendNarrativeEvent).not.toHaveBeenCalled();
  });

  it("announces nothing in prep mode", () => {
    mocks.dmMode.value = "prep";
    const { adapter, setRevealed } = useNpcReveal(() =>
      makeNpc({ disguise_name: "The Stranger", player_visible_fields: ["name"] }),
    );
    adapter.toggleMember("pc-1");
    adapter.setWholeParty();
    setRevealed(true);
    expect(mocks.sendNarrativeEvent).not.toHaveBeenCalled();
    expect(mocks.updateNpc).toHaveBeenCalled();
  });

  it("does not announce when a member is removed", () => {
    const { adapter } = useNpcReveal(() => makeNpc({ player_visible_to: ["pc-1"] }));
    adapter.toggleMember("pc-1");
    expect(mocks.sendNarrativeEvent).not.toHaveBeenCalled();
  });

  it("reports a failed announcement", async () => {
    const error = new Error("nope");
    mocks.sendNarrativeEvent.mockRejectedValue(error);
    const { adapter } = useNpcReveal(() => makeNpc());
    adapter.toggleMember("pc-1");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.reportChatFailure).toHaveBeenCalledWith(error, "announce the reveal in the chat");
  });

  describe("setRevealed", () => {
    it("announces cover and true name when both are player-visible", () => {
      const { setRevealed, isRevealed } = useNpcReveal(() =>
        makeNpc({ disguise_name: "The Stranger", player_visible_fields: ["name"] }),
      );
      setRevealed(true);
      expect(isRevealed.value).toBe(true);
      expect(mocks.updateNpc).toHaveBeenCalledWith({ id: "npc-1", update: { is_revealed: true } });
      expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith(
        "The Stranger is revealed to be Lord Vance.",
        "npc-1",
      );
    });

    it("says only 'has been revealed' when there is no distinct cover", () => {
      const { setRevealed } = useNpcReveal(() => makeNpc({ player_visible_fields: ["name"] }));
      setRevealed(true);
      expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith("Lord Vance has been revealed.", "npc-1");
    });

    it("never leaks the true name when the name field is unticked", () => {
      const { setRevealed } = useNpcReveal(() => makeNpc({ disguise_name: "The Stranger" }));
      setRevealed(true);
      expect(mocks.sendNarrativeEvent).toHaveBeenCalledWith("A disguise falls away.", "npc-1");
    });

    it("does not announce when hiding the alter ego again", () => {
      const { setRevealed } = useNpcReveal(() => makeNpc({ disguise_name: "X", is_revealed: true }));
      setRevealed(false);
      expect(mocks.sendNarrativeEvent).not.toHaveBeenCalled();
    });
  });

  it("setFields writes only the field list", () => {
    const { setFields, fields } = useNpcReveal(() => makeNpc());
    setFields(["name"]);
    expect(fields.value).toEqual(["name"]);
    expect(mocks.updateNpc).toHaveBeenCalledWith({ id: "npc-1", update: { player_visible_fields: ["name"] } });
  });
});

describe("npcShareUpdate", () => {
  it("seeds the field list when the NPC is shared", () => {
    const update = npcShareUpdate(["m1"], []);
    expect(update.player_visible_to).toEqual(["m1"]);
    expect(update.player_visible_fields.length).toBeGreaterThan(0);
  });

  it("leaves the DM's field choice alone when hiding", () => {
    expect(npcShareUpdate([], ["name"])).toEqual({ player_visible_to: [], player_visible_fields: ["name"] });
  });
});
