import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, reactive } from "vue";
import { mount } from "@vue/test-utils";
import {
  resolveCharacterPlacement,
  creationSubclassOptions,
  createDestination,
  buildCharacterPayload,
  changedEditColumns,
  type CharacterEditDraft,
} from "./useCharacterCreationForm";
import { useAutosave, type UseAutosaveHandle } from "@/composables/useAutosave";
import { cloneDraftValue, draftValueEqual } from "@/composables/useRecordDraft";
import type { CharacterFormState } from "@/rules/characterCreation";

describe("creationSubclassOptions", () => {
  const TABLE = "campaign-1";
  const rows = [
    { id: "life", class_name: "Cleric", subclass_name: "Life Domain", campaign_id: null },
    { id: "arcana", class_name: "Cleric", subclass_name: "Arcana Domain", campaign_id: TABLE },
    { id: "elsewhere", class_name: "Cleric", subclass_name: "Other Table Domain", campaign_id: "campaign-2" },
    { id: "fiend", class_name: "Warlock", subclass_name: "The Fiend", campaign_id: null },
  ];

  it("offers a character made onto a table that table's own homebrew beside the universal subclasses", () => {
    // A player's 2014 cleric at a table with its own Arcana Domain was offered
    // official domains only, and once one was set, level-up never asked again.
    expect(creationSubclassOptions(rows, "Cleric", TABLE).map((o) => o.name))
      .toEqual(["Life Domain", "Arcana Domain"]);
  });

  it("offers a character landing nowhere the universal subclasses only", () => {
    expect(creationSubclassOptions(rows, "Cleric", null).map((o) => o.id)).toEqual(["life"]);
  });

  it("never offers another table's homebrew, nor another class's subclasses", () => {
    expect(creationSubclassOptions(rows, "Warlock", TABLE)).toEqual([{ id: "fiend", name: "The Fiend" }]);
  });
});

describe("resolveCharacterPlacement", () => {
  const CREATOR = "user-1";
  const CAMPAIGN = "campaign-1";

  it("leaves a DM's roster character unclaimed in the active campaign", () => {
    expect(resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: CAMPAIGN, owner_user_id: null });
  });

  it("gives a player's own character to them, with no campaign of its own", () => {
    // The player's character is linked to a campaign through campaign_members,
    // not by stamping campaign_id at creation.
    expect(resolveCharacterPlacement({
      isDmCreate: false, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: null, owner_user_id: CREATOR });
  });

  it("gives a DM create with no active campaign to its creator", () => {
    // Regression for #738. Deriving both fields from isDmCreate alone set
    // campaign_id AND owner_user_id to null here, producing a character that
    // useParty, useMyCharacters, useOfferedCharacters and useCharacterPool all
    // filter out — created, levellable by direct link, and visible nowhere.
    const placement = resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: null, creatorId: CREATOR,
    });

    expect(placement).toEqual({ campaign_id: null, owner_user_id: CREATOR });
    expect(placement.owner_user_id).not.toBeNull();
  });

  it("never returns a row that is both unowned and unattached", () => {
    for (const isDmCreate of [true, false]) {
      for (const activeCampaignId of [CAMPAIGN, null]) {
        const { campaign_id, owner_user_id } = resolveCharacterPlacement({
          isDmCreate, activeCampaignId, creatorId: CREATOR,
        });
        expect(campaign_id === null && owner_user_id === null).toBe(false);
      }
    }
  });
});

describe("createDestination", () => {
  const base = { landedCampaignId: "c1", isDmCreate: false, levelUp: false, benched: false, characterId: "m1" };

  it("sends a character that stayed in the pool to the pool", () => {
    expect(createDestination({ ...base, landedCampaignId: null })).toEqual({ name: "play-home" });
  });

  it("sends a DM's roster character to the party", () => {
    expect(createDestination({ ...base, isDmCreate: true })).toEqual({ path: "/party" });
  });

  it("levels up a seated character on request", () => {
    expect(createDestination({ ...base, levelUp: true })).toEqual({
      path: "/play/character/levelup?targetLevel=2&memberId=m1",
    });
  });

  it("sends a benched character to Champions, where its notice is, even when a level up was asked for", () => {
    expect(createDestination({ ...base, levelUp: true, benched: true })).toEqual({ name: "play-champions" });
  });
});

