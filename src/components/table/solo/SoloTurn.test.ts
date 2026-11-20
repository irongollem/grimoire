import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { PcAttackRow } from "@/types/pcAttack.types";
import type { PartyMember } from "@/types/party.types";

const rows = vi.hoisted(() => ({ list: [] as unknown[], carried: [] as { id: string; name: string }[] }));
vi.mock("@/composables/encounters/usePcAttackRows", async () => {
  const { computed } = await import("vue");
  return { usePcAttackRows: () => ({ all: computed(() => rows.list), carriedWeapons: computed(() => rows.carried) }) };
});

import SoloTurn from "./SoloTurn.vue";

const attack = (over: Partial<PcAttackRow>): PcAttackRow => ({
  key: "sword",
  name: "Shortsword",
  baseDice: null,
  modifier: 4,
  shape: null,
  damageType: "piercing",
  kind: "melee",
  attackBonus: 7,
  damageDice: "1d8+4",
  damageFixed: null,
  description: "",
  ammoTag: null,
  weaponInvId: null,
  ...over,
});

const FULL = { action: true, bonus: true, reaction: true, words: true, smallThing: true };
const turn = (over: Record<string, unknown> = {}) =>
  mount(SoloTurn, {
    props: { member: {} as PartyMember, round: 2, hp: { hp: 46, maxHp: 58 }, speedFeet: 30, movedFeet: 10, budget: FULL, armedKey: null, busy: false, ...over },
  });
const named = (w: ReturnType<typeof turn>, label: string) => w.findAll("button").find((b) => b.attributes("aria-label") === label || b.text() === label)!;

describe("SoloTurn", () => {
  beforeEach(() => {
    rows.carried = [];
  });

  // Bug caught: Search missing from the act menu, so a player cannot hunt for a hiding foe, or the button spending a spent Action.
  it("offers Search among the acts, emits it, and disables it once the Action is spent", async () => {
    const w = turn();
    await named(w, "Search").trigger("click");
    expect(w.emitted("act")![0]).toEqual(["search"]);
    expect(named(turn({ budget: { ...FULL, action: false } }), "Search").attributes("disabled")).toBeDefined();
  });

  // Bug caught: a carried bow with no way to draw it (the Carried list is missing for an unheld weapon).
  it("lists a carried weapon with a Draw button that emits its row id", async () => {
    rows.list = [];
    rows.carried = [{ id: "inv-bow", name: "Longbow" }];
    const w = turn();
    expect(w.get('[data-testid="solo-carried"]').text()).toContain("Longbow");
    await named(w, "Draw Longbow").trigger("click");
    expect(w.emitted("draw")![0]).toEqual(["inv-bow"]);
  });

  // Bug caught: drawing twice in one turn (Draw stays live once the small thing is spent), with the reason missing.
  it("disables Draw with a reason once the small thing is spent", async () => {
    rows.list = [];
    rows.carried = [{ id: "inv-bow", name: "Longbow" }];
    const w = turn({ budget: { ...FULL, smallThing: false } });
    expect(named(w, "Draw Longbow").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("You have already handled one thing this turn");
    await named(w, "Draw Longbow").trigger("click");
    expect(w.emitted("draw")).toBeUndefined();
  });

  // Bug caught: a Draw button live in the middle of a roll.
  it("disables Draw while busy", () => {
    rows.list = [];
    rows.carried = [{ id: "inv-bow", name: "Longbow" }];
    expect(named(turn({ busy: true }), "Draw Longbow").attributes("disabled")).toBeDefined();
  });

  // Bug caught: an empty Carried heading when nothing is carried.
  it("shows no Carried section when nothing is carried", () => {
    rows.list = [];
    expect(turn().find('[data-testid="solo-carried"]').exists()).toBe(false);
  });

  // Bug caught: Attack offered after the Action is spent, so the server refuses a turn the player was invited to take.
  it("offers no live attack or action button once the Action is spent", () => {
    rows.list = [attack({})];
    const w = turn({ budget: { ...FULL, action: false } });
    for (const label of ["Attack with Shortsword", "Dash", "Dodge", "Disengage", "Hide"]) {
      expect(named(w, label).attributes("disabled")).toBeDefined();
    }
  });

  // Bug caught: ending the turn gated on the Action, which traps a player who has nothing left to do.
  it("still ends the turn when the Action is spent", async () => {
    rows.list = [];
    const w = turn({ budget: { ...FULL, action: false } });
    await named(w, "End my turn").trigger("click");
    expect(w.emitted("end")).toHaveLength(1);
  });

  // Bug caught: a click during a resolution sending a second request while the first is in flight.
  it("emits nothing while busy", async () => {
    rows.list = [attack({})];
    const w = turn({ busy: true });
    for (const label of ["Attack with Shortsword", "Dash", "End my turn"]) {
      await named(w, label).trigger("click");
    }
    expect(w.emitted()).toEqual({});
  });

  // Bug caught: pressing the armed attack again re-emitting attack (so it can never be put down) instead of cancelling.
  it("cancels the armed attack when it is pressed again", async () => {
    rows.list = [attack({})];
    const w = turn({ armedKey: "sword" });
    expect(named(w, "Attack with Shortsword").text()).toBe("Pick a target…");
    await named(w, "Attack with Shortsword").trigger("click");
    expect(w.emitted("cancelAttack")).toHaveLength(1);
    expect(w.emitted("attack")).toBeUndefined();
  });

  it("emits the row when an attack is chosen", async () => {
    const sword = attack({});
    rows.list = [sword];
    const w = turn();
    await named(w, "Attack with Shortsword").trigger("click");
    expect(w.emitted("attack")![0]).toEqual([sword]);
  });

  // Bug caught: a save-based custom attack given an Attack button that rolls against nothing.
  it("lists a custom attack with no bonus without an Attack button", () => {
    rows.list = [attack({ key: "breath", name: "Fire Breath", kind: "custom", attackBonus: null, damageDice: "2d6", damageType: "fire" })];
    const w = turn();
    expect(w.text()).toContain("Fire Breath");
    expect(w.text()).toContain("2d6 fire");
    expect(w.find('button[aria-label="Attack with Fire Breath"]').exists()).toBe(false);
  });

  it("emits which of the four actions was taken", async () => {
    rows.list = [];
    const w = turn();
    await named(w, "Disengage").trigger("click");
    expect(w.emitted("act")![0]).toEqual(["disengage"]);
  });

  // Bug caught: movement meter reporting the wrong total, so the player plans moves against the wrong speed.
  it("reports movement against speed for assistive tech", () => {
    rows.list = [];
    const m = turn({ movedFeet: 10, speedFeet: 30 }).get('[role="meter"][aria-label="Movement used"]');
    expect([m.attributes("aria-valuenow"), m.attributes("aria-valuemax")]).toEqual(["10", "30"]);
  });
});
