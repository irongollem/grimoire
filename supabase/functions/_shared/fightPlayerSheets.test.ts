import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { loadPlayerSheets } from "./fightPlayerSheets";

// What an ally casts from is read with the service role, which bypasses RLS: every scope below is in the query itself.
// What would go wrong silently: another campaign's character, or another account's private class, subclass or spell,
// turning up in this fight's sheets.
const OWN_SPELL = "11111111-1111-4111-8111-111111111111";
const FOREIGN_SPELL = "22222222-2222-4222-8222-222222222222";
const GONE_SPELL = "33333333-3333-4333-8333-333333333333";
const OWN_CLASS = "44444444-4444-4444-8444-444444444444";
const FOREIGN_CLASS = "55555555-5555-4555-8555-555555555555";
const OWN_SUBCLASS = "66666666-6666-4666-8666-666666666666";
const SHARED_CLASS = "88888888-8888-4888-8888-888888888888";
const FOREIGN_SUBCLASS = "77777777-7777-4777-8777-777777777777";

const classRow = (id: string, member: string, kind: "system" | "custom", definition: string, subclass: string | null = null) =>
  ({ id, party_member_id: member, class_name: "Wizard", class_definition_id: definition, class_definition_kind: kind, subclass_definition_id: subclass, levels: 5 });
const grant = (member: string, spell: string) => ({ party_member_id: member, spell_id: spell, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: null, casting_ability: null, uses_per_day: null });

let fake: SupabaseFake;
const load = (ids = ["pm1", "pmX"]) => loadPlayerSheets(fake.client as unknown as SupabaseClient, "c1", ids);

beforeEach(() => {
  fake = createSupabaseFake();
  fake.seed("campaigns", [{ id: "c1", user_id: "owner" }]);
  fake.seed("campaign_members", [{ campaign_id: "c1", user_id: "dm2", role: "dm" }, { campaign_id: "c1", user_id: "p1", role: "player" }]);
  fake.seed("party_members", [
    { id: "pm1", campaign_id: "c1", spell_slots: [{ level: 1, max: 2, used: 0 }], wildshape_state: null },
    { id: "pmX", campaign_id: "c2", spell_slots: [{ level: 9, max: 1, used: 0 }], wildshape_state: null },
  ]);
  fake.seed("character_classes", [
    classRow("cls-sys", "pm1", "system", "sys1"),
    classRow("cls-own", "pm1", "custom", OWN_CLASS, OWN_SUBCLASS),
    classRow("cls-foreign", "pm1", "custom", FOREIGN_CLASS, FOREIGN_SUBCLASS),
    classRow("cls-shared", "pm1", "custom", SHARED_CLASS),
    classRow("cls-other-campaign", "pmX", "system", "sys1"),
  ]);
  fake.seed("system_classes", [{ id: "sys1", caster_type: "prepared" }]);
  fake.seed("custom_classes", [
    { id: OWN_CLASS, user_id: "dm2", campaign_id: null, caster_type: "prepared" },
    { id: SHARED_CLASS, user_id: null, campaign_id: null, caster_type: "prepared" },
    { id: FOREIGN_CLASS, user_id: "stranger", campaign_id: null, caster_type: "prepared" },
  ]);
  fake.seed("custom_subclasses", [
    { id: OWN_SUBCLASS, user_id: "owner", campaign_id: null, spellcasting: null },
    { id: FOREIGN_SUBCLASS, user_id: "stranger", campaign_id: null, spellcasting: null },
  ]);
  fake.seed("library_spells", [{ id: "srd_fire_bolt", name: "Fire Bolt", level: 0 }, { id: "srd_other", name: "Other", level: 1 }]);
  fake.seed("spells", [
    { id: OWN_SPELL, user_id: "owner", campaign_id: null, name: "Homebrew Bolt", level: 2 },
    { id: FOREIGN_SPELL, user_id: "stranger", campaign_id: null, name: "Stolen Bolt", level: 2 },
  ]);
  fake.seed("character_spells", [
    grant("pm1", "srd_fire_bolt"), grant("pm1", OWN_SPELL), grant("pm1", FOREIGN_SPELL), grant("pm1", GONE_SPELL),
    grant("pmX", "srd_other"),
  ]);
});

describe("loadPlayerSheets: what an ally casts from", () => {
  // Bug caught: the member read not scoped to the campaign, so another campaign's character named in the ids brought its slots,
  // classes and spells into this fight.
  it("returns nothing of a member of another campaign", async () => {
    const sheets = await load();
    expect(sheets.members.map((m) => m.id)).toEqual(["pm1"]);
    expect(sheets.casting.classes.map((c) => c.id).sort()).toEqual(["cls-foreign", "cls-own", "cls-shared", "cls-sys"]);
    expect(sheets.casting.spells.map((s) => s.party_member_id)).not.toContain("pmX");
    expect(sheets.casting.spells.map((s) => s.name)).not.toContain("Other");
  });

  // Bug caught: the grant's row id or its remaining uses dropped on the way (a daily innate spell then reads as spent, or its cast cannot be written back).
  it("carries each grant's row id and remaining daily uses", async () => {
    fake.seed("library_spells", [{ id: "srd_misty", name: "Misty Step", level: 2 }]);
    fake.seed("character_spells", [
      { id: "g-misty", party_member_id: "pm1", spell_id: "srd_misty", is_known: true, is_prepared: false, always_prepared: false, source_type: "racial", source_class_id: null, casting_ability: "cha", uses_per_day: 1, uses_remaining: 1 },
    ]);
    const misty = (await load(["pm1"])).casting.spells.find((s) => s.name === "Misty Step");
    expect(misty).toMatchObject({ id: "g-misty", uses_per_day: 1, uses_remaining: 1 });
  });

  // Bug caught: a custom class or subclass of an account that is not this campaign's DM read just because a character row points at its id.
  it("reads a custom class and subclass of this campaign's DM or owner, and not another account's", async () => {
    const { definitions } = (await load()).casting;
    // A shared book class (no owner, no campaign) is readable by everyone, as under RLS.
    expect(definitions.custom.map((d) => d.id).sort()).toEqual([OWN_CLASS, SHARED_CLASS].sort());
    expect(definitions.subclasses.map((d) => d.id)).toEqual([OWN_SUBCLASS]);
    expect(definitions.system.map((d) => d.id)).toEqual(["sys1"]);
  });

  // Bug caught: a custom spell of another account named by a granted id read into the fight.
  // Also: a library spell and a campaign spell both resolve by id to their names.
  it("names library and campaign spells by id, and not another account's custom spell", async () => {
    const names = (await load()).casting.spells.map((s) => `${s.name}@${s.level}`).sort();
    expect(names).toEqual(["Fire Bolt@0", "Homebrew Bolt@2"]);
  });

  // Bug caught: a grant whose spell resolves nowhere throwing the whole turn, or being kept with no name.
  it("drops a spell id that resolves nowhere without failing", async () => {
    const spells = (await load()).casting.spells;
    expect(spells).toHaveLength(2);
    expect(spells.every((s) => s.name !== "")).toBe(true);
  });
});