describe("editing a saved character", () => {
  const baseForm = (over: Partial<CharacterFormState> = {}): CharacterFormState => ({
    campaign_id: "c1", name: "Chicory", player_name: "Sam", class: "Cleric", subclass: "", level: 6,
    subrace: "", species_id: null, background_id: null, max_hp: 40, current_hp: 40, temp_hp: 0,
    speed: 30, initiative_bonus: 0, str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10,
    sort_order: 0, notes: "", alignment: "", ...over,
  } as CharacterFormState);
  const draftOf = (form: CharacterFormState, slots = [0, 0, 0, 0, 0, 0, 0, 0, 0]): CharacterEditDraft =>
    ({ form, portraitUrl: "", focalPoint: null, slots });
  const build = (d: CharacterEditDraft) => buildCharacterPayload({ draft: d, existingSlots: null, playerNameFallback: null });

  it("writes only the columns the player changed", () => {
    const server = draftOf(baseForm());
    // The DM took 12 HP off while the sheet was open: that is not our edit.
    const mine = draftOf(baseForm({ player_name: "Samantha", wis: 18, current_hp: 40 }));
    const columns = changedEditColumns(mine, server, build);
    expect(columns).toEqual({ player_name: "Samantha", wis: 18 });
  });

  it("never sends the character's campaign or owner", () => {
    const server = draftOf(baseForm());
    const columns = changedEditColumns(draftOf(baseForm({ campaign_id: "c2", name: "Chic" })), server, build);
    expect(columns).toEqual({ name: "Chic" });
  });

  it("sends nothing when nothing changed", () => {
    expect(changedEditColumns(draftOf(baseForm()), draftOf(baseForm()), build)).toEqual({});
  });

  it("includes spell slots only when the maxima moved", () => {
    const server = draftOf(baseForm());
    const mine = draftOf(baseForm(), [4, 3, 3, 0, 0, 0, 0, 0, 0]);
    expect(changedEditColumns(mine, server, build).spell_slots).toEqual([
      { level: 1, max: 4, used: 0 }, { level: 2, max: 3, used: 0 }, { level: 3, max: 3, used: 0 },
    ]);
  });
});

describe("the edit form's autosave", () => {
  afterEach(() => vi.useRealTimers());

  function harness(save: (columns: object) => Promise<void>) {
    const server = { value: draftOf2() };
    const live = reactive(draftOf2());
    let handle!: UseAutosaveHandle<CharacterEditDraft>;
    const wrapper = mount(defineComponent({
      setup() {
        handle = useAutosave<CharacterEditDraft>({
          draft: live as unknown as CharacterEditDraft,
          initial: () => cloneDraftValue(live as unknown as CharacterEditDraft),
          equal: draftValueEqual,
          save: async (snapshot) => {
            const columns = changedEditColumns(snapshot, server.value, (d) =>
              buildCharacterPayload({ draft: d, existingSlots: null, playerNameFallback: null }));
            if (Object.keys(columns).length === 0) return;
            await save(columns);
            server.value = cloneDraftValue(snapshot);
          },
          canSave: () => !!live.form.name.trim(),
        });
        return () => null;
      },
    }));
    return { live, handle: () => handle, wrapper };
  }
  function draftOf2(): CharacterEditDraft {
    return {
      form: { campaign_id: "c1", name: "Chicory", player_name: "Sam", class: "Cleric", subclass: "", level: 6, wis: 16 } as CharacterFormState,
      portraitUrl: "", focalPoint: null, slots: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  }

  it("saves the edited columns after the debounce", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { live, handle, wrapper } = harness(save);
    live.form.wis = 18;
    await nextTick();
    expect(handle().status.value).toBe("dirty");
    await vi.advanceTimersByTimeAsync(2100);
    expect(save).toHaveBeenCalledWith({ wis: 18 });
    expect(handle().status.value).toBe("saved");
    wrapper.unmount();
  });

  it("flushes a pending edit when Done is pressed, without waiting for the debounce", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { live, handle, wrapper } = harness(save);
    live.form.player_name = "Samantha";
    await nextTick();
    expect(save).not.toHaveBeenCalled();
    await handle().saveNow();
    expect(save).toHaveBeenCalledWith({ player_name: "Samantha" });
    wrapper.unmount();
  });

  it("pauses while the name is blank", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { live, handle, wrapper } = harness(save);
    live.form.name = " ";
    await nextTick();
    await handle().saveNow();
    expect(save).not.toHaveBeenCalled();
    expect(handle().status.value).toBe("paused");
    wrapper.unmount();
  });
});
