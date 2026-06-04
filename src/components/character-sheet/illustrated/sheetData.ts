// sheetData.ts — maps PartyMember (+ inventory) to the values each overlay
// section needs. The ability/save/skill/spell/hit-die math intentionally
// mirrors CharacterSheetRenderer.vue so the "clean" and "illustrated" exporters
// always agree on the numbers.
//
// Back narrative fields are sourced from existing PartyMember columns where they
// exist; everything else falls back to an empty value so the section simply
// prints as the blank illustrated box (which is what a player handwrites on).

import { SKILLS, type PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import { getCastingAbility } from "@/types/spell.types";

const ABIL = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ABNAME: Record<(typeof ABIL)[number], string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

const mod = (s: number) => Math.floor((s - 10) / 2);
// en-dash for negatives reads better in the serif plates.
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

// Hit-die per class — kept identical to CharacterSheetRenderer's dieMap.
const HIT_DIE: Record<string, number> = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Artificer: 8, Sorcerer: 6, Wizard: 6,
};

export interface FrontData {
  name: string; sub: string;
  abilities: { key: string; name: string; mod: string; score: number }[];
  ac: string; init: string; speed: string;
  hp: { cur: number; max: number; temp: string }; hitdice: string;
  death: { succ: number; fail: number };
  portraitUrl: string | null;
  attacks: { name: string; bonus: string; damage: string }[];
  spell: { ability: string; dc: string; atk: string } | null;
  skills: { name: string; abil: string; mod: string; level: "none" | "proficient" | "expertise" }[];
  equipment: { item: string; qty: number }[];
  features: { name: string; text: string }[];
  passperc: string; profbonus: string; notes: string;
}

export interface BackData {
  appearance: string; backstory: string; crest: string; crestCap: string;
  allies: [string, string][];          // [name, relationship]
  treasure: [string, string][];        // [item, value/qty]
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  spellnotes: string;
  quests: [string, 0 | 1 | 2][];       // [text, status]  2 = done
  generalnotes: string; secrets: string; travel: string;
}

export function toFront(
  m: PartyMember,
  inv: PartyInventoryItem[],
  speciesName?: string | null,
  backgroundName?: string | null,
  acBonus = 0,
): FrontData {
  const pb = m.proficiency_bonus;
  const skillLevel = (k: string) =>
    (m.skill_proficiencies?.[k as keyof typeof m.skill_proficiencies] ?? "none") as FrontData["skills"][number]["level"];
  const skillBonus = (sk: (typeof SKILLS)[number]) => {
    const lv = skillLevel(sk.key);
    return mod(m[sk.ability] as number) + (lv === "none" ? 0 : lv === "proficient" ? pb : pb * 2);
  };

  // Casting stats — same derivation as the clean renderer.
  const castAbil = getCastingAbility(m.class);
  const spell = castAbil
    ? {
        ability: castAbil.toUpperCase(),
        atk: signed(pb + mod(m[castAbil] as number)),
        dc: String(8 + pb + mod(m[castAbil] as number)),
      }
    : null;

  const die = (m.class && HIT_DIE[m.class]) || 8;

  const weapons = inv.filter(
    (i) => i.carried_by === m.id && i.location === "equipped" && (i.slot === "main_hand" || i.slot === "off_hand"),
  );
  const carried = inv.filter((i) => i.carried_by === m.id);

  return {
    name: m.name,
    sub: [
      m.class && `${m.class}${m.subclass ? ` (${m.subclass})` : ""} ${m.level}`,
      m.subrace ?? speciesName,
      m.alignment,
    ].filter(Boolean).join(" · "),
    abilities: ABIL.map((k) => ({ key: k, name: ABNAME[k], mod: signed(mod(m[k] as number)), score: m[k] as number })),
    ac: String(m.ac + acBonus),
    init: signed(m.initiative_bonus + mod(m.dex)),
    speed: String(m.speed),
    hp: { cur: m.current_hp, max: m.max_hp, temp: m.temp_hp ? String(m.temp_hp) : "—" },
    hitdice: `${m.hit_dice_remaining ?? m.level}d${die}`,
    death: { succ: m.death_save_successes, fail: m.death_save_failures },
    portraitUrl: m.portrait_url ?? null,
    // Atk bonus / damage aren't modeled on inventory yet — match the clean
    // renderer, which also prints an em dash for these columns.
    attacks: weapons.map((w) => ({ name: w.name, bonus: "—", damage: "—" })),
    spell,
    skills: SKILLS.map((sk) => ({
      name: sk.label, abil: sk.ability.toUpperCase(), mod: signed(skillBonus(sk)), level: skillLevel(sk.key),
    })),
    equipment: carried.map((i) => ({ item: i.name, qty: i.quantity })),
    features: [], // no per-member feature source yet → blank box
    passperc: String(10 + skillBonus(SKILLS.find((s) => s.key === "perception")!)),
    profbonus: signed(pb),
    notes: m.notes ?? backgroundName ?? "",
  };
}

// BACK — populate from existing columns where present; everything else falls
// back to "" / [] so an unfilled section prints as the blank illustrated box.
export function toBack(m: PartyMember): BackData {
  return {
    appearance: m.physical_description ?? "",
    backstory: m.player_description ?? "",
    crest: initials(m.name),
    crestCap: "",
    allies: [],                          // no relation/JSON source yet
    treasure: [],                        // no treasure-notes source yet
    personality: {
      traits: m.personality_traits ?? "", ideals: m.ideals ?? "",
      bonds: m.bonds ?? "", flaws: m.flaws ?? "",
    },
    spellnotes: "",                      // no source yet
    quests: [],                          // no relation/JSON source yet
    generalnotes: m.notes ?? "",
    secrets: "",                         // no source yet (Gothic)
    travel: "",                          // no source yet (Adventure)
  };
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
